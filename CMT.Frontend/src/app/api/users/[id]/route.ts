import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireRole } from '@/lib/serverAuth'

/**
 * /api/users/[id]
 *
 * Handle individual user operations (GET, PUT, DELETE)
 * - Enforces authentication via requireRole
 * - Proxies requests to backend API
 */

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/**
 * Proxy fetch that forwards auth headers from incoming request
 */
async function proxyFetchUrl(url: string, incomingReq?: NextRequest, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (incomingReq) {
    // Prioritize Authorization header over cookies
    const auth = incomingReq.headers.get('authorization')
    if (auth) {
      headers['Authorization'] = auth
    } else {
      // Fallback: Extract token from cookies if no Authorization header
      const cookie = incomingReq.headers.get('cookie')
      if (cookie) {
        const tokenMatch = cookie.match(/(?:^|;\s*)(?:auth_token|authToken)=([^;]+)/)
        if (tokenMatch) {
          const token = decodeURIComponent(tokenMatch[1])
          headers['Authorization'] = `Bearer ${token}`
        }
      }
    }

    // CRITICAL FIX: Forward CSRF token from client to backend
    const csrfToken = incomingReq.headers.get('x-csrf-token')
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
      headers['X-Requested-With'] = 'XMLHttpRequest'
      //('Users API: Forwarding CSRF token to backend')
    }

    // Also forward the cookie header to backend (includes CSRF-TOKEN cookie)
    const cookieHeader = incomingReq.headers.get('cookie')
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader
    }
  }

  //('Fetching from:', url)

  try {
    const res = await fetch(url, { 
      method: options.method || 'GET',
      headers: { ...headers, ...options.headers },
      body: options.body,
      credentials: 'include',
      cache: 'no-store'
    })
    
    //('Backend response status:', res.status)
    
    const ct = res.headers.get('content-type') || ''
    const isJson = ct.includes('application/json')
    const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null)
    
    if (!res.ok) {
      console.error('Backend error response:', { status: res.status, body })
      return { ok: false, status: res.status, body, endpoint: url }
    }
    
    return { ok: true, status: res.status, body, endpoint: url }
  } catch (error) {
    console.error('Network error:', error)
    return { ok: false, status: 0, body: String(error), endpoint: url }
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    //('Users API: Processing GET request for user:', id)
    
    // Require authentication - include admin role
    await requireRole(req, ['admin', 'team_leader', 'director', 'engineer', 'manager', 'shop_manager', 'shop_tl'])
    //('Users API: Authorization successful')

    // Fetch user from backend
    const backendUrl = `${API_BASE}/users/${id}`
    const result = await proxyFetchUrl(backendUrl, req)

    if (result.ok) {
     //('Users API: Successfully retrieved user from backend')
      return NextResponse.json(result.body, { status: 200 })
    } else {
      console.error('Users API: Backend failed to retrieve user:', result)
      
      if (result.body && typeof result.body === 'object') {
        return NextResponse.json(result.body, { status: result.status || 500 })
      } else {
        return NextResponse.json({
          message: 'Failed to retrieve user',
          error: result.body || 'Unknown backend error'
        }, { status: result.status || 500 })
      }
    }

  } catch (err: unknown) {
    console.error('Users API: Unexpected error in GET', err)
    if (err instanceof Response) return err
    return NextResponse.json({ 
      message: 'Internal server error',
      error: err instanceof Error ? err.message : 'Unknown error' 
    }, { status: 500 })
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    //('Users API: Processing PUT request for user:', id)
    
    // Require authentication
    await requireRole(req, ['team_leader', 'director', 'shop_tl', 'manager', 'shop_manager'])
    //('Users API: Authorization successful')

    // Validate user ID
    const userId = id
    if (!userId || userId === 'route.ts' || isNaN(Number(userId))) {
      return NextResponse.json({
        message: 'Invalid user ID'
      }, { status: 400 })
    }

    // Parse request body
    const body = await req.json()
    //('Users API: Update request for user:', userId)

    // Prepare payload for backend - FIXED field mapping with personnelType and phoneNumber
    const payload: Record<string, unknown> = {
      Username: body.username,
      Email: body.email,
      FullName: body.fullName,
      PhoneNumber: body.phoneNumber !== undefined ? (body.phoneNumber?.trim() || null) : undefined,
      Role: body.role,
      ShopId: body.shopId && Number(body.shopId) > 0 ? Number(body.shopId) : null,
      SupervisorId: body.supervisorId && Number(body.supervisorId) > 0 ? Number(body.supervisorId) : null,
      ManagerId: body.managerId && Number(body.managerId) > 0 ? Number(body.managerId) : null,
      IsActive: body.isActive !== undefined ? body.isActive : true
    }

    // CRITICAL FIX: Include PersonnelType for customer_personnel role during updates
    if (body.role === 'customer_personnel' && body.personnelType) {
      payload.PersonnelType = body.personnelType.trim()
      //('Users API: Including PersonnelType in update payload:', payload.PersonnelType)
    }

    // CRITICAL FIX: Handle password updates correctly
    // If password is provided, use NewPassword field (not Password)
    if (body.password && body.password.trim()) {
      payload.NewPassword = body.password.trim()
      //('Users API: Password update requested')
    } else if (body.newPassword && body.newPassword.trim()) {
      payload.NewPassword = body.newPassword.trim()
      //('Users API: Password update requested (newPassword field)')
    }

    ('Users API: Sending update to backend:', { 
      ...payload, 
      NewPassword: payload.NewPassword ? '[REDACTED]' : undefined 
    })

    // Send to backend
    const backendUrl = `${API_BASE}/users/${userId}`
    const result = await proxyFetchUrl(backendUrl, req, {
      method: 'PUT',
      body: JSON.stringify(payload)
    })

    if (result.ok) {
      //('Users API: User updated successfully')
      return NextResponse.json(result.body, { status: 200 })
    } else {
      console.error('Users API: Backend failed to update user:', result)
      
      // Return the exact error format from backend
      if (result.body && typeof result.body === 'object') {
        return NextResponse.json(result.body, { status: result.status || 500 })
      } else {
        return NextResponse.json({
          message: 'Failed to update user',
          error: result.body || 'Unknown backend error'
        }, { status: result.status || 500 })
      }
    }

  } catch (err: unknown) {
    console.error('Users API: Unexpected error in PUT', err)
    if (err instanceof Response) return err
    return NextResponse.json({ 
      message: 'Internal server error',
      error: err instanceof Error ? err.message : 'Unknown error' 
    }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    //('Users API: Processing DELETE request for user:', id)
    
    // Require authentication - only directors can delete users
    await requireRole(req, ['director'])
   // ('Users API: Authorization successful')

    // Validate user ID
    const userId = id
    if (!userId || userId === 'route.ts' || isNaN(Number(userId))) {
      return NextResponse.json({
        message: 'Invalid user ID'
      }, { status: 400 })
    }

    // Send to backend
    const backendUrl = `${API_BASE}/users/${userId}`
    const result = await proxyFetchUrl(backendUrl, req, {
      method: 'DELETE'
    })

    if (result.ok) {
      //('Users API: User deleted successfully')
      return new NextResponse(null, { status: 204 })
    } else {
      console.error('Users API: Backend failed to delete user:', result)
      
      if (result.body && typeof result.body === 'object') {
        return NextResponse.json(result.body, { status: result.status || 500 })
      } else {
        return NextResponse.json({
          message: 'Failed to delete user',
          error: result.body || 'Unknown backend error'
        }, { status: result.status || 500 })
      }
    }

  } catch (err: unknown) {
    console.error('Users API: Unexpected error in DELETE', err)
    if (err instanceof Response) return err
    return NextResponse.json({ 
      message: 'Internal server error',
      error: err instanceof Error ? err.message : 'Unknown error' 
    }, { status: 500 })
  }
}