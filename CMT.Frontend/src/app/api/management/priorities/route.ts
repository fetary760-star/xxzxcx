import { requireRole } from '@/lib/serverAuth'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

/**
 * Proxy for /api/management/priorities -> backend /reference-data/priorities
 * REFRESH FIX: Uses resolveAuthorizationHeader for cookie fallback on page reload.
 */

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')
const ALLOWED = [
  'team_leader', 'teamleader', 'team-leader',
  'director', 
  'manager',
  'shop_manager', 'shopmanager',
  'admin', 'administrator',
  'shop_tl', 'shoptl', 'shop-tl',
  '1', '4', '5', '6', '7', '8'  // Role IDs: 1=team_leader, 4=shop_tl, 5=director, 6=manager, 7=admin, 8=shop_manager
]

/**
 * Forward headers from client request to backend.
 * REFRESH FIX: Uses resolveAuthorizationHeader to resolve the bearer token
 * from Authorization header, x-auth-token middleware header, OR cookies.
 */
function forwardHeaders(req: Request) {
  const h: Record<string, string> = {}
  
  // REFRESH FIX: Resolve authorization from header, middleware, or cookies
  const authHeader = resolveAuthorizationHeader(req)
  if (authHeader) {
    h.authorization = authHeader
  }
  
  // Forward cookies (includes CSRF-TOKEN cookie)
  const c = req.headers.get('cookie')
  if (c) h.cookie = c
  
  // Forward CSRF token header for backend validation
  const csrfToken = req.headers.get('x-csrf-token')
  if (csrfToken) {
    h['X-CSRF-Token'] = csrfToken
  }
  
  // Forward X-Requested-With header
  const xRequestedWith = req.headers.get('x-requested-with')
  if (xRequestedWith) {
    h['X-Requested-With'] = xRequestedWith
  }
  
  return h
}

async function proxyFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, opts)
}

function normalizePriorityPayload(payload: any) {
  if (!payload || typeof payload !== 'object') return payload

  // Normalize name field variants to backend's expected PascalCase "LevelName"
  if (!payload.LevelName) {
    if (payload.level_name) payload.LevelName = payload.level_name
    else if (payload.levelName) payload.LevelName = payload.levelName
  }

  return payload
}

export async function GET(req: Request) {
  try {
    await requireRole(req, ALLOWED)
    const backendUrl = `${API_BASE}/reference-data/priorities`
    const res = await proxyFetch(backendUrl, { headers: forwardHeaders(req) })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
  } catch (err: any) {
    console.error('[api/management/priorities] GET error:', err)
    return new Response(
      JSON.stringify({ error: err.body?.error || 'Failed to fetch priorities', message: err.body?.message || err.message }),
      { status: err.status || 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function POST(req: Request) {
  try {
    await requireRole(req, ALLOWED)
    const payload = await req.json().catch(() => null)
    const normalized = normalizePriorityPayload(payload)
    const backendUrl = `${API_BASE}/reference-data/priorities`
    const res = await proxyFetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardHeaders(req) },
      body: JSON.stringify(normalized),
    })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
  } catch (err: any) {
    console.error('[api/management/priorities] POST error:', err)
    return new Response(
      JSON.stringify({ error: err.body?.error || 'Failed to create priority', message: err.body?.message || err.message }),
      { status: err.status || 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function PUT(req: Request) {
  try {
    await requireRole(req, ALLOWED)
    const payload = await req.json().catch(() => null)
    const normalized = normalizePriorityPayload(payload)
    const id = normalized?.priority_id ?? normalized?.id ?? ''
    const backendUrl = `${API_BASE}/reference-data/priorities/${encodeURIComponent(id)}`
    const res = await proxyFetch(backendUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...forwardHeaders(req) },
      body: JSON.stringify(normalized),
    })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
  } catch (err: any) {
    console.error('[api/management/priorities] PUT error:', err)
    return new Response(
      JSON.stringify({ error: err.body?.error || 'Failed to update priority', message: err.body?.message || err.message }),
      { status: err.status || 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    await requireRole(req, ALLOWED)
    const url = new URL(req.url)
    const id = url.searchParams.get('id') ?? ''
    const backendUrl = `${API_BASE}/reference-data/priorities/${encodeURIComponent(id)}`
    const res = await proxyFetch(backendUrl, { method: 'DELETE', headers: forwardHeaders(req) })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
  } catch (err: any) {
    console.error('[api/management/priorities] DELETE error:', err)
    return new Response(
      JSON.stringify({ error: err.body?.error || 'Failed to delete priority', message: err.body?.message || err.message }),
      { status: err.status || 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}