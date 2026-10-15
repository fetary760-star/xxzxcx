import { NextRequest, NextResponse } from 'next/server'
import { requireRole, AuthError, forwardAuthHeaders } from '@/lib/serverAuth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

const ALLOWED = ['team_leader','teamleader','director','manager','shop_manager','engineer','customer_personnel','customerpersonnel','customer','shop_tl','shoptl','admin','1','2','3','4','5','6','7','8']
const MUTATION_ALLOWED = ['team_leader','teamleader','director','manager','shop_manager','admin','5','6','7','8']

/**
 * Convert an unknown caught value into a NextResponse.
 * - AuthError  → use its status + body
 * - Response   → legacy path (should no longer occur after serverAuth fix)
 * - anything else → 500
 */
async function handleCaughtError(error: unknown): Promise<NextResponse> {
  if (error instanceof AuthError) {
    return NextResponse.json(error.body, { status: error.status })
  }
  if (error instanceof Response) {
    const errorData = await error.json().catch(() => ({ error: 'Authentication failed' }))
    return NextResponse.json(errorData, { status: error.status })
  }
  const msg = error instanceof Error ? error.message : String(error)
  return NextResponse.json({ error: 'server_error', message: msg }, { status: 500 })
}

/**
 * Build headers for mutating requests (POST / PUT / DELETE).
 *
 * Forwards the JWT Authorization header AND all known CSRF token variants
 * so the upstream .NET backend AntiForgery middleware is satisfied regardless
 * of which header name it is configured to read.
 *
 * Token lookup order:
 *   1. Explicit request header sent by the browser client
 *   2. CSRF cookie forwarded by the browser (FIXED: proper alternation regex)
 *   3. No token found → headers sent without CSRF (backend will reject with 403)
 */
function buildMutationHeaders(req: NextRequest): Record<string, string> {
  const base = forwardAuthHeaders(req)
  base['Content-Type'] = 'application/json'

  // CRITICAL FIX: Remove any CSRF headers that forwardAuthHeaders may have set
  // with different casing. In JS objects, 'X-CSRF-Token' and 'X-CSRF-TOKEN' are
  // different keys, but HTTP headers are case-insensitive. Node's fetch sends both,
  // causing ASP.NET to combine them ("val, val") which won't match the cookie ("val").
  delete base['X-CSRF-Token']
  delete base['X-CSRF-TOKEN']
  delete base['X-XSRF-Token']
  delete base['X-XSRF-TOKEN']
  delete base['RequestVerificationToken']

  // ── 1. Prefer an explicit header the client already sent ──────────────────
  const fromHeader =
    req.headers.get('x-csrf-token') ||
    req.headers.get('x-xsrf-token') ||
    req.headers.get('requestverificationtoken')

  // ── 2. Fall back to a CSRF cookie set by /api/csrf ────────────────────────
  const cookieHeader = req.headers.get('cookie') || ''
  let tokenFromCookie: string | null = null
  const csrfCookieMatch = cookieHeader.match(
    /(?:^|;\s*)(?:CSRF-TOKEN|XSRF-TOKEN|X-CSRF-TOKEN|X-XSRF-TOKEN|csrf_token|xsrf_token|csrf-token)=([^;]+)/
  )
  if (csrfCookieMatch) {
    tokenFromCookie = decodeURIComponent(csrfCookieMatch[1])
  }

  // Use the token from the cookie (what the backend will compare against),
  // falling back to the header value from the client.
  // This ensures header === cookie on the backend side.
  const csrfToken = tokenFromCookie || fromHeader

  if (csrfToken) {
    // Use a SINGLE consistent key to avoid duplicate headers
    base['X-CSRF-Token']             = csrfToken
    base['X-XSRF-TOKEN']             = csrfToken
    base['RequestVerificationToken'] = csrfToken
  }

  // Always forward the raw Cookie header so the backend session middleware
  // can read the CSRF-TOKEN cookie directly.
  if (cookieHeader) {
    base['Cookie'] = cookieHeader
  }

  return base
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shops
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ALLOWED)

    const headers = forwardAuthHeaders(req)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10_000)

    let res: Response
    try {
      res = await fetch(`${API_BASE}/shops`, {
        method: 'GET',
        headers,
        signal: controller.signal,
        cache: 'no-store'
      })
    } finally {
      clearTimeout(timeoutId)
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      console.error('[api/shops] GET backend error:', res.status, errorText)
      return NextResponse.json(
        { error: 'backend_error', message: `Backend returned ${res.status}`, details: errorText },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)

  } catch (error) {
    console.error('[api/shops] GET error:', error)
    return handleCaughtError(error)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/shops  — create a shop
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    await requireRole(req, MUTATION_ALLOWED)

    const payload = await req.json().catch(() => null)

    if (!payload) {
      return NextResponse.json({ error: 'invalid_payload', message: 'Request body is required' }, { status: 400 })
    }
    if (!payload.name?.trim()) {
      return NextResponse.json({ error: 'validation_error', message: 'Shop name is required' }, { status: 400 })
    }

    const headers = buildMutationHeaders(req)

    // FIXED: use PascalCase property names to match the .NET model binder
    const res = await fetch(`${API_BASE}/shops`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        Name:        payload.name.trim(),
        Location:    payload.location?.trim()    ?? '',
        Description: payload.description?.trim() ?? '',
        IsActive:    payload.isActive !== undefined ? payload.isActive : true,
        ManagerId:   payload.managerId ?? null,
        TeamLeaderId: payload.teamLeaderId ?? payload.team_leader_id ?? null
      }),
      cache: 'no-store'
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      console.error('[api/shops] POST backend error:', res.status, errorText)
      return NextResponse.json(
        { error: 'backend_error', message: `Failed to create shop: ${res.status}`, details: errorText },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data, { status: 201 })

  } catch (error) {
    console.error('[api/shops] POST error:', error)
    return handleCaughtError(error)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/shops?id=<shopId>  — update a shop
// ─────────────────────────────────────────────────────────────────────────────
export async function PUT(req: NextRequest) {
  try {
    await requireRole(req, MUTATION_ALLOWED)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'invalid_request', message: 'Shop ID is required' }, { status: 400 })
    }

    const payload = await req.json().catch(() => null)

    if (!payload) {
      return NextResponse.json({ error: 'invalid_payload', message: 'Request body is required' }, { status: 400 })
    }
    if (!payload.name?.trim()) {
      return NextResponse.json({ error: 'validation_error', message: 'Shop name is required' }, { status: 400 })
    }

    const headers = buildMutationHeaders(req)

    // FIXED: use PascalCase property names to match the .NET model binder
    const res = await fetch(`${API_BASE}/shops/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        Name:        payload.name.trim(),
        Location:    payload.location?.trim()    ?? '',
        Description: payload.description?.trim() ?? '',
        IsActive:    payload.isActive !== undefined ? payload.isActive : true,
        TeamLeaderId: payload.teamLeaderId ?? payload.team_leader_id ?? null
      }),
      cache: 'no-store'
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      console.error('[api/shops] PUT backend error:', res.status, errorText)
      return NextResponse.json(
        { error: 'backend_error', message: `Failed to update shop: ${res.status}`, details: errorText },
        { status: res.status }
      )
    }

    const data = await res.json()
    return NextResponse.json(data)

  } catch (error) {
    console.error('[api/shops] PUT error:', error)
    return handleCaughtError(error)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/shops?id=<shopId>  — delete a shop
// ─────────────────────────────────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    await requireRole(req, MUTATION_ALLOWED)

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'invalid_request', message: 'Shop ID is required' }, { status: 400 })
    }

    const headers = buildMutationHeaders(req)

    const res = await fetch(`${API_BASE}/shops/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers,
      cache: 'no-store'
    })

    if (!res.ok) {
      const errorText = await res.text().catch(() => 'Unknown error')
      console.error('[api/shops] DELETE backend error:', res.status, errorText)

      // Try to parse JSON error from backend for richer error messages
      try {
        const errorJson = JSON.parse(errorText)
        return NextResponse.json(errorJson, { status: res.status })
      } catch {
        return NextResponse.json(
          { error: 'backend_error', message: errorText || `Failed to delete shop: ${res.status}` },
          { status: res.status }
        )
      }
    }

    // 204 No Content — backend may return empty body
    if (res.status === 204) {
      return NextResponse.json({ message: 'Shop deleted successfully' })
    }

    const data = await res.json().catch(() => ({ message: 'Shop deleted successfully' }))
    return NextResponse.json(data)

  } catch (error) {
    console.error('[api/shops] DELETE error:', error)
    return handleCaughtError(error)
  }
}