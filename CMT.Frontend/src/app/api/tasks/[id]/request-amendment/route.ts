import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    //('Amendment request API - Received body:', JSON.stringify(body, null, 2))

    // Accept all possible case variations: PascalCase, camelCase, snake_case
    const rawReason = body?.AmendmentReason ?? body?.amendmentReason ?? body?.amendment_reason ?? ''
    const amendmentReason = typeof rawReason === 'string' ? rawReason.trim() : ''

    // Enhanced validation
    if (!amendmentReason) {
      return NextResponse.json(
        { error: 'Amendment reason is required' },
        { status: 400 }
      )
    }

    if (amendmentReason.length < 10) {
      return NextResponse.json(
        { error: 'Amendment reason must be at least 10 characters long' },
        { status: 400 }
      )
    }

    // Extract additional tracking information
    const requestedBy = body?.requested_by
    const requestedAt = body?.requested_at || new Date().toISOString()
    const requesterRole = body?.requester_role
    const taskId = body?.task_id || id
    const taskStatus = body?.task_status

    // Enhanced payload for backend
    const backendPayload = {
      amendmentReason,
      amendment_reason: amendmentReason, // Backward compatibility
      AmendmentReason: amendmentReason, // PascalCase for .NET backend
      requested_by: requestedBy,
      requested_at: requestedAt,
      requester_role: requesterRole,
      task_id: taskId,
      task_status: taskStatus,
      // Additional metadata for audit trail
      request_metadata: {
        user_agent: request.headers.get('user-agent'),
        ip_address: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
        timestamp: new Date().toISOString()
      }
    }

    //('Sending to backend:', JSON.stringify(backendPayload, null, 2))

    // Prepare headers for backend request
    const backendHeaders: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    // Forward authorization header
    const authHeader = request.headers.get('authorization')
    if (authHeader) {
      backendHeaders['Authorization'] = authHeader
    }

    // Forward CSRF token if present
    const csrfToken = request.headers.get('x-csrf-token') || 
                     request.headers.get('X-CSRF-Token') ||
                     request.headers.get('csrf-token')
    if (csrfToken) {
      backendHeaders['X-CSRF-Token'] = csrfToken
      backendHeaders['X-Requested-With'] = 'XMLHttpRequest'
    } else {
      // Try to get CSRF token from cookies
      const cookie = request.headers.get('cookie')
      if (cookie) {
        const csrfMatch = cookie.match(/(?:^|;\s*)(?:CSRF-TOKEN|X-CSRF-TOKEN|csrf-token)=([^;]+)/)
        if (csrfMatch) {
          const cookieCsrfToken = decodeURIComponent(csrfMatch[1])
          backendHeaders['X-CSRF-Token'] = cookieCsrfToken
          backendHeaders['X-Requested-With'] = 'XMLHttpRequest'
        }
      }
    }

    // CRITICAL FIX: Forward all cookies to backend for CSRF validation
    const allCookies = request.headers.get('cookie')
    if (allCookies) {
      backendHeaders['Cookie'] = allCookies
    }

    // Forward the request to the backend (.NET) using the backend's expected field name
    const backendResponse = await fetch(`${BACKEND_URL}/tasks/${encodeURIComponent(id)}/request-amendment`, {
      method: 'POST',
      headers: backendHeaders,
      body: JSON.stringify(backendPayload),
      credentials: 'include', // CRITICAL FIX: Include credentials to send cookies
      cache: 'no-store'
    })

    //('Backend response status:', backendResponse.status)

    if (!backendResponse.ok) {
      const errorData = await backendResponse.text().catch(() => '')
     //('Backend error response:', errorData)
      
      let errorMessage = 'Failed to request amendment'

      try {
        const errorJson = JSON.parse(errorData)
        errorMessage = errorJson.error || errorJson.message || errorJson.Message || errorMessage
      } catch {
        // If not JSON, use the text as error message
        errorMessage = errorData || errorMessage
      }

      // Handle specific database schema errors
      if (errorMessage.includes('Invalid column name')) {
        errorMessage = 'Database schema needs to be updated. Please contact your system administrator to run the amendment tracking migration.'
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: backendResponse.status }
      )
    }

    const responseData = await backendResponse.json().catch(() => ({}))
    //('Backend success response:', responseData)

    // Enhanced response with additional metadata
    const enhancedResponse = {
      ...responseData,
      success: true,
      amendment_request: {
        task_id: taskId,
        reason: amendmentReason,
        requested_by: requestedBy,
        requested_at: requestedAt,
        status: 'Pending TL Review'
      },
      message: 'Amendment request submitted successfully. Your Team Leader will review it shortly.'
    }

    return NextResponse.json(enhancedResponse)

  } catch (error) {
    console.error('Request amendment API error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}

// GET method to retrieve amendment requests for a task
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const backendHeaders: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    const authHeader = request.headers.get('authorization')
    if (authHeader) {
      backendHeaders['Authorization'] = authHeader
    }

    // Forward cookies for authentication
    const allCookies = request.headers.get('cookie')
    if (allCookies) {
      backendHeaders['Cookie'] = allCookies
    }

    const backendResponse = await fetch(`${BACKEND_URL}/tasks/${encodeURIComponent(id)}/amendment-requests`, {
      method: 'GET',
      headers: backendHeaders,
      credentials: 'include',
      cache: 'no-store'
    })

    if (!backendResponse.ok) {
      const errorData = await backendResponse.text().catch(() => '')
      let errorMessage = 'Failed to retrieve amendment requests'

      try {
        const errorJson = JSON.parse(errorData)
        errorMessage = errorJson.error || errorJson.message || errorMessage
      } catch {
        errorMessage = errorData || errorMessage
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: backendResponse.status }
      )
    }

    const responseData = await backendResponse.json().catch(() => ({ amendment_requests: [] }))
    return NextResponse.json(responseData)

  } catch (error) {
    console.error('Get amendment requests API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}