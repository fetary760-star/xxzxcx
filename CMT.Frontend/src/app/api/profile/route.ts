import { NextRequest, NextResponse } from 'next/server'

const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
).trim().replace(/\/+$/, '')

/**
 * Resolve a valid JWT for the outgoing backend request.
 *
 * FIX (401 Unauthorized on /api/profile):
 * The client was sending literally `Authorization: Bearer null` when the
 * in-memory token was not yet hydrated. That value passed the previous
 * `if (!authHeader)` existence check and was forwarded to the backend,
 * which correctly rejected it with 401.
 *
 * We now:
 *   1. Sanitize the Authorization header (reject "Bearer null",
 *      "Bearer undefined", "Bearer ", empty scheme, etc.).
 *   2. Fall back to the httpOnly-friendly cookies (`auth_token`,
 *      `authToken`, `token`, `accessToken`) that the login flow sets.
 *   3. Return 401 only when NO usable token can be resolved from either
 *      source.
 */
function resolveBearerToken(request: NextRequest): string | null {
  const rawHeader = request.headers.get('authorization') || request.headers.get('Authorization')

  if (rawHeader) {
    const trimmed = rawHeader.trim()
    const match = /^Bearer\s+(.+)$/i.exec(trimmed)
    if (match) {
      const candidate = match[1].trim()
      if (
        candidate &&
        candidate.toLowerCase() !== 'null' &&
        candidate.toLowerCase() !== 'undefined'
      ) {
        return candidate
      }
    }
  }

  // Cookie-based fallback — these are set by the login flow.
  const cookieToken =
    request.cookies.get('auth_token')?.value ||
    request.cookies.get('authToken')?.value ||
    request.cookies.get('token')?.value ||
    request.cookies.get('accessToken')?.value ||
    null

  if (cookieToken && cookieToken.toLowerCase() !== 'null' && cookieToken.toLowerCase() !== 'undefined') {
    return cookieToken
  }

  return null
}

/**
 * Forward the request cookies to the backend as well, so cookie-based
 * auth (in addition to Bearer) keeps working if the backend is
 * configured to accept either.
 */
function buildForwardedCookieHeader(request: NextRequest): string {
  return request.cookies
    .getAll()
    .map(c => `${c.name}=${c.value}`)
    .join('; ')
}

export async function GET(request: NextRequest) {
  try {
    const token = resolveBearerToken(request)
    if (!token) {
      return NextResponse.json(
        { error: 'Authorization token missing or invalid' },
        { status: 401 }
      )
    }

    const response = await fetch(`${API_BASE}/profile/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        Cookie: buildForwardedCookieHeader(request),
      },
      cache: 'no-store',
    })

    const contentType = response.headers.get('content-type') || ''
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : await response.text().catch(() => '')

    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Failed to fetch profile',
          status: response.status,
          details: payload,
        },
        { status: response.status }
      )
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('[Profile API] GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const token = resolveBearerToken(request)
    if (!token) {
      return NextResponse.json(
        { error: 'Authorization token missing or invalid' },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => ({}))

    const response = await fetch(`${API_BASE}/profile/me`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Cookie: buildForwardedCookieHeader(request),
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })

    const contentType = response.headers.get('content-type') || ''
    const payload = contentType.includes('application/json')
      ? await response.json().catch(() => ({}))
      : await response.text().catch(() => '')

    if (!response.ok) {
      return NextResponse.json(
        {
          error: 'Failed to update profile',
          status: response.status,
          details: payload,
        },
        { status: response.status }
      )
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('[Profile API] PUT error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}