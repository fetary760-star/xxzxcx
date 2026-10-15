import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerToken, resolveAuthorizationHeader, buildBackendProxyHeaders } from '@/lib/proxy-auth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/**
 * Helper: Fetch a fresh CSRF token from the backend by making a GET request.
 * The backend CsrfMiddleware generates a new token on every GET and returns it
 * both as a `CSRF-TOKEN` cookie and an `X-CSRF-Token` response header.
 * We return the token string so the caller can use it in both the header and
 * cookie of the subsequent state-changing request.
 */
async function fetchBackendCsrfToken(authHeader: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE}/settings/me`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Accept': 'application/json',
      },
    })

    // Extract CSRF token from response header
    const headerToken = res.headers.get('X-CSRF-Token') || res.headers.get('x-csrf-token')
    if (headerToken) return headerToken

    // Fallback: extract from Set-Cookie header
    const setCookies = res.headers.getSetCookie?.() ?? []
    for (const cookie of setCookies) {
      const match = cookie.match(/CSRF-TOKEN=([^;]+)/)
      if (match) return decodeURIComponent(match[1])
    }

    // Fallback: try raw set-cookie header
    const rawSetCookie = res.headers.get('set-cookie') || ''
    const cookieMatch = rawSetCookie.match(/CSRF-TOKEN=([^;]+)/)
    if (cookieMatch) return decodeURIComponent(cookieMatch[1])

    return null
  } catch (error) {
    console.error('Failed to fetch backend CSRF token:', error)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    // Use shared proxy-auth helper to resolve token from header, middleware, or cookies
    const authHeader = resolveAuthorizationHeader(request)
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header missing' }, { status: 401 })
    }

    const response = await fetch(`${API_BASE}/settings/me`, {
      method: 'GET',
      headers: buildBackendProxyHeaders(request),
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      return NextResponse.json(
        { error: errorData.message || 'Failed to fetch settings' }, 
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Settings API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Use shared proxy-auth helper to resolve token from header, middleware, or cookies
    const authHeader = resolveAuthorizationHeader(request)
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header missing' }, { status: 401 })
    }

    const body = await request.json()

    // ================================================================
    // FIX: Fetch a fresh CSRF token directly from the backend.
    //
    // The backend CsrfMiddleware validates PUT requests by comparing:
    //   1. X-CSRF-Token header
    //   2. CSRF-TOKEN cookie
    // Both must be identical. Previously, the frontend generated its own
    // token which never matched the backend's cookie → 403.
    //
    // Now we make a GET to the backend first (which triggers the middleware
    // to generate a fresh token), capture that token, and send it as BOTH
    // the header and cookie on the PUT request so they match.
    // ================================================================
    const freshCsrfToken = await fetchBackendCsrfToken(authHeader)

    // Build headers for backend request
    const headers: Record<string, string> = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    }

    // Forward cookies from the original request for cookie-auth backends
    const cookie = request.headers.get('cookie')

    if (freshCsrfToken) {
      // Send the same token in both header and cookie so backend validation passes
      headers['X-CSRF-Token'] = freshCsrfToken
      // Merge CSRF cookie with existing cookies
      const csrfCookie = `CSRF-TOKEN=${encodeURIComponent(freshCsrfToken)}`
      headers['Cookie'] = cookie ? `${cookie}; ${csrfCookie}` : csrfCookie
    } else {
      // Fallback: try forwarding whatever the client sent (may still fail)
      const csrfToken = request.headers.get('x-csrf-token')
      const csrfCookie = request.cookies.get('CSRF-TOKEN')?.value
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken
      if (cookie) {
        headers['Cookie'] = cookie
      } else if (csrfCookie) {
        headers['Cookie'] = `CSRF-TOKEN=${csrfCookie}`
      }
    }

    const response = await fetch(`${API_BASE}/settings/me`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('Backend settings update error:', {
        status: response.status,
        error: errorData
      })
      return NextResponse.json(
        { error: errorData.message || errorData.error || 'Failed to update settings' }, 
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Settings update API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}