import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

/**
 * Maintenix Data Fetch API Route
 *
 * v5 — "continuous data extraction, never fail" edition
 *
 * KEY CHANGES vs v4:
 *   1. STALE-WHILE-REVALIDATE: When cached data exists (even stale), we return
 *      it IMMEDIATELY and kick off a background refresh. The user never sees
 *      the "connection lost" error again while cache is available.
 *   2. In-process background refresh lock: prevents duplicate concurrent fetches.
 *   3. Larger per-export polling budget split more fairly.
 *   4. Bumped EXPORT_MAX_POLLS default to 5 so a slow Jasper server still wins.
 *   5. Disk-backed cache (optional) via /tmp so a cold Lambda/container boot
 *      still has data. Falls back to in-memory if /tmp is not writable.
 *   6. HEAD endpoint for cheap client-side health pings.
 *   7. New query parameter `?prefer=cache` lets the frontend force an instant
 *      cached response when it only wants the freshest known data.
 */

// ─── Extend Next.js API Route Timeout ────────────────────────────────────────
export const maxDuration = 300 // seconds (5 minutes)
export const dynamic = 'force-dynamic'

// ─── Configuration ───────────────────────────────────────────────────────────

const MAINTENIX_BASE_URL = process.env.MAINTENIX_BASE_URL || 'http://etmxi.ethiopianairlines.com/maintenix'
const MAINTENIX_USERNAME = process.env.MAINTENIX_USERNAME || '21465'
const MAINTENIX_PASSWORD = process.env.MAINTENIX_PASSWORD || '198019'

const REPORT_TEMPLATE = process.env.MAINTENIX_REPORT_TEMPLATE || '{DES}pJAR6NIQCGAgoDEAgxIYJDan+pPmBmFUBtisTEt++9HAKN2A0bNljRzS7f4hyfKHOMJMpEgmSrQ='
const REPORT_SERVLET_PATH = '/servlet/report/jasper/embedded'
const REPORT_PARAMS_PAGE_PATH = '/shared/jasper/ReportParameters.jsp'

// ─── Timeout Configuration ───────────────────────────────────────────────────
const HEALTH_CHECK_TIMEOUT_MS = parseInt(process.env.MAINTENIX_HEALTH_TIMEOUT || '10000', 10)
const AUTH_TIMEOUT_MS = parseInt(process.env.MAINTENIX_AUTH_TIMEOUT || '30000', 10)
const REPORT_TIMEOUT_MS = parseInt(process.env.MAINTENIX_REPORT_TIMEOUT || '60000', 10)
const EXPORT_TIMEOUT_MS = parseInt(process.env.MAINTENIX_EXPORT_TIMEOUT || '75000', 10)
const FETCH_TIMEOUT_MS = parseInt(process.env.MAINTENIX_FETCH_TIMEOUT || '30000', 10)

const EXPORT_POLL_INTERVAL_MS = parseInt(process.env.MAINTENIX_EXPORT_POLL_INTERVAL || '6000', 10)
const EXPORT_MAX_POLLS = parseInt(process.env.MAINTENIX_EXPORT_MAX_POLLS || '5', 10)
const MAX_RETRIES = parseInt(process.env.MAINTENIX_MAX_RETRIES || '2', 10)

// Hard cap: maximum total time before we abort everything.
const TOTAL_BUDGET_MS = 270_000

// ─── Result Cache ────────────────────────────────────────────────────────────

interface CachedResult {
  tasks: ParsedTask[]
  fetchedAt: string
  dateRange: { from: string; to: string }
  cachedAt: number
}

const resultCache = new Map<string, CachedResult>()
const RESULT_CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours (soft TTL — we still serve stale)

// Optional disk-backed cache (for cold boots / container restarts)
let diskCacheAvailable = true
const DISK_CACHE_DIR = '/tmp/maintenix-cache'

async function writeDiskCache(key: string, data: CachedResult): Promise<void> {
  if (!diskCacheAvailable) return
  try {
    const fs = await import('fs/promises')
    await fs.mkdir(DISK_CACHE_DIR, { recursive: true })
    const safeKey = key.replace(/[^a-z0-9_\-]/gi, '_')
    await fs.writeFile(`${DISK_CACHE_DIR}/${safeKey}.json`, JSON.stringify(data))
  } catch (err) {
    console.log('[Maintenix Cache] Disk cache write unavailable, continuing with in-memory only')
    diskCacheAvailable = false
  }
}

async function readDiskCache(key: string): Promise<CachedResult | null> {
  if (!diskCacheAvailable) return null
  try {
    const fs = await import('fs/promises')
    const safeKey = key.replace(/[^a-z0-9_\-]/gi, '_')
    const raw = await fs.readFile(`${DISK_CACHE_DIR}/${safeKey}.json`, 'utf-8')
    return JSON.parse(raw) as CachedResult
  } catch {
    return null
  }
}

async function readAllDiskCache(): Promise<CachedResult[]> {
  if (!diskCacheAvailable) return []
  try {
    const fs = await import('fs/promises')
    const files = await fs.readdir(DISK_CACHE_DIR).catch(() => [])
    const results: CachedResult[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await fs.readFile(`${DISK_CACHE_DIR}/${file}`, 'utf-8')
        results.push(JSON.parse(raw) as CachedResult)
      } catch {
        continue
      }
    }
    return results
  } catch {
    return []
  }
}

function getCacheKey(from: string, to: string): string {
  return `${from}__${to}`
}

async function getCachedResult(from: string, to: string): Promise<CachedResult | null> {
  const key = getCacheKey(from, to)
  const memCached = resultCache.get(key)
  if (memCached) return memCached

  // Fall back to disk cache and hydrate in-memory
  const diskCached = await readDiskCache(key)
  if (diskCached) {
    resultCache.set(key, diskCached)
    return diskCached
  }
  return null
}

async function getAnyCachedResult(): Promise<CachedResult | null> {
  let newest: CachedResult | null = null
  for (const cached of resultCache.values()) {
    if (!newest || cached.cachedAt > newest.cachedAt) newest = cached
  }
  if (newest) return newest

  // Hydrate from disk
  const diskResults = await readAllDiskCache()
  for (const cached of diskResults) {
    if (!newest || cached.cachedAt > newest.cachedAt) newest = cached
    // Also hydrate in-memory
    resultCache.set(getCacheKey(cached.dateRange.from, cached.dateRange.to), cached)
  }
  return newest
}

async function setCachedResult(from: string, to: string, tasks: ParsedTask[], fetchedAt: string): Promise<void> {
  const key = getCacheKey(from, to)
  const entry: CachedResult = {
    tasks,
    fetchedAt,
    dateRange: { from, to },
    cachedAt: Date.now(),
  }
  resultCache.set(key, entry)
  // Evict old entries (keep max 10)
  if (resultCache.size > 10) {
    const oldest = Array.from(resultCache.entries()).sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0]
    if (oldest) resultCache.delete(oldest[0])
  }
  // Persist to disk asynchronously (don't await)
  writeDiskCache(key, entry).catch(() => {})
}

function isCacheFresh(cached: CachedResult): boolean {
  return Date.now() - cached.cachedAt < RESULT_CACHE_TTL_MS
}

// ─── Background Refresh Lock ─────────────────────────────────────────────────
// Prevents multiple concurrent background refreshes for the same date range.
const backgroundRefreshLocks = new Set<string>()

function tryAcquireRefreshLock(from: string, to: string): boolean {
  const key = getCacheKey(from, to)
  if (backgroundRefreshLocks.has(key)) return false
  backgroundRefreshLocks.add(key)
  return true
}

function releaseRefreshLock(from: string, to: string): void {
  backgroundRefreshLocks.delete(getCacheKey(from, to))
}

// Fire-and-forget background refresh. Always catches errors.
function scheduleBackgroundRefresh(from: string, to: string): void {
  if (!tryAcquireRefreshLock(from, to)) {
    console.log(`[Maintenix BG] Refresh already in progress for ${from}__${to}, skipping`)
    return
  }

  // Use setImmediate / process.nextTick equivalent so it runs AFTER the current
  // response is flushed, not blocking it.
  setTimeout(async () => {
    const budget = new BudgetTracker(TOTAL_BUDGET_MS)
    try {
      console.log(`[Maintenix BG] Starting background refresh for ${from} → ${to}`)
      const health = await healthCheck(budget)
      if (!health.reachable) {
        console.log('[Maintenix BG] Server unreachable, aborting background refresh')
        return
      }
      const session = await authenticateMaintenix(budget)
      const reportBuffer = await fetchMaintenixReport(session, from, to, budget)
      let tasks = parseExcelBuffer(reportBuffer)
      tasks = postProcessTasks(tasks)
      if (tasks.length > 0) {
        await setCachedResult(from, to, tasks, new Date().toISOString())
        console.log(`[Maintenix BG] Refresh successful: ${tasks.length} tasks cached for ${from} → ${to}`)
      } else {
        console.log('[Maintenix BG] Refresh returned 0 tasks, not overwriting cache')
      }
    } catch (err: any) {
      console.log(`[Maintenix BG] Background refresh failed (non-fatal): ${err.message}`)
    } finally {
      releaseRefreshLock(from, to)
    }
  }, 100)
}

// ─── Session Cache ───────────────────────────────────────────────────────────
interface CachedSession {
  session: AuthSession
  expiresAt: number
}

let cachedSession: CachedSession | null = null
const SESSION_CACHE_TTL_MS = 15 * 60 * 1000

function getCachedSession(): AuthSession | null {
  if (cachedSession && Date.now() < cachedSession.expiresAt) {
    console.log('[Maintenix Auth] Using cached session')
    return cachedSession.session
  }
  cachedSession = null
  return null
}

function setCachedSession(session: AuthSession): void {
  cachedSession = {
    session,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  }
}

function invalidateCachedSession(): void {
  cachedSession = null
}

// ─── Budget Tracker ──────────────────────────────────────────────────────────

class BudgetTracker {
  private startTime: number
  private budgetMs: number

  constructor(budgetMs: number = TOTAL_BUDGET_MS) {
    this.startTime = Date.now()
    this.budgetMs = budgetMs
  }

  get elapsed(): number {
    return Date.now() - this.startTime
  }

  get remaining(): number {
    return Math.max(0, this.budgetMs - this.elapsed)
  }

  get isExpired(): boolean {
    return this.remaining <= 0
  }

  cap(requestedMs: number): number {
    const remaining = this.remaining
    if (remaining <= 2000) {
      throw new Error(
        `BUDGET_EXHAUSTED: Total time budget of ${this.budgetMs / 1000}s exceeded ` +
        `(elapsed: ${(this.elapsed / 1000).toFixed(1)}s). The Maintenix server is responding too slowly.`
      )
    }
    return Math.min(requestedMs, remaining - 1000)
  }

  perPollTimeout(remainingPolls: number): number {
    const available = this.remaining - 5000
    if (available <= 2000) {
      throw new Error(
        `BUDGET_EXHAUSTED: No time left for export polling ` +
        `(elapsed: ${(this.elapsed / 1000).toFixed(1)}s).`
      )
    }
    const perPoll = Math.floor(available / Math.max(1, remainingPolls))
    return Math.max(5000, Math.min(perPoll, EXPORT_TIMEOUT_MS))
  }
}

// ─── Fetch with timeout ──────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch (urlErr: any) {
      throw new Error(
        `Invalid Maintenix URL: "${url}". ` +
        `Please verify the MAINTENIX_BASE_URL env variable is a valid URL. Error: ${urlErr.message}`
      )
    }

    const cleanHeaders: Record<string, string> = {}
    const rawHeaders = (options.headers || {}) as Record<string, string>
    for (const [key, value] of Object.entries(rawHeaders)) {
      const lowerKey = key.toLowerCase()
      if (lowerKey === 'connection' || lowerKey === 'keep-alive') continue
      cleanHeaders[key] = value
    }

    const response = await fetch(parsedUrl.toString(), {
      ...options,
      signal: controller.signal,
      headers: cleanHeaders,
    })
    return response
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(
        `Connection to Maintenix server timed out after ${timeoutMs / 1000}s. ` +
        `The server at ${MAINTENIX_BASE_URL} may be unreachable from this network.`
      )
    }
    const causeCode = err.cause?.code || err.code || ''
    if (
      err.message === 'fetch failed' ||
      causeCode === 'ECONNREFUSED' ||
      causeCode === 'ENOTFOUND' ||
      causeCode === 'ETIMEDOUT' ||
      causeCode === 'ECONNRESET' ||
      causeCode.startsWith('UND_ERR_')
    ) {
      const errorCode = causeCode || 'UNKNOWN'
      throw new Error(
        `Cannot connect to Maintenix server (${errorCode}). ` +
        `The server at ${MAINTENIX_BASE_URL} is unreachable.`
      )
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

// ─── Fetch with retry ────────────────────────────────────────────────────────

async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS,
  maxRetries: number = MAX_RETRIES,
  budget?: BudgetTracker
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 8000)
        console.log(`[Maintenix] Retry attempt ${attempt}/${maxRetries} after ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }

      const cappedTimeout = budget ? budget.cap(timeoutMs) : timeoutMs
      return await fetchWithTimeout(url, options, cappedTimeout)
    } catch (err: any) {
      lastError = err
      console.error(`[Maintenix] Fetch attempt ${attempt + 1} failed:`, err.message)

      if (err.message.includes('BUDGET_EXHAUSTED')) break
      if (err.message.includes('Cannot connect') && err.message.includes('ECONNREFUSED')) break
      if (err.message.includes('ENOTFOUND')) break
      if (err.message.includes('UND_ERR_INVALID_ARG') || err.message.includes('Invalid Maintenix URL')) break

      if (err.message.includes('timed out')) {
        timeoutMs = Math.min(timeoutMs * 1.3, 120000)
        continue
      }
    }
  }

  throw lastError || new Error('All fetch attempts failed')
}

// ─── Health Check ────────────────────────────────────────────────────────────

async function healthCheck(budget: BudgetTracker): Promise<{ reachable: boolean; latencyMs: number; error?: string }> {
  const start = Date.now()
  try {
    const res = await fetchWithTimeout(
      `${MAINTENIX_BASE_URL}/common/security/login.jsp`,
      {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,*/*',
        },
      },
      budget.cap(HEALTH_CHECK_TIMEOUT_MS)
    )
    const latencyMs = Date.now() - start
    console.log(`[Maintenix Health] Server reachable (${res.status}) in ${latencyMs}ms`)
    return { reachable: true, latencyMs }
  } catch (err: any) {
    const latencyMs = Date.now() - start
    console.error(`[Maintenix Health] Server unreachable after ${latencyMs}ms:`, err.message)
    return { reachable: false, latencyMs, error: err.message }
  }
}

// ─── Cookie Management ───────────────────────────────────────────────────────

function extractCookiesFromResponse(res: Response, existingCookies: string[] = []): string[] {
  const allCookies = [...existingCookies]

  const setCookieHeaders = res.headers.getSetCookie?.() || []
  const cookiesToProcess: string[] = []

  if (setCookieHeaders.length > 0) {
    setCookieHeaders.forEach((c: string) => {
      const cookiePart = c.split(';')[0]
      if (cookiePart) cookiesToProcess.push(cookiePart)
    })
  } else {
    const rawSetCookie = res.headers.get('set-cookie')
    if (rawSetCookie) {
      rawSetCookie.split(/,(?=\s*\w+=)/).forEach((c: string) => {
        const cookiePart = c.trim().split(';')[0]
        if (cookiePart) cookiesToProcess.push(cookiePart)
      })
    }
  }

  cookiesToProcess.forEach(cookiePart => {
    const name = cookiePart.split('=')[0]
    const idx = allCookies.findIndex(existing => existing.startsWith(name + '='))
    if (idx >= 0) {
      allCookies[idx] = cookiePart
    } else {
      allCookies.push(cookiePart)
    }
  })

  return allCookies
}

// ─── Authenticate with Maintenix ─────────────────────────────────────────────

interface AuthSession {
  cookies: string[]
  jsessionId: string
}

async function authenticateMaintenix(budget: BudgetTracker): Promise<AuthSession> {
  const cached = getCachedSession()
  if (cached) return cached

  console.log(`[Maintenix Auth] Attempting login to ${MAINTENIX_BASE_URL}`)

  const loginPageRes = await fetchWithRetry(
    `${MAINTENIX_BASE_URL}/common/security/login.jsp`,
    {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8',
      },
    },
    budget.cap(AUTH_TIMEOUT_MS),
    MAX_RETRIES,
    budget
  )

  let allCookies = extractCookiesFromResponse(loginPageRes)
  console.log('[Maintenix Auth] Got initial cookies:', allCookies.length)

  const loginBody = new URLSearchParams({
    j_username: MAINTENIX_USERNAME,
    j_password: MAINTENIX_PASSWORD,
  })

  const loginRes = await fetchWithTimeout(
    `${MAINTENIX_BASE_URL}/j_security_check`,
    {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'Cookie': allCookies.join('; '),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': `${MAINTENIX_BASE_URL}/common/security/login.jsp`,
      },
      body: loginBody.toString(),
    },
    budget.cap(AUTH_TIMEOUT_MS)
  )

  allCookies = extractCookiesFromResponse(loginRes, allCookies)

  const jsessionId = allCookies
    .find(c => c.toUpperCase().startsWith('JSESSIONID='))
    ?.split('=')[1] || ''

  console.log('[Maintenix Auth] Login status:', loginRes.status, '| JSESSIONID:', jsessionId ? 'obtained' : 'missing')

  if (loginRes.status === 302 || loginRes.status === 301 || loginRes.status === 303) {
    const redirectUrl = loginRes.headers.get('location')
    if (redirectUrl) {
      const absoluteRedirect = redirectUrl.startsWith('http')
        ? redirectUrl
        : `${new URL(MAINTENIX_BASE_URL).origin}${redirectUrl.startsWith('/') ? '' : '/'}${redirectUrl}`

      console.log('[Maintenix Auth] Following redirect to:', absoluteRedirect)

      const redirectRes = await fetchWithTimeout(absoluteRedirect, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'Cookie': allCookies.join('; '),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      }, budget.cap(AUTH_TIMEOUT_MS))

      allCookies = extractCookiesFromResponse(redirectRes, allCookies)
    }
  }

  if (!jsessionId) {
    throw new Error('Authentication failed: No JSESSIONID obtained. Check credentials.')
  }

  const session: AuthSession = { cookies: allCookies, jsessionId }
  setCachedSession(session)
  return session
}

// ─── Fetch the Jasper Report ─────────────────────────────────────────────────

async function fetchMaintenixReport(
  session: AuthSession,
  fromDate: string,
  endDate: string,
  budget: BudgetTracker
): Promise<ArrayBuffer> {
  console.log(`[Maintenix Report] Fetching report from ${fromDate} to ${endDate}`)

  let returnToPage = '/maintenix'
  try {
    const mainPageRes = await fetchWithTimeout(`${MAINTENIX_BASE_URL}`, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'Cookie': session.cookies.join('; '),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    }, budget.cap(AUTH_TIMEOUT_MS))
    session.cookies = extractCookiesFromResponse(mainPageRes, session.cookies)

    const mainPageUrl = mainPageRes.url
    if (mainPageUrl && mainPageUrl.includes('/maintenix')) {
      const urlObj = new URL(mainPageUrl)
      const pathAfterOrigin = urlObj.pathname + (urlObj.search || '')
      if (pathAfterOrigin.includes('/maintenix')) {
        returnToPage = pathAfterOrigin
      }
    }

    const mainPageHtml = await mainPageRes.text()
    const tokenMatch = mainPageHtml.match(/\/maintenix[;:]([a-f0-9]{32})/i)
      || mainPageHtml.match(/href="\/maintenix([;:][^"]+)"/)
    if (tokenMatch) {
      returnToPage = `/maintenix${tokenMatch[1].startsWith(':') || tokenMatch[1].startsWith(';') ? '' : ':'}${tokenMatch[1]}`
      if (tokenMatch[0].startsWith('/maintenix')) {
        returnToPage = tokenMatch[0].replace(/"/g, '')
      }
    }

    console.log('[Maintenix Report] Resolved aReturnToPage:', returnToPage)
  } catch (err: any) {
    console.log('[Maintenix Report] Could not resolve aReturnToPage, using default:', returnToPage, 'Error:', err.message)
  }

  const paramsPageUrl = new URL(`${MAINTENIX_BASE_URL}${REPORT_PARAMS_PAGE_PATH}`)
  paramsPageUrl.searchParams.set('aTemplate', REPORT_TEMPLATE)
  paramsPageUrl.searchParams.set('aReportServlet', `/maintenix${REPORT_SERVLET_PATH}`)
  paramsPageUrl.searchParams.set('aView', 'PDF')
  paramsPageUrl.searchParams.set('aReturnToPage', returnToPage)
  paramsPageUrl.searchParams.set('aPromptOutput', 'true')
  paramsPageUrl.searchParams.set('aRestrictedOutput', 'pdf,excel')

  console.log('[Maintenix Report] Step 1 - Loading parameters page')

  const paramsPageRes = await fetchWithTimeout(paramsPageUrl.toString(), {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'Cookie': session.cookies.join('; '),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Referer': `${MAINTENIX_BASE_URL}/common/ToDoList.jsp`,
    },
  }, budget.cap(REPORT_TIMEOUT_MS))

  console.log('[Maintenix Report] Parameters page status:', paramsPageRes.status)
  session.cookies = extractCookiesFromResponse(paramsPageRes, session.cookies)

  if (!paramsPageRes.ok) {
    const errorText = await paramsPageRes.text()
    throw new Error(`Failed to load report parameters page (${paramsPageRes.status}): ${errorText.substring(0, 300)}`)
  }

  const paramsHtml = await paramsPageRes.text()

  if (paramsHtml.includes('j_security_check') || paramsHtml.includes('login.jsp')) {
    invalidateCachedSession()
    throw new Error('SESSION_EXPIRED: Redirected to login page. Will re-authenticate.')
  }

  const isParamsPage = paramsHtml.includes('pHr_Cd') ||
    paramsHtml.includes('pFromDate') ||
    paramsHtml.includes('pToDate') ||
    paramsHtml.includes('Generate Report') ||
    paramsHtml.includes('ReportParameters')

  const isWrongPage = paramsHtml.includes('Read-Only To Do List') ||
    paramsHtml.includes('ToDoList.jsp') ||
    paramsHtml.includes('<title>Message</title>') ||
    paramsHtml.includes('<title>Message -') ||
    (paramsHtml.includes('<title>') && !paramsHtml.includes('Report') && !paramsHtml.includes('Parameter'))

  if (!isParamsPage || isWrongPage) {
    if (isWrongPage) {
      const retryTokenMatch = paramsHtml.match(/\/maintenix:([a-f0-9]{32})/i)
      if (retryTokenMatch) {
        const retryReturnToPage = `/maintenix:${retryTokenMatch[1]}`
        console.log('[Maintenix Report] Found session token, retrying with aReturnToPage:', retryReturnToPage)

        const retryParamsUrl = new URL(`${MAINTENIX_BASE_URL}${REPORT_PARAMS_PAGE_PATH}`)
        retryParamsUrl.searchParams.set('aTemplate', REPORT_TEMPLATE)
        retryParamsUrl.searchParams.set('aReportServlet', `/maintenix${REPORT_SERVLET_PATH}`)
        retryParamsUrl.searchParams.set('aView', 'PDF')
        retryParamsUrl.searchParams.set('aReturnToPage', retryReturnToPage)
        retryParamsUrl.searchParams.set('aPromptOutput', 'true')
        retryParamsUrl.searchParams.set('aRestrictedOutput', 'pdf,excel')

        const retryRes = await fetchWithTimeout(retryParamsUrl.toString(), {
          method: 'GET',
          redirect: 'follow',
          headers: {
            'Cookie': session.cookies.join('; '),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': `${MAINTENIX_BASE_URL}/common/ToDoList.jsp`,
          },
        }, budget.cap(REPORT_TIMEOUT_MS))

        session.cookies = extractCookiesFromResponse(retryRes, session.cookies)

        if (retryRes.ok) {
          const retryHtml = await retryRes.text()
          const retryIsParams = retryHtml.includes('pHr_Cd') ||
            retryHtml.includes('pFromDate') ||
            retryHtml.includes('Generate Report')

          if (retryIsParams) {
            console.log('[Maintenix Report] Retry successful!')
            returnToPage = retryReturnToPage
            paramsPageUrl.searchParams.set('aReturnToPage', retryReturnToPage)
          }
        }
      }
    }
  }

  const generateUrl = new URL(`${MAINTENIX_BASE_URL}${REPORT_SERVLET_PATH}`)
  generateUrl.searchParams.set('aTemplate', REPORT_TEMPLATE)
  generateUrl.searchParams.set('aView', 'excel')
  generateUrl.searchParams.set('aPromptOutput', 'false')
  generateUrl.searchParams.set('aRestrictedOutput', 'pdf,excel')

  const formData = new URLSearchParams()
  formData.set('pHr_Cd', 'ALL')
  formData.set('pFromDate_$DATE$', fromDate)
  formData.set('pToDate_$DATE$', endDate)
  formData.set('aView', 'excel')
  formData.set('aTemplate', REPORT_TEMPLATE)
  formData.set('aPromptOutput', 'false')
  formData.set('aRestrictedOutput', 'pdf,excel')
  formData.set('aReportServlet', `/maintenix${REPORT_SERVLET_PATH}`)
  formData.set('aReturnToPage', returnToPage)

  console.log('[Maintenix Report] Step 2 - Submitting report generation (POST)')

  const reportRes = await fetchWithTimeout(generateUrl.toString(), {
    method: 'POST',
    redirect: 'follow',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': session.cookies.join('; '),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      'Accept': 'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,text/html,*/*',
      'Referer': paramsPageUrl.toString(),
      'Upgrade-Insecure-Requests': '1',
    },
    body: formData.toString(),
  }, budget.cap(REPORT_TIMEOUT_MS))

  console.log('[Maintenix Report] Report generation response status:', reportRes.status, '| Content-Type:', reportRes.headers.get('content-type'))

  if (!reportRes.ok) {
    const errorText = await reportRes.text()
    throw new Error(`Report generation failed with status ${reportRes.status}: ${errorText.substring(0, 500)}`)
  }

  const contentType = reportRes.headers.get('content-type') || ''

  if (contentType.includes('text/html')) {
    const htmlContent = await reportRes.text()
    session.cookies = extractCookiesFromResponse(reportRes, session.cookies)

    if (htmlContent.includes('j_security_check') || htmlContent.includes('login.jsp')) {
      invalidateCachedSession()
      throw new Error('SESSION_EXPIRED: Authentication expired during report generation.')
    }

    const popupResult = await followExportPopup(htmlContent, session, generateUrl.toString(), budget)
    if (popupResult) {
      console.log('[Maintenix Report] Successfully retrieved report data via export popup URL')
      return popupResult
    }

    if (htmlContent.includes('pHr_Cd') && htmlContent.includes('Generate Report')) {
      console.log('[Maintenix Report] Got parameters page again via POST. Trying GET approach...')
      return await fetchReportViaGet(session, fromDate, endDate, paramsPageUrl.toString(), budget)
    }

    if (htmlContent.includes('<table') || htmlContent.includes('<TABLE')) {
      return new TextEncoder().encode(htmlContent).buffer as ArrayBuffer
    }

    return new TextEncoder().encode(htmlContent).buffer as ArrayBuffer
  }

  return await reportRes.arrayBuffer()
}

// ─── Follow popup/redirect export URLs ───────────────────────────────────────

async function followExportPopup(
  htmlContent: string,
  session: AuthSession,
  referer: string,
  budget: BudgetTracker
): Promise<ArrayBuffer | null> {
  const popupUrlMatch = htmlContent.match(/popUp\s*\(\s*'([^']+)'/i)
    || htmlContent.match(/popUp\s*\(\s*"([^"]+)"/i)
    || htmlContent.match(/window\.open\s*\(\s*'([^']+)'/i)
    || htmlContent.match(/window\.open\s*\(\s*"([^"]+)"/i)
    || htmlContent.match(/location\.href\s*=\s*'([^']+)'/i)
    || htmlContent.match(/location\.href\s*=\s*"([^"]+)"/i)

  if (!popupUrlMatch || !popupUrlMatch[1]) {
    return null
  }

  const exportPath = popupUrlMatch[1]
  const exportUrl = exportPath.startsWith('http')
    ? exportPath
    : `${new URL(MAINTENIX_BASE_URL).origin}${exportPath.startsWith('/') ? '' : '/'}${exportPath}`

  console.log('[Maintenix Report] Following popup export URL:', exportUrl)

  const totalPolls = EXPORT_MAX_POLLS
  for (let poll = 0; poll < totalPolls; poll++) {
    if (budget.isExpired) {
      console.log('[Maintenix Report] Budget expired before export poll', poll + 1)
      break
    }

    if (poll > 0) {
      const waitMs = Math.min(EXPORT_POLL_INTERVAL_MS, 15000)
      console.log(`[Maintenix Report] Export poll ${poll + 1}/${totalPolls}: waiting ${waitMs / 1000}s before retry...`)
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }

    if (budget.isExpired) break

    try {
      const remainingPolls = totalPolls - poll
      const pollTimeout = budget.perPollTimeout(remainingPolls)

      console.log(
        `[Maintenix Report] Export attempt ${poll + 1}/${totalPolls} ` +
        `(timeout: ${(pollTimeout / 1000).toFixed(1)}s, ` +
        `budget remaining: ${(budget.remaining / 1000).toFixed(1)}s)`
      )

      const exportRes = await fetchWithTimeout(exportUrl, {
        method: 'GET',
        redirect: 'follow',
        headers: {
          'Cookie': session.cookies.join('; '),
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
          'Accept': 'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,text/html,*/*;q=0.8',
          'Referer': referer,
        },
      }, pollTimeout)

      session.cookies = extractCookiesFromResponse(exportRes, session.cookies)
      console.log('[Maintenix Report] Export response status:', exportRes.status, '| Content-Type:', exportRes.headers.get('content-type'))

      if (!exportRes.ok) {
        const errText = await exportRes.text()
        console.log('[Maintenix Report] Export URL failed:', exportRes.status, errText.substring(0, 500))
        if (exportRes.status >= 500 && poll < totalPolls - 1) continue
        return null
      }

      const exportContentType = exportRes.headers.get('content-type') || ''

      if (exportContentType.includes('text/html')) {
        const exportHtml = await exportRes.text()

        const isProcessingPage = exportHtml.includes('please wait') ||
          exportHtml.includes('Please Wait') ||
          exportHtml.includes('processing') ||
          exportHtml.includes('Loading') ||
          exportHtml.includes('generating') ||
          (exportHtml.length < 500 && !exportHtml.includes('<table'))

        if (isProcessingPage && poll < totalPolls - 1) {
          console.log('[Maintenix Report] Server still processing report, will retry...')
          continue
        }

        const nestedResult = await followExportPopup(exportHtml, session, exportUrl, budget)
        if (nestedResult) return nestedResult

        return new TextEncoder().encode(exportHtml).buffer as ArrayBuffer
      }

      const arrayBuffer = await exportRes.arrayBuffer()
      console.log(`[Maintenix Report] Got binary data from export URL (${arrayBuffer.byteLength} bytes)`)
      return arrayBuffer

    } catch (err: any) {
      const isTimeout = err.message.includes('timed out')
      const isBudgetExhausted = err.message.includes('BUDGET_EXHAUSTED')

      if (isBudgetExhausted) {
        console.error(`[Maintenix Report] Budget exhausted during export poll ${poll + 1}`)
        break
      }

      if (isTimeout && poll < totalPolls - 1) {
        console.log(`[Maintenix Report] Export attempt ${poll + 1} timed out. Will retry with remaining budget...`)
        continue
      }

      console.error(`[Maintenix Report] Export attempt ${poll + 1} failed:`, err.message)
      if (poll >= totalPolls - 1) throw err
    }
  }

  console.error(`[Maintenix Report] All ${totalPolls} export attempts exhausted or budget expired`)
  return null
}

// ─── Fallback: Fetch report via GET ──────────────────────────────────────────

async function fetchReportViaGet(
  session: AuthSession,
  fromDate: string,
  endDate: string,
  referer: string,
  budget: BudgetTracker
): Promise<ArrayBuffer> {
  const reportUrl = new URL(`${MAINTENIX_BASE_URL}${REPORT_SERVLET_PATH}`)
  reportUrl.searchParams.set('aTemplate', REPORT_TEMPLATE)
  reportUrl.searchParams.set('aReportServlet', `/maintenix${REPORT_SERVLET_PATH}`)
  reportUrl.searchParams.set('aView', 'excel')
  reportUrl.searchParams.set('aPromptOutput', 'false')
  reportUrl.searchParams.set('aRestrictedOutput', 'pdf,excel')
  reportUrl.searchParams.set('pHr_Cd', 'ALL')
  reportUrl.searchParams.set('pFromDate_$DATE$', fromDate)
  reportUrl.searchParams.set('pToDate_$DATE$', endDate)

  const res = await fetchWithTimeout(reportUrl.toString(), {
    method: 'GET',
    redirect: 'follow',
    headers: {
      'Cookie': session.cookies.join('; '),
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      'Accept': 'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,text/html,*/*',
      'Referer': referer,
    },
  }, budget.cap(REPORT_TIMEOUT_MS))

  if (!res.ok) {
    const errorText = await res.text()
    throw new Error(`GET report fetch failed (${res.status}): ${errorText.substring(0, 500)}`)
  }

  const ct = res.headers.get('content-type') || ''

  if (ct.includes('text/html')) {
    const htmlContent = await res.text()

    if (htmlContent.includes('j_security_check') || htmlContent.includes('login.jsp')) {
      invalidateCachedSession()
      throw new Error('SESSION_EXPIRED: Authentication expired during GET report fetch.')
    }

    const popupResult = await followExportPopup(htmlContent, session, reportUrl.toString(), budget)
    if (popupResult) return popupResult

    return new TextEncoder().encode(htmlContent).buffer as ArrayBuffer
  }

  return await res.arrayBuffer()
}

// ─── Parse Excel/HTML Report Data ────────────────────────────────────────────

interface ParsedTask {
  user_id: string
  name: string
  part_no: string
  serial_number: string
  assigned_date: string
  completed_date: string
  elapsed_days: number
  status: string
  location: string
  barcode: string
  task_detail: string
  part_description: string
}

function parseExcelBuffer(buffer: ArrayBuffer): ParsedTask[] {
  const uint8 = new Uint8Array(buffer)

  const isOLE2 = uint8.length >= 4 && uint8[0] === 0xD0 && uint8[1] === 0xCF && uint8[2] === 0x11 && uint8[3] === 0xE0
  const isZIP = uint8.length >= 4 && uint8[0] === 0x50 && uint8[1] === 0x4B && uint8[2] === 0x03 && uint8[3] === 0x04

  if (isOLE2 || isZIP) {
    return parseBinaryExcel(buffer)
  }

  const content = new TextDecoder('utf-8').decode(buffer)

  if (content.includes('<table') || content.includes('<TABLE') || content.includes('<html') || content.includes('<HTML')) {
    return parseHtmlTable(content)
  }

  if (content.includes(',') && content.includes('\n')) {
    return parseCSVContent(content)
  }

  if (content.includes('\t') && content.includes('\n')) {
    return parseTSVContent(content)
  }

  if (content.includes('<?xml') || content.includes('<Workbook') || content.includes('<ss:Workbook')) {
    return parseXMLSpreadsheet(content)
  }

  if (buffer.byteLength > 512) {
    try {
      return parseBinaryExcel(buffer)
    } catch {
      // fall through
    }
  }

  return []
}

function parseBinaryExcel(buffer: ArrayBuffer): ParsedTask[] {
  try {
    const workbook = XLSX.read(buffer, { type: 'array' })

    if (workbook.SheetNames.length === 0) return []

    let bestTasks: ParsedTask[] = []

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName]
      if (!sheet) continue

      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
      if (rows.length < 2) continue

      let headerRowIndex = -1
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const rowText = rows[i].map((c: any) => String(c || '')).join(' ').toLowerCase()
        if (
          rowText.includes('name') || rowText.includes('part') ||
          rowText.includes('serial') || rowText.includes('assigned') ||
          rowText.includes('status') || rowText.includes('barcode') ||
          rowText.includes('location') || rowText.includes('hr code') ||
          rowText.includes('hr cd') || rowText.includes('engineer') ||
          rowText.includes('task')
        ) {
          headerRowIndex = i
          break
        }
      }

      if (headerRowIndex === -1) {
        headerRowIndex = rows.findIndex((r: any[]) => r.some((c: any) => String(c || '').trim() !== ''))
        if (headerRowIndex === -1) continue
      }

      const headers = rows[headerRowIndex].map((h: any) => String(h || '').toLowerCase().trim())
      const fieldMap = mapHeaders(headers)

      const sheetTasks: ParsedTask[] = []
      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.length < 3) continue

        const cells = row.map((c: any) => {
          if (c === null || c === undefined) return ''
          if (typeof c === 'number' && c > 30000 && c < 60000) {
            try {
              const date = XLSX.SSF.parse_date_code(c)
              if (date) {
                const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
                return `${String(date.d).padStart(2, '0')}-${months[date.m - 1]}-${date.y}`
              }
            } catch {
              // not a date
            }
          }
          return String(c).trim()
        })

        const rowText = cells.join('').trim()
        if (!rowText || rowText.length < 3) continue

        const task = extractTaskFromRow(cells, fieldMap)
        if (task && (task.name || task.part_no || task.serial_number || task.barcode)) {
          sheetTasks.push(task)
        }
      }

      if (sheetTasks.length > bestTasks.length) {
        bestTasks = sheetTasks
      }
    }

    return bestTasks
  } catch (err: any) {
    console.error('[Maintenix Parse] SheetJS parse error:', err.message)
    throw err
  }
}

function parseHtmlTable(html: string): ParsedTask[] {
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi
  const tables: string[] = []
  let tableMatch: RegExpExecArray | null

  while ((tableMatch = tableRegex.exec(html)) !== null) {
    tables.push(tableMatch[0])
  }

  if (tables.length === 0) return []

  let bestTasks: ParsedTask[] = []

  for (let t = 0; t < tables.length; t++) {
    const tableTasks = parseOneHtmlTable(tables[t])
    if (tableTasks.length > bestTasks.length) bestTasks = tableTasks
  }

  if (bestTasks.length === 0) {
    bestTasks = parseOneHtmlTable(html)
  }

  return bestTasks
}

function parseOneHtmlTable(html: string): ParsedTask[] {
  const tasks: ParsedTask[] = []
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi

  const rows: string[][] = []
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const cells: string[] = []
    let cellMatch: RegExpExecArray | null
    const rowContent = rowMatch[1]

    cellRegex.lastIndex = 0
    while ((cellMatch = cellRegex.exec(rowContent)) !== null) {
      const cellText = cellMatch[1]
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim()
      cells.push(cellText)
    }

    if (cells.length > 0) rows.push(cells)
  }

  if (rows.length < 2) return []

  let headerRowIndex = -1
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const rowText = rows[i].join(' ').toLowerCase()
    if (
      rowText.includes('name') || rowText.includes('part') ||
      rowText.includes('serial') || rowText.includes('assigned') ||
      rowText.includes('status') || rowText.includes('barcode') ||
      rowText.includes('location') || rowText.includes('hr code') ||
      rowText.includes('engineer') || rowText.includes('task')
    ) {
      headerRowIndex = i
      break
    }
  }

  if (headerRowIndex === -1) headerRowIndex = 0

  const headers = rows[headerRowIndex].map(h => h.toLowerCase().trim())
  const fieldMap = mapHeaders(headers)

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.length < 3) continue

    const rowText = row.join('').trim()
    if (!rowText || rowText.length < 5) continue

    const task = extractTaskFromRow(row, fieldMap)
    if (task && (task.name || task.part_no || task.serial_number || task.barcode)) {
      tasks.push(task)
    }
  }

  return tasks
}

function parseCSVContent(csv: string): ParsedTask[] {
  const tasks: ParsedTask[] = []
  const lines = csv.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim())
  const fieldMap = mapHeaders(headers)

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i])
    if (cells.length < 3) continue
    const task = extractTaskFromRow(cells, fieldMap)
    if (task && (task.name || task.part_no || task.serial_number || task.barcode)) {
      tasks.push(task)
    }
  }

  return tasks
}

function parseTSVContent(tsv: string): ParsedTask[] {
  const tasks: ParsedTask[] = []
  const lines = tsv.split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split('\t').map(h => h.toLowerCase().trim())
  const fieldMap = mapHeaders(headers)

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('\t').map(c => c.trim())
    if (cells.length < 3) continue
    const task = extractTaskFromRow(cells, fieldMap)
    if (task && (task.name || task.part_no || task.serial_number || task.barcode)) {
      tasks.push(task)
    }
  }

  return tasks
}

function parseXMLSpreadsheet(xml: string): ParsedTask[] {
  const tasks: ParsedTask[] = []
  const rowRegex = /<(?:ss:)?Row[^>]*>([\s\S]*?)<\/(?:ss:)?Row>/gi
  const cellRegex = /<(?:ss:)?Data[^>]*>([\s\S]*?)<\/(?:ss:)?Data>/gi

  const rows: string[][] = []
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRegex.exec(xml)) !== null) {
    const cells: string[] = []
    let cellMatch: RegExpExecArray | null
    cellRegex.lastIndex = 0

    while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
      cells.push(cellMatch[1].trim())
    }

    if (cells.length > 0) rows.push(cells)
  }

  if (rows.length < 2) return []

  const headers = rows[0].map(h => h.toLowerCase().trim())
  const fieldMap = mapHeaders(headers)

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (row.length < 3) continue
    const task = extractTaskFromRow(row, fieldMap)
    if (task && (task.name || task.part_no || task.serial_number || task.barcode)) {
      tasks.push(task)
    }
  }

  return tasks
}

// ─── Header Mapping ──────────────────────────────────────────────────────────

interface FieldMapping {
  user_id: number
  name: number
  part_no: number
  serial_number: number
  assigned_date: number
  completed_date: number
  elapsed_days: number
  status: number
  location: number
  barcode: number
  task_detail: number
  part_description: number
}

function mapHeaders(headers: string[]): FieldMapping {
  const mapping: FieldMapping = {
    user_id: -1, name: -1, part_no: -1, serial_number: -1,
    assigned_date: -1, completed_date: -1, elapsed_days: -1,
    status: -1, location: -1, barcode: -1, task_detail: -1, part_description: -1,
  }

  headers.forEach((header, index) => {
    const h = header.replace(/[^a-z0-9\s\/]/g, '').trim()

    if (h.includes('user id') || h.includes('hr code') || h.includes('userid') || h.includes('hrcode') || h.includes('employee id') || h.includes('emp id') || h.includes('hr cd')) {
      mapping.user_id = index
    } else if (h.includes('name') || h.includes('engineer') || h.includes('technician') || h.includes('assigned to') || h.includes('assignee')) {
      if (mapping.name === -1) mapping.name = index
    } else if (h.includes('part no') || h.includes('part number') || h.includes('partno') || h.includes('pn') || h.includes('part num')) {
      mapping.part_no = index
    } else if (h.includes('serial') || h.includes('sn') || h.includes('s/n') || h.includes('serial no') || h.includes('serial number')) {
      if (mapping.serial_number === -1) mapping.serial_number = index
    } else if (h.includes('assigned') || h.includes('assign date') || h.includes('start date') || h.includes('date assigned') || h.includes('request date') || h.includes('received')) {
      if (mapping.assigned_date === -1) mapping.assigned_date = index
    } else if (h.includes('completed') || h.includes('complete date') || h.includes('completion') || h.includes('end date') || h.includes('finish') || h.includes('closed')) {
      if (mapping.completed_date === -1) mapping.completed_date = index
    } else if (h.includes('elapsed') || h.includes('days') || h.includes('duration') || h.includes('tat') || h.includes('turn around') || h.includes('turnaround')) {
      mapping.elapsed_days = index
    } else if (h.includes('status') || h.includes('state') || h.includes('condition')) {
      mapping.status = index
    } else if (h.includes('location') || h.includes('shop') || h.includes('section') || h.includes('dept') || h.includes('department')) {
      if (mapping.location === -1) mapping.location = index
    } else if (h.includes('barcode') || h.includes('bar code') || h.includes('task barcode') || h.includes('wo') || h.includes('work order') || h.includes('task cd')) {
      mapping.barcode = index
    } else if (h.includes('task detail') || h.includes('task desc') || h.includes('task name') || h.includes('work desc') || h.includes('detail') || h.includes('task type')) {
      mapping.task_detail = index
    } else if (h.includes('part desc') || h.includes('description') || h.includes('component') || h.includes('item desc') || h.includes('inventory')) {
      if (mapping.part_description === -1) mapping.part_description = index
    }
  })

  if (mapping.name === -1 && headers.length >= 6) {
    const len = headers.length
    if (len >= 12) {
      if (mapping.user_id === -1) mapping.user_id = 0
      if (mapping.name === -1) mapping.name = 1
      if (mapping.part_no === -1) mapping.part_no = 2
      if (mapping.serial_number === -1) mapping.serial_number = 3
      if (mapping.assigned_date === -1) mapping.assigned_date = 4
      if (mapping.completed_date === -1) mapping.completed_date = 5
      if (mapping.elapsed_days === -1) mapping.elapsed_days = 6
      if (mapping.status === -1) mapping.status = 7
      if (mapping.location === -1) mapping.location = 8
      if (mapping.barcode === -1) mapping.barcode = 9
      if (mapping.task_detail === -1) mapping.task_detail = 10
      if (mapping.part_description === -1) mapping.part_description = 11
    } else if (len >= 8) {
      if (mapping.user_id === -1) mapping.user_id = 0
      if (mapping.name === -1) mapping.name = 1
      if (mapping.part_no === -1) mapping.part_no = 2
      if (mapping.serial_number === -1) mapping.serial_number = 3
      if (mapping.assigned_date === -1) mapping.assigned_date = 4
      if (mapping.completed_date === -1) mapping.completed_date = 5
      if (mapping.status === -1) mapping.status = 6
      if (mapping.location === -1) mapping.location = 7
    }
  }

  return mapping
}

function extractTaskFromRow(cells: string[], fieldMap: FieldMapping): ParsedTask {
  const getCell = (index: number): string => {
    if (index < 0 || index >= cells.length) return ''
    return (cells[index] || '').trim()
  }

  const elapsedStr = getCell(fieldMap.elapsed_days)
  let elapsedDays = 0
  if (elapsedStr) {
    const parsed = parseFloat(elapsedStr)
    if (!isNaN(parsed)) elapsedDays = Math.round(parsed)
  }

  let status = getCell(fieldMap.status) || 'UNKNOWN'
  if (!status || status === '') {
    const completedDate = getCell(fieldMap.completed_date)
    if (completedDate && completedDate !== '' && completedDate !== 'N/A') {
      status = 'COMPLETE'
    } else {
      status = 'IN PROGRESS'
    }
  }

  return {
    user_id: getCell(fieldMap.user_id),
    name: getCell(fieldMap.name),
    part_no: getCell(fieldMap.part_no),
    serial_number: getCell(fieldMap.serial_number),
    assigned_date: getCell(fieldMap.assigned_date),
    completed_date: getCell(fieldMap.completed_date),
    elapsed_days: elapsedDays,
    status: status.toUpperCase(),
    location: getCell(fieldMap.location),
    barcode: getCell(fieldMap.barcode),
    task_detail: getCell(fieldMap.task_detail),
    part_description: getCell(fieldMap.part_description),
  }
}

function parseCSVLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        cells.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
  }

  cells.push(current.trim())
  return cells
}

function calculateElapsedDays(assignedDate: string, completedDate: string): number {
  if (!assignedDate) return 0
  try {
    const assigned = new Date(assignedDate)
    const completed = completedDate ? new Date(completedDate) : new Date()
    if (isNaN(assigned.getTime())) return 0
    if (isNaN(completed.getTime())) return 0
    const diffMs = completed.getTime() - assigned.getTime()
    return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)))
  } catch {
    return 0
  }
}

function postProcessTasks(tasks: ParsedTask[]): ParsedTask[] {
  return tasks.map(task => {
    if (!task.elapsed_days || task.elapsed_days === 0) {
      task.elapsed_days = calculateElapsedDays(task.assigned_date, task.completed_date)
    }

    task.name = task.name.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()

    const upperStatus = (task.status || '').toUpperCase().trim()
    if (upperStatus.includes('COMPLETE') || upperStatus.includes('DONE') || upperStatus.includes('FINISH')) {
      task.status = 'COMPLETE'
    } else if (upperStatus.includes('PROGRESS') || upperStatus.includes('ACTIVE') || upperStatus.includes('OPEN')) {
      task.status = 'IN PROGRESS'
    } else if (upperStatus.includes('PENDING') || upperStatus.includes('WAIT')) {
      task.status = 'PENDING'
    }

    return task
  })
}

// ─── Helper: Format date for Maintenix ───────────────────────────────────────

function formatDateForMaintenix(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0')
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  return `${day}-${month}-${year}`
}

// ─── Helper: Build a cache fallback response ─────────────────────────────────

function buildCacheResponse(
  cached: CachedResult,
  startTime: number,
  status: 'fresh' | 'stale' | 'fallback',
  reason: string
): NextResponse {
  const cacheAgeMinutes = Math.round((Date.now() - cached.cachedAt) / 60000)
  const serverStatus =
    status === 'fresh' ? 'cached' : status === 'stale' ? 'refreshing' : 'unreachable'
  const dataSource =
    status === 'fresh' ? 'cached' : status === 'stale' ? 'cached_revalidating' : 'cached'

  return NextResponse.json({
    success: true,
    tasks: cached.tasks,
    totalCount: cached.tasks.length,
    dataSource,
    fetchedAt: cached.fetchedAt,
    dateRange: cached.dateRange,
    performanceMs: Date.now() - startTime,
    cacheAgeMinutes,
    message: `${reason} ${cached.tasks.length} tasks shown (cached ${cacheAgeMinutes}m ago).`,
    serverStatus,
    isStale: status !== 'fresh',
  })
}

// ─── Main API Handler ────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const startTime = Date.now()
  const budget = new BudgetTracker()

  const { searchParams } = new URL(req.url)

  const now = new Date()
  const defaultFromDate = new Date(now)
  defaultFromDate.setDate(defaultFromDate.getDate() - 30)

  const fromDate = searchParams.get('fromDate') || formatDateForMaintenix(defaultFromDate)
  const endDate = searchParams.get('endDate') || formatDateForMaintenix(now)
  const preferCache = searchParams.get('prefer') === 'cache'

  console.log(`[Maintenix API] Fetching tasks from ${fromDate} to ${endDate}${preferCache ? ' (prefer=cache)' : ''}`)

  const tryCache = async (): Promise<CachedResult | null> => {
    return (await getCachedResult(fromDate, endDate)) || (await getAnyCachedResult())
  }

  // ── Stale-While-Revalidate: if fresh cache exists, return it instantly ──
  const exactCache = await getCachedResult(fromDate, endDate)
  if (exactCache) {
    const fresh = isCacheFresh(exactCache)

    // If fresh, serve from cache (no background refresh needed unless explicitly refreshed)
    if (fresh && !searchParams.get('force')) {
      return buildCacheResponse(exactCache, startTime, 'fresh', 'Serving fresh cached data.')
    }

    // Stale cache: return immediately and revalidate in background
    if (!fresh || preferCache) {
      // Fire-and-forget background refresh (unless caller explicitly wants cache only)
      if (!preferCache) {
        scheduleBackgroundRefresh(fromDate, endDate)
      }
      return buildCacheResponse(
        exactCache,
        startTime,
        'stale',
        'Serving cached data while refreshing in background.'
      )
    }
  }

  // If caller prefers cache but no exact match, fall back to any cache
  if (preferCache) {
    const anyCache = await getAnyCachedResult()
    if (anyCache) {
      scheduleBackgroundRefresh(fromDate, endDate)
      return buildCacheResponse(
        anyCache,
        startTime,
        'fallback',
        'Serving nearest cached data while refreshing in background.'
      )
    }
  }

  try {
    // Step 0: Health Check — if it fails we still try cache fallback
    const health = await healthCheck(budget)
    if (!health.reachable) {
      console.error(`[Maintenix API] Health check failed after ${Date.now() - startTime}ms`)
      const cached = await tryCache()
      if (cached) {
        scheduleBackgroundRefresh(fromDate, endDate)
        return buildCacheResponse(
          cached,
          startTime,
          'fallback',
          'Maintenix server is currently unreachable — showing cached data.'
        )
      }

      return NextResponse.json(
        {
          success: false,
          errorCode: 'SERVER_UNREACHABLE',
          message:
            'Unable to connect to the Maintenix server and no cached data is available yet.',
          tasks: [],
          dataSource: 'error',
          fetchedAt: new Date().toISOString(),
          serverStatus: 'unreachable',
          suggestions: [
            'Verify the Maintenix server is accessible from this network',
            'Check firewall rules and DNS resolution',
            'Try again in a few minutes',
            'Contact your IT team if the problem persists',
          ],
          diagnostics: {
            serverUrl: MAINTENIX_BASE_URL,
            errorType: 'HEALTH_CHECK_FAILED',
            healthCheckLatencyMs: health.latencyMs,
            detail: health.error || 'Server unreachable',
            totalElapsedMs: Date.now() - startTime,
          },
        },
        { status: 503 }
      )
    }

    console.log(`[Maintenix API] Health check passed (${health.latencyMs}ms). Proceeding...`)

    // Step 1: Authenticate
    let session: AuthSession
    let authRetried = false

    try {
      session = await authenticateMaintenix(budget)
    } catch (authErr: any) {
      console.error('[Maintenix API] Authentication failed:', authErr.message)

      const cached = await tryCache()
      if (cached) {
        scheduleBackgroundRefresh(fromDate, endDate)
        return buildCacheResponse(
          cached,
          startTime,
          'fallback',
          'Authentication with Maintenix failed — showing cached data.'
        )
      }

      const isConnectionError = authErr.message.includes('Cannot connect') || authErr.message.includes('timed out')
      const isBudgetError = authErr.message.includes('BUDGET_EXHAUSTED')
      return NextResponse.json(
        {
          success: false,
          errorCode: isBudgetError ? 'BUDGET_EXHAUSTED' : isConnectionError ? 'CONNECTION_FAILED' : 'AUTH_FAILED',
          message: isBudgetError
            ? 'The Maintenix server is responding too slowly. Please try again later.'
            : isConnectionError
              ? 'Maintenix server is unreachable during authentication.'
              : `Maintenix authentication failed: ${authErr.message}`,
          tasks: [],
          dataSource: 'error',
          fetchedAt: new Date().toISOString(),
          serverStatus: 'auth_failed',
          suggestions: isBudgetError
            ? ['Try a smaller date range (e.g., 2 weeks)', 'Try again during off-peak hours', 'Wait a few minutes and retry']
            : ['Verify server accessibility', 'Check credentials', 'Contact IT support'],
          diagnostics: {
            serverUrl: MAINTENIX_BASE_URL,
            errorType: isBudgetError ? 'BUDGET_EXHAUSTED' : isConnectionError ? 'CONNECTION_FAILED' : 'AUTH_FAILED',
            detail: authErr.message,
            totalElapsedMs: Date.now() - startTime,
          },
        },
        { status: 502 }
      )
    }

    // Step 2: Fetch the report
    let reportBuffer: ArrayBuffer
    try {
      reportBuffer = await fetchMaintenixReport(session, fromDate, endDate, budget)
    } catch (fetchErr: any) {
      if (fetchErr.message.includes('SESSION_EXPIRED') && !authRetried) {
        console.log('[Maintenix API] Session expired, re-authenticating...')
        authRetried = true
        invalidateCachedSession()

        try {
          session = await authenticateMaintenix(budget)
          reportBuffer = await fetchMaintenixReport(session, fromDate, endDate, budget)
        } catch (retryErr: any) {
          const cached = await tryCache()
          if (cached) {
            scheduleBackgroundRefresh(fromDate, endDate)
            return buildCacheResponse(
              cached,
              startTime,
              'fallback',
              'Report fetch failed after re-authentication — showing cached data.'
            )
          }

          return NextResponse.json(
            {
              success: false,
              errorCode: 'REPORT_FETCH_FAILED_AFTER_REAUTH',
              message: `Failed to fetch Maintenix report after re-authentication: ${retryErr.message}`,
              tasks: [],
              dataSource: 'error',
              fetchedAt: new Date().toISOString(),
              serverStatus: 'fetch_failed',
              suggestions: ['Try a smaller date range', 'Wait a few minutes and retry', 'Contact IT support'],
              diagnostics: {
                errorType: 'REPORT_FETCH_FAILED_AFTER_REAUTH',
                detail: retryErr.message,
                totalElapsedMs: Date.now() - startTime,
              },
            },
            { status: 502 }
          )
        }
      } else {
        const cached = await tryCache()
        if (cached) {
          scheduleBackgroundRefresh(fromDate, endDate)
          return buildCacheResponse(
            cached,
            startTime,
            'fallback',
            'Report fetch failed — showing cached data.'
          )
        }

        const isConnectionError = fetchErr.message.includes('Cannot connect') || fetchErr.message.includes('timed out')
        const isBudgetError = fetchErr.message.includes('BUDGET_EXHAUSTED')
        return NextResponse.json(
          {
            success: false,
            errorCode: isBudgetError ? 'BUDGET_EXHAUSTED' : isConnectionError ? 'CONNECTION_LOST' : 'REPORT_FETCH_FAILED',
            message: isBudgetError
              ? 'The Maintenix server is responding too slowly. Try a smaller date range or try again later.'
              : isConnectionError
                ? 'Maintenix server connection lost during report fetch.'
                : `Failed to fetch Maintenix report: ${fetchErr.message}`,
            tasks: [],
            dataSource: 'error',
            fetchedAt: new Date().toISOString(),
            serverStatus: 'fetch_failed',
            suggestions: isBudgetError
              ? ['Reduce the date range to 2 weeks or less', 'Try again during off-peak hours', 'Wait 5 minutes and retry']
              : ['Check server connectivity', 'Try again in a few minutes', 'Contact IT support'],
            diagnostics: {
              errorType: isBudgetError ? 'BUDGET_EXHAUSTED' : isConnectionError ? 'CONNECTION_LOST' : 'REPORT_FETCH_FAILED',
              detail: fetchErr.message,
              totalElapsedMs: Date.now() - startTime,
            },
          },
          { status: 502 }
        )
      }
    }

    // Step 3: Parse the report data
    let tasks: ParsedTask[]
    try {
      tasks = parseExcelBuffer(reportBuffer!)
      tasks = postProcessTasks(tasks)
    } catch (parseErr: any) {
      console.error('[Maintenix API] Parse failed:', parseErr.message)

      const cached = await tryCache()
      if (cached) {
        return buildCacheResponse(
          cached,
          startTime,
          'fallback',
          'Report parsing failed — showing cached data.'
        )
      }

      return NextResponse.json(
        {
          success: false,
          errorCode: 'PARSE_FAILED',
          message: `Failed to parse Maintenix report: ${parseErr.message}`,
          tasks: [],
          dataSource: 'error',
          fetchedAt: new Date().toISOString(),
          suggestions: ['The report format may have changed', 'Contact IT support'],
          diagnostics: { totalElapsedMs: Date.now() - startTime },
        },
        { status: 500 }
      )
    }

    const elapsed = Date.now() - startTime
    const fetchedAt = new Date().toISOString()
    console.log(`[Maintenix API] Successfully fetched ${tasks.length} tasks in ${elapsed}ms`)

    if (tasks.length > 0) {
      await setCachedResult(fromDate, endDate, tasks, fetchedAt)
    } else {
      // If the live call returned empty but we have cached data, serve the cache
      const cached = await tryCache()
      if (cached && cached.tasks.length > 0) {
        return buildCacheResponse(
          cached,
          startTime,
          'fallback',
          'Live fetch returned 0 rows — showing last known cached data.'
        )
      }
    }

    return NextResponse.json({
      success: true,
      tasks,
      totalCount: tasks.length,
      dataSource: 'live',
      fetchedAt,
      dateRange: { from: fromDate, to: endDate },
      performanceMs: elapsed,
      serverStatus: 'connected',
      isStale: false,
      message: tasks.length > 0
        ? `Successfully fetched ${tasks.length} tasks from Maintenix in ${(elapsed / 1000).toFixed(1)}s`
        : 'No tasks found for the specified date range.',
    })
  } catch (err: any) {
    console.error('[Maintenix API] Unexpected error:', err)

    const cached = await tryCache()
    if (cached) {
      scheduleBackgroundRefresh(fromDate, endDate)
      return buildCacheResponse(
        cached,
        startTime,
        'fallback',
        'An unexpected error occurred — showing cached data.'
      )
    }

    return NextResponse.json(
      {
        success: false,
        errorCode: 'UNEXPECTED_ERROR',
        message: `Unexpected error: ${err.message}`,
        tasks: [],
        dataSource: 'error',
        fetchedAt: new Date().toISOString(),
        suggestions: ['Try again in a few minutes', 'Try a smaller date range', 'Contact IT support'],
        diagnostics: { totalElapsedMs: Date.now() - startTime },
      },
      { status: 500 }
    )
  }
}

// ─── Health Check Endpoint (lightweight) ─────────────────────────────────────

export async function HEAD() {
  const budget = new BudgetTracker(10_000)
  const health = await healthCheck(budget)
  return new NextResponse(null, {
    status: health.reachable ? 200 : 503,
    headers: {
      'X-Maintenix-Reachable': String(health.reachable),
      'X-Maintenix-Latency-Ms': String(health.latencyMs),
    },
  })
}