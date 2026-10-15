// API route for processing duplicate tasks
import { NextRequest, NextResponse } from 'next/server'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    
    // Validate required fields
    if (!body.taskIds || !Array.isArray(body.taskIds) || body.taskIds.length === 0) {
      return NextResponse.json(
        { error: 'Task IDs are required' },
        { status: 400 }
      )
    }
    
    if (!body.notes || typeof body.notes !== 'string' || body.notes.trim().length === 0) {
      return NextResponse.json(
        { error: 'Notes are required when processing duplicates' },
        { status: 400 }
      )
    }
    
    // FIX (refresh cascade): resolve the bearer token from Authorization
    // header, middleware-forwarded x-auth-token header, OR access_token/
    // auth_token/authToken cookie
    const finalAuthHeader = resolveAuthorizationHeader(req)
    const cookie = req.headers.get('cookie')

    // Forward request to backend API
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'
    const response = await fetch(`${backendUrl}/api/duplicates/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(finalAuthHeader && { 'Authorization': finalAuthHeader }),
        ...(cookie && { 'Cookie': cookie })
      },
      body: JSON.stringify(body)
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      console.error('Backend API error:', response.status, errorData)
      return NextResponse.json(
        { error: errorData.error || 'Failed to process duplicates' },
        { status: response.status }
      )
    }
    
    const data = await response.json()
    return NextResponse.json(data)
    
  } catch (error: any) {
    console.error('Error in process duplicates route:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}