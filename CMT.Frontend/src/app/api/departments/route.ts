import { NextRequest, NextResponse } from 'next/server'
import { requireRole, forwardAuthHeaders } from '@/lib/serverAuth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/**
 * GET /api/departments - Get all departments
 */
export async function GET(request: NextRequest) {
  try {
    //console.log('[api/departments] GET request received')
    
    // Require authentication - allow all authenticated users to view departments
    const user = await requireRole(request, [
      'team_leader', 'teamleader', 'director', 'shop_tl', 'shoptl', 'shop-tl', 'manager', 'shop_manager', 'engineer', 'customer_personnel', 'admin', 'administrator',
      '1', '2', '3', '4', '5', '6', '7', '8'
    ])
    
    //console.log('[api/departments] User authorized:', { 
      //userId: user.user_id || user.userId, 
      //role: user.role || user.role_name
    //})

    // Forward request to backend API
    const headers = forwardAuthHeaders(request)
    const backendUrl = `${API_BASE}/departments`
    
    //console.log('[api/departments] Forwarding to backend:', backendUrl)
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers,
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('[api/departments] Backend error:', response.status, errorText)
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to fetch departments: ${response.status} ${response.statusText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    //console.log('[api/departments] Successfully fetched', Array.isArray(data) ? data.length : 'unknown', 'departments')
    
    return NextResponse.json(data)
  } catch (error) {
    console.error('[api/departments] Error:', error)
    
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

/**
 * POST /api/departments - Create a new department
 */
export async function POST(request: NextRequest) {
  try {
    //console.log('[api/departments] POST request received')
    
    // Only directors and managers can create departments
    const user = await requireRole(request, [
      'director', 'manager',
      '6', '7'
    ])
    
    //console.log('[api/departments] User authorized for creation:', { 
      //userId: user.user_id || user.userId, 
      //role: user.role || user.role_name
    //})

    // Get request body
    const body = await request.json()
    //console.log('[api/departments] Create department request:', { 
      //name: body.name,
      //description: body.description
    //})

    // Forward request to backend API with CSRF token
    const headers = forwardAuthHeaders(request)
    headers['Content-Type'] = 'application/json'
    
    // Get CSRF token from request headers or cookies
    const csrfToken = request.headers.get('x-csrf-token') || 
                     request.headers.get('X-CSRF-Token') ||
                     request.cookies.get('CSRF-TOKEN')?.value ||
                     request.cookies.get('X-CSRF-TOKEN')?.value
    
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }
    
    const backendUrl = `${API_BASE}/departments`
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        Name: body.name,
        Description: body.description
      }),
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('[api/departments] Backend create error:', response.status, errorText)
      
      try {
        const errorJson = JSON.parse(errorText)
        return NextResponse.json(errorJson, { status: response.status })
      } catch {
        return NextResponse.json(
          { error: 'Backend error', message: errorText || `Failed to create department: ${response.status}` },
          { status: response.status }
        )
      }
    }

    const data = await response.json()
    //console.log('[api/departments] Successfully created department')
    
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    console.error('[api/departments] Create error:', error)
    
    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ error: 'unauthorized', message: 'requireRole failed' }))
      return NextResponse.json(errorData, { status: error.status })
    }
    
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to create department' },
      { status: 500 }
    )
  }
}