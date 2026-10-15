import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/serverAuth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/**
 * Proxy fetch that forwards auth headers, CSRF token, and cookies from incoming request
 * Matches the pattern used by working admin routes
 */
async function proxyFetchUrl(url: string, incomingReq: NextRequest, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  // Forward Authorization header
  const auth = incomingReq.headers.get('authorization')
  if (auth) {
    headers['Authorization'] = auth
  } else {
    const cookie = incomingReq.headers.get('cookie')
    if (cookie) {
      const tokenMatch = cookie.match(/(?:^|;\s*)(?:auth_token|authToken|access_token)=([^;]+)/)
      if (tokenMatch) {
        const token = decodeURIComponent(tokenMatch[1])
        headers['Authorization'] = `Bearer ${token}`
      }
    }
  }

  // Forward CSRF token for POST/PUT/PATCH/DELETE requests
  const method = (options.method || 'GET').toUpperCase()
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrfToken = incomingReq.headers.get('x-csrf-token') || 
                     incomingReq.headers.get('X-CSRF-Token') ||
                     incomingReq.headers.get('csrf-token')
    
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
      headers['X-Requested-With'] = 'XMLHttpRequest'
    } else {
      const cookie = incomingReq.headers.get('cookie')
      if (cookie) {
        const csrfMatch = cookie.match(/(?:^|;\s*)(?:CSRF-TOKEN|X-CSRF-TOKEN|csrf-token)=([^;]+)/)
        if (csrfMatch) {
          const cookieCsrfToken = decodeURIComponent(csrfMatch[1])
          headers['X-CSRF-Token'] = cookieCsrfToken
          headers['X-Requested-With'] = 'XMLHttpRequest'
        }
      }
    }
    
    // Forward all cookies to backend
    const allCookies = incomingReq.headers.get('cookie')
    if (allCookies) {
      headers['Cookie'] = allCookies
    }
  }

  try {
    const res = await fetch(url, { 
      method: options.method || 'GET',
      headers: { ...headers, ...options.headers },
      body: options.body,
      credentials: 'include',
      cache: 'no-store'
    })
    
    const ct = res.headers.get('content-type') || ''
    const isJson = ct.includes('application/json')
    const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null)
    
    if (!res.ok) {
      console.error('[api/departments/[id]] Backend error response:', { status: res.status, body })
      return { ok: false, status: res.status, body, endpoint: url }
    }
    
    return { ok: true, status: res.status, body, endpoint: url }
  } catch (error) {
    console.error('[api/departments/[id]] Network error:', error)
    return { ok: false, status: 0, body: String(error), endpoint: url }
  }
}

/**
 * PUT /api/departments/[id] - Update a department
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const departmentId = id
    //console.log('[api/departments/[id]] PUT request received for department:', departmentId)
    
    // Only directors and managers can update departments
    await requireRole(request, [
      'director', 'manager',
      '6', '7'
    ])
    //console.log('[api/departments/[id]] Authorization successful')

    // Get request body
    const body = await request.json()

    // Prepare payload for backend
    const payload = {
      Name: body.name,
      Description: body.description
    }

    const backendUrl = `${API_BASE}/departments/${departmentId}`
    const result = await proxyFetchUrl(backendUrl, request, {
      method: 'PUT',
      body: JSON.stringify(payload)
    })

    if (result.ok) {
      //console.log('[api/departments/[id]] Successfully updated department')
      return NextResponse.json(result.body, { status: 200 })
    } else {
      console.error('[api/departments/[id]] Backend update failed:', result)
      
      if (result.body && typeof result.body === 'object') {
        return NextResponse.json(result.body, { status: result.status || 500 })
      } else {
        return NextResponse.json(
          { error: 'Backend error', message: result.body || `Failed to update department: ${result.status}` },
          { status: result.status || 500 }
        )
      }
    }
  } catch (error) {
    console.error('[api/departments/[id]] Update error:', error)
    
    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ error: 'unauthorized', message: 'requireRole failed' }))
      return NextResponse.json(errorData, { status: error.status })
    }
    
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to update department' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/departments/[id] - Delete a department
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const departmentId = id
    //console.log('[api/departments/[id]] DELETE request received for department:', departmentId)
    
    // Only directors and managers can delete departments
    await requireRole(request, [
      'director', 'manager',
      '6', '7'
    ])
    //console.log('[api/departments/[id]] Authorization successful')

    const backendUrl = `${API_BASE}/departments/${departmentId}`
    const result = await proxyFetchUrl(backendUrl, request, {
      method: 'DELETE'
    })

    if (result.ok) {
      //console.log('[api/departments/[id]] Successfully deleted department')
      return NextResponse.json({ message: 'Department deleted successfully' })
    } else {
      console.error('[api/departments/[id]] Backend delete failed:', result)
      
      if (result.body && typeof result.body === 'object') {
        return NextResponse.json(result.body, { status: result.status || 500 })
      } else {
        return NextResponse.json(
          { error: 'Backend error', message: result.body || `Failed to delete department: ${result.status}` },
          { status: result.status || 500 }
        )
      }
    }
  } catch (error) {
    console.error('[api/departments/[id]] Delete error:', error)
    
    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ error: 'unauthorized', message: 'requireRole failed' }))
      return NextResponse.json(errorData, { status: error.status })
    }
    
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to delete department' },
      { status: 500 }
    )
  }
}