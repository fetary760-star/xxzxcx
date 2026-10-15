import { NextRequest, NextResponse } from 'next/server'

const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
).trim().replace(/\/+$/, '')

/**
 * Resolve a valid JWT bearer token from the request.
 * Priority: Authorization header (if valid) > cookies.
 * Rejects literal "null" / "undefined" / empty tokens.
 */
function resolveBearerToken(request: NextRequest): string | null {
  const rawHeader = request.headers.get('authorization') || request.headers.get('Authorization')

  if (rawHeader) {
    const match = /^Bearer\s+(.+)$/i.exec(rawHeader.trim())
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

  // Cookie-based fallback
  const cookieToken =
    request.cookies.get('auth_token')?.value ||
    request.cookies.get('authToken')?.value ||
    request.cookies.get('access_token')?.value ||
    request.cookies.get('token')?.value ||
    request.cookies.get('accessToken')?.value ||
    null

  if (cookieToken && cookieToken.toLowerCase() !== 'null' && cookieToken.toLowerCase() !== 'undefined') {
    return cookieToken
  }

  return null
}

/**
 * Get CSRF token from request header or cookies
 */
function getCsrfToken(request: NextRequest): string | null {
  // Check header first
  const headerToken = request.headers.get('X-CSRF-Token') || request.headers.get('x-csrf-token')
  if (headerToken) return headerToken

  // Then cookies
  const csrfCookie =
    request.cookies.get('CSRF-TOKEN')?.value ||
    request.cookies.get('csrf-token')?.value ||
    request.cookies.get('X-CSRF-TOKEN')?.value ||
    null

  return csrfCookie
}

/**
 * Build cookie string from request cookies to forward to backend
 */
function buildCookieString(request: NextRequest): string {
  const cookieNames = ['CSRF-TOKEN', 'csrf-token', 'auth_token', 'authToken', 'access_token', 'refresh_token']
  const cookies: string[] = []

  for (const name of cookieNames) {
    const cookie = request.cookies.get(name)
    if (cookie) {
      cookies.push(`${name}=${cookie.value}`)
    }
  }

  return cookies.join('; ')
}

export async function POST(request: NextRequest) {
  try {
    // AUTH FIX: resolve token from header OR cookies (same pattern as /api/profile)
    const token = resolveBearerToken(request)
    if (!token) {
      return NextResponse.json(
        { error: 'Authorization token missing or invalid' },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Create a new FormData for the backend
    const backendFormData = new FormData()

    // Convert the file to a Blob and append it with the exact parameter name the backend expects
    const fileBlob = new Blob([await file.arrayBuffer()], { type: file.type })
    backendFormData.append('file', fileBlob, file.name)

    // Get CSRF token
    const csrfToken = getCsrfToken(request)

    // Build cookie string to forward to backend
    const cookieString = buildCookieString(request)

    // Build headers for backend request
    const backendHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      // Don't set Content-Type header - let fetch set it with boundary for multipart/form-data
    }

    // Add CSRF token header if available
    if (csrfToken) {
      backendHeaders['X-CSRF-Token'] = csrfToken
    }

    // Forward cookies to backend
    if (cookieString) {
      backendHeaders['Cookie'] = cookieString
    }

    const response = await fetch(`${API_BASE}/profile/me/profile-picture`, {
      method: 'POST',
      headers: backendHeaders,
      body: backendFormData,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('[Upload Picture] Backend error:', response.status, errorData)
      return NextResponse.json(
        { error: errorData.message || errorData.error || 'Failed to upload profile picture' },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[Upload Picture] API error:', error)
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error.message,
      },
      { status: 500 }
    )
  }
}