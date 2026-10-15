import { NextRequest, NextResponse } from 'next/server'
import { requireRole, forwardAuthHeaders } from '@/lib/serverAuth'

/**
 * /api/reports
 * 
 * Handles report generation and retrieval
 * Supports both GET (fetch reports) and POST (generate reports) operations
 */

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

// Allowed roles for reports access
const ALLOWED_ROLES = [
  'team_leader',
  'teamleader', 
  'director',
  'engineer',
  'customer_personnel',
  'customerpersonnel',
  'customer',
  'manager',
  'shop_manager',
  'admin',
  'shop_tl',
  '1', '2', '3', '4', '5', '6', '7', '8'
]

/**
 * Proxy request to backend with authentication
 */
async function proxyToBackend(req: NextRequest, endpoint: string, method: string = 'GET', body?: any) {
  try {
    //(`[api/reports] ${method} request started`)
    //(`[api/reports] incoming hasCookie=`, !!req.headers.get('cookie'), 'hasAuthHeader=', !!req.headers.get('authorization'))

    const user = await requireRole(req, ALLOWED_ROLES)
    //(`[api/reports] requireRole passed for user:`, user?.user_id || user?.userId || 'undefined')

    const headers = forwardAuthHeaders(req)
    const url = `${API_BASE}${endpoint}`
    
    //(`[api/reports] Making upstream request to:`, url)
    //(`[api/reports] Forward headers:`, Object.keys(headers))

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store'
    })

    //(`[api/reports] upstream status=`, response.status)

    const contentType = response.headers.get('content-type') || ''
    let responseData

    if (contentType.includes('application/json')) {
      responseData = await response.json()
    } else {
      responseData = await response.text()
    }

    if (!response.ok) {
      console.error(`[api/reports] Backend error:`, response.status, responseData)
      return NextResponse.json(
        { 
          error: 'Backend request failed', 
          details: responseData,
          status: response.status 
        },
        { status: response.status }
      )
    }

    return NextResponse.json(responseData, {
      status: response.status,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  } catch (error) {
    console.error(`[api/reports] ${method} error:`, error)
    
    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ error: 'Authentication failed' }))
      return NextResponse.json(errorData, { status: error.status })
    }
    
    return NextResponse.json(
      { error: 'Failed to communicate with backend', details: String(error) },
      { status: 502 }
    )
  }
}

/**
 * GET /api/reports
 * Fetch existing reports
 */
export async function GET(req: NextRequest) {
  try {
    //('Reports API GET - Starting request')
    
    // Build query string from request parameters
    const url = new URL(req.url)
    const queryString = url.search

    const endpoint = `/reports${queryString}`
    return await proxyToBackend(req, endpoint, 'GET')
  } catch (error) {
    console.error('Reports API GET - Error:', error)
    if (error instanceof Response) {
      return error
    }
    return NextResponse.json(
      { error: 'Failed to fetch reports', details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * POST /api/reports  
 * Generate new reports
 */
export async function POST(req: NextRequest) {
  try {
    //('Reports API POST - Starting request')
    
    const body = await req.json()
    //('Reports API POST - Payload:', body)

    const endpoint = '/reports'
    return await proxyToBackend(req, endpoint, 'POST', body)
  } catch (error) {
    console.error('Reports API POST - Error:', error)
    if (error instanceof Response) {
      return error
    }
    return NextResponse.json(
      { error: 'Failed to generate report', details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/reports
 * Update existing reports
 */
export async function PUT(req: NextRequest) {
  try {
    //('Reports API PUT - Starting request')
    
    const body = await req.json()
    //('Reports API PUT - Payload:', body)

    const endpoint = '/reports'
    return await proxyToBackend(req, endpoint, 'PUT', body)
  } catch (error) {
    console.error('Reports API PUT - Error:', error)
    if (error instanceof Response) {
      return error
    }
    return NextResponse.json(
      { error: 'Failed to update report', details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/reports
 * Delete reports
 */
export async function DELETE(req: NextRequest) {
  try {
    //('Reports API DELETE - Starting request')
    
    const url = new URL(req.url)
    const queryString = url.search

    const endpoint = `/reports${queryString}`
    return await proxyToBackend(req, endpoint, 'DELETE')
  } catch (error) {
    console.error('Reports API DELETE - Error:', error)
    if (error instanceof Response) {
      return error
    }
    return NextResponse.json(
      { error: 'Failed to delete report', details: String(error) },
      { status: 500 }
    )
  }
}