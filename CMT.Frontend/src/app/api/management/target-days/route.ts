import { requireRole } from '@/lib/serverAuth'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

/**
 * Proxy for /api/management/target-days -> backend /reference-data/category-target-days
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
  if (authHeader) h.authorization = authHeader
  
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

export async function GET(req: Request) {
  await requireRole(req, ALLOWED)
  const backendUrl = `${API_BASE}/reference-data/category-target-days`
  try {
    const res = await proxyFetch(backendUrl, { headers: forwardHeaders(req) })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
  } catch (err: any) {
    console.error('[api/management/target-days] GET proxy error:', err)
    return new Response(JSON.stringify({ error: 'Proxy error' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
}

export async function POST(req: Request) {
  await requireRole(req, ALLOWED)
  const payload = await req.json().catch(() => null)
  const backendUrl = `${API_BASE}/reference-data/category-target-days`
  try {
    const res = await proxyFetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...forwardHeaders(req) },
      body: JSON.stringify(payload),
    })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
  } catch (err: any) {
    console.error('[api/management/target-days] POST proxy error:', err)
    return new Response(JSON.stringify({ error: 'Proxy error' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
}

export async function PUT(req: Request) {
  await requireRole(req, ALLOWED)
  const payload = await req.json().catch(() => null)

  // Try multiple possible payload keys for the id
  const id = payload?.category_id ?? payload?.id ?? payload?.CategoryId ?? payload?.categoryId ?? ''
  const backendUrl = `${API_BASE}/reference-data/category-target-days/${encodeURIComponent(id)}`
  try {
    const res = await proxyFetch(backendUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...forwardHeaders(req) },
      body: JSON.stringify(payload),
    })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
  } catch (err: any) {
    console.error('[api/management/target-days] PUT proxy error:', err)
    return new Response(JSON.stringify({ error: 'Proxy error' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
}

export async function DELETE(req: Request) {
  await requireRole(req, ALLOWED)
  const url = new URL(req.url)
  const id = url.searchParams.get('id') ?? ''
  const backendUrl = `${API_BASE}/reference-data/category-target-days/${encodeURIComponent(id)}`
  try {
    const res = await proxyFetch(backendUrl, { method: 'DELETE', headers: forwardHeaders(req) })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
  } catch (err: any) {
    console.error('[api/management/target-days] DELETE proxy error:', err)
    return new Response(JSON.stringify({ error: 'Proxy error' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
}