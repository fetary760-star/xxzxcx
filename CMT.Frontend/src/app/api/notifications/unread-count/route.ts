import { NextResponse } from 'next/server'
import { resolveBearerToken } from '@/lib/proxy-auth'

/**
 * /api/notifications/unread-count
 *
 * Returns the unread notification count for the authenticated user.
 * Resolves the token via the shared `resolveBearerToken` helper so that
 * full-page refreshes (which lose the in-memory JS token but still have
 * the HttpOnly access_token cookie) work correctly.
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
    console.error('[notifications/unread-count] backend base url missing in env')
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
    console.error('[notifications/unread-count] fetchUserFromBackend error', err)
    return null
  }
}

/* --- GET handler --- */
export async function GET(req: Request) {
  try {
    const token = resolveBearerToken(req)
    const user = await fetchUserFromBackend(token)

    if (!user || !token) {
      return NextResponse.json({ unreadCount: 0 }, { status: 200 })
    }

    const userId = user.userId ?? user.id ?? user.user_id
    const rawBackendUrl =
      process.env.BACKEND_URL ||
      process.env.CMT_API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      'http://localhost:5000/api'

    const backendBase = rawBackendUrl.replace(/\/$/, '')

    const endpoints = [
      `${backendBase}/notifications/user/${encodeURIComponent(String(userId))}/unread-count`,
      `${backendBase}/notifications/unread-count?userId=${encodeURIComponent(String(userId))}`,
      `${backendBase}/notifications/user/${encodeURIComponent(String(userId))}?unread=true&countOnly=true`,
    ]

    for (const endpoint of endpoints) {
      try {
        const resp = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })

        if (resp.ok) {
          const data = await resp.json().catch(() => null)
          if (data !== null) {
            const count =
              typeof data === 'number'
                ? data
                : data.unreadCount ?? data.count ?? data.totalUnread ?? 0
            return NextResponse.json({ unreadCount: count })
          }
        }
      } catch {
        continue
      }
    }

    // Fallback: read the main notifications list and count unread items.
    try {
      const notifResp = await fetch(
        `${backendBase}/notifications/user/${encodeURIComponent(String(userId))}?unread=true`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )

      if (notifResp.ok) {
        const data = await notifResp.json().catch(() => null)
        if (data) {
          if (Array.isArray(data)) {
            return NextResponse.json({ unreadCount: data.length })
          }
          if (data.notifications && Array.isArray(data.notifications)) {
            const unread = data.notifications.filter((n: any) => !n.isRead)
            return NextResponse.json({
              unreadCount: data.unreadCount ?? unread.length,
            })
          }
          if (typeof data.unreadCount === 'number') {
            return NextResponse.json({ unreadCount: data.unreadCount })
          }
          if (typeof data.totalCount === 'number') {
            return NextResponse.json({ unreadCount: data.totalCount })
          }
        }
      }
    } catch {
      // Fall through to default.
    }

    return NextResponse.json({ unreadCount: 0 })
  } catch (err: any) {
    console.error('[notifications/unread-count] error:', err?.message ?? err)
    return NextResponse.json({ unreadCount: 0 })
  }
}