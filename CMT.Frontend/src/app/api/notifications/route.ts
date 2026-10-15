import { proxyRequest } from '../proxy/utils'
import { resolveBearerToken } from '@/lib/proxy-auth'

/**
 * /api/notifications
 *
 * GET:  Proxy to backend /api/notifications with query params (the backend
 *       resolves the user from the Authorization header).
 *       Falls back to /api/notifications/user/{userId} if the direct endpoint fails.
 *
 * POST: Proxy to backend /api/notifications/mark (legacy mark-as-read).
 *
 * TOKEN RESOLUTION: uses shared `resolveBearerToken` helper which checks
 *   1) Authorization header, 2) x-auth-token (forwarded by middleware),
 *   3) access_token / auth_token / authToken cookies. This fixes the
 *   page-refresh case where the in-memory JS token is lost but the HttpOnly
 *   cookie is still present.
 */

/* --- Helper: validate token by calling backend /auth/me --- */
async function fetchUserFromBackend(token: string | null) {
  if (!token) return null
  const rawBackendUrl =
    process.env.BACKEND_URL ||
    process.env.CMT_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    'http://localhost:5000/api'

  if (!rawBackendUrl) {
    console.error('[notifications] backend base url missing in env')
    return null
  }

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
  } catch (err) {
    console.error('[notifications] fetchUserFromBackend error', err)
    return null
  }
}

/* --- GET handler --- */
export async function GET(req: Request) {
  try {
    const token = resolveBearerToken(req)
    const user = await fetchUserFromBackend(token)
    if (!user) {
      return new Response(JSON.stringify({ message: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Forward query params from the original request
    const url = new URL(req.url)
    const queryString = url.search || ''

    // Try the direct /notifications endpoint first (backend resolves user from token)
    const directPath = `/notifications${queryString}`
    const directResponse = await proxyRequest(req, directPath)

    // If the direct endpoint succeeds, return it
    if (directResponse.status >= 200 && directResponse.status < 300) {
      return directResponse
    }

    // Fallback: use the /notifications/user/{userId} endpoint
    const userId = user.userId ?? user.id ?? user.user_id
    const fallbackParams = new URLSearchParams(url.searchParams)
    if (!fallbackParams.has('unreadOnly') && !fallbackParams.has('unread')) {
      fallbackParams.set('unread', 'true')
    }
    const fallbackPath = `/notifications/user/${encodeURIComponent(String(userId))}?${fallbackParams.toString()}`
    return await proxyRequest(req, fallbackPath)
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Server error', details: err?.message ?? String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/* --- POST handler to mark read (legacy) --- */
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

    const backendPath = '/notifications/mark'
    return await proxyRequest(req, backendPath)
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: 'Server error', details: err?.message ?? String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}