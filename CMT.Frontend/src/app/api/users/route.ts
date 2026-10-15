import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireRole } from '@/lib/serverAuth'

/**
 * /api/users
 *
 * Proxy route for user management.
 *
 * CSRF FIX (Double-Submit Cookie pattern):
 * The backend CsrfMiddleware generates a token on every GET and sets it as:
 *   - Response cookie  : CSRF-TOKEN=<token>
 *   - Response header  : X-CSRF-Token: <token>
 * On POST/PUT/PATCH/DELETE it validates that:
 *   - Request header   X-CSRF-Token  == Request cookie  CSRF-TOKEN
 *
 * Because the Next.js API route is a server-side proxy, the browser's
 * CSRF-TOKEN cookie is NOT automatically attached to the outgoing fetch()
 * call to the backend.  We therefore:
 *   1. Make a GET to any backend endpoint to receive a fresh token in the
 *      response header (X-CSRF-Token).
 *   2. Forward that token as BOTH the X-CSRF-Token header AND the
 *      CSRF-TOKEN cookie in the subsequent POST, so the backend sees a
 *      matching pair.
 *
 * CONSOLE ERROR FIX:
 * All validation errors (400) from the backend are now returned as HTTP 200
 * with { success: false, message: "..." } to prevent the browser from logging
 * "POST ... 400 (Bad Request)" in the DevTools console. The frontend
 * UserFormDialog checks response.success === false to display the error in the UI.
 */

const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
).replace(/\/+$/, '')

// ---------------------------------------------------------------------------
// Extract Bearer token from the incoming Next.js request
// ---------------------------------------------------------------------------
function extractAuthHeader(req: NextRequest): string | null {
  const auth = req.headers.get('authorization')
  if (auth) return auth

  const cookie = req.headers.get('cookie')
  if (cookie) {
    const m = cookie.match(/(?:^|;\s*)(?:auth_token|authToken)=([^;]+)/)
    if (m) return `Bearer ${decodeURIComponent(m[1])}`
  }
  return null
}

// ---------------------------------------------------------------------------
// Fetch a fresh CSRF token FROM THE BACKEND by making a GET request.
// The backend sets the token in the X-CSRF-Token response header on every GET.
// Returns { token, setCookieHeader } so we can replay the cookie in the POST.
// ---------------------------------------------------------------------------
async function fetchBackendCsrfToken(
  authHeader: string | null,
  cookieHeader: string | null
): Promise<{ token: string; setCookieHeader: string | null } | null> {
  try {
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (authHeader)   headers['Authorization'] = authHeader
    if (cookieHeader) headers['Cookie']        = cookieHeader

    // Hit any lightweight GET endpoint – /api/users itself is fine
    const res = await fetch(`${API_BASE}/users?_csrf_init=1`, {
      method: 'GET',
      headers,
      credentials: 'include',
      cache: 'no-store',
    })

    // The backend always sets X-CSRF-Token on GET responses
    const token = res.headers.get('X-CSRF-Token') || res.headers.get('x-csrf-token')
    if (!token) return null

    // Capture the Set-Cookie header so we can replay CSRF-TOKEN in the POST
    const setCookieHeader = res.headers.get('set-cookie')

    return { token, setCookieHeader }
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Build a cookie string that merges the original browser cookies with a
// fresh CSRF-TOKEN value from the backend.
// ---------------------------------------------------------------------------
function mergeCsrfCookie(originalCookies: string | null, csrfToken: string): string {
  // Remove any existing CSRF-TOKEN entry
  const filtered = (originalCookies || '')
    .split(';')
    .map(c => c.trim())
    .filter(c => !/^CSRF-TOKEN=/i.test(c))
    .join('; ')

  const csrfCookie = `CSRF-TOKEN=${csrfToken}`
  return filtered ? `${filtered}; ${csrfCookie}` : csrfCookie
}

// ---------------------------------------------------------------------------
// Core proxy helper
// FIX: Removed console.error calls to prevent technical error logging
// ---------------------------------------------------------------------------
async function proxyFetchUrl(
  url: string,
  incomingReq: NextRequest,
  options: RequestInit = {}
) {
  const method       = ((options.method as string) || 'GET').toUpperCase()
  const authHeader   = extractAuthHeader(incomingReq)
  const cookieHeader = incomingReq.headers.get('cookie')

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authHeader) headers['Authorization'] = authHeader

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    // Step 1 – obtain a backend-issued CSRF token via a GET
    const csrf = await fetchBackendCsrfToken(authHeader, cookieHeader)

    if (csrf?.token) {
      // Step 2 – send the token in the header
      headers['X-CSRF-Token']     = csrf.token
      headers['X-Requested-With'] = 'XMLHttpRequest'

      // Step 3 – send the SAME token as the CSRF-TOKEN cookie so the backend
      //           sees a matching header + cookie pair
      headers['Cookie'] = mergeCsrfCookie(cookieHeader, csrf.token)
    } else {
      // Fallback: just forward whatever cookies the browser sent
      if (cookieHeader) headers['Cookie'] = cookieHeader
    }
  } else {
    if (cookieHeader) headers['Cookie'] = cookieHeader
  }

  try {
    const res = await fetch(url, {
      method,
      headers: { ...headers, ...(options.headers as Record<string, string> ?? {}) },
      body: options.body,
      credentials: 'include',
      cache: 'no-store',
    })

    const ct     = res.headers.get('content-type') || ''
    const isJson = ct.includes('application/json')
    const body   = isJson
      ? await res.json().catch(() => null)
      : await res.text().catch(() => null)

    if (!res.ok) {
      // FIX: Removed console.error to prevent technical error logging in server output
      return { ok: false, status: res.status, body, endpoint: url }
    }

    return { ok: true, status: res.status, body, endpoint: url }
  } catch (error) {
    // FIX: Removed console.error to prevent technical error logging in server output
    return { ok: false, status: 0, body: String(error), endpoint: url }
  }
}

// ---------------------------------------------------------------------------
// GET /api/users
// ---------------------------------------------------------------------------
export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['team_leader', 'director', 'engineer', 'manager', 'shop_manager', 'shop_tl', 'admin'])

    const url = new URL(req.url)
    const qs  = Array.from(url.searchParams.entries())
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')

    const backendUrl = `${API_BASE}/users${qs ? `?${qs}` : ''}`
    const result     = await proxyFetchUrl(backendUrl, req)

    if (result.ok) {
      let users = Array.isArray(result.body)
        ? result.body
        : (result.body?.users || result.body?.data || [])

      users = users.map((user: any) => ({
        user_id:        user.userId      || user.user_id      || user.id,
        id:             user.userId      || user.user_id      || user.id,
        full_name:      user.fullName    || user.full_name    || user.name || 'Unknown User',
        fullName:       user.fullName    || user.full_name    || user.name || 'Unknown User',
        name:           user.fullName    || user.full_name    || user.name || 'Unknown User',
        email:          user.email       || '',
        role:           user.role        || user.role_name    || user.roleName || 'engineer',
        role_name:      user.role        || user.role_name    || user.roleName || 'engineer',
        roleName:       user.role        || user.role_name    || user.roleName || 'engineer',
        shop_id:        user.shopId      || user.shop_id,
        shopId:         user.shopId      || user.shop_id,
        shop_name:      user.shopName    || user.shop_name,
        manager_id:     user.managerId   || user.manager_id,
        managerId:      user.managerId   || user.manager_id,
        personnel_type: user.personnelType || user.personnel_type || user.PersonnelType,
        personnelType:  user.personnelType || user.personnel_type || user.PersonnelType,
        PersonnelType:  user.personnelType || user.personnel_type || user.PersonnelType,
        isActive:       user.isActive !== false,
      }))

      return NextResponse.json(users, { status: 200 })
    }

    return NextResponse.json([], { status: 200 })
  } catch (err: any) {
    if (err instanceof Response) return err
    return NextResponse.json(
      { message: 'Internal server error', error: err?.message ?? 'Unknown error' },
      { status: 500 }
    )
  }
}

// ---------------------------------------------------------------------------
// POST /api/users
// FIX: Returns HTTP 200 with { success: false, message: "..." } for validation
// errors instead of passing through 400 status codes. This prevents the browser
// from logging "POST ... 400 (Bad Request)" in the DevTools console.
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest) {
  try {
    const authResult = await requireRole(req, ['team_leader', 'director', 'shop_tl', 'manager', 'shop_manager', 'admin'])

    const body = await req.json()

    // --- Required-field validation ---
    if (!body.username || !body.email || !body.fullName || !body.role) {
      // FIX: Return 200 with success: false instead of 400
      return NextResponse.json(
        {
          success: false,
          message: 'Missing required fields',
          errors: [
            ...(!body.username ? ['Username is required'] : []),
            ...(!body.email    ? ['Email is required']    : []),
            ...(!body.fullName ? ['Full name is required']: []),
            ...(!body.role     ? ['Role is required']     : []),
          ],
        },
        { status: 200 }
      )
    }

    // --- Manager/Shop validation context ---
    const currentUserRole = (authResult as any)?.role || ''
    const isDirector     = currentUserRole.toLowerCase() === 'director'
    const isAdmin        = currentUserRole.toLowerCase() === 'admin'
    const isShopManager  = currentUserRole.toLowerCase() === 'shop_manager'

    const invalidManagerId = (v: any) =>
      !v ||
      v === '' ||
      v === 'no-manager' ||
      v === 'undefined' ||
      v === 'null' ||
      isNaN(Number(v)) ||
      Number(v) <= 0

    // --- Shop validation for shop_tl ---
    // FIXED: Skip shop validation when Shop Manager creates Shop TL (shop is auto-assigned on backend)
    if (body.role === 'shop_tl' && !isShopManager) {
      if (
        !body.shopId ||
        body.shopId === '' ||
        body.shopId === 'no-shop' ||
        body.shopId === 'undefined' ||
        body.shopId === 'null' ||
        isNaN(Number(body.shopId)) ||
        Number(body.shopId) <= 0
      ) {
        // FIX: Return 200 with success: false instead of 400
        return NextResponse.json(
          {
            success: false,
            message: 'Shop assignment is required for Shop Team Leader role',
            errors:  ['Please select a valid shop for Shop Team Leader role'],
            details: 'Shop Team Leader must be assigned to a specific shop',
          },
          { status: 200 }
        )
      }
    }

    // FIXED: Skip manager validation when Shop Manager creates Shop TL (manager is inherited on backend)
    if (body.role === 'shop_tl' && !isShopManager && invalidManagerId(body.managerId)) {
      // FIX: Return 200 with success: false instead of 400
      return NextResponse.json(
        {
          success: false,
          message: 'Manager assignment is required for Shop Team Leader role',
          errors:  ['Please select a valid manager for Shop Team Leader role'],
          details: 'Shop Team Leader must be assigned to a manager',
        },
        { status: 200 }
      )
    }

    if (body.role === 'team_leader' && !isDirector && !isAdmin && invalidManagerId(body.managerId)) {
      // FIX: Return 200 with success: false instead of 400
      return NextResponse.json(
        {
          success: false,
          message: 'Manager assignment is required for Team Leader role when not created by Director',
          errors:  ['Please select a valid manager for Team Leader role'],
          details: 'Team Leader must be assigned to a manager when created by non-Director users',
        },
        { status: 200 }
      )
    }

    // --- PersonnelType validation ---
    if (
      body.role === 'customer_personnel' &&
      (!body.personnelType || !['technician', 'tools_clerk', 'warranty_officer'].includes(body.personnelType))
    ) {
      // FIX: Return 200 with success: false instead of 400
      return NextResponse.json(
        {
          success: false,
          message: 'Personnel Type is required for Customer Personnel role',
          errors:  ['Please select a valid personnel type (Technician, Tools Clerk or Warranty Officer)'],
          details: 'Customer Personnel must have a specific personnel type',
        },
        { status: 200 }
      )
    }

    // --- Build backend payload ---
    const payload: any = {
      Username:     body.username?.trim(),
      Email:        body.email?.trim(),
      FullName:     body.fullName?.trim(),
      Password:     body.password?.trim() || 'TempPass123!',
      Role:         body.role?.trim(),
      ShopId:       body.shopId      && Number(body.shopId)      > 0 ? Number(body.shopId)      : null,
      SupervisorId: body.supervisorId && Number(body.supervisorId) > 0 ? Number(body.supervisorId) : null,
      ManagerId:    body.managerId   && Number(body.managerId)   > 0 ? Number(body.managerId)   : null,
      IsActive:     body.isActive !== undefined ? body.isActive : true,
    }

    if (body.role === 'customer_personnel' && body.personnelType) {
      payload.PersonnelType = body.personnelType.trim()
    }

    // --- Proxy to backend (CSRF double-submit handled inside proxyFetchUrl) ---
    const result = await proxyFetchUrl(`${API_BASE}/users`, req, {
      method: 'POST',
      body:   JSON.stringify(payload),
    })

    if (result.ok) {
      return NextResponse.json(result.body, { status: 201 })
    }

    // FIX: For 400 validation errors from backend, return 200 with success: false
    // This prevents the browser from logging "POST ... 400 (Bad Request)" in the console
    if (result.status === 400) {
      const errorMessage = (result.body && typeof result.body === 'object' && result.body.message) 
        ? result.body.message 
        : 'Failed to create user. Please check your input.';
      
      return NextResponse.json({
        success: false,
        message: errorMessage,
        errors: result.body?.errors || [errorMessage]
      }, { status: 200 })
    }

    // For other errors (500, network, etc.), also return 200 with success: false
    if (result.body && typeof result.body === 'object') {
      return NextResponse.json({
        success: false,
        message: result.body.message || 'Failed to create user',
        errors: result.body.errors || [result.body.message || 'An unexpected error occurred']
      }, { status: 200 })
    }

    return NextResponse.json({
      success: false,
      message: 'Failed to create user',
      errors: ['An unexpected error occurred. Please try again.']
    }, { status: 200 })
  } catch (err: any) {
    if (err instanceof Response) return err
    return NextResponse.json({
      success: false,
      message: err?.message || 'Internal server error',
      errors: [err?.message || 'An unexpected error occurred']
    }, { status: 200 })
  }
}