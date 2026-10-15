import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * /api/self-evaluation/cmm-proxy/route.ts
 * 
 * AMENDED v3 - Enhanced logging and error handling.
 */

const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
).trim().replace(/\/+$/, '')

function extractToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (authHeader) {
    const t = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (t && t !== 'null' && t !== 'undefined') return t
  }

  const xAuthToken = req.headers.get('x-auth-token')
  if (xAuthToken && xAuthToken.trim() && xAuthToken !== 'null' && xAuthToken !== 'undefined') {
    return xAuthToken.trim()
  }

  const cookieNames = ['access_token', 'auth_token', 'authToken']
  for (const name of cookieNames) {
    const cookie = req.cookies.get(name)
    if (cookie?.value) {
      const val = cookie.value.trim()
      if (val && val !== 'null' && val !== 'undefined' && val !== 'cookie-session') {
        return val
      }
    }
  }

  const cookieHeader = req.headers.get('cookie')
  if (cookieHeader) {
    for (const name of cookieNames) {
      const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)
      const m = cookieHeader.match(re)
      if (m) {
        try {
          const raw = decodeURIComponent(m[1]).trim()
          if (raw && raw !== 'null' && raw !== 'undefined' && raw !== 'cookie-session') {
            return raw
          }
        } catch {
          const raw = m[1].trim()
          if (raw && raw !== 'null' && raw !== 'undefined') {
            return raw
          }
        }
      }
    }
  }

  return null
}

export async function GET(req: NextRequest) {
  const token = extractToken(req)
  if (!token) {
    return NextResponse.json(
      { found: false, errorMessage: 'Unauthorized. Please log in first.' },
      { status: 401 }
    )
  }

  const url = new URL(req.url)
  const ataNumber = url.searchParams.get('ataNumber') || ''
  const partNumber = url.searchParams.get('partNumber') || ''

  if (!ataNumber && !partNumber) {
    return NextResponse.json(
      { found: false, errorMessage: 'Either ATA number or Manufacturer Part Number is required.' },
      { status: 400 }
    )
  }

  // Build the backend URL
  const backendUrl = `${API_BASE}/self-evaluation/cmm-proxy/search?ataNumber=${encodeURIComponent(ataNumber)}&partNumber=${encodeURIComponent(partNumber)}`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 65000) // 65s timeout (backend has 60s)

    console.log(`[CMM-PROXY] Calling backend: ${backendUrl}`)
    console.log(`[CMM-PROXY] Search params: ATA="${ataNumber}", PN="${partNumber}"`)

    const response = await fetch(backendUrl, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.error(`[CMM-PROXY] Backend error: ${response.status} - ${errorText.substring(0, 500)}`)

      if (response.status === 401) {
        return NextResponse.json(
          { found: false, errorMessage: 'Authentication expired. Please log in again.' },
          { status: 401 }
        )
      }
      if (response.status === 403) {
        return NextResponse.json(
          { found: false, errorMessage: 'You do not have permission to access the CMM system.' },
          { status: 403 }
        )
      }

      try {
        const errorJson = JSON.parse(errorText)
        return NextResponse.json(errorJson, { status: response.status })
      } catch {
        return NextResponse.json(
          { found: false, errorMessage: errorText || `Backend returned HTTP ${response.status}` },
          { status: response.status }
        )
      }
    }

    const data = await response.json()
    console.log(`[CMM-PROXY] Result: found=${data.found}, rev=${data.revisionNumber || 'N/A'}, steps=${data.searchSteps?.length || 0}`)

    // Log diagnostic steps if search failed
    if (!data.found && data.searchSteps) {
      console.log(`[CMM-PROXY] Diagnostic steps:`)
      data.searchSteps.forEach((step: string, idx: number) => {
        console.log(`  ${idx + 1}. ${step}`)
      })
    }

    return NextResponse.json(data, { status: 200 })
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.error('[CMM-PROXY] Request timed out (65s)')
      return NextResponse.json(
        { found: false, errorMessage: 'Request to CMM system timed out. The external server may be slow or unreachable.' },
        { status: 504 }
      )
    }

    console.error('[CMM-PROXY] Error:', err?.message)
    return NextResponse.json(
      { found: false, errorMessage: `Failed to connect to CMM proxy service: ${err?.message}` },
      { status: 502 }
    )
  }
}
