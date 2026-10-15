import { proxyRequest } from '../../proxy/utils'
import { resolveBearerToken } from '@/lib/proxy-auth'

/**
 * /api/notifications/bulk-action
 *
 * Proxies POST to backend: POST /api/notifications/bulk-action
 * Uses shared `resolveBearerToken` so token resolution works after a
 * full-page refresh (when only the HttpOnly access_token cookie remains).
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

export async function POST(req: Request) {
  try {
    const token = resolveBearerToken(req)
    const user = await fetchUserFromBackend(token)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const backendPath = '/notifications/bulk-action'
    return await proxyRequest(req, backendPath)
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Server error', details: err?.message ?? String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}