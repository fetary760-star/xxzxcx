import { NextRequest, NextResponse } from 'next/server'

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json({ error: 'Authorization header missing' }, { status: 401 })
    }

    const body = await request.json()
    
    if (!body.currentPassword || !body.newPassword) {
      return NextResponse.json({ error: 'Current password and new password are required' }, { status: 400 })
    }

    const csrfToken = request.headers.get('x-csrf-token') || request.headers.get('X-CSRF-Token')
    const cookieHeader = request.headers.get('cookie') || ''

    const headers: Record<string, string> = {
      'Authorization': authHeader,
      'Content-Type': 'application/json',
    }

    if (csrfToken) headers['X-CSRF-Token'] = csrfToken
    if (cookieHeader) headers['Cookie'] = cookieHeader

    const requestBody = {
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      confirmPassword: body.confirmPassword || body.newPassword
    }

   
    let response = await fetch(`${API_BASE}/settings/me/change-password`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    })

 

    
    const contentType = response.headers.get('content-type') || ''
    let data: any = {}

    if (contentType.includes('application/json')) {
      data = await response.json()
    } else {
      const text = await response.text()
      data = { message: text }
    }

    
    // "Current password is incorrect" 
    if (response.ok && data.success === false) {
       ('✅ Controlled validation error from backend:', data.message);
       return NextResponse.json(
         { error: data.message || 'Validation failed' }, 
         { status: 200 } 
       )
    }

    
    if (!response.ok) {
      console.error('Password change failed with HTTP error:', response.status)
      const errorMessage = data.message || data.error || 'Failed to change password'
      return NextResponse.json({ error: errorMessage }, { status: response.status })
    }

   
    return NextResponse.json({ 
      success: true, 
      message: data.message || 'Password changed successfully' 
    })

  } catch (error) {
    console.error('Password change API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return PUT(request)
}