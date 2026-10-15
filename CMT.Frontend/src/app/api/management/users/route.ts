// If running in the browser, disable all console logging from this file.
if (typeof window !== 'undefined') {
  console.log = () => {};
}

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, forwardAuthHeaders } from '@/lib/serverAuth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

export async function GET(request: NextRequest) {
  try {
    // Check if user has required role for user management
    const user = await requireRole(request, [
      'team_leader', 'teamleader', 'director', 'shop_tl', 'shoptl', 'shop-tl', 'manager',
      'shop_manager', 'shopmanager',
      '4', '5', '6', '7', '8'
    ])
    
    console.log('[api/management/users] User authorized:', { 
      userId: user.user_id || user.userId, 
      role: user.role || user.role_name,
      shopId: user.shop_id
    })

    // Forward request to backend API
    const headers = forwardAuthHeaders(request)
    let backendUrl = `${API_BASE}/users`
    
    // Route to appropriate endpoint based on user role
    const userRole = (user.role || user.role_name || '').toLowerCase()
    const currentUserId = user.user_id || user.userId
    
    if (userRole === 'shop_tl' || userRole === 'shoptl' || userRole === 'shop-tl') {
      // For shop_tl users, get users they created
      if (currentUserId) {
        backendUrl = `${API_BASE}/users/created-by-shop-tl/${currentUserId}`
      } else {
        return NextResponse.json([])
      }
    } else if (userRole === 'shop_manager') {
      // For shop_manager users:
      // If they have a shop, use the main endpoint (backend scopes by shop + creator)
      // If they do NOT have a shop, fall back to fetching users they created via
      // a query that doesn't require ShopId — we call the admin-level endpoint
      // with their userId so the backend can filter by CreatedByUserId.
      if (currentUserId) {
        if (user.shop_id) {
          // Has a shop — backend GetAllUsers() will scope by shop + creator
          backendUrl = `${API_BASE}/users`
          console.log('[api/management/users] Shop Manager (with shop) - getting users via main endpoint')
        } else {
          // No shop assigned — avoid the main /users endpoint which returns 403.
          // Instead, call the admin endpoint that lists all users, then we'll
          // filter client-side by createdByUserId. But that endpoint may also be
          // restricted. A safer approach: call /users/subordinates/{id} or a
          // custom query. Since the backend doesn't have a dedicated
          // "users-created-by/{id}" endpoint for shop_manager, we'll try the
          // main endpoint first and if it 403s, return an empty list with a
          // helpful message.
          console.log('[api/management/users] Shop Manager (NO shop) - attempting main endpoint with fallback')
          
          const response = await fetch(`${API_BASE}/users`, {
            method: 'GET',
            headers,
            cache: 'no-store'
          })
          
          if (response.ok) {
            const data = await response.json()
            return NextResponse.json(data)
          }
          
          // If 403 due to no shop, return empty array instead of error
          // so the page renders gracefully with a "no users" message
          if (response.status === 403) {
            console.log('[api/management/users] Shop Manager has no shop assigned - returning empty list')
            return NextResponse.json([])
          }
          
          // Other errors — pass through
          const errorText = await response.text().catch(() => 'Unknown error')
          console.error('[api/management/users] Backend error:', response.status, errorText)
          return NextResponse.json(
            { error: 'Backend error', message: `Failed to fetch users: ${response.status} ${response.statusText}` },
            { status: response.status }
          )
        }
      } else {
        return NextResponse.json([])
      }
    } else if (userRole === 'manager') {
      // For manager users, get users they manage
      if (currentUserId) {
        backendUrl = `${API_BASE}/users/managed-by-manager/${currentUserId}`
      } else {
        return NextResponse.json([])
      }
    }
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers,
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('[api/management/users] Backend error:', response.status, errorText)
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to fetch users: ${response.status} ${response.statusText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    
    return NextResponse.json(data)
  } catch (error: any) {
    console.error('[api/management/users] Error:', error?.message || error)
    
    // Handle AuthError thrown by requireRole
    if (error?.name === 'AuthError' || (error?.status && error?.body)) {
      return NextResponse.json(
        error.body || { error: 'unauthorized', message: error.message || 'Authentication failed' },
        { status: error.status || 401 }
      )
    }
    
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

export async function POST(request: NextRequest) {
  try {
    // Check if user has required role for user creation
    const user = await requireRole(request, [
      'team_leader', 'teamleader', 'director', 'shop_tl', 'shoptl', 'shop-tl', 'manager',
      'shop_manager', 'shopmanager',
      '4', '5', '6', '7', '8'
    ])
    
   console.log('[api/management/users] User authorized for creation:', { 
      userId: user.user_id || user.userId, 
      role: user.role || user.role_name,
      shopId: user.shop_id
    })

    // Get request body
    const body = await request.json()
    console.log('[api/management/users] Create user request:', { 
      fullName: body.fullName, 
      username: body.username, 
      role: body.role,
      requestedShopId: body.shopId,
      requestedManagerId: body.managerId
    })

    // Role-based restrictions
    const userRole = (user.role || user.role_name || '').toLowerCase()
    const currentUserId = user.user_id || user.userId
    
    if (userRole === 'shop_tl' || userRole === 'shoptl' || userRole === 'shop-tl') {
      // Shop TL can only create users for their own shop
      if (!user.shop_id) {
        return NextResponse.json(
          { error: 'Access denied', message: 'Shop TL must be assigned to a shop to create users' },
          { status: 403 }
        )
      }
      
      // Shop TL can only create customer_personnel role
      if (body.role !== 'customer_personnel') {
        return NextResponse.json(
          { error: 'Access denied', message: 'Shop TL can only create Customer Personnel role' },
          { status: 403 }
        )
      }
      
      // Force the new user to be assigned to the shop_tl's shop
      body.shopId = user.shop_id
    } else if (userRole === 'shop_manager') {
      // Shop Manager can only create customer_personnel, engineer, and customer roles
      const shopManagerAllowedRoles = ['customer_personnel', 'engineer', 'customer']
      if (!shopManagerAllowedRoles.includes(body.role)) {
        return NextResponse.json(
          { error: 'Access denied', message: 'Shop Manager can only create Customer Personnel, Engineer, or Customer roles' },
          { status: 403 }
        )
      }
      
      // If Shop Manager has a shop, force assignment to their shop
      // If Shop Manager has NO shop, still allow creation — the backend will
      // handle the user without a shop assignment, or we pass shopId as null.
      // This allows shop_managers who haven't been assigned a shop yet to still
      // create users (the admin/team_leader can assign the shop later).
      if (user.shop_id) {
        body.shopId = user.shop_id
        console.log('[api/management/users] Shop Manager - forcing shop assignment to:', user.shop_id)
      } else {
        // No shop assigned to this shop_manager — don't block creation.
        // Pass shopId as null/undefined so the backend creates the user without a shop.
        // The backend's CreateUser for shop_manager also checks ShopId, so we need
        // to let it through. Remove shopId enforcement here.
        console.log('[api/management/users] Shop Manager has no shop - creating user without shop assignment')
        // Don't set body.shopId — leave it as whatever the form sent (likely null/undefined)
      }
    } else if (userRole === 'manager') {
      // Manager can only create specific roles
      const allowedRoles = ['team_leader', 'shop_tl', 'engineer', 'shop_manager']
      if (!allowedRoles.includes(body.role)) {
        return NextResponse.json(
          { error: 'Access denied', message: 'Manager can only create Team Leader, Shop TL, Engineer, or Shop Manager roles' },
          { status: 403 }
        )
      }
      
      // Auto-assign manager to the new user
      body.managerId = currentUserId
    }

    // Forward request to backend API
    const headers = forwardAuthHeaders(request)
    headers['Content-Type'] = 'application/json'
    
    const backendUrl = `${API_BASE}/users`
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        FullName: body.fullName,
        Username: body.username,
        Email: body.email,
        Password: body.password,
        Role: body.role,
        ShopId: body.shopId || null,
        SupervisorId: body.supervisorId,
        ManagerId: body.managerId,
        PersonnelType: body.personnelType,
        IsActive: body.isActive !== undefined ? body.isActive : true
      }),
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('[api/management/users] Backend create error:', response.status, errorText)
      
      // Try to parse error as JSON for better error messages
      try {
        const errorJson = JSON.parse(errorText)
        return NextResponse.json(errorJson, { status: response.status })
      } catch {
        return NextResponse.json(
          { error: 'Backend error', message: errorText || `Failed to create user: ${response.status}` },
          { status: response.status }
        )
      }
    }

    const data = await response.json()
    
    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    console.error('[api/management/users] Create error:', error?.message || error)
    
    // Handle AuthError thrown by requireRole
    if (error?.name === 'AuthError' || (error?.status && error?.body)) {
      return NextResponse.json(
        error.body || { error: 'unauthorized', message: error.message || 'Authentication failed' },
        { status: error.status || 401 }
      )
    }
    
    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ error: 'unauthorized', message: 'requireRole failed' }))
      return NextResponse.json(errorData, { status: error.status })
    }
    
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to create user' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    // Check if user has required role for user update
    const user = await requireRole(request, [
      'team_leader', 'teamleader', 'director', 'shop_tl', 'shoptl', 'shop-tl', 'manager',
      'shop_manager', 'shopmanager',
      '4', '5', '6', '7', '8'
    ])
    
    const body = await request.json()
    const userId = body.userId || body.user_id || body.id
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Bad request', message: 'User ID is required' },
        { status: 400 }
      )
    }
    
    console.log('[api/management/users] User authorized for update:', { 
      userId: user.user_id || user.userId, 
      role: user.role || user.role_name,
      shopId: user.shop_id,
      targetUserId: userId
    })

    // Role-based restrictions
    const userRole = (user.role || user.role_name || '').toLowerCase()
    const currentUserId = user.user_id || user.userId
    
    if (userRole === 'shop_tl' || userRole === 'shoptl' || userRole === 'shop-tl') {
      if (!user.shop_id) {
        return NextResponse.json(
          { error: 'Access denied', message: 'Shop TL must be assigned to a shop' },
          { status: 403 }
        )
      }
      
      // Shop TL cannot change role
      if (body.role) {
        return NextResponse.json(
          { error: 'Access denied', message: 'Shop TL cannot change user roles' },
          { status: 403 }
        )
      }
      
      // Shop TL cannot change shop assignment
      if (body.shopId && body.shopId !== user.shop_id) {
        return NextResponse.json(
          { error: 'Access denied', message: 'Shop TL cannot change shop assignment' },
          { status: 403 }
        )
      }
      
      // Force shop to remain the same
      body.shopId = user.shop_id
    } else if (userRole === 'shop_manager') {
      // Shop Manager cannot change roles
      if (body.role) {
        return NextResponse.json(
          { error: 'Access denied', message: 'Shop Manager cannot change user roles' },
          { status: 403 }
        )
      }
      
      // Shop Manager cannot change shop assignment (if they have a shop)
      if (body.shopId && user.shop_id && body.shopId !== user.shop_id) {
        return NextResponse.json(
          { error: 'Access denied', message: 'Shop Manager cannot change shop assignment' },
          { status: 403 }
        )
      }
      
      // Force shop to remain the same (only if shop_manager has a shop)
      if (user.shop_id) {
        body.shopId = user.shop_id
      }
    } else if (userRole === 'manager') {
      // Manager cannot change certain roles
      const allowedRoles = ['team_leader', 'shop_tl', 'engineer', 'shop_manager']
      if (body.role && !allowedRoles.includes(body.role)) {
        return NextResponse.json(
          { error: 'Access denied', message: 'Manager can only assign Team Leader, Shop TL, Engineer, or Shop Manager roles' },
          { status: 403 }
        )
      }
      
      // Manager cannot change manager assignment
      if (body.managerId && body.managerId !== currentUserId) {
        return NextResponse.json(
          { error: 'Access denied', message: 'Manager cannot change manager assignment' },
          { status: 403 }
        )
      }
    }

    // Forward request to backend API
    const headers = forwardAuthHeaders(request)
    headers['Content-Type'] = 'application/json'
    
    const backendUrl = `${API_BASE}/users/${userId}`
    
    const response = await fetch(backendUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        FullName: body.fullName,
        Username: body.username,
        Email: body.email,
        Role: body.role,
        ShopId: body.shopId,
        SupervisorId: body.supervisorId,
        ManagerId: body.managerId,
        PersonnelType: body.personnelType,
        IsActive: body.isActive,
        NewPassword: body.password
      }),
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('[api/management/users] Backend update error:', response.status, errorText)
      
      // Try to parse error as JSON
      try {
        const errorJson = JSON.parse(errorText)
        return NextResponse.json(errorJson, { status: response.status })
      } catch {
        return NextResponse.json(
          { error: 'Backend error', message: errorText || `Failed to update user: ${response.status}` },
          { status: response.status }
        )
      }
    }

    const data = await response.json()
    return NextResponse.json(data)
    
  } catch (error: any) {
    console.error('[api/management/users] Update error:', error?.message || error)
    
    // Handle AuthError thrown by requireRole
    if (error?.name === 'AuthError' || (error?.status && error?.body)) {
      return NextResponse.json(
        error.body || { error: 'unauthorized', message: error.message || 'Authentication failed' },
        { status: error.status || 401 }
      )
    }
    
    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ error: 'unauthorized', message: 'requireRole failed' }))
      return NextResponse.json(errorData, { status: error.status })
    }
    
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to update user' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Check if user has required role for user deletion
    const user = await requireRole(request, [
      'team_leader', 'teamleader', 'director', 'manager', 'admin',
      'shop_manager', 'shopmanager',
      '4', '5', '6', '7', '8'
    ])
    
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('id')
    
    if (!userId) {
      return NextResponse.json(
        { error: 'Bad request', message: 'User ID is required' },
        { status: 400 }
      )
    }
    
    console.log('[api/management/users] User authorized for deletion:', { 
      userId: user.user_id || user.userId, 
      role: user.role || user.role_name,
      shopId: user.shop_id,
      targetUserId: userId
    })

    // Role-based delete restrictions
    const userRole = (user.role || user.role_name || '').toLowerCase()
    const permissionGrantedByAdmin = request.headers.get('x-permission-granted') === 'delete_user'
    
    if (!permissionGrantedByAdmin) {
      if (userRole === 'shop_tl' || userRole === 'shoptl' || userRole === 'shop-tl') {
        console.log('[api/management/users] Shop TL attempted to delete user without admin-granted permission - DENIED')
        return NextResponse.json(
          { error: 'Access denied', message: 'Shop TL does not have permission to delete users. Contact your administrator to grant this permission.' },
          { status: 403 }
        )
      }
    } else {
      console.log('[api/management/users] Delete permission granted by admin role matrix for role:', userRole)
    }

    if (userRole === 'manager') {
      // Manager restrictions are enforced by the backend
    }

    // Forward request to backend API
    const headers = forwardAuthHeaders(request)
    const backendUrl = `${API_BASE}/users/${userId}`
    
    console.log('[api/management/users] Forwarding DELETE to backend:', backendUrl)
    
    const response = await fetch(backendUrl, {
      method: 'DELETE',
      headers,
      cache: 'no-store'
    })

    console.log('[api/management/users] Backend DELETE response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('[api/management/users] Backend delete error:', response.status, errorText)
      
      try {
        const errorJson = JSON.parse(errorText)
        return NextResponse.json(errorJson, { status: response.status })
      } catch {
        return NextResponse.json(
          { error: 'Backend error', message: errorText || `Failed to delete user: ${response.status}` },
          { status: response.status }
        )
      }
    }

    if (response.status === 204) {
      return NextResponse.json({ message: 'User deleted successfully' })
    }

    try {
      const data = await response.json()
      return NextResponse.json(data.message ? data : { message: 'User deleted successfully' })
    } catch {
      return NextResponse.json({ message: 'User deleted successfully' })
    }
  } catch (error: any) {
    console.error('[api/management/users] Delete error:', error?.message || error)
    
    if (error?.name === 'AuthError' || (error?.status && error?.body)) {
      return NextResponse.json(
        error.body || { error: 'unauthorized', message: error.message || 'Authentication failed' },
        { status: error.status || 401 }
      )
    }
    
    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ error: 'unauthorized', message: 'requireRole failed' }))
      return NextResponse.json(errorData, { status: error.status })
    }
    
    return NextResponse.json(
      { error: 'Internal server error', message: error?.message || 'Failed to delete user' },
      { status: 500 }
    )
  }
}