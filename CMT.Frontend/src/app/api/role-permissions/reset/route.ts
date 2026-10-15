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
 * POST /api/role-permissions/reset - Reset role permissions to defaults (Admin only)
 */
export async function POST(request: NextRequest) {
  try {
    const headers = buildMutatingHeaders(request)
    const backendUrl = `${API_BASE}/role-permissions/reset`

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers,
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error(`[api/role-permissions/reset] POST error:`, response.status, errorText)
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to reset role permissions: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error(`[api/role-permissions/reset] POST Error:`, error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    )
  }
}