'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import { useRolePermissions } from '@/hooks/useRolePermissions'
import { getSanitizedErrorMessage, sanitizeErrorMessage } from '@/lib/error-utils'
import {
  timestampMs,
  startOfDayMs,
  endOfDayMs,
  normalizeToIso,
} from '@/lib/datetime-utils'
import {
  calculateTaskRates,
  getTargetDaysValue,
  getEngineerVarianceDays,
  getEffectiveTargetCompletion,
  getVarianceStart,
  type TaskRateBreakdown,
} from '@/lib/completed-task-metrics'

/**
 * PERFORMANCE SUMMARY — AMENDED (uses completed-task-metrics.ts as single source of truth)
 * =============================================================================
 *
 * ROOT CAUSE OF THE REPORTED MISMATCH (confirmed against the actual backend payload)
 * -----------------------------------------------------------------------------
 * This page already called `calculateTaskRates()` — the SAME function the
 * Completed Tasks view uses — but the API endpoint behind it
 * (`GET /api/performance/engineer/:name`) never returned `task_assigned_at`,
 * `engineer_completed_at`, `tl_approval_date` or `category_id` on each task
 * row (`TaskBreakdownDto` was missing those 4 fields). Without them:
 *
 *   - `getVarianceStart()` silently fell back to `created_at` instead of the
 *     real "Task Assigned At", shifting EVERY duration used in the ratio.
 *   - `resolveActualCompletion()` fell back to `tl_approval_date` (also
 *     missing), instead of the real "Engineer Completed At".
 *   - `getTargetDaysValue()` could not resolve the category, so it lost the
 *     configured Category Target Days fallback for tasks without a stored
 *     target date.
 *
 * This page's OWN math was already correct; it was starved of the right
 * input data. The companion backend fix
 * (`CMT.Application/Services/PerformanceService.cs` +
 * `CMT.Application/DTOs/WorkloadDTOs.cs`) now returns those 4 fields, and
 * this file has been updated to read them with the SAME priority order used
 * by the Completed Tasks page, and to always resolve category information
 * for `getTargetDaysValue()`.
 *
 * THE FIX
 * -----------------------------------------------------------------------------
 * This page uses `calculateTaskRates()` from `completed-task-metrics.ts`
 * — the EXACT same function the Completed Tasks view uses — with the same
 * `targetDaysData` configuration and the same reconciled bucket logic, fed
 * by the SAME raw fields (task_assigned_at / engineer_completed_at /
 * tl_approval_date / category_id) that are now present on every task row.
 *
 * The result is byte-for-byte identical rates across:
 *   - Performance Summary table
 *   - View Details dialog
 *   - Completed Tasks view
 *   - All Excel exports
 *
 * DATE RANGE SEMANTICS (aligned)
 * -----------------------------------------------------------------------------
 *   Start Date → tasks whose "Task Assigned At" is ON or AFTER  the date
 *   End Date   → tasks whose "Task Assigned At" is ON or BEFORE the date
 *
 * RATE FORMULAS (Division-Based, Averaged — one shared implementation)
 * -----------------------------------------------------------------------------
 *   Per task: Rate = (targetDurationDays / actualDurationDays) × 100,
 *             both durations measured from "Task Assigned At".
 *     Early   → max(Rate, 100)      (classified by calendar day, UTC)
 *     Delayed → min(Rate, 100)
 *     On-Time → 100
 *
 *   On-Time Rate = 100.00% when at least one task landed exactly on the
 *                  target date, otherwise 0.00%
 *   Early Rate   = AVERAGE of the early per-task rates
 *   Delay Rate   = AVERAGE of the delayed per-task rates
 *   Efficiency   = (Early Rate + Delay Rate + On-Time Rate) / 3,
 *                  an EMPTY category counting as a neutral 100%
 */

// ===== TYPES ================================================================

interface PerfRow {
  engineer_name: string
  total_assigned_tasks: number
  completed_tasks_count: number
  on_time_completed_count: number
  delayed_completed_count: number
  early_completed_count: number
  exactly_on_time_count: number
  met_target_count: number
  total_delay_days: number
  total_early_days: number
  on_time_rate: number
  delay_rate: number
  early_rate: number
  early_bonus_rate: number
  capacity_efficiency_rate: number
  efficiency_rating: string
  rate_exceeds_target: boolean
  active_tasks: number
  pending_tasks: number
  in_progress_tasks: number
}

interface TaskBreakdown {
  task_id: number
  description: string
  status: string
  category_name?: string
  category_id?: number | string | null
  priority_name?: string
  created_at: string
  /** Backend field — THE duration baseline. Now returned by the API. */
  task_assigned_at?: string | null
  assigned_at?: string | null
  target_completion_date?: string
  original_target_completion_date?: string | null
  extended_target_completion_date?: string | null
  revised_target_completion_date?: string | null
  new_target_completion_date?: string | null
  effective_target_completion_date?: string | null
  actual_completion_date?: string
  /** Backend field — THE actual completion timestamp. Now returned by the API. */
  engineer_completed_at?: string | null
  /** Backend field — fallback actual-completion timestamp. Now returned by the API. */
  tl_approval_date?: string | null
  delay_days?: number
  is_on_time: boolean
  // Additional fields for completed-task-metrics compatibility
  stored_target_completion_date?: string | null
}

interface EngineerDetail {
  engineer_name: string
  summary: {
    total_assigned_tasks: number
    completed_tasks_count: number
    on_time_completed_count: number
    delayed_completed_count: number
    early_completed_count?: number
    total_delay_days: number
    total_early_days?: number
    on_time_rate: number
    delay_rate?: number
    early_rate?: number
    capacity_efficiency_rate?: number
    efficiency_rating?: string
    active_tasks: number
    pending_tasks: number
    in_progress_tasks: number
    blocked_tasks: number
    on_hold_tasks: number
  }
  task_breakdown: TaskBreakdown[]
  tasks_by_category: Record<string, number>
  tasks_by_priority: Record<string, number>
}

// ===== RATE AGGREGATE (computed from completed-task-metrics) =================

interface RateAggregate {
  completedCount: number
  earlyCount: number
  onTimeCount: number
  delayedCount: number
  earlyRate: number
  delayRate: number
  onTimeRate: number
  efficiency: number
  rating: string
  exceedsTarget: boolean
}

const EMPTY_RATE_AGGREGATE: RateAggregate = {
  completedCount: 0,
  earlyCount: 0,
  onTimeCount: 0,
  delayedCount: 0,
  earlyRate: 0,
  delayRate: 0,
  onTimeRate: 0,
  efficiency: 0,
  rating: 'No Data',
  exceedsTarget: false,
}

// ===== HELPERS ==============================================================

const toNumber = (value: any): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const round2 = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

const formatRate = (value: any): string => `${round2(toNumber(value)).toFixed(2)}%`

/**
 * Renders a decimal day count for the View Details "Target Day/s" and
 * "Actual Day/s" columns. Both come from the SAME shared breakdown that feeds
 * every rate on this page (`calculateTaskRates`), so the two columns always
 * reconcile with the Task Rate shown on the same row:
 *
 *     Task Rate = (Target Day/s / Actual Day/s) x 100
 */
const formatDayCount = (value: number | null | undefined): string => {
  if (value === null || value === undefined) return '-'
  const numeric = Number(value)
  if (!isFinite(numeric)) return '-'
  return numeric.toFixed(2)
}

const parseDate = (value?: string | null): Date | null => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/**
 * "Task Assigned At" — the baseline of BOTH durations and of the date range
 * filter. Falls back to the creation timestamp exactly like the backend,
 * but now `task_assigned_at` is reliably populated by the API so the
 * fallback is rarely exercised.
 */
const resolveAssignedAt = (task: TaskBreakdown): string | null =>
  task?.task_assigned_at ?? task?.assigned_at ?? task?.created_at ?? null

/**
 * THE actual completion timestamp — uses ONLY stored timestamps, in the same
 * priority order the Performance API and the Completed Tasks page use.
 * No comment-derived timestamps.
 */
const resolveActualCompletion = (task: TaskBreakdown): string | null =>
  task?.engineer_completed_at ?? task?.actual_completion_date ?? task?.tl_approval_date ?? null

/**
 * Normalize a task row for compatibility with completed-task-metrics functions.
 * The completed-task-metrics functions expect certain field names.
 */
function normalizeTaskForMetrics(task: TaskBreakdown): any {
  const extendedTarget = normalizeToIso(
    task?.extended_target_completion_date ??
    task?.revised_target_completion_date ??
    task?.new_target_completion_date ??
    task?.effective_target_completion_date ??
    null
  )
  const currentTarget = normalizeToIso(task?.target_completion_date ?? null)
  const originalTarget = normalizeToIso(task?.original_target_completion_date ?? null)

  return {
    ...task,
    task_assigned_at: normalizeToIso(resolveAssignedAt(task)),
    assigned_at: normalizeToIso(task?.assigned_at ?? null),
    created_at: normalizeToIso(task?.created_at ?? null),
    target_completion_date: currentTarget,
    original_target_completion_date: originalTarget,
    extended_target_completion_date: extendedTarget,
    stored_target_completion_date: extendedTarget ?? currentTarget ?? originalTarget ?? null,
    actual_completion_date: normalizeToIso(task?.actual_completion_date ?? null),
    engineer_completed_at: normalizeToIso(task?.engineer_completed_at ?? null),
    tl_approval_date: normalizeToIso(task?.tl_approval_date ?? null),
    category_id: task?.category_id ?? null,
    category_name: task?.category_name ?? '',
  }
}

/**
 * Reconciled bucket classification — identical to the Completed Tasks page.
 * A completed task that cannot be compared against a target date counts as
 * ON-TIME (no deadline to breach), so Early + On-Time + Delayed === Completed.
 */
type ReconciledBucket = 'early' | 'on_time' | 'delayed'

const classifyTaskBucket = (bucket: 'early' | 'on_time' | 'delayed' | null): ReconciledBucket =>
  bucket === 'early' ? 'early' : bucket === 'delayed' ? 'delayed' : 'on_time'

// ===== CORE RATE COMPUTATION (uses completed-task-metrics.ts) ===============

/**
 * THE resolveCompletedAt function — identical to the Completed Tasks page.
 * Uses ONLY stored timestamps, no comment-derived heuristics.
 */
const resolveEngineerCompletedAt = (task: any): string | null =>
  task?.engineer_completed_at ?? task?.actual_completion_date ?? task?.tl_approval_date ?? null

/**
 * Compute rates from task rows using the EXACT same pipeline as the Completed
 * Tasks page: calculateTaskRates() + classifyTaskBucket() + averaging.
 *
 * This is the SINGLE SOURCE OF TRUTH that guarantees the Performance Summary
 * always matches the Completed Tasks view — now that every task row also
 * carries the same task_assigned_at / engineer_completed_at / tl_approval_date
 * / category_id fields the Completed Tasks page relies on.
 */
function computeRatesFromTasks(tasks: TaskBreakdown[], targetDaysData: any[]): RateAggregate {
  if (!Array.isArray(tasks) || tasks.length === 0) return { ...EMPTY_RATE_AGGREGATE }

  const earlyRates: number[] = []
  const delayedRates: number[] = []
  let earlyCount = 0
  let onTimeCount = 0
  let delayedCount = 0
  let completedCount = 0

  for (const rawTask of tasks) {
    // Only count tasks that have an actual completion
    const actualCompletion = resolveActualCompletion(rawTask)
    if (!actualCompletion || timestampMs(actualCompletion) === null) continue

    completedCount++

    // Normalize the task for completed-task-metrics compatibility
    const normalizedTask = normalizeTaskForMetrics(rawTask)
    const completedAt = resolveEngineerCompletedAt(normalizedTask)

    // Use the SAME calculateTaskRates function as the Completed Tasks page
    const breakdown: TaskRateBreakdown = calculateTaskRates(normalizedTask, targetDaysData, completedAt)

    // Reconcile bucket — null maps to on_time (same as Completed Tasks page)
    const bucket = classifyTaskBucket(breakdown.bucket)

    if (bucket === 'early') {
      earlyCount++
      if (breakdown.earlyRate !== null) earlyRates.push(Math.max(breakdown.earlyRate, 100))
    } else if (bucket === 'delayed') {
      delayedCount++
      if (breakdown.delayedRate !== null) delayedRates.push(Math.min(breakdown.delayedRate, 100))
    } else {
      onTimeCount++
    }
  }

  // Averages
  const avgEarlyRate = earlyRates.length > 0
    ? round2(earlyRates.reduce((s, v) => s + v, 0) / earlyRates.length)
    : 0
  const avgDelayedRate = delayedRates.length > 0
    ? round2(delayedRates.reduce((s, v) => s + v, 0) / delayedRates.length)
    : 0
  const totalOnTimeRate = onTimeCount > 0 ? 100 : 0

  // Efficiency = (Early Rate + Delay Rate + On-Time Rate) / 3
  // Empty category = neutral 100%
  const effEarly = earlyRates.length > 0 ? avgEarlyRate : 100
  const effDelayed = delayedRates.length > 0 ? avgDelayedRate : 100
  const effOnTime = onTimeCount > 0 ? totalOnTimeRate : 100
  const efficiency = round2((effEarly + effDelayed + effOnTime) / 3)

  const rating = deriveRating(efficiency, completedCount)

  return {
    completedCount,
    earlyCount,
    onTimeCount,
    delayedCount,
    earlyRate: avgEarlyRate,
    delayRate: avgDelayedRate,
    onTimeRate: totalOnTimeRate,
    efficiency,
    rating,
    exceedsTarget: avgEarlyRate > 100 || efficiency > 100,
  }
}

function deriveRating(efficiency: number, completedCount: number): string {
  if (completedCount <= 0) return 'No Data'
  if (efficiency > 100) return 'Outstanding'
  if (efficiency >= 85) return 'Excellent'
  if (efficiency >= 70) return 'Good'
  if (efficiency >= 50) return 'Fair'
  return 'Needs Improvement'
}

/**
 * Combine multiple engineer aggregates into an overall total.
 * Uses weighted averaging (by sample count) for Early and Delay rates.
 */
function combineAggregates(rows: RateAggregate[]): RateAggregate {
  if (!rows || rows.length === 0) return { ...EMPTY_RATE_AGGREGATE }

  // For the overall total, we need to re-aggregate from all task-level data.
  // Since we store per-engineer aggregates with counts, we use weighted averages.
  let totalCompleted = 0
  let totalEarly = 0
  let totalOnTime = 0
  let totalDelayed = 0

  // Weighted sums for rate averaging
  let earlyRateWeightedSum = 0
  let earlyRateSampleCount = 0
  let delayedRateWeightedSum = 0
  let delayedRateSampleCount = 0

  for (const r of rows) {
    totalCompleted += r.completedCount
    totalEarly += r.earlyCount
    totalOnTime += r.onTimeCount
    totalDelayed += r.delayedCount

    // Weight by the count of tasks that contributed to the rate
    if (r.earlyCount > 0 && r.earlyRate > 0) {
      earlyRateWeightedSum += r.earlyRate * r.earlyCount
      earlyRateSampleCount += r.earlyCount
    }
    if (r.delayedCount > 0 && r.delayRate > 0) {
      delayedRateWeightedSum += r.delayRate * r.delayedCount
      delayedRateSampleCount += r.delayedCount
    }
  }

  const earlyRate = earlyRateSampleCount > 0
    ? round2(earlyRateWeightedSum / earlyRateSampleCount)
    : 0
  const delayRate = delayedRateSampleCount > 0
    ? round2(delayedRateWeightedSum / delayedRateSampleCount)
    : 0
  const onTimeRate = totalOnTime > 0 ? 100 : 0

  const effEarly = earlyRateSampleCount > 0 ? earlyRate : 100
  const effDelayed = delayedRateSampleCount > 0 ? delayRate : 100
  const effOnTime = totalOnTime > 0 ? onTimeRate : 100
  const efficiency = round2((effEarly + effDelayed + effOnTime) / 3)

  return {
    completedCount: totalCompleted,
    earlyCount: totalEarly,
    onTimeCount: totalOnTime,
    delayedCount: totalDelayed,
    earlyRate,
    delayRate,
    onTimeRate,
    efficiency,
    rating: deriveRating(efficiency, totalCompleted),
    exceedsTarget: earlyRate > 100 || efficiency > 100,
  }
}

/** Runs async work with a small concurrency limit. */
async function mapWithConcurrency<TIn, TOut>(
  items: TIn[],
  limit: number,
  worker: (item: TIn, index: number) => Promise<TOut>
): Promise<TOut[]> {
  const results = new Array<TOut>(items.length)
  let cursor = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await worker(items[index], index)
    }
  })

  await Promise.all(runners)
  return results
}

// ===== PRESENTATION HELPERS =================================================

/** Colour band for Early Rate (values > 100% are better). */
const earlyRateClass = (value: any): string => {
  const v = toNumber(value)
  if (v > 150) return 'bg-emerald-200 text-emerald-900 ring-1 ring-emerald-500'
  if (v > 100) return 'bg-green-100 text-green-800'
  if (v >= 100) return 'bg-lime-100 text-lime-800'
  if (v >= 80) return 'bg-yellow-100 text-yellow-800'
  return 'bg-orange-100 text-orange-800'
}

/** Colour band for Efficiency. */
const efficiencyRateClass = (value: any): string => {
  const v = toNumber(value)
  if (v > 100) return 'bg-emerald-200 text-emerald-900 ring-1 ring-emerald-500'
  if (v >= 85) return 'bg-green-100 text-green-800'
  if (v >= 70) return 'bg-lime-100 text-lime-800'
  if (v >= 50) return 'bg-yellow-100 text-yellow-800'
  if (v >= 0) return 'bg-orange-100 text-orange-800'
  return 'bg-red-100 text-red-800'
}

/** Colour band for the On-Time Rate (only ever 100% or 0%). */
const onTimeRateClass = (value: any): string =>
  toNumber(value) >= 100
    ? 'bg-green-100 text-green-800'
    : 'bg-gray-100 text-gray-700'

/**
 * Colour band for the Delayed Rate.
 * Lower value means more/worse delays.
 */
const delayRateClass = (value: any, delayedCount: number = 1): string => {
  const v = toNumber(value)
  if (delayedCount <= 0) return 'bg-gray-100 text-gray-700'
  if (v >= 95) return 'bg-yellow-100 text-yellow-800'
  if (v >= 85) return 'bg-orange-100 text-orange-800'
  if (v >= 70) return 'bg-red-100 text-red-800'
  return 'bg-red-200 text-red-900'
}

/** Single-task delayed rate color (always <= 100%). */
const singleDelayRateClass = (value: any): string => {
  const v = toNumber(value)
  if (v >= 99) return 'bg-yellow-100 text-yellow-800'
  if (v >= 95) return 'bg-orange-100 text-orange-800'
  if (v >= 85) return 'bg-red-100 text-red-800'
  return 'bg-red-200 text-red-900'
}

const ratingClass = (rating?: string): string => {
  switch (rating) {
    case 'Outstanding': return 'bg-emerald-200 text-emerald-900 ring-1 ring-emerald-500'
    case 'Excellent': return 'bg-green-100 text-green-800'
    case 'Good': return 'bg-lime-100 text-lime-800'
    case 'Fair': return 'bg-yellow-100 text-yellow-800'
    case 'Needs Improvement': return 'bg-red-100 text-red-800'
    default: return 'bg-gray-100 text-gray-700'
  }
}

/** Renders a rate badge with appropriate color coding. */
function RateBadge({
  value,
  tone = 'early',
  delayedCount,
  title,
}: {
  value: any
  tone?: 'early' | 'delay' | 'ontime' | 'efficiency' | 'singleDelay'
  delayedCount?: number
  title?: string
}) {
  const v = round2(toNumber(value))
  let cls: string
  if (tone === 'delay') {
    cls = delayRateClass(v, delayedCount)
  } else if (tone === 'singleDelay') {
    cls = singleDelayRateClass(v)
  } else if (tone === 'ontime') {
    cls = onTimeRateClass(v)
  } else if (tone === 'efficiency') {
    cls = efficiencyRateClass(v)
  } else {
    cls = earlyRateClass(v)
  }

  const autoTitle =
    tone === 'delay' || tone === 'singleDelay'
      ? 'Delayed Rate = AVG of (Target Duration / Actual Duration) × 100 — at most 100% per task'
      : tone === 'early'
        ? 'Early Rate = AVG of (Target Duration / Actual Duration) × 100 — at least 100% per task'
        : tone === 'efficiency'
          ? 'Efficiency = (Early Rate + Delay Rate + On-Time Rate) / 3, empty category = neutral 100%'
          : undefined

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold whitespace-nowrap ${cls}`}
      title={title ?? autoTitle}
    >
      {formatRate(v)}
      {tone === 'early' && v > 100 && <span className="text-[10px] font-bold">▲</span>}
      {(tone === 'delay' || tone === 'singleDelay') && <span className="text-[10px] font-bold">▼</span>}
    </span>
  )
}

export default function PerformancePage() {
  const { user, token } = useAuth()
  const { canViewPerformanceMetrics } = useRolePermissions()
  const [engineers, setEngineers] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [priorities, setPriorities] = useState<any[]>([])
  const [shops, setShops] = useState<any[]>([])
  const [selectedEngineers, setSelectedEngineers] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedPriority, setSelectedPriority] = useState<string>('all')
  const [selectedShop, setSelectedShop] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [summary, setSummary] = useState<PerfRow[]>([])
  /** Task rows per engineer — the SINGLE source every rate is derived from. */
  const [taskRowsByEngineer, setTaskRowsByEngineer] = useState<Record<string, TaskBreakdown[]>>({})
  /** The aggregate shown in the grid, the footer and the View Details dialog. */
  const [aggregatesByEngineer, setAggregatesByEngineer] = useState<Record<string, RateAggregate>>({})
  /** Category Target Days configuration — loaded once, shared with all rate calculations. */
  const [targetDaysData, setTargetDaysData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingFilters, setLoadingFilters] = useState(true)
  const [loadingEngineers, setLoadingEngineers] = useState(false)
  const [engineersError, setEngineersError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedEngineerDetail, setSelectedEngineerDetail] = useState<EngineerDetail | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [exporting, setExporting] = useState(false)

  // ===== VIEW DETAILS WINDOW — MOVABLE + RESIZABLE ==========================
  // The dialog behaves like a lightweight desktop window: the user can drag it
  // by the title bar and resize it from the bottom-right corner, so a wide
  // Task Breakdown table can be inspected without fighting a fixed-size modal.
  const DETAIL_MIN_WIDTH = 480
  const DETAIL_MIN_HEIGHT = 320
  const DETAIL_DEFAULT_WIDTH = 1152
  const DETAIL_DEFAULT_HEIGHT = 760

  /** Offset (in px) from the centered position — changed while dragging. */
  const [detailOffset, setDetailOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [detailSize, setDetailSize] = useState<{ width: number; height: number }>({
    width: DETAIL_DEFAULT_WIDTH,
    height: DETAIL_DEFAULT_HEIGHT,
  })
  /** True while a drag or resize gesture is active (disables text selection). */
  const [detailInteracting, setDetailInteracting] = useState(false)
  const detailDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const detailResizeRef = useRef<{ startX: number; startY: number; originW: number; originH: number } | null>(null)

  /** Centers the window and fits it inside the current viewport. */
  const resetDetailWindow = () => {
    setDetailOffset({ x: 0, y: 0 })
    if (typeof window === 'undefined') return
    setDetailSize({
      width: Math.max(DETAIL_MIN_WIDTH, Math.min(DETAIL_DEFAULT_WIDTH, window.innerWidth - 48)),
      height: Math.max(DETAIL_MIN_HEIGHT, Math.min(DETAIL_DEFAULT_HEIGHT, window.innerHeight - 48)),
    })
  }

  // Fit the window to the viewport every time the dialog is opened.
  useEffect(() => {
    if (!showDetailModal) return
    resetDetailWindow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDetailModal])

  // Global listeners live only while a gesture is in progress, so the dialog
  // keeps following the cursor even when it leaves the window bounds.
  useEffect(() => {
    if (!detailInteracting) return

    const handleMove = (event: MouseEvent) => {
      const drag = detailDragRef.current
      if (drag) {
        setDetailOffset({
          x: drag.originX + (event.clientX - drag.startX),
          y: drag.originY + (event.clientY - drag.startY),
        })
        return
      }

      const resize = detailResizeRef.current
      if (resize) {
        setDetailSize({
          width: Math.max(DETAIL_MIN_WIDTH, resize.originW + (event.clientX - resize.startX)),
          height: Math.max(DETAIL_MIN_HEIGHT, resize.originH + (event.clientY - resize.startY)),
        })
      }
    }

    const handleUp = () => {
      detailDragRef.current = null
      detailResizeRef.current = null
      setDetailInteracting(false)
    }

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailInteracting])

  const startDetailDrag = (event: React.MouseEvent) => {
    event.preventDefault()
    detailResizeRef.current = null
    detailDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: detailOffset.x,
      originY: detailOffset.y,
    }
    setDetailInteracting(true)
  }

  const startDetailResize = (event: React.MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    detailDragRef.current = null
    detailResizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originW: detailSize.width,
      originH: detailSize.height,
    }
    setDetailInteracting(true)
  }
  const barChartRef = useRef<HTMLCanvasElement | null>(null)
  const lineChartRef = useRef<HTMLCanvasElement | null>(null)
  const barChartInstance = useRef<any>(null)
  const lineChartInstance = useRef<any>(null)

  // Helper function to build authenticated headers
  const buildAuthHeaders = () => {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    }
    const authToken = token || localStorage.getItem('auth_token') || localStorage.getItem('authToken')
    if (authToken) {
      headers['Authorization'] = authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`
    }
    return headers
  }

  // Build query params from all filters
  const buildFilterParams = (engineerOverride?: string[]) => {
    const q = new URLSearchParams()
    const engs = engineerOverride ?? selectedEngineers
    if (engs.length > 0) {
      engs.forEach(e => q.append('engineer', e))
    }
    if (selectedCategory && selectedCategory !== 'all') {
      q.set('category', selectedCategory)
    }
    if (selectedPriority && selectedPriority !== 'all') {
      q.set('priority', selectedPriority)
    }
    if (selectedShop && selectedShop !== 'all') {
      q.set('shop', selectedShop)
    }
    if (selectedStatus && selectedStatus !== 'all') {
      q.set('status', selectedStatus)
    }
    if (startDate) {
      q.set('start_date', startDate)
    }
    if (endDate) {
      q.set('end_date', endDate)
    }
    return q
  }

  /**
   * THE query used for every engineer-detail request, so the task rows behind
   * the grid, the footer and the View Details dialog are always identical.
   */
  const buildEngineerDetailParams = () => {
    const q = new URLSearchParams()
    if (startDate) q.set('start_date', startDate)
    if (endDate) q.set('end_date', endDate)
    if (selectedCategory && selectedCategory !== 'all') q.set('category', selectedCategory)
    if (selectedPriority && selectedPriority !== 'all') q.set('priority', selectedPriority)
    if (selectedShop && selectedShop !== 'all') q.set('shop', selectedShop)
    return q
  }

  // ===== LOAD TARGET DAYS CONFIGURATION =====================================
  // This is the SAME configuration the Completed Tasks page loads, ensuring
  // both views use the same target durations for rate calculations.
  useEffect(() => {
    let mounted = true
    const loadTargetDays = async () => {
      const endpoints = ['/api/management/target-days', '/api/reference-data/target-days']
      for (const url of endpoints) {
        try {
          const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-cache' })
          if (!res.ok) continue
          const body = await res.json().catch(() => null)
          const list = Array.isArray(body) ? body : body?.data ?? body?.targetDays ?? []
          if (Array.isArray(list) && list.length > 0) {
            if (mounted) setTargetDaysData(list)
            return
          }
        } catch (e) {
          console.warn(`[performance] target days load failed: ${url}`, e)
        }
      }
      if (mounted) setTargetDaysData([])
    }
    loadTargetDays()
    return () => { mounted = false }
  }, [])

  // OPTIMIZED: Load engineers using the fast /api/engineers endpoint
  const loadEngineersOptimized = async () => {
    setLoadingEngineers(true)
    setEngineersError(null)
    try {
      const authHeaders = buildAuthHeaders()
      const response = await fetch('/api/engineers', {
        method: 'GET',
        headers: authHeaders,
        credentials: 'include',
        cache: 'no-cache'
      })
      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        console.error('❌ Performance Page: Engineers endpoint error:', response.status, errorText)
        const safeMessage = getSanitizedErrorMessage(response.status, 'engineers')
        throw new Error(safeMessage)
      }
      const engineersData = await response.json()
      const engineersList = Array.isArray(engineersData) ? engineersData : []
      const formattedEngineers = engineersList.map((e: any) => ({
        user_id: e.user_id ?? e.userId ?? e.id,
        id: e.user_id ?? e.userId ?? e.id,
        full_name: e.full_name ?? e.fullName ?? e.name,
        fullName: e.full_name ?? e.fullName ?? e.name,
        name: e.full_name ?? e.fullName ?? e.name,
        email: e.email,
        role: 'engineer',
        role_name: 'engineer',
        shop_id: e.shop_id ?? e.shopId,
        shop_name: e.shop_name ?? e.shopName,
        is_active: e.is_active ?? e.isActive
      }))
      setEngineers(formattedEngineers)
      if (formattedEngineers.length === 0) {
        setEngineersError('No engineers found. Please check the Manage User section and ensure users have the Engineer role.')
      }
    } catch (error: any) {
      console.error('❌ Performance Page: Failed to load engineers:', error)
      const safeMessage = sanitizeErrorMessage(
        error?.message,
        'An error occurred while loading engineers. Please try again later.'
      )
      setEngineersError(safeMessage)
      setEngineers([])
    } finally {
      setLoadingEngineers(false)
    }
  }

  useEffect(() => {
    let mounted = true
    const loadFiltersData = async () => {
      setLoadingFilters(true)
      try {
        const authHeaders = buildAuthHeaders()
        const [engineersPromise, categoriesPromise, prioritiesPromise, shopsPromise] = [
          loadEngineersOptimized(),
          fetch('/api/reference-data/categories', { method: 'GET', headers: authHeaders, credentials: 'include', cache: 'no-cache' }),
          fetch('/api/reference-data/priorities', { method: 'GET', headers: authHeaders, credentials: 'include', cache: 'no-cache' }),
          fetch('/api/shops', { method: 'GET', headers: authHeaders, credentials: 'include', cache: 'no-cache' })
        ]

        const [categoriesResult, prioritiesResult, shopsResult] = await Promise.all([categoriesPromise, prioritiesPromise, shopsPromise])

        if (!mounted) return

        if (categoriesResult.ok) {
          const categoriesData = await categoriesResult.json()
          setCategories(Array.isArray(categoriesData) ? categoriesData : (categoriesData?.data ?? []))
        } else {
          setCategories([])
        }

        if (prioritiesResult.ok) {
          const prioritiesData = await prioritiesResult.json()
          setPriorities(Array.isArray(prioritiesData) ? prioritiesData : (prioritiesData?.data ?? []))
        } else {
          setPriorities([])
        }

        if (shopsResult.ok) {
          const shopsData = await shopsResult.json()
          setShops(Array.isArray(shopsData) ? shopsData : (shopsData?.data ?? []))
        } else {
          setShops([])
        }
      } catch (err) {
        console.error('❌ Performance Page: Error loading filter data:', err)
        setCategories([])
        setPriorities([])
        setShops([])
      } finally {
        setLoadingFilters(false)
      }
    }

    loadFiltersData()
    loadPerformance()

    return () => { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    renderChartsFromSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary])

  /**
   * Fetches the TASK ROWS of one engineer with the current filters.
   * Returns null when they cannot be loaded.
   */
  async function fetchEngineerTaskRows(engineerName: string): Promise<TaskBreakdown[] | null> {
    try {
      const q = buildEngineerDetailParams()
      const res = await fetch(
        `/api/performance/engineer/${encodeURIComponent(engineerName)}?${q.toString()}`,
        { method: 'GET', headers: buildAuthHeaders(), credentials: 'include' }
      )
      if (!res.ok) return null
      const data = await res.json()
      return Array.isArray(data?.task_breakdown) ? data.task_breakdown : []
    } catch (err) {
      console.error(`Failed to load task rows for ${engineerName}:`, err)
      return null
    }
  }

  async function loadPerformance() {
    setLoading(true)
    setError(null)
    try {
      const q = buildFilterParams()
      const authHeaders = buildAuthHeaders()
      const res = await fetch(`/api/performance?${q.toString()}`, {
        method: 'GET',
        headers: authHeaders,
        credentials: 'include'
      })

      if (!res.ok) {
        const b = await res.json().catch(() => null)
        if (res.status === 401 || res.status === 403) {
          throw new Error(b?.message || 'Authentication required. Please log out and log back in.')
        }
        throw new Error(b?.message || `Failed to fetch performance data (${res.status})`)
      }

      const data = await res.json()
      const rows = Array.isArray(data.summary_table_data)
        ? data.summary_table_data
        : (Array.isArray(data) ? data : data.summary ?? data.rows ?? [])

      // ===== TASK-LEVEL RATES (single source of truth) =====================
      const engineerNames: string[] = rows.map((r: any) => String(r?.engineer_name ?? ''))
      const fetchedTaskRows = await mapWithConcurrency(
        engineerNames,
        4,
        (name) => (name ? fetchEngineerTaskRows(name) : Promise.resolve(null))
      )

      const nextTaskRows: Record<string, TaskBreakdown[]> = {}
      const nextAggregates: Record<string, RateAggregate> = {}

      const normalizedRows: PerfRow[] = rows.map((r: any, idx: number) => {
        const engineerName = engineerNames[idx]
        const taskRows = fetchedTaskRows[idx]

        let rates: RateAggregate

        if (taskRows !== null) {
          nextTaskRows[engineerName] = taskRows
          // Use the SAME calculation as Completed Tasks page with targetDaysData
          rates = computeRatesFromTasks(filterTasksByRange(taskRows), targetDaysData)
        } else {
          // Fallback: use API values (less accurate but better than nothing)
          rates = buildFallbackAggregate(r)
        }

        nextAggregates[engineerName] = rates

        const metTarget = rates.earlyCount + rates.onTimeCount

        return {
          ...r,
          engineer_name: engineerName,
          total_assigned_tasks: toNumber(r.total_assigned_tasks),
          completed_tasks_count: rates.completedCount,
          on_time_completed_count: rates.onTimeCount,
          delayed_completed_count: rates.delayedCount,
          early_completed_count: rates.earlyCount,
          exactly_on_time_count: rates.onTimeCount,
          met_target_count: metTarget,
          total_delay_days: toNumber(r.total_delay_days),
          total_early_days: toNumber(r.total_early_days),
          on_time_rate: rates.onTimeRate,
          delay_rate: rates.delayRate,
          early_rate: rates.earlyRate,
          early_bonus_rate: toNumber(r.early_bonus_rate),
          capacity_efficiency_rate: rates.efficiency,
          efficiency_rating: rates.rating,
          rate_exceeds_target: rates.exceedsTarget,
          active_tasks: toNumber(r.active_tasks),
          pending_tasks: toNumber(r.pending_tasks),
          in_progress_tasks: toNumber(r.in_progress_tasks),
        } as PerfRow
      })

      setTaskRowsByEngineer(nextTaskRows)
      setAggregatesByEngineer(nextAggregates)
      setSummary(normalizedRows)
      await renderCharts(data)
    } catch (err: any) {
      console.error('Error loading performance:', err)
      setError(err?.message ?? 'Failed to load performance data')
      setSummary([])
      setTaskRowsByEngineer({})
      setAggregatesByEngineer({})
      destroyCharts()
    } finally {
      setLoading(false)
    }
  }

  /**
   * Fallback aggregate from API row values — only used when task rows cannot
   * be loaded. This is less accurate but prevents empty display.
   */
  function buildFallbackAggregate(row: any): RateAggregate {
    const completedCount = toNumber(row?.completed_tasks_count)
    const delayedCount = toNumber(row?.delayed_completed_count)
    const earlyCount = toNumber(row?.early_completed_count)
    const onTimeCount = Math.max(0, completedCount - earlyCount - delayedCount)

    return {
      completedCount,
      earlyCount,
      onTimeCount,
      delayedCount,
      earlyRate: toNumber(row?.early_rate),
      delayRate: toNumber(row?.delay_rate),
      onTimeRate: onTimeCount > 0 ? 100 : 0,
      efficiency: toNumber(row?.capacity_efficiency_rate),
      rating: row?.efficiency_rating ?? deriveRating(toNumber(row?.capacity_efficiency_rate), completedCount),
      exceedsTarget: toNumber(row?.early_rate) > 100 || toNumber(row?.capacity_efficiency_rate) > 100,
    }
  }

  async function loadEngineerDetail(engineerName: string) {
    try {
      const q = buildEngineerDetailParams()
      const authHeaders = buildAuthHeaders()
      const res = await fetch(`/api/performance/engineer/${encodeURIComponent(engineerName)}?${q.toString()}`, {
        method: 'GET',
        headers: authHeaders,
        credentials: 'include'
      })

      if (!res.ok) {
        const b = await res.json().catch(() => null)
        throw new Error(b?.message || `Failed to fetch engineer details (${res.status})`)
      }

      const data: EngineerDetail = await res.json()
      setSelectedEngineerDetail(data)

      // Keep the cached task rows in sync
      if (Array.isArray(data?.task_breakdown)) {
        setTaskRowsByEngineer(prev => ({ ...prev, [engineerName]: data.task_breakdown }))
        // Recompute the aggregate with the fresh task rows
        const freshRates = computeRatesFromTasks(
          filterTasksByRange(data.task_breakdown),
          targetDaysData
        )
        setAggregatesByEngineer(prev => ({ ...prev, [engineerName]: freshRates }))
      }

      setShowDetailModal(true)
    } catch (err: any) {
      console.error('Error loading engineer details:', err)
      alert(`Failed to load engineer details: ${err?.message ?? 'Unknown error'}`)
    }
  }

  // ========== EXPORT TO EXCEL =================================================

  /** RFC-4180 safe CSV cell. */
  const csvCell = (value: any): string => {
    const text = value === null || value === undefined ? '' : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }

  /** Accurate rate string for a spreadsheet cell. */
  const csvRate = (value: any): string => round2(toNumber(value)).toFixed(2)

  const EXPORT_HEADERS = [
    'Engineer',
    'Assigned',
    'Completed',
    'Early Tasks',
    'On-Time Tasks',
    'Delayed Tasks',
    'On-Time Rate (%)',
    'Delay Rate (%)',
    'Early Rate (%)',
    'Efficiency (%)',
    'Efficiency Rating',
    'Total Delay Days',
    'Total Early Days',
    'Active Tasks',
    'Pending Tasks',
    'In Progress Tasks',
  ]

  /** One exported line, built ONLY from what the grid row already shows. */
  function buildExportLine(row: PerfRow): string {
    const agg = aggregatesByEngineer[row.engineer_name] ?? { ...EMPTY_RATE_AGGREGATE }

    return [
      csvCell(row.engineer_name),
      toNumber(row.total_assigned_tasks),
      agg.completedCount,
      agg.earlyCount,
      agg.onTimeCount,
      agg.delayedCount,
      csvRate(agg.onTimeRate),
      csvRate(agg.delayRate),
      csvRate(agg.earlyRate),
      csvRate(agg.efficiency),
      csvCell(agg.rating),
      toNumber(row.total_delay_days),
      toNumber(row.total_early_days),
      toNumber(row.active_tasks),
      toNumber(row.pending_tasks),
      toNumber(row.in_progress_tasks),
    ].join(',')
  }

  /** The "OVERALL TOTAL / AVERAGE" line, identical to the grid footer. */
  function buildOverallExportLine(rows: PerfRow[]): string | null {
    const totals = calculateOverallAverages(rows)
    if (!totals) return null

    return [
      csvCell('OVERALL TOTAL / AVERAGE'),
      totals.totalAssigned,
      totals.totalCompleted,
      totals.totalEarly,
      totals.totalOnTime,
      totals.totalDelayed,
      csvRate(totals.overallOnTimeRate),
      csvRate(totals.overallDelayRate),
      csvRate(totals.overallEarlyRate),
      csvRate(totals.overallEfficiencyRate),
      csvCell(totals.overallRating),
      rows.reduce((s, r) => s + toNumber(r.total_delay_days), 0),
      rows.reduce((s, r) => s + toNumber(r.total_early_days), 0),
      rows.reduce((s, r) => s + toNumber(r.active_tasks), 0),
      rows.reduce((s, r) => s + toNumber(r.pending_tasks), 0),
      rows.reduce((s, r) => s + toNumber(r.in_progress_tasks), 0),
    ].join(',')
  }

  /** Human readable description of the filters actually applied to the data. */
  function describeActiveFilters(exportedEngineers: string[]): string {
    const parts: string[] = []
    parts.push(
      exportedEngineers.length > 0
        ? `Engineers: ${exportedEngineers.join('; ')}`
        : 'Engineers: All'
    )
    if (selectedCategory && selectedCategory !== 'all') parts.push(`Category: ${selectedCategory}`)
    if (selectedPriority && selectedPriority !== 'all') parts.push(`Priority: ${selectedPriority}`)
    if (selectedShop && selectedShop !== 'all') parts.push(`Shop: ${selectedShop}`)
    if (selectedStatus && selectedStatus !== 'all') parts.push(`Status: ${selectedStatus}`)
    parts.push(`Task Assigned At: ${startDate || 'any'} → ${endDate || 'any'}`)
    return parts.join(' | ')
  }

  function handleExportToExcel(mode: 'all' | 'selected') {
    const cleanSelected = Array.from(new Set(
      selectedEngineers.map(e => (e ?? '').trim()).filter(e => e.length > 0 && e.toLowerCase() !== 'all')
    ))
    if (mode === 'selected' && cleanSelected.length === 0) {
      alert('Please select at least one engineer before using "Export Selected".')
      return
    }

    setExporting(true)
    try {
      const selectedLower = cleanSelected.map(n => n.toLowerCase())
      const exportRows = mode === 'selected'
        ? summary.filter(r => selectedLower.includes(String(r.engineer_name ?? '').trim().toLowerCase()))
        : summary

      if (exportRows.length === 0) {
        alert('No performance data available for export with the selected filters.')
        return
      }

      const overallLine = buildOverallExportLine(exportRows)

      const csvContent = [
        csvCell(`Performance Export - ${new Date().toISOString().slice(0, 10)}`),
        csvCell(`Filters Applied: ${describeActiveFilters(mode === 'selected' ? cleanSelected : [])}`),
        csvCell(`Export Mode: ${mode === 'selected' ? 'Selected Engineers' : 'All Engineers'}`),
        csvCell('Date range: BOTH Start Date and End Date filter on "Task Assigned At".'),
        csvCell('On-Time Rate = 100.00% when one or more tasks are completed exactly on the target date, otherwise 0.00%.'),
        csvCell('Early Rate = AVERAGE of per-task (Target Duration / Actual Duration) x 100 — at least 100% per task.'),
        csvCell('Delay Rate = AVERAGE of per-task (Target Duration / Actual Duration) x 100 — at most 100% per task.'),
        csvCell('Efficiency = ( Early Rate + Delay Rate + On-Time Rate ) / 3, empty category = neutral 100%.'),
        csvCell('These values are exported exactly as displayed in the Performance Summary, View Details and the Completed Tasks analysis.'),
        '',
        EXPORT_HEADERS.map(csvCell).join(','),
        ...exportRows.map(buildExportLine),
        '',
        ...(overallLine ? [overallLine] : []),
      ].join('\n')

      // BOM keeps Excel from mangling UTF-8 characters.
      const blob = new Blob([`\ufeff${csvContent}`], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `performance_export_${mode}_${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err: any) {
      console.error('Export error:', err)
      alert(`Export failed: ${err?.message ?? 'Unknown error'}`)
    } finally {
      setExporting(false)
    }
  }

  function destroyCharts() {
    if (barChartInstance.current) {
      try { barChartInstance.current.destroy() } catch {}
      barChartInstance.current = null
    }
    if (lineChartInstance.current) {
      try { lineChartInstance.current.destroy() } catch {}
      lineChartInstance.current = null
    }
  }

  async function renderCharts(backendData: any) {
    if (typeof window === 'undefined') return
    let Chart: any = null
    try {
      const mod = await import('chart.js/auto')
      Chart = (mod && (mod as any).default) ? (mod as any).default : mod
    } catch (err) {
      console.error('Failed to load chart.js dynamically.', err)
      return
    }

    destroyCharts()

    const labels = backendData.chart_labels || summary.map((r: any) => r.engineer_name)
    const completed = backendData.chart_data_completed || summary.map((r: any) => toNumber(r.completed_tasks_count))
    const ontime = backendData.chart_data_on_time || summary.map((r: any) => toNumber(r.on_time_completed_count))
    const early = backendData.chart_data_early || summary.map((r: any) => toNumber(r.early_completed_count))
    const delayDays = backendData.chart_data_delay_days || summary.map((r: any) => toNumber(r.total_delay_days))

    if (barChartRef.current) {
      const ctx = barChartRef.current.getContext('2d')
      if (ctx) {
        barChartInstance.current = new (Chart as any)(ctx, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              { label: 'Completed', data: completed, backgroundColor: 'rgba(94,143,77,0.8)' },
              { label: 'On-Time', data: ontime, backgroundColor: 'rgba(59,130,246,0.7)' },
              { label: 'Early', data: early, backgroundColor: 'rgba(16,185,129,0.7)' }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        })
      }
    }

    if (lineChartRef.current) {
      const ctx2 = lineChartRef.current.getContext('2d')
      if (ctx2) {
        lineChartInstance.current = new (Chart as any)(ctx2, {
          type: 'line',
          data: {
            labels,
            datasets: [
              { label: 'Total Delay Days', data: delayDays, borderColor: 'rgba(220,38,38,0.9)', backgroundColor: 'rgba(220,38,38,0.2)', fill: true }
            ]
          },
          options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        })
      }
    }
  }

  async function renderChartsFromSummary() {
    if (!summary || summary.length === 0) {
      destroyCharts()
      return
    }
    await renderCharts({
      chart_labels: summary.map((r: any) => r.engineer_name),
      chart_data_completed: summary.map((r: any) => toNumber(r.completed_tasks_count)),
      chart_data_on_time: summary.map((r: any) => toNumber(r.on_time_completed_count)),
      chart_data_early: summary.map((r: any) => toNumber(r.early_completed_count)),
      chart_data_delay_days: summary.map((r: any) => toNumber(r.total_delay_days))
    })
  }

  function handleClearFilters() {
    setSelectedEngineers([])
    setSelectedCategory('all')
    setSelectedPriority('all')
    setSelectedShop('all')
    setSelectedStatus('all')
    setStartDate('')
    setEndDate('')
    setTimeout(() => loadPerformance(), 100)
  }

  /**
   * Keeps only the tasks inside the selected range.
   * BOTH bounds are applied to "Task Assigned At".
   */
  function filterTasksByRange(tasks: TaskBreakdown[]): TaskBreakdown[] {
    if (!Array.isArray(tasks)) return []
    if (!startDate && !endDate) return tasks

    const fromMs = startDate ? startOfDayMs(startDate) : null
    const toMs = endDate ? endOfDayMs(endDate) : null

    return tasks.filter((task) => {
      const assignedMs = timestampMs(resolveAssignedAt(task))

      if (fromMs !== null) {
        if (assignedMs === null) return false
        if (assignedMs < fromMs) return false
      }
      if (toMs !== null) {
        if (assignedMs === null) return false
        if (assignedMs > toMs) return false
      }
      return true
    })
  }

  // ========== OVERALL TOTALS / RATES ==========
  function calculateOverallAverages(rows: PerfRow[] = summary) {
    if (!rows || rows.length === 0) return null

    const rowAggregates: RateAggregate[] = rows.map(
      (r) => aggregatesByEngineer[r.engineer_name] ?? { ...EMPTY_RATE_AGGREGATE }
    )

    const combined = combineAggregates(rowAggregates)

    const totalAssigned = rows.reduce((s, r) => s + toNumber(r.total_assigned_tasks), 0)
    const totalMetTarget = combined.earlyCount + combined.onTimeCount

    return {
      totalAssigned,
      totalCompleted: combined.completedCount,
      totalOnTime: combined.onTimeCount,
      totalDelayed: combined.delayedCount,
      totalEarly: combined.earlyCount,
      totalMetTarget,
      overallOnTimeRate: combined.onTimeRate,
      overallDelayRate: combined.delayRate,
      overallEarlyRate: combined.earlyRate,
      overallEfficiencyRate: combined.efficiency,
      overallRating: combined.rating,
    }
  }

  // Permission guard
  if (!canViewPerformanceMetrics) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <div className="text-6xl">🔒</div>
            <h2 className="text-xl font-semibold text-gray-800">Access Denied</h2>
            <p className="text-gray-600 max-w-md">
              You do not have permission to view performance metrics.
              Please contact your administrator if you believe this is an error.
            </p>
          </div>
        </div>
      </MainLayout>
    )
  }

  const overallAverages = calculateOverallAverages()
  const hasAboveTarget = summary.some(r => toNumber(r.early_rate) > 100)

  // ===== VIEW DETAILS — the SAME task rows and the SAME aggregate as the grid
  const detailEngineerName = selectedEngineerDetail?.engineer_name ?? ''
  const detailCachedRows = taskRowsByEngineer[detailEngineerName]
  const detailSourceRows: TaskBreakdown[] = selectedEngineerDetail
    ? (Array.isArray(detailCachedRows) && detailCachedRows.length > 0
        ? detailCachedRows
        : (selectedEngineerDetail.task_breakdown ?? []))
    : []
  const detailTasks = selectedEngineerDetail ? filterTasksByRange(detailSourceRows) : []

  // Prefer the aggregate already displayed in the grid
  const detailRates: RateAggregate | null = selectedEngineerDetail
    ? (aggregatesByEngineer[detailEngineerName] ?? computeRatesFromTasks(detailTasks, targetDaysData))
    : null

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Performance Management</h2>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => loadPerformance()}
              className="px-3 py-1 border rounded bg-white hover:bg-gray-50"
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* ========== FILTERS SECTION ========== */}
        <div className="bg-white rounded shadow p-4">
          <h3 className="font-medium mb-3">Apply Filters</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Engineers */}
            <div>
              <label className="block text-sm font-medium mb-1">Engineers</label>
              {loadingFilters || loadingEngineers ? (
                <div className="w-full border rounded p-3 h-32 flex items-center justify-center bg-blue-50 border-blue-200">
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
                    <span className="text-sm text-blue-700 font-medium">Loading engineers...</span>
                  </div>
                </div>
              ) : engineersError ? (
                <div className="w-full border rounded p-3 h-32 flex items-center justify-center bg-red-50 border-red-200">
                  <div className="text-xs text-red-600 font-medium text-center">{engineersError}</div>
                </div>
              ) : (
                <>
                  <select
                    multiple
                    value={selectedEngineers}
                    onChange={(e) => {
                      const opts = Array.from(e.target.selectedOptions).map(o => o.value)
                      setSelectedEngineers(opts)
                    }}
                    className="w-full border rounded p-2 h-32 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {engineers.map((eng: any) => (
                      <option
                        key={eng.user_id ?? eng.id}
                        value={eng.full_name ?? eng.fullName ?? eng.name}
                      >
                        {eng.full_name ?? eng.fullName ?? eng.name}
                      </option>
                    ))}
                  </select>
                  <div className="text-xs text-gray-500 mt-1">
                    Hold Ctrl/Cmd to select multiple
                    {engineers.length > 0 && <span className="text-green-600 font-medium ml-2">({engineers.length} available)</span>}
                  </div>
                </>
              )}
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium mb-1">Category</label>
              {loadingFilters ? (
                <div className="w-full border rounded p-2 flex items-center justify-center text-sm text-gray-500">Loading...</div>
              ) : (
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full border rounded p-2"
                >
                  <option value="all">All Categories</option>
                  {categories.map((c: any) => (
                    <option key={c.category_id ?? c.id} value={c.category_id ?? c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium mb-1">Priority</label>
              {loadingFilters ? (
                <div className="w-full border rounded p-2 flex items-center justify-center text-sm text-gray-500">Loading...</div>
              ) : (
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                  className="w-full border rounded p-2"
                >
                  <option value="all">All Priorities</option>
                  {priorities.map((p: any) => (
                    <option key={p.priority_id ?? p.id} value={p.priority_id ?? p.id}>
                      {p.level_name ?? p.levelName ?? p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Shop */}
            <div>
              <label className="block text-sm font-medium mb-1">Shop</label>
              {loadingFilters ? (
                <div className="w-full border rounded p-2 flex items-center justify-center text-sm text-gray-500">Loading...</div>
              ) : (
                <select
                  value={selectedShop}
                  onChange={(e) => setSelectedShop(e.target.value)}
                  className="w-full border rounded p-2"
                >
                  <option value="all">All Shops</option>
                  {shops.map((s: any) => (
                    <option key={s.shop_id ?? s.id} value={s.shop_id ?? s.id}>
                      {s.shop_name ?? s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full border rounded p-2"
              >
                <option value="all">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="InProgress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Blocked">Blocked</option>
                <option value="OnHold">On Hold</option>
                <option value="Paused">Paused</option>
                <option value="Rejected">Rejected</option>
                <option value="Cancelled">Cancelled</option>
                <option value="PendingTLApproval">Pending TL Approval</option>
              </select>
            </div>

            {/* Start Date (Task Assigned At) */}
            <div>
              <label className="block text-sm font-medium mb-1">Start Date (Task Assigned At)</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border rounded p-2"
                title="Filter tasks assigned on or after this date"
              />
              <div className="text-xs text-gray-400 mt-0.5">Tasks assigned from this date</div>
            </div>

            {/* End Date (Task Assigned At) */}
            <div>
              <label className="block text-sm font-medium mb-1">End Date (Task Assigned At)</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border rounded p-2"
                title="Filter tasks assigned on or before this date — same semantics as the Completed Tasks screen"
              />
              <div className="text-xs text-gray-400 mt-0.5">Tasks assigned up to this date</div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => loadPerformance()}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
              disabled={loading || loadingFilters || loadingEngineers}
            >
              {loading ? 'Applying...' : 'Apply Filters'}
            </button>
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 border rounded hover:bg-gray-50"
              disabled={loading || loadingFilters || loadingEngineers}
            >
              Clear Filters
            </button>
            <div className="border-l mx-2"></div>
            <button
              onClick={() => handleExportToExcel('all')}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              disabled={exporting || loading || summary.length === 0}
            >
              {exporting ? 'Exporting...' : '📥 Export All to Excel'}
            </button>
            <button
              onClick={() => handleExportToExcel('selected')}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
              disabled={exporting || loading || selectedEngineers.length === 0}
              title={selectedEngineers.length === 0 ? 'Select engineers first' : 'Export selected engineers only'}
            >
              {exporting ? 'Exporting...' : '📥 Export Selected'}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded shadow p-4" style={{ minHeight: 320 }}>
            <h3 className="font-medium mb-2">Completed vs On-Time vs Early</h3>
            <div style={{ height: 260 }}>
              {loading ? (
                <div className="flex items-center justify-center h-full text-sm text-gray-500">Loading chart...</div>
              ) : summary.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-gray-500">No data available</div>
              ) : (
                <canvas ref={barChartRef}></canvas>
              )}
            </div>
          </div>

          <div className="bg-white rounded shadow p-4" style={{ minHeight: 320 }}>
            <h3 className="font-medium mb-2">Total Delay Days</h3>
            <div style={{ height: 260 }}>
              {loading ? (
                <div className="flex items-center justify-center h-full text-sm text-gray-500">Loading chart...</div>
              ) : summary.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-gray-500">No data available</div>
              ) : (
                <canvas ref={lineChartRef}></canvas>
              )}
            </div>
          </div>
        </div>

        {/* ========== PERFORMANCE SUMMARY TABLE ========== */}
        <div className="bg-white rounded shadow p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="font-medium">Performance Summary</h3>
            {hasAboveTarget && (
              <span className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                ▲ Early Rate values above 100% indicate delivery ahead of the target date.
              </span>
            )}
          </div>

          {/* Rate Calculation Legend */}
          <div className="text-xs text-gray-600 mb-3 border-l-4 border-blue-300 pl-3 bg-blue-50 py-2 rounded-r space-y-0.5">
            <div><strong>Rate Formulas (Division-Based, Averaged)</strong></div>
            <div>
              <strong>On-Time Rate</strong> = 100% when one or more tasks are completed exactly on the
              target date, otherwise 0.00%
            </div>
            <div>
              <strong>Early Rate</strong> = AVERAGE of per-task (Target Duration / Actual Duration) × 100
              — at least 100% per task; the earlier, the higher
            </div>
            <div>
              <strong>Delayed Rate</strong> = AVERAGE of per-task (Target Duration / Actual Duration) × 100
              — at most 100% per task; the later, the lower
            </div>
            <div>
              <strong>Efficiency</strong> = ( Early Rate + Delay Rate + On-Time Rate ) ÷ 3, empty category = neutral 100%
            </div>
            <div className="text-[11px] text-blue-800 pt-1">
              Every value below is computed from the SAME task-level rows and the SAME formulas used by the
              Completed Tasks view, its export and the View Details dialog.
            </div>
          </div>

          {loading && <div className="text-sm text-gray-500">Loading performance data...</div>}
          {!loading && summary.length === 0 && (
            <div className="text-sm text-gray-500">
              No performance data available for the selected filters.
            </div>
          )}
          {!loading && summary.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left font-semibold">Engineer</th>
                    <th className="p-2 text-center font-semibold">Assigned</th>
                    <th className="p-2 text-center font-semibold">Completed</th>
                    <th className="p-2 text-center font-semibold" title="Finished BEFORE the target date">Early Tasks</th>
                    <th className="p-2 text-center font-semibold" title="Finished exactly ON the target date">On-Time Tasks</th>
                    <th className="p-2 text-center font-semibold" title="Finished AFTER the target date">Delayed Tasks</th>
                    <th className="p-2 text-center font-semibold" title="100% when one or more tasks are completed exactly on target, otherwise 0.00%">On-Time Rate</th>
                    <th className="p-2 text-center font-semibold" title="AVERAGE of per-task (Target Duration / Actual Duration) × 100 — at most 100% per task">Delay Rate</th>
                    <th className="p-2 text-center font-semibold" title="AVERAGE of per-task (Target Duration / Actual Duration) × 100 — at least 100% per task">Early Rate</th>
                    <th className="p-2 text-center font-semibold" title="(Early Rate + Delay Rate + On-Time Rate) / 3, empty category = neutral 100%">Efficiency</th>
                    <th className="p-2 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((r: any, idx: number) => (
                    <tr key={idx} className="border-t hover:bg-gray-50">
                      <td className="p-2 font-medium">
                        {r.engineer_name}
                      </td>
                      <td className="p-2 text-center">{toNumber(r.total_assigned_tasks)}</td>
                      <td className="p-2 text-center">{toNumber(r.completed_tasks_count)}</td>
                      <td className="p-2 text-center">
                        <span className="text-emerald-700 font-medium">{toNumber(r.early_completed_count)}</span>
                      </td>
                      <td className="p-2 text-center">
                        <span className="text-green-700 font-medium">{toNumber(r.on_time_completed_count)}</span>
                      </td>
                      <td className="p-2 text-center">
                        <span className="text-red-600 font-medium">{toNumber(r.delayed_completed_count)}</span>
                      </td>
                      <td className="p-2 text-center">
                        <RateBadge value={r.on_time_rate} tone="ontime" />
                      </td>
                      <td className="p-2 text-center">
                        <RateBadge value={r.delay_rate} tone="delay" delayedCount={toNumber(r.delayed_completed_count)} />
                      </td>
                      <td className="p-2 text-center">
                        <RateBadge value={r.early_rate} tone="early" />
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <RateBadge value={r.capacity_efficiency_rate} tone="efficiency" />
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${ratingClass(r.efficiency_rating)}`}>
                            {r.efficiency_rating ?? 'No Data'}
                          </span>
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => loadEngineerDetail(r.engineer_name)}
                          className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}

                  {/* ===== OVERALL TOTALS / RATES ROW ===== */}
                  {overallAverages && (
                    <tr className="border-t-2 border-gray-400 bg-gray-100 font-bold">
                      <td className="p-2">Overall Total</td>
                      <td className="p-2 text-center">{overallAverages.totalAssigned}</td>
                      <td className="p-2 text-center">{overallAverages.totalCompleted}</td>
                      <td className="p-2 text-center text-emerald-700">{overallAverages.totalEarly}</td>
                      <td className="p-2 text-center text-green-700">{overallAverages.totalOnTime}</td>
                      <td className="p-2 text-center text-red-600">{overallAverages.totalDelayed}</td>
                      <td className="p-2 text-center">
                        <RateBadge value={overallAverages.overallOnTimeRate} tone="ontime" />
                      </td>
                      <td className="p-2 text-center">
                        <RateBadge value={overallAverages.overallDelayRate} tone="delay" delayedCount={overallAverages.totalDelayed} />
                      </td>
                      <td className="p-2 text-center">
                        <RateBadge value={overallAverages.overallEarlyRate} tone="early" />
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <RateBadge value={overallAverages.overallEfficiencyRate} tone="efficiency" />
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${ratingClass(overallAverages.overallRating)}`}>
                            {overallAverages.overallRating}
                          </span>
                        </div>
                      </td>
                      <td className="p-2 text-center">—</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Engineer Detail Modal */}
      {showDetailModal && selectedEngineerDetail && (() => {
        // Compute per-task breakdowns for the detail view using the same pipeline
        const detailTaskBreakdowns: Array<{ task: TaskBreakdown; breakdown: TaskRateBreakdown; bucket: ReconciledBucket }> = detailTasks.map(task => {
          const normalizedTask = normalizeTaskForMetrics(task)
          const completedAt = resolveEngineerCompletedAt(normalizedTask)
          const breakdown = calculateTaskRates(normalizedTask, targetDaysData, completedAt)
          const bucket = classifyTaskBucket(breakdown.bucket)
          return { task, breakdown, bucket }
        })

        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
            <div
              className="absolute left-1/2 top-1/2 bg-white rounded-lg shadow-2xl flex flex-col overflow-hidden border border-gray-300"
              style={{
                width: `${detailSize.width}px`,
                height: `${detailSize.height}px`,
                transform: `translate(calc(-50% + ${detailOffset.x}px), calc(-50% + ${detailOffset.y}px))`,
                userSelect: detailInteracting ? 'none' : 'auto',
              }}
            >
              {/* Draggable title bar — grab anywhere here to move the window */}
              <div
                onMouseDown={startDetailDrag}
                title="Drag to move this window"
                className="flex justify-between items-center gap-3 px-6 py-3 border-b bg-gray-50 cursor-move select-none shrink-0"
              >
                <h3 className="text-xl font-semibold truncate">Engineer Performance Details: {selectedEngineerDetail.engineer_name}</h3>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={resetDetailWindow}
                    title="Reset window position and size"
                    className="px-2 py-1 text-xs border border-gray-300 rounded bg-white text-gray-700 hover:bg-gray-100"
                  >
                    Reset
                  </button>
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => setShowDetailModal(false)}
                    title="Close"
                    className="text-gray-500 hover:text-gray-700 text-2xl leading-none px-1"
                  >
                    &times;
                  </button>
                </div>
              </div>

              {/* Scrollable body — grows/shrinks with the resized window */}
              <div className="flex-1 overflow-auto p-6">

                {/* Date range indicator */}
                {(startDate || endDate) && (
                  <div className="mb-4 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
                    📅 Showing tasks whose <strong>Task Assigned At</strong> is between{' '}
                    {startDate || 'any'} and {endDate || 'any'} — the same range used by the Performance
                    Summary and the Completed Tasks view.
                  </div>
                )}

                {/* Summary Cards — counts */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                  <div className="bg-blue-50 p-4 rounded">
                    <div className="text-sm text-gray-600">Total Assigned</div>
                    <div className="text-2xl font-bold">{selectedEngineerDetail.summary.total_assigned_tasks}</div>
                  </div>
                  <div className="bg-green-50 p-4 rounded">
                    <div className="text-sm text-gray-600">Completed</div>
                    <div className="text-2xl font-bold">{detailRates?.completedCount ?? 0}</div>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded">
                    <div className="text-sm text-gray-600">Early Tasks</div>
                    <div className="text-2xl font-bold text-emerald-700">{detailRates?.earlyCount ?? 0}</div>
                    <div className="text-[11px] text-gray-500">✦ Finished before the target date</div>
                  </div>
                  {/* Completed === Early + On-Time + Delayed, so On-Time is shown
                      right next to Early to make that reconciliation visible. */}
                  <div className="bg-green-50 p-4 rounded">
                    <div className="text-sm text-gray-600">On-Time Tasks</div>
                    <div className="text-2xl font-bold text-green-700">{detailRates?.onTimeCount ?? 0}</div>
                    <div className="text-[11px] text-gray-500">✓ Finished exactly on the target date</div>
                  </div>
                  <div className="bg-red-50 p-4 rounded">
                    <div className="text-sm text-gray-600">Delayed Tasks</div>
                    <div className="text-2xl font-bold text-red-600">{detailRates?.delayedCount ?? 0}</div>
                    <div className="text-[11px] text-gray-500">✗ Finished after the target date</div>
                  </div>
                </div>

                {/* Summary Cards — rates (the SAME aggregate as the grid row) */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-green-50 p-4 rounded">
                    <div className="text-sm text-gray-600">On-Time Rate</div>
                    <div className="text-2xl font-bold">{formatRate(detailRates?.onTimeRate)}</div>
                    <div className="text-[11px] text-gray-500">{detailRates?.onTimeCount ?? 0} on-time task(s)</div>
                  </div>
                  <div className="bg-emerald-50 p-4 rounded">
                    <div className="text-sm text-gray-600">Early Rate (avg)</div>
                    <div className="text-2xl font-bold">{formatRate(detailRates?.earlyRate)}</div>
                    <div className="text-[11px] text-gray-500">AVG (Target Duration / Actual Duration) × 100</div>
                  </div>
                  <div className="bg-orange-50 p-4 rounded">
                    <div className="text-sm text-gray-600">Delayed Rate (avg)</div>
                    <div className="text-2xl font-bold">{formatRate(detailRates?.delayRate)}</div>
                    <div className="text-[11px] text-gray-500">AVG (Target Duration / Actual Duration) × 100 — at most 100% per task</div>
                  </div>
                  <div className="bg-purple-50 p-4 rounded">
                    <div className="text-sm text-gray-600">Efficiency</div>
                    <div className="text-2xl font-bold">{formatRate(detailRates?.efficiency)}</div>
                    <div className="text-xs text-gray-600">{detailRates?.rating ?? 'No Data'}</div>
                  </div>
                </div>

                <div className="text-[11px] text-gray-500 mb-6">
                  These four values are the exact same figures shown for this engineer in the Performance
                  Summary table and in the Completed Tasks analysis — one shared calculation, one result.
                </div>

                {/* Status Breakdown */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                  <div className="bg-gray-50 p-3 rounded text-center">
                    <div className="text-xs text-gray-600">Active</div>
                    <div className="text-lg font-semibold">{selectedEngineerDetail.summary.active_tasks}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded text-center">
                    <div className="text-xs text-gray-600">Pending</div>
                    <div className="text-lg font-semibold">{selectedEngineerDetail.summary.pending_tasks}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded text-center">
                    <div className="text-xs text-gray-600">In Progress</div>
                    <div className="text-lg font-semibold">{selectedEngineerDetail.summary.in_progress_tasks}</div>
                  </div>
                  <div className="bg-gray-50 p-3 rounded text-center">
                    <div className="text-xs text-gray-600">Blocked</div>
                    <div className="text-lg font-semibold">{selectedEngineerDetail.summary.blocked_tasks}</div>
                  </div>
                  <div className="bg-red-50 p-3 rounded text-center">
                    <div className="text-xs text-gray-600">Total Delay Days</div>
                    <div className="text-lg font-semibold text-red-600">{selectedEngineerDetail.summary.total_delay_days}</div>
                  </div>
                </div>

                {/* Task Breakdown Table */}
                <div className="mb-4">
                  <h4 className="font-medium mb-2">Task Breakdown</h4>
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="p-2 text-left">Task ID</th>
                          <th className="p-2 text-left">Description</th>
                          <th className="p-2 text-left">Status</th>
                          <th className="p-2 text-left">Category</th>
                          <th className="p-2 text-left">Priority</th>
                          <th className="p-2 text-left">Task Assigned At</th>
                          <th className="p-2 text-left">Target Date</th>
                          <th className="p-2 text-left">Engineer Completed At</th>
                          <th className="p-2 text-left" title="Effective (extension aware) Target Completion Date − Task Assigned At, in decimal days">Target Day/s</th>
                          <th className="p-2 text-left" title="Engineer Completed At − Task Assigned At, in decimal days">Actual Day/s</th>
                          <th className="p-2 text-left">Task Rate</th>
                          <th className="p-2 text-left">Performance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailTaskBreakdowns.map(({ task, breakdown, bucket }, idx) => {
                          const assignedAt = parseDate(resolveAssignedAt(task))
                          const normalizedTask = normalizeTaskForMetrics(task)
                          const target = parseDate(getEffectiveTargetCompletion(normalizedTask, targetDaysData))
                          const actual = parseDate(resolveActualCompletion(task))

                          const taskRate = breakdown.taskRate
                          const isCompleted = actual !== null

                          return (
                            <tr key={idx} className="border-t hover:bg-gray-50">
                              <td className="p-2">{task.task_id}</td>
                              <td className="p-2 max-w-xs truncate">{task.description}</td>
                              <td className="p-2">
                                <span className={`px-2 py-1 rounded text-xs ${
                                  task.status === 'Completed' ? 'bg-green-100 text-green-800' :
                                  task.status === 'InProgress' || task.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                  task.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {task.status}
                                </span>
                              </td>
                              <td className="p-2">{task.category_name || '-'}</td>
                              <td className="p-2">{task.priority_name || '-'}</td>
                              <td className="p-2">{assignedAt ? assignedAt.toLocaleString() : '-'}</td>
                              <td className="p-2">{target ? target.toLocaleString() : '-'}</td>
                              <td className="p-2">{actual ? actual.toLocaleString() : '-'}</td>
                              {/* Target Day/s — the allowed duration used by the Task Rate */}
                              <td className="p-2 whitespace-nowrap">{formatDayCount(breakdown.targetDurationDays)}</td>
                              {/* Actual Day/s — the real duration the engineer took */}
                              <td className="p-2 whitespace-nowrap">
                                {!isCompleted ? '-' : (
                                  <span className={
                                    bucket === 'delayed' ? 'text-red-600 font-medium'
                                      : bucket === 'on_time' ? 'text-green-700 font-medium'
                                      : 'text-emerald-700 font-medium'
                                  }>
                                    {formatDayCount(breakdown.actualDurationDays)}
                                  </span>
                                )}
                              </td>
                              <td className="p-2">
                                {!isCompleted || taskRate === null ? '-' : (
                                  <RateBadge
                                    value={taskRate}
                                    tone={bucket === 'delayed' ? 'singleDelay' : bucket === 'on_time' ? 'ontime' : 'early'}
                                  />
                                )}
                              </td>
                              <td className="p-2">
                                {!isCompleted ? '-' : bucket === 'early' ? (
                                  <span className="text-emerald-700">✦ Early</span>
                                ) : bucket === 'on_time' ? (
                                  <span className="text-green-600">✓ On Time</span>
                                ) : (
                                  <span className="text-red-600">✗ Delayed</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                        {detailTasks.length === 0 && (
                          <tr>
                            <td className="p-3 text-center text-gray-500" colSpan={12}>
                              No tasks in the selected date range.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Resize handle — drag the bottom-right corner to resize */}
              <div
                onMouseDown={startDetailResize}
                title="Drag to resize this window"
                className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize"
              >
                <div className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 border-gray-400" />
              </div>
            </div>
          </div>
        )
      })()}
    </MainLayout>
  )
}