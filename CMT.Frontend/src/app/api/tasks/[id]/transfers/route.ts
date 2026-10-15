import { NextResponse } from 'next/server'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

/**
 * Transfers API proxy with RBAC scoping
 * 
 * FIXED: Enhanced logging and user forwarding to ensure userId is properly passed to backend
 */

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/** Normalize role strings */
function normalizeRole(raw: any): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'number') return String(raw)
  return String(raw).toLowerCase().trim().replace(/[\s\-\_]+/g, '_')
}

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
    //('🔑 [Transfers] Fetching user from /auth/me with Authorization header')
    const res = await fetch(`${API_BASE}/auth/me`, { 
      headers: { 
        Authorization: authHeader, 
        Accept: 'application/json' 
      } 
    })
    if (!res.ok) {
      console.error('❌ [Transfers] /auth/me returned status:', res.status)
      return null
    }
    const body = await res.json().catch(() => null)
    const user = body?.user ?? body
    ('✅ [Transfers] Successfully fetched user from /auth/me:', {
      userId: user?.userId ?? user?.user_id ?? user?.id,
      role: user?.role,
      fullName: user?.fullName ?? user?.full_name
    })
    return user
  } catch (err) {
    console.error('❌ [Transfers] Error fetching user from /auth/me:', err)
    return null
  }
}

/** Forward Authorization/cookie headers when calling backend */
function buildForwardHeaders(incoming: Request) {
  const fh = new Headers()
  const incomingHeaders = incoming.headers
  const cookie = incomingHeaders.get('cookie')
  
  // FIX (refresh cascade): resolve the bearer token from Authorization
  // header, middleware-forwarded x-auth-token header, OR access_token/
  // auth_token/authToken cookie
  const finalAuthHeader = resolveAuthorizationHeader(incoming)
  if (finalAuthHeader) {
    fh.set('authorization', finalAuthHeader)
  }
  
  if (cookie) fh.set('cookie', cookie)
  fh.set('accept', 'application/json')
  return fh
}

/** Extract transfers array from response */
function extractTransfersArray(body: any): any[] {
  if (!body) return []
  if (Array.isArray(body)) return body
  if (Array.isArray(body.transfers)) return body.transfers
  if (Array.isArray(body.data)) return body.data
  if (Array.isArray(body.results)) return body.results
  if (typeof body === 'object') {
    for (const k of Object.keys(body)) {
      if (Array.isArray((body as any)[k])) return (body as any)[k]
    }
  }
  return []
}

/** Apply role-based scoping to transfers */
function applyTransfersScoping(transfers: any[], user: any) {
  const role = normalizeRole(user?.role ?? user?.role_name ?? user?.roleName ?? user?.roleDisplayName ?? '')
  
  //(`🔐 [Transfers RBAC] Filtering for role: ${role}, total transfers: ${transfers.length}`)
  
  // team_leader and director see all transfers
  if (role === 'team_leader' || role === 'teamleader' || role === 'director' || role === '0' || role === '1') {
   //(`✅ [Transfers RBAC] Team Leader/Director - showing all ${transfers.length} transfers`)
    return transfers
  }
  
  // engineer: only transfers assigned to them
  if (role === 'engineer' || role === '2') {
    const name = String(user?.fullName ?? user?.full_name ?? user?.name ?? '').toLowerCase().trim()
    const uid = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    //(`🔐 [Transfers RBAC] Engineer - filtering by assignment (userId: ${uid}, name: '${name}')`)
    
    const filtered = transfers.filter(t => {
      const assignedRaw = t.assigned_engineer ?? t.assigned ?? t.assignedEngineer ?? ''
      const assignedStr = String(assignedRaw ?? '').toLowerCase()
      if (name && assignedStr) {
        const parts = assignedStr.split(',').map((s: string) => s.trim())
        if (parts.includes(name) || assignedStr.includes(name)) return true
      }
      const assignedId = Number(t.assigned_engineer_id ?? t.assigned_id ?? t.assignedEngineerId ?? NaN)
      if (isFinite(uid) && isFinite(assignedId) && assignedId === uid) return true
      return false
    })
    //(`✅ [Transfers RBAC] Engineer filtered transfers: ${filtered.length}`)
    return filtered
  }
  
  // customer or customer_personnel: only transfers they created
  if (role === 'customer' || role === 'customer_personnel' || role === 'customerpersonnel' || role === '3' || role === '4') {
    const uid = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    const name = String(user?.fullName ?? user?.full_name ?? user?.name ?? '').toLowerCase()
    //(`🔐 [Transfers RBAC] Customer - filtering by creator (userId: ${uid}, name: '${name}')`)
    
    const filtered = transfers.filter(t => {
      const createdBy = Number(t.created_by ?? t.createdBy ?? t.creator_id ?? t.creatorId ?? NaN)
      const creatorName = String(t.creator_name ?? t.created_by_name ?? t.creator ?? '').toLowerCase()
      if (isFinite(uid) && isFinite(createdBy) && createdBy === uid) return true
      if (name && creatorName && creatorName.includes(name)) return true
      return false
    })
    //(`✅ [Transfers RBAC] Customer filtered transfers: ${filtered.length}`)
    return filtered
  }
  
  // shop_tl: transfers from/to their shop
  if (role === 'shop_tl' || role === 'shoptl' || role === '5') {
    const shopId = user?.shop_id ?? user?.shopId ?? user?.shop ?? null
    //(`🔐 [Transfers RBAC] Shop TL - filtering by shop (shopId: ${shopId})`)
    
    if (!shopId) return transfers
    const filtered = transfers.filter(t => {
      const fromShop = t.from_shop_id ?? t.fromShopId ?? t.from_shop ?? t.fromShop ?? null
      const toShop = t.to_shop_id ?? t.toShopId ?? t.to_shop ?? t.toShop ?? null
      return String(fromShop) === String(shopId) || String(toShop) === String(shopId)
    })
    //(`✅ [Transfers RBAC] Shop TL filtered transfers: ${filtered.length}`)
    return filtered
  }
  
  // manager: similar to shop_tl
  if (role === 'manager' || role === '6') {
    const shopId = user?.shop_id ?? user?.shopId ?? user?.shop ?? null
    //(`🔐 [Transfers RBAC] Manager - filtering by shop (shopId: ${shopId})`)
    
    if (!shopId) return transfers
    const filtered = transfers.filter(t => {
      const fromShop = t.from_shop_id ?? t.fromShopId ?? t.from_shop ?? t.fromShop ?? null
      const toShop = t.to_shop_id ?? t.toShopId ?? t.to_shop ?? t.toShop ?? null
      return String(fromShop) === String(shopId) || String(toShop) === String(shopId)
    })
    (`✅ [Transfers RBAC] Manager filtered transfers: ${filtered.length}`)
    return filtered
  }
  
  // default: only transfers created by user
  //(`🔐 [Transfers RBAC] Using default filtering (transfers created by user)`)
  const uid = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
  if (isFinite(uid)) {
    const filtered = transfers.filter(t => Number(t.created_by ?? t.createdBy ?? t.creator_id ?? t.creatorId ?? NaN) === uid)
    //(`✅ [Transfers RBAC] Default filtered transfers: ${filtered.length}`)
    return filtered
  }
  
  //(`❌ [Transfers RBAC] No matching criteria - returning empty list`)
  return []
}

/** GET handler */
export async function GET(request: Request) {
  const startTime = Date.now()
  //('\n================================================================================')
  //('🌐 [Transfers Proxy] GET request started')
  
  try {
    // Get user from forwarded headers or fetch from backend
    const forwardedUser = getUserFromForwarded(new Headers(request.headers))
    let user = forwardedUser ?? null
    
    //('👤 [Transfers Proxy] Forwarded user:', forwardedUser ? 'Found' : 'Not found')
    
    const auth = request.headers.get('authorization')
    const cookie = request.headers.get('cookie')
    
    if (!user && (auth || cookie)) {
      //('🔑 [Transfers Proxy] Fetching user from backend /auth/me')
      
      // Build auth header from either Authorization header or cookie
      let authHeader = auth
      if (!authHeader && cookie) {
        const authTokenMatch = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/)
        if (authTokenMatch) {
          const token = decodeURIComponent(authTokenMatch[1])
          authHeader = `Bearer ${token}`
        }
      }
      
      user = await fetchUserFromBackend(authHeader)
    }
    
    if (!user) {
      //('❌ [Transfers Proxy] No authenticated user')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    ('✅ [Transfers Proxy] Authenticated user:', {
      userId: user.user_id ?? user.id ?? user.userId,
      userName: user.fullName ?? user.full_name ?? user.name,
      role: user.role ?? user.role_name ?? user.roleName
    })
    
    // Build backend URL with query params
    const url = new URL(request.url)
    const qs = url.search
    const backendUrl = `${API_BASE}/transfers${qs}`
    
    //('🌐 [Transfers Proxy] Fetching from:', backendUrl)
    
    // Forward headers to backend
    const forwardHeaders = buildForwardHeaders(request)
    const backendRes = await fetch(backendUrl, { headers: forwardHeaders })
    
    //('📥 [Transfers Proxy] Backend response status:', backendRes.status)
    
    if (!backendRes.ok) {
      const errorText = await backendRes.text().catch(() => '')
      ('❌ [Transfers Proxy] Backend error:', backendRes.status, errorText)
      return NextResponse.json(
        { error: 'Backend request failed', status: backendRes.status, detail: errorText },
        { status: backendRes.status }
      )
    }
    
    const text = await backendRes.text().catch(() => '')
    let body: any = null
    try { body = JSON.parse(text) } catch { body = text }
    
    // Extract transfers array
    const rawTransfers = extractTransfersArray(body)
    //('📋 [Transfers Proxy] Raw transfers count:', rawTransfers.length)
    
    // Apply RBAC scoping
    const filtered = applyTransfersScoping(rawTransfers, user)
    
    ('📊 [Transfers Proxy] Final results:', {
      originalCount: rawTransfers.length,
      filteredCount: filtered.length,
      excludedCount: rawTransfers.length - filtered.length
    })
    //('⏱️ [Transfers Proxy] Completed in', Date.now() - startTime, 'ms')
    //('================================================================================\n')
    
    // Return in same envelope format as backend
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      const envelope = { ...body }
      if (Array.isArray(envelope.transfers)) envelope.transfers = filtered
      else if (Array.isArray(envelope.data)) envelope.data = filtered
      else if (Array.isArray(envelope.results)) envelope.results = filtered
      else return NextResponse.json({ transfers: filtered }, { status: 200 })
      return NextResponse.json(envelope, { status: 200 })
    }
    
    return NextResponse.json({ transfers: filtered }, { status: 200 })
  } catch (err: any) {
    console.error('❌ [Transfers Proxy] GET error:', err)
    ('⏱️ [Transfers Proxy] Failed in', Date.now() - startTime, 'ms')
    ('================================================================================\n')
    return NextResponse.json(
      { error: 'Server error fetching transfers', detail: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}

/** POST handler - FIXED: Enhanced logging and payload forwarding */
export async function POST(request: Request) {
  ('\n================================================================================')
  ('🌐 [Transfers Proxy] POST request started')
  
  try {
    // Get user for permission check
    let user = getUserFromForwarded(new Headers(request.headers))
    
    const auth = request.headers.get('authorization')
    const cookie = request.headers.get('cookie')
    
    if (!user && (auth || cookie)) {
      let authHeader = auth
      if (!authHeader && cookie) {
        const authTokenMatch = cookie.match(/(?:^|;\s*)auth_token=([^;]+)/)
        if (authTokenMatch) {
          const token = decodeURIComponent(authTokenMatch[1])
          authHeader = `Bearer ${token}`
        }
      }
      user = await fetchUserFromBackend(authHeader)
      
      if (user) {
        ('Successfully fetched user from /auth/me:', {
          userId: user.userId ?? user.user_id ?? user.id,
          role: user.role,
          fullName: user.fullName ?? user.full_name
        })
      }
    }
    
    if (!user) {
      ('❌ [Transfers Proxy] POST - No authenticated user')
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    
    const role = normalizeRole(user.role ?? user.role_name ?? user.roleName ?? '')
    const allowedRoles = ['team_leader', 'teamleader', 'director', 'customer_personnel', 'customerpersonnel', 'shop_tl', 'shoptl', 'manager', '0', '1', '4', '5', '6']
    
    if (!allowedRoles.includes(role)) {
      ('❌ [Transfers Proxy] POST - Forbidden role:', role)
      return NextResponse.json({ error: 'Forbidden: role not allowed to create transfers' }, { status: 403 })
    }
    
    ('✅ [Transfers Proxy] POST - User authorized:', {
      userId: user.user_id ?? user.id ?? user.userId,
      role
    })
    
    // Forward request to backend
    const backendUrl = `${API_BASE}/transfers`
    const forwardHeaders = buildForwardHeaders(request)
    forwardHeaders.set('content-type', 'application/json')
    
    const body = await request.text()
    
    ('🌐 [Transfers Proxy] POST to:', backendUrl)
    ('📤 [Transfers Proxy] POST payload:', body)
    
    const backendRes = await fetch(backendUrl, {
      method: 'POST',
      headers: forwardHeaders,
      body
    })
    
    const respText = await backendRes.text().catch(() => '')
    const contentType = backendRes.headers.get('content-type') || 'application/json'
    
    ('📥 [Transfers Proxy] POST response status:', backendRes.status)
    
    if (!backendRes.ok) {
      ('❌ [Transfers Proxy] POST response error:', respText)
    }
    
    ('================================================================================\n')
    
    return new NextResponse(respText, {
      status: backendRes.status,
      headers: { 'content-type': contentType }
    })
  } catch (err: any) {
    console.error('❌ [Transfers Proxy] POST error:', err)
    ('================================================================================\n')
    return NextResponse.json(
      { error: 'Server error creating transfer', detail: String(err?.message ?? err) },
      { status: 500 }
    )
  }
}