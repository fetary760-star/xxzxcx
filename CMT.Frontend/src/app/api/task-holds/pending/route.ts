// If running in the browser, disable all console logging from this file.
if (typeof window !== 'undefined') {
  console.log = () => {};
}

import { NextRequest, NextResponse } from 'next/server'
import { buildTLScopeContext, filterHoldRequests } from '@/lib/tl-scope-filter'

/**
 * GET /api/task-holds/pending
 * Fetch all pending hold requests for Team Leaders
 *
 * FIX (refresh → 401 cascade):
 *   1. Previously this route ONLY looked at the `Authorization: Bearer ...`
 *      header. On a full page reload, the browser does NOT attach any
 *      Authorization header (the JS in-memory token is gone and the real
 *      token lives in an HttpOnly cookie that JS can't read). The request
 *      therefore failed with 401 even though the user was still logged in.
 *
 *      Now we also:
 *        - honor the `x-auth-token` header the Next.js `middleware.ts`
 *          forwards after validating the cookie, and
 *        - fall back to reading the `access_token` / `auth_token` /
 *          `authToken` cookie directly from the incoming request so that
 *          a browser refresh works even if middleware.ts can't reach
 *          `/auth/me`.
 *
 *   2. The backend base URL was read from `NEXT_PUBLIC_API_URL` which is
 *      not defined anywhere else in the project — every other route uses
 *      `CMT_API_BASE_URL` / `NEXT_PUBLIC_API_BASE_URL` (which ends with
 *      `/api`). The old code double-appended `/api` and hit a 404/500 in
 *      some deployments. Now we use the same `API_BASE` convention as the
 *      rest of the proxy routes.
 *
 *   3. The response structure handling and field normalization are kept
 *      exactly as before.
 */

// Canonical API base (matches the rest of the proxy routes in this app).
const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
).replace(/\/+$/, '')

/**
 * Resolve the bearer token from the incoming Next.js request.
 * Priority:
 *   1. Authorization: Bearer <token>
 *   2. x-auth-token header forwarded by middleware.ts
 *   3. access_token / auth_token / authToken cookie
 */
function resolveToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization') || ''
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const t = authHeader.slice(7).trim()
    if (t && t !== 'null' && t !== 'undefined') return t
  }

  const forwarded = request.headers.get('x-auth-token')
  if (forwarded && forwarded !== 'null' && forwarded !== 'undefined') {
    return forwarded
  }

  const cookieHeader = request.headers.get('cookie')
  if (cookieHeader) {
    const match = cookieHeader.match(
      /(?:^|;\s*)(?:access_token|auth_token|authToken)=([^;]+)/
    )
    if (match) {
      try {
        const t = decodeURIComponent(match[1]).trim()
        if (t && t !== 'null' && t !== 'undefined') return t
      } catch {
        // fall through
      }
    }
  }

  return null
}

export async function GET(request: NextRequest) {
  try {
    const token = resolveToken(request)

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized - No token provided' },
        { status: 401 }
      )
    }

    // Call the backend using the canonical API_BASE (already includes /api).
    const apiUrl = `${API_BASE}/task-holds/pending`

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // Forward cookies too, in case the backend prefers cookie auth.
        ...(request.headers.get('cookie')
          ? { Cookie: request.headers.get('cookie') as string }
          : {}),
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.error('[task-holds/pending] Backend error:', response.status, errorText)

      // Surface 401 cleanly so the client-side apiClient can trigger a
      // silent refresh instead of wiping auth state outright.
      if (response.status === 401) {
        return NextResponse.json(
          { error: 'Unauthorized', details: errorText || 'Token invalid or expired' },
          { status: 401 }
        )
      }

      return NextResponse.json(
        {
          error: `Backend error: ${response.status} ${response.statusText}`,
          details: errorText,
        },
        { status: response.status }
      )
    }

    const data = await response.json().catch(() => null)

    // Normalize the response structure.
    // Backend may return: { holdRequests: [...] } or { data: [...] } or just [...]
    let holdRequests: any[] = []

    if (Array.isArray(data)) {
      holdRequests = data
    } else if (data?.holdRequests && Array.isArray(data.holdRequests)) {
      holdRequests = data.holdRequests
    } else if (data?.data && Array.isArray(data.data)) {
      holdRequests = data.data
    } else if (data?.payload && Array.isArray(data.payload)) {
      holdRequests = data.payload
    } else if (data?.isSuccess && data?.payload && Array.isArray(data.payload)) {
      holdRequests = data.payload
    }

    // Normalize all field names (camelCase, PascalCase, snake_case).
    const normalizedRequests = holdRequests.map((req: any) => {
      const normalized = {
        holdRequestId:
          req.holdRequestId || req.HoldRequestId || req.hold_request_id || 0,
        taskId: req.taskId || req.TaskId || req.task_id || 0,
        serialNumber:
          req.serialNumber || req.SerialNumber || req.serial_number || '',
        partNumber: req.partNumber || req.PartNumber || req.part_number || '',
        description:
          req.description ||
          req.Description ||
          req.taskDescription ||
          req.TaskDescription ||
          '',
        requestedBy:
          req.requestedBy ||
          req.RequestedBy ||
          req.requested_by ||
          req.requestedByEngineerId ||
          req.RequestedByEngineerId ||
          '',
        requestedByName:
          req.requestedByName ||
          req.RequestedByName ||
          req.requested_by_name ||
          req.requestedByEngineerName ||
          req.RequestedByEngineerName ||
          'Unknown',
        requestedAt:
          req.requestedAt ||
          req.RequestedAt ||
          req.requested_at ||
          req.holdRequestedDate ||
          req.HoldRequestedDate ||
          req.createdAt ||
          req.CreatedAt ||
          new Date().toISOString(),
        reason:
          req.reason ||
          req.Reason ||
          req.holdReason ||
          req.HoldReason ||
          req.hold_reason ||
          'No reason provided',
        status: req.status || req.Status || 'Pending',
        reviewedBy:
          req.reviewedBy ||
          req.ReviewedBy ||
          req.reviewed_by ||
          req.reviewedByTlId ||
          req.ReviewedByTlId ||
          null,
        reviewedByName:
          req.reviewedByName ||
          req.ReviewedByName ||
          req.reviewed_by_name ||
          req.reviewedByTlName ||
          req.ReviewedByTlName ||
          null,
        reviewedAt:
          req.reviewedAt ||
          req.ReviewedAt ||
          req.reviewed_at ||
          req.reviewDate ||
          req.ReviewDate ||
          null,
        reviewNotes:
          req.reviewNotes ||
          req.ReviewNotes ||
          req.review_notes ||
          req.reviewComments ||
          req.ReviewComments ||
          null,
        daysWorkedByEngineer:
          req.daysWorkedByEngineer ||
          req.DaysWorkedByEngineer ||
          req.days_worked_by_engineer ||
          0,
        assignedDate:
          req.assignedDate || req.AssignedDate || req.assigned_date || null,
      }

      return normalized
    })

    // Keep only pending requests.
    let pendingRequests = normalizedRequests.filter((r: any) => {
      const status = (r.status || '').toString().toLowerCase().replace(/[_\s-]/g, '')
      return status === 'pending' || status === 'pendingapproval'
    })

    // TL scope filtering.
    // Build an Authorization header from the token we resolved so that
    // buildTLScopeContext works even when the original request only had
    // a cookie.
    try {
      const ctx = await buildTLScopeContext(`Bearer ${token}`)
      if (ctx.isRestricted) {
        pendingRequests = filterHoldRequests(pendingRequests, ctx)
      }
    } catch (err: any) {
      console.error('[task-holds/pending] TL scope filter error:', err?.message)
    }

    return NextResponse.json({
      holdRequests: pendingRequests,
      total: pendingRequests.length,
      success: true,
    })
  } catch (error: any) {
    console.error('[task-holds/pending] Error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch hold requests', details: error?.message },
      { status: 500 }
    )
  }
}