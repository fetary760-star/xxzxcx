'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, X, FileIcon, Loader2 } from 'lucide-react';
import apiClient from '@/lib/api';
import { getCsrfToken } from '@/lib/csrf';
import { validateFile, validateFiles, ACCEPT_STRING, MAX_FILE_SIZE_MB, ALLOWED_EXTENSIONS_DISPLAY } from '@/lib/file-validation';

type Attachment = {
  attachment_id?: number | string;
  file_path?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  uploaded_by?: number | string | null;
  uploaded_at?: string | null;
  uploader_name?: string | null;
};

/**
 * AttachmentsModal (with upload functionality)
 *
 * - Uses the proxy endpoint /api/tasks/{id}/attachments first (recommended).
 * - Falls back to apiClient.getAttachments if proxy isn't available.
 * - Added file upload functionality with drag & drop support
 * - Shows spinner while loading and an explicit error message if something fails.
 * - FIXED: Downloads attachments using direct navigation to avoid blob URL mixed content warnings
 */

export default function AttachmentsModal({
  open,
  onOpenChange,
  taskId,
  canUpload = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: number | null;
  canUpload?: boolean;
}) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  
  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Download state
  const [downloadingId, setDownloadingId] = useState<number | string | null>(null);

  // Hidden iframe ref for downloads (avoids blob URL issues)
  const downloadFrameRef = useRef<HTMLIFrameElement | null>(null);

  const normalizeList = (raw: any): any[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw.recordset)) return raw.recordset;
    if (Array.isArray(raw.attachments)) return raw.attachments;
    if (Array.isArray(raw.data)) return raw.data;
    if (Array.isArray((raw as any).rows)) return (raw as any).rows;
    const keys = Object.keys(raw || {});
    for (const k of keys) {
      if (Array.isArray((raw as any)[k])) return (raw as any)[k];
    }
    if (typeof raw === 'object') return [raw];
    return [];
  };

  // fetch with timeout helper
  async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const merged = { ...options, signal: controller.signal } as RequestInit;
      const res = await fetch(url, merged);
      clearTimeout(id);
      return res;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  const load = useCallback(async () => {
    if (!open) return;
    if (!taskId) {
      setAttachments([]);
      setError('Task id missing');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let resData: any = null;

      // First, try proxy route that we added for the app router
      try {
        const proxyUrl = `/api/tasks/${encodeURIComponent(String(taskId))}/attachments`;
        const res = await fetchWithTimeout(proxyUrl, { credentials: 'include' }, 10000);
        if (res.ok) {
          resData = await res.json().catch(() => null);
        } else if (res.status === 404) {
          // if proxy returns 404, fallback to apiClient later
          resData = null;
        } else {
          // try to read error body for diagnostic, but don't throw immediately
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }
      } catch (proxyErr) {
        // swallow proxy error and try apiClient fallback below
        // but keep proxyErr message for logs
        console.debug('Proxy fetch failed, will try apiClient fallback:', proxyErr);
      }

      // Fallback: try apiClient.getAttachments if proxy failed or returned null
      if (resData === null) {
        if (apiClient && typeof apiClient.getAttachments === 'function') {
          // apiClient may throw; wrap with timeout
          const p = apiClient.getAttachments(Number(taskId));
          const timeout = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Request timed out')), 10000),
          );
          resData = await Promise.race([p, timeout]);
        } else {
          // final fallback: direct proxy route with query param
          const url = `/api/attachments?task_id=${encodeURIComponent(String(taskId))}`;
          const r = await fetchWithTimeout(url, { credentials: 'include' }, 10000);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          resData = await r.json().catch(() => []);
        }
      }

      const list = normalizeList(resData);
      const mapped: Attachment[] = list.map((a: any) => {
        const filePath = a.file_path ?? a.filePath ?? a.path ?? a.filePathRelative ?? a.file ?? null;
        const fileName = a.file_name ?? a.fileName ?? a.fileNameOriginal ?? a.file ?? (filePath ? String(filePath).split('/').pop() : undefined);
        const fileType = a.file_type ?? a.fileType ?? a.type ?? '';
        const uploadedAt = a.uploaded_at ?? a.uploadedAt ?? a.created_at ?? a.createdAt ?? a.timestamp ?? null;
        const uploaderName = a.uploader_name ?? a.uploaderName ?? a.uploaded_by_name ?? a.uploadedByName ?? a.uploader ?? a.uploaded_by ?? null;
        const uploadedBy = a.uploaded_by ?? a.uploadedBy ?? a.uploader_id ?? a.uploaderId ?? null;
        return {
          attachment_id: a.attachment_id ?? a.id ?? a.attachmentId ?? undefined,
          file_path: filePath,
          file_name: fileName,
          file_type: fileType,
          uploaded_by: uploadedBy,
          uploaded_at: uploadedAt,
          uploader_name: uploaderName,
        } as Attachment;
      });

      setAttachments(mapped);
      setError(null);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setError('Request timed out while loading attachments');
      } else {
        setError(err?.message ?? 'Failed to load attachments');
      }
      setAttachments([]);
      console.error('Attachments load failed', err);
    } finally {
      setLoading(false);
    }
  }, [open, taskId, refreshCounter]);

  useEffect(() => {
    if (!open) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, taskId, refreshCounter]);

  /**
   * FIXED: Download attachment using direct link navigation
   * This avoids creating blob: URLs that trigger mixed content warnings on HTTP
   * Instead, we use a hidden anchor element with the download attribute
   */
  const openAttachment = async (a: Attachment) => {
    const attachmentId = a.attachment_id;
    if (!attachmentId || !taskId) {
      setError('Attachment information not available');
      return;
    }
    
    setDownloadingId(attachmentId);
    setError(null);
    
    try {
      // Build the download URL - this will be handled by the server with proper headers
      const downloadUrl = `/api/tasks/${taskId}/attachments/${attachmentId}/download`;
      
      // Method 1: Use a hidden anchor element to trigger download
      // This avoids blob URLs entirely and lets the browser handle the download natively
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = a.file_name || `attachment_${attachmentId}`;
      link.style.display = 'none';
      
      // Set target to _self to avoid popup blockers
      link.target = '_self';
      
      document.body.appendChild(link);
      link.click();
      
      // Clean up after a short delay
      setTimeout(() => {
        if (link.parentNode) {
          document.body.removeChild(link);
        }
      }, 100);
      
    } catch (err: any) {
      console.error('Download error:', err);
      setError(err?.message ?? 'Failed to download attachment');
    } finally {
      // Reset downloading state after a short delay to show feedback
      setTimeout(() => {
        setDownloadingId(null);
      }, 500);
    }
  };

  /**
   * Alternative download method using window.location for direct download
   * This can be used as a fallback if anchor approach has issues
   */
  const openAttachmentDirect = (a: Attachment) => {
    const attachmentId = a.attachment_id;
    if (!attachmentId || !taskId) {
      setError('Attachment information not available');
      return;
    }
    
    // Direct download URL - browser will handle the download
    const downloadUrl = `/api/tasks/${taskId}/attachments/${attachmentId}/download`;
    
    // Use window.location to navigate - browser will handle as download due to Content-Disposition header
    window.location.href = downloadUrl;
  };

  // File upload handlers
  const handleFileSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArray = Array.from(files);
    const result = validateFiles(fileArray);
    if (!result.valid) {
      setUploadError(result.error);
      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setUploadError(null);
    uploadFiles(fileArray);
  };

  const uploadFiles = async (files: File[]) => {
    if (!taskId) {
      setUploadError('No task selected');
      return;
    }

    setUploading(true);
    setUploadError(null);

    try {
      // Get CSRF token before uploading
      const csrfToken = await getCsrfToken();
      
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('task_id', String(taskId));

        // Try the task-specific upload endpoint first
        try {
          const response = await fetch(`/api/tasks/${taskId}/attachments`, {
            method: 'POST',
            body: formData,
            credentials: 'include',
            headers: {
              'X-CSRF-Token': csrfToken,
              'X-Requested-With': 'XMLHttpRequest',
            },
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(errorText || `Upload failed: ${response.status}`);
          }

          const result = await response.json().catch(() => ({}));
          //('Upload successful:', result);
        } catch (uploadErr) {
          console.error('Task-specific upload failed, trying fallback:', uploadErr);
          
          // Fallback to general attachments endpoint
          const fallbackResponse = await fetch('/api/attachments', {
            method: 'POST',
            body: formData,
            credentials: 'include',
            headers: {
              'X-CSRF-Token': csrfToken,
              'X-Requested-With': 'XMLHttpRequest',
            },
          });

          if (!fallbackResponse.ok) {
            const errorText = await fallbackResponse.text().catch(() => '');
            throw new Error(errorText || `Upload failed: ${fallbackResponse.status}`);
          }
        }
      }

      // Refresh attachments list after successful upload
      setRefreshCounter(c => c + 1);
      
      // Trigger a refresh of the task table to update attachment counts
      try {
        window.dispatchEvent(new CustomEvent('tasks:refresh'));
      } catch {}

    } catch (err: any) {
      console.error('Upload error:', err);
      setUploadError(err.message || 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const fileArray = Array.from(files);
      const result = validateFiles(fileArray);
      if (!result.valid) {
        setUploadError(result.error);
        return;
      }
      setUploadError(null);
      uploadFiles(fileArray);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Attachments {taskId ? `- TC-${taskId}` : ''}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2">
          {!taskId ? (
            <div className="text-sm text-gray-600">No task selected.</div>
          ) : (
            <>
              <div className="mb-4 flex items-center justify-between">
               
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setRefreshCounter(c => c + 1)}>
                    Refresh
                  </Button>
                </div>
              </div>

              {/* Upload Section */}
              {canUpload && (
                <div className="mb-6 p-4 border-2 border-dashed border-gray-300 rounded-lg">
                  <div
                    className={`text-center ${dragOver ? 'bg-blue-50 border-blue-300' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                  >
                    <div className="flex flex-col items-center gap-3">
                      <Upload className="h-8 w-8 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium">Upload attachments</p>
                        <p className="text-xs text-gray-500 mt-1">
                          Drag and drop files here, or{' '}
                          <button
                            type="button"
                            className="text-blue-600 underline"
                            onClick={() => fileInputRef.current?.click()}
                          >
                            browse
                          </button>
                        </p>
                      </div>
                      
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        accept={ACCEPT_STRING}
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files)}
                      />

                      <p className="text-xs text-gray-400 mt-1">
                        Max {MAX_FILE_SIZE_MB}MB per file. Allowed: {ALLOWED_EXTENSIONS_DISPLAY}. Outlook messages (.msg) must be zipped first.
                      </p>
                      
                      {uploading && (
                        <div className="flex items-center gap-2 text-sm text-blue-600">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Uploading...
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {uploadError && (
                    <div className="mt-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                      {uploadError}
                    </div>
                  )}
                </div>
              )}

              {/* Attachments List */}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Loading attachments...
                </div>
              ) : error ? (
                <div className="text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>
              ) : attachments.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-8">
                  No attachments available.
                  {canUpload && <div className="mt-1">Upload files using the area above.</div>}
                </div>
              ) : (
                <div className="space-y-2">
                  {attachments.map((a, index) => {
                    const isDownloading = downloadingId === a.attachment_id;
                    
                    return (
                      <div key={String(a.attachment_id ?? a.file_path ?? a.file_name ?? index)} 
                           className="flex items-center justify-between border rounded-lg p-3 hover:bg-gray-50">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <FileIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            {a.attachment_id ? (
                              <button
                                className="text-blue-600 hover:text-blue-800 underline text-left truncate block w-full"
                                onClick={() => openAttachment(a)}
                                disabled={isDownloading}
                                type="button"
                                title={a.file_name ?? 'Download attachment'}
                              >
                                {a.file_name ?? 'attachment'}
                              </button>
                            ) : (
                              <span className="text-gray-800 truncate block">{a.file_name ?? 'attachment'}</span>
                            )}
                            <div className="text-xs text-gray-500 mt-1">
                              {a.uploader_name ? `Uploaded by ${a.uploader_name}` : ''}
                              {a.uploaded_at ? ` • ${new Date(a.uploaded_at).toLocaleString()}` : ''}
                              {a.file_type ? ` • ${a.file_type}` : ''}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {a.attachment_id ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openAttachment(a)}
                              disabled={isDownloading}
                              className="text-sm"
                            >
                              {isDownloading ? 'Downloading...' : 'Download'}
                            </Button>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}