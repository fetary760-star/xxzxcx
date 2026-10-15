/**
 * /api/reports/download/[id] - FIXED VERSION
 * 
 * Downloads a generated report by ID from the backend
 * Maps to C# backend endpoint: GET /api/reports/download/{reportId}
 * FIXED: Only supports Excel and PDF formats
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/serverAuth';

// Get API base URL from environment
const API_BASE = process.env.CMT_API_BASE_URL || 'http://localhost:5000/api';

// Allowed roles for reports download
const ALLOWED_ROLES = ['team_leader', 'director', 'shop_tl', 'customer_personnel'];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let controller: AbortController | null = null;
  
  try {
    // Resolve params
    const resolvedParams = await params;
    
    //('Reports Download API - Request for report ID:', resolvedParams.id);

    // Authenticate and authorize
    const user = await requireRole(req, ALLOWED_ROLES);
    //('Reports Download API - Authenticated user:', user.user_id || user.userId);

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'export_xlsx';
    
    // FIXED: Validate type - only allow Excel and PDF
    if (type !== 'export_xlsx' && type !== 'export_pdf') {
      return NextResponse.json(
        { error: 'Only Excel and PDF formats are supported' },
        { status: 400 }
      );
    }

    //('Reports Download API - Download type:', type);

    // Build backend URL
    const backendUrl = `${API_BASE}/reports/download/${resolvedParams.id}?type=${encodeURIComponent(type)}`;
    //('Reports Download API - Backend URL:', backendUrl);

    // Set up abort controller for timeout
    controller = new AbortController();
    const timeoutId = setTimeout(() => controller!.abort(), 30000); // 30 second timeout for file downloads

    // Forward request to backend
    const response = await fetch(backendUrl, {
      method: 'GET',
      headers: {
        'Authorization': req.headers.get('authorization') || '',
        'Content-Type': 'application/json',
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error('Reports Download API - Backend error:', response.status, response.statusText);
      return NextResponse.json(
        {
          error: 'Backend request failed',
          status: response.status,
          statusText: response.statusText,
          message: 'Failed to download report from backend',
        },
        { status: response.status }
      );
    }

    // Get the file content
    const fileBuffer = await response.arrayBuffer();
    
    // Determine content type and filename based on type
    let contentType: string;
    let filename: string;
    
    if (type === 'export_xlsx') {
      contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      filename = `report_${resolvedParams.id}.xlsx`;
    } else {
      contentType = 'application/pdf';
      filename = `report_${resolvedParams.id}.pdf`;
    }

    //('Reports Download API - Successfully downloaded file, size:', fileBuffer.byteLength, 'bytes');

    // Return the file with proper headers
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.byteLength.toString(),
      },
    });

  } catch (error: any) {
    console.error('Reports Download API - Error:', error);
    
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { error: 'Download timeout' },
        { status: 408 }
      );
    }

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: 'Failed to download report',
        details: error.message
      },
      { status: 500 }
    );
  } finally {
    if (controller) {
      controller.abort();
    }
  }
}