import { NextRequest, NextResponse } from 'next/server'
import { buildTLScopeContext, filterWorkloadAdjustments } from '@/lib/tl-scope-filter'

/**
 * Catch-all proxy route for /api/workload-adjustment/*
 *
 * Proxies all requests to the backend WorkloadAdjustmentController:
 *   POST   /api/workload-adjustment                     — Engineer creates a new adjustment request
 *   PUT    /api/workload-adjustment/{id}/review          — Team Leader reviews (approve/reject) a request
 *   GET    /api/workload-adjustment/pending               — Get all pending requests (for TL dashboard)
 *   GET    /api/workload-adjustment/engineer/{engineerId} — Get requests by engineer
 *   GET    /api/workload-adjustment/task/{taskId}         — Get requests by task
 *   GET    /api/workload-adjustment/{id}                  — Get a single request by ID
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

/** Generic proxy handler for all HTTP methods */
async function proxyRequest(
  request: NextRequest,
  pathSegments: string[],
  method: string
): Promise<NextResponse> {
  try {
    const subPath = pathSegments.join('/')
    const url = new URL(request.url)
    const queryString = url.search
    const backendUrl = `${API_BASE}/workload-adjustment/${subPath}${queryString}`

    const headers = buildForwardHeaders(request)

    const fetchOptions: RequestInit = {
      method,
      headers,
      cache: 'no-store',
    }

    // Forward body for POST, PUT, PATCH methods
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        const body = await request.text()
        if (body) {
          fetchOptions.body = body
        }
      } catch {
        // No body to forward
      }
    }

    const backendResponse = await fetch(backendUrl, fetchOptions)

    // Read response body
    const responseText = await backendResponse.text().catch(() => '')

    // Try to parse as JSON
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

    // Build response headers
    const responseHeaders: Record<string, string> = {
      'Content-Type': backendResponse.headers.get('content-type') || 'application/json',
    }

    // Forward cache-control if present
    const cacheControl = backendResponse.headers.get('cache-control')
    if (cacheControl) {
      responseHeaders['Cache-Control'] = cacheControl
    }

    if (typeof responseBody === 'string') {
      return new NextResponse(responseBody, {
        status: backendResponse.status,
        headers: responseHeaders,
      })
    }

    // ── TL Scope Filtering (GET only) ───────────────────────────────────
    // After fetching data from the backend, check if the requesting user
    // is a TL with a restricted scope. If so, filter the results to only
    // include items related to users within their allowedUserIds.
    if (method === 'GET' && backendResponse.ok && responseBody && typeof responseBody === 'object') {
      const authHeader = extractAuthHeader(request)
      if (authHeader) {
        try {
          const ctx = await buildTLScopeContext(authHeader)
          if (ctx.isRestricted) {
            if (Array.isArray(responseBody)) {
              responseBody = filterWorkloadAdjustments(responseBody, ctx)
            } else {
              for (const key of ['data', 'items', 'requests', 'adjustments', 'payload', 'results']) {
                if (Array.isArray(responseBody[key])) {
                  responseBody[key] = filterWorkloadAdjustments(responseBody[key], ctx)
                  break
                }
              }
            }
            console.log(`[api/workload-adjustment/${pathSegments.join('/')}] TL scope filtering applied`)
          }
        } catch (err: any) {
          console.error(`[api/workload-adjustment/${pathSegments.join('/')}] TL scope filter error:`, err?.message)
        }
      }
    }

    return NextResponse.json(responseBody, {
      status: backendResponse.status,
      headers: responseHeaders,
    })
  } catch (error: any) {
    console.error(`[api/workload-adjustment] Proxy error (${method}):`, error?.message || error)
    return NextResponse.json(
      { error: 'Failed to proxy request to backend', details: error?.message },
      { status: 502 }
    )
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params
  return proxyRequest(request, resolvedParams.path, 'GET')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params
  return proxyRequest(request, resolvedParams.path, 'POST')
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params
  return proxyRequest(request, resolvedParams.path, 'PUT')
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params
  return proxyRequest(request, resolvedParams.path, 'DELETE')
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const resolvedParams = await params
  return proxyRequest(request, resolvedParams.path, 'PATCH')
}