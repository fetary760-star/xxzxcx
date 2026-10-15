import { requireRole } from '@/lib/serverAuth'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://svhqiis03:3001/api').replace(/\/+$/, '')
const ALLOWED = ['team_leader', 'teamleader', 'director', 'manager', 'shop_manager', 'admin', 'shop_tl', 'engineer', '1', '2', '3', '4', '5', '6', '7', '8']

function forwardHeaders(req: Request) {
  const h: Record<string, string> = {}
  // FIX (refresh cascade): resolve the bearer token from Authorization
  // header, middleware-forwarded x-auth-token header, OR access_token/
  // auth_token/authToken cookie
  const finalAuthHeader = resolveAuthorizationHeader(req)
  if (finalAuthHeader) h.authorization = finalAuthHeader
  const c = req.headers.get('cookie')
  if (c) h.cookie = c
  return h
}

async function proxyFetch(url: string, opts: RequestInit = {}) {
  return fetch(url, opts)
}

export async function GET(req: Request) {
  await requireRole(req, ALLOWED)
  const backendUrl = `${API_BASE}/reference-data/sub-types`
  try {
    const res = await proxyFetch(backendUrl, { headers: forwardHeaders(req) })
    const text = await res.text()
    return new Response(text, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } })
  } catch (err: any) {
    console.error('[api/management/sub-types] GET proxy error:', err)
    return new Response(JSON.stringify({ error: 'Proxy error' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }
}

// (POST/PUT/DELETE implemented the same as in the previous file)
export { POST, PUT, DELETE } from '../management/subtypes/route'