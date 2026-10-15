/**
 * Shared server-side proxy for every /api/users* Next.js route.
 *
 * ============================ WHY POST /api/users RETURNED 422 ============================
 * The browser/terminal trace was:
 *     [USERS API] Proxying POST to: http://localhost:5000/api/users
 *     POST /api/users 422 in 399ms
 * ...with no usable message in the UI. There were THREE independent defects:
 *
 * 1. LOST ERROR DETAIL (why you could not see the real reason).
 *    UserManagementController returns 422 as `ValidationProblemDetails`, and ASP.NET
 *    serialises that with content-type `application/problem+json` - NOT
 *    `application/json`. The old proxy only parsed JSON when the header contained
 *    the exact string "application/json", so the 422 body was forwarded as PLAIN
 *    TEXT. On the client, lib/api.ts then did `body.message || body.error` on a
 *    *string*, found nothing, and fell back to `res.statusText`. Result: a 422 with
 *    no explanation, so "cannot create user" looked like a mystery.
 *    FIX: any content-type containing "json" is parsed and re-emitted as
 *    application/json, and a human readable `message` is synthesised from the
 *    `errors` dictionary so even untouched pages display the real cause.
 *
 * 2. MISSING SUB-ROUTES (404s that broke the whole create flow).
 *    Only /api/users and /api/users/assign-role existed. The amended backend
 *    exposes /api/users/creation-rules, /api/users/supervisor-candidates,
 *    /api/users/role-reference, /api/users/{id}/activate, /{id}/deactivate,
 *    /{id}/permissions, /{id}/change-password, /api/users/org-tree ... none of
 *    which were reachable from the browser. The admin page therefore had to guess
 *    the hierarchy rules, and guessed wrong (see defect 3).
 *    FIX: a catch-all route (app/api/users/[...path]/route.ts) uses this helper.
 *
 * 3. WRONG CREATION MATRIX IN THE UI (the actual 422 trigger).
 *    The old admin page let an Admin create Engineer / Technician / Manager / ...
 *    while the server matrix allows Admin -> Director, SpecialTeamLeader ONLY.
 *    It also posted shopId/departmentId/supervisorUserId as null for roles that
 *    REQUIRE them. Every such POST is a legitimate 422 from the rules engine.
 *    FIX: the amended admin page drives its dropdowns from
 *    GET /api/users/creation-rules and enforces the required parents.
 * =========================================================================================
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** Backend root, e.g. http://localhost:5000/api (no trailing slash). */
export const USERS_API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
)
  .trim()
  .replace(/\/+$/, '')

export type ProxyMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

const PLACEHOLDER_TOKENS = ['', 'null', 'undefined', 'cookie-session']

/**
 * Resolves the bearer token from (in order) the Authorization header, the
 * x-auth-token header, well known cookies, and finally a manual cookie parse.
 */
export function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (authHeader) {
    const value = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (!PLACEHOLDER_TOKENS.includes(value)) return value
  }

  const xAuthToken = (req.headers.get('x-auth-token') || '').trim()
  if (xAuthToken && !PLACEHOLDER_TOKENS.includes(xAuthToken)) return xAuthToken

  const cookieNames = ['access_token', 'auth_token', 'authToken']
  for (const name of cookieNames) {
    const value = (req.cookies.get(name)?.value || '').trim()
    if (value && !PLACEHOLDER_TOKENS.includes(value)) return value
  }

  const cookieHeader = req.headers.get('cookie')
  if (cookieHeader) {
    for (const name of cookieNames) {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
      if (!match) continue
      let raw = match[1].trim()
      try {
        raw = decodeURIComponent(raw).trim()
      } catch {
        /* keep the undecoded value */
      }
      if (raw && !PLACEHOLDER_TOKENS.includes(raw)) return raw
    }
  }

  return null
}

/**
 * Builds a single readable sentence out of an ASP.NET ValidationProblemDetails
 * body so the client always has something to show, even when it only reads
 * `body.message`.
 */
function buildValidationMessage(payload: Record<string, unknown>): string | null {
  const errorsBag = (payload.errors ?? (payload as Record<string, unknown>).Errors) as
    | Record<string, unknown>
    | undefined

  if (!errorsBag || typeof errorsBag !== 'object') return null

  const parts: string[] = []
  for (const [field, value] of Object.entries(errorsBag)) {
    const messages = Array.isArray(value) ? value : [value]
    for (const message of messages) {
      if (typeof message === 'string' && message.trim()) {
        parts.push(field === 'request' ? message.trim() : `${message.trim()}`)
      }
    }
  }

  if (parts.length === 0) return null

  const title = typeof payload.title === 'string' && payload.title.trim() ? `${payload.title.trim()}: ` : ''
  const shown = parts.slice(0, 4).join(' ')
  const more = parts.length > 4 ? ` (+${parts.length - 4} more)` : ''
  return `${title}${shown}${more}`
}

/**
 * Forwards a request to the backend /api/users family and returns the backend
 * status verbatim, with the body normalised to application/json whenever the
 * backend replied with any JSON flavour (including application/problem+json).
 */
export async function proxyUsersRequest(
  req: NextRequest,
  method: ProxyMethod,
  segments: string[] = [],
): Promise<Response> {
  try {
    const token = extractToken(req)
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const suffix = segments.filter(Boolean).map(encodeURIComponent).join('/')
    const search = new URL(req.url).search || ''
    const backendUrl = `${USERS_API_BASE}/users${suffix ? `/${suffix}` : ''}${search}`

    console.log(`[USERS API] Proxying ${method} to:`, backendUrl)

    const headers: Record<string, string> = {
      Accept: 'application/json, application/problem+json',
      Authorization: `Bearer ${token}`,
    }

    const cookie = req.headers.get('cookie')
    if (cookie) headers.Cookie = cookie

    const csrfToken = req.headers.get('x-csrf-token')
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken

    let body: string | undefined
    if (method !== 'GET' && method !== 'DELETE') {
      const text = await req.text().catch(() => '')
      if (text) {
        body = text
        headers['Content-Type'] = 'application/json'
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    let response: Response
    try {
      response = await fetch(backendUrl, {
        method,
        headers,
        body,
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch (fetchErr) {
      const error = fetchErr as { name?: string; message?: string }
      console.error(`[USERS API] ${method} fetch error:`, error?.message)
      if (error?.name === 'AbortError') {
        return NextResponse.json({ message: 'Backend request timed out' }, { status: 504 })
      }
      return NextResponse.json(
        { message: 'Backend unreachable', details: error?.message ?? String(fetchErr) },
        { status: 502 },
      )
    } finally {
      clearTimeout(timeoutId)
    }

    if (response.status === 204 || response.status === 205) {
      return new Response(null, { status: response.status })
    }

    const contentType = response.headers.get('content-type') || ''
    const raw = await response.text().catch(() => '')

    if (!raw) {
      return new Response(null, { status: response.status })
    }

    // Accept application/json AND application/problem+json (the 422 shape).
    if (/json/i.test(contentType)) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          const payload = parsed as Record<string, unknown>
          if (!payload.message) {
            const synthesised = buildValidationMessage(payload)
            if (synthesised) payload.message = synthesised
            else if (typeof payload.title === 'string') payload.message = payload.title
          }
          return NextResponse.json(payload, { status: response.status })
        }
        return NextResponse.json(parsed, { status: response.status })
      } catch {
        /* fall through to raw passthrough */
      }
    }

    return new Response(raw, {
      status: response.status,
      headers: { 'Content-Type': contentType || 'text/plain' },
    })
  } catch (err) {
    console.error(`[USERS API] ${method} proxy error:`, err)
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 })
  }
}

/** Reads route params in a way that works on Next.js 13, 14 and 15. */
export async function resolvePathSegments(context: unknown): Promise<string[]> {
  const params = await Promise.resolve((context as { params?: unknown })?.params)
  const path = (params as { path?: string[] | string } | undefined)?.path
  if (!path) return []
  return Array.isArray(path) ? path : [path]
}