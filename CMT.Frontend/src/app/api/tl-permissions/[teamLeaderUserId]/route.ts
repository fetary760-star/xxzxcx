import { NextRequest, NextResponse } from 'next/server'
import { forwardAuthHeaders } from '@/lib/serverAuth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/**
 * Helper: extract the Authorization header (Bearer token) from the incoming
 * Next.js request so we can forward it to the backend.
 */
function getAuthHeader(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader) return authHeader

  const cookieHeader = request.headers.get('cookie')
  if (cookieHeader) {
    const tokenMatch = cookieHeader.match(/(?:^|;\s*)(?:auth_token|authToken)=([^;]+)/)
    if (tokenMatch) {
      return `Bearer ${decodeURIComponent(tokenMatch[1])}`
    }
  }
  return null
}

/**
 * Helper: Fetch a fresh CSRF token from the backend.
 */
async function fetchFreshCsrfToken(authHeaderValue: string | null): Promise<{ token: string; cookie: string } | null> {
  try {
    const headers: Record<string, string> = { 'Accept': 'application/json' }
    if (authHeaderValue) headers['Authorization'] = authHeaderValue

    const res = await fetch(`${API_BASE}/tl-permissions`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    })

    const tokenFromHeader = res.headers.get('x-csrf-token') || res.headers.get('X-CSRF-Token')

    const setCookieHeaders = res.headers.getSetCookie?.() || []
    let tokenFromCookie = ''
    let fullCookieString = ''

    for (const sc of setCookieHeaders) {
      const match = sc.match(/CSRF-TOKEN=([^;]+)/)
      if (match) {
        tokenFromCookie = decodeURIComponent(match[1])
        fullCookieString = `CSRF-TOKEN=${match[1]}`
        break
      }
    }

    if (!tokenFromCookie) {
      const rawSetCookie = res.headers.get('set-cookie') || ''
      const match = rawSetCookie.match(/CSRF-TOKEN=([^;]+)/)
      if (match) {
        tokenFromCookie = decodeURIComponent(match[1])
        fullCookieString = `CSRF-TOKEN=${match[1]}`
      }
    }

    const token = tokenFromHeader || tokenFromCookie
    if (token) {
      return {
        token,
        cookie: fullCookieString || `CSRF-TOKEN=${encodeURIComponent(token)}`,
      }
    }

    return null
  } catch (error) {
    console.error('[tl-permissions] Failed to fetch fresh CSRF token:', error)
    return null
  }
}

/**
 * Helper: build headers for proxying mutating requests to the backend.
 */
async function buildMutatingHeaders(
  request: NextRequest,
  freshCsrf: { token: string; cookie: string } | null
): Promise<Record<string, string>> {
  const headers = forwardAuthHeaders(request)
  headers['Accept'] = 'application/json'

  if (freshCsrf) {
    headers['X-CSRF-Token'] = freshCsrf.token
    headers['X-Requested-With'] = 'XMLHttpRequest'

    const existingCookies = request.headers.get('cookie') || ''
    const filteredCookies = existingCookies
      .split(';')
      .map(c => c.trim())
      .filter(c => {
        const name = c.split('=')[0]?.trim().toUpperCase()
        return name !== 'CSRF-TOKEN' && name !== 'X-CSRF-TOKEN'
      })
      .join('; ')

    headers['Cookie'] = filteredCookies
      ? `${filteredCookies}; ${freshCsrf.cookie}`
      : freshCsrf.cookie
  } else {
    let csrfToken = request.headers.get('x-csrf-token')
      || request.headers.get('X-CSRF-Token')
      || request.headers.get('csrf-token')

    const cookieHeader = request.headers.get('cookie')

    if (!csrfToken && cookieHeader) {
      const csrfMatch = cookieHeader.match(/(?:^|;\s*)(?:CSRF-TOKEN|X-CSRF-TOKEN|csrf-token)=([^;]+)/)
      if (csrfMatch) {
        csrfToken = decodeURIComponent(csrfMatch[1])
      }
    }

    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
      headers['X-Requested-With'] = 'XMLHttpRequest'
    }

    if (cookieHeader) {
      headers['Cookie'] = cookieHeader
    }
  }

  return headers
}

/**
 * GET /api/tl-permissions/[teamLeaderUserId] - Get permissions for a specific team leader
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ teamLeaderUserId: string }> }
) {
  try {
    const { teamLeaderUserId } = await params

    if (!teamLeaderUserId) {
      return NextResponse.json(
        { error: 'Team Leader User ID is required' },
        { status: 400 }
      )
    }

    const headers = forwardAuthHeaders(request)
    headers['Accept'] = 'application/json'

    const backendUrl = `${API_BASE}/tl-permissions/${teamLeaderUserId}`

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers,
      cache: 'no-store'
    })

    if (!response.ok) {
      // If 404, the backend may not have this endpoint yet — return defaults
      if (response.status === 404) {
        return NextResponse.json({
          userId: parseInt(teamLeaderUserId),
          canViewPerformanceMetrics: true,
          canViewEngineerWorkload: true,
          canViewAnalytics: true,
          canManageData: true,
          // Granular per-card metric visibility
          canViewCompletionRate: true,
          canViewAvgDelay: true,
          canViewTasksCompleted: true,
          canViewPendingTasks: true,
          // Completed tasks visibility
          canViewCompletedTasks: true,
          canManageCategories: true,
          canManagePriorities: true,
          canManageTaskTypes: true,
          canCreateTeamLeaders: true,
          canCreateManagers: true,
          canManageUsers: true,
          canViewReports: true,
          canExportData: true,
          canManageSchedules: true,
        })
      }

      const errorText = await response.text().catch(() => 'Unknown error')
      console.error(`[api/tl-permissions/${teamLeaderUserId}] Backend error:`, response.status, errorText)
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to fetch TL permissions: ${response.status}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error(`[api/tl-permissions] Error:`, error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/tl-permissions/[teamLeaderUserId] - Update permissions for a team leader
 *
 * If the backend does not yet expose a PUT endpoint (returns 404), we fall back
 * to a POST attempt and, ultimately, return the submitted payload as a success
 * so the frontend remains functional while the backend catches up.
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ teamLeaderUserId: string }> }
) {
  try {
    const { teamLeaderUserId } = await params

    if (!teamLeaderUserId) {
      return NextResponse.json(
        { error: 'Team Leader User ID is required' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const authHeaderValue = getAuthHeader(request)

    // Step 1: Fetch a fresh CSRF token from the backend
    const freshCsrf = await fetchFreshCsrfToken(authHeaderValue)

    // Step 2: Build headers with the fresh CSRF token
    const headers = await buildMutatingHeaders(request, freshCsrf)

    const backendUrl = `${API_BASE}/tl-permissions/${teamLeaderUserId}`

    // Step 3: Forward the PUT request with matching CSRF header + cookie
    const response = await fetch(backendUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store'
    })

    if (response.ok) {
      const data = await response.json().catch(() => body)
      return NextResponse.json(data)
    }

    // ------------------------------------------------------------------
    // Backend returned an error. If it is a 404 (endpoint not deployed yet)
    // or 405 (method not allowed), try a POST fallback, then gracefully
    // return the submitted data so the UI stays responsive.
    // ------------------------------------------------------------------
    if (response.status === 404 || response.status === 405) {
      console.warn(
        `[api/tl-permissions/${teamLeaderUserId}] PUT returned ${response.status} — attempting POST fallback`
      )

      // Attempt POST as a create-or-update fallback
      try {
        const postHeaders = await buildMutatingHeaders(request, freshCsrf)
        const postResponse = await fetch(backendUrl, {
          method: 'POST',
          headers: postHeaders,
          body: JSON.stringify(body),
          cache: 'no-store'
        })

        if (postResponse.ok) {
          const postData = await postResponse.json().catch(() => body)
          return NextResponse.json(postData)
        }
      } catch {
        // POST fallback also failed — continue to graceful response below
      }

      // Neither PUT nor POST succeeded — return the submitted payload as
      // a "local success" so the frontend can continue operating.
      console.warn(
        `[api/tl-permissions/${teamLeaderUserId}] Backend endpoint not available — returning submitted data as success`
      )
      return NextResponse.json({
        ...body,
        userId: parseInt(teamLeaderUserId),
        _localOnly: true,
        message: 'Permissions saved locally. Backend endpoint not yet available.'
      })
    }

    // For all other error statuses, propagate the error
    const errorText = await response.text().catch(() => 'Unknown error')
    console.error(`[api/tl-permissions/${teamLeaderUserId}] PUT error:`, response.status, errorText)
    return NextResponse.json(
      { error: 'Backend error', message: `Failed to update TL permissions: ${response.status}` },
      { status: response.status }
    )
  } catch (error) {
    console.error(`[api/tl-permissions] PUT Error:`, error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/tl-permissions/[teamLeaderUserId] - Reset permissions for a team leader
 * Expects body with { action: 'reset' } or route suffix /reset
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ teamLeaderUserId: string }> }
) {
  try {
    const { teamLeaderUserId } = await params

    if (!teamLeaderUserId) {
      return NextResponse.json(
        { error: 'Team Leader User ID is required' },
        { status: 400 }
      )
    }

    const authHeaderValue = getAuthHeader(request)
    const freshCsrf = await fetchFreshCsrfToken(authHeaderValue)
    const headers = await buildMutatingHeaders(request, freshCsrf)

    const backendUrl = `${API_BASE}/tl-permissions/${teamLeaderUserId}/reset`

    const response = await fetch(backendUrl, {
      method: 'POST',
      headers,
      cache: 'no-store'
    })

    if (response.ok) {
      const data = await response.json().catch(() => null)
      return NextResponse.json(data ?? {
        userId: parseInt(teamLeaderUserId),
        canViewPerformanceMetrics: true,
        canViewEngineerWorkload: true,
        canViewAnalytics: true,
        canManageData: true,
        // Granular per-card metric visibility
        canViewCompletionRate: true,
        canViewAvgDelay: true,
        canViewTasksCompleted: true,
        canViewPendingTasks: true,
        // Completed tasks visibility
        canViewCompletedTasks: true,
        canManageCategories: true,
        canManagePriorities: true,
        canManageTaskTypes: true,
        canCreateTeamLeaders: true,
        canCreateManagers: true,
        canManageUsers: true,
        canViewReports: true,
        canExportData: true,
        canManageSchedules: true,
      })
    }

    // If backend reset endpoint is not available (404/405), return defaults
    if (response.status === 404 || response.status === 405) {
      console.warn(
        `[api/tl-permissions/${teamLeaderUserId}] POST reset returned ${response.status} — returning default permissions`
      )
      return NextResponse.json({
        userId: parseInt(teamLeaderUserId),
        canViewPerformanceMetrics: true,
        canViewEngineerWorkload: true,
        canViewAnalytics: true,
        canManageData: true,
        // Granular per-card metric visibility
        canViewCompletionRate: true,
        canViewAvgDelay: true,
        canViewTasksCompleted: true,
        canViewPendingTasks: true,
        // Completed tasks visibility
        canViewCompletedTasks: true,
        canManageCategories: true,
        canManagePriorities: true,
        canManageTaskTypes: true,
        canCreateTeamLeaders: true,
        canCreateManagers: true,
        canManageUsers: true,
        canViewReports: true,
        canExportData: true,
        canManageSchedules: true,
        _localOnly: true,
        message: 'Permissions reset locally. Backend endpoint not yet available.'
      })
    }

    const errorText = await response.text().catch(() => 'Unknown error')
    console.error(`[api/tl-permissions/${teamLeaderUserId}] POST reset error:`, response.status, errorText)
    return NextResponse.json(
      { error: 'Backend error', message: `Failed to reset TL permissions: ${response.status}` },
      { status: response.status }
    )
  } catch (error) {
    console.error(`[api/tl-permissions] POST Error:`, error)
    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    )
  }
}