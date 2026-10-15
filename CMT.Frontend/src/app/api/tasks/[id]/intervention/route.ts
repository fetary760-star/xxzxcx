import { NextRequest, NextResponse } from 'next/server';

/**
 * Intervention API proxy with CSRF token forwarding
 * 
 * FIXED: Added CSRF token and x-requested-with header forwarding to prevent CSRF validation failures
 */

const API_BASE = process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_CMT_API_BASE_URL || 'http://localhost:5000/api';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const target = `${API_BASE}/tasks/${encodeURIComponent(String(id))}/intervention`;

  try {
    const body = await request.json();
    
    // CRITICAL FIX: Forward all necessary headers including CSRF token
    const headers: Record<string, string> = {
      'content-type': 'application/json',
    };
    
    // Get Authorization header from request
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      headers['authorization'] = authHeader;
    }
    
    // Get cookie header from request
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      headers['cookie'] = cookieHeader;
    }
    
    // CRITICAL FIX: Forward CSRF token header
    const csrfToken = request.headers.get('x-csrf-token');
    if (csrfToken) {
      headers['x-csrf-token'] = csrfToken;
    } else if (cookieHeader) {
      // Extract CSRF token from cookie if not in header
      const csrfCookieMatch = cookieHeader.match(/(?:^|;\s*)CSRF-TOKEN=([^;]+)/);
      if (csrfCookieMatch) {
        const csrfFromCookie = decodeURIComponent(csrfCookieMatch[1]);
        headers['x-csrf-token'] = csrfFromCookie;
      }
    }
    
    // CRITICAL FIX: Forward x-requested-with header
    const requestedWith = request.headers.get('x-requested-with');
    if (requestedWith) {
      headers['x-requested-with'] = requestedWith;
    }
    
    ('🔐 [Intervention Proxy] Forwarding headers:', {
      hasCsrfToken: !!headers['x-csrf-token'],
      hasRequestedWith: !!headers['x-requested-with'],
      hasAuth: !!headers['authorization']
    });
    
    const response = await fetch(target, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const text = await response.text();
    
    if (!response.ok) {
      console.error('❌ [Intervention Proxy] Backend error:', response.status, text);
    }
    
    return new Response(text, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err: any) {
    console.error('❌ [Intervention Proxy] Error:', err);
    return NextResponse.json({ message: 'Internal proxy error', detail: err?.message }, { status: 500 });
  }
}