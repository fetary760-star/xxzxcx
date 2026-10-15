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

  // Fall back to cookie
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
 *
 * This is the correct way to satisfy the backend's double-submit cookie
 * pattern when proxying from Next.js API routes.
 */
async function fetchFreshCsrfToken(authHeaderValue: string | null): Promise<{ token: string; cookie: string } | null> {
  try {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    }
    if (authHeaderValue) {
      headers['Authorization'] = authHeaderValue
    }

    // Make a lightweight GET to the backend to trigger CSRF token generation.
    // We use the director-permissions base endpoint, but any GET endpoint works.
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
        // Keep the full cookie for forwarding
        fullCookieString = `CSRF-TOKEN=${match[1]}`
        break
      }
    }

    // If we couldn't get from getSetCookie, try the raw set-cookie header
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
    console.error('[director-permissions] Failed to fetch fresh CSRF token:', error)
    return null
  }
}

/**
 * Helper: build headers for proxying mutating requests to the backend.
 * Fetches a fresh CSRF token from the backend first, then constructs headers
 * with matching X-CSRF-Token header and CSRF-TOKEN cookie to satisfy the
 * backend's double-submit cookie validation.
 */
async function buildMutatingHeaders(
  request: NextRequest,
  freshCsrf: { token: string; cookie: string } | null
): Promise<Record<string, string>> {
  const headers = forwardAuthHeaders(request)
  headers['Accept'] = 'application/json'

  if (freshCsrf) {
    // Use the fresh CSRF token from the backend GET response
    headers['X-CSRF-Token'] = freshCsrf.token
    headers['X-Requested-With'] = 'XMLHttpRequest'

    // Build cookie header: replace or add the CSRF-TOKEN cookie
    const existingCookies = request.headers.get('cookie') || ''

    // Remove any existing CSRF-TOKEN cookie from the forwarded cookies
    const filteredCookies = existingCookies
      .split(';')
      .map(c => c.trim())
      .filter(c => {
        const name = c.split('=')[0]?.trim().toUpperCase()
        return name !== 'CSRF-TOKEN' && name !== 'X-CSRF-TOKEN'
      })
      .join('; ')

    // Append the fresh CSRF cookie
    headers['Cookie'] = filteredCookies
      ? `${filteredCookies}; ${freshCsrf.cookie}`
      : freshCsrf.cookie
  } else {
    // Fallback: forward whatever CSRF info came from the client
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
 * GET /api/director-permissions/[directorUserId] - Get permissions for a specific director
 */
export async function GET(
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

    const headers = forwardAuthHeaders(request)
    headers['Accept'] = 'application/json'

    const backendUrl = `${API_BASE}/director-permissions/${directorUserId}`

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers,
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error(`[api/director-permissions/${directorUserId}] Backend error:`, response.status, errorText)
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to fetch director permissions: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error(`[api/director-permissions] Error:`, error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/director-permissions/[directorUserId] - Update permissions for a director
 *
 * CSRF FIX: Before forwarding the PUT to the backend, we make a GET request
 * to obtain a fresh CSRF token. The backend generates a new token on every GET
 * and validates that the X-CSRF-Token header matches the CSRF-TOKEN cookie on
 * every PUT. By fetching a fresh token and using it for both, we guarantee
 * the double-submit cookie check passes.
 */
export async function PUT(
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

    const body = await request.json()
    const authHeaderValue = getAuthHeader(request)

    // Step 1: Fetch a fresh CSRF token from the backend
    const freshCsrf = await fetchFreshCsrfToken(authHeaderValue)

    // Step 2: Build headers with the fresh CSRF token
    const headers = await buildMutatingHeaders(request, freshCsrf)

    const backendUrl = `${API_BASE}/director-permissions/${directorUserId}`

    // Step 3: Forward the PUT request with matching CSRF header + cookie
    const response = await fetch(backendUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error(`[api/director-permissions/${directorUserId}] PUT error:`, response.status, errorText)
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to update director permissions: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error(`[api/director-permissions] PUT Error:`, error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    )
  }
}