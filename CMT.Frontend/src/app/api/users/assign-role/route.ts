import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * /api/users/assign-role
 * 
 * FIXED (v2):
 * 1. Added payload validation before proxying to catch type mismatches early.
 * 2. Logs the actual payload being sent to backend for debugging.
 * 
 * Backend endpoint: POST /api/users/assign-role (UserManagementController)
 * 
 * Expected backend request body (AssignRoleRequest):
 * {
 *   "userId": long (numeric),        // REQUIRED - must be > 0
 *   "role": string,                   // REQUIRED - must be in ValidRoles
 *   "shopId": Guid? (string or null), // OPTIONAL
 *   "departmentId": Guid? (string or null), // OPTIONAL
 *   "supervisorUserId": Guid? (string or null), // OPTIONAL
 *   "managerId": long? (numeric or null), // OPTIONAL
 *   "jobTitle": string?,              // OPTIONAL
 *   "personnelType": string?          // OPTIONAL
 * }
 */

const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
).trim().replace(/\/+$/, '')

const VALID_ROLES = [
  'Admin', 'Director', 'Manager', 'ShopManager',
  'TeamLeader', 'Engineer', 'Technician', 'CertifyingStaff'
]

function extractToken(req: NextRequest): string | null {
  // 1. Authorization header (forwarded by middleware)
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (authHeader) {
    const t = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (t && t !== 'null' && t !== 'undefined') return t
  }

  // 2. x-auth-token header (forwarded by middleware)
  const xAuthToken = req.headers.get('x-auth-token')
  if (xAuthToken && xAuthToken.trim() && xAuthToken !== 'null' && xAuthToken !== 'undefined') {
    return xAuthToken.trim()
  }

  // 3. Cookies
  const cookieNames = ['access_token', 'auth_token', 'authToken']
  for (const name of cookieNames) {
    const cookie = req.cookies.get(name)
    if (cookie?.value) {
      const val = cookie.value.trim()
      if (val && val !== 'null' && val !== 'undefined' && val !== 'cookie-session') {
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

export async function POST(req: NextRequest) {
  try {
    const token = extractToken(req)
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    // Parse and validate the request body BEFORE proxying
    let body: string | null = null
    let parsedBody: any = null
    try {
      const text = await req.text()
      if (text) {
        body = text
        parsedBody = JSON.parse(text)
      }
    } catch { /* no body or invalid JSON */ }

    // Validate payload structure to give better error messages
    if (parsedBody) {
      const { userId, role, shopId } = parsedBody

      // Validate userId is a number > 0
      if (userId === undefined || userId === null) {
        return NextResponse.json(
          { message: 'userId is required' },
          { status: 400 }
        )
      }
      if (typeof userId === 'string' && isNaN(Number(userId))) {
        return NextResponse.json(
          { message: `userId must be a numeric ID (got string "${userId}"). Use the user's numeric ID, not their username.` },
          { status: 400 }
        )
      }
      const numericUserId = Number(userId)
      if (numericUserId <= 0) {
        return NextResponse.json(
          { message: `userId must be greater than 0 (got ${numericUserId})` },
          { status: 400 }
        )
      }

      // Validate role
      if (!role || typeof role !== 'string') {
        return NextResponse.json(
          { message: 'role is required' },
          { status: 400 }
        )
      }
      const roleMatch = VALID_ROLES.find(r => r.toLowerCase() === role.toLowerCase())
      if (!roleMatch) {
        return NextResponse.json(
          { message: `Invalid role "${role}". Valid roles: ${VALID_ROLES.join(', ')}` },
          { status: 400 }
        )
      }

      // Ensure userId is sent as a number (not string) to the backend
      // and role is in the correct casing
      parsedBody.userId = numericUserId
      parsedBody.role = roleMatch

      // Ensure shopId is either a valid GUID string or null (not a number)
      if (shopId !== undefined && shopId !== null) {
        if (typeof shopId === 'number') {
          // Backend expects Guid? — if it's 0, send null
          if (shopId === 0) {
            parsedBody.shopId = null
          } else {
            // This is likely wrong — shopId should be a GUID string
            console.warn('[ASSIGN-ROLE API] shopId is a number, backend expects Guid string. Sending as-is but this may fail.')
          }
        }
      }

      // Re-serialize the validated/fixed body
      body = JSON.stringify(parsedBody)
    }

    const backendUrl = `${API_BASE}/users/assign-role`

    console.log('[ASSIGN-ROLE API] Proxying POST to:', backendUrl)
    console.log('[ASSIGN-ROLE API] Payload:', body)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    }

    // Forward cookies
    const cookie = req.headers.get('cookie')
    if (cookie) headers['Cookie'] = cookie

    const csrfToken = req.headers.get('x-csrf-token')
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken

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
      console.error('[ASSIGN-ROLE API] Fetch error:', fetchErr?.message)
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
  } catch (err) {
    console.error('[ASSIGN-ROLE API] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}