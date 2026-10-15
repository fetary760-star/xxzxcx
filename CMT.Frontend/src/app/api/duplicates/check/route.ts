// FIXED: Corrected duplicate check API route with proper URL construction and CSRF token forwarding
import { NextRequest, NextResponse } from 'next/server'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    
    //('🔍 Duplicate check request:', body)
    
    // FIXED: Properly construct backend URL without double /api/api
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || process.env.CMT_API_BASE_URL || 'http://localhost:5000'
    // Remove trailing /api if present in backendUrl to avoid duplication
    const cleanBackendUrl = backendUrl.replace(/\/api\/?$/, '')
    const apiUrl = `${cleanBackendUrl}/api/duplicates/check`
    
    //('🚀 Forwarding to backend:', apiUrl)
    
    // CRITICAL FIX: Forward CSRF token from client to backend
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }
    
    // FIX (refresh cascade): resolve the bearer token from Authorization
    // header, middleware-forwarded x-auth-token header, OR access_token/
    // auth_token/authToken cookie
    const finalAuthHeader = resolveAuthorizationHeader(req)
    if (finalAuthHeader) {
      headers['Authorization'] = finalAuthHeader
    }
    
    const cookieHeader = req.headers.get('cookie')
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader
    }
    
    // CRITICAL FIX: Forward CSRF token
    const csrfToken = req.headers.get('x-csrf-token')
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken
      //('✅ Forwarding CSRF token to backend')
    } else {
      console.warn('⚠️ No CSRF token found in request headers')
    }
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    })
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '')
      console.warn('⚠️ Backend duplicate check failed:', response.status, errorText)
      
      // Return a fallback response that indicates no duplicates found
      return NextResponse.json({
        IsDuplicate: false,
        isDuplicate: false,
        Duplicates: [],
        duplicates: [],
        TotalDuplicates: 0,
        totalDuplicates: 0,
        Message: 'Duplicate check service unavailable - proceeding without duplicate detection',
        message: 'Duplicate check service unavailable - proceeding without duplicate detection'
      })
    }
    
    const data = await response.json()
    //('✅ Duplicate check response:', data)
    
    // Normalize the response to ensure both PascalCase and camelCase fields are available
    const normalizedResponse = {
      ...data,
      // Ensure both naming conventions are supported
      IsDuplicate: data.IsDuplicate ?? data.isDuplicate ?? false,
      isDuplicate: data.isDuplicate ?? data.IsDuplicate ?? false,
      Duplicates: data.Duplicates ?? data.duplicates ?? [],
      duplicates: data.duplicates ?? data.Duplicates ?? [],
      TotalDuplicates: data.TotalDuplicates ?? data.totalDuplicates ?? (data.Duplicates ?? data.duplicates ?? []).length,
      totalDuplicates: data.totalDuplicates ?? data.TotalDuplicates ?? (data.duplicates ?? data.Duplicates ?? []).length,
      Message: data.Message ?? data.message ?? '',
      message: data.message ?? data.Message ?? ''
    }
    
    if (normalizedResponse.IsDuplicate || normalizedResponse.isDuplicate) {
      //(`🔍 Found ${normalizedResponse.TotalDuplicates || normalizedResponse.totalDuplicates} duplicate(s)`)
    } else {
      //('✅ No duplicates found')
    }
    
    return NextResponse.json(normalizedResponse)
    
  } catch (error: any) {
    console.error('❌ Error in duplicate check:', error)
    
    // Return a safe fallback response
    return NextResponse.json({
      IsDuplicate: false,
      isDuplicate: false,
      Duplicates: [],
      duplicates: [],
      TotalDuplicates: 0,
      totalDuplicates: 0,
      Message: 'Internal server error during duplicate check',
      message: 'Internal server error during duplicate check'
    })
  }
}