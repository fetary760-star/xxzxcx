import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

export async function GET(req: NextRequest) {
  try {
    //('Auth Me API: Processing current user request')

    // Extract token from Authorization header or cookies.
    // Prefer the canonical "access_token" name set by the .NET backend;
    // fall back to legacy names for older clients that are still in flight.
    const authHeader = req.headers.get('authorization')
    let token = authHeader?.replace('Bearer ', '')

    if (!token) {
      const cookie = req.headers.get('cookie')
      if (cookie) {
        const tokenMatch = cookie.match(/(?:^|;\s*)(?:access_token|auth_token|authToken)=([^;]+)/)
        if (tokenMatch) {
          token = decodeURIComponent(tokenMatch[1])
        }
      }
    }

    if (!token) {
      console.error('Auth Me API: No token found')
      return NextResponse.json({
        message: 'Unauthorized'
      }, { status: 401 })
    }

    // Forward to backend auth/me endpoint
    const backendUrl = `${API_BASE}/auth/me`
    //('Auth Me API: Forwarding to backend:', backendUrl)

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      cache: 'no-store'
    })

    //('Auth Me API: Backend response status:', response.status)

    const contentType = response.headers.get('content-type') || ''
    const isJson = contentType.includes('application/json')
    const data = isJson ? await response.json().catch(() => null) : await response.text().catch(() => null)

    if (!response.ok) {
      console.error('Auth Me API: Backend request failed:', {
        status: response.status,
        data
      })

      return NextResponse.json({
        message: data?.message || data?.error || 'Unauthorized'
      }, { status: response.status })
    }

    //('Auth Me API: Current user retrieved successfully')

    // Return the user data
    return NextResponse.json(data, { status: 200 })

  } catch (error: any) {
    console.error('Auth Me API: Unexpected error:', error)
    
    return NextResponse.json({
      message: 'Unable to connect to server. Please check your internet connection.'
    }, { status: 500 })
  }
}