import { NextRequest, NextResponse } from 'next/server'

/**
 * CSRF Token Generation Endpoint
 * Generates and returns a CSRF token for the client to use in subsequent requests
 * CRITICAL FIX: Also sets the token as a cookie for backend validation
 *
 * CRITICAL FIX (secure cookie on HTTP deployment):
 *   The `secure` flag was previously hardcoded to
 *   `process.env.NODE_ENV === 'production'`. When deployed on plain HTTP
 *   (e.g. http://svhqiis03:8757), browsers ignore Set-Cookie with Secure
 *   over non-HTTPS, so the CSRF cookie was never stored. Now we detect
 *   the actual protocol from the request.
 */

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/**
 * Determine whether cookies should be marked Secure.
 */
function shouldSetSecureCookie(req: NextRequest): boolean {
  const envSecure = process.env.COOKIE_SECURE
  if (envSecure !== undefined) {
    return envSecure === 'true' || envSecure === '1'
  }
  const forwardedProto = req.headers.get('x-forwarded-proto')
  if (forwardedProto) {
    return forwardedProto.toLowerCase() === 'https'
  }
  try {
    const url = new URL(req.url)
    return url.protocol === 'https:'
  } catch {
    // fallback
  }
  return false
}

export async function GET(request: NextRequest) {
  const isSecure = shouldSetSecureCookie(request)

  try {
    // Forward auth headers to backend
    const authHeader = request.headers.get('authorization')
    const cookieHeader = request.headers.get('cookie')
    
    const headers: Record<string, string> = {
      'Accept': 'application/json'
    }
    
    if (authHeader) {
      headers['Authorization'] = authHeader
    }
    
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader
    }
    
    // Try to get CSRF token from backend
    const backendRes = await fetch(`${API_BASE}/csrf-token`, {
      method: 'GET',
      headers,
      credentials: 'include'
    })
    
    let token: string
    let expiresAt: string
    
    if (backendRes.ok) {
      const data = await backendRes.json()
      token = data.token || data.csrfToken || data.csrf_token
      expiresAt = data.expiresAt || new Date(Date.now() + 3600000).toISOString()
    } else {
      // If backend doesn't have CSRF endpoint, generate a simple token
      token = generateSimpleToken()
      expiresAt = new Date(Date.now() + 3600000).toISOString() // 1 hour
    }
    
    // CRITICAL FIX: Set the CSRF token as a cookie so backend can validate it
    const response = NextResponse.json({ 
      token,
      expiresAt
    }, { status: 200 })
    
    // Set CSRF-TOKEN cookie with proper security settings
    // FIX: Use protocol-aware secure flag instead of NODE_ENV check
    response.cookies.set('CSRF-TOKEN', token, {
      httpOnly: false, // Must be accessible to JavaScript
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 3600 // 1 hour
    })
    
    return response
    
  } catch (error: any) {
    console.error('CSRF token generation error:', error)
    
    // Return a fallback token even on error
    const token = generateSimpleToken()
    const response = NextResponse.json({ 
      token,
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    }, { status: 200 })
    
    // Set cookie even for fallback token
    // FIX: Use protocol-aware secure flag
    response.cookies.set('CSRF-TOKEN', token, {
      httpOnly: false,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 3600
    })
    
    return response
  }
}

function generateSimpleToken(): string {
  // Generate a random token
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
}