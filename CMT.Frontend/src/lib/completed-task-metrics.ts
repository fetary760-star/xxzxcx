/**
 * completed-task-metrics.ts  —  AMENDED (Division-Based, Averaged Rate Model)
 * ---------------------------------------------------------------------------
 * THE SINGLE SOURCE OF TRUTH for
 *   1. the "Completed Tasks" screen and its Excel export,
 *   2. the "Performance Management" -> Performance Summary grid,
 *   3. the "View Details" dialog,
 *   4. "Export All to Excel" / "Export Selected".
 *
 * ===========================================================================
 * WHY THE PERFORMANCE SUMMARY DID NOT MATCH THE COMPLETED TASKS VIEW
 * ===========================================================================
 * The MATH in this file was already correct. The Performance Summary was fed
 * DIFFERENT INPUT because `GET /api/performance/engineer/{name}` serialised
 * only a subset of `TaskBreakdownDto`:
 *
 *      task_id, description, status, category_name, priority_name,
 *      created_at, target_completion_date, actual_completion_date,
 *      delay_days, is_on_time
 *
 * `task_assigned_at`, `engineer_completed_at`, `tl_approval_date` and
 * `category_id` were DROPPED by the controller projection. Consequently
 * `getVarianceStart()` silently fell back to `created_at`, so every duration
 * was measured from Task CREATED At instead of Task ASSIGNED At.
 *
 * Adding the same constant C = (assignedAt - createdAt) to BOTH sides of the
 * ratio pulls it towards 100%:
 *
 *      (Target - Created) / (Actual - Created)   ->  closer to 1
 *      (Target - Assigned) / (Actual - Assigned) ->  the TRUE rate
 *
 * which is exactly the reported symptom for Mahlet Lemma (07/01/2026 - 07/31/2026):
 *
 *      Early Rate  2006.62%  ->  1629.45%   (pulled DOWN towards 100)
 *      Delay Rate    59.84%  ->    61.51%   (pulled UP   towards 100)
 *      Efficiency   722.15%  ->   596.99%
 *      On-Time Rate 100.00%  ->   100.00%   (unaffected, count based)
 *
 * The counts (27 early / 17 on-time / 9 delayed / 53 completed) already
 * matched, which proves the classification was never the problem.
 *
 * THE FIX therefore has two halves:
 *   (a) BACKEND  — `PerformanceController.GetEngineerDetailedPerformance`
 *                  must project `task_assigned_at`, `engineer_completed_at`,
 *                  `tl_approval_date`, `category_id` (and the EFFECTIVE
 *                  target date). `PerformanceService` must use the same
 *                  Category-Target-Days fallback as this file.
 *   (b) FRONTEND — every consumer must call the helpers in THIS file. The new
 *                  `buildRateAggregate()` / `combineRateAggregates()` exports
 *                  below exist so the Performance Summary, View Details and
 *                  both exports can no longer re-implement the formulas.
 *
 * ===========================================================================
 * RATE MODEL (unchanged — the Completed Tasks numbers are the reference)
 * ===========================================================================
 * Every completed task is compared against its EFFECTIVE (extension aware)
 * Target Completion Date and is classified EXACTLY ONCE as
 * Early / On-Time / Delayed, at CALENDAR-DAY granularity in UTC.
 *
 *   dayDelta = actualCompletionDay(UTC) - targetCompletionDay(UTC)
 *     dayDelta  < 0  -> EARLY
 *     dayDelta == 0  -> ON-TIME
 *     dayDelta  > 0  -> DELAYED
 *
 * Per task (both durations measured from "Task Assigned At"):
 *
 *   taskRate = (targetDurationDays / actualDurationDays) x 100
 *     EARLY   -> max(taskRate, 100)      NO UPPER CAP (2006.62% is legitimate)
 *     ON-TIME -> 100
 *     DELAYED -> min(taskRate, 100)
 *
 * Aggregates:
 *   On-Time Rate = 100.00% when one or more tasks landed exactly on the
 *                  target date, otherwise 0.00%
 *   Early Rate   = AVERAGE of the early per-task rates   (always >= 100%)
 *   Delay Rate   = AVERAGE of the delayed per-task rates (always <= 100%)
 *   Efficiency   = (Early Rate + Delay Rate + On-Time Rate) / 3,
 *                  an EMPTY category counting as a neutral 100%
 *
 * ---------------------------------------------------------------------------
 * DATE RANGE FILTER SEMANTICS (AMENDED)
 *   Start Date (fromDate) -> "Task Assigned At" >= start of day
 *   End Date   (toDate)   -> "Task Assigned At" <= end   of day
 *   BOTH bounds filter the SAME field: Task Assigned At.
 *   The End Date is NEVER applied to "Engineer Completed At" any more.
 * ---------------------------------------------------------------------------
 */

import {
  normalizeToIso,
  timestampMs,
  durationInDays,
  startOfDayMs,
  endOfDayMs,
} from '@/lib/datetime-utils'

/** Tolerance (~15 minutes) kept for the legacy duration-based fallback path. */
export const ON_TIME_TOLERANCE_DAYS = 0.01

/** Roles allowed to see the performance / target columns and their averages. */
export const PERFORMANCE_ROLES = ['team_leader', 'director'] as const

/**
 * Kept ONLY for backward compatibility with older imports.
 *
 * IMPORTANT: this value is deliberately NOT applied any more. A task finished
 * in 1/20th of the allowed time legitimately produces >1000% and clamping it
 * is precisely what made the Performance Summary disagree with the Completed
 * Tasks view. Division by ~0 is prevented by MIN_SAFE_DURATION_DAYS instead.
 */
export const MAX_RATE_PERCENT = Number.POSITIVE_INFINITY

/** Below this many decimal days a duration is treated as "same instant". */
export const MIN_SAFE_DURATION_DAYS = 0.01

export type PerformanceBucket = 'early' | 'on_time' | 'delayed' | null

export interface PerformanceResult {
  bucket: PerformanceBucket
  /** early -> days saved | on_time -> days taken | delayed -> days late */
  value: number | null
}

/** Complete, per-task rate breakdown written into every exported row. */
export interface TaskRateBreakdown {
  bucket: PerformanceBucket
  /** Whole days between the effective target day and the actual day (UTC). */
  dayDelta: number | null
  /** EffectiveTargetCompletionDate - TaskAssignedAt, in decimal days. */
  targetDurationDays: number | null
  /** EngineerCompletedAt - TaskAssignedAt, in decimal days. */
  actualDurationDays: number | null
  /** early -> days saved | on_time -> days taken | delayed -> days late */
  bucketValue: number | null
  /** 1 when the task is early, else 0. */
  earlyFlag: number
  /** 1 when the task landed exactly on the target date, else 0. */
  onTimeFlag: number
  /** 1 when the task is delayed, else 0. */
  delayedFlag: number
  /** (Target / Actual) x 100 — only for EARLY tasks, else null. */
  earlyRate: number | null
  /** 100 for an ON-TIME task, else null. */
  onTimeRate: number | null
  /** (Target / Actual) x 100 — only for DELAYED tasks, else null. */
  delayedRate: number | null
  /** The rate that applies to THIS row (early / on-time / delayed). */
  taskRate: number | null
}

export interface PerformanceSummary {
  total: number
  earlyCount: number
  onTimeCount: number
  delayedCount: number
  /** Average of Early (days saved) */
  avgEarly: number
  /** Average On-Time (days taken) */
  avgOnTime: number
  /** Average Delayed (days late) */
  avgDelayed: number
  /** Average Target Day/s (derived from the effective / extended target) */
  avgTargetDays: number
  avgEngineerVariance: number

  /* ── Count based shares (how the workload is distributed) ─────────────── */
  /** earlyCount / total * 100 */
  earlyRate: number
  /** 100.00% when one or more tasks are on time, else 0.00% */
  onTimeRate: number
  /** delayedCount / total * 100 */
  delayRate: number

  /* ── Requested RATE totals (Division-Based, Averaged) ────────────────── */
  /** Average of the per-task (Target / Actual) x 100 over the EARLY tasks. */
  totalEarlyRate: number
  /** 100.00% when one or more tasks are on time, else 0.00%. */
  totalOnTimeRate: number
  /** Average of the per-task (Target / Actual) x 100 over the DELAYED tasks. */
  totalDelayedRate: number
  /** (Early Rate + Delay Rate + On-Time Rate) / 3, empty category = 100%. */
  overallEfficiency: number
  /** Kept for backward compatibility — same value as overallEfficiency. */
  totalCapacityEfficiency: number

  /* ── NEW: sample counts, required for a correct WEIGHTED overall row ──── */
  /** Early tasks that produced a measurable rate. */
  earlySampleCount: number
  /** Delayed tasks that produced a measurable rate. */
  delayedSampleCount: number
  /** Efficiency rating label shown by the grid. */
  rating: string
  /** True when Early Rate / Efficiency legitimately exceed 100%. */
  exceedsTarget: boolean
}

export interface CommentLike {
  comment_id?: number
  content: string
  author_name: string
  created_at: string
  comment_type?: string
}

export type CommentsMap = Record<number, CommentLike[]>

/** Everything needed to re-apply the role-based structure on the client. */
export interface RoleScopeContext {
  role: string
  userId?: number | string | null
  userName?: string | null
  shopId?: number | string | null
}

/** The state of the Completed Tasks filter bar (also used by the export). */
export interface CompletedTaskFilterState {
  /** "YYYY-MM-DD" — inclusive from 00:00 local time. Filters by Task Assigned At. */
  fromDate?: string | null
  /** "YYYY-MM-DD" — inclusive until 23:59:59.999 local time. Filters by Task Assigned At. */
  toDate?: string | null
  /** Empty / undefined => ALL engineers (still role-scoped). */
  engineerNames?: string[]
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Roles
 * ────────────────────────────────────────────────────────────────────────── */

export function canonicalizeRole(raw: any): string {
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'number') {
    const map: Record<string, string> = {
      0: 'team_leader', 1: 'director', 2: 'engineer', 3: 'customer',
      4: 'customer_personnel', 5: 'shop_tl', 6: 'manager', 7: 'admin', 8: 'shop_manager',
    }
    return map[String(raw)] ?? String(raw)
  }
  return String(raw).trim().toLowerCase().replace(/[\s\-_]+/g, '_')
}

/**
 * Only Team Leaders and Directors may see Target Day/s, Target Completion
 * Date, Early / On-Time / Delayed columns and every related rate.
 */
export function canViewPerformanceColumns(role: string): boolean {
  const canonical = canonicalizeRole(role)
  return (PERFORMANCE_ROLES as readonly string[]).includes(canonical)
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Display helpers
 * ────────────────────────────────────────────────────────────────────────── */

export function humanizeStatus(s: any): string {
  if (s === null || s === undefined) return 'N/A'
  if (typeof s === 'number') {
    const map: Record<number, string> = {
      0: 'Pending', 1: 'In Progress', 2: 'Completed', 3: 'Blocked', 4: 'On Hold', 5: 'Cancelled',
    }
    return map[s] ?? String(s)
  }
  const cleaned = String(s).toLowerCase().trim()
  if (cleaned === '') return 'N/A'
  if (cleaned.match(/completed|done|complete/)) return 'Completed'
  if (cleaned.match(/inprogress|in progress/)) return 'In Progress'
  if (cleaned.match(/pending/)) return 'Pending'
  if (cleaned.match(/blocked/)) return 'Blocked'
  if (cleaned.match(/onhold|on hold/)) return 'On Hold'
  if (cleaned.match(/cancelled|canceled/)) return 'Cancelled'
  return String(s).split(/[_\s-]+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export function parseAmendmentStatus(raw: any): number {
  if (raw === null || raw === undefined) return 0
  if (typeof raw === 'number' && !isNaN(raw)) return Number(raw)
  const v = String(raw).trim().toLowerCase()
  if (v === '') return 0
  if (v.includes('pending') && (v.includes('tl') || v.includes('review'))) return 0
  if (v.includes('forward') && v.includes('director')) return 1
  if (v.includes('approved') || v.includes('approve')) return 2
  if (v.includes('rejected') || v.includes('reject')) return 3
  const n = Number(raw)
  return isNaN(n) ? 0 : n
}

export function performanceLabel(bucket: PerformanceBucket): string {
  if (bucket === 'early') return 'Early'
  if (bucket === 'on_time') return 'On-Time'
  if (bucket === 'delayed') return 'Delayed'
  return 'N/A'
}

export function performanceBadgeClass(bucket: PerformanceBucket): string {
  const base = 'inline-flex items-center font-semibold px-2 py-1 rounded text-xs'
  if (bucket === 'early') return `${base} bg-green-600 text-white`
  if (bucket === 'on_time') return `${base} bg-blue-600 text-white`
  if (bucket === 'delayed') return `${base} bg-red-600 text-white`
  return `${base} bg-gray-200 text-gray-700`
}

/**
 * Rate formatter used by EVERY rate column, every export cell and the
 * View Details dialog.
 *
 * IMPORTANT: the value is NEVER clamped. An early task legitimately produces a
 * rate above 100% (or above 1000%) and that has to stay visible, otherwise the
 * Performance Summary and the Completed Tasks view drift apart again.
 */
export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return ''
  const value = Number(rate)
  if (!isFinite(value)) return '0.00%'
  return `${(Math.round(value * 100) / 100).toFixed(2)}%`
}

export function formatDays(value: number | null | undefined): string {
  if (value === null || value === undefined || !isFinite(Number(value))) return 'N/A'
  return Number(value).toFixed(2)
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Normalization
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Normalize one raw task record (Completed Tasks API **or** Performance
 * `task_breakdown` row) into the canonical shape every helper below expects.
 *
 * AMENDED: every alias the Performance API uses is accepted, so a breakdown
 * row and a completed-task row normalise to byte-identical fields.
 */
export function normalizeCompletedTask(t: any) {
  const completedTaskId = t.completedTaskId ?? t.completed_task_id ?? t.CompletedTaskId ?? null
  const originalId = t.originalTaskId ?? t.original_task_id ?? t.OriginalTaskId ?? null
  const displayTaskId = originalId ?? completedTaskId ?? t.task_id ?? t.id ?? t.taskId ?? 0

  let shopName = t.shopName ?? t.shop_name ?? t.ShopName ?? ''
  if (!shopName || shopName === 'Unknown') {
    shopName = t.shop?.name ?? t.shop?.Name ?? t.shop?.shop_name ?? ''
  }
  if (!shopName || String(shopName).trim() === '') shopName = 'Unknown'

  const rawAmendmentRequest = t.amendmentRequest ?? t.amendment_request ?? t.AmendmentRequest ?? 0
  const amendmentRequestFlag = !!(rawAmendmentRequest === true || Number(rawAmendmentRequest) === 1)

  // ─── deadline-extension aware target dates ───────────────────────────────
  const originalTarget = normalizeToIso(
    t.originalTargetCompletionDate ?? t.original_target_completion_date ?? t.OriginalTargetCompletionDate ?? null
  )
  const currentTarget = normalizeToIso(
    t.targetCompletionDate ?? t.target_completion_date ?? t.TargetCompletionDate ?? t.target_completion ?? null
  )
  const extendedTarget = normalizeToIso(
    t.extendedTargetCompletionDate ?? t.extended_target_completion_date ?? t.ExtendedTargetCompletionDate ??
    t.revisedTargetCompletionDate ?? t.revised_target_completion_date ?? t.RevisedTargetCompletionDate ??
    t.newTargetCompletionDate ?? t.new_target_completion_date ?? t.NewTargetCompletionDate ?? null
  )
  // The backend now also exposes the already-resolved effective target.
  const effectiveTarget = normalizeToIso(
    t.effectiveTargetCompletionDate ?? t.effective_target_completion_date ?? null
  )
  const storedEffectiveTarget = effectiveTarget ?? extendedTarget ?? currentTarget ?? originalTarget ?? null

  return {
    task_id: Number(displayTaskId ?? 0),
    completed_task_id: completedTaskId,
    original_task_id: originalId,
    serial_number: t.serialNumber ?? t.serial_number ?? t.SerialNumber ?? '',
    part_number: t.partNumber ?? t.part_number ?? t.PartNumber ?? '',
    description: t.description ?? t.Description ?? '',
    po_number: t.poNumber ?? t.po_number ?? t.PoNumber ?? '',
    category_id: t.categoryId ?? t.category_id ?? t.CategoryId ?? t.category?.id ?? t.category?.categoryId ?? null,
    category_name: t.categoryName ?? t.category_name ?? t.CategoryName ?? '',
    status: t.status ?? t.Status ?? 'Completed',
    assigned_engineer: t.assignedEngineer ?? t.assigned_engineer ?? t.assigned ?? '',
    priority_level_name: t.priorityName ?? t.priority_level_name ?? t.priority ?? '',
    created_by: t.createdBy ?? t.created_by ?? t.creator_id ?? null,
    creator_name: t.createdByName ?? t.creator_name ?? t.created_by_name ?? t.creator ?? '',

    original_target_completion_date: originalTarget,
    target_completion_date: currentTarget,
    extended_target_completion_date: extendedTarget,
    /** Stored deadline (already reflects an extension) — may still be null. */
    stored_target_completion_date: storedEffectiveTarget,

    actual_completion_date: normalizeToIso(
      t.actualCompletionDate ?? t.actual_completion_date ?? t.ActualCompletionDate ?? t.actual_completion ??
      t.completedAt ?? t.completed_at ?? t.CompletedAt ?? null
    ),
    attachment_path: t.attachmentPath ?? t.attachment_path ?? t.attachment ?? null,
    amendment_request: amendmentRequestFlag ? 1 : 0,
    amendment_status: parseAmendmentStatus(t.amendmentStatus ?? t.amendment_status ?? t.AmendmentStatus ?? null),
    amendment_reason: t.amendmentReason ?? t.amendment_reason ?? '',
    show_revision_alert: Boolean(t.showRevisionAlert ?? t.show_revision_alert ?? 0),
    is_duplicate: !!(t.isDuplicate ?? t.is_duplicate),
    is_reopened: !!(t.isReopened ?? t.is_reopened),
    reopen_count: Number(t.reopenCount ?? t.reopen_count ?? 0),
    shop_id: t.shopId ?? t.shop_id ?? null,
    shop_name: shopName,
    created_at: normalizeToIso(t.created_at ?? t.createdAt ?? t.CreatedAt ?? t.taskCreatedAt ?? t.TaskCreatedAt ?? null),
    updated_at: normalizeToIso(t.updated_at ?? t.updatedAt ?? t.UpdatedAt ?? t.taskUpdatedAt ?? t.TaskUpdatedAt ?? null),
    task_assigned_at: normalizeToIso(
      t.task_assigned_at ?? t.taskAssignedAt ?? t.TaskAssignedAt ?? t.assigned_at ?? t.assignedAt ?? t.AssignedAt ?? null
    ),
    engineer_completed_at: normalizeToIso(t.engineerCompletedAt ?? t.engineer_completed_at ?? t.EngineerCompletedAt ?? null),
    tl_approval_date: normalizeToIso(
      t.tlApprovalDate ?? t.tl_approval_date ?? t.TlApprovalDate ?? t.movedToCompletedAt ?? t.moved_to_completed_at ?? null
    ),
    comments: String(t.comments ?? t.Comments ?? t.comment ?? t.Comment ?? ''),
    is_completed_task: true,
    engineer_phone_number: t.engineerPhoneNumber ?? t.engineer_phone_number ?? t.EngineerPhoneNumber ?? null,
    creator_phone_number: t.creatorPhoneNumber ?? t.creator_phone_number ?? t.CreatorPhoneNumber ?? t.phoneExtension ?? null,
    phone_extension: t.phoneExtension ?? t.phone_extension ?? t.PhoneExtension ?? null,
    raw: t,
  }
}

/**
 * Deduplicate by display task id. A reopened + re-completed task produces
 * several completed_task rows that share the same originalTaskId; only the
 * most recent one may reach the table AND the export.
 */
export function deduplicateCompletedTasks(tasks: any[]): any[] {
  const map = new Map<number, any>()
  for (const t of tasks) {
    const key = Number(t?.task_id ?? 0)
    if (!key) continue
    const existing = map.get(key)
    if (!existing) {
      map.set(key, t)
      continue
    }
    const existingMs = timestampMs(existing.actual_completion_date) ?? 0
    const newMs = timestampMs(t.actual_completion_date) ?? 0
    if (newMs > existingMs) {
      map.set(key, t)
    } else if (newMs === existingMs) {
      if (Number(t.completed_task_id ?? 0) > Number(existing.completed_task_id ?? 0)) map.set(key, t)
    }
  }
  return Array.from(map.values())
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Engineer completion timestamp
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Variance baseline: "Task Assigned At", falling back to creation time.
 *
 * ROOT CAUSE NOTE: when the API omits `task_assigned_at` this silently returns
 * `created_at` and EVERY rate drifts towards 100%. The backend projection MUST
 * therefore always emit `task_assigned_at`.
 */
export function getVarianceStart(task: any): string | null {
  return (
    task?.task_assigned_at ??
    task?.taskAssignedAt ??
    task?.TaskAssignedAt ??
    task?.assigned_at ??
    task?.created_at ??
    null
  )
}

function isSystemApprovalComment(c: CommentLike): boolean {
  const content = String(c?.content ?? '').toUpperCase()
  return content.includes('[COMPLETION APPROVED') ||
         content.includes('[COMPLETION REJECTED') ||
         content.includes('[STATUS CHANGED') ||
         content.includes('[TASK APPROVED') ||
         content.includes('[TASK COMPLETED') ||
         content.includes('[APPROVED BY')
}

/**
 * Derive "Engineer Completed At" from the comment history when the backend
 * field is missing or identical to the TL approval timestamp, so the table AND
 * the export always use exactly the same actual completion timestamp.
 */
export function deriveEngineerCompletedAt(task: any, commentsMap: CommentsMap = {}): string | null {
  const tlApproved = task?.actual_completion_date ?? null
  const tlTime = timestampMs(tlApproved) ?? 0

  if (task?.engineer_completed_at) {
    if (!tlApproved) return task.engineer_completed_at
    const engTime = timestampMs(task.engineer_completed_at) ?? 0
    if (Math.abs(engTime - tlTime) > 30000) return task.engineer_completed_at
  }

  const taskComments = commentsMap[Number(task?.task_id)] ?? []
  if (taskComments.length === 0) return null

  const sortedAsc = [...taskComments].sort(
    (a, b) => (timestampMs(a.created_at) ?? 0) - (timestampMs(b.created_at) ?? 0)
  )
  const nonSystem = sortedAsc.filter(c => !isSystemApprovalComment(c) && c.created_at)

  // A) the non-system comment placed right before the TL approval comment
  const approvalIdx = sortedAsc.findIndex((c) => {
    const content = String(c.content ?? '').toUpperCase()
    return content.includes('[COMPLETION APPROVED') ||
           content.includes('[TASK APPROVED') ||
           content.includes('[APPROVED BY')
  })
  if (approvalIdx > 0) {
    for (let i = approvalIdx - 1; i >= 0; i--) {
      const candidate = sortedAsc[i]
      if (!isSystemApprovalComment(candidate) && candidate.created_at) return normalizeToIso(candidate.created_at)
    }
  }

  // B) the last comment authored by the assigned engineer
  const engineerName = String(task?.assigned_engineer ?? '').toLowerCase().trim()
  const engineerParts = engineerName.split(/[,\s]+/).map(p => p.trim()).filter(p => p.length > 1)
  if (engineerName && engineerParts.length > 0) {
    for (let i = sortedAsc.length - 1; i >= 0; i--) {
      const c = sortedAsc[i]
      if (isSystemApprovalComment(c)) continue
      const author = String(c.author_name ?? '').toLowerCase().trim()
      const isEngineer = engineerParts.some(part => author.includes(part)) ||
                         author.includes(engineerName.split(',')[0].trim())
      if (isEngineer && c.created_at) {
        const commentMs = timestampMs(c.created_at) ?? 0
        if (tlTime === 0 || commentMs <= tlTime + 30000) return normalizeToIso(c.created_at)
      }
    }
  }

  // C) a comment mentioning completion
  const keywords = ['completed', 'complete', 'done', 'finished', 'marked as completed', 'work completed']
  for (let i = sortedAsc.length - 1; i >= 0; i--) {
    const c = sortedAsc[i]
    if (isSystemApprovalComment(c)) continue
    const content = String(c.content ?? '').toLowerCase()
    if (keywords.some(kw => content.includes(kw)) && c.created_at) return normalizeToIso(c.created_at)
  }

  // D) the last non-system comment meaningfully before TL approval
  if (nonSystem.length > 0 && tlTime > 0) {
    for (let i = nonSystem.length - 1; i >= 0; i--) {
      const ms = timestampMs(nonSystem[i].created_at) ?? 0
      if (ms < tlTime - 30000) return normalizeToIso(nonSystem[i].created_at)
    }
  }

  // E) a single non-system comment and no TL timestamp at all
  if (nonSystem.length === 1 && !tlApproved) return normalizeToIso(nonSystem[0].created_at)

  return null
}

/**
 * THE actual completion timestamp used by every calculation:
 * Engineer Completed At, falling back to the TL approval timestamp so a task
 * is never left unclassified.
 */
export function resolveActualCompletion(
  task: any,
  engineerCompletedAt?: string | null
): string | null {
  return (
    engineerCompletedAt ??
    task?.engineer_completed_at ??
    task?.actual_completion_date ??
    task?.tl_approval_date ??
    null
  )
}

/**
 * STORED-ONLY variant used by the Performance Summary, the View Details dialog
 * and both Performance exports. It deliberately ignores comment-derived
 * heuristics so the grid can never disagree with the export.
 */
export function resolveStoredActualCompletion(task: any): string | null {
  return (
    task?.engineer_completed_at ??
    task?.actual_completion_date ??
    task?.tl_approval_date ??
    null
  )
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Target Completion Date (deadline extensions)
 * ────────────────────────────────────────────────────────────────────────── */

/** Configured target duration (decimal days) for the task's category. */
export function getTargetDurationDays(task: any, targetDaysData: any[]): number | null {
  if (!targetDaysData || targetDaysData.length === 0) return null
  const taskCategoryId = task?.category_id ?? null
  const taskCategoryName = String(task?.category_name ?? '').trim().toLowerCase()

  const entry = targetDaysData.find((td: any) => {
    const tdCategoryId = td.category_id ?? td.categoryId ?? td.CategoryId ?? td.category?.id ?? null
    if (taskCategoryId != null && tdCategoryId != null && String(tdCategoryId) === String(taskCategoryId)) return true
    const tdName = String(td.category_name ?? td.categoryName ?? td.CategoryName ?? td.category?.name ?? '').trim().toLowerCase()
    return tdName !== '' && tdName === taskCategoryName
  })
  if (!entry) return null

  const days = Number(entry.target_days ?? entry.targetDays ?? entry.TargetDays ?? entry.days ?? 0) || 0
  const hours = Number(entry.target_hours ?? entry.targetHours ?? entry.TargetHours ?? 0) || 0
  const minutes = Number(entry.target_minutes ?? entry.targetMinutes ?? entry.TargetMinutes ?? 0) || 0
  const total = days + hours / 24 + minutes / 1440
  if (!isFinite(total) || total <= 0) return null
  return Math.round(total * 100) / 100
}

/** The ORIGINAL deadline: Task Assigned At + configured Target Day/s. */
export function getBaselineTargetCompletion(task: any, targetDaysData: any[]): string | null {
  const configured = getTargetDurationDays(task, targetDaysData)
  const start = timestampMs(getVarianceStart(task))
  if (configured === null || start === null) return null
  return new Date(start + configured * 86400000).toISOString()
}

/**
 * THE deadline every metric is measured against.
 * Priority: stored / extended target_completion_date -> baseline.
 */
export function getEffectiveTargetCompletion(task: any, targetDaysData: any[]): string | null {
  const stored = task?.stored_target_completion_date ??
                 task?.effective_target_completion_date ??
                 task?.extended_target_completion_date ??
                 task?.target_completion_date ??
                 null
  if (stored) return normalizeToIso(stored)
  return getBaselineTargetCompletion(task, targetDaysData)
}

/** True when the deadline was pushed beyond the original baseline. */
export function isTargetExtended(task: any, targetDaysData: any[]): boolean {
  const effectiveMs = timestampMs(getEffectiveTargetCompletion(task, targetDaysData))
  const baselineMs = timestampMs(getBaselineTargetCompletion(task, targetDaysData))
  const originalMs = timestampMs(task?.original_target_completion_date)
  if (effectiveMs === null) return false
  if (originalMs !== null && effectiveMs - originalMs > ON_TIME_TOLERANCE_DAYS * 86400000) return true
  if (baselineMs !== null && effectiveMs - baselineMs > ON_TIME_TOLERANCE_DAYS * 86400000) return true
  return false
}

/** Target Day/s derived from the effective (possibly extended) target date. */
export function getTargetDaysValue(task: any, targetDaysData: any[]): number | null {
  const fromDates = durationInDays(getVarianceStart(task), getEffectiveTargetCompletion(task, targetDaysData))
  if (fromDates !== null && fromDates > 0) return fromDates
  return getTargetDurationDays(task, targetDaysData)
}

/** Real duration taken until completion, in decimal days. */
export function getEngineerVarianceDays(task: any, engineerCompletedAt?: string | null): number | null {
  return durationInDays(getVarianceStart(task), resolveActualCompletion(task, engineerCompletedAt))
}

/** TL Approved Variance in decimal days. */
export function getTlApprovedVarianceDays(task: any): number | null {
  return durationInDays(getVarianceStart(task), task?.actual_completion_date ?? null)
}

/* ─────────────────────────────────────────────────────────────────────────────
 * THE CLASSIFICATION  (calendar-day parity with the .NET PerformanceService)
 * ────────────────────────────────────────────────────────────────────────── */

/** Epoch ms of the UTC calendar day (time component removed). */
function utcDayMs(value?: string | number | Date | null): number | null {
  const ms = timestampMs(value)
  if (ms === null) return null
  return Math.floor(ms / 86400000) * 86400000
}

/**
 * Whole days between the ACTUAL completion day and the TARGET day, both in
 * UTC, exactly like `(actual.Date - target.Date).Days` on the backend.
 *   < 0 -> early | 0 -> on the target date | > 0 -> delayed
 */
export function getCompletionDayDelta(
  task: any,
  targetDaysData: any[],
  engineerCompletedAt?: string | null
): number | null {
  const targetDay = utcDayMs(getEffectiveTargetCompletion(task, targetDaysData))
  const actualDay = utcDayMs(resolveActualCompletion(task, engineerCompletedAt))
  if (targetDay === null || actualDay === null) return null
  return Math.round((actualDay - targetDay) / 86400000)
}

/**
 * Early / On-Time / Delayed measured against the EFFECTIVE (extended) target
 * completion date at CALENDAR-DAY granularity, so the Excel workbook and the
 * Performance tab always agree.
 */
export function classifyPerformance(
  task: any,
  targetDaysData: any[],
  engineerCompletedAt?: string | null
): PerformanceResult {
  const completed = resolveActualCompletion(task, engineerCompletedAt)
  const dayDelta = getCompletionDayDelta(task, targetDaysData, completed)

  if (dayDelta !== null) {
    if (dayDelta < 0) return { bucket: 'early', value: Math.abs(dayDelta) }
    if (dayDelta > 0) return { bucket: 'delayed', value: dayDelta }
    const taken = getEngineerVarianceDays(task, completed)
    return { bucket: 'on_time', value: taken === null ? 0 : Math.max(taken, 0) }
  }

  // No usable target date: fall back to the configured duration.
  const configured = getTargetDurationDays(task, targetDaysData)
  const actualDays = getEngineerVarianceDays(task, completed)
  if (configured === null || actualDays === null) return { bucket: null, value: null }
  const delta = Math.round((actualDays - configured) * 100) / 100
  if (delta < -ON_TIME_TOLERANCE_DAYS) return { bucket: 'early', value: Math.abs(delta) }
  if (delta > ON_TIME_TOLERANCE_DAYS) return { bucket: 'delayed', value: delta }
  return { bucket: 'on_time', value: Math.max(actualDays, 0) }
}

/** Round to 2 decimals, guarding NaN / Infinity. */
function round2(value: number): number {
  if (!isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

/**
 * (Target / Actual) x 100 — the single formula behind BOTH the Early Rate and
 * the Delayed Rate. Both durations are measured from "Task Assigned At":
 *
 *   finished in half the allowed time  -> 200.00%  (early, higher = better)
 *   finished exactly on the target     -> 100.00%
 *   took twice the allowed time        ->  50.00%  (delayed, lower = worse)
 *
 * Returns null when either duration is unknown or the target span is not
 * positive.
 *
 * NO UPPER CAP: a task delivered in 1/20th of the allowed time is a genuine
 * 2000%+. Division by ~0 is prevented by MIN_SAFE_DURATION_DAYS only.
 */
export function calculateRatioRate(
  targetDurationDays: number | null,
  actualDurationDays: number | null
): number | null {
  if (targetDurationDays === null || actualDurationDays === null) return null
  if (!isFinite(targetDurationDays) || !isFinite(actualDurationDays)) return null
  if (targetDurationDays <= 0) return null

  // A completion at (or before) the assignment instant would divide by ~0.
  const safeActual = actualDurationDays > MIN_SAFE_DURATION_DAYS
    ? actualDurationDays
    : MIN_SAFE_DURATION_DAYS
  const rate = (targetDurationDays / safeActual) * 100
  return round2(rate)
}

/**
 * THE per-task calculation used by the Completed Tasks table, its Excel export,
 * the Performance Summary grid, the View Details dialog and both Performance
 * exports — one single source of truth.
 */
export function calculateTaskRates(
  task: any,
  targetDaysData: any[],
  engineerCompletedAt?: string | null
): TaskRateBreakdown {
  const completedAt = resolveActualCompletion(task, engineerCompletedAt)
  const perf = classifyPerformance(task, targetDaysData, completedAt)
  const dayDelta = getCompletionDayDelta(task, targetDaysData, completedAt)
  const targetDurationDays = getTargetDaysValue(task, targetDaysData)
  const actualDurationDays = getEngineerVarianceDays(task, completedAt)
  const ratio = calculateRatioRate(targetDurationDays, actualDurationDays)

  const earlyFlag = perf.bucket === 'early' ? 1 : 0
  const onTimeFlag = perf.bucket === 'on_time' ? 1 : 0
  const delayedFlag = perf.bucket === 'delayed' ? 1 : 0

  // ON-TIME: the task hit the target date, therefore it is 100% on time.
  const onTimeRate = onTimeFlag === 1 ? 100 : null
  // EARLY: Target / Actual x 100 -> above 100%, the earlier the higher.
  const earlyRate = earlyFlag === 1 ? (ratio === null ? null : Math.max(ratio, 100)) : null
  // DELAYED: Target / Actual x 100 -> below 100%, the later the lower.
  const delayedRate = delayedFlag === 1 ? (ratio === null ? null : Math.min(ratio, 100)) : null

  return {
    bucket: perf.bucket,
    dayDelta,
    targetDurationDays,
    actualDurationDays,
    bucketValue: perf.value,
    earlyFlag,
    onTimeFlag,
    delayedFlag,
    earlyRate,
    onTimeRate,
    delayedRate,
    taskRate: earlyRate ?? onTimeRate ?? delayedRate ?? null,
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Role scoping + date-range / engineer filtering
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * DEPRECATED for filtering. Kept only for legacy display code.
 * The date range NEVER filters on a completion timestamp any more — both
 * bounds use "Task Assigned At" (see filterCompletedTasks).
 */
export function resolveCompletionDate(task: any): string | null {
  return (
    task?.actual_completion_date ??
    task?.tl_approval_date ??
    task?.engineer_completed_at ??
    null
  )
}

/** THE field both date bounds are applied to: "Task Assigned At". */
export function resolveAssignedAtForFilter(task: any): string | null {
  return (
    task?.task_assigned_at ??
    task?.taskAssignedAt ??
    task?.TaskAssignedAt ??
    task?.assigned_at ??
    task?.created_at ??
    null
  )
}

/** Split "A, B" style engineer values into comparable tokens. */
export function splitEngineerNames(value: any): string[] {
  return String(value ?? '')
    .split(',')
    .map(v => v.trim().toLowerCase())
    .filter(v => v.length > 0)
}

export function matchesEngineerFilter(task: any, selectedLowerNames: string[]): boolean {
  if (!selectedLowerNames || selectedLowerNames.length === 0) return true
  const taskNames = splitEngineerNames(task?.assigned_engineer)
  if (taskNames.length === 0) return false
  return selectedLowerNames.some(selected =>
    taskNames.some(name => name === selected || name.includes(selected) || selected.includes(name))
  )
}

/**
 * Re-apply the ROLE-BASED STRUCTURE on the client (defence-in-depth), so the
 * export can never contain a row the current role must not see.
 */
export function scopeTasksByRole(tasks: any[], ctx: RoleScopeContext): any[] {
  const role = canonicalizeRole(ctx?.role)
  const list = Array.isArray(tasks) ? tasks : []

  if (['team_leader', 'director', 'admin', 'manager'].includes(role)) return list

  const userId = Number(ctx?.userId ?? NaN)
  const userName = String(ctx?.userName ?? '').trim().toLowerCase()
  const shopId = ctx?.shopId === null || ctx?.shopId === undefined ? null : Number(ctx.shopId)

  if (role === 'engineer') {
    if (!userName && !isFinite(userId)) return []
    return list.filter((t) => {
      const names = splitEngineerNames(t?.assigned_engineer)
      const assignedToMe = userName !== '' && names.some(n => n === userName || n.includes(userName) || userName.includes(n))
      const createdByMe = isFinite(userId) && Number(t?.created_by ?? NaN) === userId
      return assignedToMe || createdByMe
    })
  }

  if (role === 'customer' || role === 'customer_personnel') {
    if (!isFinite(userId) && !userName) return []
    return list.filter((t) => {
      const createdByMe = isFinite(userId) && Number(t?.created_by ?? NaN) === userId
      const creatorName = String(t?.creator_name ?? '').toLowerCase()
      return createdByMe || (userName !== '' && creatorName.includes(userName))
    })
  }

  if (role === 'shop_tl' || role === 'shop_manager') {
    if (shopId === null || !isFinite(shopId)) return list
    return list.filter((t) => {
      const taskShopId = Number(t?.shop_id ?? NaN)
      return !isFinite(taskShopId) ? true : taskShopId === shopId
    })
  }

  if (isFinite(userId)) return list.filter(t => Number(t?.created_by ?? NaN) === userId)
  return []
}

/**
 * THE single filter used by the Completed Tasks table, its Excel export, the
 * Performance Summary, the View Details dialog and both Performance exports.
 *
 * AMENDED DATE RANGE SEMANTICS:
 *   Start Date (fromDate) -> "Task Assigned At" >= start of the selected day
 *   End Date   (toDate)   -> "Task Assigned At" <= end   of the selected day
 *
 * BOTH bounds filter the SAME field. The End Date is NO LONGER applied to
 * "Engineer Completed At", which used to include/exclude different rows on the
 * two screens and was one of the reported inconsistencies.
 */
export function filterCompletedTasks(tasks: any[], filters: CompletedTaskFilterState | null | undefined): any[] {
  const list = Array.isArray(tasks) ? tasks : []
  const fromMs = filters?.fromDate ? startOfDayMs(filters.fromDate) : null
  const toMs = filters?.toDate ? endOfDayMs(filters.toDate) : null
  const selected = (filters?.engineerNames ?? []).map(n => String(n).trim().toLowerCase()).filter(Boolean)

  const rangeActive = fromMs !== null || toMs !== null

  return list.filter((t) => {
    if (rangeActive) {
      // BOTH Start Date and End Date filter by "Task Assigned At"
      const assignedMs = timestampMs(resolveAssignedAtForFilter(t))

      // Start Date: Tasks assigned on or after this date
      if (fromMs !== null) {
        if (assignedMs === null) return false
        if (assignedMs < fromMs) return false
      }

      // End Date: Tasks assigned up to this date
      if (toMs !== null) {
        if (assignedMs === null) return false
        if (assignedMs > toMs) return false
      }
    }
    if (!matchesEngineerFilter(t, selected)) return false
    return true
  })
}

/** Distinct engineer names present in the (already role-scoped) list. */
export function collectEngineerOptions(tasks: any[]): string[] {
  const set = new Map<string, string>()
  for (const t of tasks ?? []) {
    for (const raw of String(t?.assigned_engineer ?? '').split(',')) {
      const name = raw.trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (!set.has(key)) set.set(key, name)
    }
  }
  return Array.from(set.values()).sort((a, b) => a.localeCompare(b))
}

/** Human readable description of the active filters (titles / file names). */
export function describeFilters(filters: CompletedTaskFilterState | null | undefined): string {
  const parts: string[] = []
  if (filters?.fromDate || filters?.toDate) {
    parts.push(`Task Assigned At: ${filters?.fromDate || 'any'} → ${filters?.toDate || 'any'}`)
  } else {
    parts.push('All dates')
  }
  const engineers = filters?.engineerNames ?? []
  parts.push(engineers.length === 0 ? 'All engineers' : engineers.join(', '))
  return parts.join(' | ')
}

/** Filename-safe suffix for the exported workbook. */
export function buildExportFileSuffix(filters: CompletedTaskFilterState | null | undefined): string {
  const range = filters?.fromDate || filters?.toDate
    ? `${filters?.fromDate || 'start'}_to_${filters?.toDate || 'today'}`
    : 'all-dates'
  const engineers = filters?.engineerNames ?? []
  const who = engineers.length === 0
    ? 'all-engineers'
    : engineers.length === 1
      ? engineers[0]
      : `${engineers.length}-engineers`
  return `${range}_${who}`.replace(/[^a-z0-9_\-]/gi, '_')
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Aggregation (restricted to Team Leader / Director)
 * ────────────────────────────────────────────────────────────────────────── */

const EMPTY_SUMMARY: PerformanceSummary = {
  total: 0, earlyCount: 0, onTimeCount: 0, delayedCount: 0,
  avgEarly: 0, avgOnTime: 0, avgDelayed: 0,
  avgTargetDays: 0, avgEngineerVariance: 0,
  earlyRate: 0, onTimeRate: 0, delayRate: 0,
  totalEarlyRate: 0, totalOnTimeRate: 0, totalDelayedRate: 0,
  overallEfficiency: 0, totalCapacityEfficiency: 0,
  earlySampleCount: 0, delayedSampleCount: 0,
  rating: 'No Data', exceedsTarget: false,
}

export function averageOf(values: number[]): number {
  if (!values || values.length === 0) return 0
  return round2(values.reduce((a, v) => a + v, 0) / values.length)
}

/** Efficiency rating label — shared by the grid, the dialog and the exports. */
export function deriveRating(efficiency: number, completedCount: number): string {
  if (completedCount <= 0) return 'No Data'
  if (efficiency > 100) return 'Outstanding'
  if (efficiency >= 85) return 'Excellent'
  if (efficiency >= 70) return 'Good'
  if (efficiency >= 50) return 'Fair'
  return 'Needs Improvement'
}

/**
 * Efficiency = (Early Rate + Delay Rate + On-Time Rate) / 3, an EMPTY category
 * counted as a neutral 100%.
 *
 * Note: because the On-Time Rate is 100% whenever at least one task is on time
 * and the neutral value is also 100%, the On-Time component is ALWAYS 100.
 * Worked example (Mahlet Lemma, 07/2026):
 *      (2006.62 + 59.84 + 100) / 3 = 722.15  ✔
 */
export function calculateEfficiency(params: {
  earlyRate: number
  delayRate: number
  onTimeRate: number
  earlySampleCount: number
  delayedSampleCount: number
  onTimeCount: number
}): number {
  const effEarly = params.earlySampleCount > 0 ? params.earlyRate : 100
  const effDelay = params.delayedSampleCount > 0 ? params.delayRate : 100
  const effOnTime = params.onTimeCount > 0 ? params.onTimeRate : 100
  return round2((effEarly + effDelay + effOnTime) / 3)
}

/**
 * Aggregate the FILTERED rows into the business totals.
 *
 * `enabled` must be `canViewPerformanceColumns(role)` so a non-privileged role
 * never receives the values, not even in memory.
 *
 * RATE FORMULAS (Division-Based, Averaged):
 *   On-Time Rate = 100.00% when one or more tasks landed exactly on target
 *   Early Rate   = AVERAGE of the per-task early rates   (no upper cap)
 *   Delay Rate   = AVERAGE of the per-task delayed rates
 *   Efficiency   = (Early + Delay + On-Time) / 3, empty category = 100%
 */
export function buildPerformanceSummary(
  tasks: any[],
  targetDaysData: any[],
  enabled: boolean,
  resolveCompletedAt?: (task: any) => string | null
): PerformanceSummary {
  if (!enabled || !tasks || tasks.length === 0) return { ...EMPTY_SUMMARY }

  const buckets: Record<'early' | 'on_time' | 'delayed', number[]> = { early: [], on_time: [], delayed: [] }
  const earlyRates: number[] = []
  const delayedRates: number[] = []
  const targetDaysValues: number[] = []
  const varianceValues: number[] = []

  let unclassified = 0

  for (const t of tasks) {
    const completedAt = resolveCompletedAt ? resolveCompletedAt(t) : null
    const breakdown = calculateTaskRates(t, targetDaysData, completedAt)

    if (breakdown.bucket && breakdown.bucketValue !== null) {
      buckets[breakdown.bucket].push(breakdown.bucketValue)
    } else if (!breakdown.bucket) {
      // A completed task with no comparable target counts as ON-TIME, so that
      // Early + On-Time + Delayed === Completed on EVERY screen.
      unclassified++
    }
    if (breakdown.earlyRate !== null) earlyRates.push(breakdown.earlyRate)
    if (breakdown.delayedRate !== null) delayedRates.push(breakdown.delayedRate)

    if (breakdown.targetDurationDays !== null) targetDaysValues.push(breakdown.targetDurationDays)
    if (breakdown.actualDurationDays !== null) varianceValues.push(breakdown.actualDurationDays)
  }

  const total = tasks.length
  const earlyCount = buckets.early.length
  const onTimeCount = buckets.on_time.length + unclassified
  const delayedCount = buckets.delayed.length

  const share = (count: number) => (total > 0 ? round2((count / total) * 100) : 0)

  // ─── RATE TOTALS (Division-Based, Averaged) ──────────────────────────────
  const totalOnTimeRate = onTimeCount > 0 ? 100 : 0
  const totalEarlyRate = averageOf(earlyRates)
  const totalDelayedRate = averageOf(delayedRates)

  const overallEfficiency = calculateEfficiency({
    earlyRate: totalEarlyRate,
    delayRate: totalDelayedRate,
    onTimeRate: totalOnTimeRate,
    earlySampleCount: earlyRates.length,
    delayedSampleCount: delayedRates.length,
    onTimeCount,
  })

  return {
    total,
    earlyCount,
    onTimeCount,
    delayedCount,
    avgEarly: averageOf(buckets.early),
    avgOnTime: averageOf(buckets.on_time),
    avgDelayed: averageOf(buckets.delayed),
    avgTargetDays: averageOf(targetDaysValues),
    avgEngineerVariance: averageOf(varianceValues),
    earlyRate: share(earlyCount),
    onTimeRate: totalOnTimeRate,
    delayRate: share(delayedCount),
    totalEarlyRate,
    totalOnTimeRate,
    totalDelayedRate,
    overallEfficiency,
    totalCapacityEfficiency: overallEfficiency,
    earlySampleCount: earlyRates.length,
    delayedSampleCount: delayedRates.length,
    rating: deriveRating(overallEfficiency, total),
    exceedsTarget: totalEarlyRate > 100 || overallEfficiency > 100,
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * NEW — shared aggregate used by Performance Summary / View Details / exports
 * ────────────────────────────────────────────────────────────────────────── */

/** Grid-friendly aggregate. Identical numbers to buildPerformanceSummary(). */
export interface RateAggregate {
  completedCount: number
  earlyCount: number
  onTimeCount: number
  delayedCount: number
  earlySampleCount: number
  delayedSampleCount: number
  /** ACCURATE average of the early per-task rates — NEVER clamped. */
  earlyRate: number
  /** ACCURATE average of the delayed per-task rates. */
  delayRate: number
  onTimeRate: number
  efficiency: number
  rating: string
  exceedsTarget: boolean
}

export const EMPTY_RATE_AGGREGATE: RateAggregate = {
  completedCount: 0,
  earlyCount: 0,
  onTimeCount: 0,
  delayedCount: 0,
  earlySampleCount: 0,
  delayedSampleCount: 0,
  earlyRate: 0,
  delayRate: 0,
  onTimeRate: 0,
  efficiency: 0,
  rating: 'No Data',
  exceedsTarget: false,
}

/**
 * THE function the Performance Summary grid, the View Details dialog,
 * "Export All to Excel" and "Export Selected" must all call.
 *
 * It intentionally accepts RAW rows (Completed Tasks records OR Performance
 * `task_breakdown` rows), normalises them with `normalizeCompletedTask()` and
 * then reuses `calculateTaskRates()`. Because normalisation and the formula
 * live in ONE place, the four views can no longer diverge.
 *
 * @param rawTasks       already role-scoped and date/engineer filtered rows
 * @param targetDaysData Category Target Days configuration
 */
export function buildRateAggregate(rawTasks: any[], targetDaysData: any[]): RateAggregate {
  const list = Array.isArray(rawTasks) ? rawTasks : []
  if (list.length === 0) return { ...EMPTY_RATE_AGGREGATE }

  const earlyRates: number[] = []
  const delayedRates: number[] = []
  let completedCount = 0
  let earlyCount = 0
  let onTimeCount = 0
  let delayedCount = 0

  for (const raw of list) {
    const task = raw?.is_completed_task === true ? raw : normalizeCompletedTask(raw)

    // Only rows with a real completion timestamp participate.
    const completedAt = resolveStoredActualCompletion(task)
    if (completedAt === null || timestampMs(completedAt) === null) continue
    completedCount++

    const breakdown = calculateTaskRates(task, targetDaysData, completedAt)

    if (breakdown.bucket === 'early') {
      earlyCount++
      if (breakdown.earlyRate !== null) earlyRates.push(breakdown.earlyRate)
    } else if (breakdown.bucket === 'delayed') {
      delayedCount++
      if (breakdown.delayedRate !== null) delayedRates.push(breakdown.delayedRate)
    } else {
      // 'on_time' AND null both land here -> Early + On-Time + Delayed = Completed
      onTimeCount++
    }
  }

  const earlyRate = averageOf(earlyRates)
  const delayRate = averageOf(delayedRates)
  const onTimeRate = onTimeCount > 0 ? 100 : 0

  const efficiency = calculateEfficiency({
    earlyRate,
    delayRate,
    onTimeRate,
    earlySampleCount: earlyRates.length,
    delayedSampleCount: delayedRates.length,
    onTimeCount,
  })

  return {
    completedCount,
    earlyCount,
    onTimeCount,
    delayedCount,
    earlySampleCount: earlyRates.length,
    delayedSampleCount: delayedRates.length,
    earlyRate,
    delayRate,
    onTimeRate,
    efficiency,
    rating: deriveRating(efficiency, completedCount),
    exceedsTarget: earlyRate > 100 || efficiency > 100,
  }
}

/**
 * "Overall Total" row: a WEIGHTED average over the engineers, weighted by the
 * number of tasks that actually CONTRIBUTED a rate (sample counts, not bucket
 * counts). This is mathematically identical to averaging every underlying
 * per-task rate at once, so the footer row matches the task-level data too.
 */
export function combineRateAggregates(rows: RateAggregate[]): RateAggregate {
  if (!rows || rows.length === 0) return { ...EMPTY_RATE_AGGREGATE }

  const sum = (pick: (r: RateAggregate) => number) => rows.reduce((s, r) => s + pick(r), 0)

  const earlySampleCount = sum(r => r.earlySampleCount)
  const delayedSampleCount = sum(r => r.delayedSampleCount)
  const onTimeCount = sum(r => r.onTimeCount)

  const earlyRate = earlySampleCount > 0
    ? round2(sum(r => r.earlyRate * r.earlySampleCount) / earlySampleCount)
    : 0
  const delayRate = delayedSampleCount > 0
    ? round2(sum(r => r.delayRate * r.delayedSampleCount) / delayedSampleCount)
    : 0
  const onTimeRate = onTimeCount > 0 ? 100 : 0

  const completedCount = sum(r => r.completedCount)
  const efficiency = calculateEfficiency({
    earlyRate,
    delayRate,
    onTimeRate,
    earlySampleCount,
    delayedSampleCount,
    onTimeCount,
  })

  return {
    completedCount,
    earlyCount: sum(r => r.earlyCount),
    onTimeCount,
    delayedCount: sum(r => r.delayedCount),
    earlySampleCount,
    delayedSampleCount,
    earlyRate,
    delayRate,
    onTimeRate,
    efficiency,
    rating: deriveRating(efficiency, completedCount),
    exceedsTarget: earlyRate > 100 || efficiency > 100,
  }
}