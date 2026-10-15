import { NextRequest, NextResponse } from 'next/server';

const API_BASE = process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_CMT_API_BASE_URL || 'http://localhost:5000/api';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const target = `${API_BASE}/tasks/${encodeURIComponent(String(id))}/attachments`;

  try {
    const headers: HeadersInit = {
      accept: 'application/json',
    };
    
    // Forward Authorization header if present
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      headers['authorization'] = authHeader;
    }
    
    // Forward cookie header if present
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      headers['cookie'] = cookieHeader;
    }

    const response = await fetch(target, {
      method: 'GET',
      headers,
    });
    const data = await response.text();
    
    return new Response(data, {
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type') ?? 'application/json',
      },
    });
  } catch (err: any) {
    console.error('Completed task attachments proxy error:', err);
    return NextResponse.json({ message: 'Internal proxy error', detail: err?.message }, { status: 500 });
  }
}