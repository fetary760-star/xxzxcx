import { NextRequest, NextResponse } from 'next/server';

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_CMT_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

// Excel file signatures (magic bytes)
const XLSX_SIGNATURE = [0x50, 0x4B, 0x03, 0x04]; // ZIP/XLSX signature (PK..)
const XLS_SIGNATURE = [0xD0, 0xCF, 0x11, 0xE0]; // OLE2 compound document (XLS)
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46]; // %PDF

/**
 * Detect actual content type by reading file magic bytes
 * This prevents "file format and extension don't match" errors
 */
function detectContentType(buffer: ArrayBuffer, originalFilename: string): { contentType: string; correctedFilename: string } {
  const bytes = new Uint8Array(buffer);
  const extension = originalFilename.split('.').pop()?.toLowerCase() || '';
  let contentType = 'application/octet-stream';
  let correctedFilename = originalFilename;
  
  if (bytes.length >= 4) {
    // Check for XLSX (ZIP-based Office Open XML format)
    if (bytes[0] === XLSX_SIGNATURE[0] && 
        bytes[1] === XLSX_SIGNATURE[1] && 
        bytes[2] === XLSX_SIGNATURE[2] && 
        bytes[3] === XLSX_SIGNATURE[3]) {
      
      // It's a ZIP-based format - could be xlsx, docx, pptx
      if (extension === 'xls' || extension === 'xlsx') {
        contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        // Correct extension if needed
        if (extension === 'xls') {
          correctedFilename = originalFilename.replace(/\.xls$/i, '.xlsx');
        }
      } else if (extension === 'doc' || extension === 'docx') {
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (extension === 'doc') {
          correctedFilename = originalFilename.replace(/\.doc$/i, '.docx');
        }
      } else if (extension === 'ppt' || extension === 'pptx') {
        contentType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        if (extension === 'ppt') {
          correctedFilename = originalFilename.replace(/\.ppt$/i, '.pptx');
        }
      } else {
        contentType = 'application/zip';
      }
    }
    // Check for XLS (OLE2 compound document format)
    else if (bytes[0] === XLS_SIGNATURE[0] && 
             bytes[1] === XLS_SIGNATURE[1] && 
             bytes[2] === XLS_SIGNATURE[2] && 
             bytes[3] === XLS_SIGNATURE[3]) {
      
      if (extension === 'xls' || extension === 'xlsx') {
        contentType = 'application/vnd.ms-excel';
        // Correct extension if needed
        if (extension === 'xlsx') {
          correctedFilename = originalFilename.replace(/\.xlsx$/i, '.xls');
        }
      } else if (extension === 'doc' || extension === 'docx') {
        contentType = 'application/msword';
        if (extension === 'docx') {
          correctedFilename = originalFilename.replace(/\.docx$/i, '.doc');
        }
      } else if (extension === 'ppt' || extension === 'pptx') {
        contentType = 'application/vnd.ms-powerpoint';
        if (extension === 'pptx') {
          correctedFilename = originalFilename.replace(/\.pptx$/i, '.ppt');
        }
      }
    }
    // Check for PDF
    else if (bytes[0] === PDF_SIGNATURE[0] && 
             bytes[1] === PDF_SIGNATURE[1] && 
             bytes[2] === PDF_SIGNATURE[2] && 
             bytes[3] === PDF_SIGNATURE[3]) {
      contentType = 'application/pdf';
      if (extension !== 'pdf') {
        correctedFilename = originalFilename.replace(/\.[^.]+$/, '.pdf');
      }
    }
    // Check for PNG
    else if (bytes[0] === 0x89 && bytes[1] === 0x50 && 
             bytes[2] === 0x4E && bytes[3] === 0x47) {
      contentType = 'image/png';
    }
    // Check for JPEG
    else if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
      contentType = 'image/jpeg';
    }
    // Check for GIF
    else if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
      contentType = 'image/gif';
    }
    else {
      // Fall back to extension-based detection
      contentType = getContentTypeByExtension(extension);
    }
  } else {
    contentType = getContentTypeByExtension(extension);
  }
  
  return { contentType, correctedFilename };
}

/**
 * Get content type by file extension (fallback)
 */
function getContentTypeByExtension(extension: string): string {
  const extMap: Record<string, string> = {
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'txt': 'text/plain',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'zip': 'application/zip',
  };
  
  return extMap[extension] || 'application/octet-stream';
}

/**
 * GET /api/tasks/[id]/attachments/[attachmentId]/download
 * 
 * Proxies attachment download requests to the backend API.
 * Handles binary file streaming and proper headers for file downloads.
 * FIXED: Detects actual file format and corrects filename/content-type to prevent
 * "file format and extension don't match" errors in Excel/Office applications.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> }
) {
  const { id: taskId, attachmentId } = await params;
  
  // Build the backend download URL - try multiple endpoint patterns
  const downloadUrls = [
    `${API_BASE}/attachments/${encodeURIComponent(attachmentId)}/download`,
    `${API_BASE}/attachments/download/${encodeURIComponent(attachmentId)}`,
    `${API_BASE}/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}/download`,
    `${API_BASE}/tasks/${encodeURIComponent(taskId)}/attachments/${encodeURIComponent(attachmentId)}`,
  ];

  try {
    // Build headers to forward to backend
    const headers: HeadersInit = {
      'Accept': '*/*',
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
    let successResponse: Response | null = null;

    // Try each URL pattern until one succeeds
    for (const targetUrl of downloadUrls) {
      try {
        (`Attempting download from: ${targetUrl}`);
        
        const response = await fetch(targetUrl, {
          method: 'GET',
          headers,
        });

        if (response.ok) {
          successResponse = response;
          (`Download successful from: ${targetUrl}`);
          break;
        } else if (response.status === 404) {
          (`Endpoint not found: ${targetUrl}, trying next...`);
          continue;
        } else {
          const errorText = await response.text().catch(() => '');
          console.error(`Download failed from ${targetUrl}: ${response.status} - ${errorText}`);
          lastError = new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }
      } catch (fetchErr: any) {
        console.error(`Network error for ${targetUrl}:`, fetchErr.message);
        lastError = fetchErr;
        continue;
      }
    }

    if (!successResponse) {
      return NextResponse.json(
        { 
          error: 'Failed to download attachment', 
          detail: lastError?.message || 'All download endpoints failed',
          taskId,
          attachmentId 
        },
        { status: 404 }
      );
    }

    // Get the file as an ArrayBuffer for binary data
    const fileBuffer = await successResponse.arrayBuffer();
    
    // Extract filename from Content-Disposition header if available
    let filename = `attachment_${attachmentId}`;
    const contentDisposition = successResponse.headers.get('content-disposition');
    if (contentDisposition) {
      // Try to extract filename from header
      const filenameMatch = contentDisposition.match(/filename\*?=['"]?(?:UTF-8'')?([^'";]+)['"]?/i);
      if (filenameMatch && filenameMatch[1]) {
        filename = decodeURIComponent(filenameMatch[1]);
      }
    }

    // FIXED: Detect actual content type by reading file magic bytes
    // This prevents "file format and extension don't match" errors
    const { contentType, correctedFilename } = detectContentType(fileBuffer, filename);
    
    (`[DOWNLOAD] File: ${filename} -> ${correctedFilename}, Content-Type: ${contentType}`);

    // Build response headers for file download
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', contentType);
    responseHeaders.set('Content-Disposition', `attachment; filename="${correctedFilename}"`);
    responseHeaders.set('Content-Length', String(fileBuffer.byteLength));
    
    // Security headers - FIXED: Allow blob: URLs for HTTP deployment
    responseHeaders.set('X-Content-Type-Options', 'nosniff');
    responseHeaders.set('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    
    // Return the file as a binary response
    return new Response(fileBuffer, {
      status: 200,
      headers: responseHeaders,
    });

  } catch (err: any) {
    console.error('Attachment download proxy error:', err);
    return NextResponse.json(
      { 
        error: 'Internal proxy error', 
        detail: err?.message || 'Unknown error',
        taskId,
        attachmentId
      },
      { status: 500 }
    );
  }
}