import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

// Cookie lifetimes aligned with the .NET backend (AuthController.cs).
const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 24           // 24h
const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30     // 30 days

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

/**
 * Extract the access token from a backend login response.
 * Supports several common shapes:
 *   { token: "..." }
 *   { accessToken: "..." }
 *   { data: { token: "..." } }
 *   { result: { token: "..." } }
 */
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

/**
 * Extract the refresh token from a backend login response.
 */
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Validate credentials
    if (!body.username || !body.password) {
      return NextResponse.json({
        success: false,
        message: 'Please enter your username and password'
      }, { status: 400 })
    }

    // Forward to backend auth endpoint
    const backendUrl = `${API_BASE}/auth/login`

    let response: Response
    try {
      response = await fetch(backendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: body.username,
          password: body.password
        }),
        cache: 'no-store'
      })
    } catch (fetchError: any) {
      return NextResponse.json({
        success: false,
        message: 'Unable to connect to the server. Please try again later.'
      }, { status: 503 })
    }

    const contentType = response.headers.get('content-type') || ''
    const isJson = contentType.includes('application/json')

    let data: any = null
    try {
      data = isJson ? await response.json() : await response.text()
    } catch {
      data = null
    }

    if (!response.ok) {
      let userMessage = 'Invalid username or password. Please try again.'

      if (response.status === 401) {
        userMessage = 'Invalid username or password. Please try again.'
      } else if (response.status === 403) {
        userMessage = 'Access denied. Please contact your administrator.'
      } else if (response.status === 404) {
        userMessage = 'Service not available. Please try again later.'
      } else if (response.status >= 500) {
        userMessage = 'Server error. Please try again later.'
      } else if (data?.message && typeof data.message === 'string') {
        const msg = data.message.toLowerCase()
        if (!msg.includes('exception') && !msg.includes('error:') && !msg.includes('stack')) {
          userMessage = data.message
        }
      }

      return NextResponse.json({
        success: false,
        message: userMessage
      }, { status: response.status })
    }

    // --- Set HttpOnly auth cookies on successful login ---
    // IMPORTANT: The .NET backend reads `access_token` and `refresh_token`
    // cookies (see CMT.Web.Api/Program.cs and AuthController.cs). We must set
    // both here so that the very first call to /api/auth/refresh (used by the
    // apiClient on 401) has a valid `refresh_token` cookie to forward.
    //
    // We also keep the legacy `auth_token` / `authToken` aliases to avoid
    // breaking any older client code still reading those names.
    const token = extractToken(data)
    const refreshToken = extractRefreshToken(data)

    const res = NextResponse.json(data, { status: 200 })

    if (token) {
      // FIX: Determine secure flag based on actual request protocol,
      // NOT NODE_ENV. This ensures cookies work on HTTP deployments.
      const isSecure = shouldSetSecureCookie(req)

      // Primary cookie — MUST match what the .NET backend expects.
      res.cookies.set('access_token', token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        path: '/',
        maxAge: ACCESS_COOKIE_MAX_AGE,
      })

      // Legacy aliases used by older parts of the Next.js app.
      res.cookies.set('auth_token', token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        path: '/',
        maxAge: ACCESS_COOKIE_MAX_AGE,
      })
      res.cookies.set('authToken', token, {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        path: '/',
        maxAge: ACCESS_COOKIE_MAX_AGE,
      })

      if (refreshToken) {
        res.cookies.set('refresh_token', refreshToken, {
          httpOnly: true,
          secure: isSecure,
          sameSite: 'lax',
          path: '/',
          maxAge: REFRESH_COOKIE_MAX_AGE,
        })
      } else {
        console.warn('Auth Login API: backend returned 2xx but no refreshToken field was found in response')
      }
    } else {
      console.error('Auth Login API: backend returned 2xx but no token field was found in response')
    }

    return res

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: 'Unable to connect to the server. Please try again later.'
    }, { status: 503 })
  }
}