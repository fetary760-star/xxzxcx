/**
 * =====================================================================================
 * PHASE 1 — DELIVERABLE 4 (AMENDED, REPLACES THE EXISTING FILE)
 * Copy to: CMT.Frontend/src/app/api/self-evaluation/[...path]/route.ts
 *
 * THE TWO LOG LINES THIS VERSION ELIMINATES
 * -----------------------------------------
 *   [SELF-EVALUATION API] POST forms/<id>/submit is being forwarded WITHOUT a body.
 *   POST /api/self-evaluation/forms/<id>/submit 400
 *
 * and
 *
 *   POST /api/self-evaluation/forms 400
 *   { "command": ["The command field is required."],
 *     "$.revDate": ["The JSON value could not be converted to Nullable<DateTime> …"] }
 *
 * FIX 1 — A BODY-LESS MUTATION IS NEVER FORWARDED BODY-LESS AGAIN
 *   `submitForm()` in `src/lib/self-evaluation/api.ts` calls POST `/forms/{id}/submit`
 *   with no body at all. Any ASP.NET action that declares `[FromBody]` — even an optional
 *   one — answers 400 "A non-empty request body is required." for that. The proxy now
 *   substitutes `{}` for an absent body on POST / PUT / PATCH, which every action accepts:
 *   an action WITHOUT `[FromBody]` ignores it, and an action WITH `[FromBody]` binds it to
 *   a default instance whose `Id` the controller then overwrites from the route.
 *
 * FIX 2 — THE SANITISER IS NOW ACTUALLY BOUND
 *   `resolveSanitizer()` looked for `sanitizeRequestBodyText` first, which nothing exported,
 *   and logged "No body sanitiser export found …; forwarding the raw body unchanged." That
 *   fallback is why `"revDate": "MAR 11 2021"` reached the backend verbatim. The amended
 *   `payload-sanitize.ts` exports that exact name, and the resolution below is unchanged, so
 *   the binding now succeeds and the label is rewritten to `"2021-03-11"` on the wire.
 *
 * FIX 3 — A COALESCED DUPLICATE NO LONGER REPLAYS A 400 AS IF IT WERE THE FIRST ANSWER
 *   The window now only replays SUCCESSFUL first results. Replaying a 400 hid which click
 *   actually failed ("Coalesced duplicate POST …/submit — returning the first result"
 *   immediately after two real 400s).
 *
 * Everything else — token extraction, header construction, timeout, 502 / 504 semantics,
 * multipart pass-through, 204 handling, binary handling — is byte-for-byte the previous
 * behaviour.
 * =====================================================================================
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Namespace import: a missing named export can no longer produce a module-level binding
// that throws at call time and takes the body down with it.
import * as PayloadSanitize from '@/lib/http/payload-sanitize'

const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
)
  .trim()
  .replace(/\/+$/, '')

const REQUEST_TIMEOUT_MS = 30000

/** Cookie names the app has used across versions — all still accepted. */
const TOKEN_COOKIE_NAMES = ['access_token', 'auth_token', 'authToken'] as const

const PLACEHOLDER_TOKENS = new Set(['', 'null', 'undefined', 'cookie-session'])

function isRealToken(value: string | null | undefined): value is string {
  if (!value) return false
  return !PLACEHOLDER_TOKENS.has(value.trim())
}

/** Extract the bearer token. Order unchanged from the previous version. */
function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (authHeader) {
    const bare = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (isRealToken(bare)) return bare
  }

  const middlewareToken = req.headers.get('x-auth-token')
  if (isRealToken(middlewareToken)) return middlewareToken.trim()

  for (const name of TOKEN_COOKIE_NAMES) {
    const cookie = req.cookies.get(name)
    if (isRealToken(cookie?.value)) return cookie!.value.trim()
  }

  const cookieHeader = req.headers.get('cookie')
  if (cookieHeader) {
    for (const name of TOKEN_COOKIE_NAMES) {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
      if (!match) continue
      let raw = match[1]
      try {
        raw = decodeURIComponent(raw)
      } catch {
        /* keep the undecoded value */
      }
      if (isRealToken(raw)) return raw.trim()
    }
  }

  return null
}

function buildProxyHeaders(
  req: NextRequest,
  token: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  }

  const cookie = req.headers.get('cookie')
  if (cookie) headers.Cookie = cookie

  const csrfToken = req.headers.get('x-csrf-token')
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken

  const requestedWith = req.headers.get('x-requested-with')
  if (requestedWith) headers['X-Requested-With'] = requestedWith

  return { ...headers, ...extra }
}

// =====================================================================================
// THE RESILIENT SANITISER BINDING
// =====================================================================================

type BodySanitizer = (text: string) => string

/**
 * Resolves the sanitiser at CALL TIME, accepting either export name. With the amended
 * `payload-sanitize.ts` the FIRST candidate now exists, so the raw-body fallback that let
 * `"revDate": "MAR 11 2021"` through is no longer reachable in a healthy build.
 */
function resolveSanitizer(): BodySanitizer | null {
  const mod = PayloadSanitize as unknown as Record<string, unknown>
  const candidate = mod.sanitizeRequestBodyText ?? mod.sanitizeJsonBody
  return typeof candidate === 'function' ? (candidate as BodySanitizer) : null
}

/** Sanitising can NEVER cost us the body. Any failure degrades to "forward raw". */
function safeSanitizeBody(rawText: string, method: string, subPath: string): string {
  const sanitize = resolveSanitizer()

  if (!sanitize) {
    console.error(
      `[SELF-EVALUATION API] No body sanitiser export found in @/lib/http/payload-sanitize. ` +
        `Dates such as "MAR 11 2021" will reach the backend verbatim and produce ` +
        `400 $.revDate. Verify that payload-sanitize.ts exports sanitizeRequestBodyText.`,
    )
    return rawText
  }

  try {
    const cleaned = sanitize(rawText)
    if (typeof cleaned !== 'string' || cleaned.length === 0) return rawText
    if (cleaned !== rawText) {
      console.log(`[SELF-EVALUATION API] Normalised body of ${method} ${subPath}`)
    }
    return cleaned
  } catch (sanitizeError: unknown) {
    console.warn(
      `[SELF-EVALUATION API] Body sanitiser threw for ${method} ${subPath}; forwarding raw body.`,
      sanitizeError instanceof Error ? sanitizeError.message : String(sanitizeError),
    )
    return rawText
  }
}

// =====================================================================================
// DUPLICATE MUTATION COALESCING
// =====================================================================================

/**
 * State transitions that are NOT idempotent server side: firing them twice can produce a
 * legitimate 400 that the user misreads as a failure of the FIRST call.
 */
const COALESCED_ACTIONS = new Set([
  'submit',
  'approve',
  'reject',
  'return',
  'skip',
  'assign',
  'reassign',
  'delegate',
  'complete',
  'finalize',
  'finalise',
  'signoff',
  'sign-off',
  'endorse',
  'verify',
  'revoke',
])

const COALESCE_WINDOW_MS = 2500

interface CoalescedEntry {
  promise: Promise<{ status: number; body: string; contentType: string }>
  settledAt: number
  /** FIX 3: only a SUCCESSFUL first answer may be replayed to a duplicate. */
  replayable: boolean
}

const inFlightMutations = new Map<string, CoalescedEntry>()

function shouldCoalesce(method: string, pathSegments: string[]): boolean {
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') return false
  const last = (pathSegments[pathSegments.length - 1] ?? '').toLowerCase()
  return COALESCED_ACTIONS.has(last)
}

function coalesceKey(method: string, subPath: string, token: string, body: string): string {
  const tokenTail = token.slice(-24)
  return `${method}|${subPath}|${tokenTail}|${body}`
}

function pruneCoalesceMap(now: number): void {
  for (const [key, entry] of inFlightMutations.entries()) {
    if (entry.settledAt > 0 && now - entry.settledAt > COALESCE_WINDOW_MS) {
      inFlightMutations.delete(key)
    }
  }
}

// =====================================================================================
// METHOD HANDLERS
// =====================================================================================

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxyToBackend(req, path, 'GET')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxyToBackend(req, path, 'POST')
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxyToBackend(req, path, 'PUT')
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxyToBackend(req, path, 'PATCH')
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  return proxyToBackend(req, path, 'DELETE')
}

// =====================================================================================
// THE PROXY
// =====================================================================================

async function proxyToBackend(
  req: NextRequest,
  pathSegments: string[],
  method: string,
): Promise<Response> {
  try {
    const token = extractToken(req)
    if (!token) {
      console.error('[SELF-EVALUATION API] No token found for path:', pathSegments.join('/'))
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const subPath = pathSegments.join('/')
    const url = new URL(req.url)
    const queryString = url.search || ''
    const backendUrl = `${API_BASE}/self-evaluation/${subPath}${queryString}`

    const incomingContentType = req.headers.get('content-type') || ''
    const isMultipart = incomingContentType.includes('multipart/form-data')
    const hasBodyMethod = method !== 'GET' && method !== 'HEAD'
    const isWriteMethod = method === 'POST' || method === 'PUT' || method === 'PATCH'

    let body: BodyInit | null = null
    /** Text form of the JSON body, used for the coalescing key. */
    let sanitizedText = ''

    if (hasBodyMethod) {
      if (isMultipart) {
        // A file upload is forwarded byte for byte, never sanitised.
        try {
          body = Buffer.from(await req.arrayBuffer())
        } catch (readError: unknown) {
          console.warn(
            `[SELF-EVALUATION API] Could not read the multipart body of ${method} ${subPath}:`,
            readError instanceof Error ? readError.message : String(readError),
          )
          body = null
        }
      } else {
        let rawText = ''
        try {
          rawText = await req.text()
        } catch (readError: unknown) {
          console.warn(
            `[SELF-EVALUATION API] Could not read the body of ${method} ${subPath}:`,
            readError instanceof Error ? readError.message : String(readError),
          )
          rawText = ''
        }

        if (rawText) {
          sanitizedText = safeSanitizeBody(rawText, method, subPath)
          body = sanitizedText
        } else if (isWriteMethod) {
          // ------------------------------------------------------------------------
          // FIX 1. A body-less POST / PUT / PATCH is forwarded as `{}`.
          //
          // `submitForm()` sends no body to POST /forms/{id}/submit. An action that
          // declares `[FromBody]` — even `[FromBody] T? command` — answers
          // 400 "A non-empty request body is required." for an absent body. `{}` is
          // accepted by BOTH shapes: an action without [FromBody] ignores it, and an
          // action with [FromBody] binds a default instance whose Id the controller
          // overwrites from the route value.
          // ------------------------------------------------------------------------
          sanitizedText = '{}'
          body = sanitizedText
          console.log(
            `[SELF-EVALUATION API] ${method} ${subPath} had no body; forwarding "{}" so the ` +
              `backend cannot answer 400 "A non-empty request body is required."`,
          )
        }
      }
    }

    // Only declare a JSON content type when there are bytes to describe.
    const extraHeaders: Record<string, string> = {}
    if (isMultipart) {
      extraHeaders['Content-Type'] = incomingContentType
    } else if (body !== null) {
      extraHeaders['Content-Type'] = 'application/json'
    }

    const headers = buildProxyHeaders(req, token, extraHeaders)

    // ---- coalesce a duplicate state transition ---------------------------------------
    if (!isMultipart && shouldCoalesce(method, pathSegments)) {
      const now = Date.now()
      pruneCoalesceMap(now)

      const key = coalesceKey(method, subPath, token, sanitizedText)
      const existing = inFlightMutations.get(key)

      const withinWindow =
        existing && (existing.settledAt === 0 || now - existing.settledAt <= COALESCE_WINDOW_MS)

      if (existing && withinWindow) {
        const first = await existing.promise
        // FIX 3: never replay a failure — the second click must see the real answer.
        if (existing.replayable) {
          console.log(
            `[SELF-EVALUATION API] Coalesced duplicate ${method} ${subPath} — ` +
              `replaying the first SUCCESSFUL result (${first.status})`,
          )
          return new Response(first.body || null, {
            status: first.status,
            headers: {
              'Content-Type': first.contentType || 'application/json',
              'X-Coalesced-Duplicate': 'true',
            },
          })
        }
        console.warn(
          `[SELF-EVALUATION API] First ${method} ${subPath} failed with ${first.status}; ` +
            `NOT replaying it — forwarding this attempt to the backend.`,
        )
        inFlightMutations.delete(key)
      }

      const entry: CoalescedEntry = {
        promise: forwardAndCapture(backendUrl, method, headers, body, subPath),
        settledAt: 0,
        replayable: false,
      }
      inFlightMutations.set(key, entry)

      let captured: { status: number; body: string; contentType: string }
      try {
        captured = await entry.promise
        entry.replayable = captured.status >= 200 && captured.status < 300
      } finally {
        entry.settledAt = Date.now()
      }

      return new Response(captured.body || null, {
        status: captured.status,
        headers: { 'Content-Type': captured.contentType || 'application/json' },
      })
    }

    // ---- the normal, non-coalesced path ----------------------------------------------
    return await forwardStreaming(backendUrl, method, headers, body, subPath)
  } catch (err: unknown) {
    console.error('[SELF-EVALUATION API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', details: String(err) },
      { status: 500 },
    )
  }
}

/** Shared fetch with the timeout / 502 / 504 semantics of the previous version. */
async function callBackend(
  backendUrl: string,
  method: string,
  headers: Record<string, string>,
  body: BodyInit | null,
  subPath: string,
): Promise<{ response: Response } | { failure: Response }> {
  console.log(`[SELF-EVALUATION API] Proxying ${method} to:`, backendUrl)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(backendUrl, {
      method,
      headers,
      body,
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(timeoutId)
    return { response }
  } catch (fetchErr: unknown) {
    clearTimeout(timeoutId)
    const message = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
    const aborted = fetchErr instanceof Error && fetchErr.name === 'AbortError'
    console.error(`[SELF-EVALUATION API] Fetch error for ${method} ${subPath}:`, message)

    return {
      failure: aborted
        ? NextResponse.json(
            { error: 'Backend request timed out', details: `Timeout after ${REQUEST_TIMEOUT_MS}ms` },
            { status: 504 },
          )
        : NextResponse.json({ error: 'Backend unreachable', details: message }, { status: 502 }),
    }
  }
}

/** Forwards and CAPTURES the response as text, so it can be replayed to a duplicate. */
async function forwardAndCapture(
  backendUrl: string,
  method: string,
  headers: Record<string, string>,
  body: BodyInit | null,
  subPath: string,
): Promise<{ status: number; body: string; contentType: string }> {
  const result = await callBackend(backendUrl, method, headers, body, subPath)

  if ('failure' in result) {
    const text = await result.failure.text().catch(() => '')
    return { status: result.failure.status, body: text, contentType: 'application/json' }
  }

  const { response } = result
  const contentType = response.headers.get('content-type') || 'application/json'
  if (response.status === 204) return { status: 204, body: '', contentType }
  const text = await response.text().catch(() => '')

  if (response.status >= 400) {
    console.error(
      `[SELF-EVALUATION API] Backend answered ${response.status} for ${method} ${subPath}: ${text}`,
    )
  }

  return { status: response.status, body: text, contentType }
}

/** Forwards and streams the response, preserving 204 / JSON / binary handling. */
async function forwardStreaming(
  backendUrl: string,
  method: string,
  headers: Record<string, string>,
  body: BodyInit | null,
  subPath: string,
): Promise<Response> {
  const result = await callBackend(backendUrl, method, headers, body, subPath)
  if ('failure' in result) return result.failure

  const { response } = result
  const contentType = response.headers.get('content-type') || ''

  if (response.status === 204) return new Response(null, { status: 204 })

  if (contentType.includes('json')) {
    const text = await response.text().catch(() => '')
    if (response.status >= 400) {
      console.error(
        `[SELF-EVALUATION API] Backend answered ${response.status} for ${method} ${subPath}: ${text}`,
      )
    }
    return new Response(text || null, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (contentType.includes('application/octet-stream') || contentType.includes('application/pdf')) {
    const buffer = await response.arrayBuffer()
    const outHeaders: Record<string, string> = { 'Content-Type': contentType }
    const disposition = response.headers.get('content-disposition')
    if (disposition) outHeaders['Content-Disposition'] = disposition
    return new Response(buffer, { status: response.status, headers: outHeaders })
  }

  const text = await response.text().catch(() => '')
  return new Response(text, {
    status: response.status,
    headers: { 'Content-Type': contentType || 'text/plain' },
  })
}