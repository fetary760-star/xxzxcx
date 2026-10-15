import { NextRequest, NextResponse } from 'next/server'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/**
 * GET /api/director-permissions/[directorUserId]/check/[permissionName] - Check specific permission
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ directorUserId: string; permissionName: string }> }
) {
  try {
    const { directorUserId, permissionName } = await params

    if (!directorUserId || !permissionName) {
      return NextResponse.json(
        { error: 'Director User ID and permission name are required' },
        { status: 400 }
      )
    }

    const authHeader = request.headers.get('authorization')
    const cookieHeader = request.headers.get('cookie')
    const headers: HeadersInit = { 'Accept': 'application/json' }
    if (authHeader) headers['Authorization'] = authHeader
    if (cookieHeader) headers['Cookie'] = cookieHeader

    const backendUrl = `${API_BASE}/director-permissions/${directorUserId}/check/${permissionName}`

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers,
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error(`[api/director-permissions/${directorUserId}/check/${permissionName}] Backend error:`, response.status, errorText)
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to check permission: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error(`[api/director-permissions/check] Error:`, error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    )
  }
}