import { NextRequest, NextResponse } from 'next/server'
import { forwardAuthHeaders } from '@/lib/serverAuth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/**
 * GET /api/tl-permissions - Get all team leaders with permissions (Admin/Director only)
 */
export async function GET(request: NextRequest) {
  try {
    const headers = forwardAuthHeaders(request)
    headers['Accept'] = 'application/json'

    const backendUrl = `${API_BASE}/tl-permissions`

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers,
      cache: 'no-store'
    })

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error(`[api/tl-permissions] Backend error:`, response.status, errorText)
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