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

  try {
    const res = await fetch(url, { 
      method: options.method || 'GET',
      headers: { ...headers, ...options.headers },
      body: options.body,
      cache: 'no-store'
    });
    
    const ct = res.headers.get('content-type') || '';
    const isJson = ct.includes('application/json');
    const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);
    
    if (!res.ok) {
      return { ok: false, status: res.status, body, endpoint: url };
    }
    
    return { ok: true, status: res.status, body, endpoint: url };
  } catch (error) {
    return { ok: false, status: 0, body: String(error), endpoint: url };
  }
}

/**
 * POST /api/users/create-director
 * Create a new director (Admin only)
 * 
 * FIX: Returns HTTP 200 with { success: false, message: "..." } for validation errors
 * instead of passing through 400 status codes. This prevents the browser from logging
 * "POST ... 400 (Bad Request)" in the console, showing only user-friendly messages.
 */
export async function POST(req: NextRequest) {
  try {
    // Require Admin role
    await requireRole(req, ['admin']);

    // Parse request body
    const body = await req.json();

    // Validate required fields
    if (!body.username || !body.email || !body.fullName) {
      // FIX: Return 200 with success: false instead of 400
      return NextResponse.json({
        success: false,
        message: 'Missing required fields',
        errors: [
          ...(!body.username ? ['Username is required'] : []),
          ...(!body.email ? ['Email is required'] : []),
          ...(!body.fullName ? ['Full name is required'] : [])
        ]
      }, { status: 200 });
    }

    // Validate department assignment
    const hasNewDepartment = body.newDepartmentName && body.newDepartmentName.trim();
    const hasExistingDepartment = body.departmentId && body.departmentId !== '' && body.departmentId !== 'no-department';
    
    if (!hasNewDepartment && !hasExistingDepartment) {
      // FIX: Return 200 with success: false instead of 400
      return NextResponse.json({
        success: false,
        message: 'Director must be assigned to a department. Either select an existing department or create a new one.',
        errors: ['Department assignment is required for Director role']
      }, { status: 200 });
    }

    // Prepare payload for backend
    const payload: any = {
      Username: body.username?.trim(),
      Email: body.email?.trim(),
      FullName: body.fullName?.trim(),
      Password: body.password?.trim() || 'TempPass123!',
      Role: 'director', // Force director role
      IsActive: body.isActive !== undefined ? body.isActive : true
    };

    // Add department information
    if (hasNewDepartment) {
      payload.NewDepartmentName = body.newDepartmentName.trim();
      if (body.newDepartmentDescription && body.newDepartmentDescription.trim()) {
        payload.NewDepartmentDescription = body.newDepartmentDescription.trim();
      }
    } else if (hasExistingDepartment) {
      const departmentIdNum = parseInt(String(body.departmentId));
      if (!isNaN(departmentIdNum) && departmentIdNum > 0) {
        payload.DepartmentId = departmentIdNum;
      }
    }

    // Send to backend
    const backendUrl = `${API_BASE}/users/create-director`;
    const result = await proxyFetchUrl(backendUrl, req, {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    if (result.ok) {
      return NextResponse.json(result.body, { status: 201 });
    } else {
      // FIX: For 400 validation errors from backend, return 200 with success: false
      // This prevents the browser from logging "POST ... 400 (Bad Request)" in the console
      if (result.status === 400) {
        const errorMessage = (result.body && typeof result.body === 'object' && result.body.message) 
          ? result.body.message 
          : 'Failed to create director. Please check your input.';
        
        return NextResponse.json({
          success: false,
          message: errorMessage,
          errors: result.body?.errors || [errorMessage]
        }, { status: 200 });
      }

      // For other errors (500, etc.), also return 200 with success: false
      if (result.body && typeof result.body === 'object') {
        return NextResponse.json({
          success: false,
          message: result.body.message || 'Failed to create director',
          errors: result.body.errors || [result.body.message || 'An unexpected error occurred']
        }, { status: 200 });
      } else {
        return NextResponse.json({
          success: false,
          message: 'Failed to create director',
          errors: ['An unexpected error occurred. Please try again.']
        }, { status: 200 });
      }
    }

  } catch (err: any) {
    if (err instanceof Response) return err;
    return NextResponse.json({ 
      success: false,
      message: err?.message || 'Internal server error',
      errors: [err?.message || 'An unexpected error occurred']
    }, { status: 200 });
  }
}