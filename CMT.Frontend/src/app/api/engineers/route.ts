import { NextRequest, NextResponse } from 'next/server';
import { requireRole, AuthError } from '@/lib/serverAuth';
import { resolveAuthorizationHeader } from '@/lib/proxy-auth';
import { getSanitizedErrorMessage } from '@/lib/error-utils';

const API_BASE_URL = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

export async function GET(request: NextRequest) {
  try {
    // Require authentication - allow TL, Director, Manager, Admin, Shop TL roles
    await requireRole(request, ['team_leader', 'director', 'manager', 'shop_manager', 'admin', 'shop_tl', 'engineer']);

    // FIX (refresh cascade): resolve the bearer token from Authorization
    // header, middleware-forwarded x-auth-token header, OR access_token/
    // auth_token/authToken cookie — otherwise a full page reload (when the
    // in-memory token in secureAuthStore is lost) returns 401 even though
    // the HttpOnly cookie is still valid.
    const finalAuthHeader = resolveAuthorizationHeader(request);
    const cookie = request.headers.get('cookie');

    // Forward request to backend engineers endpoint
    const backendResponse = await fetch(`${API_BASE_URL}/engineers`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(finalAuthHeader && { 'Authorization': finalAuthHeader }),
        ...(cookie && { 'Cookie': cookie }),
      },
      cache: 'no-store',
    });

    if (!backendResponse.ok) {
      // SECURITY FIX: Log full error details server-side only
      const errorText = await backendResponse.text().catch(() => '');
      console.error('Backend engineers error:', backendResponse.status, errorText);
      
      // SECURITY FIX: Return a sanitized, generic error message to the client.
      // Never expose raw HTML, server error pages, or internal details.
      const safeMessage = getSanitizedErrorMessage(backendResponse.status, 'engineers');
      
      return NextResponse.json(
        { error: safeMessage },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    const engineers = Array.isArray(data) ? data : data?.data || data?.engineers || [];
    
    return NextResponse.json(engineers);
    
  } catch (error: any) {
    // Handle AuthError properly (thrown by requireRole)
    if (error instanceof AuthError) {
      return NextResponse.json(error.body, { status: error.status });
    }
    
    // SECURITY FIX: Log full error details server-side for debugging
    console.error('API Route engineers error:', error);
    
    // SECURITY FIX: Return a generic error message — never expose error.message
    // which may contain raw HTML, stack traces, or internal server details.
    return NextResponse.json(
      { error: 'An internal server error occurred. Please try again later.' },
      { status: 500 }
    );
  }
}