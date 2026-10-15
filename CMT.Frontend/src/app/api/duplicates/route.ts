// API route for fetching duplicate tasks with filtering
import { NextRequest, NextResponse } from 'next/server'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    
    // Build query parameters for backend API
    const params = new URLSearchParams()
    
    // Add all query parameters
    searchParams.forEach((value, key) => {
      params.append(key, value)
    })
    
    // FIX (refresh cascade): resolve the bearer token from Authorization
    // header, middleware-forwarded x-auth-token header, OR access_token/
    // auth_token/authToken cookie
    const finalAuthHeader = resolveAuthorizationHeader(req)
    const cookie = req.headers.get('cookie')
    
    // Forward request to backend API
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'
    const response = await fetch(`${backendUrl}/api/duplicates?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(finalAuthHeader && { 'Authorization': finalAuthHeader }),
        ...(cookie && { 'Cookie': cookie })
      }
    })
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.error('Backend API error:', response.status, errorText)
      return NextResponse.json(
        { error: 'Failed to fetch duplicate tasks', details: errorText },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    return NextResponse.json(data)
    
  } catch (error: any) {
    console.error('Error in duplicates route:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}