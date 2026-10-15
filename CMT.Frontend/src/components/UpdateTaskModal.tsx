'use client';

import React, { useEffect, useState } from 'react';
import { 
  DraggableDialog, 
  DraggableDialogContent, 
  DraggableDialogHeader, 
  DraggableDialogTitle 
} from '@/components/ui/draggable-dialog';
import { Button } from '@/components/ui/button';
import apiClient from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useTimezone } from '@/lib/timezone-context';
import { normalizeToIso } from '@/lib/datetime-utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  taskId: number | null;
  initial?: any;
  onSaved?: (updated?: any) => void;
};

/**
 * UpdateTaskModal - DRAGGABLE VERSION with Hold Request Support
 *
 * Features:
 * - Draggable by title bar
 * - shop_tl role has read-only access to Status, Assigned Engineer(s), Target Completion, and Alerts
 * - engineer role has full access to Alerts functionality
 * - CRITICAL: Status field is LOCKED when task has pending amendment request (Pending TL Review or Forwarded to Director)
 * - CRITICAL: When engineer changes status to "On Hold", prompts for hold reason and creates hold request
 * - All existing functionality preserved
 */

export default function UpdateTaskModal({ open, onOpenChange, taskId, initial, onSaved }: Props) {
  const { user } = useAuth();

  /**
   * ════════════════════════════════════════════════════════════════════════
   * TIMEZONE FIX — the reported "2:12:14 PM vs 11:12 AM" discrepancy
   * ════════════════════════════════════════════════════════════════════════
   * Task Details formats the stored UTC instant in the user's SELECTED
   * timezone (Africa/Addis_Ababa → GMT+3). This modal used to build and parse
   * its `<input type="datetime-local">` value with `getHours()` / `new Date()`,
   * i.e. in the BROWSER's timezone (usually UTC on hosted machines), so the
   * SAME instant appeared 3 hours earlier and saving it shifted the stored
   * value — which then made Target Completion fall before Task Assigned At and
   * triggered invalid time validations.
   *
   * Both directions now go through the timezone context, so the value edited
   * here is exactly the value rendered in Task Details → Timeline.
   */
  const {
    formatDateTime: tzFormatDateTime,
    toDateTimeInput,
    toDateInput,
    fromDateTimeInput,
    startOfDay: tzStartOfDay,
  } = useTimezone();

  const roleRaw = (user?.role ?? user?.roleDisplayName ?? '').toString().toLowerCase().trim();
  const role = roleRaw;

  /**
   * Normalized role token (spaces / underscores / hyphens removed) so that
   * "team_leader", "Team Leader" and "teamleader" are all treated the same.
   * Without this, a TL whose role arrives in a different casing/format was
   * silently downgraded to read-only on the Target Completion field.
   */
  const roleCompact = roleRaw.replace(/[\s_-]+/g, '');

  const isShopTL = roleCompact === 'shoptl';
  const isTeamLeader = !isShopTL && ['teamleader', 'teamlead'].includes(roleCompact);
  const isDirector = roleCompact === 'director';
  const isTLorDirector = isTeamLeader || isDirector;
  const isEngineer = roleCompact === 'engineer' || roleCompact === 'eng';
  const isCustomerPersonnel = role === 'customer_personnel';
  const isCustomer = role === 'customer';
  const isAdmin = role === 'admin';
  const canApproveRejectCompletion = isTLorDirector || isAdmin || isShopTL;

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [serialNumber, setSerialNumber] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [description, setDescription] = useState('');
  const [comments, setComments] = useState<string>('');

  const [selectedEngineerIds, setSelectedEngineerIds] = useState<number[]>([]);
  const [fallbackAssignedNames, setFallbackAssignedNames] = useState<string[]>();
  const [priorityId, setPriorityId] = useState<number | string>('');
  const [status, setStatus] = useState<string>('Pending');
  const [previousStatus, setPreviousStatus] = useState<string>('Pending');

  const [targetCompletionDate, setTargetCompletionDate] = useState<string>('');
  const [estimatedCompletionDate, setEstimatedCompletionDate] = useState<string>('');

  // CRITICAL FIX: Store original full ISO timestamps from the server
  // so we can preserve the time portion when saving back.
  // Without this, date-only inputs lose the time, causing incorrect
  // timestamps in the Timeline (e.g., "5:05:19 AM" becomes "3:00:00 AM").
  const [originalTargetCompletionISO, setOriginalTargetCompletionISO] = useState<string | null>(null);
  const [originalEstimatedCompletionISO, setOriginalEstimatedCompletionISO] = useState<string | null>(null);

  /**
   * The Task Assigned timestamp (TaskDto.AssignedAt), kept ONLY as a lower bound.
   * Target Completion must never be pulled back onto this moment, because the
   * engineer's actual completion date / variance metrics are measured from it.
   * It is never used as a default value for Target Completion.
   */
  const [taskAssignedAtISO, setTaskAssignedAtISO] = useState<string | null>(null);

  /**
   * The assignment moment for an assignment/reassignment being made RIGHT NOW
   * inside this modal. It is captured exactly once (in state, never during
   * render) so that:
   *   1. the Target Completion recalculation, and
   *   2. the `assignedAt` value posted to the backend
   * are derived from the very same instant and can never drift apart.
   * `null` means "no new assignment in this modal session".
   */
  const [pendingAssignedAtISO, setPendingAssignedAtISO] = useState<string | null>(null);

  /**
   * True once the Team Leader has actually interacted with the Assigned
   * Engineer(s) selector. Required so that an incidental difference between the
   * stored engineer CSV and the resolved engineer ids (e.g. an engineer missing
   * from the dropdown) is never mistaken for a real (re)assignment.
   */
  const [assignmentTouched, setAssignmentTouched] = useState<boolean>(false);

  /**
   * "Category Target Duration" configuration (target days / hours / minutes per
   * category). Used to recalculate Target Completion from the actual Task
   * Assigned At timestamp instead of keeping a stale, already-elapsed value.
   */
  const [targetDurationConfig, setTargetDurationConfig] = useState<any[]>([]);
  const [targetDurationLoaded, setTargetDurationLoaded] = useState<boolean>(false);

  /**
   * True once the user has TYPED/PICKED a target completion value themselves.
   * A manual edit by a Team Leader / Director always wins over the automatic
   * SLA recalculation, so we never silently overwrite a deliberate choice.
   */
  const [targetManuallyEdited, setTargetManuallyEdited] = useState<boolean>(false);
  const [targetAutoRecalcNotice, setTargetAutoRecalcNotice] = useState<string | null>(null);

  const [revisionNotes, setRevisionNotes] = useState<string>('');
  const [updateComment, setUpdateComment] = useState<string>('');
  const [showRevisionAlertToggle, setShowRevisionAlertToggle] = useState<boolean>(false);
  
  const [existingComments, setExistingComments] = useState<any[]>([]);
  const [showCommentsHistory, setShowCommentsHistory] = useState<boolean>(false);

  const [categoryId, setCategoryId] = useState<number | string>('');
  const [categoryName, setCategoryName] = useState<string>('');
  const [requestTypeId, setRequestTypeId] = useState<number | string>('');
  const [requestTypeName, setRequestTypeName] = useState<string>('');

  // CRITICAL: Track amendment request status
  const [hasAmendmentRequest, setHasAmendmentRequest] = useState<boolean>(false);
  const [amendmentStatus, setAmendmentStatus] = useState<number | null>(null);
  const [amendmentReason, setAmendmentReason] = useState<string>('');

  // CRITICAL: Hold request state
  const [showHoldReasonPrompt, setShowHoldReasonPrompt] = useState<boolean>(false);
  const [holdReason, setHoldReason] = useState<string>('');

  // CRITICAL: Rejection reason state (similar to hold reason)
  const [showRejectionReasonPrompt, setShowRejectionReasonPrompt] = useState<boolean>(false);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  // Pause/Resume state
  const [showPauseReasonPrompt, setShowPauseReasonPrompt] = useState<boolean>(false);
  const [pauseReason, setPauseReason] = useState<string>('');
  const [isTaskCurrentlyPaused, setIsTaskCurrentlyPaused] = useState<boolean>(false);
  const [pausedDurationFormatted, setPausedDurationFormatted] = useState<string>('');
  const [resumingTask, setResumingTask] = useState<boolean>(false);

  // Approve/Reject completion state
  const [showApproveRejectUI, setShowApproveRejectUI] = useState<boolean>(false);
  const [approvalComment, setApprovalComment] = useState<string>('');
  const [rejectionCompletionComment, setRejectionCompletionComment] = useState<string>('');
  const [approvingCompletion, setApprovingCompletion] = useState<boolean>(false);
  const [rejectingCompletion, setRejectingCompletion] = useState<boolean>(false);

  const [engineers, setEngineers] = useState<{ user_id: number; full_name: string }[]>([]);
  const [priorities, setPriorities] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [requestTypes, setRequestTypes] = useState<any[]>([]);

  /**
   * UTC instant (or raw API string) → "YYYY-MM-DD" in the SELECTED timezone.
   * Accepts the raw server value directly, so a timestamp serialized without a
   * "Z" is still interpreted as UTC instead of as browser-local time.
   */
  function toInputDateString(d: Date | string | number | null | undefined) {
    return toDateInput(d);
  }

  /**
   * UTC instant (or raw API string) → "YYYY-MM-DDTHH:mm" in the SELECTED
   * timezone, ready for `<input type="datetime-local">`.
   *
   * Target Completion must expose BOTH date and time, because performance metrics
   * (Early / On-Time / Delayed) are measured against the exact target timestamp.
   */
  function toInputDateTimeString(d: Date | string | number | null | undefined) {
    return toDateTimeInput(d);
  }

  /** Start of the calendar day of `d`, computed in the SELECTED timezone. */
  function startOfLocalDay(d: Date) {
    return tzStartOfDay(d) ?? d;
  }

  /**
   * Safely parse any server value into a Date, or null when unusable.
   *
   * `normalizeToIso()` treats a timestamp WITHOUT a timezone designator as UTC
   * (which is what the .NET backend stores). Previously `new Date(v)` read such
   * values as browser-local time, so Target Completion and Task Assigned At sat
   * on two different clocks and the "target must be after assigned" check could
   * fail for a perfectly valid deadline.
   */
  function parseMaybeDate(v: any): Date | null {
    const iso = normalizeToIso(v);
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  /**
   * Parse a `datetime-local` input value ("YYYY-MM-DDTHH:mm") as a wall clock in
   * the user's SELECTED timezone and return the real UTC instant.
   * Returns null for empty/unparseable input so callers can fall back to the
   * stored value instead of inventing "now" / the Task Assigned date.
   */
  function parseLocalDateTimeInput(value: string): Date | null {
    return fromDateTimeInput(value);
  }

  /**
   * ════════════════════════════════════════════════════════════════════════
   * CATEGORY TARGET DURATION (SLA) HELPERS
   * ════════════════════════════════════════════════════════════════════════
   * Target Completion is NOT an arbitrary date: it is
   *
   *      Task Assigned At  +  configured target duration (days/hours/minutes)
   *
   * The duration comes from the "Category Target Duration" configuration
   * (`/reference-data/category-target-days`), exactly the same source the
   * backend uses when it auto-calculates the target at task creation time and
   * the same source the Completed Tasks / KPI pages use for their metrics.
   */

  /**
   * Locate the target-duration row that applies to this task. Matches on
   * category id first (authoritative) and falls back to category name so
   * legacy rows without ids still resolve.
   */
  function findTargetDurationEntry(list: any[], catId: number | string, catName: string): any | null {
    if (!Array.isArray(list) || list.length === 0) return null;

    const idKey = catId !== '' && catId !== null && catId !== undefined ? String(catId) : null;
    const nameKey = String(catName ?? '').trim().toLowerCase();

    const found = list.find((td: any) => {
      const tdId = td?.category_id ?? td?.categoryId ?? td?.CategoryId ?? td?.category?.id ?? null;
      if (idKey !== null && tdId !== null && tdId !== undefined && String(tdId) === idKey) return true;

      const tdName = String(
        td?.category_name ?? td?.categoryName ?? td?.CategoryName ?? td?.category?.name ?? ''
      ).trim().toLowerCase();
      return tdName !== '' && nameKey !== '' && tdName === nameKey;
    });

    return found ?? null;
  }

  /** Total configured target duration in milliseconds (days + hours + minutes). */
  function targetDurationEntryToMs(entry: any): number {
    if (!entry) return 0;
    const days = Number(entry.target_days ?? entry.targetDays ?? entry.TargetDays ?? entry.days ?? 0) || 0;
    const hours = Number(entry.target_hours ?? entry.targetHours ?? entry.TargetHours ?? 0) || 0;
    const minutes = Number(entry.target_minutes ?? entry.targetMinutes ?? entry.TargetMinutes ?? 0) || 0;
    const total = days * 86400000 + hours * 3600000 + minutes * 60000;
    return Number.isFinite(total) && total > 0 ? total : 0;
  }

  /** Human readable duration, e.g. "2 days 3 hours 15 minutes". */
  function formatDurationMs(totalMs: number): string {
    if (!totalMs || totalMs <= 0) return '';
    const days = Math.floor(totalMs / 86400000);
    const hours = Math.floor((totalMs % 86400000) / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);
    const parts: string[] = [];
    if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`);
    if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
    return parts.join(' ');
  }

  /**
   * Normalize status from any format (number, camelCase, snake_case) to display string.
   * Backend may return: 8, "PendingTLApproval", "PendingTlApproval", "pending_tl_approval", "Pending TL Approval", etc.
   */
  function normalizeStatusForDisplay(raw: any): string {
    if (raw === null || raw === undefined) return 'Pending';
    const val = typeof raw === 'number' ? raw : raw;
    // Handle numeric values
    if (typeof val === 'number' || (!isNaN(Number(val)) && String(val).trim() !== '')) {
      switch (Number(val)) {
        case 0: return 'Pending';
        case 1: return 'In Progress';
        case 2: return 'Completed';
        case 3: return 'Blocked';
        case 4: return 'On Hold';
        case 5: return 'Rejected';
        case 6: return 'Cancelled';
        case 7: return 'Paused';
        case 8: return 'Pending TL Approval';
        default: return 'Pending';
      }
    }
    // Handle string values - normalize to display format
    const normalized = String(val).toLowerCase().replace(/[\s_-]+/g, '');
    switch (normalized) {
      case 'pending': return 'Pending';
      case 'inprogress': return 'In Progress';
      case 'completed': return 'Completed';
      case 'blocked': return 'Blocked';
      case 'onhold': return 'On Hold';
      case 'rejected': return 'Rejected';
      case 'cancelled':
      case 'canceled': return 'Cancelled';
      case 'paused': return 'Paused';
      case 'pendingtlapproval': return 'Pending TL Approval';
      default: return String(val); // Return as-is if already a display string like "Pending TL Approval"
    }
  }

  function statusStringToEnum(s: string): number {
    const raw = (s ?? '').toString().trim().toLowerCase();
    switch (raw) {
      case 'pending': return 0;
      case 'in progress':
      case 'inprogress': return 1;
      case 'completed': return 2;
      case 'blocked': return 3;
      case 'on hold':
      case 'onhold': return 4;
      case 'rejected': return 5;
      case 'cancelled':
      case 'canceled': return 6;
      case 'paused': return 7;
      case 'pending tl approval':
      case 'pendingtlapproval':
      case 'pending_tl_approval': return 8;
      default: return 0;
    }
  }

  function getStatusBadgeClass(statusStr: string) {
    switch (statusStr) {
      case 'Completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'In Progress': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Blocked': return 'bg-red-100 text-red-800 border-red-200';
      case 'On Hold': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'Paused': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Rejected': return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'Pending TL Approval': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  }

  /**
   * CRITICAL: Check if amendment is pending (Pending TL Review or Forwarded to Director)
   * Amendment status codes: 0 = Pending TL Review, 1 = Forwarded to Director, 2 = Approved, 3 = Rejected
   */
  const isAmendmentPending = (): boolean => {
    if (!hasAmendmentRequest) return false;
    return amendmentStatus === 0 || amendmentStatus === 1;
  };

  /**
   * Get human-readable amendment status text
   */
  const getAmendmentStatusText = (): string => {
    if (!hasAmendmentRequest) return '';
    switch (amendmentStatus) {
      case 0: return 'Pending TL Review';
      case 1: return 'Forwarded to Director';
      case 2: return 'Approved';
      case 3: return 'Rejected';
      default: return 'Unknown';
    }
  };

  const loadExistingComments = async (taskId: number) => {
    try {
      const commentsResponse = await apiClient.getTaskComments(taskId);
      const commentsList = Array.isArray(commentsResponse) ? commentsResponse : 
                          (commentsResponse?.data || commentsResponse?.comments || []);
      
      const normalizedComments = commentsList.map((comment: any, index: number) => ({
        ...comment,
        _uniqueKey: comment.comment_id || comment.commentId || comment.id || `comment-${taskId}-${index}-${Date.now()}`,
        commentId: comment.comment_id || comment.commentId || comment.id || `temp-${index}`,
        content: comment.content || comment.comment_text || comment.commentText || '',
        authorName: comment.author_name || comment.authorName || 'System',
        createdAt: comment.created_at || comment.createdAt || new Date().toISOString()
      }));
      
      setExistingComments(normalizedComments);
    } catch (err) {
      setExistingComments([]);
    }
  };

  useEffect(() => {
    if (!open) return;
    const t = initial ?? {};

    setSerialNumber(t.serial_number ?? t.serialNumber ?? '');
    setPartNumber(t.part_number ?? t.partNumber ?? '');
    setPoNumber(t.po_number ?? t.poNumber ?? '');
    setDescription(t.description ?? t.details ?? t.request ?? '');
    setComments(t.comments ?? '');
    setPriorityId(t.priority_id ?? t.priorityId ?? t.priority ?? '');
    setCategoryId(t.category_id ?? t.categoryId ?? t.category ?? '');
    setCategoryName(t.category_name ?? t.categoryName ?? t.category ?? t.category_name_display ?? '');

    setRequestTypeId(t.request_type_id ?? t.requestTypeId ?? t.requestType ?? '');
    setRequestTypeName(t.request_type_name ?? t.requestTypeName ?? t.request_type ?? t.request_type_name_display ?? '');

    // Normalize status: backend may return a number (e.g. 8) or string (e.g. "PendingTLApproval")
    const rawStatus = t.status ?? 'Pending';
    const currentStatus = normalizeStatusForDisplay(rawStatus);
    setStatus(currentStatus);
    setPreviousStatus(currentStatus);

    // CRITICAL: Parse amendment request fields
    const rawAmendmentRequest = t.amendment_request ?? t.amendmentRequest ?? t.AmendmentRequest ?? 0;
    const amendmentRequestFlag = !!(rawAmendmentRequest === true || Number(rawAmendmentRequest) === 1);
    setHasAmendmentRequest(amendmentRequestFlag);

    const rawAmendmentStatus = t.amendment_status ?? t.amendmentStatus ?? t.AmendmentStatus ?? null;
    const parsedAmendmentStatus = rawAmendmentStatus !== null && rawAmendmentStatus !== undefined ? Number(rawAmendmentStatus) : null;
    setAmendmentStatus(parsedAmendmentStatus);

    const rawAmendmentReason = t.amendment_reason ?? t.amendmentReason ?? t.AmendmentReason ?? '';
    setAmendmentReason(String(rawAmendmentReason));

    const normalizeDate = (v: any) => {
      if (!v) return '';
      // Pass the RAW server value: toInputDateString() normalizes a
      // designator-less timestamp as UTC and renders it in the selected
      // timezone, so the input never drifts by the timezone offset.
      const formatted = toInputDateString(v);
      return formatted || String(v).slice(0, 10);
    };

    /**
     * Normalize a server timestamp into the `datetime-local` input format.
     * Returns '' when there is no stored value — we NEVER substitute the task
     * created/assigned date as a default, because that is exactly what used to
     * pull Target Completion back to the Task Assigned date on save.
     */
    const normalizeDateTime = (v: any) => {
      if (!v) return '';
      // TIMEZONE FIX: the raw value is normalized as UTC and then rendered in
      // the user's selected timezone — the exact same clock Task Details uses.
      // This is what removes the "2:12:14 PM vs 11:12 AM" gap.
      const formatted = toInputDateTimeString(v);
      return formatted || String(v).slice(0, 16);
    };

    /**
     * CRITICAL FIX: Preserve the original raw timestamp string from the server.
     * We store the raw string as-is (e.g. "2026-04-21T02:05:19.000Z") so that
     * when saving, if the user hasn't changed the date, we send back the EXACT
     * original value — preserving the time portion and avoiding any
     * local-vs-UTC timezone mismatch.
     *
     * Previously this used `new Date(v).toISOString()` which re-serialized to
     * UTC. The date-input value, however, is derived via local-timezone helpers
     * (`getFullYear/getMonth/getDate`). Near midnight UTC the local date and
     * the UTC date can differ, causing the "unchanged" check in handleSave to
     * fail and producing an incorrect timestamp (e.g. "5:05:19 AM" becoming
     * "3:00:00 AM" or "12:00:00 AM").
     *
     * By keeping the raw string we also avoid any floating-point rounding that
     * toISOString() might introduce on milliseconds.
     */
    const preserveOriginalISO = (v: any): string | null => {
      if (!v) return null;
      // Keep the raw string exactly as the server sent it
      if (typeof v === 'string' && v.trim().length > 0) return v.trim();
      // For Date objects or numbers, fall back to ISO serialization
      try {
        const d = new Date(v);
        if (!isNaN(d.getTime())) return d.toISOString();
      } catch {}
      return null;
    };

    const rawTarget = t.target_completion_date ?? t.targetCompletionDate ?? '';
    const rawEstimated = t.estimated_completion_date ?? t.estimatedCompletionDate ?? '';

    setTargetCompletionDate(normalizeDateTime(rawTarget));
    setEstimatedCompletionDate(normalizeDate(rawEstimated));
    setOriginalTargetCompletionISO(preserveOriginalISO(rawTarget));
    setOriginalEstimatedCompletionISO(preserveOriginalISO(rawEstimated));

    // Task Assigned timestamp — used strictly as a "cannot go back to this" floor.
    const rawTaskAssignedAt =
      t.task_assigned_at ?? t.taskAssignedAt ?? t.TaskAssignedAt ??
      t.assigned_at ?? t.assignedAt ?? t.AssignedAt ?? null;
    setTaskAssignedAtISO(preserveOriginalISO(rawTaskAssignedAt));

    // A freshly opened modal has no manual edit yet — allow SLA recalculation.
    setTargetManuallyEdited(false);
    setTargetAutoRecalcNotice(null);
    // No pending (re)assignment until the TL actually changes the engineer(s).
    setPendingAssignedAtISO(null);
    setAssignmentTouched(false);
    
    setRevisionNotes(t.revision_notes ?? t.revisionNotes ?? '');
    setShowRevisionAlertToggle(Boolean(Number(t.show_revision_alert) || t.show_revision_alert || t.showRevisionAlert));

    const assignedRaw = (t.assigned_engineer ?? t.assigned ?? '').toString() ?? '';
    const assignedNames = assignedRaw ? assignedRaw.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
    setFallbackAssignedNames(assignedNames.length ? assignedNames : []);

    setUpdateComment('');
    setHoldReason('');
    setShowHoldReasonPrompt(false);
    setRejectionReason('');
    setShowRejectionReasonPrompt(false);
    setPauseReason('');
    setShowPauseReasonPrompt(false);
    setResumingTask(false);
    setApprovalComment('');
    setRejectionCompletionComment('');
    setApprovingCompletion(false);
    setRejectingCompletion(false);

    // Show approve/reject UI if task is in Pending TL Approval status
    const normalizedStatus = (currentStatus ?? '').toString().toLowerCase().replace(/[\s_]+/g, '');
    setShowApproveRejectUI(normalizedStatus === 'pendingtlapproval');

    // Initialize pause state from task data
    const isPaused = Boolean(t.is_paused ?? t.isPaused ?? t.IsPaused ?? false);
    setIsTaskCurrentlyPaused(isPaused);
    setPausedDurationFormatted(t.total_paused_duration_formatted ?? t.totalPausedDurationFormatted ?? '');

    setError(null);
    setSuccess(null);

    if (taskId) {
      loadExistingComments(taskId);
    }

    setLoading(true);
    Promise.allSettled([
      apiClient.getUsers ? apiClient.getUsers() : Promise.resolve([]),
      apiClient.getPriorities ? apiClient.getPriorities() : Promise.resolve([]),
      apiClient.getRequestTypes ? apiClient.getRequestTypes() : Promise.resolve([]),
      apiClient.getCategories ? apiClient.getCategories() : Promise.resolve([]),
    ])
      .then(results => {
        const usersRes = results[0];
        const prioRes = results[1];
        const reqTypeRes = results[2];
        const catRes = results[3];

        try {
          if (usersRes.status === 'fulfilled' && Array.isArray(usersRes.value)) {
            const engs = usersRes.value
              .map((u: any) => ({
                user_id: Number(u.user_id ?? u.id ?? u.userId ?? 0),
                full_name: String(u.full_name ?? u.name ?? u.fullName ?? ''),
                role: (u.role ?? u.role_name ?? u.roleName ?? '').toString().toLowerCase(),
              }))
              .filter((u: any) => ['engineer', 'team_leader', 'shop_tl'].includes((u.role ?? '').toString().toLowerCase()))
              .map((u: any) => ({ user_id: u.user_id, full_name: u.full_name }));
            setEngineers(engs);

            if (assignedNames.length) {
              const ids = assignedNames
                .map((n: string) => {
                  const found = engs.find(e => e.full_name.toLowerCase() === n.toLowerCase());
                  return found ? found.user_id : null;
                })
                .filter((v: any) => v !== null) as number[];
              setSelectedEngineerIds(ids);
            }
          } else {
            setEngineers([]);
          }
        } catch (e) {
          setEngineers([]);
        }

        try {
          if (prioRes.status === 'fulfilled' && Array.isArray(prioRes.value)) {
            setPriorities(prioRes.value);
          } else {
            setPriorities([]);
          }
        } catch (e) {
          setPriorities([]);
        }

        try {
          if (reqTypeRes.status === 'fulfilled' && Array.isArray(reqTypeRes.value)) {
            setRequestTypes(reqTypeRes.value);
            if ((!requestTypeName || requestTypeName === '') && requestTypeId) {
              const found = reqTypeRes.value.find((r: any) => Number(r.request_type_id ?? r.id ?? r.value) === Number(requestTypeId));
              if (found) {
                setRequestTypeName(found.request_type_name ?? found.name ?? found.label ?? String(requestTypeId));
              }
            }
          } else {
            setRequestTypes([]);
          }
        } catch (e) {
          setRequestTypes([]);
        }

        try {
          if (catRes.status === 'fulfilled' && Array.isArray(catRes.value)) {
            setCategories(catRes.value);
            // If categoryName is not set but categoryId exists, resolve the name from loaded categories
            if ((!categoryName || categoryName === '') && categoryId) {
              const found = catRes.value.find((c: any) => Number(c.category_id ?? c.id ?? c.categoryId ?? c.value) === Number(categoryId));
              if (found) {
                setCategoryName(found.category_name ?? found.name ?? found.title ?? found.label ?? String(categoryId));
              }
            }
          } else {
            setCategories([]);
          }
        } catch (e) {
          setCategories([]);
        }
      })
      .finally(() => setLoading(false));
  }, [open, initial, taskId]);

  /**
   * Load the "Category Target Duration" configuration. The management endpoint
   * is tried first (TL / Director / Engineer) and the reference-data endpoint is
   * used as a fallback, mirroring the Completed Tasks page.
   */
  useEffect(() => {
    if (!open) return;
    let mounted = true;

    const loadTargetDuration = async () => {
      const endpoints = ['/api/management/target-days', '/api/reference-data/target-days'];
      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            credentials: 'include',
            headers: { Accept: 'application/json' },
            cache: 'no-cache',
          });
          if (!res.ok) continue;
          const body = await res.json().catch(() => null);
          const list = Array.isArray(body) ? body : body?.data ?? body?.targetDays ?? [];
          if (Array.isArray(list) && list.length > 0) {
            if (mounted) {
              setTargetDurationConfig(list);
              setTargetDurationLoaded(true);
            }
            return;
          }
        } catch (err) {
          console.warn(`[UpdateTaskModal] Failed to load target duration from ${url}`, err);
        }
      }
      if (mounted) {
        setTargetDurationConfig([]);
        setTargetDurationLoaded(true);
      }
    };

    loadTargetDuration();
    return () => { mounted = false; };
  }, [open]);

  const canEditAssigned = isTLorDirector && !isShopTL;

  /**
   * BUSINESS RULE: Target Completion date AND time may only be edited by
   * Team Leaders or Directors. Every other role (engineer, shop_tl, admin,
   * customer, customer_personnel) sees it as read-only, and their save payload
   * always echoes the stored value back unchanged.
   */
  const canEditTargetDate = isTLorDirector && !isShopTL;

  /**
   * ════════════════════════════════════════════════════════════════════════
   * ASSIGNMENT CHANGE DETECTION (drives the Target Completion recalculation)
   * ════════════════════════════════════════════════════════════════════════
   * Computed at component scope — NOT inside handleSave — because the very same
   * comparison must drive both:
   *   - the `assignedAt` timestamp sent on save, and
   *   - the live recalculation of Target Completion shown in the form.
   */
  function normalizeAssignedCsv(csv: string): string {
    return (csv ?? '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => s.toLowerCase() !== 'unassigned')
      .sort()
      .join(',')
      .toLowerCase();
  }

  const currentAssignedNormalized = normalizeAssignedCsv(buildAssignedEngineerCsv());
  const originalAssignedNormalized = normalizeAssignedCsv(
    (
      (initial as any)?.assigned_engineer ??
      (initial as any)?.assignedEngineer ??
      (initial as any)?.assigned ??
      ''
    ).toString()
  );

  /** The engineer set in the form differs from the one stored on the task. */
  const assignmentChangedInModal = currentAssignedNormalized !== originalAssignedNormalized;
  /** At least one real (non-"Unassigned") engineer is selected. */
  const assignmentHasRealAssignee = currentAssignedNormalized !== '';
  /**
   * This save will assign / reassign the task to a real engineer, so the
   * Task Assigned At moment is "now" and the deadline must be re-based on it.
   */
  const isAssigningNow =
    canEditAssigned && assignmentTouched && assignmentChangedInModal && assignmentHasRealAssignee;

  /**
   * ════════════════════════════════════════════════════════════════════════
   * TARGET COMPLETION — DERIVED FROM "TASK ASSIGNED AT" + TARGET DURATION
   * ════════════════════════════════════════════════════════════════════════
   * BUG (reported): TC-8709 showed
   *      Target Completion : Aug 20, 2026 9:14:55 AM
   *      Task Assigned At  : Aug 20, 2026 9:17:31 AM
   * i.e. the deadline had ALREADY elapsed at the very moment the task was
   * assigned, because the target had been auto-calculated from the earlier
   * creation/estimated timestamp and was then simply carried over unchanged
   * when the engineer was assigned.
   *
   * FIX: the target is now recalculated as
   *      Task Assigned At + configured target duration
   * whenever the task is assigned / reassigned, or whenever the stored target
   * is on/earlier than the actual Task Assigned At timestamp. The result is
   * therefore always strictly AFTER the assignment moment.
   */
  const storedTaskAssignedAtDate = parseMaybeDate(taskAssignedAtISO);
  const pendingAssignedAtDate = parseMaybeDate(pendingAssignedAtISO);

  /**
   * The authoritative "Task Assigned At" moment the deadline is measured from:
   *   - the assignment being made right now in this modal (takes precedence), or
   *   - the AssignedAt timestamp already stored on the task.
   */
  const taskAssignedAtDate = pendingAssignedAtDate ?? storedTaskAssignedAtDate;
  // Rendered with the SAME formatter as Task Details → Timeline.
  const assignedAtLabel = taskAssignedAtDate ? tzFormatDateTime(taskAssignedAtDate) : '';
  const storedTargetDate = parseMaybeDate(originalTargetCompletionISO);

  const targetDurationEntry = findTargetDurationEntry(targetDurationConfig, categoryId, categoryName);
  const targetDurationMs = targetDurationEntryToMs(targetDurationEntry);
  const targetDurationLabel = formatDurationMs(targetDurationMs);

  /** Target Completion recalculated from the stored Task Assigned At timestamp. */
  const recalculatedTargetDate =
    taskAssignedAtDate && targetDurationMs > 0
      ? new Date(taskAssignedAtDate.getTime() + targetDurationMs)
      : null;
  const recalculatedTargetInput = recalculatedTargetDate ? toInputDateTimeString(recalculatedTargetDate) : '';

  /**
   * ════════════════════════════════════════════════════════════════════════
   * DISPLAY FORMAT CONSISTENCY FIX (reported)
   * ════════════════════════════════════════════════════════════════════════
   * BEFORE:
   *   Task Assigned At  : "Aug 21, 2026 at 9:05:53 AM GMT+3"   ← tzFormatDateTime()
   *   Target Completion : "08/21/2026 09:35 AM"                ← native <input
   *                                                              type="datetime-local">
   *
   * The native datetime picker is painted by the BROWSER using its own locale
   * and only minute precision, so it can never match the timezone-aware label
   * used everywhere else (Task Details → Timeline, Task Assigned At, KPI pages).
   *
   * AFTER: Target Completion is ALWAYS displayed through the very same
   * `tzFormatDateTime()` formatter as Task Assigned At, i.e.
   *   "Aug 21, 2026 at 9:35:53 AM GMT+3"
   * The `datetime-local` picker remains available to Team Leaders / Directors,
   * but purely as an EDITING control underneath the canonical label.
   *
   * Seconds are preserved by preferring the precise source Date (SLA-derived or
   * stored ISO) whenever the minute-precision input still matches it — a
   * `datetime-local` value cannot carry seconds, so parsing it alone would
   * display ":00" and re-introduce a visual mismatch.
   */
  const targetCompletionDisplayDate = (() => {
    if (recalculatedTargetDate && recalculatedTargetInput && targetCompletionDate === recalculatedTargetInput) {
      return recalculatedTargetDate;
    }
    if (storedTargetDate && toInputDateTimeString(storedTargetDate) === targetCompletionDate) {
      return storedTargetDate;
    }
    return parseLocalDateTimeInput(targetCompletionDate);
  })();

  /** Canonical, timezone-aware Target Completion label — identical in shape to `assignedAtLabel`. */
  const targetCompletionLabel = targetCompletionDisplayDate
    ? tzFormatDateTime(targetCompletionDisplayDate)
    : '';

  /**
   * The stored target is "stale" when it is missing, or when it lands on/before
   * the actual Task Assigned At moment — precisely the reported defect.
   */
  const targetIsStale = Boolean(
    taskAssignedAtDate &&
    recalculatedTargetDate &&
    (!storedTargetDate || storedTargetDate.getTime() <= taskAssignedAtDate.getTime())
  );

  /**
   * The target must be re-derived from Task Assigned At when EITHER:
   *   a) the task is being assigned / reassigned in this save — the assignment
   *      clock restarts, so the previously calculated deadline is obsolete; or
   *   b) the stored target already elapsed at (or before) the assignment moment
   *      — exactly the reported TC-8709 defect.
   */
  const targetNeedsRecalc = Boolean(recalculatedTargetDate && (isAssigningNow || targetIsStale));

  /**
   * Floor for MANUAL edits: a Team Leader may only move the target forward to
   * today or later, and never onto/before the Task Assigned timestamp.
   */
  const minAllowedTargetDate = (() => {
    const today = startOfLocalDay(new Date());
    if (taskAssignedAtDate) {
      const justAfterAssigned = new Date(taskAssignedAtDate.getTime() + 60 * 1000);
      return justAfterAssigned.getTime() > today.getTime() ? justAfterAssigned : today;
    }
    return today;
  })();

  /**
   * Feeds the native picker's `min` attribute. An SLA-derived value is always
   * reachable, even when a short duration places it earlier than today, so the
   * browser's constraint validation can never block saving a correct target.
   */
  const minTargetInputValue = toInputDateTimeString(
    recalculatedTargetDate && recalculatedTargetDate.getTime() < minAllowedTargetDate.getTime()
      ? recalculatedTargetDate
      : minAllowedTargetDate
  );

  /**
   * Auto-correct an already-elapsed / missing target as soon as the modal has
   * both the task data and the target-duration configuration. This makes the
   * corrected value visible BEFORE saving, so the Team Leader can see exactly
   * what will be persisted. A manual edit disables this.
   */
  useEffect(() => {
    if (!open) return;

    // Capture the assignment instant ONCE per (re)assignment so the deadline
    // and the persisted AssignedAt share the exact same timestamp. Clearing it
    // when the TL reverts the selection keeps the stored assignment intact.
    if (isAssigningNow) {
      setPendingAssignedAtISO(prev => prev ?? new Date().toISOString());
    } else {
      setPendingAssignedAtISO(prev => (prev === null ? prev : null));
    }
  }, [open, isAssigningNow]);

  useEffect(() => {
    if (!open) return;
    if (!canEditTargetDate) return;
    if (!targetDurationLoaded) return;
    if (targetManuallyEdited) return;
    if (!targetNeedsRecalc || !recalculatedTargetInput) return;

    setTargetCompletionDate(prev => (prev === recalculatedTargetInput ? prev : recalculatedTargetInput));

    setTargetAutoRecalcNotice(
      (isAssigningNow
        ? 'This assignment restarts the clock: Target Completion has been recalculated from the Task Assigned At time'
        : 'The stored Target Completion had already elapsed, so it has been recalculated from the actual Task Assigned At time') +
      `${assignedAtLabel ? ` (${assignedAtLabel})` : ''}` +
      `${targetDurationLabel ? ` plus the configured category target duration (${targetDurationLabel})` : ''}. ` +
      'Save to persist the corrected deadline.'
    );
  }, [
    open,
    canEditTargetDate,
    targetDurationLoaded,
    targetManuallyEdited,
    targetNeedsRecalc,
    isAssigningNow,
    recalculatedTargetInput,
    targetDurationLabel,
    assignedAtLabel,
  ]);

  if (!open) return null;

  const canEditPriority = isTLorDirector || isShopTL;
  const canEditCategory = isTeamLeader;
  
  // CRITICAL: Status editing is LOCKED when amendment is pending (Pending TL Review or Forwarded to Director)
  const amendmentPending = isAmendmentPending();
  const canEditStatus = (isEngineer || isTLorDirector) && !isShopTL && !amendmentPending;
  
  const canEditDescription = !isCustomer;
  const canAddUpdateComment = isEngineer || isTLorDirector || isShopTL || isCustomerPersonnel || isCustomer;
  const canToggleRevisionAlert = (isTLorDirector || isEngineer) && !isShopTL;
  const canEditRevisionNotes = isTLorDirector || isShopTL || isEngineer;

  /**
   * CRITICAL: Determine if the task is currently assigned to an engineer.
   * A task is considered "assigned" if it has at least one assigned engineer name
   * that is NOT "Unassigned" or empty.
   */
  const isTaskAssigned = (() => {
    const assignedCsv = buildAssignedEngineerCsv();
    if (!assignedCsv || assignedCsv.trim() === '' || assignedCsv.trim().toLowerCase() === 'unassigned') {
      return false;
    }
    return true;
  });

  /**
   * CRITICAL BUSINESS RULE:
   * - When a task is ASSIGNED to an engineer, only that engineer can mark it as "Completed".
   *   The team leader / director CANNOT set status to "Completed" for assigned tasks.
   * - When a task is UNASSIGNED, the team leader CAN mark it as "Completed".
   * - Team leaders can still: Pause, Reject, On Hold, Reassign assigned tasks.
   */
  const canSetCompleted = (() => {
    // Engineers can always mark their tasks as completed (goes through TL approval flow)
    if (isEngineer) return true;
    // Admin can always complete
    if (isAdmin) return true;
    // TL/Director can only complete UNASSIGNED tasks
    if (isTLorDirector) {
      return !isTaskAssigned();
    }
    return false;
  });

  function buildAssignedEngineerCsv() {
    if (selectedEngineerIds && selectedEngineerIds.length > 0 && engineers.length > 0) {
      const names = selectedEngineerIds
        .map(id => engineers.find(e => Number(e.user_id) === Number(id))?.full_name)
        .filter(Boolean) as string[];
      if (names.length) return names.join(',');
    }
    if (fallbackAssignedNames && fallbackAssignedNames.length) return fallbackAssignedNames.join(',');
    return '';
  }

  /**
   * CRITICAL: Handle status change - check if engineer is changing to "On Hold", "Rejected", or "Paused"
   */
  const handleStatusChange = (newStatus: string) => {
    const normalizedPrevious = (previousStatus ?? '').toString().toLowerCase().replace(/\s+/g, '');
    const normalizedNew = (newStatus ?? '').toString().toLowerCase().replace(/\s+/g, '');
    
    // Check if engineer is changing status to "On Hold" from a different status
    if (isEngineer && normalizedNew === 'onhold' && normalizedPrevious !== 'onhold') {
      setStatus(newStatus);
      setShowHoldReasonPrompt(true);
      setShowRejectionReasonPrompt(false);
      setShowPauseReasonPrompt(false);
    // Check if engineer is changing status to "Rejected" from a different status
    } else if (isEngineer && normalizedNew === 'rejected' && normalizedPrevious !== 'rejected') {
      setStatus(newStatus);
      setShowRejectionReasonPrompt(true);
      setShowHoldReasonPrompt(false);
      setShowPauseReasonPrompt(false);
    // Check if changing status to "Paused" from a different status
    } else if (normalizedNew === 'paused' && normalizedPrevious !== 'paused') {
      setStatus(newStatus);
      setShowPauseReasonPrompt(true);
      setShowHoldReasonPrompt(false);
      setShowRejectionReasonPrompt(false);
    } else {
      setStatus(newStatus);
      setShowHoldReasonPrompt(false);
      setShowRejectionReasonPrompt(false);
      setShowPauseReasonPrompt(false);
    }
  };

  async function handleResume() {
    if (!taskId) return;
    setResumingTask(true);
    setError(null);
    setSuccess(null);
    try {
      await apiClient.resumeTask(taskId, { resumeComment: updateComment?.trim() || undefined });
      setIsTaskCurrentlyPaused(false);
      setStatus('In Progress');
      setPreviousStatus('In Progress');
      setShowPauseReasonPrompt(false);
      setSuccess('Task resumed successfully. Status changed back to In Progress.');
      try {
        onSaved && onSaved();
        window.dispatchEvent(new CustomEvent('tasks:refresh'));
      } catch {}
      setTimeout(() => onOpenChange(false), 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to resume task');
    } finally {
      setResumingTask(false);
    }
  }

  async function handleApproveCompletion() {
    if (!taskId) return;
    setApprovingCompletion(true);
    setError(null);
    setSuccess(null);
    try {
      // CRITICAL FIX: Send tlApprovedAt with the current timestamp so the backend
      // records the exact time the TL approved the task. This ensures the "TL Approved"
      // timestamp in TaskDetails Timeline is distinct from the "Engineer Completed" timestamp.
      await apiClient.approveTaskCompletion(taskId, approvalComment?.trim() || undefined, new Date().toISOString());
      setStatus('Completed');
      setPreviousStatus('Completed');
      setShowApproveRejectUI(false);
      setSuccess('Task completion approved successfully. The task has been marked as Completed.');
      try {
        onSaved && onSaved();
        window.dispatchEvent(new CustomEvent('tasks:refresh'));
      } catch {}
      setTimeout(() => onOpenChange(false), 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to approve task completion');
    } finally {
      setApprovingCompletion(false);
    }
  }

  async function handleRejectCompletion() {
    if (!taskId) return;
    if (!rejectionCompletionComment || !rejectionCompletionComment.trim()) {
      setError('A comment explaining the rejection reason is required.');
      return;
    }
    setRejectingCompletion(true);
    setError(null);
    setSuccess(null);
    try {
      await apiClient.rejectTaskCompletion(taskId, rejectionCompletionComment.trim());
      setStatus('In Progress');
      setPreviousStatus('In Progress');
      setShowApproveRejectUI(false);
      setSuccess('Task completion rejected. The task has been sent back to In Progress status.');
      try {
        onSaved && onSaved();
        window.dispatchEvent(new CustomEvent('tasks:refresh'));
      } catch {}
      setTimeout(() => onOpenChange(false), 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to reject task completion');
    } finally {
      setRejectingCompletion(false);
    }
  }

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    setSuccess(null);

    if (!taskId) {
      setError('Task ID missing.');
      return;
    }

    if (!description || !description.trim()) {
      setError('Description is required');
      return;
    }
    
    if (categoryId === '' || categoryId === null || categoryId === undefined) {
      setError('Category is required');
      return;
    }
    
    // Priority is optional — no validation required

    // CRITICAL BUSINESS RULE ENFORCEMENT:
    // Team Leader / Director CANNOT mark an assigned task as "Completed".
    // Only the assigned engineer can complete the task (which goes through TL approval flow).
    // TL/Director CAN complete UNASSIGNED tasks.
    const normalizedStatusForCheck = (status ?? '').toString().toLowerCase().replace(/\s+/g, '');
    if (isTLorDirector && !isAdmin && normalizedStatusForCheck === 'completed' && isTaskAssigned()) {
      setError('You cannot mark this task as completed because it is assigned to an engineer. Only the assigned engineer can mark it as completed. You can pause, reject, put on hold, or reassign the task.');
      return;
    }

    // CRITICAL: If engineer is changing to "On Hold", validate hold reason
    const normalizedPrevious = (previousStatus ?? '').toString().toLowerCase().replace(/\s+/g, '');
    const normalizedCurrent = (status ?? '').toString().toLowerCase().replace(/\s+/g, '');
    const isChangingToHold = isEngineer && normalizedCurrent === 'onhold' && normalizedPrevious !== 'onhold';
    const isChangingToRejected = isEngineer && normalizedCurrent === 'rejected' && normalizedPrevious !== 'rejected';
    const isChangingToPaused = normalizedCurrent === 'paused' && normalizedPrevious !== 'paused';
    
    if (isChangingToHold && (!holdReason || !holdReason.trim())) {
      setError('Hold reason is required when placing a task on hold');
      setShowHoldReasonPrompt(true);
      return;
    }

    // CRITICAL: If engineer is changing to "Rejected", validate rejection reason
    if (isChangingToRejected && (!rejectionReason || !rejectionReason.trim())) {
      setError('Rejection reason is required when rejecting a task');
      setShowRejectionReasonPrompt(true);
      return;
    }

    // CRITICAL: If changing to "Paused", validate pause reason
    if (isChangingToPaused && (!pauseReason || !pauseReason.trim())) {
      setError('Pause reason is required when pausing a task');
      setShowPauseReasonPrompt(true);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // TARGET COMPLETION GUARD
    // ══════════════════════════════════════════════════════════════════════════
    // RULE 1 (role): Only Team Leaders / Directors may change the Target
    //   Completion date & time. If any other role somehow submits a modified
    //   value (stale state, tampered DOM), reject the save instead of silently
    //   persisting the change.
    // RULE 2 (forward-only): An authorized editor may only move the target to
    //   today or a future date/time. Any attempt to move it backward — to a past
    //   date, or onto/before the Task Assigned timestamp — is rejected, and the
    //   currently stored target is restored. This protects the engineer's actual
    //   completion date and the Early / On-Time / Delayed metrics.
    // The stored target expressed on the SAME clock as the visible input, so an
    // unchanged form is detected as unchanged instead of as a 3-hour edit.
    const storedTargetInput = originalTargetCompletionISO
      ? toInputDateTimeString(originalTargetCompletionISO)
      : '';

    /**
     * A value the modal itself derived from (Task Assigned At + category target
     * duration) is authoritative and must NOT be measured against the
     * "today or later" floor: a short target duration applied to an older
     * assignment can legitimately land before today. Only hand-edited values go
     * through the forward-only floor checks below.
     */
    const isSlaDerivedTarget = Boolean(
      !targetManuallyEdited &&
      targetNeedsRecalc &&
      recalculatedTargetInput &&
      targetCompletionDate === recalculatedTargetInput
    );

    if (!canEditTargetDate) {
      if ((targetCompletionDate ?? '') !== storedTargetInput) {
        setError('Only Team Leaders or Directors can change the Target Completion date and time.');
        // Restore the stored value so the UI reflects what will actually be saved.
        setTargetCompletionDate(storedTargetInput);
        return;
      }
    } else if (!isSlaDerivedTarget && targetCompletionDate && targetCompletionDate !== storedTargetInput) {
      // The TL / Director genuinely edited the value — validate the new target.
      const nextTarget = parseLocalDateTimeInput(targetCompletionDate);

      if (!nextTarget) {
        setError('The Target Completion date and time is invalid. Please select a valid date and time.');
        return;
      }

      // Hard block: never allow the target to land on or before the Task Assigned date.
      if (taskAssignedAtDate && nextTarget.getTime() <= taskAssignedAtDate.getTime()) {
        setError(
          `Target Completion cannot be moved back to (or before) the Task Assigned date (${tzFormatDateTime(taskAssignedAtDate)}). ` +
          `It can only be moved forward — please select today or a later date and time.`
        );
        setTargetCompletionDate(storedTargetInput);
        return;
      }

      // Hard block: never allow a past date. Today or later only.
      if (nextTarget.getTime() < minAllowedTargetDate.getTime()) {
        setError(
          `Target Completion can only be moved forward to today or a future date. ` +
          `The earliest allowed value is ${tzFormatDateTime(minAllowedTargetDate)}.`
        );
        setTargetCompletionDate(storedTargetInput);
        return;
      }
    }

    const statusEnum = statusStringToEnum(status);

    // CRITICAL: Use hold reason, rejection reason, or pause reason as update comment when applicable
    const finalUpdateComment = isChangingToHold && holdReason.trim() 
      ? holdReason.trim() 
      : isChangingToRejected && rejectionReason.trim()
        ? `[REJECTED] ${rejectionReason.trim()}`
        : isChangingToPaused && pauseReason.trim()
          ? `[PAUSED] ${pauseReason.trim()}`
          : (updateComment && updateComment.trim() ? updateComment.trim() : undefined);

    // NEW: Detect whether this save changes the engineer assignment.
    // The backend auto-sets AssignedAt on FIRST assignment, but we also send
    // `assignedAt` explicitly so the backend/service layer can record/refresh
    // the assignment timestamp whenever a TL (re)assigns an engineer via this
    // modal. This timestamp is later used to calculate Variance from the
    // moment an engineer was assigned rather than from task creation.
    const newAssignedCsv = buildAssignedEngineerCsv() || 'Unassigned';
    // Assignment change detection now lives at component scope
    // (`assignmentChangedInModal` / `assignmentHasRealAssignee`) so that the
    // SAME comparison drives both the `assignedAt` payload and the live
    // Target Completion recalculation shown in the form.
    const shouldSendAssignedAt = canEditAssigned && assignmentChangedInModal && assignmentHasRealAssignee;
    // Reuse the captured assignment instant so the persisted AssignedAt and the
    // recalculated Target Completion are derived from the exact same moment.
    const assignedAtForSave = pendingAssignedAtISO ?? new Date().toISOString();

    const payload: any = {
      serialNumber: serialNumber || null,
      partNumber: partNumber || null,
      poNumber: poNumber || null,
      description: description.trim(),
      categoryId: Number(categoryId),
      requestTypeId: requestTypeId ? Number(requestTypeId) : null,
      status: statusEnum,
      comments: comments || null,
      assignedEngineer: newAssignedCsv,
      priorityId: priorityId !== '' && priorityId !== null && priorityId !== undefined ? Number(priorityId) : null,
      // NEW: include assignedAt when the TL is (re)assigning an engineer.
      // Backend TaskController auto-sets AssignedAt on first assignment; this
      // explicit field lets the service layer reconcile/update it as needed.
      ...(shouldSendAssignedAt ? { assignedAt: assignedAtForSave } : {}),
      // CRITICAL FIX: When engineer changes status to "Completed", send engineerCompletedAt
      // so the backend records the exact timestamp of the engineer's completion action.
      // This ensures the "Engineer Completed" timestamp in TaskDetails Timeline is distinct
      // from the "TL Approved" timestamp.
      ...(normalizedCurrent === 'completed' && normalizedPrevious !== 'completed' ? { engineerCompletedAt: new Date().toISOString() } : {}),
      estimatedCompletionDate: (() => {
        if (!estimatedCompletionDate) return null;
        // TIMEZONE FIX: every comparison and reconstruction happens on the
        // SELECTED timezone clock, so the stored time-of-day is preserved
        // instead of being shifted by the browser offset (the bug that turned
        // "5:05:19 AM GMT+3" into "3:00:00 AM GMT+3").
        if (originalEstimatedCompletionISO) {
          const originalDayInTz = toInputDateString(originalEstimatedCompletionISO);
          if (originalDayInTz && estimatedCompletionDate === originalDayInTz) {
            // Day unchanged — echo the original raw string with time intact.
            return originalEstimatedCompletionISO;
          }
          // Day changed by the user — keep the original wall-clock time of day
          // (as seen in the selected timezone) and move it to the new day.
          const originalDateTimeInTz = toInputDateTimeString(originalEstimatedCompletionISO);
          const timePart = originalDateTimeInTz ? originalDateTimeInTz.slice(11, 16) : '00:00';
          const rebuilt = parseLocalDateTimeInput(`${estimatedCompletionDate}T${timePart}`);
          if (rebuilt) return rebuilt.toISOString();
        }
        // Fallback: anchor at midnight of the selected timezone, not of the browser.
        const midnight = parseLocalDateTimeInput(`${estimatedCompletionDate}T00:00`);
        return midnight ? midnight.toISOString() : null;
      })(),
      /**
       * ══════════════════════════════════════════════════════════════════════
       * TARGET COMPLETION — ROLE-GUARDED, NEVER-REVERTED
       * ══════════════════════════════════════════════════════════════════════
       * Two hard rules are enforced here:
       *
       * 1) ONLY Team Leaders / Directors may change this value. For any other
       *    role we always send back `originalTargetCompletionISO` verbatim, so
       *    an engineer saving a status update (or any other field) can never
       *    move the target.
       *
       * 2) The value must NEVER regress to the Task Assigned / created date.
       *    Previously an empty or partially-parsed input fell through to a
       *    `new Date(...)` fallback, which the backend then persisted — pulling
       *    Target Completion back onto the assignment date and corrupting the
       *    engineer's actual completion / variance metrics. Now, if the field
       *    is empty or unparseable we return the stored original (or `null`
       *    when nothing was ever stored) instead of inventing a date.
       */
      targetCompletionDate: (() => {
        // RULE 1: non-TL/Director roles can never modify the target.
        if (!canEditTargetDate) {
          return originalTargetCompletionISO ?? null;
        }

        /**
         * RULE 1b (TC-8709 FIX): whenever the task is assigned / reassigned, or
         * the stored target already elapsed at the assignment moment, persist
         *
         *      Task Assigned At + configured category target duration
         *
         * instead of the stale value. Serialized from the computed Date (not
         * from the minute-precision input) so the seconds of the assignment
         * timestamp are preserved and the result is always strictly AFTER
         * Task Assigned At.
         */
        if (!targetManuallyEdited && targetNeedsRecalc && recalculatedTargetDate) {
          return recalculatedTargetDate.toISOString();
        }

        // RULE 2a: an empty input must not wipe or reset a previously stored target.
        if (!targetCompletionDate) {
          return originalTargetCompletionISO ?? null;
        }

        // The input is `datetime-local` ("YYYY-MM-DDTHH:mm") entered in the
        // user's local timezone. Parse it as local time, then serialize to UTC.
        const nextDate = parseLocalDateTimeInput(targetCompletionDate);

        // RULE 2b: unparseable input must not fall back to "now"/assigned date.
        if (!nextDate) {
          return originalTargetCompletionISO ?? null;
        }

        // If the TL did not actually change the value, echo the exact original
        // string so the stored seconds/milliseconds stay byte-identical and the
        // backend change-tracker does not log a phantom edit.
        if (originalTargetCompletionISO) {
          // Compared on the SELECTED timezone clock — the same one the input
          // renders — so an untouched field is never persisted as a new value.
          if (toInputDateTimeString(originalTargetCompletionISO) === targetCompletionDate) {
            return originalTargetCompletionISO;
          }
        }

        // RULE 3 (final safety net): a changed value must be forward-only.
        // Even if the UI validation above were bypassed, we refuse to serialize a
        // target that regresses onto/before the Task Assigned date or into the
        // past — we send the stored value instead so nothing moves backward.
        if (taskAssignedAtDate && nextDate.getTime() <= taskAssignedAtDate.getTime()) {
          return originalTargetCompletionISO ?? null;
        }
        if (nextDate.getTime() < minAllowedTargetDate.getTime()) {
          return originalTargetCompletionISO ?? null;
        }

        return nextDate.toISOString();
      })(),
      attachmentPath: null,
      shopId: null,
      revisionNotes: revisionNotes && revisionNotes.trim() ? revisionNotes.trim() : null,
      showRevisionAlert: showRevisionAlertToggle ? 1 : 0,
      updateComment: finalUpdateComment,
      _editor: {
        userId: user?.userId ?? user?.id,
        userRole: role,
        userName: user?.fullName ?? user?.name ?? user?.username ?? '',
      },
    };

    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    setSaving(true);
    try {
      // CRITICAL: First update the task
      const updated = await apiClient.updateTask(taskId, payload);

      // CRITICAL: Check if the proxy intercepted the request (engineer completing task)
      // The proxy changes status from Completed(2) to PendingTLApproval(8) for engineers
      const wasIntercepted = updated?._interceptedByProxy === true;
      const actualStatus = updated?._actualStatus;
      
      // Check if backend/proxy returned a different status than what was sent
      // Check multiple possible response shapes for the status field
      const returnedStatus = actualStatus 
        ?? updated?.status ?? updated?.Status 
        ?? updated?.task?.status ?? updated?.task?.Status
        ?? updated?.data?.status ?? updated?.data?.Status
        ?? updated?.taskStatus ?? updated?.TaskStatus;
      
      // Also check if status is nested in a result/response wrapper
      const effectiveStatus = returnedStatus ?? updated?.result?.status ?? updated?.response?.status;
      
      // CRITICAL: If engineer tried to set Completed and proxy intercepted it
      if (wasIntercepted || (isEngineer && statusEnum === 2 && effectiveStatus === 8)) {
        setStatus('Pending TL Approval');
        setPreviousStatus('Pending TL Approval');
        setShowApproveRejectUI(true);
        setSuccess('Your completion request has been submitted and is now pending Team Leader approval. The task will be marked as completed once a Team Leader, Director, or Admin approves it.');
        try {
          onSaved && onSaved(updated);
          window.dispatchEvent(new CustomEvent('tasks:refresh'));
        } catch {}
        setTimeout(() => onOpenChange(false), 1800);
        setSaving(false);
        return;
      }
      
      if (effectiveStatus !== undefined && effectiveStatus !== null) {
        const returnedStatusDisplay = normalizeStatusForDisplay(effectiveStatus);
        const sentStatusDisplay = normalizeStatusForDisplay(statusEnum);
        
        // Compare the returned status against what was SENT (not the UI state)
        if (returnedStatusDisplay !== sentStatusDisplay || returnedStatusDisplay !== status) {
          if (returnedStatusDisplay !== status) {
            setStatus(returnedStatusDisplay);
            setPreviousStatus(returnedStatusDisplay);
          }
          // If backend changed Completed -> PendingTLApproval, show appropriate message
          if (returnedStatusDisplay === 'Pending TL Approval' && (status === 'Completed' || statusEnum === 2)) {
            setSuccess('Your completion request has been submitted and is now pending Team Leader approval. The task will be marked as completed once a Team Leader, Director, or Admin approves it.');
            setShowApproveRejectUI(true);
            try {
              onSaved && onSaved(updated);
              window.dispatchEvent(new CustomEvent('tasks:refresh'));
            } catch {}
            setTimeout(() => onOpenChange(false), 1800);
            setSaving(false);
            return;
          }
        }
      }
      
      // CRITICAL: If engineer is changing to "On Hold", create hold request
      if (isChangingToHold) {
        try {
          await apiClient.createHoldRequest(taskId, { holdReason: holdReason.trim() });
          setSuccess('Task placed on hold. Hold request created successfully and sent to Team Leaders for review.');
        } catch (holdErr: any) {
          // Check if the error is "already pending hold request" — this is not a fatal error
          const holdErrMsg = holdErr?.message || holdErr?.error || '';
          const isAlreadyPending = holdErrMsg.toLowerCase().includes('already') && 
                                   (holdErrMsg.toLowerCase().includes('pending') || holdErrMsg.toLowerCase().includes('hold'));
          
          if (isAlreadyPending) {
            // Task status was already updated successfully, just the hold request was duplicate
            setSuccess('Task status updated to On Hold. Note: A hold request already exists for this task and is pending review by Team Leaders.');
          } else {
            console.error('Failed to create hold request:', holdErr);
            setError(`Task updated but failed to create hold request: ${holdErrMsg || 'Unknown error'}`);
            setSaving(false);
            return;
          }
        }
      // CRITICAL: If changing to "Paused", call pause API
      } else if (isChangingToPaused) {
        try {
          await apiClient.pauseTask(taskId, { pauseReason: pauseReason.trim() });
          setIsTaskCurrentlyPaused(true);
          setSuccess('Task paused successfully. The pause reason has been recorded and time tracking has started.');
        } catch (pauseErr: any) {
          console.error('Failed to pause task:', pauseErr);
          setError(`Task updated but failed to create pause record: ${pauseErr.message || 'Unknown error'}`);
          setSaving(false);
          return;
        }
      // CRITICAL: If engineer is changing to "Rejected", do NOT soft-delete.
      // The task status is already updated to "Rejected" via apiClient.updateTask above.
      // The task will be filtered out of the active task table for non-initiators,
      // but will remain visible to the task initiator so they can see the rejection reason.
      } else if (isChangingToRejected) {
        setSuccess('Task rejected successfully. The rejection reason has been sent to the task initiator. The task will be removed from your active task list and displayed to the initiator with its rejected status.');
      } else {
        setSuccess('Task updated successfully');
      }
      
      if (finalUpdateComment) {
        await loadExistingComments(taskId);
      }
      
      try {
        onSaved && onSaved(updated);
        window.dispatchEvent(new CustomEvent('tasks:refresh'));
      } catch {}
      
      setTimeout(() => onOpenChange(false), 1200);
    } catch (err: any) {
      setError(err?.message || 'Failed to save changes');
    } finally {
      setSaving(false);
    }
  }

  const isTaskInitiator = Boolean(user && initial && ((user.userId ?? user.id) === (initial.created_by ?? initial.createdBy)));

  return (
    <DraggableDialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" showMaximize>
        <DraggableDialogHeader>
          <DraggableDialogTitle>Update Task {taskId ? `TC-${taskId}` : ''} • Drag to move</DraggableDialogTitle>
        </DraggableDialogHeader>

        <form onSubmit={handleSave} className="space-y-6 p-6">
          {isTaskInitiator && Boolean(initial?.show_revision_alert || initial?.showRevisionAlert || (initial?.revision_notes && String(initial.revision_notes).trim().length > 0)) && (
            <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 flex items-start gap-3 animate-pulse">
              <div className="text-yellow-700 mt-0.5">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 9v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"></path>
                  <circle cx="12" cy="16" r="1" fill="currentColor"></circle>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="0.5" fill="transparent"></path>
                </svg>
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm text-yellow-800">⚠️ Important Update</div>
                <div className="text-sm text-yellow-700 mt-1" dangerouslySetInnerHTML={{ __html: String(initial?.revision_notes ?? initial?.revisionNotes ?? 'There is an important revision for this task.') }} />
              </div>
            </div>
          )}

          {/* CRITICAL: Amendment Pending Alert - shown when status editing is locked */}
          {amendmentPending && (
            <div className="rounded-md bg-blue-50 border-2 border-blue-400 p-4 flex items-start gap-3">
              <div className="text-blue-700 mt-0.5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"></circle>
                  <path d="M12 8v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"></path>
                  <circle cx="12" cy="16" r="1" fill="currentColor"></circle>
                </svg>
              </div>
              <div className="flex-1">
                <div className="font-semibold text-sm text-blue-900">🔒 Amendment Request Pending</div>
                <div className="text-sm text-blue-800 mt-1">
                  <strong>Status:</strong> {getAmendmentStatusText()}
                  <br />
                  <strong>Reason:</strong> {amendmentReason || 'No reason provided'}
                  <br />
                  <br />
                  The <strong>Status field is locked</strong> and cannot be changed until the amendment request is approved or rejected by a Director.
                  {isTLorDirector && (
                    <>
                      <br />
                      <br />
                      As a {role === 'team_leader' ? 'Team Leader' : 'Director'}, you can review this amendment request in the Completed Tasks page.
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* CRITICAL: Hold Reason Prompt - shown when engineer changes status to "On Hold" */}
          {showHoldReasonPrompt && isEngineer && (
            <div className="rounded-md bg-purple-50 border-2 border-purple-400 p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="text-purple-700 mt-0.5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"></circle>
                    <path d="M12 8v8M8 12h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"></path>
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm text-purple-900">⏸️ Hold Request Required</div>
                  <div className="text-sm text-purple-800 mt-1">
                    You are placing this task on hold. Please provide a reason for the hold request. This will be sent to Team Leaders for review.
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-purple-900 mb-2 block">
                  Hold Reason <span className="text-red-600">*</span>
                </label>
                <textarea
                  className="w-full rounded-md border-2 border-purple-300 px-3 py-2 text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-200"
                  rows={4}
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  placeholder="Explain why this task needs to be placed on hold (e.g., waiting for parts, customer clarification needed, technical blocker, etc.)"
                  required
                />
                <div className="text-xs text-purple-700 mt-1">
                  This reason will be included in the hold request sent to Team Leaders. Be specific and clear about what is blocking progress.
                </div>
              </div>
            </div>
          )}

          {/* CRITICAL: Rejection Reason Prompt - shown when engineer changes status to "Rejected" */}
          {showRejectionReasonPrompt && isEngineer && (
            <div className="rounded-md bg-red-50 border-2 border-red-400 p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="text-red-700 mt-0.5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"></circle>
                    <path d="M8 8l8 8M16 8l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"></path>
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm text-red-900">❌ Rejection Reason Required</div>
                  <div className="text-sm text-red-800 mt-1">
                    You are rejecting this task. Please provide a reason for the rejection. This will be displayed to the task initiator as a notification.
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-red-900 mb-2 block">
                  Rejection Reason <span className="text-red-600">*</span>
                </label>
                <textarea
                  className="w-full rounded-md border-2 border-red-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200"
                  rows={4}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this task is being rejected (e.g., duplicate request, out of scope, insufficient information, not applicable, etc.)"
                  required
                />
                <div className="text-xs text-red-700 mt-1">
                  This reason will be sent to the task initiator. The task will be removed from the active task list upon submission.
                </div>
              </div>
            </div>
          )}

          {/* Pause Reason Prompt - shown when user changes status to "Paused" */}
          {showPauseReasonPrompt && (
            <div className="rounded-md bg-amber-50 border-2 border-amber-400 p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="text-amber-700 mt-0.5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"></circle>
                    <rect x="9" y="8" width="2" height="8" rx="1" fill="currentColor"></rect>
                    <rect x="13" y="8" width="2" height="8" rx="1" fill="currentColor"></rect>
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm text-amber-900">⏸️ Pause Reason Required</div>
                  <div className="text-sm text-amber-800 mt-1">
                    You are pausing this task. Please provide a reason. Time tracking will begin and the paused duration will be recorded.
                  </div>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-amber-900 mb-2 block">
                  Pause Reason <span className="text-red-600">*</span>
                </label>
                <textarea
                  className="w-full rounded-md border-2 border-amber-300 px-3 py-2 text-sm focus:border-amber-500 focus:ring-2 focus:ring-amber-200"
                  rows={4}
                  value={pauseReason}
                  onChange={(e) => setPauseReason(e.target.value)}
                  placeholder="Explain why this task needs to be paused (e.g., waiting for information, temporary resource reallocation, dependency on another task, etc.)"
                  required
                />
                <div className="text-xs text-amber-700 mt-1">
                  The pause duration will be tracked automatically. You can resume the task at any time from the Update Task modal.
                </div>
              </div>
            </div>
          )}

          {/* Resume Task Banner - shown when task is currently paused */}
          {isTaskCurrentlyPaused && !showPauseReasonPrompt && (
            <div className="rounded-md bg-amber-50 border-2 border-amber-400 p-4 flex items-center justify-between">
              <div className="flex items-start gap-3">
                <div className="text-amber-700 mt-0.5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"></circle>
                    <rect x="9" y="8" width="2" height="8" rx="1" fill="currentColor"></rect>
                    <rect x="13" y="8" width="2" height="8" rx="1" fill="currentColor"></rect>
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-sm text-amber-900">⏸️ Task is Currently Paused</div>
                  <div className="text-sm text-amber-800 mt-1">
                    {pausedDurationFormatted && <span>Total paused time: <strong>{pausedDurationFormatted}</strong>. </span>}
                    Click &quot;Resume Task&quot; to continue working on this task.
                  </div>
                </div>
              </div>
              <Button
                type="button"
                onClick={handleResume}
                disabled={resumingTask}
                className="bg-green-600 hover:bg-green-700 text-white ml-4 flex items-center gap-2"
              >
                {resumingTask ? 'Resuming…' : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <polygon points="5,3 19,12 5,21"></polygon>
                    </svg>
                    Resume Task
                  </>
                )}
              </Button>
            </div>
          )}

          {/* CRITICAL: Pending TL Approval Banner - shown when task is awaiting TL/Director/Admin approval */}
          {showApproveRejectUI && status === 'Pending TL Approval' && (
            <div className="rounded-md bg-orange-50 border-2 border-orange-400 p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="text-orange-700 mt-0.5">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"></circle>
                    <path d="M12 8v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"></path>
                    <circle cx="12" cy="16" r="1" fill="currentColor"></circle>
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm text-orange-900">⏳ Pending TL Approval</div>
                  <div className="text-sm text-orange-800 mt-1">
                    An engineer has marked this task as completed. It requires approval from a Team Leader, and Director before it can be finalized.
                  </div>
                </div>
              </div>

              {canApproveRejectCompletion ? (
                <div className="space-y-4 mt-4">
                  {/* Approve Section */}
                  <div className="bg-green-50 border border-green-200 rounded-md p-3">
                    <label className="text-sm font-medium text-green-900 mb-2 block">
                      Approval Comment <span className="text-xs text-green-700">(optional)</span>
                    </label>
                    <textarea
                      className="w-full rounded-md border border-green-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-2 focus:ring-green-200"
                      rows={2}
                      value={approvalComment}
                      onChange={(e) => setApprovalComment(e.target.value)}
                      placeholder="Add an optional comment for the approval..."
                    />
                    <Button
                      type="button"
                      onClick={handleApproveCompletion}
                      disabled={approvingCompletion || rejectingCompletion}
                      className="mt-2 bg-green-600 hover:bg-green-700 text-white flex items-center gap-2"
                    >
                      {approvingCompletion ? 'Approving…' : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                          Approve Completion
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Reject Section */}
                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                    <label className="text-sm font-medium text-red-900 mb-2 block">
                      Rejection Reason <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      className="w-full rounded-md border border-red-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-200"
                      rows={3}
                      value={rejectionCompletionComment}
                      onChange={(e) => setRejectionCompletionComment(e.target.value)}
                      placeholder="Explain why the completion is being rejected (required). The task will be sent back to In Progress."
                    />
                    <Button
                      type="button"
                      onClick={handleRejectCompletion}
                      disabled={approvingCompletion || rejectingCompletion || !rejectionCompletionComment.trim()}
                      className="mt-2 bg-red-600 hover:bg-red-700 text-white flex items-center gap-2"
                    >
                      {rejectingCompletion ? 'Rejecting…' : (
                        <>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                          </svg>
                          Reject Completion
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-orange-800 mt-2 italic">
                  {isEngineer 
                    ? 'You have submitted this task for completion approval. A Team Leader, or Director will review it shortly.'
                    : 'Only Team Leaders, Directors, and Admins can approve or reject task completions.'
                  }
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Task Overview</h2>
                  <div className="text-sm text-gray-500">TC-{taskId ?? ''}</div>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Serial Number</label>
                      <input className="w-full rounded-md border px-3 py-2 text-sm" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} disabled={isCustomer} />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">Part Number</label>
                      <input className="w-full rounded-md border px-3 py-2 text-sm" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} disabled={isCustomer} />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">PO Number</label>
                      <input className="w-full rounded-md border px-3 py-2 text-sm" value={poNumber} onChange={(e) => setPoNumber(e.target.value)} disabled={isCustomer} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                    <div>
                      <label className="text-sm font-medium text-slate-700">Priority</label>
                      {loading ? (
                        <div className="text-sm text-slate-500">Loading priorities…</div>
                      ) : (
                        <select className="w-full rounded-md border px-3 py-2 text-sm" value={priorityId as any} onChange={(e) => setPriorityId(e.target.value ? Number(e.target.value) : '')} disabled={!canEditPriority}>
                          <option value="">(Not set)</option>
                          {priorities.map((p: any) => (
                            <option key={p.priority_id ?? p.id ?? p.value} value={p.priority_id ?? p.id ?? p.value}>
                              {p.level_name ?? p.name ?? p.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">Category {canEditCategory && '*'}</label>
                      {canEditCategory ? (
                        loading ? (
                          <div className="text-sm text-slate-500">Loading categories…</div>
                        ) : (
                          <select
                            className="w-full rounded-md border px-3 py-2 text-sm"
                            value={categoryId as any}
                            onChange={(e) => {
                              const newCatId = e.target.value ? Number(e.target.value) : '';
                              setCategoryId(newCatId);
                              // Update categoryName to match the selected category
                              if (newCatId && categories.length > 0) {
                                const found = categories.find((c: any) => Number(c.category_id ?? c.id ?? c.categoryId ?? c.value) === Number(newCatId));
                                if (found) {
                                  setCategoryName(found.category_name ?? found.name ?? found.title ?? found.label ?? String(newCatId));
                                }
                              } else {
                                setCategoryName('');
                              }
                            }}
                          >
                            <option value="">(Not set)</option>
                            {categories.map((c: any) => (
                              <option key={c.category_id ?? c.id ?? c.categoryId ?? c.value} value={c.category_id ?? c.id ?? c.categoryId ?? c.value}>
                                {c.category_name ?? c.name ?? c.title ?? c.label}
                              </option>
                            ))}
                          </select>
                        )
                      ) : (
                        <div className="inline-block px-2 py-1 bg-gray-100 text-gray-800 text-sm rounded">{categoryName || (categoryId ? String(categoryId) : 'N/A')}</div>
                      )}
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">Request Type</label>
                      <div className="inline-block px-2 py-1 bg-gray-100 text-gray-800 text-sm rounded">
                        {requestTypeName || (requestTypeId ? String(requestTypeId) : 'N/A')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Description *</h2>
                </div>
                <div className="p-6">
                  <textarea className="w-full rounded-md border px-3 py-2 text-sm" rows={6} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!canEditDescription} />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900">Comments & Updates</h2>
                  {existingComments.length > 0 && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setShowCommentsHistory(!showCommentsHistory)}>
                      {showCommentsHistory ? 'Hide' : 'Show'} History ({existingComments.length})
                    </Button>
                  )}
                </div>
                <div className="p-6 space-y-4">
                  {showCommentsHistory && existingComments.length > 0 && (
                    <div className="max-h-40 overflow-y-auto border rounded-md p-3 bg-gray-50">
                      <div className="space-y-2">
                        {existingComments.slice(0, 5).map((comment: any, index: number) => (
                          <div key={comment._uniqueKey || `comment-${index}-${Date.now()}`} className="text-sm border-b pb-2 last:border-b-0">
                            <div className="font-medium text-slate-600">
                              {comment.authorName || comment.author_name || 'System'} 
                              <span className="text-xs text-slate-400 ml-2">
                                {new Date(comment.createdAt || comment.created_at).toLocaleString()}
                              </span>
                            </div>
                            <div className="text-slate-700 mt-1">{comment.content || comment.comment_text}</div>
                          </div>
                        ))}
                        {existingComments.length > 5 && (
                          <div className="text-xs text-slate-500 text-center pt-2">
                            ... and {existingComments.length - 5} more comments
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!showHoldReasonPrompt && !showRejectionReasonPrompt && !showPauseReasonPrompt && (
                    <div>
                      <label className="text-sm font-medium text-slate-700">Add New Comment / Update</label>
                      <textarea 
                        className="w-full rounded-md border px-3 py-2 text-sm" 
                        rows={3} 
                        value={updateComment} 
                        onChange={(e) => setUpdateComment(e.target.value)} 
                        placeholder="Add a comment or update about this task..."
                        disabled={!canAddUpdateComment}
                      />
                      <div className="text-xs text-slate-500 mt-1">
                        {canAddUpdateComment 
                          ? 'This comment will be saved to the task history and visible to all users with access to this task.' 
                          : 'You do not have permission to add comments to this task.'
                        }
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Status & Timeline</h3>
                  <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${getStatusBadgeClass(status)}`}>
                    {status}
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Status 
                      {isShopTL && <span className="text-xs text-gray-500"> (Read-only)</span>}
                      {amendmentPending && <span className="text-xs text-blue-700"> (🔒 Locked - Amendment Pending)</span>}
                    </label>
                    <select 
                      className={`w-full rounded-md border px-3 py-2 text-sm ${amendmentPending ? 'bg-blue-50 border-blue-300 cursor-not-allowed' : ''} ${status === 'Pending TL Approval' ? 'bg-orange-50 border-orange-300' : ''}`}
                      value={status} 
                      onChange={(e) => handleStatusChange(e.target.value)} 
                      disabled={!canEditStatus || status === 'Pending TL Approval'}
                    >
                      <option>Pending</option>
                      <option>In Progress</option>
                      {/*<option>Blocked</option>*/}
                      {/*<option>On Hold</option>*/}
                      {/*<option>Paused</option>*/}
                      {/* CRITICAL: "Completed" is only shown if the user is allowed to complete this task.
                          - Engineers can always complete (goes through TL approval flow).
                          - TL/Director can only complete UNASSIGNED tasks.
                          - If task is assigned to an engineer, TL/Director cannot set it to Completed. */}
                      {canSetCompleted() && <option>Completed</option>}
                      <option>Rejected</option>
                      {status === 'Pending TL Approval' && (
                        <option>Pending TL Approval</option>
                      )}
                    </select>
                    {isShopTL && <div className="text-xs text-slate-500 mt-1">Shop TL cannot edit task status.</div>}
                    {amendmentPending && (
                      <div className="text-xs text-blue-700 mt-1 font-medium">
                        🔒 Status is locked until the amendment request ({getAmendmentStatusText()}) is approved or rejected by a Director.
                      </div>
                    )}
                    {status === 'Pending TL Approval' && (
                      <div className="text-xs text-orange-700 mt-1 font-medium">
                        ⏳ This task is awaiting TL/Director approval. {canApproveRejectCompletion ? 'Use the Approve/Reject section above to review.' : 'Status cannot be changed until the completion is approved or rejected.'}
                      </div>
                    )}
                    {/* CRITICAL: Info message for TL/Director when "Completed" is hidden because task is assigned */}
                    {isTLorDirector && isTaskAssigned() && !isEngineer && (
                      <div className="text-xs text-amber-700 mt-1 font-medium">
                        ⚠️ This task is assigned to an engineer. Only the assigned engineer can mark it as completed. You can pause, reject, put on hold, or reassign the task.
                      </div>
                    )}
                  </div>
                  {/* TIMEZONE FIX: the Task Assigned At reference is now shown
                      here, in the SAME timezone and format as Task Details →
                      Timeline, so the user can verify at a glance that Target
                      Completion is after the assignment moment. */}
                  <div>
                    <label className="text-sm font-medium text-slate-700">Task Assigned At</label>
                    <input
                      className="w-full rounded-md border px-3 py-2 text-sm bg-gray-100 cursor-not-allowed text-gray-600"
                      value={assignedAtLabel || 'Not yet assigned'}
                      disabled
                      readOnly
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Target Completion (Date &amp; Time)
                      {!canEditTargetDate && <span className="text-xs text-gray-500"> (Read-only)</span>}
                    </label>
                    {/* FORMAT CONSISTENCY FIX: the canonical value is rendered with the
                        SAME timezone-aware formatter as "Task Assigned At", so both read
                        e.g. "Aug 21, 2026 at 9:35:53 AM GMT+3" instead of the browser's
                        "08/21/2026 09:35 AM". */}
                    <input
                      className="w-full rounded-md border px-3 py-2 text-sm bg-gray-100 cursor-not-allowed text-gray-600"
                      value={targetCompletionLabel || 'Not set'}
                      disabled
                      readOnly
                    />

                    {/* Target Completion is a full timestamp: performance metrics
                        (Early / On-Time / Delayed) compare against date AND time.
                        Only Team Leaders / Directors can edit it — the native picker is
                        therefore rendered ONLY for them, as an editing control. */}
                    {canEditTargetDate && (
                      <div className="mt-2">
                        <label className="text-xs font-medium text-slate-600 mb-1 block">
                          Change Target Completion (date &amp; time picker)
                        </label>
                        <input
                          type="datetime-local"
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          value={targetCompletionDate ?? ''}
                          onChange={(e) => {
                            setTargetCompletionDate(e.target.value);
                            // A deliberate manual edit by a TL / Director always
                            // wins over the automatic recalculation.
                            setTargetManuallyEdited(true);
                            setTargetAutoRecalcNotice(null);
                          }}
                          /* Forward-only: the picker cannot reach a past date or the Task Assigned date. */
                          min={minTargetInputValue}
                        />
                      </div>
                    )}
                    <div className="text-xs text-slate-500 mt-1">
                      {canEditTargetDate
                        ? 'You can set both the target date and time. Saving never resets it to the Task Assigned date.'
                        : isShopTL
                          ? 'Shop TL cannot edit the target completion date or time. Your updates keep the existing target unchanged.'
                          : 'Editable only by Team Leaders / Directors. Your updates keep the existing target unchanged.'}
                    </div>
                   
                    {!targetCompletionDate && canEditTargetDate && (
                      <div className="text-xs text-amber-700 mt-1">
                        No target completion has been set yet. Leaving this empty keeps it unset — it will not default to the Task Assigned date.
                      </div>
                    )}
                    {canEditTargetDate && targetAutoRecalcNotice && (
                      <div className="mt-2 rounded-md border border-blue-300 bg-blue-50 p-2 text-xs text-blue-800">
                        🔄 {targetAutoRecalcNotice}
                      </div>
                    )}
                    {canEditTargetDate && isAssigningNow && targetDurationLoaded && targetDurationMs <= 0 && (
                      <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                        ⚠️ No target duration is configured for this category
                        {categoryName ? ` (${categoryName})` : ''}, so the deadline cannot be recalculated
                        automatically from the Task Assigned At time. Please set the Target Completion manually
                        before saving.
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Assignment</h3>
                </div>
                <div className="p-6 space-y-3">
                  <div>
                    <label className="text-sm font-medium text-gray-700">Assigned Engineer(s) {isShopTL && <span className="text-xs text-gray-500">(Read-only)</span>}</label>
                    {canEditAssigned ? (
                      <>
                        <select
                          multiple
                          className="w-full rounded-md border px-2 py-2 text-sm"
                          value={selectedEngineerIds.map(String)}
                          onChange={(e) => {
                            const opts = Array.from(e.target.selectedOptions).map(o => Number(o.value));
                            setSelectedEngineerIds(opts);
                            setFallbackAssignedNames([]);
                            // Mark a real (re)assignment so Target Completion is
                            // re-based on the new Task Assigned At moment.
                            setAssignmentTouched(true);
                          }}
                          size={6}
                        >
                          {engineers.map((eng) => (
                            <option key={eng.user_id} value={eng.user_id}>{eng.full_name}</option>
                          ))}
                        </select>
                        <div className="text-xs text-slate-500 mt-1">Hold Ctrl/Cmd to select multiple.</div>
                      </>
                    ) : (
                      <>
                        <input className="w-full rounded-md border px-3 py-2 text-sm" value={buildAssignedEngineerCsv() || 'Unassigned'} disabled />
                        {isShopTL && <div className="text-xs text-slate-500 mt-1">Shop TL cannot edit assigned engineers.</div>}
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Alerts</h3>
                </div>
                <div className="p-6">
                  {canToggleRevisionAlert ? (
                    <div className="flex items-start gap-3 p-3 bg-yellow-50 rounded-md border border-yellow-200">
                      <input
                        id="showRevisionAlert"
                        type="checkbox"
                        checked={showRevisionAlertToggle}
                        onChange={(e) => setShowRevisionAlertToggle(Boolean(e.target.checked))}
                        className="h-4 w-4 rounded border-slate-300 mt-0.5"
                      />
                      <div className="flex-1">
                        <label htmlFor="showRevisionAlert" className="text-sm font-medium text-slate-700">🚨 Show Alert to Task Initiator</label>
                        <div className="text-xs text-slate-500 mt-1">When enabled, the task initiator will see a prominent alert notification.</div>
                      </div>
                    </div>
                  ) : isShopTL ? (
                    <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={showRevisionAlertToggle}
                          disabled
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <label className="text-sm font-medium text-slate-700">Alert Status (Read-only)</label>
                      </div>
                      <div className="text-xs text-slate-500 mt-2">Shop TL can view but cannot modify alert settings.</div>
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">Only Team Leaders, Directors, and Engineers can manage alerts.</div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {error && <div className="text-sm text-red-700 bg-red-50 p-3 rounded border border-red-200">{error}</div>}
          {success && <div className="text-sm text-green-700 bg-green-50 p-3 rounded border border-green-200">{success}</div>}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : (showHoldReasonPrompt ? 'Submit Hold Request' : showRejectionReasonPrompt ? 'Submit Rejection' : showPauseReasonPrompt ? 'Pause Task' : 'Save Changes')}
            </Button>
          </div>
        </form>
      </DraggableDialogContent>
    </DraggableDialog>
  );
}