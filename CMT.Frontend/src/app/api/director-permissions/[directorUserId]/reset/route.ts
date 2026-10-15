import { NextRequest, NextResponse } from 'next/server'
import { forwardAuthHeaders } from '@/lib/serverAuth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/**
 * Helper: extract the Authorization header (Bearer token) from the incoming
 * Next.js request so we can forward it to the backend.
 */
function getAuthHeader(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader) return authHeader

  const cookieHeader = request.headers.get('cookie')
  if (cookieHeader) {
    const tokenMatch = cookieHeader.match(/(?:^|;\s*)(?:auth_token|authToken)=([^;]+)/)
    if (tokenMatch) {
      return `Bearer ${decodeURIComponent(tokenMatch[1])}`
    }
  }
  return null
}

/**
 * Helper: Fetch a fresh CSRF token from the backend by making a lightweight
 * GET request. The backend's CsrfMiddleware sets a new CSRF-TOKEN cookie and
 * X-CSRF-Token response header on every GET. We capture both and return them
 * so the caller can use the same token value in the header AND cookie of the
 * subsequent mutating request.
 */
async function fetchFreshCsrfToken(authHeaderValue: string | null): Promise<{ token: string; cookie: string } | null> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    }
    if (authHeaderValue) {
      headers['Authorization'] = authHeaderValue
    }

    const res = await fetch(`${API_BASE}/director-permissions`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    })

    // Extract the CSRF token from the response header
    const tokenFromHeader = res.headers.get('x-csrf-token') || res.headers.get('X-CSRF-Token')

    // Extract the CSRF-TOKEN cookie from Set-Cookie header
    const setCookieHeaders = res.headers.getSetCookie?.() || []
    let tokenFromCookie = ''
    let fullCookieString = ''

    for (const sc of setCookieHeaders) {
      const match = sc.match(/CSRF-TOKEN=([^;]+)/)
      if (match) {
        tokenFromCookie = decodeURIComponent(match[1])
        fullCookieString = `CSRF-TOKEN=${match[1]}`
        break
      }
    }

    if (!tokenFromCookie) {
      const rawSetCookie = res.headers.get('set-cookie') || ''
      const match = rawSetCookie.match(/CSRF-TOKEN=([^;]+)/)
      if (match) {
        tokenFromCookie = decodeURIComponent(match[1])
        fullCookieString = `CSRF-TOKEN=${match[1]}`
      }
    }

    const token = tokenFromHeader || tokenFromCookie
    if (token) {
      return {
        token,
        cookie: fullCookieString || `CSRF-TOKEN=${encodeURIComponent(token)}`,
      }
    }

    return null
  } catch (error) {
    console.error('[director-permissions/reset] Failed to fetch fresh CSRF token:', error)
    return null
  }
}

/**
 * Helper: build headers for proxying mutating requests to the backend.
 * Uses a fresh CSRF token to satisfy the backend's double-submit cookie pattern.
 */
async function buildMutatingHeaders(
  request: NextRequest,
  freshCsrf: { token: string; cookie: string } | null
): Promise<Record<string, string>> {
  const headers = forwardAuthHeaders(request)
  headers['Accept'] = 'application/json'

  if (freshCsrf) {
    headers['X-CSRF-Token'] = freshCsrf.token
    headers['X-Requested-With'] = 'XMLHttpRequest'

    const existingCookies = request.headers.get('cookie') || ''
    const filteredCookies = existingCookies
      .split(';')
      .map(c => c.trim())
      .filter(c => {
        const name = c.split('=')[0]?.trim().toUpperCase()
        return name !== 'CSRF-TOKEN' && name !== 'X-CSRF-TOKEN'
      })
      .join('; ')

    headers['Cookie'] = filteredCookies
      ? `${filteredCookies}; ${freshCsrf.cookie}`
      : freshCsrf.cookie
  } else {
    let csrfToken = request.headers.get('x-csrf-token')
      || request.headers.get('X-CSRF-Token')
      || request.headers.get('csrf-token')

    const cookieHeader = request.headers.get('cookie')

    if (!csrfToken && cookieHeader) {
      const csrfMatch = cookieHeader.match(/(?:^|;\s*)(?:CSRF-TOKEN|X-CSRF-TOKEN|csrf-token)=([^;]+)/)
      if (csrfMatch) {
        csrfToken = decodeURIComponent(csrfMatch[1])
      }
    }

    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
      headers['X-Requested-With'] = 'XMLHttpRequest'
    }

    if (cookieHeader) {
      headers['Cookie'] = cookieHeader
    }
  }

  return headers
}

/**
 * POST /api/director-permissions/[directorUserId]/reset - Reset director permissions to defaults
 *
 * CSRF FIX: Before forwarding the POST to the backend, we make a GET request
 * to obtain a fresh CSRF token so the double-submit cookie check passes.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ directorUserId: string }> }
) {
  try {
    const { directorUserId } = await params

    if (!directorUserId) {
      return NextResponse.json(
        { error: 'Director User ID is required' },
        { status: 400 }
      )
    }

    const authHeaderValue = getAuthHeader(request)

    // Step 1: Fetch a fresh CSRF token from the backend
    const freshCsrf = await fetchFreshCsrfToken(authHeaderValue)

    // Step 2: Build headers with the fresh CSRF token
    const headers = await buildMutatingHeaders(request, freshCsrf)

    const backendUrl = `${API_BASE}/director-permissions/${directorUserId}/reset`

    // Step 3: Forward the POST request with matching CSRF header + cookie
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers,
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error(`[api/director-permissions/${directorUserId}/reset] POST error:`, response.status, errorText)
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to reset director permissions: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error(`[api/director-permissions/reset] POST Error:`, error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    )
  }
}