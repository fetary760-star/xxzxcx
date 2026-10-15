import { NextRequest, NextResponse } from 'next/server'

const BACKEND_URL = process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json().catch(() => ({}))

    //('Amendment review API - Received body:', JSON.stringify(body, null, 2))

    // Validate required fields
    const amendmentStatus = body?.amendment_status
    const amendmentDecision = body?.amendment_decision
    const amendmentComments = body?.amendment_comments
    const reviewedBy = body?.reviewed_by
    const reviewedAt = body?.reviewed_at
    const reviewerRole = body?.reviewer_role
    const reviewerName = body?.reviewer_name

    //('Amendment comments received:', JSON.stringify(amendmentComments))
    //('Amendment comments type:', typeof amendmentComments)
    //('Amendment comments length:', amendmentComments?.length)

    // Enhanced validation logic for amendment_comments
    if (amendmentComments === null || amendmentComments === undefined) {
      //('Amendment comments validation failed: null or undefined')
      return NextResponse.json(
        { error: 'Review comments are required for audit trail purposes' },
        { status: 400 }
      )
    }

    // Convert to string if not already
    const commentsStr = String(amendmentComments)
    const trimmedComments = commentsStr.trim()

    // Check if trimmed comments are empty or too short
    if (trimmedComments.length === 0) {
      //('Amendment comments validation failed: empty after trim')
      return NextResponse.json(
        { error: 'Review comments are required for audit trail purposes' },
        { status: 400 }
      )
    }

    if (trimmedComments.length < 5) {
      //('Amendment comments validation failed: too short')
      return NextResponse.json(
        { error: 'Review comments must be at least 5 characters long' },
        { status: 400 }
      )
    }

    ('Amendment comments validation passed:', {
      original: amendmentComments,
      trimmed: trimmedComments,
      length: trimmedComments.length
    })

    // Validate amendment_status is valid (0=Pending, 1=Forwarded, 2=Approved, 3=Rejected)
    if (![1, 2, 3].includes(amendmentStatus)) {
      return NextResponse.json(
        { error: 'Invalid amendment status. Must be 1 (Forwarded), 2 (Approved), or 3 (Rejected)' },
        { status: 400 }
      )
    }

    // Validate amendment_decision is valid
    if (!['approve', 'reject', 'forward'].includes(amendmentDecision)) {
      return NextResponse.json(
        { error: 'Invalid amendment decision. Must be approve, reject, or forward' },
        { status: 400 }
      )
    }

    // Validate reviewer information
    if (!reviewedBy) {
      return NextResponse.json(
        { error: 'Reviewer ID is required for audit trail' },
        { status: 400 }
      )
    }

    if (!reviewerRole) {
      return NextResponse.json(
        { error: 'Reviewer role is required for audit trail' },
        { status: 400 }
      )
    }

    // Role-based validation
    const validRoles = ['team_leader', 'director']
    if (!validRoles.includes(reviewerRole)) {
      return NextResponse.json(
        { error: 'Only Team Leaders and Directors can review amendment requests' },
        { status: 403 }
      )
    }

    // Business logic validation - Team Leaders can only forward to Director, not approve high-level amendments
    if (reviewerRole === 'team_leader' && amendmentDecision === 'forward' && amendmentStatus !== 1) {
      return NextResponse.json(
        { error: 'Status mismatch: Forward decision should have status 1 (Forwarded to Director)' },
        { status: 400 }
      )
    }

    // Prepare the enhanced payload for the backend
    const backendPayload = {
      amendment_status: amendmentStatus,
      amendment_decision: amendmentDecision,
      amendment_comments: trimmedComments,
      reviewed_by: reviewedBy,
      reviewed_at: reviewedAt || new Date().toISOString(),
      reviewer_role: reviewerRole,
      reviewer_name: reviewerName,
      amendment_reviewed_by_tl_id: body?.amendment_reviewed_by_tl_id || reviewedBy,
      // Enhanced audit trail information
      review_audit: {
        decision_timestamp: new Date().toISOString(),
        reviewer_info: {
          id: reviewedBy,
          role: reviewerRole,
          name: reviewerName
        },
        decision_details: {
          action: amendmentDecision,
          status_code: amendmentStatus,
          comments_length: trimmedComments.length
        },
        request_metadata: body?.review_metadata || {}
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

    // CRITICAL FIX: Get CSRF token from incoming request
    const csrfTokenFromHeader = request.headers.get('x-csrf-token') || request.headers.get('X-CSRF-Token')
    
    // CRITICAL FIX: Parse cookies from the incoming request to get CSRF token cookie
    const cookieHeader = request.headers.get('cookie')
    let csrfTokenFromCookie: string | null = null
    
    if (cookieHeader) {
      const cookies = cookieHeader.split(';').map(c => c.trim())
      for (const cookie of cookies) {
        const [name, value] = cookie.split('=')
        if (name === 'CSRF-TOKEN' || name === 'X-CSRF-TOKEN' || name === 'csrf-token') {
          csrfTokenFromCookie = decodeURIComponent(value)
          break
        }
      }
    }

    //('CSRF Token from header:', csrfTokenFromHeader)
    //('CSRF Token from cookie:', csrfTokenFromCookie)

    // Use the token from header (which should match the cookie)
    const csrfToken = csrfTokenFromHeader || csrfTokenFromCookie

    if (csrfToken) {
      // CRITICAL: Set both the header AND reconstruct the cookie header with CSRF token
      backendHeaders['X-CSRF-Token'] = csrfToken
      backendHeaders['X-Requested-With'] = 'XMLHttpRequest'
      
      // CRITICAL: Reconstruct cookie header to include CSRF-TOKEN
      if (cookieHeader) {
        // Check if CSRF-TOKEN is already in the cookie header
        if (!cookieHeader.includes('CSRF-TOKEN=')) {
          backendHeaders['Cookie'] = `${cookieHeader}; CSRF-TOKEN=${encodeURIComponent(csrfToken)}`
        } else {
          backendHeaders['Cookie'] = cookieHeader
        }
      } else {
        // If no cookie header, create one with just the CSRF token
        backendHeaders['Cookie'] = `CSRF-TOKEN=${encodeURIComponent(csrfToken)}`
      }
      
      //('Forwarding CSRF token to backend:', csrfToken)
      //('Cookie header being sent:', backendHeaders['Cookie'])
    } else {
      console.warn('No CSRF token found in request headers or cookies')
      // Still forward cookies if they exist
      if (cookieHeader) {
        backendHeaders['Cookie'] = cookieHeader
      }
    }

    //('Forwarding headers to backend:', backendHeaders)

    // Forward the request to the backend (.NET API)
    const backendResponse = await fetch(`${BACKEND_URL}/tasks/${encodeURIComponent(id)}/amendment/review`, {
      method: 'POST',
      headers: backendHeaders,
      body: JSON.stringify(backendPayload),
      credentials: 'include'
    })

    //('Backend response status:', backendResponse.status)

    if (!backendResponse.ok) {
      const errorData = await backendResponse.text().catch(() => '')
      //('Backend error response:', errorData)
      
      let errorMessage = 'Failed to process amendment review'

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
      amendment_review: {
        task_id: id,
        decision: amendmentDecision,
        status: amendmentStatus,
        reviewed_by: reviewedBy,
        reviewed_at: reviewedAt,
        reviewer_role: reviewerRole,
        comments: trimmedComments
      },
      message: `Amendment request ${amendmentDecision}d successfully by ${reviewerRole.replace('_', ' ')}`,
      next_steps: getNextStepsMessage(amendmentDecision, reviewerRole)
    }

    return NextResponse.json(enhancedResponse)

  } catch (error) {
    console.error('Amendment review API error:', error)
    return NextResponse.json(
      { 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error occurred'
      },
      { status: 500 }
    )
  }
}

// GET method to retrieve amendment review history for a task
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

    const backendResponse = await fetch(`${BACKEND_URL}/tasks/${encodeURIComponent(id)}/amendment/review-history`, {
      method: 'GET',
      headers: backendHeaders
    })

    if (!backendResponse.ok) {
      const errorData = await backendResponse.text().catch(() => '')
      let errorMessage = 'Failed to retrieve amendment review history'

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

    const responseData = await backendResponse.json().catch(() => ({ review_history: [] }))
    return NextResponse.json(responseData)

  } catch (error) {
    console.error('Get amendment review history API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * Helper function to provide next steps based on decision and reviewer role
 */
function getNextStepsMessage(decision: string, reviewerRole: string): string {
  switch (decision) {
    case 'approve':
      return 'The task has been reopened and is now available for editing. The requester has been notified.'
    case 'reject':
      return 'The amendment request has been denied. The requester has been notified with your comments.'
    case 'forward':
      if (reviewerRole === 'team_leader') {
        return 'The amendment request has been forwarded to the Director for final review.'
      }
      return 'Amendment request forwarded for further review.'
    default:
      return 'Amendment review completed.'
  }
}