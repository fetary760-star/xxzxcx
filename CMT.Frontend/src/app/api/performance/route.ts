import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { requireRole, AuthError } from '@/lib/serverAuth'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

async function proxyFetchUrl(url: string, incomingReq?: NextRequest) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (incomingReq) {
    const auth = resolveAuthorizationHeader(incomingReq)
    if (auth) {
      headers['Authorization'] = auth
    }
    const cookie = incomingReq.headers.get('cookie')
    if (cookie) {
      headers['Cookie'] = cookie
    }
  }

  try {
    const res = await fetch(url, { 
      method: 'GET', 
      headers,
      cache: 'no-store'
    })
    
    const ct = res.headers.get('content-type') || ''
    const isJson = ct.includes('application/json')
    const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null)
    
    if (!res.ok) {
      console.error('Backend error response:', { status: res.status, body })
      return { ok: false, status: res.status, body, endpoint: url }
    }
    
    return { ok: true, status: res.status, body, endpoint: url }
  } catch (error) {
    console.error('Network error fetching performance data:', error)
    return { ok: false, status: 0, body: String(error), endpoint: url }
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, ['team_leader', 'director', 'manager', 'shop_manager', 'admin'])

    // Build query string from incoming request (preserve ALL params including new ones)
    const url = new URL(req.url)
    const qs = Array.from(url.searchParams.entries())
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')

    const backendUrl = `${API_BASE}/performance${qs ? `?${qs}` : ''}`
    const result = await proxyFetchUrl(backendUrl, req)

    if (result.ok) {
      return NextResponse.json(result.body, { status: 200 })
    }

    console.warn('Performance API: Backend returned error, returning empty data structure. Status:', result.status)
    
    const emptyData = {
      summary_table_data: [],
      chart_labels: [],
      chart_data_completed: [],
      chart_data_on_time: [],
      chart_data_delay_days: []
    }
    
    return NextResponse.json(emptyData, { status: 200 })

  } catch (err: any) {
    if (err instanceof AuthError) {
      return NextResponse.json(err.body, { status: err.status })
    }
    console.error('Performance API: Unexpected error', err)
    if (err instanceof Response) return err
    return NextResponse.json({ 
      message: 'Internal server error',
      error: err?.message ?? 'Unknown error' 
    }, { status: 500 })
  }
}
