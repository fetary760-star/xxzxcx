import { NextRequest, NextResponse } from 'next/server'
import { forwardAuthHeaders } from '@/lib/serverAuth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/**
 * Helper: build headers for proxying mutating requests to the backend.
 */
function buildMutatingHeaders(request: NextRequest): Record<string, string> {
  const headers = forwardAuthHeaders(request)
  headers['Accept'] = 'application/json'
  headers['Content-Type'] = 'application/json'

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

  return headers
}

/**
 * GET /api/role-permissions - Get the current role permission matrix
 * Any authenticated user can read (they need it to check their own permissions).
 *
 * FIX: Use forwardAuthHeaders() to properly extract the JWT token from cookies
 * and forward it as a Bearer token in the Authorization header. Previously,
 * the handler only forwarded the raw authorization header, but the browser-side
 * fetch in useRolePermissions.ts only sends cookies (credentials: 'include')
 * without an Authorization header, causing a 401 from the backend.
 */
export async function GET(request: NextRequest) {
  try {
    const headers = forwardAuthHeaders(request)
    headers['Accept'] = 'application/json'

    const backendUrl = `${API_BASE}/role-permissions`

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers,
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error(`[api/role-permissions] Backend error:`, response.status, errorText)
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to fetch role permissions: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error(`[api/role-permissions] Error:`, error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/role-permissions - Update the entire role permission matrix (Admin/TeamLeader only)
 */
export async function PUT(request: NextRequest) {
  try {
    const headers = buildMutatingHeaders(request)
    const body = await request.json()
    const backendUrl = `${API_BASE}/role-permissions`

    const response = await fetch(backendUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error(`[api/role-permissions] PUT error:`, response.status, errorText)
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to update role permissions: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error(`[api/role-permissions] PUT Error:`, error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    )
  }
}