'use client';

import React, { useEffect, useState } from 'react';
import { 
  DraggableDialog, 
  DraggableDialogContent, 
  DraggableDialogHeader, 
  DraggableDialogTitle 
} from '@/components/ui/draggable-dialog';
import { AlertTriangle, RefreshCw, FileEdit, Copy, User, Calendar, MessageSquare, Clock, Package, RefreshCw as RefreshIcon } from 'lucide-react';
import apiClient from '@/lib/api';
import { useTimezone } from '@/lib/timezone-context';

interface AlertDetailsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: any;
  alertType: 'revision' | 'reopened' | 'amendment' | 'duplicate' | null;
}

interface AlertDetails {
  alertType: string;
  taskId: number;
  originalTaskId?: number | null;

  createdBy?: string;
  createdById?: number;
  createdAt?: string;

  reason?: string;
  justification?: string;
  actionedBy?: string;
  actionedById?: number;
  actionedAt?: string;
  reviewedByTL?: string;
  reviewedByTLId?: number;
  reviewedByTLAt?: string;
  reviewedByDirector?: string;
  reviewedByDirectorId?: number;
  reviewedByDirectorAt?: string;
  status?: string;
  reopenCount?: number;
  revisionNotes?: string;

  serialNumber?: string;
  partNumber?: string;
  description?: string;
}

/**
 * AlertDetailsModal - DRAGGABLE VERSION
 * 
 * Features:
 * - Draggable by title bar
 * - Shows detailed information about various alert types
 * - Comprehensive data extraction with fallbacks
 * - Modern styling with proper visual hierarchy
 */
export default function AlertDetailsModal({ open, onOpenChange, task, alertType }: AlertDetailsModalProps) {
  const { formatDateTime: tzFormatDateTime } = useTimezone();
  const [loading, setLoading] = useState(false);
  const [alertDetails, setAlertDetails] = useState<AlertDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && task && alertType) {
      void loadAlertDetails();
    }
  }, [open, task, alertType]);

  const loadAlertDetails = async () => {
    if (!task || !alertType) return;

    setLoading(true);
    setError(null);

    try {
      const taskId = Number(task.task_id ?? task.taskId ?? task.id ?? task.original_task_id ?? 0);
      if (!taskId) throw new Error('No valid task id');

      const alertDetailsPath = `/api/Amendment/task/${taskId}/alert-details?alertType=${encodeURIComponent(alertType)}`;
      const statusHistoryPath = `/api/Amendment/task/${taskId}/status-history`;

      let serverResp: any = null;
      let statusHistoryResp: any = null;

      try {
        const headers = {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
          'Content-Type': 'application/json'
        };

        const response = await fetch(alertDetailsPath, { headers });
        if (response.ok) {
          serverResp = await response.json();
        }

        if (alertType === 'reopened') {
          const historyResponse = await fetch(statusHistoryPath, { headers });
          if (historyResponse.ok) {
            statusHistoryResp = await historyResponse.json();
          }
        }
      } catch (e) {
        console.debug('Failed to fetch data from backend:', e);
      }

      const server = serverResp?.alert_details ?? serverResp ?? null;
      const statusHistory = statusHistoryResp?.status_history ?? server?.status_history ?? [];

      const details: AlertDetails = {
        alertType,
        taskId,
        originalTaskId: server?.original_task_id ?? null,
        serialNumber: server?.serial_number ?? task.serial_number ?? task.serialNumber ?? task.serial ?? 'N/A',
        partNumber: server?.part_number ?? task.part_number ?? task.partNumber ?? task.part ?? 'N/A',
        description: server?.description ?? task.description ?? task.details ?? task.Description ?? 'N/A'
      };

      details.createdById = server?.created_by ?? server?.created_by_id ?? task.created_by ?? task.createdBy ?? task.createdById ?? null;
      details.createdAt = server?.created_at ?? task.created_at ?? task.createdAt ?? null;
      details.createdBy = server?.created_by_name ?? server?.creator_name ?? task.creator_name ?? task.created_by_name ?? task.createdByName ?? task.creator ?? 'Unknown';

      switch (alertType) {
        case 'revision':
          details.revisionNotes = server?.revision_notes ?? server?.revisionNotes ?? task.revision_notes ?? task.revisionNotes ?? task.RevisionNotes ?? 'No revision notes available';
          details.actionedBy = server?.revision_by_name ?? server?.revision_by ?? server?.updated_by_name ?? server?.updated_by ?? task.revision_by_name ?? task.revisionByName ?? task.updated_by_name ?? task.updatedByName ?? null;
          details.actionedById = server?.revision_by_id ?? server?.revision_by ?? server?.updated_by_id ?? server?.updated_by ?? task.revision_by_id ?? task.revision_by ?? task.updated_by ?? null;
          details.actionedAt = server?.revision_at ?? server?.revision_at_iso ?? server?.updated_at ?? server?.updatedAt ?? task.revision_at ?? task.revisionAt ?? task.updated_at ?? task.updatedAt ?? null;
          break;

        case 'reopened':
          details.reason = server?.reopen_reason ?? server?.reopen_reason_text ?? task.reopen_reason ?? task.reopenReason ?? task.ReopenReason ?? 'No reason provided';
          details.reopenCount = Number(server?.reopen_count ?? server?.reopenCount ?? task.reopen_count ?? task.reopenCount ?? task.ReopenCount ?? 0) || 0;
          details.actionedBy = server?.reopened_by_name ?? server?.reopened_by_user_name ?? server?.reopened_by ?? task.reopened_by_name ?? task.reopenedByName ?? task.ReopenedByName ?? task.reopened_by_user_name ?? null;
          details.actionedById = server?.reopened_by_id ?? server?.reopened_by ?? task.reopened_by ?? task.reopenedBy ?? task.ReopenedBy ?? null;
          details.actionedAt = server?.reopened_at ?? server?.reopened_at_iso ?? task.reopened_at ?? task.reopenedAt ?? task.ReopenedAt ?? null;

          if (!details.actionedBy || !details.actionedAt) {
            if (statusHistory && Array.isArray(statusHistory) && statusHistory.length > 0) {
              const reopenHistory = statusHistory
                .filter((h: any) => h.is_reopen_action === true || String(h.is_reopen_action) === 'true')
                .sort((a: any, b: any) => {
                  const dateA = new Date(a.change_timestamp || 0).getTime();
                  const dateB = new Date(b.change_timestamp || 0).getTime();
                  return dateB - dateA;
                })[0];

              if (reopenHistory) {
                details.actionedBy = details.actionedBy ?? reopenHistory.changed_by_user_name ?? reopenHistory.changed_by_user ?? reopenHistory.ChangedByUserName;
                details.actionedById = details.actionedById ?? reopenHistory.changed_by_user_id ?? reopenHistory.changed_by_user ?? reopenHistory.ChangedByUserId;
                details.actionedAt = details.actionedAt ?? reopenHistory.change_timestamp ?? reopenHistory.change_timestamp_iso ?? reopenHistory.ChangeTimestamp;
                details.reason = details.reason ?? reopenHistory.status_change_reason ?? reopenHistory.StatusChangeReason ?? details.reason;
              }
            }
          }

          if (!details.actionedBy) {
            details.actionedBy = 'Unknown';
          }
          break;

        case 'amendment':
          const amStatus = server?.amendment_status ?? task.amendment_status ?? task.amendmentStatus ?? null;
          details.status = getAmendmentStatusText(typeof amStatus === 'number' ? amStatus : (mapAmendmentStatusFromString(amStatus) ?? null));
          details.reason = server?.amendment_reason ?? server?.request_reason ?? task.amendment_reason ?? task.request_reason ?? task.requestReason ?? null;
          details.actionedBy = server?.amendment_requested_by_name ?? server?.amendment_requested_by ?? server?.amendment_requester_name ?? task.amendment_requested_by_name ?? task.requester_name ?? task.creator_name ?? 'Unknown';
          details.actionedById = server?.amendment_requested_by ?? task.amendment_requested_by ?? task.amendmentRequestedBy ?? null;
          details.actionedAt = server?.amendment_requested_at ?? server?.amendment_requested_at_iso ?? task.amendment_requested_at ?? task.amendmentRequestedAt ?? null;
          details.reviewedByTL = server?.amendment_reviewed_by_tl_name ?? task.amendment_reviewed_by_tl_name ?? task.amendmentReviewedByTlName ?? null;
          details.reviewedByTLId = server?.amendment_reviewed_by_tl_id ?? task.amendment_reviewed_by_tl_id ?? task.amendmentReviewedByTlId ?? null;
          details.reviewedByTLAt = server?.amendment_reviewed_at ?? server?.amendment_reviewed_at_iso ?? task.amendment_reviewed_at ?? task.amendmentReviewedAt ?? null;
          details.reviewedByDirector = server?.amendment_reviewed_by_director_name ?? task.amendment_reviewed_by_director_name ?? null;
          details.reviewedByDirectorId = server?.amendment_reviewed_by_director_id ?? task.amendment_reviewed_by_director_id ?? null;
          details.reviewedByDirectorAt = server?.amendment_director_reviewed_at ?? server?.amendment_director_reviewed_at_iso ?? task.amendment_director_reviewed_at ?? null;
          break;

        case 'duplicate':
          details.justification = server?.duplicate_justification ?? server?.duplicateJustification ?? task.duplicate_justification ?? task.duplicateJustification ?? 'No justification provided';
          details.actionedBy = server?.marked_duplicate_by_name ?? server?.marked_duplicate_by ?? task.creator_name ?? task.created_by_name ?? 'Unknown';
          details.actionedById = server?.marked_duplicate_by ?? task.created_by ?? task.createdBy ?? null;
          details.actionedAt = server?.marked_duplicate_at ?? task.created_at ?? task.createdAt ?? null;
          break;
      }

      setAlertDetails(details);
    } catch (err: any) {
      setError(err?.message || 'Failed to load alert details');
      setAlertDetails(null);
    } finally {
      setLoading(false);
    }
  };

  const mapAmendmentStatusFromString = (val: any): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    const s = String(val).toLowerCase();
    if (s.includes('pending')) return 0;
    if (s.includes('forward')) return 1;
    if (s.includes('approve')) return 2;
    if (s.includes('reject')) return 3;
    return null;
  };

  const getAmendmentStatusText = (status: number | null | undefined): string => {
    if (status === null || status === undefined) return 'Pending Review';
    switch (status) {
      case 0: return 'Pending TL Review';
      case 1: return 'Forwarded to Director';
      case 2: return 'Approved';
      case 3: return 'Rejected';
      default: return 'Unknown Status';
    }
  };

  // FIXED: Use reactive useTimezone() hook instead of static localStorage read
  const formatDateTime = (dateStr?: string | null): string => {
    if (!dateStr) return 'N/A';
    const result = tzFormatDateTime(dateStr);
    return result === '—' ? 'N/A' : result;
  };

  const getAlertIcon = () => {
    switch (alertType) {
      case 'revision': return <AlertTriangle className="h-6 w-6 text-yellow-600" />;
      case 'reopened': return <RefreshCw className="h-6 w-6 text-orange-600" />;
      case 'amendment': return <FileEdit className="h-6 w-6 text-blue-600" />;
      case 'duplicate': return <Copy className="h-6 w-6 text-amber-600" />;
      default: return null;
    }
  };

  const getAlertTitle = () => {
    switch (alertType) {
      case 'revision': return 'Revision Alert Details';
      case 'reopened': return 'Reopened Task Details';
      case 'amendment': return 'Amendment Request Details';
      case 'duplicate': return 'Duplicate Task Details';
      default: return 'Alert Details';
    }
  };

  const getAlertColor = () => {
    switch (alertType) {
      case 'revision': return 'border-yellow-200 bg-yellow-50';
      case 'reopened': return 'border-orange-200 bg-orange-50';
      case 'amendment': return 'border-blue-200 bg-blue-50';
      case 'duplicate': return 'border-amber-200 bg-amber-50';
      default: return 'border-gray-200 bg-gray-50';
    }
  };

  return (
    <DraggableDialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" showMaximize>
        <DraggableDialogHeader>
          <DraggableDialogTitle className="flex items-center gap-3">
            {getAlertIcon()}
            <span>{getAlertTitle()}</span>
            <button
              onClick={() => void loadAlertDetails()}
              title="Refresh"
              className="ml-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
            >
              <RefreshIcon className="h-4 w-4" />
              <span className="sr-only">Refresh</span>
            </button>
          </DraggableDialogTitle>
          <p className="text-sm text-gray-600 mt-1">Drag to move this window</p>
        </DraggableDialogHeader>

        <div className="space-y-4 p-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              <p className="font-medium">Error loading alert details</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          ) : alertDetails ? (
            <>
              <div className={`border rounded-lg p-4 ${getAlertColor()}`}>
                <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Task Information
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">Current Task ID:</span>
                    <span className="ml-2 font-medium">TC-{alertDetails.taskId}</span>
                  </div>
                  {alertDetails.originalTaskId && (
                    <div>
                      <span className="text-gray-600">Original Task ID:</span>
                      <span className="ml-2 font-medium text-orange-600">TC-{alertDetails.originalTaskId}</span>
                      <span className="ml-1 text-xs text-gray-500">(before reopen)</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-600">Alert Type:</span>
                    <span className="ml-2 font-medium capitalize">{alertDetails.alertType}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Serial Number:</span>
                    <span className="ml-2 font-medium">{alertDetails.serialNumber}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Part Number:</span>
                    <span className="ml-2 font-medium">{alertDetails.partNumber}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-600">Description:</span>
                    <p className="mt-1 text-gray-900">{alertDetails.description}</p>
                  </div>
                </div>
              </div>

              {(alertDetails.createdBy || alertDetails.createdAt) && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Clock className="h-5 w-5 text-gray-600" />
                    Task Created
                  </h3>
                  <div className="space-y-2 text-sm">
                    {alertDetails.createdBy && (
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-gray-600" />
                        <span className="text-gray-600">Created By:</span>
                        <span className="font-medium text-gray-900">{alertDetails.createdBy}</span>
                      </div>
                    )}
                    {alertDetails.createdAt && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-600" />
                        <span className="text-gray-600">Created At:</span>
                        <span className="font-medium text-gray-900">{formatDateTime(alertDetails.createdAt)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {alertType === 'revision' && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <MessageSquare className="h-5 w-5 text-gray-600" />
                    Revision Notes
                  </h3>
                  <div className="bg-gray-50 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap">
                    {alertDetails.revisionNotes}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
                    <User className="h-4 w-4" />
                    <span className="font-medium">By:</span>
                    <span className="text-gray-900">{alertDetails.actionedBy ?? 'Unknown'}</span>
                    <span className="mx-2 text-gray-400">·</span>
                    <span className="text-gray-600">When:</span>
                    <span className="text-gray-900 ml-1">{formatDateTime(alertDetails.actionedAt)}</span>
                  </div>
                </div>
              )}

              {alertType === 'reopened' && (
                <>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Reopen Information</h3>
                    <div className="space-y-3">
                      <div className="text-sm text-gray-600">
                        <span className="font-medium">Reopen Count:</span>
                        <span className="ml-2">{alertDetails.reopenCount ?? 0}</span>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-600">Reason:</label>
                        <div className="mt-1 bg-gray-50 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap">
                          {alertDetails.reason ?? 'No reason provided'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <User className="h-5 w-5 text-gray-600" />
                      Reopened By
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-600">User:</span>
                        <span className="font-medium text-gray-900">{alertDetails.actionedBy ?? 'Unknown'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-600" />
                        <span className="text-gray-600">Date & Time:</span>
                        <span className="font-medium text-gray-900">{formatDateTime(alertDetails.actionedAt)}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {alertType === 'amendment' && (
                <>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Amendment Status</h3>
                    <div className="bg-blue-50 border border-blue-200 rounded p-3">
                      <span className="text-sm font-medium text-blue-800">{alertDetails.status}</span>
                    </div>
                  </div>

                  {alertDetails.reason && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-3">Amendment Reason</h3>
                      <div className="bg-gray-50 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap">
                        {alertDetails.reason}
                      </div>
                    </div>
                  )}

                  {(alertDetails.reviewedByTL || alertDetails.reviewedByTLAt) && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <User className="h-5 w-5 text-gray-600" />
                        Team Leader Review
                      </h3>
                      <div className="space-y-2 text-sm">
                        {alertDetails.reviewedByTL && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600">Reviewed By:</span>
                            <span className="font-medium text-gray-900">{alertDetails.reviewedByTL}</span>
                          </div>
                        )}
                        {alertDetails.reviewedByTLAt && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-600" />
                            <span className="text-gray-600">Review Date:</span>
                            <span className="font-medium text-gray-900">{formatDateTime(alertDetails.reviewedByTLAt)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(alertDetails.reviewedByDirector || alertDetails.reviewedByDirectorAt) && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <User className="h-5 w-5 text-gray-600" />
                        Director Review
                      </h3>
                      <div className="space-y-2 text-sm">
                        {alertDetails.reviewedByDirector && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600">Reviewed By:</span>
                            <span className="font-medium text-gray-900">{alertDetails.reviewedByDirector}</span>
                          </div>
                        )}
                        {alertDetails.reviewedByDirectorAt && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-600" />
                            <span className="text-gray-600">Review Date:</span>
                            <span className="font-medium text-gray-900">{formatDateTime(alertDetails.reviewedByDirectorAt)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {(alertDetails.actionedBy || alertDetails.actionedAt) && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <User className="h-5 w-5 text-gray-600" />
                        Requested By
                      </h3>
                      <div className="space-y-2 text-sm">
                        {alertDetails.actionedBy && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600">User:</span>
                            <span className="font-medium text-gray-900">{alertDetails.actionedBy}</span>
                          </div>
                        )}
                        {alertDetails.actionedAt && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-600" />
                            <span className="text-gray-600">Request Date:</span>
                            <span className="font-medium text-gray-900">{formatDateTime(alertDetails.actionedAt)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {alertType === 'duplicate' && (
                <>
                  <div className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Duplicate Justification</h3>
                    <div className="bg-amber-50 rounded p-3 text-sm text-gray-700 whitespace-pre-wrap">
                      {alertDetails.justification}
                    </div>
                  </div>

                  {(alertDetails.actionedBy || alertDetails.actionedAt) && (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                        <User className="h-5 w-5 text-gray-600" />
                        Marked As Duplicate By
                      </h3>
                      <div className="space-y-2 text-sm">
                        {alertDetails.actionedBy && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-600">User:</span>
                            <span className="font-medium text-gray-900">{alertDetails.actionedBy}</span>
                          </div>
                        )}
                        {alertDetails.actionedAt && (
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-600" />
                            <span className="text-gray-600">Date & Time:</span>
                            <span className="font-medium text-gray-900">{formatDateTime(alertDetails.actionedAt)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              No alert details available
            </div>
          )}
        </div>

        <div className="flex justify-end p-4 border-t">
          <button
            onClick={() => onOpenChange(false)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </DraggableDialogContent>
    </DraggableDialog>
  );
}