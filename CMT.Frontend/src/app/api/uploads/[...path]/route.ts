import { NextRequest, NextResponse } from 'next/server'

/**
 * Proxy route for serving uploaded files from the backend server
 * This handles profile pictures and other uploaded assets
 */

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '')

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    // Await params before using its properties (Next.js 15 requirement)
    const resolvedParams = await params
    
    // Reconstruct the full path from the dynamic segments
    const filePath = resolvedParams.path.join('/')
    const backendUrl = `${API_BASE}/api/uploads/${filePath}`

    //('Proxying upload request:', backendUrl)

    // Fetch the file from the backend
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        // Forward any relevant headers if needed
      },
    })

    if (!response.ok) {
      console.error('Backend file not found:', backendUrl, response.status)
      return new NextResponse('File not found', { status: 404 })
    }

    // Get the file content as a buffer
    const fileBuffer = await response.arrayBuffer()
    
    // Get content type from backend response
    const contentType = response.headers.get('content-type') || 'application/octet-stream'

    // Return the file with appropriate headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Error proxying upload:', error)
    return new NextResponse('Internal server error', { status: 500 })
  }
}