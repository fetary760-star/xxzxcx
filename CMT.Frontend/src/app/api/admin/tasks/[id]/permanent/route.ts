import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { requireRole, forwardAuthHeaders } from '@/lib/serverAuth';

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

/**
 * DELETE /api/admin/tasks/[id]/permanent
 * Permanently hard-delete a soft-deleted task and all related records.
 * Admin-only endpoint.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Require Admin role
    await requireRole(req, ['admin', '7']);

    const resolvedParams = await params;
    const taskId = resolvedParams.id;

    if (!taskId || isNaN(Number(taskId))) {
      return NextResponse.json(
        { error: 'Invalid task ID' },
        { status: 400 }
      );
    }

    const headers = forwardAuthHeaders(req);
    const backendUrl = `${API_BASE}/admin/tasks/${taskId}/permanent`;

    const response = await fetch(backendUrl, {
      method: 'DELETE',
      headers,
      cache: 'no-store',
    });

    if (!response.ok) {
      const ct = response.headers.get('content-type') || '';
      const isJson = ct.includes('application/json');
      const body = isJson ? await response.json().catch(() => null) : await response.text().catch(() => null);
      console.error('[api/admin/tasks/permanent] Backend error:', response.status, body);
      return NextResponse.json(
        body && typeof body === 'object' ? body : { error: 'Backend error', message: `Failed to permanently delete task: ${response.status}` },
        { status: response.status }
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return NextResponse.json({ message: `Task ${taskId} permanently deleted.` });
    }

    const data = await response.json().catch(() => ({ message: `Task ${taskId} permanently deleted.` }));
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[api/admin/tasks/permanent] Error:', error);

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