import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireRole } from '@/lib/serverAuth';

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

/**
 * Proxy fetch that forwards auth headers from incoming request
 */
async function proxyFetchUrl(url: string, incomingReq?: NextRequest, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (incomingReq) {
    const auth = incomingReq.headers.get('authorization');
    if (auth) {
      headers['Authorization'] = auth;
    } else {
      const cookie = incomingReq.headers.get('cookie');
      if (cookie) {
        const tokenMatch = cookie.match(/(?:^|;\s*)(?:auth_token|authToken)=([^;]+)/);
        if (tokenMatch) {
          const token = decodeURIComponent(tokenMatch[1]);
          headers['Authorization'] = `Bearer ${token}`;
        }
      }
    }
  }

  ('Fetching from:', url);

  try {
    const res = await fetch(url, { 
      method: options.method || 'GET',
      headers: { ...headers, ...options.headers },
      body: options.body,
      cache: 'no-store'
    });
    
    //('Backend response status:', res.status);
    
    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);
    
    if (!res.ok) {
      console.error('Backend error response:', { status: res.status, body });
      return { ok: false, status: res.status, body, endpoint: url };
    }
    
    return { ok: true, status: res.status, body, endpoint: url };
  } catch (error) {
    console.error('Network error:', error);
    return { ok: false, status: 0, body: String(error), endpoint: url };
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ adminUserId: string }> }
) {
  try {
    //('Admin Dashboard API: Processing GET request');
    
    // Require Admin role
    await requireRole(req, ['admin']);
    //('Admin Dashboard API: Authorization successful');

    // Await params before accessing properties (Next.js 15 requirement)
    const resolvedParams = await params;
    const adminUserId = resolvedParams.adminUserId;
    
    if (!adminUserId) {
      return NextResponse.json({
        message: 'Admin User ID is required'
      }, { status: 400 });
    }

    // Fetch from backend
    const backendUrl = `${API_BASE}/users/admin-dashboard/${adminUserId}`;
    const result = await proxyFetchUrl(backendUrl, req);

    if (result.ok) {
      //('Admin Dashboard API: Successfully retrieved data from backend');
      return NextResponse.json(result.body, { status: 200 });
    } else {
      console.error('Admin Dashboard API: Backend failed:', result);
      
      if (result.body && typeof result.body === 'object') {
        return NextResponse.json(result.body, { status: result.status || 500 });
      } else {
        return NextResponse.json({
          message: 'Failed to retrieve admin dashboard',
          error: result.body || 'Unknown backend error'
        }, { status: result.status || 500 });
      }
    }

  } catch (err: any) {
    console.error('Admin Dashboard API: Unexpected error', err);
    if (err instanceof Response) return err;
    return NextResponse.json({ 
      message: 'Internal server error',
      error: err?.message ?? 'Unknown error' 
    }, { status: 500 });
  }
}