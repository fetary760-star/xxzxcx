import { NextRequest, NextResponse } from 'next/server'

const API_BASE_URL = process.env.CMT_API_BASE_URL || 'http://localhost:5000/api'

/**
 * GET /api/task-holds/users/[userId]/date-counts
 * Fetches hold request date counts for a specific user
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params
    const { searchParams } = new URL(request.url)
    const taskId = searchParams.get('taskId')

    // Get auth token from request headers
    const authHeader = request.headers.get('authorization')
    
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'No authentication token provided' },
        { status: 401 }
      )
    }

    // Build backend URL with query params
    const backendUrl = taskId 
      ? `${API_BASE_URL}/task-holds/users/${userId}/date-counts?taskId=${taskId}`
      : `${API_BASE_URL}/task-holds/users/${userId}/date-counts`
    
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
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
    console.error('Error fetching user date counts:', error)
    return NextResponse.json(
      { 
        error: 'Internal Server Error', 
        message: error.message || 'Failed to fetch user date counts' 
      },
      { status: 500 }
    )
  }
}