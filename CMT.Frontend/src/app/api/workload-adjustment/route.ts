import { NextRequest, NextResponse } from 'next/server'
import { buildTLScopeContext, filterWorkloadAdjustments } from '@/lib/tl-scope-filter'

/**
 * Root route for /api/workload-adjustment
 *
 * Handles requests to the base path (no sub-path segments):
 *   POST /api/workload-adjustment — Engineer creates a new adjustment request
 *   GET  /api/workload-adjustment — List all adjustment requests (if supported)
 *
 * RBAC FIX: GET responses are now filtered by TL scope when the requesting
 * user is a Team Leader with a restricted scope (set by a Director).
 *
 * CSRF FIX: The .NET backend's CsrfMiddleware validates CSRF tokens for all
 * state-changing requests (POST/PUT/DELETE/PATCH) by comparing the X-CSRF-Token
 * header with the CSRF-TOKEN cookie. Both MUST be forwarded for the request
 * to pass validation. The /api/workload-adjustment endpoint is NOT in the
 * backend's CSRF skip list, so tokens must be included.
 */

const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
).replace(/\/+$/, '')

/** Extract auth token from Authorization header or cookies */
function extractAuthHeader(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization')
  if (authHeader) return authHeader

  const cookie = request.headers.get('cookie')
  if (cookie) {
    const tokenMatch = cookie.match(/(?:^|;\s*)(?:auth_token|authToken)=([^;]+)/)
    if (tokenMatch) {
      return `Bearer ${decodeURIComponent(tokenMatch[1])}`
    }
  }

  return null
}

/** Build headers to forward to the backend.
 *  CSRF FIX: We now forward the X-CSRF-Token header AND keep the CSRF-TOKEN
 *  cookie so the .NET CsrfMiddleware can validate them (header must match cookie).
 */
function buildForwardHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  const authHeader = extractAuthHeader(request)
  if (authHeader) {
    headers['Authorization'] = authHeader
  }

  // Forward ALL cookies including CSRF-TOKEN (backend needs it for validation)
  const cookie = request.headers.get('cookie')
  if (cookie) {
    headers['Cookie'] = cookie
  }

  const contentType = request.headers.get('content-type')
  if (contentType) {
    headers['Content-Type'] = contentType
  }

  // CSRF FIX: Forward the X-CSRF-Token header to the backend
  // The backend's CsrfMiddleware compares this header value with the CSRF-TOKEN cookie
  const csrfToken = request.headers.get('x-csrf-token') ||
                   request.headers.get('X-CSRF-Token') ||
                   request.cookies.get('CSRF-TOKEN')?.value ||
                   request.cookies.get('X-CSRF-TOKEN')?.value

  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken
  }

  return headers
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const queryString = url.search
    const backendUrl = `${API_BASE}/workload-adjustment${queryString}`

    const headers = buildForwardHeaders(request)

    const backendResponse = await fetch(backendUrl, {
      method: 'GET',
      headers,
      cache: 'no-store',
    })

    const responseText = await backendResponse.text().catch(() => '')

    let responseBody: any
    try {
      responseBody = JSON.parse(responseText)
    } catch {
      responseBody = responseText
    }

    if (typeof responseBody === 'string') {
      return new NextResponse(responseBody, {
        status: backendResponse.status,
        headers: { 'Content-Type': backendResponse.headers.get('content-type') || 'application/json' },
      })
    }

    // ── TL Scope Filtering ──────────────────────────────────────────────
    // After fetching data from the backend, check if the requesting user
    // is a TL with a restricted scope. If so, filter the results to only
    // include items related to users within their allowedUserIds.
    if (backendResponse.ok && responseBody && typeof responseBody === 'object') {
      const authHeader = extractAuthHeader(request)
      if (authHeader) {
        try {
          const ctx = await buildTLScopeContext(authHeader)
          if (ctx.isRestricted) {
            // responseBody may be an array or an object with a nested array
            if (Array.isArray(responseBody)) {
              responseBody = filterWorkloadAdjustments(responseBody, ctx)
            } else {
              // Try common envelope keys
              for (const key of ['data', 'items', 'requests', 'adjustments', 'payload', 'results']) {
                if (Array.isArray(responseBody[key])) {
                  responseBody[key] = filterWorkloadAdjustments(responseBody[key], ctx)
                  break
                }
              }
            }
            console.log('[api/workload-adjustment] TL scope filtering applied')
          }
        } catch (err: any) {
          console.error('[api/workload-adjustment] TL scope filter error:', err?.message)
        }
      }
    }

    return NextResponse.json(responseBody, { status: backendResponse.status })
  } catch (error: any) {
    console.error('[api/workload-adjustment] GET error:', error?.message || error)
    return NextResponse.json(
      { error: 'Failed to proxy request to backend', details: error?.message },
      { status: 502 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const queryString = url.search
    const backendUrl = `${API_BASE}/workload-adjustment${queryString}`

    const headers = buildForwardHeaders(request)

    let body: string | undefined
    try {
      body = await request.text()
    } catch {
      // No body
    }

    const backendResponse = await fetch(backendUrl, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
    })

    const responseText = await backendResponse.text().catch(() => '')

    let responseBody: any
    try {
      responseBody = JSON.parse(responseText)
    } catch {
      responseBody = responseText
    }

    // If backend returns 403 with CSRF error, provide helpful message
    if (backendResponse.status === 403) {
      const errorMsg = typeof responseBody === 'object' ? (responseBody?.message || responseBody?.error || '') : String(responseBody)
      if (errorMsg.toLowerCase().includes('csrf')) {
        return NextResponse.json(
          { error: 'CSRF validation failed', message: 'CSRF validation failed. Please refresh the page and try again.' },
          { status: 403 }
        )
      }
    }

    if (typeof responseBody === 'string') {
      return new NextResponse(responseBody, {
        status: backendResponse.status,
        headers: { 'Content-Type': backendResponse.headers.get('content-type') || 'application/json' },
      })
    }

    return NextResponse.json(responseBody, { status: backendResponse.status })
  } catch (error: any) {
    console.error('[api/workload-adjustment] POST error:', error?.message || error)
    return NextResponse.json(
      { error: 'Failed to proxy request to backend', details: error?.message },
      { status: 502 }
    )
  }
}