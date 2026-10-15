// FIXED: Corrected advanced duplicate check API route
import { NextRequest, NextResponse } from 'next/server'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    
    //('🔍 Advanced duplicate check request:', body)
    
    // FIXED: Properly construct backend URL without double /api/api
    const backendUrl = process.env.NEXT_PUBLIC_API_URL || process.env.CMT_API_BASE_URL || 'http://localhost:5000'
    const cleanBackendUrl = backendUrl.replace(/\/api\/?$/, '')
    const apiUrl = `${cleanBackendUrl}/api/duplicates/check/advanced`
    
    //('🚀 Forwarding to backend:', apiUrl)
    
    // FIX (refresh cascade): resolve the bearer token from Authorization
    // header, middleware-forwarded x-auth-token header, OR access_token/
    // auth_token/authToken cookie
    const finalAuthHeader = resolveAuthorizationHeader(req)
    const cookie = req.headers.get('cookie')
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(finalAuthHeader && { 'Authorization': finalAuthHeader }),
        ...(cookie && { 'Cookie': cookie })
      },
      body: JSON.stringify(body)
    })
    
    if (!response.ok) {
      console.warn('⚠️ Backend advanced duplicate check failed:', response.status)
      return NextResponse.json({
        IsDuplicate: false,
        isDuplicate: false,
        Duplicates: [],
        duplicates: [],
        TotalDuplicates: 0,
        totalDuplicates: 0,
        Message: 'Advanced duplicate check service unavailable',
        message: 'Advanced duplicate check service unavailable'
      })
    }
    
    const data = await response.json()
    
    // Normalize response
    const normalizedResponse = {
      ...data,
      IsDuplicate: data.IsDuplicate ?? data.isDuplicate ?? false,
      isDuplicate: data.isDuplicate ?? data.IsDuplicate ?? false,
      Duplicates: data.Duplicates ?? data.duplicates ?? [],
      duplicates: data.duplicates ?? data.Duplicates ?? [],
      TotalDuplicates: data.TotalDuplicates ?? data.totalDuplicates ?? (data.Duplicates ?? data.duplicates ?? []).length,
      totalDuplicates: data.totalDuplicates ?? data.TotalDuplicates ?? (data.duplicates ?? data.Duplicates ?? []).length,
      Message: data.Message ?? data.message ?? '',
      message: data.message ?? data.Message ?? ''
    }
    
    return NextResponse.json(normalizedResponse)
    
  } catch (error: any) {
    console.error('❌ Error in advanced duplicate check:', error)
    return NextResponse.json({
      IsDuplicate: false,
      isDuplicate: false,
      Duplicates: [],
      duplicates: [],
      TotalDuplicates: 0,
      totalDuplicates: 0,
      Message: 'Internal server error during advanced duplicate check',
      message: 'Internal server error during advanced duplicate check'
    })
  }
}