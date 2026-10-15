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
        // FIX 2: Added access_token to the cookie name pattern
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

  ('[api/admin/directors/managers] Fetching from:', url);

  try {
    const res = await fetch(url, { 
      method: options.method || 'GET',
      headers: { ...headers, ...options.headers },
      body: options.body,
      credentials: 'include',
      cache: 'no-store'
    });
    
    ('[api/admin/directors/managers] Backend response status:', res.status);
    
    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);
    
    if (!res.ok) {
      console.error('[api/admin/directors/managers] Backend error response:', { status: res.status, body });
      return { ok: false, status: res.status, body, endpoint: url };
    }
    
    return { ok: true, status: res.status, body, endpoint: url };
  } catch (error) {
    console.error('[api/admin/directors/managers] Network error:', error);
    return { ok: false, status: 0, body: String(error), endpoint: url };
  }
}

/**
 * GET /api/admin/directors/[directorId]/managers
 * Get all managers assigned to a specific director
 * Admin-only endpoint
 * 
 * FIX: Also checks SupervisorId and ManagerId relationships as fallback
 * when department-based lookup returns empty results
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ directorId: string }> }
) {
  try {
    ('[api/admin/directors/managers] Processing GET request');
    
    // Require Admin role
    await requireRole(req, ['admin', '7']);
    ('[api/admin/directors/managers] Authorization successful');

    const resolvedParams = await params;
    const directorId = resolvedParams.directorId;

    if (!directorId || isNaN(Number(directorId))) {
      return NextResponse.json({
        message: 'Invalid director ID'
      }, { status: 400 });
    }

    // Try backend endpoint first
    const backendUrl = `${API_BASE}/admin/directors/${directorId}/managers`;
    const result = await proxyFetchUrl(backendUrl, req);

    if (result.ok) {
      ('[api/admin/directors/managers] Managers retrieved successfully from backend');
      return NextResponse.json(result.body, { status: 200 });
    }

    // FIX: Improved fallback - fetch departments first, then filter managers by department
    // AND also check SupervisorId/ManagerId relationships
    ('[api/admin/directors/managers] Backend endpoint failed, using improved fallback');
    
    // Step 1: Fetch all departments to find those owned by this director
    const departmentsUrl = `${API_BASE}/departments`;
    const departmentsResult = await proxyFetchUrl(departmentsUrl, req);
    
    let directorDepartmentIds: number[] = [];
    
    if (departmentsResult.ok && Array.isArray(departmentsResult.body)) {
      // Filter departments where director_id matches
      const directorDepartments = departmentsResult.body.filter((dept: any) => {
        const deptDirectorId = dept.director_id || dept.directorId || dept.DirectorId;
        return String(deptDirectorId) === String(directorId);
      });
      
      directorDepartmentIds = directorDepartments.map((dept: any) => 
        dept.department_id || dept.departmentId || dept.DepartmentId || dept.id
      ).filter(Boolean);
      
      ('[api/admin/directors/managers] Found director departments:', directorDepartmentIds);
    }
    
    // Step 2: Fetch all users and filter for managers linked to this director
    const usersUrl = `${API_BASE}/users`;
    const usersResult = await proxyFetchUrl(usersUrl, req);
    
    if (usersResult.ok) {
      const allUsers = Array.isArray(usersResult.body) ? usersResult.body : [];
      
      // FIX: Filter for managers assigned to this director via multiple relationship types
      const managers = allUsers.filter((user: any) => {
        const role = (user.role || user.role_name || user.roleName || user.Role || '').toLowerCase();
        const userDepartmentId = user.department_id || user.departmentId || user.DepartmentId;
        const userDirectorId = user.director_id || user.directorId || user.DirectorId;
        const userSupervisorId = user.supervisor_id || user.supervisorId || user.SupervisorId;
        const userManagerId = user.manager_id || user.managerId || user.ManagerId;
        
        // Check if user is a manager
        if (role !== 'manager') return false;
        
        // Method 1: Check if manager's department is in director's departments
        if (userDepartmentId && directorDepartmentIds.length > 0) {
          if (directorDepartmentIds.includes(Number(userDepartmentId))) {
            return true;
          }
        }
        
        // Method 2: Check if manager has direct director_id assignment
        if (userDirectorId && String(userDirectorId) === String(directorId)) {
          return true;
        }
        
        // Method 3 (FIX): Check if manager's SupervisorId points to this director
        if (userSupervisorId && String(userSupervisorId) === String(directorId)) {
          return true;
        }
        
        // Method 4 (FIX): Check if manager's ManagerId points to this director
        // (some systems use ManagerId for the hierarchical relationship)
        if (userManagerId && String(userManagerId) === String(directorId)) {
          return true;
        }
        
        return false;
      }).map((user: any) => ({
        userId: user.user_id || user.userId || user.UserId || user.id,
        fullName: user.full_name || user.fullName || user.FullName || user.name,
        username: user.username || user.Username,
        email: user.email || user.Email,
        isActive: user.is_active ?? user.isActive ?? user.IsActive ?? true,
        departmentId: user.department_id || user.departmentId || user.DepartmentId,
        departmentName: user.department_name || user.departmentName || user.DepartmentName,
        directorId: user.director_id || user.directorId || user.DirectorId,
        supervisorId: user.supervisor_id || user.supervisorId || user.SupervisorId
      }));
      
      ('[api/admin/directors/managers] Filtered managers from /users:', managers.length);
      return NextResponse.json(managers, { status: 200 });
    }
    
    console.error('[api/admin/directors/managers] Backend failed:', result);
    
    if (result.body && typeof result.body === 'object') {
      return NextResponse.json(result.body, { status: result.status || 500 });
    } else {
      return NextResponse.json({
        message: 'Failed to retrieve managers',
        error: result.body || 'Unknown backend error'
      }, { status: result.status || 500 });
    }

  } catch (err: any) {
    console.error('[api/admin/directors/managers] Unexpected error in GET', err);
    if (err instanceof Response) return err;
    return NextResponse.json({ 
      message: 'Internal server error',
      error: err?.message ?? 'Unknown error' 
    }, { status: 500 });
  }
}

/**
 * POST /api/admin/directors/[directorId]/managers
 * Assign a manager to a director
 * Admin-only endpoint
 * 
 * FIX: Fallback now uses SupervisorId (which exists on User model) instead of
 * non-existent DirectorId. Also attempts to find/create a department link.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ directorId: string }> }
) {
  try {
    ('[api/admin/directors/managers] Processing POST request');
    
    // Require Admin role
    await requireRole(req, ['admin', '7']);
    ('[api/admin/directors/managers] Authorization successful');

    const resolvedParams = await params;
    const directorId = resolvedParams.directorId;

    if (!directorId || isNaN(Number(directorId))) {
      return NextResponse.json({
        message: 'Invalid director ID'
      }, { status: 400 });
    }

    // Parse request body
    const body = await req.json();
    const managerId = body.managerId;

    if (!managerId || isNaN(Number(managerId))) {
      return NextResponse.json({
        message: 'Invalid manager ID'
      }, { status: 400 });
    }

    ('[api/admin/directors/managers] Assigning manager', managerId, 'to director', directorId);

    // Try the dedicated backend endpoint first
    const backendUrl = `${API_BASE}/admin/directors/${directorId}/managers`;
    const result = await proxyFetchUrl(backendUrl, req, {
      method: 'POST',
      body: JSON.stringify({ ManagerId: Number(managerId) })
    });

    if (result.ok) {
      ('[api/admin/directors/managers] Manager assigned successfully via backend');
      return NextResponse.json(result.body || { success: true, message: 'Manager assigned successfully' }, { status: 200 });
    }

    // Fallback: Find a department owned by this director, then update the manager
    ('[api/admin/directors/managers] Backend failed, using improved fallback to assign manager');
    
    // Step 1: Get departments owned by this director
    const departmentsUrl = `${API_BASE}/departments`;
    const departmentsResult = await proxyFetchUrl(departmentsUrl, req);
    
    let targetDepartmentId: number | null = null;
    
    if (departmentsResult.ok && Array.isArray(departmentsResult.body)) {
      const directorDepartment = departmentsResult.body.find((dept: any) => {
        const deptDirectorId = dept.director_id || dept.directorId || dept.DirectorId;
        const isActive = dept.is_active ?? dept.isActive ?? dept.IsActive ?? true;
        return String(deptDirectorId) === String(directorId) && isActive;
      });
      
      if (directorDepartment) {
        targetDepartmentId = directorDepartment.department_id || directorDepartment.departmentId || 
                            directorDepartment.DepartmentId || directorDepartment.id;
        ('[api/admin/directors/managers] Found target department:', targetDepartmentId);
      }
    }
    
    // Step 2: Update the manager - use DepartmentId and SupervisorId (actual DB columns)
    // NOTE: The User model does NOT have a DirectorId column.
    // The relationship is: User.DepartmentId -> Department.DirectorId
    // We also set SupervisorId as a direct fallback link.
    const updateUrl = `${API_BASE}/users/${managerId}`;
    const updatePayload: any = {
      Role: 'manager',
      // FIX: Set SupervisorId to link manager to director directly
      SupervisorId: Number(directorId),
      supervisor_id: Number(directorId)
    };
    
    // Include department assignment if we found one
    if (targetDepartmentId) {
      updatePayload.DepartmentId = Number(targetDepartmentId);
      updatePayload.department_id = Number(targetDepartmentId);
    }
    
    const updateResult = await proxyFetchUrl(updateUrl, req, {
      method: 'PUT',
      body: JSON.stringify(updatePayload)
    });
    
    if (updateResult.ok) {
      ('[api/admin/directors/managers] Manager assigned successfully via /users fallback');
      return NextResponse.json({ 
        success: true, 
        message: 'Manager assigned successfully',
        departmentId: targetDepartmentId,
        supervisorId: Number(directorId)
      }, { status: 200 });
    }
    
    console.error('[api/admin/directors/managers] Both backend and fallback failed:', { backend: result, fallback: updateResult });
    
    // Return the most relevant error
    const errorResult = updateResult.status !== 0 ? updateResult : result;
    if (errorResult.body && typeof errorResult.body === 'object') {
      return NextResponse.json(errorResult.body, { status: errorResult.status || 500 });
    } else {
      return NextResponse.json({
        message: 'Failed to assign manager',
        error: errorResult.body || 'Unknown backend error'
      }, { status: errorResult.status || 500 });
    }

  } catch (err: any) {
    console.error('[api/admin/directors/managers] Unexpected error in POST', err);
    if (err instanceof Response) return err;
    return NextResponse.json({ 
      message: 'Internal server error',
      error: err?.message ?? 'Unknown error' 
    }, { status: 500 });
  }
}