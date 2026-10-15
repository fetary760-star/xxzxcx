import { NextResponse } from 'next/server'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

/**
 * API endpoint to get current user's shop information
 * Used by TaskDetails component to populate the "From Shop" field in transfer modal
 */

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/** Try to get user from middleware forwarded header if present */
function getUserFromForwarded(headers: Headers): any | null {
  const j = headers.get('x-user-json')
  if (!j) return null
  try { return JSON.parse(j) } catch { return null }
}

/** If needed, call backend /auth/me to validate token and get user */
async function fetchUserFromBackend(authHeader?: string | null) {
  if (!authHeader) return null
  try {
    //console.log('🔑 [Current User Shop] Fetching user from /auth/me')
    const res = await fetch(`${API_BASE}/auth/me`, { 
      headers: { 
        Authorization: authHeader, 
        Accept: 'application/json' 
      } 
    })
    if (!res.ok) {
      console.error('❌ [Current User Shop] /auth/me returned status:', res.status)
      return null
    }
    const body = await res.json().catch(() => null)
    const user = body?.user ?? body
    console.log('✅ [Current User Shop] Successfully fetched user:', {
      userId: user?.userId ?? user?.user_id ?? user?.id,
      role: user?.role,
      shopId: user?.shop_id ?? user?.shopId
    })
    return user
  } catch (err) {
    console.error('❌ [Current User Shop] Error fetching user:', err)
    return null
  }
}

/** GET handler - returns current user's shop information */
export async function GET(request: Request) {
  //console.log('\n================================================================================')
  //console.log('🌐 [Current User Shop] GET request started')
  
  try {
    // Get user from forwarded headers or fetch from backend
    const forwardedUser = getUserFromForwarded(new Headers(request.headers))
    let user = forwardedUser ?? null
    
    if (!user) {
      // FIX (refresh cascade): resolve the bearer token from Authorization
      // header, middleware-forwarded x-auth-token header, OR access_token/
      // auth_token/authToken cookie
      const finalAuthHeader = resolveAuthorizationHeader(request)
      user = await fetchUserFromBackend(finalAuthHeader)
    }
    
    if (!user) {
      //console.log('❌ [Current User Shop] No authenticated user')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    // Extract user information
    const userId = user.user_id ?? user.userId ?? user.id
    const userName = user.fullName ?? user.full_name ?? user.name ?? user.username
    const userRole = user.role ?? user.role_name ?? user.roleName ?? user.roleDisplayName
    const shopId = user.shop_id ?? user.shopId ?? user.shop ?? null
    const shopName = user.shop_name ?? user.shopName ?? null
    
    console.log('✅ [Current User Shop] User info extracted:', {
      userId,
      userName,
      userRole,
      shopId,
      shopName
    })
    
    // Determine if user has an assigned shop
    const hasAssignedShop = shopId !== null && shopId !== undefined && shopId !== 0
    
    // Build response
    const response = {
      user_id: userId,
      user_name: userName,
      user_role: userRole,
      shop_id: shopId,
      shop_name: shopName,
      has_assigned_shop: hasAssignedShop
    }
    
    //console.log('📤 [Current User Shop] Returning response:', response)
    //console.log('================================================================================\n')
    
    return NextResponse.json(response, { status: 200 })
  } catch (err: any) {
    console.error('❌ [Current User Shop] Error:', err)
    //console.log('================================================================================\n')
    return NextResponse.json(
      { error: 'Server error fetching user shop info', detail: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}