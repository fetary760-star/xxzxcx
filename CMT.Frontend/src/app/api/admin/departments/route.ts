import { NextRequest, NextResponse } from 'next/server'
import { requireRole, forwardAuthHeaders } from '@/lib/serverAuth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/**
 * GET /api/admin/departments - Get all departments (admin endpoint)
 */
export async function GET(request: NextRequest) {
  try {
    //('[api/admin/departments] GET request received')
    
    // Require admin-level roles
    const user = await requireRole(request, [
      'director', 'manager',
      '6', '7'
    ])
    
    //('[api/admin/departments] User authorized:', { 
     // userId: user.user_id || user.userId, 
      //role: user.role || user.role_name
    //})

    // Forward request to backend API
    const headers = forwardAuthHeaders(request)
    const backendUrl = `${API_BASE}/departments`
    
    //('[api/admin/departments] Forwarding to backend:', backendUrl)
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers,
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('[api/admin/departments] Backend error:', response.status, errorText)
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to fetch departments: ${response.status} ${response.statusText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    //('[api/admin/departments] Successfully fetched', Array.isArray(data) ? data.length : 'unknown', 'departments')
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('[api/admin/departments] Error:', error)
    
    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ error: 'unauthorized', message: 'requireRole failed' }))
      return NextResponse.json(errorData, { status: error.status })
    }
    
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    )
  }
}