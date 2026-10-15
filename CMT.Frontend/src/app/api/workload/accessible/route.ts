import { NextResponse } from 'next/server'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

/**
 * RBAC proxy for /api/workload/accessible
 *
 * Purpose:
 *   Provide an "accessible engineers workload summary" endpoint that the frontend
 *   (EngineerWorkload.tsx) calls as:
 *     GET /api/workload/accessible?engineers=Name1&engineers=Name2
 *
 * Strategy:
 *   1. Forward auth/cookies to backend and try `${API_BASE}/workload/accessible${qs}`.
 *      If the backend implements it, return its response (with optional RBAC filtering).
 *   2. If the backend returns 404 (endpoint not implemented), gracefully fall back:
 *      - Fetch `${API_BASE}/workload` (same auth).
 *      - Filter the resulting workload list by the requested engineer name(s).
 *      - Apply role-based scoping (engineer, shop_manager, shop_tl, customer, etc.).
 *      - Return a compact summary array so the frontend has usable data instead of a 404.
 */

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

function normalizeRole(raw: any): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'number') return String(raw)
  return String(raw).toLowerCase().trim().replace(/[\s\-\_]+/g, '_')
}

function getUserFromForwarded(headers: Headers): any | null {
  const j = headers.get('x-user-json')
  if (!j) return null
  try { return JSON.parse(j) } catch { return null }
}

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

function buildForwardHeaders(incoming: Request) {
  // REFRESH FIX: resolve the Authorization header from Authorization header,
  // middleware-forwarded x-auth-token, or access_token/auth_token cookie so
  // the backend still receives a bearer token after a full page reload.
  const fh = new Headers()
  const auth = resolveAuthorizationHeader(incoming)
  if (auth) fh.set('authorization', auth)
  const cookie = incoming.headers.get('cookie')
  if (cookie) fh.set('cookie', cookie)
  fh.set('accept', 'application/json')
  return fh
}

function extractWorkloadArray(body: any): any[] {
  if (!body) return []
  if (Array.isArray(body)) return body
  if (Array.isArray(body.workload)) return body.workload
  if (Array.isArray(body.data)) return body.data
  if (Array.isArray(body.results)) return body.results
  if (typeof body === 'object') {
    for (const k of Object.keys(body)) {
      if (Array.isArray((body as any)[k])) return (body as any)[k]
    }
  }
  return []
}

/**
 * Build a compact accessible-workload summary from raw workload items.
 * Aggregates per-engineer counts and basic metrics.
 */
function buildAccessibleSummary(workloadItems: any[], requestedEngineers: string[]) {
  const requestedSet = new Set(
    requestedEngineers.map(n => String(n).toLowerCase().trim()).filter(Boolean)
  )

  const byEngineer = new Map<string, any>()

  for (const item of workloadItems) {
    const engineerName = String(item.engineerName ?? item.engineer_name ?? '').trim()
    if (!engineerName) continue

    // If caller restricted the query to specific engineers, only include those.
    if (requestedSet.size > 0 && !requestedSet.has(engineerName.toLowerCase())) continue

    const key = engineerName.toLowerCase()
    if (!byEngineer.has(key)) {
      byEngineer.set(key, {
        engineerName,
        engineerId: item.engineerId ?? item.engineer_id ?? null,
        shopId: item.shopId ?? item.shop_id ?? null,
        totalTasks: 0,
        activeTasks: 0,
        completedTasks: 0,
        overdueTasks: 0,
        totalHours: 0,
        accessible: true,
      })
    }

    const agg = byEngineer.get(key)
    agg.totalTasks += 1

    const status = String(item.status ?? item.taskStatus ?? '').toLowerCase()
    if (status.includes('complete') || status === 'done' || status === 'closed') {
      agg.completedTasks += 1
    } else if (status.includes('overdue')) {
      agg.overdueTasks += 1
    } else {
      agg.activeTasks += 1
    }

    const hours = Number(item.hours ?? item.estimatedHours ?? item.workHours ?? 0)
    if (isFinite(hours)) agg.totalHours += hours
  }

  return Array.from(byEngineer.values())
}

/** RBAC scoping: restrict which workload items the caller may see. */
async function applyRoleScoping(workloadData: any[], user: any) {
  const role = normalizeRole(user?.role ?? user?.role_name ?? user?.roleName ?? user?.roleDisplayName ?? '')

  // Directors and Team Leaders see everything the backend already returned.
  if (role === 'director' || role === '1') return workloadData
  if (role === 'team_leader' || role === 'teamleader' || role === '0') return workloadData

  // Engineer: only their own.
  if (role === 'engineer' || role === '2') {
    const name = String(user?.fullName ?? user?.full_name ?? user?.name ?? '').toLowerCase().trim()
    const uid = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    if (!name && !isFinite(uid)) return []
    return workloadData.filter(w => {
      const engineerName = String(w.engineerName ?? w.engineer_name ?? '').toLowerCase()
      const engineerId = Number(w.engineerId ?? w.engineer_id ?? w.id ?? NaN)
      if (name && engineerName && (engineerName === name || engineerName.includes(name))) return true
      if (isFinite(uid) && isFinite(engineerId) && engineerId === uid) return true
      return false
    })
  }

  // Customers: no access.
  if (role === 'customer' || role === 'customer_personnel' || role === 'customerpersonnel' || role === '3' || role === '4') {
    return []
  }

  // Shop TL / Shop Manager: restrict by shopId when possible.
  if (
    role === 'shop_tl' || role === 'shoptl' || role === '5' ||
    role === 'shop_manager' || role === 'shopmanager' || role === 'minimanager' || role === '8'
  ) {
    const shopId = Number(user?.shopId ?? user?.shop_id ?? NaN)
    if (!isFinite(shopId)) return workloadData
    return workloadData.filter(w => {
      const workloadShopId = Number(w.shopId ?? w.shop_id ?? NaN)
      return !isFinite(workloadShopId) || workloadShopId === shopId
    })
  }

  // Default: deny.
  return []
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const qs = url.search
    const requestedEngineers = url.searchParams.getAll('engineers')

    // Resolve user (via middleware-forwarded JSON or backend /auth/me).
    const forwardedUser = getUserFromForwarded(new Headers(request.headers))
    let user = forwardedUser ?? null
    const auth = resolveAuthorizationHeader(request)
    if (!user && auth) {
      user = await fetchUserFromBackend(auth)
    }

    const forwardHeaders = buildForwardHeaders(request)

    // 1) Try real backend endpoint first.
    const backendAccessibleUrl = `${API_BASE}/workload/accessible${qs}`
    let backendRes: Response | null = null
    try {
      backendRes = await fetch(backendAccessibleUrl, { headers: forwardHeaders })
    } catch {
      backendRes = null
    }

    if (backendRes && backendRes.ok) {
      const text = await backendRes.text().catch(() => '')
      let body: any = null
      try { body = JSON.parse(text) } catch { body = text }
      return new NextResponse(JSON.stringify(body), {
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
      })
    }

    if (backendRes && backendRes.status === 401) {
      return new NextResponse(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
      })
    }

    // 2) Fallback: derive summary from /workload.
    const backendWorkloadUrl = `${API_BASE}/workload`
    const wRes = await fetch(backendWorkloadUrl, { headers: forwardHeaders })
    const wText = await wRes.text().catch(() => '')
    let wBody: any = null
    try { wBody = JSON.parse(wText) } catch { wBody = wText }

    if (wRes.status === 401) {
      return new NextResponse(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: new Headers({ 'content-type': 'application/json' }),
      })
    }

    if (!wRes.ok) {
      // Return an empty summary with 200 so the client UI degrades gracefully.
      return NextResponse.json([], { status: 200 })
    }

    const rawList = extractWorkloadArray(wBody)
    const scoped = user ? await applyRoleScoping(rawList, user) : []
    const summary = buildAccessibleSummary(scoped, requestedEngineers)

    return NextResponse.json(summary, { status: 200 })
  } catch (err: any) {
    console.error('RBAC workload/accessible proxy error', err)
    // Return empty summary instead of 500 so UI falls back to client-side computation.
    return NextResponse.json([], { status: 200 })
  }
}