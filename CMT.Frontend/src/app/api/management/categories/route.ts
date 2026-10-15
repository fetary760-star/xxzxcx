import { requireRole } from '@/lib/serverAuth'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

// UPDATED: Added more role variations to ensure proper access
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
    const backendUrl = `${API_BASE}/reference-data/categories`
    const res = await fetch(backendUrl, { headers: forwardHeaders(req) })
    const text = await res.text()
    return new Response(text, { 
      status: res.status, 
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } 
    })
  } catch (err: any) {
    if (err instanceof Response) {
      return err
    }
    console.error('[api/management/categories] GET Error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch categories', message: err.message }), 
      { status: err.status || 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function POST(req: Request) {
  try {
    await requireRole(req, ALLOWED)
    const payload = await req.json().catch(() => null)
    const backendUrl = `${API_BASE}/reference-data/categories`
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...forwardHeaders(req) }
    const res = await fetch(backendUrl, { method: 'POST', headers, body: JSON.stringify(payload) })
    const text = await res.text()
    return new Response(text, { 
      status: res.status, 
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } 
    })
  } catch (err: any) {
    if (err instanceof Response) {
      return err
    }
    console.error('[api/management/categories] POST Error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to create category', message: err.message }), 
      { status: err.status || 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function PUT(req: Request) {
  try {
    //('[api/management/categories] PUT request received')
    
    await requireRole(req, ALLOWED)
    
    const payload = await req.json().catch(() => null)
    //('[api/management/categories] PUT payload:', payload)
    
    const id = payload?.category_id ?? payload?.id
    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Missing category ID' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    const backendUrl = `${API_BASE}/reference-data/categories/${encodeURIComponent(id)}`
    //('[api/management/categories] PUT forwarding to:', backendUrl)
    
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...forwardHeaders(req) }
    const res = await fetch(backendUrl, { method: 'PUT', headers, body: JSON.stringify(payload) })
    const text = await res.text()
    
    //('[api/management/categories] PUT backend response:', res.status, text.substring(0, 200))
    
    return new Response(text, { 
      status: res.status, 
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } 
    })
  } catch (err: any) {
    if (err instanceof Response) {
      return err
    }
    console.error('[api/management/categories] PUT Error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to update category', message: err.message }), 
      { status: err.status || 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function DELETE(req: Request) {
  try {
    await requireRole(req, ALLOWED)
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    
    if (!id) {
      return new Response(
        JSON.stringify({ error: 'Missing category ID' }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }
    
    const backendUrl = `${API_BASE}/reference-data/categories/${encodeURIComponent(id)}`
    const headers: Record<string, string> = { ...forwardHeaders(req) }
    const res = await fetch(backendUrl, { method: 'DELETE', headers })
    const text = await res.text()
    
    return new Response(text, { 
      status: res.status, 
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } 
    })
  } catch (err: any) {
    if (err instanceof Response) {
      return err
    }
    console.error('[api/management/categories] DELETE Error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to delete category', message: err.message }), 
      { status: err.status || 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}