import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      )
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = join(process.cwd(), 'public', 'uploads')
    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true })
    }

    // Generate unique filename
    const timestamp = Date.now()
    const filename = `${timestamp}-${file.name}`
    const filepath = join(uploadsDir, filename)

    // Convert file to buffer and save
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    await writeFile(filepath, buffer)

    // Return the relative path for database storage
    const relativePath = `/uploads/${filename}`

    return NextResponse.json({
      success: true,
      filename,
      path: relativePath,
      size: file.size,
      type: file.type
    })
  } catch (error) {
    console.error('File upload error:', error)
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    )
  }
}

function buildForwardHeaders(request: NextRequest) {
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  }
  // FIX (refresh cascade): resolve the bearer token from Authorization
  // header, middleware-forwarded x-auth-token header, OR access_token/
  // auth_token/authToken cookie
  const finalAuthHeader = resolveAuthorizationHeader(request)
  if (finalAuthHeader) headers['Authorization'] = finalAuthHeader
  const cookie = request.headers.get('cookie')
  if (cookie) headers['Cookie'] = cookie
  return headers
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    // Support both taskId and task_id parameter names
    const rawTaskId = searchParams.get('taskId') || searchParams.get('task_id')
    if (!rawTaskId) {
      return NextResponse.json(
        { error: 'Task ID is required' },
        { status: 400 }
      )
    }

    // Backend base
    const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')
    const forwardHeaders = buildForwardHeaders(request)

    const encoded = encodeURIComponent(String(rawTaskId))
    const candidates = [
      `${API_BASE}/attachments?taskId=${encoded}`,
      `${API_BASE}/attachments?task_id=${encoded}`,
    ]

    let lastStatus: number | null = null
    let lastErrorText: string | null = null
    let okResponse: Response | null = null

    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: forwardHeaders,
        })

        if (res.ok) {
          okResponse = res
          break
        }

        // If 404, try the next candidate. Capture info for logging.
        lastStatus = res.status
        lastErrorText = await res.text().catch(() => '')

        if (res.status === 404) {
          console.warn(`Attachments backend returned 404 for ${url}, trying next candidate if any.`)
          continue
        } else {
          // For other non-OK statuses, break and return the error details
          console.error('Backend API error fetching attachments:', res.status, res.statusText, lastErrorText)
          lastStatus = res.status
          break
        }
      } catch (fetchErr: any) {
        lastErrorText = String(fetchErr?.message ?? fetchErr)
        lastStatus = 500
        console.error('Network/error fetching attachments from backend:', fetchErr)
        // try next candidate if available
        continue
      }
    }

    // If no ok response found:
    if (!okResponse) {
      // If lastStatus was 404, return an empty array so UI fallback can run cleanly
      if (lastStatus === 404) {
        console.warn('Attachments backend returned 404 for all candidates; returning empty list to client.')
        return NextResponse.json([], { status: 200 })
      }

      // Otherwise return an informative error
      return NextResponse.json(
        { error: 'Failed to fetch attachments from backend', details: lastErrorText || 'Unknown error' },
        { status: lastStatus || 500 }
      )
    }

    // Parse and return the successful response
    const text = await okResponse.text().catch(() => '')
    let data: any = null
    try { data = JSON.parse(text) } catch { data = text }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching attachments:', error)
    return NextResponse.json(
      { error: 'Failed to fetch attachments', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}