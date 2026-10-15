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
        // Added access_token to the cookie name pattern
        const tokenMatch = cookie.match(/(?:^|;\s*)(?:auth_token|authToken|access_token)=([^;]+)/);
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

  ('[api/admin/directors/managers/managerId] Fetching from:', url);

  try {
    const res = await fetch(url, { 
      method: options.method || 'GET',
      headers: { ...headers, ...options.headers },
      body: options.body,
      credentials: 'include',
      cache: 'no-store'
    });
    
    ('[api/admin/directors/managers/managerId] Backend response status:', res.status);
    
    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);
    
    if (!res.ok) {
      console.error('[api/admin/directors/managers/managerId] Backend error response:', { status: res.status, body });
      return { ok: false, status: res.status, body, endpoint: url };
    }
    
    return { ok: true, status: res.status, body, endpoint: url };
  } catch (error) {
    console.error('[api/admin/directors/managers/managerId] Network error:', error);
    return { ok: false, status: 0, body: String(error), endpoint: url };
  }
}

/**
 * DELETE /api/admin/directors/[directorId]/managers/[managerId]
 * Remove a manager from a director (unassign)
 * Admin-only endpoint
 * 
 * FIX: Fallback now clears SupervisorId and DepartmentId (actual DB columns)
 * instead of non-existent DirectorId
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ directorId: string; managerId: string }> }
) {
  try {
    ('[api/admin/directors/managers/managerId] Processing DELETE request');
    
    // Require Admin role
    await requireRole(req, ['admin', '7']);
    ('[api/admin/directors/managers/managerId] Authorization successful');

    const resolvedParams = await params;
    const { directorId, managerId } = resolvedParams;

    if (!directorId || isNaN(Number(directorId))) {
      return NextResponse.json({
        message: 'Invalid director ID'
      }, { status: 400 });
    }

    if (!managerId || isNaN(Number(managerId))) {
      return NextResponse.json({
        message: 'Invalid manager ID'
      }, { status: 400 });
    }

    ('[api/admin/directors/managers/managerId] Removing manager', managerId, 'from director', directorId);

    // Try the dedicated backend endpoint first
    const backendUrl = `${API_BASE}/admin/directors/${directorId}/managers/${managerId}`;
    const result = await proxyFetchUrl(backendUrl, req, {
      method: 'DELETE'
    });

    if (result.ok) {
      ('[api/admin/directors/managers/managerId] Manager removed successfully via backend');
      return new NextResponse(null, { status: 204 });
    }

    // FIX: Fallback - Clear the manager's DepartmentId and SupervisorId via /users endpoint
    // NOTE: User model does NOT have DirectorId column. Use actual columns.
    ('[api/admin/directors/managers/managerId] Backend failed, using /users fallback to remove manager');
    
    const updateUrl = `${API_BASE}/users/${managerId}`;
    const updateResult = await proxyFetchUrl(updateUrl, req, {
      method: 'PUT',
      body: JSON.stringify({ 
        // FIX: Clear SupervisorId (the actual column linking to director)
        SupervisorId: null,
        supervisor_id: null,
        // Also clear DepartmentId to fully unlink from director's department
        DepartmentId: null,
        department_id: null,
        Role: 'manager'
      })
    });
    
    if (updateResult.ok) {
      ('[api/admin/directors/managers/managerId] Manager removed successfully via /users fallback');
      return new NextResponse(null, { status: 204 });
    }
    
    console.error('[api/admin/directors/managers/managerId] Both backend and fallback failed:', { backend: result, fallback: updateResult });
    
    // Return the most relevant error
    const errorResult = updateResult.status !== 0 ? updateResult : result;
    if (errorResult.body && typeof errorResult.body === 'object') {
      return NextResponse.json(errorResult.body, { status: errorResult.status || 500 });
    } else {
      return NextResponse.json({
        message: 'Failed to remove manager',
        error: errorResult.body || 'Unknown backend error'
      }, { status: errorResult.status || 500 });
    }

  } catch (err: any) {
    console.error('[api/admin/directors/managers/managerId] Unexpected error in DELETE', err);
    if (err instanceof Response) return err;
    return NextResponse.json({ 
      message: 'Internal server error',
      error: err?.message ?? 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * PUT /api/admin/directors/[directorId]/managers/[managerId]
 * Transfer a manager to a different director
 * Admin-only endpoint
 * 
 * FIX: Fallback now uses SupervisorId and DepartmentId (actual DB columns)
 * instead of non-existent DirectorId
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ directorId: string; managerId: string }> }
) {
  try {
    ('[api/admin/directors/managers/managerId] Processing PUT request');
    
    // Require Admin role
    await requireRole(req, ['admin', '7']);
    ('[api/admin/directors/managers/managerId] Authorization successful');

    const resolvedParams = await params;
    const { directorId, managerId } = resolvedParams;

    if (!directorId || isNaN(Number(directorId))) {
      return NextResponse.json({
        message: 'Invalid director ID'
      }, { status: 400 });
    }

    if (!managerId || isNaN(Number(managerId))) {
      return NextResponse.json({
        message: 'Invalid manager ID'
      }, { status: 400 });
    }

    // Parse request body for new director ID
    const body = await req.json();
    const newDirectorId = body.newDirectorId;

    if (!newDirectorId || isNaN(Number(newDirectorId))) {
      return NextResponse.json({
        message: 'Invalid new director ID'
      }, { status: 400 });
    }

    ('[api/admin/directors/managers/managerId] Transferring manager', managerId, 'from director', directorId, 'to director', newDirectorId);

    // Try the dedicated backend endpoint first
    const backendUrl = `${API_BASE}/admin/directors/${directorId}/managers/${managerId}/transfer`;
    const result = await proxyFetchUrl(backendUrl, req, {
      method: 'PUT',
      body: JSON.stringify({ NewDirectorId: Number(newDirectorId) })
    });

    if (result.ok) {
      ('[api/admin/directors/managers/managerId] Manager transferred successfully via backend');
      return NextResponse.json(result.body || { success: true, message: 'Manager transferred successfully' }, { status: 200 });
    }

    // FIX: Fallback - Find new director's department, then update manager's DepartmentId and SupervisorId
    ('[api/admin/directors/managers/managerId] Backend failed, using improved /users fallback to transfer manager');
    
    // Step 1: Find a department owned by the new director
    let newDepartmentId: number | null = null;
    const departmentsUrl = `${API_BASE}/departments`;
    const departmentsResult = await proxyFetchUrl(departmentsUrl, req);
    
    if (departmentsResult.ok && Array.isArray(departmentsResult.body)) {
      const newDirectorDepartment = departmentsResult.body.find((dept: any) => {
        const deptDirectorId = dept.director_id || dept.directorId || dept.DirectorId;
        const isActive = dept.is_active ?? dept.isActive ?? dept.IsActive ?? true;
        return String(deptDirectorId) === String(newDirectorId) && isActive;
      });
      
      if (newDirectorDepartment) {
        newDepartmentId = newDirectorDepartment.department_id || newDirectorDepartment.departmentId || 
                         newDirectorDepartment.DepartmentId || newDirectorDepartment.id;
        ('[api/admin/directors/managers/managerId] Found new director department:', newDepartmentId);
      }
    }
    
    // Step 2: Update the manager with new SupervisorId and DepartmentId
    const updateUrl = `${API_BASE}/users/${managerId}`;
    const updatePayload: any = { 
      // FIX: Use SupervisorId (actual DB column) instead of DirectorId
      SupervisorId: Number(newDirectorId),
      supervisor_id: Number(newDirectorId),
      Role: 'manager'
    };
    
    if (newDepartmentId) {
      updatePayload.DepartmentId = Number(newDepartmentId);
      updatePayload.department_id = Number(newDepartmentId);
    }
    
    const updateResult = await proxyFetchUrl(updateUrl, req, {
      method: 'PUT',
      body: JSON.stringify(updatePayload)
    });
    
    if (updateResult.ok) {
      ('[api/admin/directors/managers/managerId] Manager transferred successfully via /users fallback');
      return NextResponse.json({ success: true, message: 'Manager transferred successfully' }, { status: 200 });
    }
    
    console.error('[api/admin/directors/managers/managerId] Both backend and fallback failed:', { backend: result, fallback: updateResult });
    
    // Return the most relevant error
    const errorResult = updateResult.status !== 0 ? updateResult : result;
    if (errorResult.body && typeof errorResult.body === 'object') {
      return NextResponse.json(errorResult.body, { status: errorResult.status || 500 });
    } else {
      return NextResponse.json({
        message: 'Failed to transfer manager',
        error: errorResult.body || 'Unknown backend error'
      }, { status: errorResult.status || 500 });
    }

  } catch (err: any) {
    console.error('[api/admin/directors/managers/managerId] Unexpected error in PUT', err);
    if (err instanceof Response) return err;
    return NextResponse.json({ 
      message: 'Internal server error',
      error: err?.message ?? 'Unknown error' 
    }, { status: 500 });
  }
}