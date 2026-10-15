import { NextRequest, NextResponse } from 'next/server'
import { resolveBearerToken, resolveAuthorizationHeader, buildBackendProxyHeaders } from '@/lib/proxy-auth'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

export async function GET(request: NextRequest) {
  try {
    // Use shared proxy-auth helper to resolve token from header, middleware, or cookies
    const authHeader = resolveAuthorizationHeader(request)
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header missing' }, { status: 401 })
    }

    const response = await fetch(`${API_BASE}/help`, {
      method: 'GET',
      headers: buildBackendProxyHeaders(request),
      cache: 'no-store',
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch help content' }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Help API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Use shared proxy-auth helper to resolve token from header, middleware, or cookies
    const authHeader = resolveAuthorizationHeader(request)
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header missing' }, { status: 401 })
    }

    const body = await request.json()

    const response = await fetch(`${API_BASE}/help/feedback`, {
      method: 'POST',
      headers: buildBackendProxyHeaders(request, {
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to submit feedback' }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Help feedback API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}