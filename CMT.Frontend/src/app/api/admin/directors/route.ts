import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireRole } from '@/lib/serverAuth';

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

/**
 * Proxy fetch that forwards auth headers from incoming request
 */
async function proxyFetchUrl(url: string, incomingReq?: NextRequest) {
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

  ('[api/admin/directors] Fetching from:', url);

  try {
    const res = await fetch(url, { 
      method: 'GET',
      headers,
      credentials: 'include',
      cache: 'no-store'
    });
    
    ('[api/admin/directors] Backend response status:', res.status);
    
    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);
    
    if (!res.ok) {
      console.error('[api/admin/directors] Backend error response:', { status: res.status, body });
      return { ok: false, status: res.status, body };
    }
    
    return { ok: true, status: res.status, body };
  } catch (error) {
    console.error('[api/admin/directors] Network error:', error);
    return { ok: false, status: 0, body: String(error) };
  }
}

interface User {
  user_id?: number;
  userId?: number;
  id?: number;
  Id?: number;
  role_id?: number;
  roleId?: number;
  RoleId?: number;
  role_name?: string;
  roleName?: string;
  role?: string;
  Role?: string;
  full_name?: string;
  fullName?: string;
  name?: string;
  Name?: string;
  username?: string;
  Username?: string;
  email?: string;
  Email?: string;
  department_id?: number;
  departmentId?: number;
  DepartmentId?: number;
  department_name?: string;
  departmentName?: string;
  DepartmentName?: string;
  is_active?: boolean;
  isActive?: boolean;
  IsActive?: boolean;
  can_create_team_leader?: boolean;
  canCreateTeamLeader?: boolean;
  CanCreateTeamLeader?: boolean;
}

interface FormattedDirector {
  id: number;
  userId: number;
  fullName: string;
  username?: string;
  email?: string;
  roleId?: number;
  roleName?: string;
  departmentId?: number;
  departmentName?: string;
  isActive?: boolean;
  canCreateTeamLeader?: boolean;
}

/**
 * GET /api/admin/directors
 * Get all directors with their details
 * Admin-only endpoint
 * 
 * This endpoint tries to fetch from the backend first.
 * If the backend doesn't support the endpoint (403/404), it falls back to
 * fetching all users and filtering for directors (role_id = 1).
 */
export async function GET(req: NextRequest) {
  try {
    ('[api/admin/directors] Processing GET request');
    
    // Require Admin role
    await requireRole(req, ['admin', '7']);
    ('[api/admin/directors] Authorization successful');

    // Try to fetch from backend's admin/directors endpoint
    const backendUrl = `${API_BASE}/admin/directors`;
    const result = await proxyFetchUrl(backendUrl, req);

    if (result.ok) {
      ('[api/admin/directors] Successfully fetched from backend');
      return NextResponse.json(result.body, { status: 200 });
    }

    // If backend doesn't support this endpoint (403/404), fall back to filtering users
    if (result.status === 403 || result.status === 404) {
      ('[api/admin/directors] Backend endpoint not available, falling back to /users filtering');
      
      const usersUrl = `${API_BASE}/users`;
      const usersResult = await proxyFetchUrl(usersUrl, req);

      if (!usersResult.ok) {
        console.error('[api/admin/directors] Failed to fetch users for fallback:', usersResult);
        return NextResponse.json({
          message: 'Failed to retrieve directors',
          error: usersResult.body || 'Backend error'
        }, { status: usersResult.status || 500 });
      }

      const data = usersResult.body;
      const allUsers = Array.isArray(data) ? data : data?.data ?? [];

      // Filter for directors (role_id = 1 or role_name = 'director')
      const directors = allUsers.filter((user: User) => {
        const roleId = user.role_id ?? user.roleId ?? user.RoleId;
        const roleName = (user.role_name ?? user.roleName ?? user.role ?? user.Role ?? '').toLowerCase().trim();
        
        return roleId === 1 || roleName === 'director';
      });

      // Format the response with consistent field names
      const formattedDirectors: FormattedDirector[] = directors.map((user: User) => ({
        id: user.user_id ?? user.userId ?? user.id ?? user.Id ?? 0,
        userId: user.user_id ?? user.userId ?? user.id ?? user.Id ?? 0,
        fullName: user.full_name ?? user.fullName ?? user.name ?? user.Name ?? user.username ?? user.Username ?? 'Unknown',
        username: user.username ?? user.Username,
        email: user.email ?? user.Email,
        roleId: user.role_id ?? user.roleId ?? user.RoleId,
        roleName: user.role_name ?? user.roleName ?? user.role ?? user.Role,
        departmentId: user.department_id ?? user.departmentId ?? user.DepartmentId,
        departmentName: user.department_name ?? user.departmentName ?? user.DepartmentName,
        isActive: user.is_active ?? user.isActive ?? user.IsActive ?? true,
        canCreateTeamLeader: user.can_create_team_leader ?? user.canCreateTeamLeader ?? user.CanCreateTeamLeader ?? false
      }));

      ('[api/admin/directors] Filtered directors from users:', formattedDirectors.length);
      return NextResponse.json(formattedDirectors, { status: 200 });
    }

    // For other errors, return the backend error
    console.error('[api/admin/directors] Backend error:', result);
    if (result.body && typeof result.body === 'object') {
      return NextResponse.json(result.body, { status: result.status || 500 });
    } else {
      return NextResponse.json({
        message: 'Failed to retrieve directors',
        error: result.body || 'Unknown backend error'
      }, { status: result.status || 500 });
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