import { requireRole } from '@/lib/serverAuth'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'
const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

// Allow customer_personnel, shop_tl, and other roles to read target days for task creation
const ALLOWED = ['team_leader','teamleader','director','engineer','customer_personnel','customerpersonnel','customer','shop_tl','shoptl','shop-tl','1','2','3','4','5']

function forwardHeaders(req: Request) {
  const h: Record<string, string> = {}
  const finalAuthHeader = resolveAuthorizationHeader(req)
  if (finalAuthHeader) h.authorization = finalAuthHeader
  if (req.headers.get('cookie')) h.cookie = req.headers.get('cookie') as string
  return h
}

export async function GET(req: Request) {
  try {
    await requireRole(req, ALLOWED)
    // FIX: Use category-target-days endpoint (same as management route) to ensure
    // consistent data structure with category_id mapping for auto-calculation
    const backendUrl = `${API_BASE}/reference-data/category-target-days`
    const res = await fetch(backendUrl, { headers: forwardHeaders(req) })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
  } catch (err: any) {
    console.error('[api/reference-data/target-days] Error:', err)
    return new Response(JSON.stringify({ error: 'Failed to fetch target days', message: err.message }), { 
      status: err.status || 500, 
      headers: { 'Content-Type': 'application/json' } 
    })
  }
}