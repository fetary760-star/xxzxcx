import { NextRequest, NextResponse } from 'next/server'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/**
 * Get all user IDs within a director's assigned departments
 * Used for task filtering to restrict directors to their department scope
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ directorId: string }> }
) {
  try {
    const { directorId } = await params
    
    if (!directorId) {
      return NextResponse.json(
        { error: 'Director ID is required' },
        { status: 400 }
      )
    }

    //(`[api/directors/${directorId}/department-users] Fetching department users`)

    // FIX (refresh cascade): resolve the bearer token from Authorization
    // header, middleware-forwarded x-auth-token header, OR access_token/
    // auth_token/authToken cookie
    const finalAuthHeader = resolveAuthorizationHeader(request)
    const cookie = request.headers.get('cookie')
    const headers: HeadersInit = {
      'Accept': 'application/json'
    }
    
    if (finalAuthHeader) {
      headers['Authorization'] = finalAuthHeader
    }
    if (cookie) {
      headers['Cookie'] = cookie
    }

    const backendUrl = `${API_BASE}/directors/${directorId}/department-users`
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers,
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error(`[api/directors/${directorId}/department-users] Backend error:`, response.status, errorText)
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to fetch department users: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    //(`[api/directors/${directorId}/department-users] Found ${Array.isArray(data) ? data.length : 0} users`)
    
    return NextResponse.json(data)
  } catch (error) {
    console.error(`[api/directors/department-users] Error:`, error)
    
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    )
  }
}