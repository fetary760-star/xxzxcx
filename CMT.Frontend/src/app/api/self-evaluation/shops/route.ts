import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * /api/self-evaluation/shops
 * 
 * FIXED: Consistent API_BASE using http (not https) for localhost development.
 * 
 * This route proxies to: backend /api/self-evaluation/Shop
 */

const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
).trim().replace(/\/+$/, '')

/**
 * Robust token extraction that works in Route Handlers.
 * Priority order:
 * 1. Authorization header (forwarded by middleware or sent by client)
 * 2. x-auth-token header (forwarded by middleware)
 * 3. HttpOnly cookies (access_token, auth_token, authToken)
 * 4. Manual cookie header parsing (fallback)
 */
function extractToken(req: NextRequest): string | null {
  // 1. Check Authorization header (forwarded by middleware)
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (authHeader) {
    const t = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (t && t !== 'null' && t !== 'undefined') return t
  }

  // 2. Check x-auth-token (forwarded by middleware)
  const forwarded = req.headers.get('x-auth-token')
  if (forwarded && forwarded.trim() && forwarded.trim() !== 'null' && forwarded.trim() !== 'undefined') {
    return forwarded.trim()
  }

  // 3. Extract from cookies using NextRequest's cookies API
  const cookieNames = ['access_token', 'auth_token', 'authToken']
  for (const name of cookieNames) {
    const cookie = req.cookies.get(name)
    if (cookie?.value) {
      const val = cookie.value.trim()
      if (val && val !== 'null' && val !== 'undefined' && val !== 'cookie-session' && val !== 'session') {
        return val
      }
    }
  }

  // 4. Fallback: manual cookie header parsing
  const cookieHeader = req.headers.get('cookie')
  if (cookieHeader) {
    for (const name of cookieNames) {
      const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)
      const m = cookieHeader.match(re)
      if (m) {
        try {
          const raw = decodeURIComponent(m[1]).trim()
          if (raw && raw !== 'null' && raw !== 'undefined' && raw !== 'cookie-session') {
            return raw
          }
        } catch {
          const raw = m[1].trim()
          if (raw && raw !== 'null' && raw !== 'undefined') {
            return raw
          }
        }
      }
    }
  }

  return null
}

function buildHeaders(req: NextRequest, token: string, extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...extra,
  }

  // Forward cookies so backend can also read them if needed
  const cookie = req.headers.get('cookie')
  if (cookie) headers['Cookie'] = cookie

  // Forward CSRF headers if present
  const csrfToken = req.headers.get('x-csrf-token')
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken

  return headers
}

export async function GET(req: NextRequest) {
  try {
    const token = extractToken(req)
    if (!token) {
      console.error('[SHOPS API] No token found. Cookie header present:', !!req.headers.get('cookie'))
      console.error('[SHOPS API] Cookies available:', [...req.cookies.getAll().map(c => c.name)])
      return NextResponse.json(
        { message: 'Unauthorized - No valid authentication token found' },
        { status: 401 }
      )
    }

    const url = new URL(req.url)
    const queryString = url.search || ''
    const backendUrl = `${API_BASE}/self-evaluation/Shop${queryString}`

    console.log('[SHOPS API] Proxying GET to:', backendUrl)

    const headers = buildHeaders(req, token, { 'Content-Type': 'application/json' })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    let response: Response
    try {
      response = await fetch(backendUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch (fetchErr: any) {
      clearTimeout(timeoutId)
      console.error('[SHOPS API] Fetch error:', fetchErr?.message, 'URL:', backendUrl)
      if (fetchErr.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Backend request timed out', details: 'Timeout after 15000ms' },
          { status: 504 }
        )
      }
      return NextResponse.json(
        { error: 'Backend unreachable', details: fetchErr?.message ?? String(fetchErr), backendUrl },
        { status: 502 }
      )
    }

    clearTimeout(timeoutId)

    // If backend returns 401, log details for debugging
    if (response.status === 401) {
      const errorBody = await response.text().catch(() => '')
      console.error('[SHOPS API] Backend returned 401. Response:', errorBody)
      console.error('[SHOPS API] Token (first 20 chars):', token.substring(0, 20) + '...')
      return NextResponse.json(
        { message: 'Backend authentication failed', details: errorBody },
        { status: 401 }
      )
    }

    const contentType = response.headers.get('content-type') || ''

    if (response.status === 204) {
      return new Response(null, { status: 204 })
    }

    if (contentType.includes('application/json')) {
      const data = await response.json().catch(() => null)
      return NextResponse.json(data, { status: response.status })
    }

    const text = await response.text().catch(() => '')
    return new Response(text, {
      status: response.status,
      headers: { 'Content-Type': contentType || 'text/plain' },
    })
  } catch (err: unknown) {
    console.error('[SHOPS API] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Internal server error', details: String(err) },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = extractToken(req)
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const backendUrl = `${API_BASE}/self-evaluation/Shop`
    const headers = buildHeaders(req, token, { 'Content-Type': 'application/json' })

    let body: string | null = null
    try {
      const text = await req.text()
      if (text) body = text
    } catch { /* no body */ }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    let response: Response
    try {
      response = await fetch(backendUrl, {
        method: 'POST',
        headers,
        body,
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch (fetchErr: any) {
      clearTimeout(timeoutId)
      if (fetchErr.name === 'AbortError') {
        return NextResponse.json({ error: 'Backend request timed out' }, { status: 504 })
      }
      return NextResponse.json({ error: 'Backend unreachable', details: fetchErr?.message ?? String(fetchErr) }, { status: 502 })
    }

    clearTimeout(timeoutId)

    const contentType = response.headers.get('content-type') || ''
    if (response.status === 204) return new Response(null, { status: 204 })
    if (contentType.includes('application/json')) {
      const data = await response.json().catch(() => null)
      return NextResponse.json(data, { status: response.status })
    }
    const text = await response.text().catch(() => '')
    return new Response(text, { status: response.status, headers: { 'Content-Type': contentType || 'text/plain' } })
  } catch (err: unknown) {
    console.error('[SHOPS API] POST error:', err)
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const token = extractToken(req)
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const queryString = url.search || ''
    const backendUrl = `${API_BASE}/self-evaluation/Shop${queryString}`
    const headers = buildHeaders(req, token, { 'Content-Type': 'application/json' })

    let body: string | null = null
    try {
      const text = await req.text()
      if (text) body = text
    } catch { /* no body */ }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    let response: Response
    try {
      response = await fetch(backendUrl, {
        method: 'PUT',
        headers,
        body,
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch (fetchErr: any) {
      clearTimeout(timeoutId)
      if (fetchErr.name === 'AbortError') {
        return NextResponse.json({ error: 'Backend request timed out' }, { status: 504 })
      }
      return NextResponse.json({ error: 'Backend unreachable', details: fetchErr?.message ?? String(fetchErr) }, { status: 502 })
    }

    clearTimeout(timeoutId)

    const contentType = response.headers.get('content-type') || ''
    if (response.status === 204) return new Response(null, { status: 204 })
    if (contentType.includes('application/json')) {
      const data = await response.json().catch(() => null)
      return NextResponse.json(data, { status: response.status })
    }
    const text = await response.text().catch(() => '')
    return new Response(text, { status: response.status, headers: { 'Content-Type': contentType || 'text/plain' } })
  } catch (err: unknown) {
    console.error('[SHOPS API] PUT error:', err)
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = extractToken(req)
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(req.url)
    const queryString = url.search || ''
    const backendUrl = `${API_BASE}/self-evaluation/Shop${queryString}`
    const headers = buildHeaders(req, token, { 'Content-Type': 'application/json' })

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    let response: Response
    try {
      response = await fetch(backendUrl, {
        method: 'DELETE',
        headers,
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch (fetchErr: any) {
      clearTimeout(timeoutId)
      if (fetchErr.name === 'AbortError') {
        return NextResponse.json({ error: 'Backend request timed out' }, { status: 504 })
      }
      return NextResponse.json({ error: 'Backend unreachable', details: fetchErr?.message ?? String(fetchErr) }, { status: 502 })
    }

    clearTimeout(timeoutId)

    const contentType = response.headers.get('content-type') || ''
    if (response.status === 204) return new Response(null, { status: 204 })
    if (contentType.includes('application/json')) {
      const data = await response.json().catch(() => null)
      return NextResponse.json(data, { status: response.status })
    }
    const text = await response.text().catch(() => '')
    return new Response(text, { status: response.status, headers: { 'Content-Type': contentType || 'text/plain' } })
  } catch (err: unknown) {
    console.error('[SHOPS API] DELETE error:', err)
    return NextResponse.json({ error: 'Internal server error', details: String(err) }, { status: 500 })
  }
}