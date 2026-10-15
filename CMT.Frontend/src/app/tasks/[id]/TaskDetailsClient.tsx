'use client';

import React, { useEffect, useState, useCallback, useMemo, FormEvent } from 'react';
import Head from 'next/head';
import { useSession } from 'next-auth/react';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { useTimezone } from '@/lib/timezone-context';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AMENDED — "Target Completion" time discrepancy fix (ONLY this issue)
 *
 * SYMPTOM
 *   Last Updated shows "Aug 13, 2026 at 10:55:56 AM"
 *   Target Completion shows "Aug 13, 2026 at 6:08:59 AM"
 *   ...for the very same moment. Confusing and inaccurate.
 *
 * ROOT CAUSE
 *   The .NET API serializes some columns WITH a UTC designator
 *   ("2026-08-13T10:55:56Z" for UpdatedAt) but TargetCompletionDate is
 *   serialized WITHOUT one ("2026-08-13T06:08:59"). `new Date()` treats the
 *   first one as UTC and the second one as LOCAL time, so the two fields end
 *   up on two different clocks and are shifted against each other.
 *   Additionally Target Completion was rendered with `formatDateOnly()`, which
 *   dropped the time part, so any extension/update was invisible.
 *
 * FIX (3 parts)
 *   1. `normalizeToIso()` (src/lib/datetime-utils.ts) is applied to EVERY
 *      timestamp before it reaches the timezone formatter. Values without an
 *      offset are treated as UTC — which is what the backend actually stores —
 *      so all fields are converted exactly once, by the same rule.
 *   2. Target Completion is now rendered with the SAME date+time formatter as
 *      Last Updated (`formatDate`), so both show the same clock format.
 *   3. Target Completion resolves to the LATEST value: an extended / revised
 *      target date wins over the original one, so the field always reflects
 *      the most recent update.
 *
 * Nothing else in this screen was changed.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { normalizeToIso, timestampMs } from '@/lib/datetime-utils';

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

  // Reopen / Amend UI state
  const [reopenStatus, setReopenStatus] = useState('Pending');
  const [reopenAssigned, setReopenAssigned] = useState<string>('');
  const [reopenComment, setReopenComment] = useState('');
  const [amendReason, setAmendReason] = useState('');
  const [reopenLoading, setReopenLoading] = useState(false);
  const [amendLoading, setAmendLoading] = useState(false);

  const [downloadingAttachment, setDownloadingAttachment] = useState<number | string | null>(null);

  // Timezone-aware formatting from the shared context
  const { formatDate: tzFormatDate, formatDateTime: tzFormatDateTime } = useTimezone();

  /**
   * FIX PART 1 — normalize before formatting.
   * Every timestamp goes through `normalizeToIso()` first, so a value that the
   * API returned without a "Z" is no longer misread as local time.
   */
  const formatDate = useCallback((input?: string | number | Date | null): string => {
    const iso = normalizeToIso(input);
    if (!iso) return 'N/A';
    const formatted = tzFormatDateTime(iso);
    return !formatted || formatted === '—' ? 'N/A' : formatted;
  }, [tzFormatDateTime]);

  /** Date-only variant — also normalized. */
  const formatDateOnly = useCallback((input?: string | number | Date | null): string => {
    const iso = normalizeToIso(input);
    if (!iso) return 'N/A';
    const formatted = tzFormatDate(iso);
    return !formatted || formatted === '—' ? 'N/A' : formatted;
  }, [tzFormatDate]);

  /**
   * FIX PART 3 — resolve the LATEST target completion date.
   *
   * The API may expose the extension under several names depending on how the
   * deadline was extended. We take the most recent (largest) timestamp among
   * all of them so the Timeline always reflects the newest update instead of
   * the stale original deadline.
   */
  const resolvedTargetCompletion = useMemo<string | null>(() => {
    const candidates = [
      task?.extendedTargetCompletionDate,
      task?.extended_target_completion_date,
      task?.ExtendedTargetCompletionDate,
      task?.revisedTargetCompletionDate,
      task?.revised_target_completion_date,
      task?.RevisedTargetCompletionDate,
      task?.newTargetCompletionDate,
      task?.new_target_completion_date,
      task?.targetCompletionDate,
      task?.target_completion_date,
      task?.TargetCompletionDate,
      task?.target_completion,
    ];

    let latestIso: string | null = null;
    let latestMs = -Infinity;

    for (const candidate of candidates) {
      const iso = normalizeToIso(candidate);
      if (!iso) continue;
      const ms = timestampMs(iso);
      if (ms === null) continue;
      if (ms > latestMs) {
        latestMs = ms;
        latestIso = iso;
      }
    }

    return latestIso;
  }, [task]);

  /** True when the shown target date is newer than the original one. */
  const isTargetExtended = useMemo<boolean>(() => {
    const originalMs = timestampMs(
      task?.originalTargetCompletionDate ??
      task?.original_target_completion_date ??
      task?.OriginalTargetCompletionDate ??
      task?.targetCompletionDate ??
      task?.target_completion_date ??
      task?.TargetCompletionDate ??
      null
    );
    const shownMs = timestampMs(resolvedTargetCompletion);
    if (originalMs === null || shownMs === null) return false;
    return shownMs > originalMs;
  }, [task, resolvedTargetCompletion]);

  /**
   * Convert hardcoded UTC timestamps embedded in text content to the user's
   * preferred timezone (legacy data such as "at 2026-03-15 14:30:00 UTC").
   */
  const convertEmbeddedUtcTimestamps = useCallback((text: string): string => {
    if (!text) return text;
    const utcPattern = /\b(at|on)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+UTC\b/gi;
    return text.replace(utcPattern, (_match, preposition, datePart, timePart) => {
      try {
        const iso = normalizeToIso(`${datePart}T${timePart}Z`);
        if (iso) {
          const formatted = tzFormatDateTime(iso);
          if (formatted && formatted !== '—') {
            return `${preposition} ${formatted}`;
          }
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

  const apiBase = `/api/tasks/${encodeURIComponent(String(task.task_id))}`;

  useEffect(() => {
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
      const res = await fetch(`${apiBase}/attachments`, { method: 'POST', body: fd });
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
        body: JSON.stringify({ to_shop_id: transferToShop, transfer_comments: transferComments }),
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

  const canReopen = isTaskCompleted && (canReopenTask || isPrivilegedRole);
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
      const modalEl = document.getElementById('reopenModal') as any;
      try { if (modalEl) (window as any).bootstrap.Modal.getInstance(modalEl)?.hide(); } catch {}
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

  const handleAttachmentDownload = async (attachment: Attachment) => {
    if (!attachment.attachment_id && !attachment.id) {
      console.error('No attachment ID available');
      setErrorMessage('Cannot download attachment: No ID available');
      return;
    }

    const attachmentId = attachment.attachment_id || attachment.id;
    setDownloadingAttachment(attachmentId);

    try {
      const downloadUrl = `${apiBase}/attachments/${attachmentId}/download`;
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = attachment.file_name || attachment.fileName || `attachment_${attachmentId}`;
      link.style.display = 'none';
      link.target = '_self';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        if (link.parentNode) document.body.removeChild(link);
      }, 100);
      setSuccessMessage(`Downloading: ${link.download}`);
    } catch (error) {
      console.error('Failed to download attachment:', error);
      setErrorMessage(`Failed to download attachment: ${(error as any)?.message || 'Unknown error'}`);
    } finally {
      setTimeout(() => setDownloadingAttachment(null), 500);
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
                    <strong>Estimated Completion:</strong> {formatDate(task.estimated_completion_date)}
                    <br />
                    {/*
                      FIX PART 2 + 3 — Target Completion now uses the SAME
                      date+time formatter as "Last Updated" and shows the
                      LATEST (extended) target date, so the two timestamps
                      finally agree instead of showing two different clocks.
                    */}
                    <strong>Target Completion:</strong> {formatDate(resolvedTargetCompletion)}
                    {isTargetExtended && (
                      <span className="badge bg-info text-dark ms-2" title="Deadline was extended / updated">
                        Updated
                      </span>
                    )}
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

                {isTaskCompleted && (
                  <div className="mb-3 d-flex gap-2">
                    {canReopen && (
                      <button className="btn btn-danger" data-bs-toggle="modal" data-bs-target="#reopenModal">
                        <i className="fas fa-undo-alt me-2" /> Reopen &amp; Reassign
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

            {/* Attachments Section */}
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