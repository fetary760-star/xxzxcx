import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireRole } from '@/lib/serverAuth';

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

/**
 * Proxy fetch that forwards auth headers and CSRF token from incoming request
 */
async function proxyFetchUrl(url: string, incomingReq?: NextRequest, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (incomingReq) {
    // Forward Authorization header
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

    // Forward CSRF token for POST/PUT/DELETE requests
    const method = (options.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      const csrfToken = incomingReq.headers.get('x-csrf-token') || 
                       incomingReq.headers.get('X-CSRF-Token') ||
                       incomingReq.headers.get('csrf-token');
      
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
        headers['X-Requested-With'] = 'XMLHttpRequest';
      } else {
        const cookie = incomingReq.headers.get('cookie');
        if (cookie) {
          const csrfMatch = cookie.match(/(?:^|;\s*)(?:CSRF-TOKEN|X-CSRF-TOKEN|csrf-token)=([^;]+)/);
          if (csrfMatch) {
            const cookieCsrfToken = decodeURIComponent(csrfMatch[1]);
            headers['X-CSRF-Token'] = cookieCsrfToken;
            headers['X-Requested-With'] = 'XMLHttpRequest';
          }
        }
      }
      
      // Forward all cookies
      const allCookies = incomingReq.headers.get('cookie');
      if (allCookies) {
        headers['Cookie'] = allCookies;
      }
    }
  }

  ('[api/admin/directors] Fetching from:', url);

  try {
    const res = await fetch(url, { 
      method: options.method || 'GET',
      headers: { ...headers, ...options.headers },
      body: options.body,
      credentials: 'include',
      cache: 'no-store'
    });
    
    ('[api/admin/directors] Backend response status:', res.status);
    
    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);
    
    if (!res.ok) {
      console.error('[api/admin/directors] Backend error response:', { status: res.status, body });
      return { ok: false, status: res.status, body, endpoint: url };
    }
    
    return { ok: true, status: res.status, body, endpoint: url };
  } catch (error) {
    console.error('[api/admin/directors] Network error:', error);
    return { ok: false, status: 0, body: String(error), endpoint: url };
  }
}

/**
 * GET /api/admin/directors/[directorId]
 * Get a specific director's details including assigned managers
 * Admin-only endpoint
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ directorId: string }> }
) {
  try {
    ('[api/admin/directors] Processing GET request');
    
    // Require Admin role
    await requireRole(req, ['admin', '7']);
    ('[api/admin/directors] Authorization successful');

    const resolvedParams = await params;
    const directorId = resolvedParams.directorId;

    if (!directorId || isNaN(Number(directorId))) {
      return NextResponse.json({
        message: 'Invalid director ID'
      }, { status: 400 });
    }

    // Fetch director details from backend
    const backendUrl = `${API_BASE}/admin/directors/${directorId}`;
    const result = await proxyFetchUrl(backendUrl, req);

    if (result.ok) {
      ('[api/admin/directors] Director retrieved successfully');
      return NextResponse.json(result.body, { status: 200 });
    } else {
      console.error('[api/admin/directors] Backend failed:', result);
      
      if (result.body && typeof result.body === 'object') {
        return NextResponse.json(result.body, { status: result.status || 500 });
      } else {
        return NextResponse.json({
          message: 'Failed to retrieve director',
          error: result.body || 'Unknown backend error'
        }, { status: result.status || 500 });
      }
    }

  } catch (err: any) {
    console.error('[api/admin/directors] Unexpected error in GET', err);
    if (err instanceof Response) return err;
    return NextResponse.json({ 
      message: 'Internal server error',
      error: err?.message ?? 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * PUT /api/admin/directors/[directorId]
 * Update a director's information including:
 * - Basic info (name, email, username)
 * - canCreateTeamLeader permission
 * - Active/inactive status
 * - Department reassignment
 * Admin-only endpoint
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ directorId: string }> }
) {
  try {
    ('[api/admin/directors] Processing PUT request');
    
    // Require Admin role
    await requireRole(req, ['admin', '7']);
    ('[api/admin/directors] Authorization successful');

    const resolvedParams = await params;
    const directorId = resolvedParams.directorId;

    if (!directorId || isNaN(Number(directorId))) {
      return NextResponse.json({
        message: 'Invalid director ID'
      }, { status: 400 });
    }

    // Parse request body
    const body = await req.json();
    ('[api/admin/directors] Request body received:', { 
      ...body, 
      newPassword: body.newPassword ? '[REDACTED]' : undefined 
    });

    // Validate required fields
    if (!body.fullName || !body.email || !body.username) {
      return NextResponse.json({
        message: 'Missing required fields',
        errors: [
          ...(!body.fullName ? ['Full name is required'] : []),
          ...(!body.email ? ['Email is required'] : []),
          ...(!body.username ? ['Username is required'] : [])
        ]
      }, { status: 400 });
    }

    // Prepare payload for backend
    const payload: any = {
      Username: body.username?.trim(),
      Email: body.email?.trim(),
      FullName: body.fullName?.trim(),
      Role: 'director',
      IsActive: body.isActive !== undefined ? body.isActive : true,
      CanCreateTeamLeader: body.canCreateTeamLeader === true
    };

    // Handle password update
    if (body.newPassword && body.newPassword.trim()) {
      payload.NewPassword = body.newPassword.trim();
    }

    // Handle department reassignment
    if (body.departmentId) {
      const departmentIdNum = parseInt(String(body.departmentId));
      if (!isNaN(departmentIdNum) && departmentIdNum > 0) {
        payload.DepartmentId = departmentIdNum;
      }
    }

    ('[api/admin/directors] Sending to backend:', { 
      ...payload, 
      NewPassword: payload.NewPassword ? '[REDACTED]' : undefined 
    });

    // Send to backend
    const backendUrl = `${API_BASE}/admin/directors/${directorId}`;
    const result = await proxyFetchUrl(backendUrl, req, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });

    if (result.ok) {
      ('[api/admin/directors] Director updated successfully');
      return NextResponse.json(result.body, { status: 200 });
    } else {
      console.error('[api/admin/directors] Backend failed to update director:', result);
      
      if (result.body && typeof result.body === 'object') {
        return NextResponse.json(result.body, { status: result.status || 500 });
      } else {
        return NextResponse.json({
          message: 'Failed to update director',
          error: result.body || 'Unknown backend error'
        }, { status: result.status || 500 });
      }
    }

  } catch (err: any) {
    console.error('[api/admin/directors] Unexpected error in PUT', err);
    if (err instanceof Response) return err;
    return NextResponse.json({ 
      message: 'Internal server error',
      error: err?.message ?? 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/directors/[directorId]
 * Deactivate or delete a director
 * Admin-only endpoint
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ directorId: string }> }
) {
  try {
    ('[api/admin/directors] Processing DELETE request');
    
    // Require Admin role
    await requireRole(req, ['admin', '7']);
    ('[api/admin/directors] Authorization successful');

    const resolvedParams = await params;
    const directorId = resolvedParams.directorId;

    if (!directorId || isNaN(Number(directorId))) {
      return NextResponse.json({
        message: 'Invalid director ID'
      }, { status: 400 });
    }

    // Send to backend
    const backendUrl = `${API_BASE}/admin/directors/${directorId}`;
    const result = await proxyFetchUrl(backendUrl, req, {
      method: 'DELETE'
    });

    if (result.ok) {
      ('[api/admin/directors] Director deleted successfully');
      return new NextResponse(null, { status: 204 });
    } else {
      console.error('[api/admin/directors] Backend failed to delete director:', result);
      
      if (result.body && typeof result.body === 'object') {
        return NextResponse.json(result.body, { status: result.status || 500 });
      } else {
        return NextResponse.json({
          message: 'Failed to delete director',
          error: result.body || 'Unknown backend error'
        }, { status: result.status || 500 });
      }
    }

  } catch (err: any) {
    console.error('[api/admin/directors] Unexpected error in DELETE', err);
    if (err instanceof Response) return err;
    return NextResponse.json({ 
      message: 'Internal server error',
      error: err?.message ?? 'Unknown error' 
    }, { status: 500 });
  }
}