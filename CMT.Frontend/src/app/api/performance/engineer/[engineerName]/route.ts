import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireRole } from '@/lib/serverAuth'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

/**
 * /api/performance/engineer/[engineerName]
 *
 * Get detailed performance data for a specific engineer
 * - Enforces Team Leader / Director role via requireRole
 * - Connects directly to backend performance service
 * - Returns real performance data from database
 */

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/**
 * Proxy fetch that forwards auth headers from incoming request
 */
async function proxyFetchUrl(url: string, incomingReq?: NextRequest) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (incomingReq) {
    // REFRESH FIX: resolve Authorization from Authorization header,
    // middleware-forwarded x-auth-token, or access_token/auth_token cookie
    // so per-engineer performance data still loads after a full page reload.
    const auth = resolveAuthorizationHeader(incomingReq)
    if (auth) {
      headers['Authorization'] = auth
    }
    // Forward the raw Cookie header so cookie-auth-based backends work too.
    const cookie = incomingReq.headers.get('cookie')
    if (cookie) {
      headers['Cookie'] = cookie
    }
  }

  //('Fetching engineer performance data from:', url)
  //('Request headers:', Object.keys(headers))

  try {
    const res = await fetch(url, { 
      method: 'GET', 
      headers,
      cache: 'no-store'
    })
    
    //('Backend response status:', res.status)
    
    const ct = res.headers.get('content-type') || ''
    const isJson = ct.includes('application/json')
    const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null)
    
    if (!res.ok) {
      console.error('Backend error response:', { status: res.status, body })
      return { ok: false, status: res.status, body, endpoint: url }
    }
    
    //('Successfully fetched engineer performance data')
    return { ok: true, status: res.status, body, endpoint: url }
  } catch (error) {
    console.error('Network error fetching engineer performance data:', error)
    return { ok: false, status: 0, body: String(error), endpoint: url }
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ engineerName: string }> }
) {
  try {
    const { engineerName } = await params
    //('Engineer Performance API: Processing request for:', engineerName)
    
    // Require TL or Director role
    await requireRole(req, ['team_leader', 'director'])
    //('Engineer Performance API: Authorization successful')

    // FIXED: Build query string from incoming request (preserve all params including date and category filters)
    const url = new URL(req.url)
    const qs = Array.from(url.searchParams.entries())
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')

    // FIXED: Forward all query params (including category) to backend performance endpoint
    const backendUrl = `${API_BASE}/performance/engineer/${encodeURIComponent(engineerName)}${qs ? `?${qs}` : ''}`
    const result = await proxyFetchUrl(backendUrl, req)

    if (result.ok) {
      //('Engineer Performance API: Successfully retrieved data from backend')
      return NextResponse.json(result.body, { status: 200 })
    }

    // If backend is not available or returns error, return empty data structure
    //('Engineer Performance API: Backend failed, returning empty data structure')
    
    const emptyData = {
      engineer_name: engineerName,
      total_tasks: 0,
      completed_tasks: 0,
      on_time_tasks: 0,
      delayed_tasks: 0,
      avg_delay_days: 0,
      tasks: []
    }
    
    return NextResponse.json(emptyData, { status: 200 })

  } catch (err: any) {
    console.error('Engineer Performance API: Unexpected error', err)
    if (err instanceof Response) return err
    return NextResponse.json({ 
      message: 'Internal server error',
      error: err?.message ?? 'Unknown error' 
    }, { status: 500 })
  }
}