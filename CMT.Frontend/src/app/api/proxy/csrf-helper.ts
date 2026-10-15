// src/app/api/proxy/csrf-helper.ts
// Shared helper for fetching CSRF tokens from the .NET backend.
// Used by both proxyRequest() and routes that make direct fetch() calls.
//
// The .NET backend's anti-forgery system requires a matched token pair:
//   1. An anti-forgery cookie (set by the backend)
//   2. An X-CSRF-Token header with the corresponding request token
//
// This helper fetches a fresh pair from the backend's /csrf-token endpoint
// and provides them ready to use in outgoing requests.

const API_BASE = (
  process.env.BACKEND_URL ||
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
).replace(/\/+$/, '')

/** Cached CSRF token from the backend */
let cachedCsrf: {
  token: string
  cookiePairs: string  // "name=value; name2=value2" format for Cookie header
  expiresAt: number
} | null = null

/**
 * Fetch a fresh CSRF token from the .NET backend's /csrf-token endpoint.
 */
async function fetchFreshToken(authHeader?: string | null): Promise<{
  token: string
  cookies: string[]
} | null> {
  try {
    const headers: Record<string, string> = { 'Accept': 'application/json' }
    if (authHeader) {
      headers['Authorization'] = authHeader
    }

    const res = await fetch(`${API_BASE}/csrf-token`, {
      method: 'GET',
      headers,
      redirect: 'follow',
    })

    if (!res.ok) return null

    // Capture Set-Cookie headers
    const setCookies: string[] = []
    res.headers.forEach((value, key) => {
      if (key.toLowerCase() === 'set-cookie') {
        setCookies.push(value)
      }
    })

    const data = await res.json().catch(() => null)
    const token =
      data?.token ||
      data?.csrfToken ||
      data?.csrf_token ||
      data?.requestToken ||
      res.headers.get('x-csrf-token') ||
      res.headers.get('X-CSRF-Token') ||
      ''

    return { token, cookies: setCookies }
  } catch {
    return null
  }
}

/**
 * Extract "name=value" pairs from Set-Cookie headers.
 */
function extractCookiePairs(setCookies: string[]): string {
  return setCookies
    .map(sc => {
      const idx = sc.indexOf(';')
      return idx > 0 ? sc.substring(0, idx).trim() : sc.trim()
    })
    .filter(Boolean)
    .join('; ')
}

/**
 * Get a valid CSRF token + cookie pair from the .NET backend.
 * Caches the result for 10 minutes.
 *
 * @param authHeader - The Authorization header value (e.g., "Bearer xxx")
 * @param forceRefresh - If true, bypass cache and fetch fresh
 * @returns Object with token and cookiePairs, or null if unavailable
 */
export async function getBackendCsrf(
  authHeader?: string | null,
  forceRefresh = false
): Promise<{ token: string; cookiePairs: string } | null> {
  // Check cache
  if (!forceRefresh && cachedCsrf && Date.now() < cachedCsrf.expiresAt) {
    return { token: cachedCsrf.token, cookiePairs: cachedCsrf.cookiePairs }
  }

  const result = await fetchFreshToken(authHeader)
  if (!result || !result.token) return null

  const cookiePairs = extractCookiePairs(result.cookies)

  // Cache for 10 minutes
  cachedCsrf = {
    token: result.token,
    cookiePairs,
    expiresAt: Date.now() + 10 * 60 * 1000,
  }

  return { token: result.token, cookiePairs }
}

/**
 * Invalidate the cached CSRF token (e.g., after a 403 error).
 */
export function invalidateCsrfCache(): void {
  cachedCsrf = null
}

/**
 * Prepare headers for a direct fetch() call to the .NET backend.
 * Strips client-side CSRF tokens and adds fresh backend CSRF tokens.
 *
 * @param incomingReq - The incoming Next.js request
 * @param extraHeaders - Additional headers to include
 * @returns Headers object ready for fetch() to the backend
 */
export async function prepareBackendHeaders(
  incomingReq: Request,
  extraHeaders: Record<string, string> = {}
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {}
  const skipHeaders = new Set(['host', 'x-csrf-token', 'x-requested-with'])

  incomingReq.headers.forEach((value, key) => {
    if (!skipHeaders.has(key.toLowerCase())) {
      headers[key] = value
    }
  })

  // Clean CSRF cookies from cookie header
  if (headers['cookie']) {
    const cleaned = headers['cookie']
      .split(';')
      .map(c => c.trim())
      .filter(c => {
        const name = c.split('=')[0].trim().toLowerCase()
        return name !== 'csrf-token' &&
               name !== 'x-csrf-token' &&
               !name.startsWith('.aspnetcore.antiforgery')
      })
      .join('; ')
    if (cleaned) {
      headers['cookie'] = cleaned
    } else {
      delete headers['cookie']
    }
  }

  // Add extra headers
  Object.assign(headers, extraHeaders)

  // Fetch and add backend CSRF token for state-changing methods
  const method = incomingReq.method.toUpperCase()
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const authHeader = incomingReq.headers.get('authorization')
    const csrf = await getBackendCsrf(authHeader)
    if (csrf) {
      headers['X-CSRF-Token'] = csrf.token
      headers['X-Requested-With'] = 'XMLHttpRequest'
      if (csrf.cookiePairs) {
        headers['cookie'] = headers['cookie']
          ? `${headers['cookie']}; ${csrf.cookiePairs}`
          : csrf.cookiePairs
      }
    }
  }

  return headers
}