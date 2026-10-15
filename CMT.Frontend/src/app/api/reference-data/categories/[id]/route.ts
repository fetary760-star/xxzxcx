import { requireRole } from '@/lib/serverAuth'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

// Only team leaders, directors, and admins can modify categories
const ALLOWED = ['team_leader', 'teamleader', 'director', 'manager', 'admin', '1', '6', '7']

/**
 * Forward headers from client request to backend
 * Uses resolveAuthorizationHeader for robust token resolution (header / middleware / cookie fallback)
 * Includes CSRF token forwarding for state-changing requests
 */
function forwardHeaders(req: Request) {
  const h: Record<string, string> = {}
  
  // FIX (refresh cascade): resolve the bearer token from Authorization
  // header, middleware-forwarded x-auth-token header, OR access_token/
  // auth_token/authToken cookie
  const finalAuthHeader = resolveAuthorizationHeader(req)
  if (finalAuthHeader) {
    h.authorization = finalAuthHeader
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

/**
 * GET /api/reference-data/categories/[id]
 * Get a single category by ID
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Allow all authenticated users to read
    const ALLOWED_READ = ['team_leader', 'teamleader', 'director', 'engineer', 'customer_personnel', 'customerpersonnel', 'customer', 'shop_tl', 'manager', 'admin', '1', '2', '3', '4', '5', '6', '7']
    await requireRole(req, ALLOWED_READ)
    
    const { id } = await params
    const backendUrl = `${API_BASE}/reference-data/categories/${encodeURIComponent(id)}`
    const res = await fetch(backendUrl, { headers: forwardHeaders(req) })
    const text = await res.text()
    
    return new Response(text, { 
      status: res.status, 
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } 
    })
  } catch (err: unknown) {
    if (err instanceof Response) {
      return err
    }
    console.error('[api/reference-data/categories/[id]] GET Error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to fetch category', message: err instanceof Error ? err.message : 'Unknown error' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * PUT /api/reference-data/categories/[id]
 * Update a category by ID
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(req, ALLOWED)
    
    const { id } = await params
    const payload = await req.json().catch(() => null)
    
    const backendUrl = `${API_BASE}/reference-data/categories/${encodeURIComponent(id)}`
    const headers: Record<string, string> = { 
      'Content-Type': 'application/json', 
      ...forwardHeaders(req) 
    }
    
    const res = await fetch(backendUrl, { 
      method: 'PUT', 
      headers, 
      body: JSON.stringify(payload) 
    })
    const text = await res.text()
    
    return new Response(text, { 
      status: res.status, 
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } 
    })
  } catch (err: unknown) {
    if (err instanceof Response) {
      return err
    }
    console.error('[api/reference-data/categories/[id]] PUT Error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to update category', message: err instanceof Error ? err.message : 'Unknown error' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * DELETE /api/reference-data/categories/[id]
 * Delete a category by ID
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(req, ALLOWED)
    
    const { id } = await params
    const backendUrl = `${API_BASE}/reference-data/categories/${encodeURIComponent(id)}`
    const headers: Record<string, string> = { ...forwardHeaders(req) }
    
    const res = await fetch(backendUrl, { 
      method: 'DELETE', 
      headers 
    })
    const text = await res.text()
    
    return new Response(text, { 
      status: res.status, 
      headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } 
    })
  } catch (err: unknown) {
    if (err instanceof Response) {
      return err
    }
    console.error('[api/reference-data/categories/[id]] DELETE Error:', err)
    return new Response(
      JSON.stringify({ error: 'Failed to delete category', message: err instanceof Error ? err.message : 'Unknown error' }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}