import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/task-holds/tasks/:taskId/request-hold
 * Create a hold request for a task (Engineer only)
 * 
 * When an engineer places a task on hold, this creates a hold request
 * that needs Team Leader approval.
 * 
 * CRITICAL FIX: Forward CSRF token to backend for validation
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params
    const token = request.headers.get('authorization')?.replace('Bearer ', '')
    
    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized - No token provided' },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { holdReason } = body

    if (!holdReason || !holdReason.trim()) {
      return NextResponse.json(
        { error: 'Hold reason is required' },
        { status: 400 }
      )
    }

    // CRITICAL FIX: Get CSRF token from request headers
    const csrfToken = request.headers.get('x-csrf-token') || request.headers.get('X-CSRF-Token')
    const csrfCookie = request.cookies.get('CSRF-TOKEN')?.value

    // Call backend API
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000'
    const apiUrl = `${backendUrl}/api/task-holds/tasks/${taskId}/request-hold`
    
   // ('[task-holds/request-hold] Creating hold request for task:', taskId)
    //('[task-holds/request-hold] Backend API URL:', apiUrl)
    //('[task-holds/request-hold] CSRF token present:', !!csrfToken)

    // CRITICAL FIX: Build headers with CSRF token
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    }

    // Forward CSRF token if available
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
      headers['X-Requested-With'] = 'XMLHttpRequest'
    }

    // Forward cookies including CSRF token cookie
    const cookieHeader = request.headers.get('cookie')
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ holdReason: holdReason.trim() }),
      credentials: 'include',
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[task-holds/request-hold] Backend error:', response.status, errorText)
      
      let errorMessage = 'Failed to create hold request'
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.message || errorJson.error || errorMessage
      } catch {
        errorMessage = errorText || errorMessage
      }

      // CRITICAL FIX: If CSRF validation failed, provide helpful error message
      if (response.status === 403 && errorMessage.toLowerCase().includes('csrf')) {
        errorMessage = 'CSRF validation failed. Please refresh the page and try again.'
      }

      return NextResponse.json(
        { error: errorMessage, details: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
   //('[task-holds/request-hold] Hold request created successfully')

    return NextResponse.json(data)

  } catch (error: any) {
    console.error('[task-holds/request-hold] Error:', error)
    return NextResponse.json(
      { error: 'Failed to create hold request', details: error.message },
      { status: 500 }
    )
  }
}