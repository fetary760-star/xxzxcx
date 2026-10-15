import { NextResponse } from 'next/server'
import { buildBackendProxyHeaders, resolveAuthorizationHeader } from '@/lib/proxy-auth'

/**
 * RBAC proxy for /api/workload - FIXED with proper authentication and Director scoping
 * - Fetches workload data from backend CMT_API_BASE_URL/workload (forwards auth/cookies).
 * - Resolves authenticated user (prefer middleware forwarded x-user-json; otherwise calls backend /auth/me).
 * - Applies server-side role-based scoping to the returned workload data.
 * - FIXED: Properly handles Director role filtering and workload data structure
 * - REFRESH FIX: Auth forwarding now falls back from Authorization header -> x-auth-token
 *   (middleware) -> access_token/auth_token cookies so that a full page reload
 *   (when secureAuthStore has been cleared) still works. Previously the route
 *   only honored the Authorization header, which is missing on refresh and
 *   caused "No data" / "No engineers with assigned tasks found" after reload.
 */

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/** Normalize role tokens */
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
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: authHeader, Accept: 'application/json' } })
    if (!res.ok) return null
    const body = await res.json().catch(() => null)
    return body?.user ?? body
  } catch {
    return null
  }
}

/** Forward Authorization/cookie headers when calling backend.
 *  FIX: Use the shared resolver so we pick up the token from the
 *  Authorization header, the middleware-forwarded `x-auth-token` header,
 *  or the `access_token` / `auth_token` / `authToken` cookie — whichever
 *  is present. This makes proxy calls work on full page reload.
 */
function buildForwardHeaders(incoming: Request) {
  const fh = new Headers()
  const auth = resolveAuthorizationHeader(incoming)
  if (auth) fh.set('authorization', auth)
  const cookie = incoming.headers.get('cookie')
  if (cookie) fh.set('cookie', cookie)
  fh.set('accept', 'application/json')
  return fh
}

/** 
 * FIXED: Get all users in the same shop via the /users endpoint.
 * The backend auto-scopes the /users response by shop when the requesting user has a shopId.
 * Used by shop_manager to discover all users (Shop TLs, customer personnel) in their shop.
 */
async function getShopScopedUsers(authHeader?: string | null): Promise<number[]> {
  if (!authHeader) return []
  try {
    console.log(`🔍 [Shop Scoped Users] Fetching all users via /users (backend auto-scopes by shop)`)
    const res = await fetch(`${API_BASE}/users`, { 
      headers: { Authorization: authHeader, Accept: 'application/json' } 
    })
    if (!res.ok) {
      console.log(`❌ [Shop Scoped Users] Failed to fetch users: ${res.status}`)
      return []
    }
    const body = await res.json().catch(() => null)
    const users = Array.isArray(body) ? body : (body?.users ?? body?.data ?? [])
    const userIds = Array.isArray(users) 
      ? users.map((u: any) => Number(u.user_id ?? u.userId ?? u.id)).filter((id: number) => !isNaN(id) && id > 0) 
      : []
    console.log(`✅ [Shop Scoped Users] Found ${userIds.length} users in shop scope:`, userIds)
    return userIds
  } catch (err) {
    console.error(`❌ [Shop Scoped Users] Error fetching shop-scoped users:`, err)
    return []
  }
}

/** Get user names from the /users endpoint for matching workload entries */
async function getShopScopedUserNames(authHeader?: string | null): Promise<string[]> {
  if (!authHeader) return []
  try {
    const res = await fetch(`${API_BASE}/users`, { 
      headers: { Authorization: authHeader, Accept: 'application/json' } 
    })
    if (!res.ok) return []
    const body = await res.json().catch(() => null)
    const users = Array.isArray(body) ? body : (body?.users ?? body?.data ?? [])
    const names = Array.isArray(users) 
      ? users.map((u: any) => String(u.fullName ?? u.full_name ?? u.name ?? '').toLowerCase().trim()).filter(Boolean)
      : []
    return names
  } catch {
    return []
  }
}

/** Try to extract workload array from many common backend response shapes */
function extractWorkloadArray(body: any): any[] {
  if (!body) return []
  if (Array.isArray(body)) return body
  if (Array.isArray(body.workload)) return body.workload
  if (Array.isArray(body.data)) return body.data
  if (Array.isArray(body.results)) return body.results
  // find the first array property
  if (typeof body === 'object') {
    for (const k of Object.keys(body)) {
      if (Array.isArray((body as any)[k])) return (body as any)[k]
    }
  }
  return []
}

/** RBAC scoping for workload data - FIXED with Director support */
async function applyRoleScoping(workloadData: any[], user: any, authHeader?: string | null) {
  const role = normalizeRole(user?.role ?? user?.role_name ?? user?.roleName ?? user?.roleDisplayName ?? '')
  
  // FIXED: Directors now see workload filtered by backend - no additional filtering needed here
  // Backend WorkloadController already applies Director scoping based on department access
  if (role === 'director' || role === '1') {
    //('Director role detected - workload already filtered by backend')
    return workloadData
  }
  
  // team leaders see everything
  if (role === 'team_leader' || role === 'teamleader' || role === '0') {
    return workloadData
  }

  // engineer: only their own workload data
  if (role === 'engineer' || role === '2') {
    const name = String(user?.fullName ?? user?.full_name ?? user?.name ?? '').toLowerCase().trim()
    const uid = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    if (!name && !isFinite(uid)) return []
    
    return workloadData.filter(w => {
      const engineerName = String(w.engineerName ?? w.engineer_name ?? '').toLowerCase()
      const engineerId = Number(w.engineerId ?? w.engineer_id ?? w.id ?? NaN)
      
      // Match by name or ID
      if (name && engineerName.includes(name)) return true
      if (isFinite(uid) && isFinite(engineerId) && engineerId === uid) return true
      return false
    })
  }

  // customer or customer_personnel: no workload data access
  if (role === 'customer' || role === 'customer_personnel' || role === 'customerpersonnel' || role === '3' || role === '4') {
    return []
  }

  // shop team leader: workload for their shop engineers
  if (role === 'shop_tl' || role === 'shoptl' || role === '5') {
    const shopId = Number(user?.shopId ?? user?.shop_id ?? NaN)
    if (!isFinite(shopId)) return []
    
    return workloadData.filter(w => {
      const workloadShopId = Number(w.shopId ?? w.shop_id ?? NaN)
      return isFinite(workloadShopId) && workloadShopId === shopId
    })
  }

  // shop manager: FIXED - Use /users endpoint to get shop-scoped users, then filter workload
  // by matching engineer names/IDs from the shop scope
  if (role === 'shop_manager' || role === 'shopmanager' || role === 'minimanager' || role === '8') {
    const shopId = Number(user?.shopId ?? user?.shop_id ?? NaN)
    const shopManagerId = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    
    console.log(`🔐 [Workload RBAC] Shop Manager (userId: ${shopManagerId}, shopId: ${shopId}) - fetching shop-scoped users`)
    
    // FIXED: Use /users endpoint which backend auto-scopes by shop
    const shopScopedUserIds = await getShopScopedUsers(authHeader)
    const shopScopedUserNames = await getShopScopedUserNames(authHeader)
    
    console.log(`📋 [Workload RBAC] Shop Manager ${shopManagerId} shop-scoped user IDs:`, shopScopedUserIds)
    console.log(`📋 [Workload RBAC] Shop Manager ${shopManagerId} shop-scoped user names:`, shopScopedUserNames)
    
    if (shopScopedUserIds.length > 0 || shopScopedUserNames.length > 0) {
      const filtered = workloadData.filter(w => {
        // Match by shopId if available on workload item
        const workloadShopId = Number(w.shopId ?? w.shop_id ?? NaN)
        if (isFinite(shopId) && isFinite(workloadShopId) && workloadShopId === shopId) return true
        
        // Match by engineer ID
        const engineerId = Number(w.engineerId ?? w.engineer_id ?? w.id ?? NaN)
        if (isFinite(engineerId) && shopScopedUserIds.includes(engineerId)) return true
        
        // Match by engineer name
        const engineerName = String(w.engineerName ?? w.engineer_name ?? '').toLowerCase().trim()
        if (engineerName && shopScopedUserNames.some(n => engineerName.includes(n) || n.includes(engineerName))) return true
        
        return false
      })
      console.log(`✅ [Workload RBAC] Shop Manager filtered workload: ${filtered.length}/${workloadData.length}`)
      return filtered
    }
    
    // Fallback: filter by shopId if available
    if (isFinite(shopId)) {
      return workloadData.filter(w => {
        const workloadShopId = Number(w.shopId ?? w.shop_id ?? NaN)
        return isFinite(workloadShopId) && workloadShopId === shopId
      })
    }
    
    // If no shopId and no scoped users, show all workload data
    return workloadData
  }

  // default conservative rule: no access
  return []
}

export async function GET(request: Request) {
  try {
    // prefer middleware forwarded user (set by middleware earlier)
    const forwardedUserJson = getUserFromForwarded(new Headers(request.headers))
    let user = forwardedUserJson ?? null

    // if no user forwarded, try to obtain via auth header / middleware / cookie
    const auth = resolveAuthorizationHeader(request)
    if (!user && auth) {
      user = await fetchUserFromBackend(auth)
    }

    // FIXED: Build backend target URL and properly forward query parameters
    const url = new URL(request.url)
    const qs = url.search
    const backendUrl = `${API_BASE}/workload${qs}`

    //('Next.js Workload API Route - Forwarding request to backend:', backendUrl)
    //('Next.js Workload API Route - User role:', user?.role)

    // forward headers for backend call
    const forwardHeaders = buildForwardHeaders(request)
    const backendRes = await fetch(backendUrl, { headers: forwardHeaders })
    const text = await backendRes.text().catch(() => '')
    let body: any = null
    try { body = JSON.parse(text) } catch { body = text }

    //('Next.js Workload API Route - Backend response status:', backendRes.status)
    //('Next.js Workload API Route - Backend response type:', typeof body)

    // Handle authentication errors
    if (backendRes.status === 401) {
      return new NextResponse(JSON.stringify({ error: 'Authentication required' }), { 
        status: 401, 
        headers: new Headers({ 'content-type': 'application/json' }) 
      })
    }

    // Try to extract workload array
    const rawList = extractWorkloadArray(body)

    //('Next.js Workload API Route - Extracted workload count:', rawList.length)
    //('Next.js Workload API Route - Sample workload data:', rawList.slice(0, 2))

    // if we couldn't get workload array, return backend body (preserve status)
    if (!Array.isArray(rawList)) {
      //('Next.js Workload API Route - No workload found or not array, returning backend response as-is')
      return new NextResponse(JSON.stringify(body), { 
        status: backendRes.status, 
        headers: new Headers({ 'content-type': 'application/json' }) 
      })
    }

    // FIXED: For Directors, backend already filtered - just apply minimal client-side validation
    const filtered = user ? await applyRoleScoping(rawList, user, auth) : []

    //('Next.js Workload API Route - After RBAC filtering:', filtered.length, 'workload entries')

    // Optionally keep the same envelope shape as backend if it had one:
    // If backend had { workload: [...] } return same shape, else return array.
    if (body && typeof body === 'object' && !Array.isArray(body) && (body.workload || body.data || body.results)) {
      const out = { ...body }
      // set workload/data/results whichever exists, prefer workload
      if (Array.isArray(out.workload)) out.workload = filtered
      else if (Array.isArray(out.data)) out.data = filtered
      else if (Array.isArray(out.results)) out.results = filtered
      return new NextResponse(JSON.stringify(out), { 
        status: 200, 
        headers: new Headers({ 'content-type': 'application/json' }) 
      })
    }

    // otherwise return filtered array
    return NextResponse.json(filtered, { status: 200 })
  } catch (err: any) {
    console.error('RBAC workload proxy error', err)
    return new NextResponse(JSON.stringify({ error: 'Failed to load workload data' }), { status: 500 })
  }
}