import { NextRequest, NextResponse } from 'next/server';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ role: string }> }
) {
  try {
    const { role } = await params;
    
    // Get authorization header from the request
    const authHeader = request.headers.get('authorization');
    const cookie = request.headers.get('cookie');
    
    //(`🔄 API Route: Fetching users with role: ${role}`);
    
    // Forward request to backend with authentication
    const backendResponse = await fetch(`${API_BASE_URL}/users/by-role/${role}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(authHeader && { 'Authorization': authHeader }),
        ...(cookie && { 'Cookie': cookie }),
      },
      credentials: 'include',
    });

    //(`📡 Backend response for role ${role}: ${backendResponse.status}`);

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text().catch(() => '');
      console.error(`❌ Backend error for role ${role}:`, backendResponse.status, errorText);
      
      return NextResponse.json(
        { error: `Failed to fetch users with role ${role}`, details: errorText },
        { status: backendResponse.status }
      );
    }

    const data = await backendResponse.json();
    const users = Array.isArray(data) ? data : data?.data || data?.users || [];
    
    //(`✅ Successfully fetched ${users.length} users with role: ${role}`);
    
    return NextResponse.json(users);
    
  } catch (error: any) {
    console.error(`❌ API Route error for role:`, error);
    
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}