/**
 * target-completion.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * LAYER 2 — SINGLE SOURCE OF TRUTH FOR THE "Target Completion" DEADLINE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REPORTED DEFECT (the business-rule half of the bug)
 *   Task Details → Timeline
 *       Task Assigned At  : Aug 21, 2026 at 9:05:53 AM GMT+3
 *       Target Completion : Aug 21, 2026 at 9:05:00 AM GMT+3   ← already elapsed
 *   Update Task → Status & Timeline
 *       Task Assigned At  : Aug 21, 2026 at 9:05:53 AM GMT+3
 *       Target Completion : 08/21/2026 09:35 AM                ← assigned + 30 min
 *
 * WHY THE TWO SCREENS DISAGREED
 *   The deadline is not a free-form date. By business rule:
 *
 *       Target Completion = Task Assigned At + category target duration
 *
 *   `UpdateTaskModal` already recalculated that value IN MEMORY when the stored
 *   one had elapsed, and persisted it only on Save. `TaskDetails` printed the
 *   RAW STORED value. So until somebody opened the modal and pressed Save, the
 *   two screens legitimately showed two different deadlines — and the Timeline
 *   showed a deadline BEFORE the assignment moment.
 *
 * THE FIX
 *   Every screen (Task Details, Update Task, TaskTable, Completed Tasks,
 *   exports, KPI) calls `resolveTimelineTarget()` / `resolveTaskTimelineTarget()`
 *   from this module, so all of them apply the same rule to the same inputs and
 *   cannot diverge. Task Details additionally flags a recalculated value as
 *   "pending save" instead of rendering an impossible timeline.
 *
 * Every timestamp handled here is a normalized ISO-8601 UTC string produced by
 * `datetime-utils.ts`, so a value serialized by .NET without a "Z" can never be
 * misread as browser-local time.
 */

import {
  formatDurationMs,
  normalizeToIso,
  pickTimestamp,
  timestampMs,
  flattenTaskSource,
} from './datetime-utils'

/* ═════════════════════════ field resolution ═════════════════════════════ */

/** Field names used across the API for "Task Assigned At". */
export const ASSIGNED_AT_FIELDS = [
  'task_assigned_at',
  'taskAssignedAt',
  'TaskAssignedAt',
  'assigned_at',
  'assignedAt',
  'AssignedAt',
] as const

/** Field names used across the API for the stored Target Completion. */
export const STORED_TARGET_FIELDS = [
  'target_completion_date',
  'targetCompletionDate',
  'TargetCompletionDate',
  'target_completion',
] as const

/** Field names used for the pre-extension (original) Target Completion. */
export const ORIGINAL_TARGET_FIELDS = [
  'originalTargetCompletionDate',
  'original_target_completion_date',
  'OriginalTargetCompletionDate',
] as const

/** Field names used for an extended / revised / new Target Completion. */
export const EXTENDED_TARGET_FIELDS = [
  'extendedTargetCompletionDate',
  'extended_target_completion_date',
  'ExtendedTargetCompletionDate',
  'revisedTargetCompletionDate',
  'revised_target_completion_date',
  'RevisedTargetCompletionDate',
  'newTargetCompletionDate',
  'new_target_completion_date',
  'NewTargetCompletionDate',
] as const

/** Field names used for task creation time (fallback anchor). */
export const CREATED_AT_FIELDS = [
  'created_at',
  'createdAt',
  'CreatedAt',
] as const

/** Normalized ISO-8601 UTC "Task Assigned At", or null when not yet assigned. */
export function resolveAssignedAtIso(task: any): string | null {
  return pickTimestamp(task, [...ASSIGNED_AT_FIELDS])
}

/** Normalized ISO-8601 UTC stored Target Completion, or null. */
export function resolveStoredTargetIso(task: any): string | null {
  return pickTimestamp(task, [...STORED_TARGET_FIELDS])
}

/** Normalized ISO-8601 UTC original (pre-extension) Target Completion, or null. */
export function resolveOriginalTargetIso(task: any): string | null {
  return pickTimestamp(task, [...ORIGINAL_TARGET_FIELDS])
}

/** Normalized ISO-8601 UTC extended / revised Target Completion, or null. */
export function resolveExtendedTargetIso(task: any): string | null {
  return pickTimestamp(task, [...EXTENDED_TARGET_FIELDS])
}

/** Normalized ISO-8601 UTC creation time, or null. */
export function resolveCreatedAtIso(task: any): string | null {
  return pickTimestamp(task, [...CREATED_AT_FIELDS])
}

/**
 * The anchor the deadline is measured from: Task Assigned At when present,
 * otherwise the creation time (a task created but not yet assigned still needs
 * a deadline on screen).
 */
export function resolveDeadlineAnchorIso(task: any): {
  anchorIso: string | null
  anchorSource: 'assigned' | 'created' | 'none'
} {
  const assigned = resolveAssignedAtIso(task)
  if (assigned) return { anchorIso: assigned, anchorSource: 'assigned' }
  const created = resolveCreatedAtIso(task)
  if (created) return { anchorIso: created, anchorSource: 'created' }
  return { anchorIso: null, anchorSource: 'none' }
}

/** Read the category id / name from a task in any casing variant. */
export function resolveCategoryRef(task: any): {
  categoryId: number | string | ''
  categoryName: string
} {
  const source = flattenTaskSource(task)
  const rawId =
    source.category_id ?? source.categoryId ?? source.CategoryId ?? source.category ?? ''
  const categoryId = typeof rawId === 'object' && rawId !== null ? (rawId.id ?? '') : rawId
  const categoryName = String(
    source.category_name ??
      source.categoryName ??
      source.CategoryName ??
      source.category_name_display ??
      (typeof source.category === 'string' ? source.category : '') ??
      ''
  )
  return {
    categoryId: categoryId === null || categoryId === undefined ? '' : categoryId,
    categoryName,
  }
}

/* ═══════════════════ category target duration (the SLA) ═════════════════ */

/** Endpoints that expose the "Category Target Duration" configuration. */
export const TARGET_DURATION_ENDPOINTS = [
  '/api/management/target-days',
  '/api/reference-data/target-days',
] as const

/**
 * Load the target-duration configuration. The management endpoint is tried
 * first (TL / Director / Engineer) with the reference-data endpoint as a
 * fallback — mirroring the Completed Tasks and KPI pages.
 */
export async function fetchTargetDurationConfig(): Promise<any[]> {
  for (const url of TARGET_DURATION_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-cache',
      })
      if (!res.ok) continue
      const body = await res.json().catch(() => null)
      const list = Array.isArray(body) ? body : body?.data ?? body?.targetDays ?? []
      if (Array.isArray(list) && list.length > 0) return list
    } catch {
      // try the next endpoint
    }
  }
  return []
}

/**
 * Locate the target-duration row that applies to a task. Matches on category id
 * first (authoritative) and falls back to category name so legacy rows without
 * ids still resolve.
 */
export function findTargetDurationEntry(
  list: any[],
  categoryId: number | string | null | undefined,
  categoryName: string | null | undefined
): any | null {
  if (!Array.isArray(list) || list.length === 0) return null

  const idKey =
    categoryId !== '' && categoryId !== null && categoryId !== undefined
      ? String(categoryId)
      : null
  const nameKey = String(categoryName ?? '').trim().toLowerCase()

  return (
    list.find((td: any) => {
      const tdId =
        td?.category_id ?? td?.categoryId ?? td?.CategoryId ?? td?.category?.id ?? null
      if (idKey !== null && tdId !== null && tdId !== undefined && String(tdId) === idKey) {
        return true
      }
      const tdName = String(
        td?.category_name ?? td?.categoryName ?? td?.CategoryName ?? td?.category?.name ?? ''
      )
        .trim()
        .toLowerCase()
      return tdName !== '' && nameKey !== '' && tdName === nameKey
    }) ?? null
  )
}

/** Total configured target duration in milliseconds (days + hours + minutes). */
export function targetDurationEntryToMs(entry: any): number {
  if (!entry) return 0
  const days =
    Number(entry.target_days ?? entry.targetDays ?? entry.TargetDays ?? entry.days ?? 0) || 0
  const hours =
    Number(entry.target_hours ?? entry.targetHours ?? entry.TargetHours ?? entry.hours ?? 0) || 0
  const minutes =
    Number(
      entry.target_minutes ?? entry.targetMinutes ?? entry.TargetMinutes ?? entry.minutes ?? 0
    ) || 0
  const total = days * 86400000 + hours * 3600000 + minutes * 60000
  return Number.isFinite(total) && total > 0 ? total : 0
}

/** Human readable duration, e.g. "2 days 3 hours 15 minutes". */
export { formatDurationMs }

/** Resolve the configured duration (ms) that applies to a task. */
export function resolveTaskDurationMs(task: any, targetDurationConfig: any[]): number {
  const { categoryId, categoryName } = resolveCategoryRef(task)
  return targetDurationEntryToMs(
    findTargetDurationEntry(targetDurationConfig, categoryId, categoryName)
  )
}

/* ═════════════════════ the shared resolution rule ═══════════════════════ */

export interface TimelineTargetInput {
  /** Normalized ISO-8601 UTC "Task Assigned At" (or creation time), or null. */
  assignedAtIso: string | null
  /** Normalized ISO-8601 UTC stored Target Completion, or null. */
  storedTargetIso: string | null
  /** Extended / revised target, when the API exposes one. */
  extendedTargetIso?: string | null
  /** Configured category target duration in ms (0 when unknown/unconfigured). */
  durationMs: number
  /** False while the target-duration configuration is still loading. */
  durationLoaded?: boolean
}

export type TimelineTargetSource = 'stored' | 'extended' | 'recalculated' | 'none'

export interface TimelineTarget {
  /** The value that MUST be shown on screen (ISO-8601 UTC) or null. */
  effectiveIso: string | null
  /** What the database currently holds. */
  storedIso: string | null
  /** Assignment anchor + duration, when both are known. */
  recalculatedIso: string | null
  /** Extended / revised value, when present and later than the stored one. */
  extendedIso: string | null
  /** The stored value is missing, or lands on/before Task Assigned At. */
  isStale: boolean
  /** `effectiveIso` differs from `storedIso` → still needs a Save to persist. */
  needsPersist: boolean
  /** Where `effectiveIso` came from. */
  source: TimelineTargetSource
  /** True when the shown value is a valid, strictly-after-assignment deadline. */
  isValidOrder: boolean
  /** Configured duration, in ms. */
  durationMs: number
  /** False while the duration configuration is still loading. */
  durationLoaded: boolean
}

/**
 * THE shared rule. Task Details, Update Task, tables and exports all call this.
 *
 * Priority:
 *   1. an extension that is genuinely later than the stored value;
 *   2. the stored value, when it is strictly after Task Assigned At;
 *   3. Task Assigned At + configured category duration, when the stored value
 *      is missing or already elapsed at the assignment moment (the exact defect
 *      reported: 9:05:00 target vs 9:05:53 assignment);
 *   4. whatever is left, so the UI never renders an empty cell, while
 *      `isValidOrder` stays false so the inconsistency can be flagged.
 */
export function resolveTimelineTarget(input: TimelineTargetInput): TimelineTarget {
  const {
    assignedAtIso,
    storedTargetIso,
    extendedTargetIso = null,
    durationMs,
    durationLoaded = true,
  } = input

  const assignedMs = timestampMs(assignedAtIso)
  const storedMs = timestampMs(storedTargetIso)
  const extendedMs = timestampMs(extendedTargetIso)

  const recalculatedIso =
    assignedMs !== null && durationMs > 0
      ? new Date(assignedMs + durationMs).toISOString()
      : null

  // An extension only wins when it really moves the deadline forward.
  const preferExtension = extendedMs !== null && (storedMs === null || extendedMs > storedMs)
  const baselineIso = preferExtension ? extendedTargetIso ?? null : storedTargetIso
  const baselineMs = preferExtension ? extendedMs : storedMs

  // "Stale" = no deadline stored, or a deadline that had already elapsed at the
  // very moment the task was assigned.
  const isStale = Boolean(assignedMs !== null && (baselineMs === null || baselineMs <= assignedMs))

  let effectiveIso: string | null
  let source: TimelineTargetSource

  if (isStale && recalculatedIso) {
    effectiveIso = recalculatedIso
    source = 'recalculated'
  } else if (preferExtension && extendedTargetIso) {
    effectiveIso = extendedTargetIso
    source = 'extended'
  } else if (baselineIso) {
    effectiveIso = baselineIso
    source = 'stored'
  } else {
    effectiveIso = null
    source = 'none'
  }

  const effectiveMs = timestampMs(effectiveIso)
  const needsPersist = Boolean(
    durationLoaded && effectiveIso && (storedMs === null || effectiveMs !== storedMs)
  )
  const isValidOrder = Boolean(
    effectiveMs !== null && (assignedMs === null || effectiveMs > assignedMs)
  )

  return {
    effectiveIso,
    storedIso: storedTargetIso,
    recalculatedIso,
    extendedIso: extendedTargetIso ?? null,
    isStale,
    needsPersist,
    source,
    isValidOrder,
    durationMs,
    durationLoaded,
  }
}

export interface TaskTimelineTarget extends TimelineTarget {
  /** The anchor the deadline was measured from (ISO-8601 UTC). */
  assignedAtIso: string | null
  /** Whether the anchor is the assignment or the creation timestamp. */
  anchorSource: 'assigned' | 'created' | 'none'
  /** "30 minutes", "2 days 4 hours", … or '' when not configured. */
  durationLabel: string
}

/**
 * Convenience wrapper: resolve everything straight from a task object plus the
 * loaded target-duration configuration. This is what Task Details, TaskTable
 * and UpdateTaskModal should call.
 */
export function resolveTaskTimelineTarget(
  task: any,
  targetDurationConfig: any[],
  options: { durationLoaded?: boolean } = {}
): TaskTimelineTarget {
  const { anchorIso, anchorSource } = resolveDeadlineAnchorIso(task)
  const storedTargetIso = resolveStoredTargetIso(task)
  const extendedTargetIso = resolveExtendedTargetIso(task)
  const durationMs = resolveTaskDurationMs(task, targetDurationConfig)
  const durationLoaded =
    options.durationLoaded ?? (Array.isArray(targetDurationConfig) && targetDurationConfig.length > 0)

  const resolved = resolveTimelineTarget({
    assignedAtIso: anchorIso,
    storedTargetIso,
    extendedTargetIso,
    durationMs,
    durationLoaded,
  })

  return {
    ...resolved,
    assignedAtIso: anchorIso,
    anchorSource,
    durationLabel: formatDurationMs(durationMs),
  }
}

/* ══════════════════════ validation & persistence ════════════════════════ */

export interface TimelineValidation {
  valid: boolean
  /** User-facing message, '' when valid. */
  message: string
}

/**
 * Validate the "Target Completion must be after Task Assigned At" rule.
 * BOTH values are normalized first, so a designator-less string can no longer
 * make a legitimate deadline look invalid (or an invalid one look fine).
 */
export function validateTimelineOrder(
  assignedAt: string | number | Date | null | undefined,
  targetCompletion: string | number | Date | null | undefined
): TimelineValidation {
  const assignedMs = timestampMs(assignedAt)
  const targetMs = timestampMs(targetCompletion)

  if (targetMs === null) {
    return { valid: false, message: 'Target Completion is required.' }
  }
  if (assignedMs === null) {
    return { valid: true, message: '' }
  }
  if (targetMs <= assignedMs) {
    return {
      valid: false,
      message: 'Target Completion must be later than Task Assigned At.',
    }
  }
  return { valid: true, message: '' }
}

/**
 * Build the patch that persists a corrected deadline. Returns `null` when there
 * is nothing to save, so an unchanged form never rewrites the row.
 *
 * Both the camelCase and snake_case keys are emitted because the API surface
 * accepts either, and the value is always an explicit UTC instant.
 */
export function buildTargetCompletionPatch(
  target: Pick<TimelineTarget, 'effectiveIso' | 'needsPersist'>
): { targetCompletionDate: string; target_completion_date: string } | null {
  if (!target?.needsPersist || !target.effectiveIso) return null
  const iso = normalizeToIso(target.effectiveIso)
  if (!iso) return null
  return { targetCompletionDate: iso, target_completion_date: iso }
}

/**
 * Explanatory note rendered under the deadline when it had to be recalculated,
 * so users understand why the value changed instead of suspecting bad data.
 */
export function describeTimelineTarget(target: TaskTimelineTarget): string {
  if (!target) return ''
  if (!target.durationLoaded && target.source === 'stored') return ''

  if (target.source === 'recalculated') {
    const base = target.durationLabel
      ? `Recalculated from Task Assigned At + ${target.durationLabel} (category target duration).`
      : 'Recalculated from Task Assigned At and the category target duration.'
    return target.needsPersist
      ? `${base} Save the task to persist the corrected deadline.`
      : base
  }
  if (target.source === 'extended') return 'Deadline extended by an approved request.'
  if (target.source === 'none') return 'No Target Completion configured for this task.'
  if (!target.isValidOrder) {
    return 'Stored Target Completion is earlier than Task Assigned At and no category target duration is configured.'
  }
  return ''
}

/** Overdue / due-soon status of the effective deadline, computed on UTC ms. */
export function resolveDeadlineStatus(
  target: Pick<TimelineTarget, 'effectiveIso'>,
  completedAt?: string | number | Date | null,
  now: Date = new Date()
): { state: 'none' | 'completed-on-time' | 'completed-late' | 'overdue' | 'due'; diffMs: number | null } {
  const targetMs = timestampMs(target?.effectiveIso)
  if (targetMs === null) return { state: 'none', diffMs: null }

  const completedMs = timestampMs(completedAt)
  if (completedMs !== null) {
    return {
      state: completedMs > targetMs ? 'completed-late' : 'completed-on-time',
      diffMs: completedMs - targetMs,
    }
  }
  const nowMs = now.getTime()
  return { state: nowMs > targetMs ? 'overdue' : 'due', diffMs: nowMs - targetMs }
}