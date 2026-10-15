import { NextRequest, NextResponse } from 'next/server'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header missing' }, { status: 401 })
    }

    // Get CSRF token from header or cookie
    const csrfToken = request.headers.get('x-csrf-token') || 
                      request.headers.get('X-CSRF-Token') ||
                      request.cookies.get('CSRF-TOKEN')?.value ||
                      ''

    const body = await request.json()

    // Build headers for backend request
    const headers: Record<string, string> = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    }

    // Add CSRF token if available
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
      headers['X-XSRF-TOKEN'] = csrfToken
    }

    // Forward cookies to backend
    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader
    }

    const response = await fetch(`${API_BASE}/help/feedback`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'include',
    })

    // If backend returns 403, it might be CSRF validation failure or permission issue
    if (response.status === 403) {
      const errorText = await response.text().catch(() => '')
      console.error('Backend returned 403:', errorText)
      return NextResponse.json({ 
        error: 'Access denied. This may be due to CSRF validation or permission issues.',
        details: errorText 
      }, { status: 403 })
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error')
      console.error('Backend error:', response.status, errorText)
      return NextResponse.json({ error: 'Failed to submit feedback', details: errorText }, { status: response.status })
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Help feedback API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}