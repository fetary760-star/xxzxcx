import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthorizationHeader } from '@/lib/proxy-auth';

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

/** Forward Authorization/cookie headers when calling backend */
function buildForwardHeaders(incoming: Request) {
  const fh = new Headers();
  // FIX (refresh cascade): resolve the bearer token from Authorization
  // header, middleware-forwarded x-auth-token header, OR access_token/
  // auth_token/authToken cookie
  const finalAuthHeader = resolveAuthorizationHeader(incoming);
  if (finalAuthHeader) fh.set('authorization', finalAuthHeader);
  const cookie = incoming.headers.get('cookie');
  if (cookie) fh.set('cookie', cookie);
  fh.set('accept', 'application/json');
  fh.set('content-type', 'application/json');
  return fh;
}

/** Get CSRF token from cookies */
function getCsrfTokenFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === 'CSRF-TOKEN' || name === 'X-CSRF-TOKEN' || name === 'csrf-token') {
      return decodeURIComponent(value);
    }
  }
  return null;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ error: 'Invalid task ID' }, { status: 400 });
    }

    // Get the request body
    const body = await request.json();
    const { status, reopen_comment, assigned_engineer } = body;

    // Validate required fields
    if (!reopen_comment || !reopen_comment.trim()) {
      return NextResponse.json({ error: 'A comment is mandatory when reopening a task.' }, { status: 400 });
    }

    if (!assigned_engineer || (Array.isArray(assigned_engineer) && assigned_engineer.length === 0)) {
      return NextResponse.json({ error: 'You must assign at least one engineer when reopening a task.' }, { status: 400 });
    }

    // Forward the request to the backend API
    const backendUrl = `${API_BASE}/tasks/${encodeURIComponent(id)}/reopen`;
    const forwardHeaders = buildForwardHeaders(request);

    // CRITICAL FIX: Add CSRF token from cookies to headers
    const cookieHeader = request.headers.get('cookie');
    const csrfToken = getCsrfTokenFromCookies(cookieHeader);
    if (csrfToken) {
      forwardHeaders.set('X-CSRF-Token', csrfToken);
    }

    // CRITICAL FIX: Transform snake_case to PascalCase to match backend ReopenTaskRequest model
    const backendPayload = {
      Status: status || 'Pending',
      ReopenComment: reopen_comment,
      AssignedEngineer: Array.isArray(assigned_engineer) ? assigned_engineer : [assigned_engineer]
    };

    const backendRes = await fetch(backendUrl, {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify(backendPayload),
    });

    const responseText = await backendRes.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch {
      // If response is not JSON, create a proper error response
      if (!backendRes.ok) {
        return NextResponse.json({ 
          error: `Backend error: ${backendRes.status} ${backendRes.statusText}` 
        }, { status: backendRes.status });
      }
      responseData = { message: 'Task reopened successfully' };
    }

    // Return the backend's response
    return NextResponse.json(responseData, { status: backendRes.status });

  } catch (error: any) {
    console.error('Error reopening task:', error);
    return NextResponse.json({ 
      error: 'Internal server error', 
      details: error.message 
    }, { status: 500 });
  }
}