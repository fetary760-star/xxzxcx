import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * /api/auth/refresh — Next.js proxy for the backend refresh endpoint.
 *
 * Backend contract (CMT.Web.Api/Controllers/AuthController.cs — RefreshToken):
 *   POST /api/auth/refresh
 *   Body: { "refreshToken": "<token>" }   // required — ModelState must be valid
 *   Backend also reads Request.Cookies["refresh_token"] if present (preferred).
 *   Response: 200 with { token, refreshToken, ... } on success.
 *             401 { message: "Invalid refresh token" } on failure.
 *
 * Fix summary
 * -----------
 * The previous implementation sent an EMPTY body to the backend and relied on
 * the .NET controller to read the `refresh_token` cookie. Two problems caused
 * the persistent 401:
 *   1. The .NET action signature is `RefreshToken([FromBody] RefreshTokenDto)`.
 *      With an empty body, ModelState is invalid and the controller returns
 *      400/401 before even touching the cookie.
 *   2. Even when cookies were present, the proxy sometimes forwarded only the
 *      legacy `auth_token` / `authToken` cookies (from the old login route)
 *      and not `refresh_token`.
 *
 * Additional fix (data-disappears-on-refresh):
 *   - When the backend rejects the refresh with 401 (e.g. refresh token
 *     expired / rotated), we now explicitly CLEAR the stale
 *     `access_token` / `refresh_token` / legacy alias cookies on the
 *     response. The browser used to keep sending an expired access_token
 *     cookie to every protected route, producing a cascade of 401s and
 *     making the UI render as if "the data disappeared". Clearing the
 *     cookies forces a clean re-login on the next navigation instead of
 *     endless silent-refresh loops.
 *
 * CRITICAL FIX (secure cookie on HTTP deployment):
 *   - The `secure` flag on cookies was previously set to
 *     `process.env.NODE_ENV === 'production'`. When the server is deployed
 *     on plain HTTP (e.g. http://svhqiis03:8757), browsers refuse to store
 *     or send Secure cookies, causing all subsequent requests to fail with
 *     401. Now we detect the actual protocol from the request.
 *
 * The fix:
 *   - Parse all known refresh-token cookie names from the incoming request.
 *   - Always send a JSON body `{ refreshToken: "<value>" }` to the backend.
 *   - Still forward the cookie header so backends that prefer cookies work.
 *   - On success, re-set `access_token` AND `refresh_token` (matching backend
 *     naming) plus legacy aliases `auth_token` / `authToken` for any older
 *     client code that still reads them.
 *   - On failure (401), actively delete all auth cookies.
 */

const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
).replace(/\/+$/, '')

// Cookie lifetimes aligned with the .NET backend (AuthController.cs).
const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24           // 24h — matches backend access cookie
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30     // 30 days — matches backend refresh cookie

/**
 * Determine whether cookies should be marked Secure.
 * 
 * FIX: Previously this was `process.env.NODE_ENV === 'production'` which
 * caused cookies to be set with Secure flag even when the server is deployed
 * on plain HTTP (e.g. http://svhqiis03:8757). Browsers refuse to send Secure
 * cookies over non-HTTPS connections, causing all subsequent API calls to
 * fail with 401 after login.
 *
 * Now we check:
 *   1. Explicit env var COOKIE_SECURE=true/false (operator override)
 *   2. Whether the request itself arrived over HTTPS (x-forwarded-proto or url scheme)
 *   3. Default to false for safety (plain HTTP deployments work out of the box)
 */
function shouldSetSecureCookie(req: NextRequest): boolean {
  // 1. Explicit override via environment variable
  const envSecure = process.env.COOKIE_SECURE
  if (envSecure !== undefined) {
    return envSecure === 'true' || envSecure === '1'
  }

  // 2. Detect from request protocol
  const forwardedProto = req.headers.get('x-forwarded-proto')
  if (forwardedProto) {
    return forwardedProto.toLowerCase() === 'https'
  }

  // Check the request URL scheme
  try {
    const url = new URL(req.url)
    return url.protocol === 'https:'
  } catch {
    // fallback
  }

  // 3. Default: false (safe for HTTP deployments)
  return false
}

function extractToken(data: any): string | null {
  if (!data || typeof data !== 'object') return null
  return (
    data.token ||
    data.accessToken ||
    data.access_token ||
    data?.data?.token ||
    data?.data?.accessToken ||
    data?.result?.token ||
    data?.result?.accessToken ||
    null
  )
}

function extractRefreshToken(data: any): string | null {
  if (!data || typeof data !== 'object') return null
  return (
    data.refreshToken ||
    data.refresh_token ||
    data?.data?.refreshToken ||
    data?.data?.refresh_token ||
    data?.result?.refreshToken ||
    data?.result?.refresh_token ||
    null
  )
}

/**
 * Read a single cookie value by name from the raw cookie header.
 * Returns the decoded value or null when absent.
 */
function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null
  // Escape regex metacharacters in cookie name (defensive).
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`))
  if (!m) return null
  try {
    return decodeURIComponent(m[1])
  } catch {
    // Fall back to the raw value if decoding fails (e.g. %-encoded chars
    // that aren't valid UTF-8). We'd rather send something than nothing.
    return m[1]
  }
}

/**
 * Helper to wipe every auth-related cookie we might have set.
 * Used when the refresh is rejected so the next navigation shows the
 * login page instead of an empty, half-authenticated dashboard.
 */
function clearAuthCookies(res: NextResponse, isSecure: boolean) {
  const names = ['access_token', 'auth_token', 'authToken', 'refresh_token', 'refreshToken']
  for (const name of names) {
    res.cookies.set(name, '', {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
  }
}

export async function POST(req: NextRequest) {
  // FIX: Determine secure flag based on actual request protocol
  const isSecure = shouldSetSecureCookie(req)

  const cookieHeader = req.headers.get('cookie')

  // 1) Resolve the refresh token. Prefer the cookie the backend itself sets
  //    (`refresh_token`). Fall back to a request body field so programmatic
  //    clients that POST it directly still work.
  let refreshToken =
    getCookie(cookieHeader, 'refresh_token') ||
    getCookie(cookieHeader, 'refreshToken') ||
    ''

  if (!refreshToken) {
    try {
      const body = await req.json().catch(() => null)
      if (body && typeof body === 'object') {
        refreshToken = body.refreshToken || body.refresh_token || ''
      }
    } catch {
      // ignore — will fail below with 401 if still empty
    }
  }

  // 2) Resolve the current access token to send as a Bearer fallback (some
  //    backends require it; ours doesn't, but it's safe).
  const accessToken =
    getCookie(cookieHeader, 'access_token') ||
    getCookie(cookieHeader, 'auth_token') ||
    getCookie(cookieHeader, 'authToken') ||
    ''

  if (!refreshToken && !accessToken) {
    const res = NextResponse.json(
      { success: false, message: 'No active session to refresh.' },
      { status: 401 }
    )
    clearAuthCookies(res, isSecure)
    return res
  }

  const backendUrl = `${API_BASE}/auth/refresh`

  let backendResponse: Response
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
    // Forward cookies so cookie-preferring backends (ours) see `refresh_token`.
    if (cookieHeader) headers['cookie'] = cookieHeader
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`

    backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers,
      // Always send a well-formed body so [FromBody] ModelState is valid on
      // the .NET controller. Empty body -> 400 and we never reach the cookie
      // fallback path.
      body: JSON.stringify({ refreshToken: refreshToken || '' }),
      cache: 'no-store',
    })
  } catch {
    // Network-level failure — don't clear cookies, the user may just be
    // offline for a moment.
    return NextResponse.json(
      { success: false, message: 'Unable to reach authentication service.' },
      { status: 401 }
    )
  }

  const contentType = backendResponse.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const data: any = isJson
    ? await backendResponse.json().catch(() => null)
    : await backendResponse.text().catch(() => null)

  if (!backendResponse.ok) {
    // Refresh rejected → session is dead. Wipe cookies so subsequent
    // requests don't keep re-sending an expired access_token cookie
    // and triggering an endless 401 loop on every data call.
    const res = NextResponse.json(
      { success: false, message: 'Session expired. Please sign in again.' },
      { status: 401 }
    )
    clearAuthCookies(res, isSecure)
    return res
  }

  const newAccessToken = extractToken(data)
  const newRefreshToken = extractRefreshToken(data)

  const res = NextResponse.json(data ?? { success: true }, { status: 200 })

  if (newAccessToken) {
    // Primary cookies — names MUST match what the .NET backend reads
    // (Program.cs / AuthController.cs use "access_token" and "refresh_token").
    res.cookies.set('access_token', newAccessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS_COOKIE_MAX_AGE,
    })

    // Legacy aliases — keep any older client code that reads auth_token /
    // authToken working during the transition. Safe to remove once no code
    // references them.
    res.cookies.set('auth_token', newAccessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS_COOKIE_MAX_AGE,
    })
    res.cookies.set('authToken', newAccessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS_COOKIE_MAX_AGE,
    })

    if (newRefreshToken) {
      res.cookies.set('refresh_token', newRefreshToken, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        path: '/',
        maxAge: REFRESH_COOKIE_MAX_AGE,
      })
    }
  }

  return res
}