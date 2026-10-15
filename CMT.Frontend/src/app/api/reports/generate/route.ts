import { NextRequest, NextResponse } from 'next/server'
import { requireRole, forwardAuthHeaders } from '@/lib/serverAuth'

/**
 * /api/reports/generate
 * 
 * Handles report generation requests
 * Proxies to backend /api/reports/generate endpoint
 * FIXED: Properly handles file downloads for PDF, Excel, and CSV
 * FIXED: Properly forwards CSRF token in both header AND cookie to backend
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
  'shop_tl',
  'manager',
  '1', '2', '3', '4', '5', '6'
]

/**
 * POST /api/reports/generate
 * Generate and download a report
 */
export async function POST(req: NextRequest) {
  try {
    //('[api/reports/generate] POST request started')

    // Authenticate user
    const user = await requireRole(req, ALLOWED_ROLES)
    //('[api/reports/generate] User authenticated:', user?.user_id || user?.userId || 'undefined')

    // Parse request body
    const body = await req.json()
    //('[api/reports/generate] Request payload:', body)

    // Validate required fields
    if (!body.reportType) {
      return NextResponse.json(
        { message: 'Report type is required' },
        { status: 400 }
      )
    }

    if (!body.format) {
      return NextResponse.json(
        { message: 'Format is required' },
        { status: 400 }
      )
    }

    // Forward authentication headers
    const headers = forwardAuthHeaders(req)
    headers['Content-Type'] = 'application/json'
    
    // CRITICAL FIX: Get CSRF token from header (sent by frontend)
    const csrfTokenFromHeader = req.headers.get('x-csrf-token')
    
    // Also try to get CSRF token from cookie
    const csrfTokenFromCookie = req.cookies.get('CSRF-TOKEN')?.value
    
    // Use the token from header (which frontend explicitly sends)
    const csrfToken = csrfTokenFromHeader || csrfTokenFromCookie
    
    if (csrfToken) {
      // Set the CSRF token in the header for backend
      headers['X-CSRF-Token'] = csrfToken
      
      // CRITICAL FIX: Also set the Cookie header with the CSRF token
      // The backend validates that header token matches cookie token
      // We need to forward the existing cookies AND ensure CSRF-TOKEN is included
      const existingCookies = req.headers.get('cookie') || ''
      
      // Check if CSRF-TOKEN is already in cookies
      if (existingCookies.includes('CSRF-TOKEN=')) {
        headers['Cookie'] = existingCookies
      } else {
        // Add CSRF-TOKEN to the cookie string
        headers['Cookie'] = existingCookies ? `${existingCookies}; CSRF-TOKEN=${csrfToken}` : `CSRF-TOKEN=${csrfToken}`
      }
      
      //('[api/reports/generate] ✅ Forwarding CSRF token to backend (header + cookie)')
    } else {
      console.warn('[api/reports/generate] ⚠️ No CSRF token found in request')
      // Forward existing cookies anyway
      const existingCookies = req.headers.get('cookie')
      if (existingCookies) {
        headers['Cookie'] = existingCookies
      }
    }
    
    // Also forward X-Requested-With header
    const requestedWith = req.headers.get('x-requested-with')
    if (requestedWith) {
      headers['X-Requested-With'] = requestedWith
    }

    const url = `${API_BASE}/reports/generate`
    
    //('[api/reports/generate] Calling backend:', url)
    //('[api/reports/generate] Headers being sent:', {
      //hasAuth: !!headers['Authorization'],
      //hasCsrfHeader: !!headers['X-CSRF-Token'],
      //hasCookie: !!headers['Cookie'],
      //cookiePreview: headers['Cookie']?.substring(0, 100) + '...'
    //})

    // Call backend API
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      cache: 'no-store'
    })

    //('[api/reports/generate] Backend response status:', response.status)

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[api/reports/generate] Backend error:', errorText)
      
      let errorData
      try {
        errorData = JSON.parse(errorText)
      } catch {
        errorData = { message: errorText || 'Failed to generate report' }
      }

      return NextResponse.json(
        { 
          message: errorData.message || 'Failed to generate report',
          error: errorData.error || errorText
        },
        { status: response.status }
      )
    }

    // Get the file from backend
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    // Determine content type and filename based on format
    let contentType: string
    let fileExtension: string
    
    switch (body.format.toLowerCase()) {
      case 'pdf':
        // For PDF, we're actually returning HTML that can be printed to PDF
        contentType = 'text/html; charset=utf-8'
        fileExtension = 'html'
        break
      case 'excel':
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        fileExtension = 'xlsx'
        break
      case 'csv':
        contentType = 'text/csv; charset=utf-8'
        fileExtension = 'csv'
        break
      default:
        contentType = 'application/octet-stream'
        fileExtension = 'bin'
    }

    const fileName = `${body.reportType}_${Date.now()}.${fileExtension}`
    
    //('[api/reports/generate] Sending file:', fileName, 'Size:', buffer.length, 'bytes')

    // Return the file with proper headers
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error) {
    console.error('[api/reports/generate] Error:', error)
    
    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ error: 'Authentication failed' }))
      return NextResponse.json(errorData, { status: error.status })
    }
    
    return NextResponse.json(
      { 
        message: 'Failed to generate report',
        error: String(error),
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}