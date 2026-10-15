import { requireRole } from '@/lib/serverAuth'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

/**
 * Proxy for /api/management/request-types -> backend /reference-data/request-types
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
  if (req.headers.get('cookie')) {
    h.cookie = req.headers.get('cookie') as string
  }
  
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

export async function GET(req: Request) {
  try {
    await requireRole(req, ALLOWED)
    const res = await fetch(`${API_BASE}/reference-data/request-types`, { headers: forwardHeaders(req) })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
  } catch (err: any) {
    console.error('[api/management/request-types] GET error:', err)
    return new Response(
      JSON.stringify({ error: err.body?.error || 'Failed to fetch request types', message: err.body?.message || err.message }),
      { status: err.status || 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function POST(req: Request) {
  try {
    await requireRole(req, ALLOWED)
    const payload = await req.json().catch(()=>null)
    const res = await fetch(`${API_BASE}/reference-data/request-types`, { 
      method:'POST', 
      headers: {'Content-Type':'application/json', ...forwardHeaders(req)}, 
      body: JSON.stringify(payload) 
    })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
  } catch (err: any) {
    console.error('[api/management/request-types] POST error:', err)
    return new Response(
      JSON.stringify({ error: err.body?.error || 'Failed to create request type', message: err.body?.message || err.message }),
      { status: err.status || 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function PUT(req: Request) {
  try {
    await requireRole(req, ALLOWED)
    const payload = await req.json().catch(()=>null)
    const id = payload?.request_type_id ?? payload?.id
    const res = await fetch(`${API_BASE}/reference-data/request-types/${encodeURIComponent(id)}`, { 
      method:'PUT', 
      headers: {'Content-Type':'application/json', ...forwardHeaders(req)}, 
      body: JSON.stringify(payload) 
    })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
  } catch (err: any) {
    console.error('[api/management/request-types] PUT error:', err)
    return new Response(
      JSON.stringify({ error: err.body?.error || 'Failed to update request type', message: err.body?.message || err.message }),
      { status: err.status || 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    await requireRole(req, ALLOWED)
    const url = new URL(req.url); const id = url.searchParams.get('id')
    const res = await fetch(`${API_BASE}/reference-data/request-types/${encodeURIComponent(id ?? '')}`, { 
      method:'DELETE', 
      headers: forwardHeaders(req) 
    })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
  } catch (err: any) {
    console.error('[api/management/request-types] DELETE error:', err)
    return new Response(
      JSON.stringify({ error: err.body?.error || 'Failed to delete request type', message: err.body?.message || err.message }),
      { status: err.status || 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}