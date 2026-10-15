import { NextRequest, NextResponse } from 'next/server'

const API_BASE_URL = process.env.CMT_API_BASE_URL || 'http://localhost:5000/api'

/**
 * POST /api/task-holds/[holdRequestId]/review
 * Reviews a hold request (approve or reject)
 * Only accessible by Team Leaders
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ holdRequestId: string }> }
) {
  try {
    const { holdRequestId } = await params

    // Get auth token from request headers
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'No authentication token provided' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()

    // CRITICAL FIX: Forward CSRF token and other security headers to backend
    const headers: Record<string, string> = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    }

    // Forward CSRF token if present
    const csrfToken = request.headers.get('x-csrf-token')
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
    }

    // Forward X-Requested-With header
    const requestedWith = request.headers.get('x-requested-with')
    if (requestedWith) {
      headers['X-Requested-With'] = requestedWith
    }

    // Forward cookies (including CSRF-TOKEN cookie)
    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader
    }

    // Forward request to backend
    const backendUrl = `${API_BASE_URL}/task-holds/${holdRequestId}/review`
    
    const response = await fetch(backendUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'include',
    })

    // Handle non-OK responses
    if (!response.ok) {
      const errorText = await response.text()
      let errorBody
      try {
        errorBody = JSON.parse(errorText)
      } catch {
        errorBody = { error: errorText }
      }

      return NextResponse.json(
        errorBody,
        { status: response.status }
      )
    }

    // Parse and return successful response
    const data = await response.json()
    return NextResponse.json(data, { status: 200 })

  } catch (error: any) {
    console.error('Error reviewing hold request:', error)
    return NextResponse.json(
      { 
        error: 'Internal Server Error', 
        message: error.message || 'Failed to review hold request' 
      },
      { status: 500 }
    )
  }
}