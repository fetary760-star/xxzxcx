import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireRole, forwardAuthHeaders } from '@/lib/serverAuth';

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

/**
 * GET /api/admin/soft-deleted-tasks
 * Retrieve all soft-deleted (inactive) tasks.
 * Admin-only endpoint.
 */
export async function GET(req: NextRequest) {
  try {
    // Require Admin role
    await requireRole(req, ['admin', '7']);

    const headers = forwardAuthHeaders(req);
    const backendUrl = `${API_BASE}/admin/soft-deleted-tasks`;

    const response = await fetch(backendUrl, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('[api/admin/soft-deleted-tasks] Backend error:', response.status, errorText);
      return NextResponse.json(
        { error: 'Backend error', message: `Failed to fetch soft-deleted tasks: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[api/admin/soft-deleted-tasks] Error:', error);

    // Handle AuthError from requireRole
    if (error?.name === 'AuthError' || error?.status) {
      return NextResponse.json(
        error.body || { error: 'Unauthorized', message: error.message },
        { status: error.status || 401 }
      );
    }

    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ error: 'unauthorized', message: 'requireRole failed' }));
      return NextResponse.json(errorData, { status: error.status });
    }

    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    );
  }
}