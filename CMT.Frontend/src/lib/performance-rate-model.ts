/**
 * performance-rate-model.ts
 * ---------------------------------------------------------------------------
 * THE SINGLE SOURCE OF TRUTH for the Delay Rate / Early Rate / Efficiency
 * numbers shown on the **Performance Management** screen, its Excel/CSV export
 * and the Completed Tasks "Performance Summary".
 *
 * Before this module the Performance Management grid used a "day-of-year"
 * approximation, while the Completed Tasks export used the division-based
 * averaged model. The two could never agree. Every consumer now calls the
 * helpers below, so the Performance Summary always reflects exactly the same
 * Delay Rate, Early Rate and Efficiency as the exported rows.
 *
 * ===========================================================================
 * MODEL (identical to lib/completed-task-metrics.ts)
 * ===========================================================================
 * Classification (mutually exclusive, CALENDAR-DAY granularity in UTC):
 *
 *   dayDelta = actualCompletionDay(UTC) - effectiveTargetDay(UTC)
 *     dayDelta  < 0  -> EARLY
 *     dayDelta == 0  -> ON-TIME
 *     dayDelta  > 0  -> DELAYED
 *
 * Per task rate (measured on the task timeline from "Task Assigned At"):
 *
 *   taskRate = (targetDurationDays / actualDurationDays) * 100
 *     EARLY   -> max(taskRate, 100)   (always >= 100%)
 *     DELAYED -> min(taskRate, 100)   (always <= 100%)
 *     ON-TIME -> 100
 *
 *   Each per-task rate is capped at MAX_TASK_RATE_PERCENT so a completion at
 *   the assignment instant cannot produce Infinity.
 *
 * Aggregates:
 *   Early Rate  = AVERAGE of the early per-task rates
 *   Delay Rate  = AVERAGE of the delayed per-task rates
 *   On-Time Rate= 100.00% when at least one task landed exactly on target, else 0
 *   Efficiency  = (Early Rate + Delay Rate + On-Time Rate) / 3,
 *                 an EMPTY category counting as a neutral 100%
 *
 * Early Rate display rule (business requirement):
 *   The Early Rate COLUMN is capped at RATE_DISPLAY_CAP_PERCENT (1000%), but the
 *   ACCURATE average is always kept in the data and returned by the API/export.
 *   `formatRateForDisplay()` renders the capped text while
 *   `earlyRate` / `formatRatePercent()` expose the accurate value.
 * ---------------------------------------------------------------------------
 */

import { timestampMs } from '@/lib/datetime-utils'

/** Upper guard for a SINGLE task rate (prevents division by ~0 -> Infinity). */
export const MAX_TASK_RATE_PERCENT = 1000

/** The Early Rate column never renders more than this, the data keeps the truth. */
export const RATE_DISPLAY_CAP_PERCENT = 1000

/** Efficiency is the average of the three cumulative rates. */
export const EFFICIENCY_COMPONENTS = 3

/** An empty Early / Delayed / On-Time category counts as a neutral 100%. */
export const NEUTRAL_RATE_PERCENT = 100

const MS_PER_DAY = 24 * 60 * 60 * 1000

export type RateBucket = 'early' | 'on_time' | 'delayed' | null

/** Minimal shape needed to rate one completed task. */
export interface RateTaskInput {
  /** "Task Assigned At" — the baseline of both durations. */
  assignedAt?: string | number | Date | null
  /** Effective (extension aware) Target Completion Date. */
  targetDate?: string | number | Date | null
  /** "Engineer Completed At" (falls back to the approval timestamp). */
  actualDate?: string | number | Date | null
}

export interface TaskRate {
  bucket: RateBucket
  /** Whole days between the actual day and the target day (UTC). */
  dayDelta: number | null
  targetDurationDays: number | null
  actualDurationDays: number | null
  /** The rate that applies to THIS task, or null when it cannot be measured. */
  rate: number | null
}

export interface RateAggregate {
  completedCount: number
  earlyCount: number
  onTimeCount: number
  delayedCount: number
  /** Completed tasks without a usable target/actual date (no rate contribution). */
  unclassifiedCount: number
  /** Early tasks that produced a measurable rate. */
  earlySampleCount: number
  /** Delayed tasks that produced a measurable rate. */
  delayedSampleCount: number
  /** ACCURATE average of the early per-task rates (never clamped). */
  earlyRate: number
  /** ACCURATE average of the delayed per-task rates. */
  delayRate: number
  /** 100 when at least one task landed exactly on target, else 0. */
  onTimeRate: number
  /** (Early + Delay + On-Time) / 3, empty category = neutral 100%. */
  efficiency: number
  rating: string
  exceedsTarget: boolean
}

export const EMPTY_RATE_AGGREGATE: RateAggregate = {
  completedCount: 0,
  earlyCount: 0,
  onTimeCount: 0,
  delayedCount: 0,
  unclassifiedCount: 0,
  earlySampleCount: 0,
  delayedSampleCount: 0,
  earlyRate: 0,
  delayRate: 0,
  onTimeRate: 0,
  efficiency: 0,
  rating: 'No Data',
  exceedsTarget: false,
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Numeric helpers
 * ────────────────────────────────────────────────────────────────────────── */

export const toNumber = (value: any): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export const round2 = (value: number): number => {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

export const averageOf = (values: number[]): number =>
  values.length === 0 ? 0 : round2(values.reduce((s, v) => s + v, 0) / values.length)

/** Epoch ms of the UTC calendar day (time component removed). */
const utcDayMs = (value?: string | number | Date | null): number | null => {
  const ms = timestampMs(value)
  if (ms === null) return null
  return Math.floor(ms / MS_PER_DAY) * MS_PER_DAY
}

/** Elapsed time between two timestamps as decimal days (2 dp). */
export const durationDays = (
  start?: string | number | Date | null,
  end?: string | number | Date | null
): number | null => {
  const a = timestampMs(start)
  const b = timestampMs(end)
  if (a === null || b === null) return null
  return round2((b - a) / MS_PER_DAY)
}

/**
 * (Target ÷ Actual) × 100 — the single formula behind the Early and the Delay
 * Rate. Returns null when either duration is unknown or the target span is not
 * positive; capped at MAX_TASK_RATE_PERCENT.
 */
export const calculateTaskRatio = (
  targetDurationDays: number | null,
  actualDurationDays: number | null
): number | null => {
  if (targetDurationDays === null || actualDurationDays === null) return null
  if (!Number.isFinite(targetDurationDays) || !Number.isFinite(actualDurationDays)) return null
  if (targetDurationDays <= 0) return null

  const safeActual = actualDurationDays > 0.01 ? actualDurationDays : 0.01
  return round2(Math.min((targetDurationDays / safeActual) * 100, MAX_TASK_RATE_PERCENT))
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Per task
 * ────────────────────────────────────────────────────────────────────────── */

export function rateTask(task: RateTaskInput): TaskRate {
  const targetDay = utcDayMs(task.targetDate)
  const actualDay = utcDayMs(task.actualDate)

  const targetDurationDays = durationDays(task.assignedAt, task.targetDate)
  const actualDurationDays = durationDays(task.assignedAt, task.actualDate)
  const ratio = calculateTaskRatio(targetDurationDays, actualDurationDays)

  if (targetDay === null || actualDay === null) {
    return { bucket: null, dayDelta: null, targetDurationDays, actualDurationDays, rate: null }
  }

  const dayDelta = Math.round((actualDay - targetDay) / MS_PER_DAY)

  if (dayDelta < 0) {
    return {
      bucket: 'early',
      dayDelta,
      targetDurationDays,
      actualDurationDays,
      rate: ratio === null ? null : Math.max(ratio, 100),
    }
  }

  if (dayDelta > 0) {
    return {
      bucket: 'delayed',
      dayDelta,
      targetDurationDays,
      actualDurationDays,
      rate: ratio === null ? null : Math.min(ratio, 100),
    }
  }

  return { bucket: 'on_time', dayDelta, targetDurationDays, actualDurationDays, rate: 100 }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Aggregation
 * ────────────────────────────────────────────────────────────────────────── */

export function deriveRating(efficiency: number, completedCount: number): string {
  if (completedCount <= 0) return 'No Data'
  if (efficiency > 100) return 'Outstanding'
  if (efficiency >= 85) return 'Excellent'
  if (efficiency >= 70) return 'Good'
  if (efficiency >= 50) return 'Fair'
  return 'Needs Improvement'
}

/**
 * Efficiency = (Early Rate + Delay Rate + On-Time Rate) / 3.
 * An EMPTY category is counted as a neutral 100%, exactly like the export.
 */
export function calculateEfficiency(params: {
  earlyRate: number
  delayRate: number
  onTimeRate: number
  earlySampleCount: number
  delayedSampleCount: number
}): number {
  const effEarly = params.earlySampleCount > 0 ? params.earlyRate : NEUTRAL_RATE_PERCENT
  const effDelay = params.delayedSampleCount > 0 ? params.delayRate : NEUTRAL_RATE_PERCENT
  // The On-Time component is the neutral 100% whether or not on-time tasks exist,
  // which is the behaviour of the Completed Tasks export we must match.
  const effOnTime = NEUTRAL_RATE_PERCENT
  return round2((effEarly + effDelay + effOnTime) / EFFICIENCY_COMPONENTS)
}

/** Aggregates REAL task rows into the grid / export numbers. */
export function aggregateTaskRates(tasks: RateTaskInput[]): RateAggregate {
  const earlyRates: number[] = []
  const delayedRates: number[] = []
  let completedCount = 0
  let earlyCount = 0
  let onTimeCount = 0
  let delayedCount = 0
  let unclassifiedCount = 0

  for (const task of tasks ?? []) {
    if (timestampMs(task.actualDate) === null) continue
    completedCount++

    const rated = rateTask(task)
    if (rated.bucket === 'early') {
      earlyCount++
      if (rated.rate !== null) earlyRates.push(rated.rate)
    } else if (rated.bucket === 'delayed') {
      delayedCount++
      if (rated.rate !== null) delayedRates.push(rated.rate)
    } else if (rated.bucket === 'on_time') {
      onTimeCount++
    } else {
      unclassifiedCount++
    }
  }

  return finalizeAggregate({
    completedCount,
    earlyCount,
    onTimeCount,
    delayedCount,
    unclassifiedCount,
    earlySampleCount: earlyRates.length,
    delayedSampleCount: delayedRates.length,
    earlyRate: averageOf(earlyRates),
    delayRate: averageOf(delayedRates),
    onTimeRate: onTimeCount > 0 ? 100 : 0,
  })
}

/** Fills efficiency / rating / flags for an already averaged bundle. */
export function finalizeAggregate(partial: {
  completedCount: number
  earlyCount: number
  onTimeCount: number
  delayedCount: number
  unclassifiedCount?: number
  earlySampleCount: number
  delayedSampleCount: number
  earlyRate: number
  delayRate: number
  onTimeRate: number
}): RateAggregate {
  const earlyRate = round2(partial.earlyRate)
  const delayRate = round2(partial.delayRate)
  const onTimeRate = round2(partial.onTimeRate)

  const efficiency = calculateEfficiency({
    earlyRate,
    delayRate,
    onTimeRate,
    earlySampleCount: partial.earlySampleCount,
    delayedSampleCount: partial.delayedSampleCount,
  })

  return {
    completedCount: partial.completedCount,
    earlyCount: partial.earlyCount,
    onTimeCount: partial.onTimeCount,
    delayedCount: partial.delayedCount,
    unclassifiedCount: partial.unclassifiedCount ?? 0,
    earlySampleCount: partial.earlySampleCount,
    delayedSampleCount: partial.delayedSampleCount,
    earlyRate,
    delayRate,
    onTimeRate,
    efficiency,
    rating: deriveRating(efficiency, partial.completedCount),
    exceedsTarget: earlyRate > 100 || efficiency > 100,
  }
}

/**
 * Rebuilds an aggregate from the values the backend already averaged, so the
 * grid does not have to re-derive anything when task rows are not available.
 */
export function aggregateFromApiRow(row: any): RateAggregate {
  const completedCount = toNumber(row?.completed_tasks_count)
  const delayedCount = toNumber(row?.delayed_completed_count)

  const exactlyOnTime =
    row?.exactly_on_time_count !== undefined && row?.exactly_on_time_count !== null
      ? toNumber(row.exactly_on_time_count)
      : toNumber(row?.on_time_completed_count)

  let earlyCount =
    row?.early_completed_count !== undefined && row?.early_completed_count !== null
      ? toNumber(row.early_completed_count)
      : Math.max(0, completedCount - exactlyOnTime - delayedCount)
  let onTimeCount = exactlyOnTime

  // Early + On-Time + Delayed MUST equal Completed.
  const classified = earlyCount + onTimeCount + delayedCount
  if (classified < completedCount) {
    onTimeCount += completedCount - classified
  } else if (classified > completedCount) {
    let surplus = classified - completedCount
    const trimOnTime = Math.min(surplus, onTimeCount)
    onTimeCount -= trimOnTime
    surplus -= trimOnTime
    earlyCount = Math.max(0, earlyCount - surplus)
  }

  const earlySampleCount =
    row?.early_rate_sample_count !== undefined && row?.early_rate_sample_count !== null
      ? toNumber(row.early_rate_sample_count)
      : earlyCount
  const delayedSampleCount =
    row?.delayed_rate_sample_count !== undefined && row?.delayed_rate_sample_count !== null
      ? toNumber(row.delayed_rate_sample_count)
      : delayedCount
  const rateOnTimeCount =
    row?.rate_on_time_count !== undefined && row?.rate_on_time_count !== null
      ? toNumber(row.rate_on_time_count)
      : onTimeCount

  return finalizeAggregate({
    completedCount,
    earlyCount,
    onTimeCount,
    delayedCount,
    earlySampleCount,
    delayedSampleCount,
    earlyRate: toNumber(row?.early_rate),
    delayRate: toNumber(row?.delay_rate),
    onTimeRate: rateOnTimeCount > 0 ? 100 : 0,
  })
}

/**
 * Overall row: a WEIGHTED average over every engineer, which is mathematically
 * identical to averaging all of the underlying task rates at once.
 */
export function combineAggregates(rows: RateAggregate[]): RateAggregate {
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

  return finalizeAggregate({
    completedCount: sum(r => r.completedCount),
    earlyCount: sum(r => r.earlyCount),
    onTimeCount,
    delayedCount: sum(r => r.delayedCount),
    unclassifiedCount: sum(r => r.unclassifiedCount),
    earlySampleCount,
    delayedSampleCount,
    earlyRate,
    delayRate,
    onTimeRate: onTimeCount > 0 ? 100 : 0,
  })
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Formatting
 * ────────────────────────────────────────────────────────────────────────── */

/** ACCURATE value, never clamped — used by exports, tooltips and payloads. */
export const formatRatePercent = (value: any): string => `${round2(toNumber(value)).toFixed(2)}%`

/** True when the Early Rate column has to clamp the rendered value. */
export const isRateCapped = (value: any): boolean => toNumber(value) > RATE_DISPLAY_CAP_PERCENT

/**
 * DISPLAY value for the Early Rate column: clamped at 1000%.
 * The accurate number stays available through `formatRatePercent(value)`.
 */
export const formatRateForDisplay = (value: any): string => {
  const raw = round2(toNumber(value))
  if (raw > RATE_DISPLAY_CAP_PERCENT) return `${RATE_DISPLAY_CAP_PERCENT.toFixed(2)}%+`
  return `${raw.toFixed(2)}%`
}