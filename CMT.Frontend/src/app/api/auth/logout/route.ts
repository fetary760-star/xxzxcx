import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * Logout route
 *
 * FIXES (auth cascade):
 *  - Clears `access_token` (the canonical cookie written by
 *    /api/auth/login and read by middleware.ts + serverAuth.ts).
 *    Previously only the legacy `auth_token` / `authToken` cookies
 *    were cleared, leaving `access_token` in the browser and causing
 *    every subsequent /api/* call to hit the backend with a now-
 *    revoked token -> middleware's fetchUserByToken returned null ->
 *    route handlers threw AuthError(401) ("Forwarded user: Not found").
 *  - Reads `access_token` FIRST when extracting the token to forward
 *    to the backend /auth/logout so backend-side invalidation actually
 *    happens. Falls back to legacy cookie names for older deploys.
 *  - Uses the same API_BASE sanitization as the rest of the codebase
 *    (trailing slash stripped, no leading space).
 *
 * CRITICAL FIX (secure cookie on HTTP deployment):
 *  - The `secure` flag on cookies was previously hardcoded to
 *    `process.env.NODE_ENV === 'production'`. When the server is deployed
 *    on plain HTTP (e.g. http://svhqiis03:8757), browsers refuse to
 *    process Set-Cookie with Secure over non-HTTPS, so the cookies were
 *    never actually cleared. Now we detect the actual protocol.
 */

const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
).replace(/\/+$/, '')

/**
 * Determine whether cookies should be marked Secure.
 * Same logic as login/refresh routes for consistency.
 */
function shouldSetSecureCookie(req: NextRequest): boolean {
  const envSecure = process.env.COOKIE_SECURE
  if (envSecure !== undefined) {
    return envSecure === 'true' || envSecure === '1'
  }
  const forwardedProto = req.headers.get('x-forwarded-proto')
  if (forwardedProto) {
    return forwardedProto.toLowerCase() === 'https'
  }
  try {
    const url = new URL(req.url)
    return url.protocol === 'https:'
  } catch {
    // fallback
  }
  return false
}

/**
 * Build a response that clears ALL auth-related cookies this app has
 * ever written. We include the canonical `access_token` plus the two
 * legacy names so logout is idempotent across deploy versions.
 */
function buildClearResponse(req: NextRequest) {
  const res = NextResponse.json(
    { message: 'Logged out successfully' },
    { status: 200 }
  )

  const isSecure = shouldSetSecureCookie(req)
  const cookieNames = ['access_token', 'auth_token', 'authToken', 'refresh_token']
  for (const name of cookieNames) {
    res.cookies.set(name, '', {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    })
  }

  // Prevent any intermediary from caching the logout response.
  res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.headers.set('Pragma', 'no-cache')
  res.headers.set('Expires', '0')

  return res
}

/**
 * Extract the access token from the incoming request.
 * Priority: Authorization header -> access_token cookie -> legacy cookies.
 */
function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization') || ''
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token && token !== 'null' && token !== 'undefined') {
      return token
    }
  }

  const cookie = req.headers.get('cookie')
  if (cookie) {
    // Check access_token FIRST (canonical name set by /api/auth/login).
    const match = cookie.match(
      /(?:^|;\s*)(?:access_token|auth_token|authToken)=([^;]+)/
    )
    if (match) {
      const token = decodeURIComponent(match[1]).trim()
      if (token && token !== 'null' && token !== 'undefined') {
        return token
      }
    }
  }

  return null
}

export async function POST(req: NextRequest) {
  try {
    const token = extractToken(req)

    // Best-effort forward to backend logout.
    // We intentionally do NOT block the client-side logout on backend
    // failure — the user must always be able to sign out locally.
    if (token) {
      const backendUrl = `${API_BASE}/auth/logout`
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)

        await fetch(backendUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
          signal: controller.signal,
        })

        clearTimeout(timeoutId)
      } catch (backendError) {
        // Log but do not surface — cookie clearing below is what
        // actually signs the user out of this frontend.
        console.error('Auth Logout API: Backend logout failed:', backendError)
      }
    }

    return buildClearResponse(req)
  } catch (error: any) {
    console.error('Auth Logout API: Unexpected error:', error)
    // Always clear cookies on logout, even on error.
    return buildClearResponse(req)
  }
}

/**
 * Also accept GET for convenience (some clients issue GET on link
 * navigation). Behaves identically to POST.
 */
export async function GET(req: NextRequest) {
  return POST(req)
}