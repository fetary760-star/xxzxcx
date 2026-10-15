import { NextRequest, NextResponse } from 'next/server';

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_CMT_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

/**
 * GET /api/tasks/[id]/attachments
 * 
 * Fetches the list of attachments for a specific task.
 * Proxies the request to the backend API.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  
  if (!taskId || taskId === 'undefined') {
    return NextResponse.json(
      { error: 'Task ID is required', attachments: [] },
      { status: 400 }
    );
  }

  // Build the backend URL to fetch attachments list
  const attachmentsUrls = [
    `${API_BASE}/tasks/${encodeURIComponent(taskId)}/attachments`,
    `${API_BASE}/attachments?task_id=${encodeURIComponent(taskId)}`,
    `${API_BASE}/attachments/task/${encodeURIComponent(taskId)}`,
  ];

  try {
    // Build headers to forward to backend
    const headers: HeadersInit = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    
    // Forward Authorization header if present
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    
    // Forward cookie header if present (for session-based auth)
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    // Forward CSRF token if present
    const csrfToken = request.headers.get('x-csrf-token');
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    const requestedWith = request.headers.get('x-requested-with');
    if (requestedWith) {
      headers['X-Requested-With'] = requestedWith;
    }

    let lastError: Error | null = null;
    let successData: any = null;

    // Try each URL pattern until one succeeds
    for (const targetUrl of attachmentsUrls) {
      try {
        (`[Attachments] Fetching from: ${targetUrl}`);
        
        const response = await fetch(targetUrl, {
          method: 'GET',
          headers,
        });

        if (response.ok) {
          const data = await response.json().catch(() => []);
          successData = data;
          (`[Attachments] Success from: ${targetUrl}, count: ${Array.isArray(data) ? data.length : 'N/A'}`);
          break;
        } else if (response.status === 404) {
          (`[Attachments] Endpoint not found: ${targetUrl}, trying next...`);
          continue;
        } else {
          const errorText = await response.text().catch(() => '');
          console.error(`[Attachments] Failed from ${targetUrl}: ${response.status} - ${errorText}`);
          lastError = new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }
      } catch (fetchErr: any) {
        console.error(`[Attachments] Network error for ${targetUrl}:`, fetchErr.message);
        lastError = fetchErr;
        continue;
      }
    }

    if (successData === null) {
      // Return empty array instead of error for better UX
      console.warn(`[Attachments] All endpoints failed for task ${taskId}, returning empty array`);
      return NextResponse.json(
        { 
          attachments: [],
          message: 'No attachments found or unable to fetch attachments',
          taskId 
        },
        { status: 200 }
      );
    }

    // Normalize the response - ensure we return an array
    let attachmentsList: any[] = [];
    if (Array.isArray(successData)) {
      attachmentsList = successData;
    } else if (successData && Array.isArray(successData.attachments)) {
      attachmentsList = successData.attachments;
    } else if (successData && Array.isArray(successData.data)) {
      attachmentsList = successData.data;
    } else if (successData && Array.isArray(successData.items)) {
      attachmentsList = successData.items;
    } else if (successData && typeof successData === 'object') {
      // Try to find any array property
      for (const key of Object.keys(successData)) {
        if (Array.isArray(successData[key])) {
          attachmentsList = successData[key];
          break;
        }
      }
    }

    // Normalize each attachment object
    const normalizedAttachments = attachmentsList.map((a: any) => ({
      attachment_id: a.attachment_id ?? a.id ?? a.attachmentId ?? a.AttachmentId ?? null,
      file_path: a.file_path ?? a.filePath ?? a.path ?? a.file ?? a.url ?? null,
      file_name: a.file_name ?? a.fileName ?? a.name ?? a.fileNameOriginal ?? 
                 (a.file_path || a.filePath || a.path || a.file ? 
                   String(a.file_path ?? a.filePath ?? a.path ?? a.file).split('/').pop() : null),
      file_type: a.file_type ?? a.fileType ?? a.type ?? a.contentType ?? null,
      file_size: a.file_size ?? a.fileSize ?? a.size ?? null,
      uploaded_at: a.uploaded_at ?? a.uploadedAt ?? a.created_at ?? a.createdAt ?? null,
      uploaded_by: a.uploaded_by ?? a.uploadedBy ?? a.uploader_id ?? a.uploaderId ?? null,
      uploader_name: a.uploader_name ?? a.uploaderName ?? a.uploaded_by_name ?? a.uploadedByName ?? null,
    }));

    return NextResponse.json(normalizedAttachments, { status: 200 });

  } catch (err: any) {
    console.error('[Attachments] Proxy error:', err);
    return NextResponse.json(
      { 
        error: 'Failed to fetch attachments', 
        detail: err?.message || 'Unknown error',
        attachments: [],
        taskId
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/tasks/[id]/attachments
 * 
 * Uploads a new attachment to a specific task.
 * Proxies the request to the backend API.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  
  if (!taskId || taskId === 'undefined') {
    return NextResponse.json(
      { error: 'Task ID is required', success: false },
      { status: 400 }
    );
  }

  try {
    // Get the form data from the request
    const formData = await request.formData();
    
    // Ensure task_id is in the form data
    if (!formData.has('task_id')) {
      formData.append('task_id', taskId);
    }

    // Build headers to forward to backend
    const headers: HeadersInit = {};
    
    // Forward Authorization header if present
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }
    
    // Forward cookie header if present
    const cookieHeader = request.headers.get('cookie');
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    // Forward CSRF token if present
    const csrfToken = request.headers.get('x-csrf-token');
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }

    // Try multiple upload endpoints
    const uploadUrls = [
      `${API_BASE}/tasks/${encodeURIComponent(taskId)}/attachments`,
      `${API_BASE}/attachments`,
      `${API_BASE}/attachments/upload`,
    ];

    let lastError: Error | null = null;
    let successResponse: Response | null = null;

    for (const targetUrl of uploadUrls) {
      try {
        (`[Attachments] Uploading to: ${targetUrl}`);
        
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: formData,
        });

        if (response.ok) {
          successResponse = response;
          (`[Attachments] Upload successful to: ${targetUrl}`);
          break;
        } else if (response.status === 404) {
          (`[Attachments] Upload endpoint not found: ${targetUrl}, trying next...`);
          continue;
        } else {
          const errorText = await response.text().catch(() => '');
          console.error(`[Attachments] Upload failed to ${targetUrl}: ${response.status} - ${errorText}`);
          lastError = new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }
      } catch (fetchErr: any) {
        console.error(`[Attachments] Network error for ${targetUrl}:`, fetchErr.message);
        lastError = fetchErr;
        continue;
      }
    }

    if (!successResponse) {
      return NextResponse.json(
        { 
          error: 'Failed to upload attachment', 
          detail: lastError?.message || 'All upload endpoints failed',
          success: false,
          taskId 
        },
        { status: 500 }
      );
    }

    const responseData = await successResponse.json().catch(() => ({ success: true }));
    
    return NextResponse.json({
      ...responseData,
      success: true,
      taskId
    }, { status: 200 });

  } catch (err: any) {
    console.error('[Attachments] Upload proxy error:', err);
    return NextResponse.json(
      { 
        error: 'Failed to upload attachment', 
        detail: err?.message || 'Unknown error',
        success: false,
        taskId
      },
      { status: 500 }
    );
  }
}