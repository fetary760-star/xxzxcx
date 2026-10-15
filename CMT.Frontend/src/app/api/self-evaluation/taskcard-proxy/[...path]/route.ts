import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * /api/self-evaluation/taskcard-proxy/[...path]/route.ts
 *
 * Catch-all proxy for the Task Card tab. Mirrors the cmm-proxy route, but forwards
 * every sub-path to TaskCardProxyController so a single file covers:
 *
 *   GET    taskcard-proxy/search?ataCode=&partNumber=&ataRecordId=
 *   POST   taskcard-proxy/fetch-and-store
 *   GET    taskcard-proxy/documents?ataRecordId=&partNumber=
 *   GET    taskcard-proxy/documents/{id}/pdf        (binary pass-through)
 *   DELETE taskcard-proxy/documents/{id}
 *
 * MaintainX (http://svdcmpa01/maintenix) is intranet-only and its credentials live in
 * appsettings.json, so the browser must never call it directly.
 */

const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
).trim().replace(/\/+$/, '')

/** MaintainX scraping is slow: login → menu → search → detail → preview. */
const TIMEOUT_MS = 120000

function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (authHeader) {
    const t = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (t && t !== 'null' && t !== 'undefined') return t
  }

  const xAuthToken = req.headers.get('x-auth-token')
  if (xAuthToken && xAuthToken.trim() && xAuthToken !== 'null' && xAuthToken !== 'undefined') {
    return xAuthToken.trim()
  }

  const cookieNames = ['access_token', 'auth_token', 'authToken']
  for (const name of cookieNames) {
    const cookie = req.cookies.get(name)
    if (cookie?.value) {
      const val = cookie.value.trim()
      if (val && val !== 'null' && val !== 'undefined' && val !== 'cookie-session') return val
    }
  }

  const cookieHeader = req.headers.get('cookie')
  if (cookieHeader) {
    for (const name of cookieNames) {
      const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
      if (m) {
        try {
          const raw = decodeURIComponent(m[1]).trim()
          if (raw && raw !== 'null' && raw !== 'undefined' && raw !== 'cookie-session') return raw
        } catch {
          const raw = m[1].trim()
          if (raw && raw !== 'null' && raw !== 'undefined') return raw
        }
      }
    }
  }

  return null
}

function unauthorized() {
  return NextResponse.json(
    { success: false, found: false, errorMessage: 'Unauthorized. Please log in first.' },
    { status: 401 },
  )
}

async function forward(
  req: NextRequest,
  segments: string[],
  method: 'GET' | 'POST' | 'DELETE',
) {
  const token = extractToken(req)
  if (!token) return unauthorized()

  const search = new URL(req.url).search
  const subPath = segments.map(encodeURIComponent).join('/')
  const backendUrl = `${API_BASE}/self-evaluation/taskcard-proxy/${subPath}${search}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json, application/pdf',
    }

    let body: string | undefined
    if (method === 'POST') {
      body = await req.text()
      headers['Content-Type'] = 'application/json'
    }

    console.log(`[TASKCARD-PROXY] ${method} ${backendUrl}`)

    const response = await fetch(backendUrl, {
      method,
      headers,
      body,
      cache: 'no-store',
      signal: controller.signal,
    })

    const contentType = response.headers.get('content-type') || ''

    // Binary pass-through for stored / live task card PDFs.
    if (contentType.includes('application/pdf') || contentType.includes('octet-stream')) {
      const buffer = await response.arrayBuffer()
      return new NextResponse(buffer, {
        status: response.status,
        headers: {
          'Content-Type': contentType || 'application/pdf',
          'Content-Disposition':
            response.headers.get('content-disposition') || 'inline; filename="TaskCard.pdf"',
          'Cache-Control': 'no-store',
        },
      })
    }

    const text = await response.text()

    if (!response.ok) {
      console.error(`[TASKCARD-PROXY] Backend error ${response.status}: ${text.substring(0, 500)}`)

      if (response.status === 401) return unauthorized()
      if (response.status === 403) {
        return NextResponse.json(
          {
            success: false,
            found: false,
            errorMessage: 'You do not have permission to access the MaintainX task cards.',
          },
          { status: 403 },
        )
      }

      try {
        return NextResponse.json(JSON.parse(text), { status: response.status })
      } catch {
        return NextResponse.json(
          {
            success: false,
            found: false,
            errorMessage: text || `Backend returned HTTP ${response.status}`,
          },
          { status: response.status },
        )
      }
    }

    try {
      return NextResponse.json(JSON.parse(text), { status: 200 })
    } catch {
      return NextResponse.json(
        { success: false, found: false, errorMessage: 'Backend returned a non-JSON response.' },
        { status: 502 },
      )
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return NextResponse.json(
        {
          success: false,
          found: false,
          errorMessage:
            'Request to MaintainX timed out. The intranet server may be slow or unreachable.',
        },
        { status: 504 },
      )
    }

    console.error('[TASKCARD-PROXY] Error:', err?.message)
    return NextResponse.json(
      {
        success: false,
        found: false,
        errorMessage: `Failed to connect to the task card service: ${err?.message}`,
      },
      { status: 502 },
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return forward(req, path ?? [], 'GET')
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return forward(req, path ?? [], 'POST')
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params
  return forward(req, path ?? [], 'DELETE')
}