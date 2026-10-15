import { proxyRequest } from '../../../proxy/utils'
import { resolveBearerToken } from '@/lib/proxy-auth'

/**
 * /api/notifications/[notificationId]/read
 *
 * Proxies POST/PATCH to backend: POST /api/notifications/{notificationId}/read
 * Uses shared `resolveBearerToken` so token resolution works after a
 * full-page refresh (when only the HttpOnly access_token cookie remains).
 *
 * CRITICAL FIX: The browser does NOT send an Authorization header — it only
 * sends cookies. `proxyRequest` forwards headers as-is, so the backend never
 * receives a Bearer token and falls back to a default user id (causing 403).
 * We now inject the resolved token as an Authorization header into the
 * forwarded request so the backend can identify the real user.
 */

async function fetchUserFromBackend(token: string | null) {
  if (!token) return null
  const rawBackendUrl =
    process.env.BACKEND_URL ||
    process.env.CMT_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    'http://localhost:5000/api'

  const backendBase = rawBackendUrl.replace(/\/$/, '')
  const meUrl = `${backendBase}/auth/me`

  try {
    const resp = await fetch(meUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    if (!resp.ok) return null
    const body = await resp.json().catch(() => null)
    if (!body) return null
    return body.user ?? body
  } catch {
    return null
  }
}

/**
 * Creates a new Request clone with the Authorization header injected.
 * This ensures the backend receives the Bearer token even when the
 * browser only sent cookies.
 */
function injectAuthorizationHeader(req: Request, token: string): Request {
  const newHeaders = new Headers(req.headers)
  newHeaders.set('Authorization', `Bearer ${token}`)
  return new Request(req.url, {
    method: req.method,
    headers: newHeaders,
    body: req.body,
    // @ts-ignore — duplex is needed for streaming bodies in Node 18+
    duplex: 'half',
  })
}

export async function POST(
  req: Request,
  { params }: { params: { notificationId: string } }
) {
  try {
    const token = resolveBearerToken(req)
    const user = await fetchUserFromBackend(token)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { notificationId } = params
    const backendPath = `/notifications/${encodeURIComponent(notificationId)}/read`

    // Inject Authorization header so the backend can identify the real user
    const authorizedReq = token ? injectAuthorizationHeader(req, token) : req
    return await proxyRequest(authorizedReq, backendPath)
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Server error', details: err?.message ?? String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { notificationId: string } }
) {
  return POST(req, { params })
}