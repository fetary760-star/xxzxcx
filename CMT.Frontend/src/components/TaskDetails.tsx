'use client';

import React, { useEffect, useState, useMemo } from 'react';
import apiClient, { isExpectedValidationError } from '@/lib/api';
import AttachmentsModal from './AttachmentsModal';
import UpdateTaskModal from './UpdateTaskModal';
import AlertDetailsModal from './AlertDetailsModal';
import TaskUpdateHistory from './TaskUpdateHistory';
import { Edit, Paperclip, MessageCircle, AlertTriangle, Users, Calendar, Clock, User, Building, Download, RefreshCw, FileEdit, Copy, Phone } from 'lucide-react';
import ReopenedTaskBadge from './ReopenedTaskBadge';
import AmendmentStatusBadge from './AmendmentStatusBadge';
import { useAuth } from '@/lib/auth-context';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { useTimezone } from '@/lib/timezone-context';
import RequestAmendmentModal from '@/components/RequestAmendmentModal';
import AmendmentApprovalModal from '@/components/AmendmentApprovalModal';
import { validateFile, ACCEPT_STRING, MAX_FILE_SIZE_MB, ALLOWED_EXTENSIONS_DISPLAY } from '@/lib/file-validation';
import { normalizeToIso, timestampMs, resolveTargetCompletion } from '@/lib/datetime-utils';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * AMENDED — "Target Completion" time discrepancy fix (Timeline → Task Details)
 *
 * SYMPTOM
 *   Last Updated shows  "Aug 13, 2026 at 10:55:56 AM"
 *   Target Completion shows "Aug 13, 2026 at 6:08:59 AM"
 *   ...for the very same update, so the Target Completion looked like it was
 *   counting BACKWARDS instead of showing the latest, accurate value.
 *
 * ROOT CAUSE
 *   The .NET API serializes UpdatedAt WITH a UTC designator
 *   ("2026-08-13T10:55:56Z") but TargetCompletionDate WITHOUT one
 *   ("2026-08-13T06:08:59"). `new Date()` reads the first as UTC and the
 *   second as LOCAL time, so the two fields land on two different clocks and
 *   appear shifted by the timezone offset.
 *
 * FIX (2 parts, applied below)
 *   1. Every timestamp is pushed through `normalizeToIso()` BEFORE it reaches
 *      the timezone formatter, so a value with no offset is treated as UTC
 *      (which is what the backend actually stores). All Timeline fields are
 *      therefore converted exactly once, by the same rule.
 *   2. Target Completion resolves to the LATEST value — an extended / revised
 *      / effective target date wins over the stale original — and it is
 *      rendered with the SAME date+time formatter as Last Updated.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/**
 * ENHANCED TaskDetails Component
 *
 * CRITICAL FIX: Transfer functionality now works correctly for shop_tl and customer_personnel roles
 * - Automatically uses the logged-in user's assigned shop as the source shop
 * - Displays the user's shop name in the "From Shop" field
 * - Sends from_shop_id to backend in the transfer request payload
 */

type Attachment = {
  attachment_id?: any;
  file_path?: string;
  file_name?: string;
  uploaded_at?: string;
  uploader_name?: string;
};

type Comment = {
  comment_id?: number;
  id?: number;
  commentId?: number;
  content?: string;
  comment_text?: string;
  author_name?: string;
  created_at?: string | number | null;
  updated_at?: string | number | null;
  comment_type?: 'UserComment' | 'SystemComment' | 'InterventionRequest' | string;
};

// FIXED: Align Shop interface with API definition
type Shop = {
  id: number;
  shop_id?: number;
  shopId?: number;
  name: string;
  description?: string;
  location?: string;
  isActive?: boolean;
};

type UserShopInfo = {
  user_id: number;
  user_name: string;
  user_role: string;
  shop_id: number | null;
  shop_name: string | null;
  has_assigned_shop: boolean;
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SHARED SLA (CATEGORY TARGET DURATION) HELPERS
 * ───────────────────────────────────────────────────────────────────────────
 * ROOT CAUSE OF THE REPORTED DEFECT (Timeline vs Update Task):
 *   `Target Completion` is an SLA value = `Task Assigned At + category target
 *   duration`. It is auto-calculated at task CREATION time. When a Team Leader
 *   later assigns an engineer, the assignment clock restarts, but the STORED
 *   deadline was never re-based — so the persisted value can already have
 *   elapsed at the very instant of assignment:
 *
 *     Task Assigned At  : Aug 21, 2026 9:05:53 AM GMT+3
 *     Target Completion : Aug 21, 2026 9:05:00 AM GMT+3   ← impossible
 *
 *   `UpdateTaskModal` recalculates it on screen (+30 min → 09:35 AM), which is
 *   why the modal looked correct while Task Details printed the stale value.
 *
 * FIX: the helpers below are byte-for-byte identical to the ones used by
 * `UpdateTaskModal`. Keeping the SAME endpoints, the SAME matching rule and the
 * SAME arithmetic in both files guarantees the two screens can never disagree
 * about the effective Target Completion again.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Endpoints that expose the "Category Target Duration" configuration. */
const TARGET_DURATION_ENDPOINTS = [
  '/api/management/target-days',
  '/api/reference-data/target-days',
];

/**
 * Locate the target-duration row that applies to this task. Matches on category
 * id first (authoritative) and falls back to category name so legacy rows
 * without ids still resolve.
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

function canonicalizeRole(raw: any): string {
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'number') {
    const map: Record<string, string> = { 0: 'team_leader', 1: 'director', 2: 'engineer', 3: 'customer', 4: 'customer_personnel', 5: 'shop_tl' }
    return map[String(raw)] ?? String(raw)
  }
  return String(raw).trim().toLowerCase().replace(/[\s\-_]+/g, '_')
}

function parseAmendmentStatus(raw: any): number {
  if (raw === null || raw === undefined) return 0
  if (typeof raw === 'number' && !isNaN(raw)) return Number(raw)
  const v = String(raw).trim().toLowerCase()
  if (v === '') return 0
  if (v.includes('pending') && v.includes('tl')) return 1
  if (v.includes('pending')) return 1
  if (v.includes('approved') || v.includes('approve')) return 2
  if (v.includes('rejected') || v.includes('reject')) return 3
  if (v.includes('forward') && v.includes('director')) return 4
  const n = Number(raw)
  if (!isNaN(n)) return n
  return 0
}

export default function TaskDetails({ taskId, task: incomingTask }: { taskId?: number; task?: any }) {
  const { user } = useAuth();
  const { canManageTransfers, canRequestAmendment } = useRolePermissions();
  const { formatDate: tzFormatDate, formatDateTime: tzFormatDateTime, formatDateCustom: tzFormatDateCustom } = useTimezone();

  const [task, setTask] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  const [updateOpen, setUpdateOpen] = useState(false);

  // Enhanced comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);

  // inline upload state
  const [newFile, setNewFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // FIXED: Transfer modal state with user shop info
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferToShop, setTransferToShop] = useState<number | ''>('');
  const [transferComments, setTransferComments] = useState('');
  const [shops, setShops] = useState<Shop[]>([]);
  const [loadingShops, setLoadingShops] = useState(false);
  const [userShopInfo, setUserShopInfo] = useState<UserShopInfo | null>(null);
  const [loadingUserShop, setLoadingUserShop] = useState(false);

  // Enhanced intervention modal state
  const [interventionOpen, setInterventionOpen] = useState(false);
  const [interventionText, setInterventionText] = useState('');
  const [interventionLoading, setInterventionLoading] = useState(false);

  // User role and permissions (get from auth context)
  const [currentUser, setCurrentUser] = useState<any>(null);

  // FIXED: Add download state for attachments
  const [downloadingAttachment, setDownloadingAttachment] = useState<number | null>(null);

  // NEW: Alert details modal state
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [selectedAlertType, setSelectedAlertType] = useState<'revision' | 'reopened' | 'amendment' | 'duplicate' | null>(null);

  // NEW: Amendment/request review modal state
  const [requestAmendmentOpen, setRequestAmendmentOpen] = useState(false);
  const [amendmentApprovalOpen, setAmendmentApprovalOpen] = useState(false);

  /**
   * NEW: "Category Target Duration" configuration (target days / hours /
   * minutes per category) — the SAME source of truth the Update Task screen
   * uses. Without it, Task Details could only print the stale stored deadline,
   * which is exactly what produced the reported inconsistency between the two
   * views for the very same task.
   */
  const [targetDurationConfig, setTargetDurationConfig] = useState<any[]>([]);
  const [targetDurationLoaded, setTargetDurationLoaded] = useState<boolean>(false);

  // NEW: Track locally-requested amendments persistently
  const [requestedAmendments, setRequestedAmendments] = useState<Set<number>>(new Set())
  const STORAGE_KEY = 'requestedAmendments'

  // Helper to compute a stable fallback key for list items
  const stableKey = (obj: any, fallbackPrefix: string, idx: number) => {
    if (!obj) return `${fallbackPrefix}-${idx}`;
    return (
      obj.comment_id ??
      obj.id ??
      obj.commentId ??
      obj.attachment_id ??
      obj.attachmentId ??
      obj.file_name ??
      `${fallbackPrefix}-${idx}`
    );
  };

  // FIXED: Timezone-aware date formatting using reactive useTimezone() hook
  // This ensures dates update immediately when the user changes timezone in Settings.
  // FIX PART 1: normalize the raw API value to a real ISO-8601 UTC string first.
  // Without this, "2026-08-13T06:08:59" (no "Z") is misread as LOCAL time while
  // "2026-08-13T10:55:56Z" is read as UTC — which is exactly what made Target
  // Completion appear earlier than the Last Updated timestamp.
  function formatDate(input?: string | number | null, opts?: { dateOnly?: boolean; includeTime?: boolean }) {
    const iso = normalizeToIso(input);
    if (!iso) return '—';
    const formatted = opts?.dateOnly ? tzFormatDate(iso) : tzFormatDateTime(iso);
    return !formatted || formatted === '—' ? '—' : formatted;
  }

  /**
   * FIX PART 2 — load the Category Target Duration configuration.
   *
   * This is the SAME configuration (and the same endpoints, in the same order)
   * that `UpdateTaskModal` loads. The management endpoint is tried first
   * (TL / Director / Engineer) and the reference-data endpoint is used as a
   * fallback, mirroring the Completed Tasks page.
   *
   * Without this data Task Details could only print the raw stored deadline —
   * which is precisely why it showed an already-elapsed Target Completion while
   * the Update Task screen showed the corrected one.
   */
  useEffect(() => {
    let mounted = true;

    const loadTargetDuration = async () => {
      for (const url of TARGET_DURATION_ENDPOINTS) {
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
        } catch (e) {
          console.warn(`[TaskDetails] Failed to load target duration from ${url}`, e);
        }
      }
      if (mounted) {
        setTargetDurationConfig([]);
        setTargetDurationLoaded(true);
      }
    };

    void loadTargetDuration();
    return () => { mounted = false; };
  }, []);

  /**
   * FIX PART 3: resolve the LATEST + accurate Target Completion, using EXACTLY
   * the rule applied by the Update Task screen.
   *
   * Resolution order
   *   a) Collect every naming variant the API may use (effective / extended /
   *      revised / new / current / original) and normalize each one to UTC, so
   *      a value serialized without a "Z" can never sit on a different clock.
   *   b) PRIORITY (not "biggest wins"): explicit effective → extension →
   *      current → original. The previous version simply picked the LARGEST
   *      timestamp among every candidate, so when
   *      `original_target_completion_date` happened to be later than the live
   *      value the STALE original was displayed instead of the real deadline.
   *      An extension is now only preferred when it truly is later than the
   *      current value.
   *   c) SLA RE-BASE (the actual fix for the reported ticket): when the resolved
   *      deadline is missing, or lands ON/BEFORE the actual Task Assigned At
   *      moment, it is recalculated as
   *          Task Assigned At + configured category target duration
   *      — the same formula the backend uses at creation time and the same one
   *      the Update Task modal applies before saving. Both views therefore
   *      always render ONE identical value.
   */
  const targetCompletionInfo = useMemo(() => {
    const empty = {
      effective: null as string | null,
      stored: null as string | null,
      original: null as string | null,
      assignedAt: null as string | null,
      isExtended: false,
      isRecalculated: false,
      durationMs: 0,
      durationLabel: '',
    };
    if (!task) return empty;

    // Merge the raw payload (camelCase / PascalCase keys) with the normalized
    // task (snake_case keys) so every naming variant is considered.
    const source = { ...(task.raw ?? {}), ...task };
    const resolved = resolveTargetCompletion(source);

    const currentMs = timestampMs(resolved.current);
    const extendedMs = timestampMs(resolved.extended);

    const preferExtension =
      extendedMs !== null && (currentMs === null || extendedMs > currentMs);

    /** The deadline as it is CURRENTLY PERSISTED (already normalized to UTC). */
    const stored =
      normalizeToIso(resolved.effective) ??
      (preferExtension ? normalizeToIso(resolved.extended) : null) ??
      normalizeToIso(resolved.current) ??
      normalizeToIso(resolved.original);

    // Both operands are normalized UTC instants — never raw strings.
    const assignedAt = normalizeToIso(task.task_assigned_at);
    const assignedMs = timestampMs(assignedAt);
    const storedMs = timestampMs(stored);

    // Configured SLA duration for this task's category (id first, name fallback).
    const categoryIdForLookup =
      task.category_id ??
      source.category_id ??
      source.categoryId ??
      source.CategoryId ??
      '';
    const entry = findTargetDurationEntry(
      targetDurationConfig,
      categoryIdForLookup,
      task.category_name ?? source.category_name ?? source.categoryName ?? ''
    );
    const durationMs = targetDurationEntryToMs(entry);
    const durationLabel = formatDurationMs(durationMs);

    /**
     * The stored deadline is "stale" when the task HAS been assigned and the
     * deadline is missing or already elapsed at the assignment moment — i.e.
     * precisely the reported "Target Completion before Task Assigned At" state.
     */
    const storedIsStale = assignedMs !== null && (storedMs === null || storedMs <= assignedMs);
    const canRecalculate = storedIsStale && durationMs > 0 && assignedMs !== null;

    const recalculated = canRecalculate
      ? new Date(assignedMs + durationMs).toISOString()
      : null;

    const effective = recalculated ?? stored;

    const effectiveMs = timestampMs(effective);
    const originalMs = timestampMs(resolved.original);

    return {
      effective,
      stored,
      original: resolved.original,
      assignedAt,
      isExtended: Boolean(
        resolved.original &&
          effective &&
          !recalculated &&
          originalMs !== null &&
          effectiveMs !== null &&
          effectiveMs > originalMs
      ),
      isRecalculated: Boolean(recalculated),
      durationMs,
      durationLabel,
    };
  }, [task, targetDurationConfig]);

  /**
   * ───────────────────────────────────────────────────────────────────────────
   * TIMELINE CONSISTENCY CHECK — "Target Completion before Task Assigned At"
   * ───────────────────────────────────────────────────────────────────────────
   * Both timestamps are compared as NORMALIZED UTC instants (never as raw
   * strings), so a value serialized without a "Z" can no longer look
   * timezone-offset hours away from one that has it. When the stored deadline
   * genuinely precedes the assignment moment we surface it explicitly instead
   * of silently rendering an impossible timeline.
   */
  const timelineOrderIssue = useMemo(() => {
    const assignedMs = timestampMs(task?.task_assigned_at);
    const targetMs = timestampMs(targetCompletionInfo.effective ?? task?.target_completion_date);
    if (assignedMs === null || targetMs === null) return null;
    if (targetMs > assignedMs) return null;
    return { assignedMs, targetMs };
  }, [task, targetCompletionInfo.effective]);

  /**
   * CRITICAL FIX: Convert any hardcoded UTC timestamps embedded in comment text
   * to the user's preferred timezone. This handles legacy comments that were stored
   * with timestamps like "at 2026-03-15 14:30:00 UTC" or "on 2026-03-15 14:30:00 UTC".
   * 
   * Pattern matches:
   *   "at YYYY-MM-DD HH:MM:SS UTC"
   *   "on YYYY-MM-DD HH:MM:SS UTC"
   */
  function convertEmbeddedUtcTimestamps(text: string): string {
    if (!text) return text;
    // Match patterns like "at 2026-03-15 14:30:00 UTC" or "on 2026-03-15 14:30:00 UTC"
    const utcPattern = /\b(at|on)\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+UTC\b/gi;
    return text.replace(utcPattern, (_match, preposition, datePart, timePart) => {
      try {
        const isoString = `${datePart}T${timePart}Z`; // Treat as UTC
        const formatted = tzFormatDateTime(isoString);
        if (formatted && formatted !== '—') {
          return `${preposition} ${formatted}`;
        }
      } catch {
        // If parsing fails, return original text
      }
      return _match;
    });
  }

  // Determine whether this intervention will be escalated immediately to Director.
  const existingInterventionCount = comments?.filter((c) => {
    const t = String(c?.comment_type ?? '').toLowerCase();
    return t === 'interventionrequest' || t.includes('intervention');
  }).length ?? 0;

  const willEscalateImmediately = existingInterventionCount >= 1;

  // Load current user (prefer auth context)
  useEffect(() => {
    if (user) {
      setCurrentUser(user);
    } else {
      // fallback to API
      void (async () => {
        try {
          const userData = await apiClient.getCurrentUser().catch(() => null);
          if (userData) setCurrentUser(userData);
        } catch (e) {
          // ignore
        }
      })();
    }
  }, [user]);

  // FIXED: Load user's shop info and shops list when transfer modal opens
  useEffect(() => {
    if (transferOpen) {
      if (shops.length === 0) {
        loadShopsFromDatabase();
      }
      if (!userShopInfo) {
        loadUserShopInfo();
      }
    }
  }, [transferOpen]);

  async function loadShopsFromDatabase() {
    setLoadingShops(true);
    try {
      const shopsData = await apiClient.getShops();
      setShops(shopsData || []);
    } catch (error) {
      console.error('Failed to load shops:', error);
      setErr('Failed to load shops. Please try again.');
      setShops([]);
    } finally {
      setLoadingShops(false);
    }
  }

  async function loadUserShopInfo() {
    setLoadingUserShop(true);
    try {
      const response = await apiClient.get('/transfers/current-user-shop');
      setUserShopInfo(response);
    } catch (error) {
      console.error('Failed to load user shop info:', error);
      setUserShopInfo(null);
    } finally {
      setLoadingUserShop(false);
    }
  }

  // Persist helper functions for requestedAmendments (localStorage)
  const loadRequestedAmendmentsFromStorage = React.useCallback(() => {
    try {
      if (typeof window === 'undefined') return new Set<number>()
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return new Set<number>()
      const arr = JSON.parse(raw)
      if (!Array.isArray(arr)) return new Set<number>()
      return new Set<number>(arr.map((n: any) => Number(n)).filter((n: number) => !Number.isNaN(n)))
    } catch (e) {
      console.error('Failed to load requestedAmendments from storage', e)
      return new Set<number>()
    }
  }, [])

  const persistRequestedAmendmentsToStorage = React.useCallback((s: Set<number>) => {
    try {
      if (typeof window === 'undefined') return
      const arr = Array.from(s.values())
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
    } catch (e) {
      console.error('Failed to persist requestedAmendments to storage', e)
    }
  }, [])

  // Initialize requestedAmendments from storage once
  useEffect(() => {
    const setFromStorage = loadRequestedAmendmentsFromStorage()
    setRequestedAmendments(setFromStorage)
  }, [loadRequestedAmendmentsFromStorage])

  // Role-based permission checks
  const canRequestIntervention = () => {
    if (!currentUser || !task) return false;

    const restrictedRoles = ['team_lead', 'team_leader', 'director'];
    const userRole = String(currentUser.role ?? '').toLowerCase();

    if (task.status === 'Completed') return false;
    if (restrictedRoles.includes(userRole)) return false;

    return true;
  };

  // FIXED: Detect if task is completed - prioritize explicit flag
  function isCompletedTask(taskData: any): boolean {
    if (!taskData) return false;
    
    // PRIORITY 1: Check explicit flag from parent component (e.g., completed tasks page)
    if (taskData.is_completed_task === true || taskData.isCompleted === true) {
      return true;
    }
    
    // PRIORITY 2: Check if it has completed_task_id (from completed_tasks table)
    if (taskData.completed_task_id || taskData.completedTaskId) {
      return true;
    }
    
    // PRIORITY 3: Check if original_task_id exists (indicates it's from completed_tasks table)
    if (taskData.original_task_id || taskData.originalTaskId) {
      return true;
    }
    
    // PRIORITY 4: Check status
    const status = taskData.status ?? taskData.Status ?? '';
    if (String(status).toLowerCase() === 'completed' || String(status).toLowerCase() === 'done') {
      if (taskData.moved_to_completed_at || taskData.movedToCompletedAt || taskData.completed_at || taskData.completedAt) {
        return true;
      }
    }
    
    return false;
  }

  // CRITICAL Fix: Improved normalizePayload to properly extract ShopName with comprehensive fallback chain
  function normalizePayload(raw: any, isCompleted = false) {
    const t = raw ?? {};
    let normalizedStatus = 'Pending';
    
    if (isCompleted) {
      normalizedStatus = 'Completed';
    } else {
      const rawStatus = t.status ?? t.task_status ?? t.Status ?? 0;
      if (typeof rawStatus === 'number') {
        switch (rawStatus) {
          case 0: normalizedStatus = 'Pending'; break;
          case 1: normalizedStatus = 'In Progress'; break;
          case 2: normalizedStatus = 'Completed'; break;
          case 3: normalizedStatus = 'Blocked'; break;
          case 4: normalizedStatus = 'On Hold'; break;
          case 5: normalizedStatus = 'Rejected'; break;
          case 6: normalizedStatus = 'Cancelled'; break;
          case 7: normalizedStatus = 'Paused'; break;
          default: normalizedStatus = 'Pending';
        }
      } else {
        const statusStr = String(rawStatus).toLowerCase().replace(/[_\s-]+/g, '');
        switch (statusStr) {
          case 'pending': normalizedStatus = 'Pending'; break;
          case 'inprogress': normalizedStatus = 'In Progress'; break;
          case 'completed': normalizedStatus = 'Completed'; break;
          case 'blocked': normalizedStatus = 'Blocked'; break;
          case 'onhold': normalizedStatus = 'On Hold'; break;
          case 'rejected': normalizedStatus = 'Rejected'; break;
          case 'cancelled': normalizedStatus = 'Cancelled'; break;
          case 'paused': normalizedStatus = 'Paused'; break;
          default: normalizedStatus = 'Pending';
        }
      }
    }

    // CRITICAL FIX: Enhanced extraction of original_task_id with comprehensive fallbacks
    let extractedOriginalTaskId = null;
    
    const possibleFields = [
      'original_task_id',
      'originalTaskId', 
      'OriginalTaskId',
      'original_id',
      'originalId'
    ];
    
    for (const field of possibleFields) {
      if (t[field] !== undefined && t[field] !== null) {
        extractedOriginalTaskId = Number(t[field]);
        break;
      }
    }
    
    if (!extractedOriginalTaskId && isCompleted) {
      const taskIdValue = t.task_id ?? t.id ?? t.taskId;
      if (taskIdValue) {
        extractedOriginalTaskId = Number(taskIdValue);
      }
    }

    // CRITICAL FIX: Comprehensive ShopName extraction with proper fallback chain
    let extractedShopName = null;
    
    if (t.ShopName && String(t.ShopName).trim() !== '') {
      extractedShopName = t.ShopName;
      ('[TaskDetails] ShopName extracted from t.ShopName (PascalCase):', extractedShopName);
    } else if (t.shopName && String(t.shopName).trim() !== '') {
      extractedShopName = t.shopName;
      ('[TaskDetails] ShopName extracted from t.shopName (camelCase):', extractedShopName);
    } else if (t.shop_name && String(t.shop_name).trim() !== '') {
      extractedShopName = t.shop_name;
      ('[TaskDetails] ShopName extracted from t.shop_name (snake_case):', extractedShopName);
    } else if (t.shop?.name && String(t.shop.name).trim() !== '') {
      extractedShopName = t.shop.name;
      ('[TaskDetails] ShopName extracted from t.shop.name:', extractedShopName);
    } else if (t.Shop?.Name && String(t.Shop.Name).trim() !== '') {
      extractedShopName = t.Shop.Name;
      ('[TaskDetails] ShopName extracted from t.Shop.Name:', extractedShopName);
    } else if (t.current_shop && String(t.current_shop).trim() !== '') {
      extractedShopName = t.current_shop;
      ('[TaskDetails] ShopName extracted from t.current_shop:', extractedShopName);
    } else if (t.shop_name_display && String(t.shop_name_display).trim() !== '') {
      extractedShopName = t.shop_name_display;
      ('[TaskDetails] ShopName extracted from t.shop_name_display:', extractedShopName);
    } else {
      console.warn('[TaskDetails] ShopName not found in any expected field. Available fields:', Object.keys(t));
    }

    const normalized: any = {
      task_id: Number(t.task_id ?? t.id ?? t.taskId ?? t.TaskId ?? taskId ?? 0),
      completed_task_id: t.completed_task_id ?? t.completedTaskId ?? t.CompletedTaskId ?? null,
      original_task_id: extractedOriginalTaskId,
      serial_number: t.serial_number ?? t.serialNumber ?? t.SerialNumber ?? '',
      part_number: t.part_number ?? t.partNumber ?? t.PartNumber ?? '',
      po_number: t.po_number ?? t.poNumber ?? t.PoNumber ?? '',
      description: t.description ?? t.Description ?? t.details ?? '',
      assigned_engineer: t.assigned_engineer ?? t.assigned ?? t.assignedEngineer ?? t.AssignedEngineer ?? '',
      priority_level_name: t.priority_level_name ?? t.priority ?? t.priority_name ?? t.priorityLevelName ?? t.PriorityName ?? '',
      creator_name: t.creator_name ?? t.created_by_name ?? t.createdByName ?? t.CreatedByName ?? t.creator ?? '',
      created_by: t.created_by ?? t.createdBy ?? t.CreatedBy ?? t.creator_id ?? null,
      created_at: t.created_at ?? t.createdAt ?? t.CreatedAt ?? t.task_created_at ?? t.taskCreatedAt ?? t.TaskCreatedAt ?? '',
      updated_at: t.updated_at ?? t.last_update_date ?? t.updatedAt ?? t.UpdatedAt ?? t.task_updated_at ?? t.taskUpdatedAt ?? t.TaskUpdatedAt ?? '',
      status: normalizedStatus,
      shop_id: t.shop_id ?? t.shopId ?? t.ShopId ?? t.shop ?? null,
            shop_name: extractedShopName,
      phone_extension: t.phone_extension ?? t.phoneExtension ?? t.PhoneExtension ?? t.phone_ext ?? null,
      engineer_phone_number: t.engineer_phone_number ?? t.engineerPhoneNumber ?? t.EngineerPhoneNumber ?? t.assigned_engineer_phone ?? t.assignedEngineerPhone ?? null,
      creator_phone_number: t.creator_phone_number ?? t.creatorPhoneNumber ?? t.CreatorPhoneNumber ?? t.created_by_phone ?? t.createdByPhone ?? t.team_leader_phone ?? t.teamLeaderPhone ?? t.phone_extension ?? t.phoneExtension ?? t.PhoneExtension ?? t.phone_ext ?? null,


      /**
       * NEW: `category_id` is now carried through the normalization step.
       *
       * WHY THIS MATTERS FOR THE REPORTED BUG: both this screen and the Update
       * Task modal resolve the SLA "target duration" BY CATEGORY. Previously
       * only `category_name` survived normalization, so the lookup silently fell
       * back to a name match — and failed for any category whose display name
       * differs from the configuration row, leaving the stale (already elapsed)
       * deadline visible in the Timeline.
       */
      category_id: t.category_id ?? t.categoryId ?? t.CategoryId ?? t.category?.id ?? null,
      category_name: t.category_name ?? t.category ?? t.categoryName ?? t.CategoryName ?? t.category_name_display ?? '',
      sub_type_name: t.sub_type_name ?? t.subTypeName ?? t.SubTypeName ?? t.sub_type ?? t.sub_type_name_display ?? '',
      request_type_name: t.request_type_name ?? t.requestTypeName ?? t.RequestTypeName ?? t.request_type ?? t.request_type_name_display ?? '',

      revision_notes: t.revision_notes ?? t.revisionNotes ?? t.RevisionNotes ?? t.revision ?? '',
      show_revision_alert: Boolean(t.show_revision_alert ?? t.showRevisionAlert ?? t.ShowRevisionAlert ?? t.show_revision ?? false),

      comments: t.comments ?? t.Comments ?? t.initial_comments ?? t.initial_comment ?? t.notes ?? '',
      estimated_completion_date: t.estimated_completion_date ?? t.estimatedCompletionDate ?? t.EstimatedCompletionDate ?? t.estimated_completion ?? '',
      target_completion_date: t.target_completion_date ?? t.targetCompletionDate ?? t.TargetCompletionDate ?? t.target_completion ?? '',
      actual_completion_date: t.actual_completion_date ?? t.actualCompletionDate ?? t.ActualCompletionDate ?? t.actual_completion ?? t.completed_at ?? t.CompletedAt ?? '',
      engineer_completed_at: t.engineerCompletedAt ?? t.engineer_completed_at ?? t.EngineerCompletedAt ?? t.engineerCompleted ?? t.engineer_completed ?? t.raw?.engineerCompletedAt ?? t.raw?.engineer_completed_at ?? t.raw?.EngineerCompletedAt ?? null,
      tl_approved_at: t.tlApprovalDate ?? t.TlApprovalDate ?? t.tl_approval_date ?? t.tl_approved_at ?? t.TlApprovedAt ?? t.approved_at ?? t.ApprovedAt ?? t.raw?.tlApprovalDate ?? t.raw?.TlApprovalDate ?? t.raw?.tl_approval_date ?? t.raw?.tl_approved_at ?? null,
      // NEW: Task Assigned At — timestamp when a Team Leader first assigned an
      // engineer to this task (via UpdateTaskModal). Used as the START of the
      // Variance calculation in the Completed Tasks CSV export. Backend field:
      // TaskDto.AssignedAt (auto-set by TaskController on first engineer assignment).
      task_assigned_at: t.task_assigned_at ?? t.taskAssignedAt ?? t.TaskAssignedAt ?? t.assigned_at ?? t.assignedAt ?? t.AssignedAt ?? t.raw?.taskAssignedAt ?? t.raw?.TaskAssignedAt ?? t.raw?.assignedAt ?? t.raw?.AssignedAt ?? null,
      moved_to_completed_at: t.movedToCompletedAt ?? t.MovedToCompletedAt ?? t.moved_to_completed_at ?? t.raw?.movedToCompletedAt ?? t.raw?.MovedToCompletedAt ?? t.raw?.moved_to_completed_at ?? null,
      attachment_path: t.attachment_path ?? t.attachment ?? t.attachmentPath ?? t.AttachmentPath ?? t.file ?? '',
      attachments_count: t.attachments_count ?? t.attachmentsCount ?? t.AttachmentsCount ?? (Array.isArray(t.attachments) ? t.attachments.length : 0),

      is_reopened: Boolean(t.is_reopened ?? t.isReopened ?? t.IsReopened ?? false),
      reopen_count: Number(t.reopen_count ?? t.reopenCount ?? t.ReopenCount ?? 0),
      reopen_reason: t.reopen_reason ?? t.reopenReason ?? t.ReopenReason ?? null,
      reopened_at: t.reopened_at ?? t.reopenedAt ?? t.ReopenedAt ?? null,
      reopened_by: t.reopened_by ?? t.reopenedBy ?? t.ReopenedBy ?? null,

      amendment_request: Boolean(t.amendment_request ?? t.amendmentRequest ?? t.AmendmentRequest ?? false),
      amendment_status: t.amendment_status ?? t.amendmentStatus ?? t.AmendmentStatus ?? null,
      amendment_reason: t.amendment_reason ?? t.amendmentReason ?? t.AmendmentReason ?? '',
      amendment_reviewed_by_tl_id: t.amendment_reviewed_by_tl_id ?? t.amendmentReviewedByTlId ?? t.AmendmentReviewedByTlId ?? null,
      amendment_reviewed_by_director_id: t.amendment_reviewed_by_director_id ?? t.amendmentReviewedByDirectorId ?? t.AmendmentReviewedByDirectorId ?? null,

      is_duplicate: Boolean(t.is_duplicate ?? t.isDuplicate ?? t.IsDuplicate ?? false),
      duplicate_justification: t.duplicate_justification ?? t.duplicateJustification ?? t.DuplicateJustification ?? null,

      is_completed_task: Boolean(isCompleted),
      raw: t,
    };

    ('[TaskDetails] Normalized task:', {
      task_id: normalized.task_id,
      shop_id: normalized.shop_id,
      shop_name: normalized.shop_name,
      extractedFrom: extractedShopName ? 'found' : 'not found'
    });

    return normalized;
  }

  // Robustly extract an array of attachments from various possible shapes
  function extractAttachmentArray(res: any) {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res.attachments)) return res.attachments;
    if (Array.isArray(res.data)) return res.data;
    if (Array.isArray(res.items)) return res.items;
    if (res.data && Array.isArray(res.data.data)) return res.data.data;
    if (res.data && Array.isArray(res.data.attachments)) return res.data.attachments;
    if (res.attachments && res.attachments.data && Array.isArray(res.attachments.data)) return res.attachments.data;
    return [];
  }

  // FIXED: Load attachments using apiClient for proper auth — multi-strategy for completed tasks
  async function loadAttachmentsFor(id: number | undefined, isCompleted: boolean = false) {
    if (!id) {
      setAttachments([]);
      return;
    }

    const normalizeAttachmentList = (data: any) => {
      const list = extractAttachmentArray(data);
      return (list || []).map((a: any) => ({
        attachment_id: a.attachment_id ?? a.id ?? a.attachmentId ?? null,
        file_path: a.file_path ?? a.filePath ?? a.file ?? a.path ?? a.url ?? '',
        file_name:
          a.file_name ??
          a.fileName ??
          a.name ??
          (a.file_path || a.file || a.path || a.url ? String(a.file_path ?? a.file ?? a.path ?? a.url).split('/').pop() : ''),
        uploaded_at: a.uploaded_at ?? a.created_at ?? a.createdAt ?? a.uploadedAt ?? null,
        uploader_name: a.uploader_name ?? a.uploaded_by_name ?? a.uploader ?? a.uploadedByName ?? null,
      }));
    };

    try {
      let data: any = null;
      let attachmentsList: Attachment[] = [];

      if (isCompleted) {
        // STRATEGY 1: Try completed task attachments endpoint
        try {
          data = await apiClient.get(`/tasks/completed/${id}/attachments`);
          attachmentsList = normalizeAttachmentList(data);
        } catch {}

        // STRATEGY 2: If no results, try the regular task endpoint with the same ID
        // (backend may still serve attachments under the original task ID)
        if (attachmentsList.length === 0) {
          try {
            data = await apiClient.get(`/tasks/${id}/attachments`);
            attachmentsList = normalizeAttachmentList(data);
          } catch {}
        }

        // STRATEGY 3: If we have original_task_id and it differs, try that
        const origId = task?.original_task_id ?? task?.task_id;
        if (attachmentsList.length === 0 && origId && Number(origId) !== Number(id)) {
          try {
            data = await apiClient.get(`/tasks/${origId}/attachments`);
            attachmentsList = normalizeAttachmentList(data);
          } catch {}
        }

        // STRATEGY 4: If we have completed_task_id and it differs from id, try that
        const completedId = task?.completed_task_id;
        if (attachmentsList.length === 0 && completedId && Number(completedId) !== Number(id)) {
          try {
            data = await apiClient.get(`/tasks/completed/${completedId}/attachments`);
            attachmentsList = normalizeAttachmentList(data);
          } catch {}
        }
      } else {
        data = await apiClient.get(`/tasks/${id}/attachments`);
        attachmentsList = normalizeAttachmentList(data);
      }

      setAttachments(attachmentsList);
    } catch (e) {
      console.error('[TaskDetails] Failed to load attachments:', e);
      setAttachments([]);
      if ((e as any)?.status === 401) {
        setErr('You are not authorized to view attachments. Please sign in again.');
      }
    }
  }

  // FIXED: Load comments using apiClient for proper auth — multi-strategy for completed tasks
  async function loadCommentsFor(id: number | undefined, isCompleted: boolean = false) {
    if (!id) { setComments([]); return; }
    setLoadingComments(true);

    const normalizeCommentsList = (data: any): Comment[] => {
      if (!data) return [];
      const commentsList = Array.isArray(data) ? data : data?.comments ?? data?.data ?? [];
      return commentsList.map((c: any) => ({
        comment_id: c.comment_id ?? c.commentId ?? c.id,
        content: c.content ?? c.comment_text ?? c.commentText ?? '',
        author_name: c.author_name ?? c.authorName ?? 'System',
        created_at: c.created_at ?? c.createdAt,
        updated_at: c.updated_at ?? c.updatedAt,
        comment_type: c.comment_type ?? c.commentType ?? 'UserComment',
      }));
    };

    try {
      let normalizedComments: Comment[] = [];

      if (isCompleted) {
        // STRATEGY 1: Try regular task comments endpoint with the provided id
        // (backend often keeps comments under the original task_id even after completion)
        try {
          const data = await apiClient.get(`/tasks/${id}/comments`);
          normalizedComments = normalizeCommentsList(data);
        } catch {}

        // STRATEGY 2: Try completed task comments endpoint
        const completedTaskId = task?.completed_task_id ?? task?.completedTaskId;
        if (normalizedComments.length === 0 && completedTaskId) {
          try {
            const data = await apiClient.get(`/tasks/completed/${completedTaskId}/comments`);
            const result = normalizeCommentsList(data);
            if (result.length > 0) normalizedComments = result;
          } catch {}
        }

        // STRATEGY 3: Try with completed task id directly if it differs
        if (normalizedComments.length === 0 && completedTaskId && Number(completedTaskId) !== Number(id)) {
          try {
            const data = await apiClient.get(`/tasks/${completedTaskId}/comments`);
            const result = normalizeCommentsList(data);
            if (result.length > 0) normalizedComments = result;
          } catch {}
        }

        // STRATEGY 4: Try original_task_id if it differs from id
        const origId = task?.original_task_id;
        if (normalizedComments.length === 0 && origId && Number(origId) !== Number(id)) {
          try {
            const data = await apiClient.get(`/tasks/${origId}/comments`);
            const result = normalizeCommentsList(data);
            if (result.length > 0) normalizedComments = result;
          } catch {}
        }
      } else {
        // Active task — straightforward
        const data = await apiClient.get(`/tasks/${id}/comments`);
        normalizedComments = normalizeCommentsList(data);
      }

      setComments(normalizedComments);
    } catch (error) {
      console.error('[TaskDetails] Failed to load comments:', error);
      setComments([]);
      if ((error as any)?.status === 401) {
        setErr('You are not authorized. Please sign in again.');
      }
    } finally {
      setLoadingComments(false);
    }
  }

  // FIXED: Load task with proper completed task detection
  async function loadTaskById(id?: number) {
    if (!id) return null;
    setLoading(true);
    setErr(null);
    
    try {
      let res: any;
      let isCompleted = false;

      // First try to get from active tasks
      try {
        res = await apiClient.getTask(id);
        ('[TaskDetails] Loaded task from active tasks:', res);
      } catch (firstError: any) {
        // If not found in active tasks, try completed tasks
        if (firstError?.status === 404 || (firstError?.message && String(firstError.message).includes('404'))) {
          const completedRes = await apiClient.getCompletedTasks({ pageNumber: 1, pageSize: 1000 });
          const completedList = Array.isArray(completedRes) ? completedRes : completedRes?.tasks ?? completedRes?.data ?? [];
          const completedTask = completedList.find((t: any) => {
            const originalId = t.original_task_id ?? t.originalTaskId ?? t.OriginalTaskId;
            return Number(originalId) === Number(id);
          });
          
          if (completedTask) {
            res = completedTask;
            isCompleted = true;
            ('[TaskDetails] Loaded task from completed tasks:', res);
          } else {
            throw firstError;
          }
        } else {
          throw firstError;
        }
      }

      const raw = (res?.task ?? res?.data ?? res) ?? {};
      
      if (!isCompleted) {
        isCompleted = isCompletedTask(raw);
      }
      
      const normalized = normalizePayload(raw, isCompleted);
      setTask(normalized);
      
      // For completed tasks, use the original task_id as the primary lookup key
      // since comments and attachments are typically stored under the original task ID.
      // The multi-strategy approach in loadCommentsFor/loadAttachmentsFor will try
      // additional IDs (completed_task_id, original_task_id) as fallbacks.
      const taskIdToUse = isCompleted
        ? (normalized.original_task_id || normalized.task_id || normalized.completed_task_id)
        : normalized.task_id;
      await loadAttachmentsFor(Number(taskIdToUse), isCompleted);
      await loadCommentsFor(Number(taskIdToUse), isCompleted);

      // If backend now reports amendment_request, remove it from local requestedAmendments (cleanup)
      try {
        if (normalized.amendment_request) {
          const stored = loadRequestedAmendmentsFromStorage()
          if (stored.has(Number(normalized.task_id))) {
            stored.delete(Number(normalized.task_id))
            setRequestedAmendments(new Set(stored))
            persistRequestedAmendmentsToStorage(stored)
          }
        }
      } catch (e) {
        console.error('Failed to reconcile storage after loading task', e)
      }
      
      return normalized;
    } catch (e: any) {
      console.error('[TaskDetails] Failed to load task', e);
      setErr(e?.message ?? 'Failed to load task');
      return null;
    } finally {
      setLoading(false);
    }
  }

  // If parent provided a task object, use it and avoid fetching; otherwise fetch by id.
  // FIXED: When incomingTask is provided from a list endpoint, also fetch the full task detail
  // to get fields that are only populated on the single-task endpoint (e.g., engineerPhoneNumber).
  useEffect(() => {
    let mounted = true;
    (async () => {
      setErr(null);
      if (incomingTask) {
        const isCompleted = isCompletedTask(incomingTask);
        const normalized = normalizePayload(incomingTask, isCompleted);
        
        if (mounted) {
          setTask(normalized);
          // For completed tasks, prefer original_task_id as primary key for comments/attachments
          const taskIdToUse = isCompleted
            ? (normalized.original_task_id || normalized.task_id || normalized.completed_task_id)
            : normalized.task_id;
          await loadAttachmentsFor(Number(taskIdToUse), isCompleted);
          await loadCommentsFor(Number(taskIdToUse), isCompleted);

          // FIXED: If key fields are missing (list endpoints / completed task DTOs don't populate them),
          // fetch the full task detail to get the missing fields. Works for both active and completed tasks.
          // NEW: also treat missing task_assigned_at (TaskDto.AssignedAt) as a reason to refetch
          // so the Timeline section can show the "Task assigned at" timestamp even when the
          // incoming task came from a list endpoint that omitted the field.
          const isMissingFields = !normalized.engineer_phone_number || !normalized.creator_phone_number || !normalized.created_at || !normalized.target_completion_date || !normalized.actual_completion_date || !normalized.engineer_completed_at || !normalized.tl_approved_at || !normalized.task_assigned_at;
          if (isMissingFields && normalized.task_id) {
            try {
              const lookupId = isCompleted
                ? (normalized.original_task_id || normalized.task_id)
                : normalized.task_id;
              const fullRes = await apiClient.getTask(Number(lookupId));
              const fullRaw = (fullRes?.task ?? fullRes?.data ?? fullRes) ?? {};
              const fullNormalized = normalizePayload(fullRaw, false);
              if (mounted) {
                setTask((prev: any) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    engineer_phone_number: prev.engineer_phone_number || fullNormalized.engineer_phone_number,
                    creator_phone_number: prev.creator_phone_number || fullNormalized.creator_phone_number,
                    phone_extension: prev.phone_extension || fullNormalized.phone_extension,
                    created_at: prev.created_at || fullNormalized.created_at,
                    updated_at: prev.updated_at || fullNormalized.updated_at,
                    target_completion_date: prev.target_completion_date || fullNormalized.target_completion_date,
                    actual_completion_date: prev.actual_completion_date || fullNormalized.actual_completion_date,
                    engineer_completed_at: prev.engineer_completed_at || fullNormalized.engineer_completed_at,
                    tl_approved_at: prev.tl_approved_at || fullNormalized.tl_approved_at,
                    moved_to_completed_at: prev.moved_to_completed_at || fullNormalized.moved_to_completed_at,
                    // NEW: merge task_assigned_at from the full task detail (TaskDto.AssignedAt)
                    // so the Timeline "Task assigned at" row can render in TaskDetails even when
                    // the incoming list payload didn't include it.
                    task_assigned_at: prev.task_assigned_at || fullNormalized.task_assigned_at,
                  };
                });
              }
            } catch {
              // Silently ignore - the task detail page will still work, just without some fields
            }
          }
        }
      } else if (taskId) {
        await loadTaskById(taskId);
      } else {
        setTask(null);
        setAttachments([]);
        setComments([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [taskId, incomingTask]);

  // LISTEN FOR GLOBAL REFRESH EVENTS so TaskDetails reloads when amendments are requested from other components
  useEffect(() => {
    const handler = async () => {
      const id = task?.task_id ?? taskId;
      if (id) {
        await loadTaskById(Number(id));
      }
    };
    // listens to RequestAmendmentModal which dispatches 'amendments:refresh' and 'tasks:refresh'
    window.addEventListener('amendments:refresh', handler);
    window.addEventListener('tasks:refresh', handler);
    return () => {
      window.removeEventListener('amendments:refresh', handler);
      window.removeEventListener('tasks:refresh', handler);
    };
  }, [task, taskId]);

  // FIXED: Inline upload handler - now uses correct task-specific endpoint
  async function handleUpload(e?: React.FormEvent) {
    e?.preventDefault();
    setUploadError(null);
    
    if (!newFile) {
      setUploadError('No file selected');
      return;
    }
    
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', newFile);
      
      const currentTaskId = taskId ?? task?.task_id;
      if (!currentTaskId) {
        throw new Error('No task ID available');
      }

      const response: any = await apiClient.uploadAttachment(Number(currentTaskId), fd);

      if (response && response.success === false) {
        setUploadError(response.message || 'Upload failed');
        setUploading(false);
        return; 
      }

      const isCompleted = task?.is_completed_task ?? false;
      const taskIdToUse = isCompleted ? (task?.completed_task_id || task?.task_id) : task?.task_id;
      await loadAttachmentsFor(Number(taskIdToUse), isCompleted);
      
      setNewFile(null);
      try {
        window.dispatchEvent(new CustomEvent('tasks:refresh'));
      } catch {}

    } catch (err: any) {
      const message = err?.message ?? 'Upload failed';
      setUploadError(message);
      console.error('[TaskDetails] Network or System Error', err);
    } finally {
      setUploading(false);
    }
  }

  function clearUpload() {
    setNewFile(null);
    setUploadError(null);
    const input = document.querySelector<HTMLInputElement>('input[type="file"].taskfile-input');
    if (input) input.value = '';
  }

  // Enhanced: Post comment with real-time updates
  async function postComment(e?: React.FormEvent) {
    e?.preventDefault();
    if (!commentText?.trim()) return;
    try {
      const id = taskId ?? task?.task_id;
      if (!id) throw new Error('No task id');

      const newComment = await apiClient.post(`/tasks/${id}/comments`, { comment_text: commentText });
      const created =
        (newComment && (newComment.comment_id || newComment.commentId || newComment.id))
          ? newComment
          : newComment?.data ?? newComment?.comment ?? null;
      if (created) {
        if (!created.created_at) created.created_at = new Date().toISOString();
        setComments((prev) => [created, ...prev]);
      } else {
        const isCompleted = task?.is_completed_task ?? false;
        const taskIdToUse = isCompleted ? (task?.completed_task_id || task?.task_id) : task?.task_id;
        await loadCommentsFor(Number(taskIdToUse), isCompleted);
      }

      setCommentText('');
      await (incomingTask ? loadTaskById(task?.task_id) : loadTaskById(taskId));
    } catch (err: any) {
      console.error('[TaskDetails] Failed to post comment', err);
      if ((err?.status === 401) || String(err).includes('401')) {
        setErr('You are not authorized to post comments. Please sign in again.');
      } else {
        setErr(err?.message ?? 'Failed to post comment');
      }
    }
  }

  // CRITICAL FIX: Create transfer with from_shop_id from user's assigned shop
  async function submitTransfer(e?: React.FormEvent) {
    e?.preventDefault();
    if (!transferToShop) {
      setErr('Please select destination shop');
      return;
    }
    
    // CRITICAL FIX: Validate user has assigned shop
    if (!userShopInfo?.has_assigned_shop || !userShopInfo?.shop_id) {
      setErr('Cannot create transfer: Your account has no assigned shop. Please contact your administrator.');
      return;
    }
    
    if (userShopInfo.shop_id === transferToShop) {
      setErr('Source and destination shops cannot be the same');
      return;
    }
    
    try {
      const currentTaskId = taskId ?? task?.task_id;
      if (!currentTaskId) {
        throw new Error('No task ID available');
      }

      // CRITICAL FIX: Include from_shop_id in the payload
      const payload = {
        task_id: Number(currentTaskId),
        from_shop_id: Number(userShopInfo.shop_id), // FIXED: Send user's assigned shop
        to_shop_id: Number(transferToShop),
        notes: transferComments || undefined,
      };

      ('[TaskDetails] Creating transfer with payload:', payload);

      await apiClient.post('/transfers', payload);
      
      setTransferOpen(false);
      setTransferToShop('');
      setTransferComments('');
      
      // Reload task to show updated shop assignment
      await loadTaskById(Number(currentTaskId));
      
      // Dispatch refresh event
      try {
        window.dispatchEvent(new CustomEvent('tasks:refresh'));
      } catch {}
    } catch (err: any) {
      console.error('[TaskDetails] Create transfer failed', err);
      setErr(err?.message ?? 'Failed to create transfer');
    }
  }

  // Enhanced: Request intervention with escalation logic
  async function submitIntervention(e?: React.FormEvent) {
    e?.preventDefault();
    if (!interventionText?.trim()) {
      setErr('Intervention text required');
      return;
    }

    setInterventionLoading(true);
    setErr(null);

    try {
      const id = taskId ?? task?.task_id;
      if (!id) throw new Error('No task id');

      const priorCount = comments?.filter((c) => {
        const t = String(c?.comment_type ?? '').toLowerCase();
        return t === 'interventionrequest' || t.includes('intervention');
      }).length ?? 0;

      const escalationLevel = priorCount >= 1 ? 'director' : 'team_lead';

      const payload = {
        intervention_comment_text: interventionText,
        user_id: currentUser?.id,
        user_role: currentUser?.role,
        escalation_level: escalationLevel,
      };

      const resObj = await apiClient.post(`/tasks/${id}/intervention`, payload);

      const newInterventionComment = {
        comment_id: resObj?.comment_id ?? resObj?.id ?? `local-${Date.now()}`,
        content: interventionText,
        author_name: currentUser?.fullName ?? currentUser?.name ?? currentUser?.username ?? 'You',
        created_at: new Date().toISOString(),
        comment_type: 'InterventionRequest',
      };
      setComments((prev) => [newInterventionComment as any, ...prev]);

      setInterventionOpen(false);
      setInterventionText('');

      const isCompleted = task?.is_completed_task ?? false;
      const taskIdToUse = isCompleted ? (task?.completed_task_id || task?.task_id) : task?.task_id;
      await loadCommentsFor(Number(taskIdToUse), isCompleted);
      await loadTaskById(Number(id));

      if (escalationLevel === 'director') {
        alert('Intervention request sent to Director.');
      } else {
        alert('Intervention request sent to Team Leader.');
      }
    } catch (err: any) {
      console.error('[TaskDetails] Intervention failed', err);
      if ((err?.status === 401) || String(err).includes('401')) {
        setErr('You are not authorized to request intervention. Please sign in again.');
      } else {
        setErr(err?.message ?? 'Failed to request intervention');
      }
    } finally {
      setInterventionLoading(false);
    }
  }

  /**
   * FIXED: Download attachment using apiClient with proper authentication and error handling
   */
  const handleAttachmentDownload = async (attachment: Attachment) => {
    if (!attachment.attachment_id) {
      console.error('[TaskDetails] No attachment ID available');
      setErr('Cannot download attachment: Invalid attachment ID');
      return;
    }

    setDownloadingAttachment(attachment.attachment_id);
    
    try {
      // Build a list of task IDs to try for download (multi-strategy for completed tasks)
      const idsToTry: number[] = [];
      const isCompleted = task?.is_completed_task;
      
      if (isCompleted) {
        // For completed tasks, try original_task_id first, then task_id, then completed_task_id
        const origId = task?.original_task_id;
        const displayId = task?.task_id ?? taskId;
        const completedId = task?.completed_task_id;
        
        if (origId) idsToTry.push(Number(origId));
        if (displayId && !idsToTry.includes(Number(displayId))) idsToTry.push(Number(displayId));
        if (completedId && !idsToTry.includes(Number(completedId))) idsToTry.push(Number(completedId));
      } else {
        const id = taskId ?? task?.task_id;
        if (id) idsToTry.push(Number(id));
      }

      if (idsToTry.length === 0) {
        throw new Error('No task ID available for download');
      }

      let response: Response | null = null;
      
      for (const tryId of idsToTry) {
        const endpoint = `/tasks/${tryId}/attachments/${attachment.attachment_id}/download`;
        
        try {
          const resp = await fetch(`/api${endpoint}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token') || localStorage.getItem('auth_token') || ''}`
            },
            credentials: 'include'
          });
          
          if (resp.ok) {
            response = resp;
            break;
          }
          
          // If 404, try next ID
          if (resp.status === 404) continue;
          
          // For auth errors, stop immediately
          if (resp.status === 401) {
            setErr('Please log in to download attachments');
            return;
          }
        } catch {
          continue;
        }
      }
      
      if (!response || !response.ok) {
        setErr('Attachment file not found. It may have been deleted or moved.');
        return;
      }
      
      const blob = await response.blob();
      
      let filename = attachment.file_name || `attachment_${attachment.attachment_id}`;
      const contentDisposition = response.headers.get('Content-Disposition');
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('[TaskDetails] Failed to download attachment:', error);
      setErr(`Failed to download attachment: ${(error as any)?.message || 'Unknown error'}`);
    } finally {
      setDownloadingAttachment(null);
    }
  };

  // NEW: Handle alert icon click
  const handleAlertClick = (alertType: 'revision' | 'reopened' | 'amendment' | 'duplicate') => {
    setSelectedAlertType(alertType);
    setAlertModalOpen(true);
  };

  if (!taskId && !incomingTask) return <div className="text-sm text-gray-600">No task selected</div>;

  const getCreatorDisplay = (taskObj: any) => {
    if (!taskObj) return 'N/A';
    if (taskObj.creator_name && String(taskObj.creator_name).trim() !== '') return taskObj.creator_name;
    if (taskObj.created_by && taskObj.raw && taskObj.raw.creator_name) return taskObj.raw.creator_name;
    return taskObj.creator_name ?? taskObj.created_by_name ?? 'N/A';
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'In Progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'Pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'Blocked':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'On Hold':
        return 'bg-purple-100 text-purple-800 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // CRITICAL FIX: Determine which ID to pass to TaskUpdateHistory
  const updateHistoryTaskId = task?.original_task_id || task?.task_id;

  // Amendment helpers for UI decisions
  const userRoleCanonical = canonicalizeRole(currentUser?.role ?? currentUser?.roleDisplayName ?? currentUser?.role_display ?? '');
  const isTLorDirector = ['team_leader', 'director'].includes(userRoleCanonical);
  const canRequestAmendmentLocal = (t: any) => {
    if (!t) return false;
    if (!['engineer', 'team_leader', 'customer_personnel'].includes(userRoleCanonical)) return false;
    // hide if locally requested (persistence)
    if (requestedAmendments.has(Number(t.task_id))) return false
    const amendmentRequest = Number(t.amendment_request ?? 0);
    const amendmentStatus = parseAmendmentStatus(t.amendment_status ?? t.amendmentStatus ?? 0);
    if (amendmentRequest === 0 && amendmentStatus === 0) return true;
    if (amendmentStatus === 3) return true; // previously rejected
    return false;
  };
  const isAmendmentPending = (t: any) => {
    if (!t) return false;
    const req = Number(t.amendment_request ?? 0);
    const status = parseAmendmentStatus(t.amendment_status ?? t.amendmentStatus ?? 0);
    return req > 0 && (status === 1 || status === 0);
  };

  // UI actions: open request/approval modals
  const openRequestAmendment = () => setRequestAmendmentOpen(true);
  const closeRequestAmendment = () => setRequestAmendmentOpen(false);
  const openAmendmentApproval = () => setAmendmentApprovalOpen(true);
  const closeAmendmentApproval = () => setAmendmentApprovalOpen(false);

  // After amendment actions refresh task and persist local marker if needed
  const onAmendmentActionSuccess = async (isLocalRequest = false) => {
    const id = task?.task_id ?? taskId;
    if (id) {
      await loadTaskById(Number(id));
    }
    // if this call came from a local Request (the modal's onSuccess), persist the local marker so button hides immediately across reloads
    if (isLocalRequest && id) {
      const copy = new Set(requestedAmendments)
      copy.add(Number(id))
      setRequestedAmendments(copy)
      persistRequestedAmendmentsToStorage(copy)
    }
    // notify other parts of app
    try { window.dispatchEvent(new CustomEvent('amendments:refresh')); } catch {}
    try { window.dispatchEvent(new CustomEvent('tasks:refresh')); } catch {}
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modern Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <h1 className="text-2xl font-bold text-gray-900">Task Details</h1>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusBadgeClass(task?.status ?? '')}`}>
            {task?.status ?? 'Unknown'}
            {/* Small explicit indicator for pending amendment */}
            {task?.amendment_request && isAmendmentPending(task) && (
              <span className="ml-3 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-800 border border-blue-200 cursor-pointer"
                    onClick={() => {
                      if (isTLorDirector) {
                        openAmendmentApproval();
                      } else {
                        setSelectedAlertType('amendment');
                        setAlertModalOpen(true);
                      }
                    }}
                    title="Pending TL Review — click to review or view details">
                Pending TL Review
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Task Overview Card */}
         <div className="bg-white rounded-lg shadow-sm border border-gray-200">
  <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
    <h2 className="text-lg font-semibold text-gray-900">Task Overview</h2>
    <div className="text-sm text-gray-500">TC-{taskId ?? task?.task_id}</div>
  </div>
  <div className="p-6">
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-500">Serial Number</label>
          <p className="text-gray-900">{task?.serial_number || '—'}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-500">Part Number</label>
          <p className="text-gray-900">{task?.part_number || '—'}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-500">PO Number</label>
          <p className="text-gray-900">{task?.po_number || '—'}</p>
        </div>
                {/* FIXED: Shop Name - now prominently displayed with proper fallback */}
        <div>
          <label className="text-sm font-medium text-gray-500">Shop Name</label>
          <p className="text-gray-900 font-medium">{task?.shop_name || '—'}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-500 flex items-center">
  <Phone className="h-4 w-4 mr-1" />
  Creator Phone Contact
</label>
          <p className="text-gray-900">{task?.creator_phone_number || task?.phone_extension || '—'}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-500">Category</label>

          <span className="inline-block px-2 py-1 bg-gray-100 text-gray-800 text-sm rounded">{task?.category_name || 'N/A'}</span>
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <label className="text-sm font-medium text-gray-500">Priority</label>
          <div>
            <span className={`inline-block px-2 py-1 text-sm rounded border ${getPriorityBadgeClass(task?.priority_level_name)}`}>
              {task?.priority_level_name || 'N/A'}
            </span>
          </div>
        </div>
        {/* FIXED: Created By (User Name) - now prominently displayed */}
        <div>
          <label className="text-sm font-medium text-gray-500">Created By</label>
          <p className="text-gray-900 font-medium">{getCreatorDisplay(task)}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-500">Created At</label>
          <p className="text-gray-900">{formatDate(task?.created_at)}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-500">Last Updated</label>
          <p className="text-gray-900">{formatDate(task?.updated_at)}</p>
        </div>
      </div>
    </div>
  </div>
</div>

            {/* Description Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Description</h2>
              </div>
              <div className="p-6">
                <div className="prose max-w-none text-gray-700" dangerouslySetInnerHTML={{ __html: convertEmbeddedUtcTimestamps(String(task?.description ?? '')).replace(/(?:\r\n|\r|\n)/g, '<br/>') }} />
              </div>
            </div>

            {/* CRITICAL FIX: Update History Timeline - pass correct ID for both active and completed tasks */}
            {updateHistoryTaskId && <TaskUpdateHistory taskId={updateHistoryTaskId} />}

            {/* FIXED: Enhanced Comments Section with proper timestamps */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center space-x-2">
                  <MessageCircle className="h-5 w-5 text-gray-500" />
                  <h2 className="text-lg font-semibold text-gray-900">Comments</h2>
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">{comments.length}</span>
                </div>
              </div>
              <div className="p-6">
                {/* Add Comment Form - Only show for active tasks */}
                {!task?.is_completed_task && (
                  <form onSubmit={postComment} className="mb-6">
                    <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" rows={3} placeholder="Add a comment..." />
                    <div className="flex justify-end mt-3">
                      <button type="submit" disabled={!commentText.trim()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                        Post Comment
                      </button>
                    </div>
                  </form>
                )}

                {/* Comments List with proper date/time display */}
                <div className="space-y-4">
                  {loadingComments ? (
                    <div className="text-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                    </div>
                  ) : comments.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No comments yet. {!task?.is_completed_task && 'Be the first to comment!'}</p>
                  ) : (
                    comments.map((comment, idx) => {
                      const key = stableKey(comment, `task-${task?.task_id}-comment`, idx);
                      const commentContent = comment.content ?? comment.comment_text ?? '';
                      return (
                        <div key={key} className="border border-gray-200 rounded-lg p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-2">
                              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                                <User className="h-4 w-4 text-blue-600" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-900">{comment.author_name}</p>
                                <p className="text-xs text-gray-500">{formatDate(comment.created_at)}</p>
                              </div>
                            </div>
                            {String(comment.comment_type ?? '').toLowerCase().includes('intervention') && (
                              <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">Intervention Request</span>
                            )}
                          </div>
                          <div className="mt-3 text-gray-700">
                            <div dangerouslySetInnerHTML={{ __html: convertEmbeddedUtcTimestamps(commentContent || '').replace(/\n/g, '<br/>') }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Assignment Info */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Assignment</h3>
              </div>
                           <div className="p-6 space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500 flex items-center">
                    <Users className="h-4 w-4 mr-1" />
                    Assigned Engineer(s)
                  </label>
                  <p className="text-gray-900 mt-1">{task?.assigned_engineer || 'Unassigned'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 flex items-center">
  <Phone className="h-4 w-4 mr-1" />
  Engineer Phone Contact
</label>
                  <p className="text-gray-900 mt-1">{task?.engineer_phone_number || '—'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 flex items-center">
                    <Building className="h-4 w-4 mr-1" />
                    Component Maintenance Engineering Support
                  </label>
                </div>
              </div>
            </div>

            {/* Timeline Info - FIX: always use formatDate() for all timeline fields */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Timeline</h3>
              </div>
              <div className="p-6 space-y-4">
                {/* FIX: CHRONOLOGICAL ORDER.
                    "Task Assigned At" is the START of the SLA window and is now
                    rendered BEFORE "Target Completion" (its END). Previously the
                    deadline was printed above the assignment moment, which made
                    the Timeline read as if completion happened before assignment. */}
                <div>
                  <label className="text-sm font-medium text-gray-500 flex items-center">
                    <Calendar className="h-4 w-4 mr-1" />
                    Task Assigned At
                  </label>
                  <p className="text-gray-900 mt-1">
                    {task?.task_assigned_at
                      ? formatDate(task.task_assigned_at)
                      : <span className="text-gray-400 italic">Not yet assigned</span>}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 flex items-center">
                    <Clock className="h-4 w-4 mr-1" />
                    Target Completion
                  </label>
                  {/* FIX: render the resolved target date with the SAME
                      date+time formatter used by "Last Updated" and by the
                      Update Task modal, so every screen shows one clock. */}
                  <p className="text-gray-900 mt-1">
                    {targetCompletionInfo.effective
                      ? formatDate(targetCompletionInfo.effective)
                      : formatDate(task?.target_completion_date)}
                  </p>
                  {targetCompletionInfo.isExtended && targetCompletionInfo.original && (
                    <p className="text-xs text-gray-500 mt-1">
                      Updated from original:{' '}
                      <span className="line-through">{formatDate(targetCompletionInfo.original)}</span>
                    </p>
                  )}
                  {/* Explicit, actionable warning instead of an impossible timeline. */}
                  {timelineOrderIssue && (
                    <p className="text-xs text-amber-700 mt-1 font-medium">
                      ⚠️ This Target Completion is not after the Task Assigned At time. A Team Leader
                      or Director should update the deadline from the Update Task screen.
                    </p>
                  )}
                </div>
                {(task?.engineer_completed_at || task?.actual_completion_date || task?.is_completed_task) && (() => {
                  /**
                   * CRITICAL FIX: Derive distinct Engineer Completed and TL Approved timestamps.
                   *
                   * When the backend doesn't store engineer_completed_at / tl_approved_at as
                   * separate fields, both fall back to actual_completion_date showing the same
                   * value. To fix this, we derive the engineer's completion time from the
                   * comments list using multiple strategies.
                   *
                   * Priority chain:
                   *   engineer_completed_at field (only if different from TL approved) > derived from comments > null
                   *   tl_approved_at field > moved_to_completed_at > actual_completion_date
                   */

                  // Determine TL approved timestamp
                  const tlApprovedTimestamp = task?.tl_approved_at
                    || task?.moved_to_completed_at
                    || task?.actual_completion_date
                    || null;

                  // Determine engineer completed timestamp
                  let engineerCompletedTimestamp = task?.engineer_completed_at || null;

                  // Check if engineer_completed_at is the same as TL approved (within 60s)
                  // FIX: compare NORMALIZED instants. Mixing a "...Z" value with a
                  // designator-less value here produced a false timezone-sized gap.
                  const isSameAsTL = (() => {
                    if (!engineerCompletedTimestamp || !tlApprovedTimestamp) return !engineerCompletedTimestamp;
                    const engTime = timestampMs(engineerCompletedTimestamp);
                    const tlTime = timestampMs(tlApprovedTimestamp);
                    if (engTime === null || tlTime === null) return !engineerCompletedTimestamp;
                    return Math.abs(engTime - tlTime) <= 60000;
                  })();

                  // If engineer_completed_at is missing OR equals the TL approval time,
                  // try to derive it from comments
                  if (isSameAsTL && comments.length > 0) {
                    // Sort comments by created_at ascending (oldest first)
                    const sortedAsc = [...comments].sort((a, b) => {
                      const dateA = timestampMs(a.created_at) ?? 0;
                      const dateB = timestampMs(b.created_at) ?? 0;
                      return dateA - dateB;
                    });

                    // Helper: check if a comment is a system/TL approval comment
                    const isSystemApproval = (c: any): boolean => {
                      const content = String(c.content ?? c.comment_text ?? '').toUpperCase();
                      return content.includes('[COMPLETION APPROVED') ||
                             content.includes('[COMPLETION REJECTED') ||
                             content.includes('[STATUS CHANGED') ||
                             content.includes('[TASK APPROVED');
                    };

                    // STRATEGY A: Find "[COMPLETION APPROVED" → use comment just before it
                    const tlApprovalIdx = sortedAsc.findIndex((c) => {
                      const content = String(c.content ?? c.comment_text ?? '').toUpperCase();
                      return content.includes('[COMPLETION APPROVED');
                    });

                    let derived: string | null = null;

                    if (tlApprovalIdx > 0) {
                      for (let i = tlApprovalIdx - 1; i >= 0; i--) {
                        const candidate = sortedAsc[i];
                        if (!isSystemApproval(candidate) && candidate.created_at) {
                          const candidateTime = timestampMs(candidate.created_at) ?? 0;
                          const tlTime = tlApprovedTimestamp ? (timestampMs(tlApprovedTimestamp) ?? 0) : 0;
                          if (tlTime === 0 || candidateTime < tlTime + 60000) {
                            derived = candidate.created_at;
                            break;
                          }
                        }
                      }
                    }

                    // STRATEGY B: Find completion-related comment
                    if (!derived) {
                      const completionKeywords = ['completed', 'complete', 'done', 'finished', 'marked as completed'];
                      for (let i = sortedAsc.length - 1; i >= 0; i--) {
                        const c = sortedAsc[i];
                        if (isSystemApproval(c)) continue;
                        const content = String(c.content ?? c.comment_text ?? '').toLowerCase();
                        const mentionsCompletion = completionKeywords.some(kw => content.includes(kw));
                        if (mentionsCompletion && c.created_at) {
                          derived = c.created_at;
                          break;
                        }
                      }
                    }

                    // STRATEGY C: Last non-system comment before TL approval time
                    if (!derived && tlApprovedTimestamp) {
                      const nonSystemComments = sortedAsc.filter(c => !isSystemApproval(c) && c.created_at);
                      const tlTime = timestampMs(tlApprovedTimestamp) ?? 0;
                      for (let i = nonSystemComments.length - 1; i >= 0; i--) {
                        const candidateTime = timestampMs(nonSystemComments[i].created_at) ?? 0;
                        if (candidateTime < tlTime - 60000) {
                          derived = nonSystemComments[i].created_at;
                          break;
                        }
                      }
                    }

                    if (derived) {
                      engineerCompletedTimestamp = derived;
                    } else {
                      // No distinct timestamp found — show null rather than duplicate TL time
                      engineerCompletedTimestamp = null;
                    }
                  }

                  return (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Actual Completion</label>
                      <div className="mt-1 space-y-2">
                        {/* Engineer's Completion Timestamp */}
                        <div className="flex items-start gap-2 p-2 bg-blue-50 border border-blue-100 rounded-md">
                          <div className="flex-shrink-0 mt-0.5">
                            <div className="w-2 h-2 rounded-full bg-blue-500 mt-1"></div>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
                              {task?.assigned_engineer
                                ? `${task.assigned_engineer}'s Completed`
                                : "Engineer's Completed"}
                            </p>
                            <p className="text-gray-900 text-sm">
                              {engineerCompletedTimestamp
                                ? formatDate(engineerCompletedTimestamp)
                                : '—'}
                            </p>
                          </div>
                        </div>
                        {/* Team Leader's Approval Timestamp */}
                        <div className="flex items-start gap-2 p-2 bg-green-50 border border-green-100 rounded-md">
                          <div className="flex-shrink-0 mt-0.5">
                            <div className="w-2 h-2 rounded-full bg-green-500 mt-1"></div>
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">TL Approved</p>
                            <p className="text-gray-900 text-sm">
                              {tlApprovedTimestamp
                                ? formatDate(tlApprovedTimestamp)
                                : '—'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ENHANCED: Status Badges & Current Status with Clickable Icons */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Status Information</h3>
              </div>
              <div className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusBadgeClass(task?.status ?? '')}`}>
                      {task?.status ?? 'Unknown'}
                    </div>
                    <div className="text-sm text-gray-600">Current Status</div>
                  </div>
                </div>

                {/* ENHANCED: Clickable Alert Icons */}
                <div className="flex flex-wrap gap-2">
                  {task?.show_revision_alert && (
                    <button
                      onClick={() => handleAlertClick('revision')}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 hover:bg-yellow-200 transition-colors cursor-pointer border border-yellow-200"
                      title="Click to view revision details"
                    >
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Revision Alert
                    </button>
                  )}
                  
                  {task?.is_reopened && (
                    <button
                      onClick={() => handleAlertClick('reopened')}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 hover:bg-orange-200 transition-colors cursor-pointer border border-orange-200"
                      title="Click to view reopen details"
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Reopened {task.reopen_count > 1 ? `(${task.reopen_count}x)` : ''}
                    </button>
                  )}
                  
                  {task?.amendment_request && (
                    <>
                      <button
                        onClick={() => {
                          if (isTLorDirector) openAmendmentApproval();
                          else { setSelectedAlertType('amendment'); setAlertModalOpen(true); }
                        }}
                        className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors cursor-pointer border border-blue-200"
                        title="Click to view amendment details / review"
                      >
                        <FileEdit className="h-3 w-3 mr-1" />
                        Amendment Request
                      </button>

                      {/* If it's pending, show explicit small badge (also clickable) */}
                      {isAmendmentPending(task) && (
                        <button
                          onClick={() => {
                            if (isTLorDirector) openAmendmentApproval();
                            else { setSelectedAlertType('amendment'); setAlertModalOpen(true); }
                          }}
                          className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100"
                          title="Pending TL Review — click to review or view details"
                        >
                          Pending TL Review
                        </button>
                      )}
                    </>
                  )}
                  
                  {task?.is_duplicate && (
                    <button
                      onClick={() => handleAlertClick('duplicate')}
                      className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors cursor-pointer border border-amber-200"
                      title="Click to view duplicate details"
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Duplicate
                    </button>
                  )}
                </div>

                {task?.is_reopened && task?.reopen_reason && (
                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="font-medium text-amber-800 text-sm">Reopen Reason:</div>
                    <div className="text-amber-700 text-sm mt-1">{task.reopen_reason}</div>
                    {task.reopened_at && <div className="text-amber-600 text-xs mt-1">Reopened: {formatDate(task.reopened_at)}</div>}
                  </div>
                )}
              </div>
            </div>

            {/* FIXED: Attachments Section - works for both active and completed tasks with authenticated downloads */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                    <Paperclip className="h-5 w-5 mr-2" />
                    Attachments
                  </h3>
                  <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs">{attachments.length}</span>
                </div>
              </div>
              <div className="p-6">
                {/* Upload Form - Only show for active tasks */}
                {!task?.is_completed_task && (
                  <div className="mb-4 p-4 border-2 border-dashed border-gray-300 rounded-lg">
                    <div className="text-center">
                      <Paperclip className="mx-auto h-8 w-8 text-gray-400" />
                      <div className="mt-2">
                        <label className="cursor-pointer">
                          <span className="text-sm font-medium text-blue-600 hover:text-blue-500">Choose file</span>
                          <input
                            type="file"
                            className="hidden taskfile-input"
                            accept={ACCEPT_STRING}
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              if (file) {
                                const result = validateFile(file);
                                if (!result.valid) {
                                  setUploadError(result.error);
                                  setNewFile(null);
                                  e.target.value = '';
                                  return;
                                }
                                setUploadError(null);
                              }
                              setNewFile(file);
                            }}
                          />
                        </label>
                      </div>
                      {newFile && <div className="mt-2 text-sm text-gray-600">Selected: {newFile.name} ({(newFile.size / 1024).toFixed(1)} KB)</div>}
                      <p className="mt-1 text-xs text-gray-400">Max {MAX_FILE_SIZE_MB}MB. Allowed: {ALLOWED_EXTENSIONS_DISPLAY}. Outlook messages must be zipped.</p>
                      <div className="mt-2 flex justify-center space-x-2">
                        <button onClick={handleUpload} disabled={!newFile || uploading} className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">
                          {uploading ? 'Uploading...' : 'Upload'}
                        </button>
                        <button onClick={clearUpload} className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400">
                          Clear
                        </button>
                      </div>
                      {uploadError && (
                        <div className="mt-2 text-sm text-red-600 p-2 bg-red-50 border border-red-200 rounded text-left">
                          ⚠️ {uploadError}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* FIXED: Attachments List with authenticated download */}
                <div className="space-y-2">
                  {attachments.length === 0 ? (
                    <p className="text-gray-500 text-sm">No attachments</p>
                  ) : (
                    attachments.map((attachment, idx) => {
                      const key = stableKey(attachment, `task-${task?.task_id}-attachment`, idx);
                      const isDownloading = downloadingAttachment === attachment.attachment_id;
                      return (
                        <div key={key} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{attachment.file_name || 'Unnamed file'}</p>
                            <p className="text-xs text-gray-500">
                              {attachment.uploader_name && `by ${attachment.uploader_name}`}
                              {attachment.uploaded_at && ` • ${formatDate(attachment.uploaded_at, { dateOnly: true })}`}
                            </p>
                          </div>
                          <button
                            onClick={() => handleAttachmentDownload(attachment)}
                            disabled={isDownloading}
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Download className="h-4 w-4" />
                            {isDownloading ? 'Downloading...' : 'Download'}
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons - for both active and completed tasks */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Actions</h3>
              </div>
              <div className="p-6 space-y-3">
                {/* Transfer only for active tasks AND users with transfer permission */}
                {!task?.is_completed_task && canManageTransfers && (
                  <button onClick={() => setTransferOpen(true)} className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                    Create Transfer
                  </button>
                )}

                {/* Intervention only for active tasks and permitted roles */}
                {canRequestIntervention() && (
                  <button onClick={() => setInterventionOpen(true)} className="w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Request Intervention
                  </button>
                )}

                {/* Request Amendment - show on completed tasks for engineers / customer_personnel / team_leader
                    This button will be hidden automatically once the amendment request exists (backend) or once the user made a local request (persisted). */}
                {task?.is_completed_task && canRequestAmendment && canRequestAmendmentLocal(task) && (
                  <button onClick={() => { openRequestAmendment(); }} className="w-full px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors flex items-center justify-center">
                    <Edit className="h-4 w-4 mr-2" />
                    Request Amendment
                  </button>
                )}

                {/* Review Amendment - show for Team Leader / Director when amendment pending */}
                {task?.amendment_request && isAmendmentPending(task) && isTLorDirector && (
                  <button onClick={() => { openAmendmentApproval(); }} className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors flex items-center justify-center">
                    <FileEdit className="h-4 w-4 mr-2" />
                    Review Amendment (TL)
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <AttachmentsModal open={attachmentsOpen} onOpenChange={setAttachmentsOpen} taskId={Number(taskId ?? task?.task_id)} />

      {task && (
        <UpdateTaskModal
          open={updateOpen}
          onOpenChange={setUpdateOpen}
          taskId={Number(taskId ?? task?.task_id)}
          initial={task}
          onSaved={() =>
            void (async () => {
              await loadTaskById(Number(taskId ?? task?.task_id));
            })()
          }
        />
      )}

      {/* NEW: Request Amendment Modal */}
      <RequestAmendmentModal
        isOpen={requestAmendmentOpen}
        onClose={() => { closeRequestAmendment(); }}
        task={task}
        onSuccess={async (data?: any) => {
          // mark local persistence so button hides immediately and across reloads
          const id = task?.task_id ?? taskId
          if (id) {
            const copy = new Set(requestedAmendments)
            copy.add(Number(id))
            setRequestedAmendments(copy)
            persistRequestedAmendmentsToStorage(copy)
          }
          await onAmendmentActionSuccess(true);
          closeRequestAmendment();
        }}
      />

      {/* NEW: Amendment Approval Modal */}
      <AmendmentApprovalModal
        isOpen={amendmentApprovalOpen}
        onClose={() => { closeAmendmentApproval(); }}
        task={task}
        onSuccess={async () => {
          await onAmendmentActionSuccess();
          closeAmendmentApproval();
        }}
      />

      {/* Alert Details Modal */}
      {task && selectedAlertType && (
        <AlertDetailsModal
          open={alertModalOpen}
          onOpenChange={setAlertModalOpen}
          task={task}
          alertType={selectedAlertType}
        />
      )}

      {/* FIXED: Transfer Modal - displays user's assigned shop name and sends from_shop_id */}
      {transferOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Create Transfer</h3>
              <p className="text-sm text-gray-500 mt-1">TC-{taskId ?? task?.task_id}</p>
            </div>
            <form onSubmit={submitTransfer} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">From Shop</label>
                {loadingUserShop ? (
                  <input type="text" className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50" value="Loading..." readOnly />
                ) : (
                  <input 
                    type="text" 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50" 
                    value={userShopInfo?.shop_name || 'No shop assigned'} 
                    readOnly 
                  />
                )}
                {userShopInfo && !userShopInfo.has_assigned_shop && (
                  <p className="text-xs text-red-600 mt-1">You do not have an assigned shop. Please contact your administrator.</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">To Shop *</label>
                {loadingShops ? (
                  <div className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500">
                    Loading shops...
                  </div>
                ) : (
                  <select 
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent" 
                    value={transferToShop} 
                    onChange={(e) => setTransferToShop(Number(e.target.value) || '')} 
                    required
                  >
                    <option value="">Select destination shop...</option>
                    {shops.map((shop) => (
                      <option key={shop.id || shop.shop_id} value={shop.id || shop.shop_id}>
                        {shop.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Comments (optional)</label>
                <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" rows={4} value={transferComments} onChange={(e) => setTransferComments(e.target.value)} placeholder="Explain why this task needs to be transferred..." />
              </div>
            </form>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button type="button" onClick={() => setTransferOpen(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">
                Cancel
              </button>
              <button onClick={submitTransfer} disabled={loadingShops || loadingUserShop || !userShopInfo?.has_assigned_shop} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
                Submit Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Intervention Modal */}
      {interventionOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                <AlertTriangle className="h-5 w-5 mr-2 text-red-600" />
                {willEscalateImmediately ? 'Request Director Intervention' : 'Request Team Leader Intervention'}
              </h3>
              <p className="text-sm text-gray-500 mt-1">TC-{taskId ?? task?.task_id}</p>
              <p className="text-xs text-red-600 mt-1">
                {willEscalateImmediately
                  ? 'A prior intervention request exists for this task — this request will notify the Director immediately.'
                  : 'This will notify Team Leaders for immediate review. If there is already a prior request, future requests will go to the Director.'}
              </p>
            </div>
            <form onSubmit={submitIntervention} className="p-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Intervention Details <span className="text-red-500">*</span>
                </label>
                <textarea className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none" rows={6} value={interventionText} onChange={(e) => setInterventionText(e.target.value)} placeholder="Please describe the issue that requires intervention..." required />
              </div>
            </form>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button type="button" onClick={() => setInterventionOpen(false)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200" disabled={interventionLoading}>
                Cancel
              </button>
              <button onClick={submitIntervention} disabled={interventionLoading || !interventionText.trim()} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center">
                {interventionLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Submitting...
                  </>
                ) : willEscalateImmediately ? (
                  'Request Director Intervention'
                ) : (
                  'Request Intervention'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {err && (
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-red-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm">{err}</p>
            </div>
            <div className="ml-auto pl-3">
              <button onClick={() => setErr(null)} className="text-red-400 hover:text-red-600">
                <span className="sr-only">Dismiss</span>×
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}