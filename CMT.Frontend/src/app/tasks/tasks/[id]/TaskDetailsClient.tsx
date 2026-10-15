'use client';

import React, { useEffect, useState, useCallback, FormEvent } from 'react';
import Head from 'next/head';
import { useSession } from 'next-auth/react';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { useTimezone } from '@/lib/timezone-context';

type Task = any;
type Comment = any;
type Attachment = any;
type Shop = any;

export default function TaskDetailsClient(props: {
  task: Task;
  comments: Comment[];
  attachments: Attachment[];
  allShops: Shop[];
  notifications: any[];
}) {
  const { task, comments: initialComments, attachments: initialAttachments, allShops, notifications } = props;

  // Session and roles (client-side)
  const { data: session } = useSession();
  const userRole = (session?.user as any)?.role ?? 'customer';
  const userId = (session?.user as any)?.id ?? null;
  const userName = (session?.user as any)?.name ?? (session?.user as any)?.fullName ?? '';
  const userShopId = (session?.user as any)?.shop_id ?? null;

  // Permission-based access control from the RBAC matrix
  const {
    canReopenTask,
    canManageTransfers,
    canEditUser,
    canAccessMantenixData,
    canRequestAmendment,
    isPrivilegedRole,
  } = useRolePermissions();

  // Local interactive state
  const [comments, setComments] = useState<Comment[]>(initialComments ?? []);
  const [attachments, setAttachments] = useState<Attachment[]>(initialAttachments ?? []);
  const [commentText, setCommentText] = useState('');
  const [interventionText, setInterventionText] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [transferToShop, setTransferToShop] = useState<number | ''>('');
  const [transferComments, setTransferComments] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // New: Reopen / Amend UI state
  const [reopenStatus, setReopenStatus] = useState('Pending');
  const [reopenAssigned, setReopenAssigned] = useState<string>(''); // CSV or single name
  const [reopenComment, setReopenComment] = useState('');
  const [amendReason, setAmendReason] = useState('');
  const [reopenLoading, setReopenLoading] = useState(false);
  const [amendLoading, setAmendLoading] = useState(false);

  // FIXED: Add download state for attachments - allow both number and string for 'legacy'
  const [downloadingAttachment, setDownloadingAttachment] = useState<number | string | null>(null);

  // CRITICAL FIX: Use timezone-aware date formatting from the shared context
  const { formatDate: tzFormatDate, formatDateTime: tzFormatDateTime } = useTimezone();

  /** Format a date value using the user's preferred timezone */
  const formatDate = useCallback((input?: string | number | Date | null): string => {
    if (!input) return 'N/A';
    return tzFormatDateTime(input);
  }, [tzFormatDateTime]);

  /** Format a date value as date-only (no time) using the user's preferred timezone */
  const formatDateOnly = useCallback((input?: string | number | Date | null): string => {
    if (!input) return 'N/A';
    return tzFormatDate(input);
  }, [tzFormatDate]);

  /**
   * CRITICAL FIX: Convert any hardcoded UTC timestamps embedded in text content
   * to the user's preferred timezone. Handles legacy data with patterns like
   * "at 2026-03-15 14:30:00 UTC" or "on 2026-03-15 14:30:00 UTC".
   */
  const convertEmbeddedUtcTimestamps = useCallback((text: string): string => {
    if (!text) return text;
    const utcPattern = /\b(at|on)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+UTC\b/gi;
    return text.replace(utcPattern, (_match, preposition, datePart, timePart) => {
      try {
        const isoString = `${datePart}T${timePart}Z`;
        const formatted = tzFormatDateTime(isoString);
        if (formatted && formatted !== '—') {
          return `${preposition} ${formatted}`;
        }
      } catch {
        // If parsing fails, return original text
      }
      return _match;
    });
  }, [tzFormatDateTime]);

  const isTaskCompleted = task?.status === 'Completed';

  const showInterventionCommentForm =
    userId &&
    (userId == task.created_by || userId == (task.created_by_user_id ?? task.created_by)) &&
    userRole !== 'engineer' &&
    task.assigned_engineer &&
    task.assigned_engineer !== 'Unassigned' &&
    task.status !== 'Completed';

  // Use local proxy endpoints under /api/tasks/:id/...
  const apiBase = `/api/tasks/${encodeURIComponent(String(task.task_id))}`;

  useEffect(() => {
    // Clear messages after a timeout
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(null), 3500);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  async function handleAddComment(e?: FormEvent) {
    e?.preventDefault();
    if (!commentText.trim()) {
      setErrorMessage('Comment cannot be empty.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${apiBase}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment_text: commentText }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to add comment');
      }
      const newComment = await res.json();
      setComments(prev => [newComment, ...prev]);
      setCommentText('');
      setSuccessMessage('Comment added successfully!');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error adding comment');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddIntervention(e?: FormEvent) {
    e?.preventDefault();
    if (!interventionText.trim()) {
      setErrorMessage('Intervention comment cannot be empty.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${apiBase}/intervention`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervention_comment_text: interventionText }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to send intervention');
      }
      await res.json();
      setInterventionText('');
      setSuccessMessage('Intervention request sent to Team Leader!');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error sending intervention request');
    } finally {
      setBusy(false);
    }
  }

  async function handleUploadAttachment(e?: FormEvent) {
    e?.preventDefault();
    if (!uploadFile) {
      setErrorMessage('Please choose a file to upload.');
      return;
    }
    if (isTaskCompleted) {
      setErrorMessage('Cannot add attachments to a completed task.');
      return;
    }
    setIsUploading(true);
    setErrorMessage(null);
    try {
      const fd = new FormData();
      fd.append('attachment_file', uploadFile);
      const res = await fetch(`${apiBase}/attachments`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Upload failed');
      }
      const newAttachment = await res.json();
      setAttachments(prev => [newAttachment, ...prev]);
      setUploadFile(null);
      const inputEl = document.getElementById('attachment_file') as HTMLInputElement | null;
      if (inputEl) inputEl.value = '';
      setSuccessMessage('Attachment uploaded successfully!');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error uploading file');
    } finally {
      setIsUploading(false);
    }
  }

  async function handleCreateTransfer(e?: FormEvent) {
    e?.preventDefault();
    if (!transferToShop) {
      setErrorMessage('Please select a destination shop.');
      return;
    }
    if (Number(transferToShop) === Number((task as any).shop_id)) {
      setErrorMessage('Cannot transfer to the same shop.');
      return;
    }
    setBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetch(`${apiBase}/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_shop_id: transferToShop,
          transfer_comments: transferComments,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to create transfer');
      }
      await res.json();
      setTransferToShop('');
      setTransferComments('');
      setSuccessMessage('Transfer request submitted!');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error creating transfer');
    } finally {
      setBusy(false);
    }
  }

  // --- NEW: Reopen & Amend handlers ---
  // Show Reopen button based on RBAC permission matrix (canReopenTask) OR privileged roles (admin/director)
  const canReopen = isTaskCompleted && (canReopenTask || isPrivilegedRole);
  // Amend can be requested based on the RBAC permission matrix (canRequestAmendment) OR privileged roles (admin/director)
  const canAmend = isTaskCompleted && (canRequestAmendment || isPrivilegedRole);

  async function submitReopen(e?: FormEvent) {
    e?.preventDefault();
    if (!reopenComment.trim()) {
      setErrorMessage('Reopen reason is required.');
      return;
    }
    if (!reopenAssigned.trim()) {
      setErrorMessage('Please provide at least one assigned engineer name.');
      return;
    }
    setReopenLoading(true);
    setErrorMessage(null);
    try {
      const payload = {
        userId,
        userRole,
        userName,
        newStatus: reopenStatus,
        assignedEngineers: reopenAssigned.split(',').map((s) => s.trim()).filter(Boolean),
        reopenComment,
      };
      const res = await fetch(`${apiBase}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      setSuccessMessage('Task reopened successfully.');
      // close bootstrap modal via DOM (matches pattern used by your other modals)
      const modalEl = document.getElementById('reopenModal') as any;
      try { if (modalEl) (window as any).bootstrap.Modal.getInstance(modalEl)?.hide(); } catch {}
      // refresh page or update UI
      try { window.dispatchEvent(new CustomEvent('tasks:refresh')); } catch {}
    } catch (err: any) {
      console.error('Reopen failed', err);
      setErrorMessage(err?.message ?? 'Failed to reopen task');
    } finally {
      setReopenLoading(false);
    }
  }

  async function submitAmend(e?: FormEvent) {
    e?.preventDefault();
    if (!amendReason.trim()) {
      setErrorMessage('Amendment reason is required.');
      return;
    }
    setAmendLoading(true);
    setErrorMessage(null);
    try {
      const payload = { userId, userRole, userName, reason: amendReason };
      const res = await fetch(`${apiBase}/amend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
      }
      setSuccessMessage('Amendment request submitted.');
      const modalEl = document.getElementById('amendModal') as any;
      try { if (modalEl) (window as any).bootstrap.Modal.getInstance(modalEl)?.hide(); } catch {}
      try { window.dispatchEvent(new CustomEvent('tasks:refresh')); } catch {}
    } catch (err: any) {
      console.error('Amend request failed', err);
      setErrorMessage(err?.message ?? 'Failed to request amendment');
    } finally {
      setAmendLoading(false);
    }
  }

  /**
   * FIXED: Download attachment using direct link navigation (no blob URLs)
   * This avoids mixed content warnings on HTTP deployments
   */
  const handleAttachmentDownload = async (attachment: Attachment) => {
    if (!attachment.attachment_id && !attachment.id) {
      console.error('No attachment ID available');
      setErrorMessage('Cannot download attachment: No ID available');
      return;
    }

    const attachmentId = attachment.attachment_id || attachment.id;
    setDownloadingAttachment(attachmentId);
    
    try {
      // Build the download URL
      const downloadUrl = `${apiBase}/attachments/${attachmentId}/download`;
      
      // Use a hidden anchor element to trigger download (no blob URLs)
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = attachment.file_name || attachment.fileName || `attachment_${attachmentId}`;
      link.style.display = 'none';
      link.target = '_self';
      
      document.body.appendChild(link);
      link.click();
      
      // Clean up after a short delay
      setTimeout(() => {
        if (link.parentNode) {
          document.body.removeChild(link);
        }
      }, 100);
      
      setSuccessMessage(`Downloading: ${link.download}`);
      
    } catch (error) {
      console.error('Failed to download attachment:', error);
      setErrorMessage(`Failed to download attachment: ${(error as any)?.message || 'Unknown error'}`);
    } finally {
      // Reset downloading state after a short delay
      setTimeout(() => {
        setDownloadingAttachment(null);
      }, 500);
    }
  };

  return (
    <>
      <Head>
        <title>Task Details - TC-{task.task_id}</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" />
      </Head>

      <div className="container-fluid">
        <div className="row">
          <div className="col-md-12 p-4">
            {successMessage && <div className="alert alert-success">{successMessage}</div>}
            {errorMessage && <div className="alert alert-danger">{errorMessage}</div>}

            <div className="card mb-4">
              <div className="card-header d-flex justify-content-between align-items-center">
                <h5 className="mb-0">Task Details - TC-{task.task_id} (SN: {task.serial_number ?? 'N/A'})</h5>
                <span
                  className={`status-badge ${
                    task.status === 'Pending'
                      ? 'status-pending'
                      : task.status === 'In Progress'
                      ? 'status-in-progress'
                      : task.status === 'Completed'
                      ? 'status-completed'
                      : task.status === 'Blocked'
                      ? 'status-blocked'
                      : 'status-on-hold'
                  }`}
                >
                  {task.status}
                </span>
              </div>

              <div className="card-body">
                <div className="row mb-3">
                  <div className="col-md-6">
                    <strong>Serial Number:</strong> {task.serial_number ?? 'N/A'}
                    <br />
                    <strong>Part Number:</strong> {task.part_number ?? 'N/A'}
                    <br />
                    <strong>Current Shop:</strong> {task.shop_name ?? 'N/A'}
                    <br />
                    <strong>PO Number:</strong> {task.po_number ?? 'N/A'}
                    <br />
                    <strong>Category:</strong>{' '}
                    <span className="badge bg-light text-dark">{task.category_name ?? 'N/A'}</span>
                    <br />
                    <strong>Sub Type:</strong>{' '}
                    <span className="badge bg-light text-dark">{task.sub_type_name ?? 'N/A'}</span>
                    <br />
                    <strong>Request Type:</strong>{' '}
                    <span className="badge bg-light text-dark">{task.request_type_name ?? 'N/A'}</span>
                  </div>

                  <div className="col-md-6">
                    <strong>Assigned Engineer:</strong>{' '}
                    {task.assigned_engineer ? task.assigned_engineer.replace(/,/g, ', ') : 'Unassigned'}
                    <br />
                    <strong>Priority Level:</strong>{' '}
                    <span
                      className={`badge ${
                        task.priority_level_name === 'High'
                          ? 'bg-danger'
                          : task.priority_level_name === 'Medium'
                          ? 'bg-warning'
                          : 'bg-success'
                      }`}
                    >
                      {task.priority_level_name ?? 'N/A'}
                    </span>
                    <br />
                    <strong>Created By:</strong> {task.creator_name ?? 'N/A'}
                    <br />
                    <strong>Created At:</strong> {formatDate(task.created_at)}
                    <br />
                    <strong>Estimated Completion:</strong> {formatDateOnly(task.estimated_completion_date)}
                    <br />
                    <strong>Target Completion:</strong> {formatDateOnly(task.target_completion_date)}
                    <br />
                    <strong>Actual Completion:</strong> {formatDate(task.actual_completion_date)}
                    <br />
                    <strong>Last Updated:</strong> {formatDate(task.updated_at)}
                    <br />
                  </div>
                </div>

                <div className="mb-3 card">
                  <div className="card-header bg-light">Description</div>
                  <div className="card-body">
                    <div dangerouslySetInnerHTML={{ __html: convertEmbeddedUtcTimestamps(String(task.description ?? '')) }} />
                  </div>
                </div>

                {(task.revision_notes || task.show_revision_alert) && (
                  <div className="mb-3 card">
                    <div className="card-header d-flex justify-content-between align-items-center">
                      <div>Revision Notes / Important Updates</div>
                      {task.show_revision_alert ? (
                        <i className="fas fa-exclamation-triangle text-warning" title="Important Update" />
                      ) : null}
                    </div>
                    <div className="card-body">
                      {task.revision_notes ? (
                        <div dangerouslySetInnerHTML={{ __html: convertEmbeddedUtcTimestamps(String(task.revision_notes ?? '')) }} />
                      ) : (
                        <p className="text-muted">No specific revision notes provided, but an alert is active.</p>
                      )}
                    </div>
                  </div>
                )}

                {task.attachment_path && (
                  <div className="mb-3">
                    <strong>Attachment:</strong>{' '}
                    <button 
                      onClick={() => handleAttachmentDownload({ attachment_id: 'legacy', file_name: 'legacy_attachment', file_path: task.attachment_path })}
                      className="btn btn-sm btn-outline-secondary ms-2"
                      disabled={downloadingAttachment === 'legacy'}
                    >
                      <i className="fas fa-paperclip me-1" /> 
                      {downloadingAttachment === 'legacy' ? 'Downloading...' : 'Download Attachment'}
                    </button>
                  </div>
                )}

                <div className="mb-3 card">
                  <div className="card-header">Initial Comments</div>
                  <div className="card-body">
                    <div dangerouslySetInnerHTML={{ __html: convertEmbeddedUtcTimestamps(String(task.comments ?? 'No initial comments.')) }} />
                  </div>
                </div>

                {/* New: Reopen + Amend action buttons (shown for completed tasks with appropriate roles) */}
                {isTaskCompleted && (
                  <div className="mb-3 d-flex gap-2">
                    {canReopen && (
                      <button className="btn btn-danger" data-bs-toggle="modal" data-bs-target="#reopenModal">
                        <i className="fas fa-undo-alt me-2" /> Reopen & Reassign
                      </button>
                    )}

                    {canAmend && (
                      <button className="btn btn-warning" data-bs-toggle="modal" data-bs-target="#amendModal">
                        <i className="fas fa-edit me-2" /> Request Amendment
                      </button>
                    )}

                    <a className="btn btn-outline-info" href={`/details.php?id=${task.task_id}`} target="_blank" rel="noreferrer">Open Legacy PHP Details</a>
                  </div>
                )}

                <div className="mt-3 d-flex gap-2">
                  {/* If task is not completed, keep legacy actions visible */}
                  {!isTaskCompleted && (
                    <>
                      <button className="btn btn-danger" data-bs-toggle="modal" data-bs-target="#interventionCommentModal">
                        <i className="fas fa-exclamation-triangle me-2" /> Request Team Leader Intervention
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* FIXED: Attachments Section with direct download (no blob URLs) */}
            <div className="card mb-4">
              <div className="card-header">
                <h6 className="mb-0">Attachments ({attachments.length})</h6>
              </div>
              <div className="card-body">
                {!isTaskCompleted && (
                  <form onSubmit={handleUploadAttachment} className="mb-3">
                    <div className="row">
                      <div className="col-md-8">
                        <input
                          type="file"
                          id="attachment_file"
                          className="form-control"
                          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        />
                      </div>
                      <div className="col-md-4">
                        <button type="submit" className="btn btn-primary" disabled={!uploadFile || isUploading}>
                          {isUploading ? 'Uploading...' : 'Upload'}
                        </button>
                      </div>
                    </div>
                  </form>
                )}

                {attachments.length === 0 ? (
                  <p className="text-muted">No attachments available.</p>
                ) : (
                  <div className="list-group">
                    {attachments.map((attachment, idx) => {
                      const attachmentId = attachment.attachment_id || attachment.id;
                      const isDownloading = downloadingAttachment === attachmentId;
                      return (
                        <div key={idx} className="list-group-item d-flex justify-content-between align-items-center">
                          <div>
                            <strong>{attachment.file_name || attachment.fileName || 'Unnamed file'}</strong>
                            {attachment.uploader_name && <small className="text-muted d-block">Uploaded by: {attachment.uploader_name}</small>}
                            {attachment.uploaded_at && <small className="text-muted d-block">Date: {formatDate(attachment.uploaded_at)}</small>}
                          </div>
                          <button
                            onClick={() => handleAttachmentDownload(attachment)}
                            disabled={isDownloading}
                            className="btn btn-sm btn-outline-primary"
                          >
                            <i className="fas fa-download me-1" />
                            {isDownloading ? 'Downloading...' : 'Download'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Comments Section */}
            <div className="card mb-4">
              <div className="card-header">
                <h6 className="mb-0">Comments ({comments.length})</h6>
              </div>
              <div className="card-body">
                {!isTaskCompleted && (
                  <form onSubmit={handleAddComment} className="mb-3">
                    <div className="mb-3">
                      <textarea
                        className="form-control"
                        rows={3}
                        placeholder="Add a comment..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={!commentText.trim() || busy}>
                      {busy ? 'Adding...' : 'Add Comment'}
                    </button>
                  </form>
                )}

                {comments.length === 0 ? (
                  <p className="text-muted">No comments yet.</p>
                ) : (
                  <div className="list-group">
                    {comments.map((comment, idx) => (
                      <div key={idx} className="list-group-item">
                        <div className="d-flex w-100 justify-content-between">
                          <h6 className="mb-1">{comment.author_name || 'Unknown'}</h6>
                          <small>{formatDate(comment.created_at)}</small>
                        </div>
                        <p className="mb-1">{convertEmbeddedUtcTimestamps(comment.content || comment.comment_text || '')}</p>
                        {comment.comment_type && (
                          <small className="text-muted">Type: {comment.comment_type}</small>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Transfer Section */}
            {!isTaskCompleted && (
              <div className="card mb-4">
                <div className="card-header">
                  <h6 className="mb-0">Create Transfer</h6>
                </div>
                <div className="card-body">
                  <form onSubmit={handleCreateTransfer}>
                    <div className="row mb-3">
                      <div className="col-md-6">
                        <label className="form-label">From Shop</label>
                        <input type="text" className="form-control" value={task.shop_name || 'Unassigned'} readOnly />
                      </div>
                      <div className="col-md-6">
                        <label className="form-label">To Shop</label>
                        <select
                          className="form-select"
                          value={transferToShop}
                          onChange={(e) => setTransferToShop(Number(e.target.value) || '')}
                        >
                          <option value="">Select destination shop...</option>
                          {allShops.map((shop) => (
                            <option key={shop.shop_id} value={shop.shop_id}>
                              {shop.shop_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Transfer Comments (optional)</label>
                      <textarea
                        className="form-control"
                        rows={3}
                        value={transferComments}
                        onChange={(e) => setTransferComments(e.target.value)}
                      />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={!transferToShop || busy}>
                      {busy ? 'Creating...' : 'Create Transfer'}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .status-badge {
          padding: 5px 14px;
          border-radius: 20px;
          font-size: 0.85rem;
          font-weight: 500;
        }
        .status-pending { background-color: #fef3c7; color: #d97706; }
        .status-in-progress { background-color: #dbeafe; color: #1d4ed8; }
        .status-completed { background-color: #dcfce7; color: #15803d; }
        .status-blocked { background-color: #fee2e2; color: #b91c1c; }
        .status-on-hold { background-color: #fce7f3; color: #c026d9; }
      `}</style>
    </>
  );
}