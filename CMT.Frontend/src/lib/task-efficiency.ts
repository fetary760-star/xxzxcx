/**
 * ============================================================================
 * TASK EFFICIENCY ANALYSIS — SHARED CALCULATION MODULE
 * ============================================================================
 *
 * Single source of truth for the Early / On-Time / Delayed analysis used by
 * BOTH:
 *   - src/app/tasks/completed/page.tsx   (per-task rows + Excel/CSV export)
 *   - src/app/performance/page.tsx       (per-engineer performance summary)
 *
 * Keeping the maths in one module guarantees that "Total Completed Tasks" and
 * the On-Time Rate shown on the Performance tab are always aligned with the
 * numbers written into the exported Completed Tasks report.
 *
 * ---------------------------------------------------------------------------
 * CLASSIFICATION
 * ---------------------------------------------------------------------------
 * A completed task is classified by comparing the ACTUAL completion date/time
 * against the TARGET completion date/time:
 *
 *   early    -> actual  <  target
 *   on_time  -> actual === target   (same calendar day when the target has no
 *                                    time component, otherwise within a
 *                                    1 minute tolerance)
 *   delayed  -> actual  >  target
 *
 * ---------------------------------------------------------------------------
 * RATE FORMULAS  (as specified by the business)
 * ---------------------------------------------------------------------------
 *   On-Time Rate (task) = 100%
 *       A task completed exactly on the target date/time is recorded as "1"
 *       in the On-Time Tasks column and scores 100%. Therefore, when every
 *       task is completed on time, the overall On-Time Rate is 100%.
 *
 *   Early Rate (task)   = (Target duration / Actual duration) x 100   -> >100%
 *       The earlier the completion, the SHORTER the actual duration, and the
 *       HIGHER the resulting rate.
 *
 *   Delay Rate (task)   = (Target duration / Actual duration) x 100   -> <100%
 *       The longer the delay, the LONGER the actual duration, and the LOWER
 *       the resulting rate.
 *
 *   "Duration" is measured from the task start reference:
 *       Task Assigned At  (preferred)  ->  falls back to Created At
 *   up to the target date/time and up to the actual completion date/time
 *   respectively. Dates cannot be divided directly, so the elapsed durations
 *   they define are used — this is the only mathematically valid reading of
 *   "Target date / Actual completion date x 100" and it preserves the required
 *   behaviour (earlier = higher, later = lower).
 *
 *   Rates are NEVER clamped to 100%.
 *
 * ---------------------------------------------------------------------------
 * TOTALS AND OVERALL EFFICIENCY
 * ---------------------------------------------------------------------------
 *   Total Early Rate   = average Early Rate across the EARLY tasks
 *   Total On-Time Rate = 100% when at least one task is on time (each on-time
 *                        task scores exactly 100%)
 *   Total Delay Rate   = average Delay Rate across the DELAYED tasks
 *   Overall Efficiency = average of the totals that actually contain tasks
 *                        (empty buckets are skipped so that an "all tasks on
 *                        time" result correctly reports 100%)
 *
 * The count based shares are reported as well:
 *   Early / On-Time / Delayed Share = count / total completed x 100
 * Those three shares always add up to 100%, which keeps the task counts
 * aligned with the total number of completed tasks.
 * ============================================================================
 */

export type PerfBucket = 'early' | 'on_time' | 'delayed'

export interface TaskAnalysis {
  /** Start of the duration measurement (Task Assigned At, else Created At). */
  startDate: Date | null
  /** Resolved target completion date/time. */
  targetDate: Date | null
  /** Resolved actual completion date/time. */
  actualDate: Date | null
  /** Target duration in decimal days (start -> target). */
  targetDays: number | null
  /** Actual duration in decimal days (start -> actual). */
  actualDays: number | null
  /** actual - target in decimal days. Negative = finished early. */
  varianceDays: number | null
  /** Absolute days saved (early) or days late (delayed). */
  deviationDays: number | null
  /** null when the target and/or the actual date could not be resolved. */
  bucket: PerfBucket | null
  /** (Target duration / Actual duration) x 100; exactly 100 for on-time. */
  rate: number | null
}

export interface EfficiencyAggregate {
  /** Number of analysed (completed) tasks. */
  total: number
  /** Tasks that could be classified (target + actual date available). */
  classified: number
  /** Tasks without a usable target/actual date. */
  unclassified: number

  earlyCount: number
  onTimeCount: number
  delayedCount: number

  /** count / total x 100 — the three shares add up to 100%. */
  earlyShare: number
  onTimeShare: number
  delayedShare: number

  /** Average rate of the tasks inside each bucket. */
  totalEarlyRate: number
  totalOnTimeRate: number
  totalDelayRate: number

  /** Average of the buckets that contain at least one task. */
  overallEfficiency: number

  avgTargetDays: number
  avgActualDays: number
  avgVarianceDays: number
}

/* ==========================================================================
 * LOW LEVEL HELPERS
 * ========================================================================== */

/** Upper guard so a near-instant completion cannot produce an unreadable rate. */
export const MAX_RATE = 999.99
/** ~15 minutes. Prevents a division by zero on very short durations. */
export const MIN_DURATION_DAYS = 0.01

const ONE_MINUTE_MS = 60 * 1000
const MS_PER_DAY = 1000 * 60 * 60 * 24

export const toNumber = (value: any): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export const parseDate = (value?: string | null): Date | null => {
  if (!value) return null
  const d = new Date(value)
  return isNaN(d.getTime()) ? null : d
}

export const diffInDays = (start: Date | null, end: Date | null): number | null => {
  if (!start || !end) return null
  return Math.round(((end.getTime() - start.getTime()) / MS_PER_DAY) * 100) / 100
}

/** True when the timestamp carries a meaningful time-of-day component. */
export const hasTimeComponent = (d: Date): boolean =>
  d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0

export const average = (values: number[]): number => {
  if (values.length === 0) return 0
  const sum = values.reduce((acc, v) => acc + v, 0)
  return Math.round((sum / values.length) * 100) / 100
}

export const formatRate = (value: number | null | undefined): string => {
  const v = Number(value ?? 0)
  if (!isFinite(v)) return '0.00%'
  return `${(Math.round(v * 100) / 100).toFixed(2)}%`
}

export const formatDays = (value: number | null | undefined): string =>
  value === null || value === undefined || !isFinite(Number(value))
    ? 'N/A'
    : Number(value).toFixed(2)

export const bucketLabel = (bucket: PerfBucket | null): string => {
  if (bucket === 'early') return 'Early'
  if (bucket === 'on_time') return 'On-Time'
  if (bucket === 'delayed') return 'Delayed'
  return 'Not Classified'
}

export const bucketBadgeClass = (bucket: PerfBucket | null): string => {
  if (bucket === 'early') return 'bg-emerald-100 text-emerald-800'
  if (bucket === 'on_time') return 'bg-green-100 text-green-800'
  if (bucket === 'delayed') return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-600'
}

/* ==========================================================================
 * TARGET RESOLUTION
 * ========================================================================== */

/**
 * Resolve the configured target duration (decimal days) for a task category
 * from the "Add New Target Duration" configuration. Used only as a FALLBACK
 * when the task itself has no explicit target_completion_date.
 */
export function getConfiguredTargetDays(task: any, targetDaysConfig: any[]): number | null {
  if (!targetDaysConfig || targetDaysConfig.length === 0) return null

  const taskCategoryId = task?.category_id ?? task?.categoryId ?? task?.CategoryId ?? null
  const taskCategoryName = String(task?.category_name ?? task?.categoryName ?? '').trim().toLowerCase()

  const entry = targetDaysConfig.find((td: any) => {
    const tdCategoryId = td?.category_id ?? td?.categoryId ?? td?.CategoryId ?? td?.category?.id ?? null
    if (
      taskCategoryId !== null && taskCategoryId !== undefined &&
      tdCategoryId !== null && tdCategoryId !== undefined &&
      String(tdCategoryId) === String(taskCategoryId)
    ) {
      return true
    }
    const tdName = String(
      td?.category_name ?? td?.categoryName ?? td?.CategoryName ?? td?.category?.name ?? ''
    ).trim().toLowerCase()
    return tdName !== '' && tdName === taskCategoryName
  })

  if (!entry) return null

  const days = toNumber(entry.target_days ?? entry.targetDays ?? entry.TargetDays ?? entry.days)
  const hours = toNumber(entry.target_hours ?? entry.targetHours ?? entry.TargetHours)
  const minutes = toNumber(entry.target_minutes ?? entry.targetMinutes ?? entry.TargetMinutes)

  const total = days + hours / 24 + minutes / 1440
  if (!isFinite(total) || total <= 0) return null
  return Math.round(total * 100) / 100
}

/**
 * Start reference of the duration measurement.
 * Prefers "Task Assigned At"; falls back to "Created At" for legacy records.
 */
export function getVarianceStartValue(task: any): string | null {
  return (
    task?.task_assigned_at ??
    task?.taskAssignedAt ??
    task?.TaskAssignedAt ??
    task?.assigned_at ??
    task?.assignedAt ??
    task?.AssignedAt ??
    task?.created_at ??
    task?.createdAt ??
    task?.CreatedAt ??
    null
  )
}

/** Actual completion date/time of a completed task. */
export function getActualCompletionValue(task: any): string | null {
  return (
    task?.actual_completion_date ??
    task?.actualCompletionDate ??
    task?.ActualCompletionDate ??
    task?.completed_at ??
    task?.completedAt ??
    task?.CompletedAt ??
    null
  )
}

/** Explicit target completion date/time of a task (may be absent). */
export function getTargetCompletionValue(task: any): string | null {
  return (
    task?.target_completion_date ??
    task?.targetCompletionDate ??
    task?.TargetCompletionDate ??
    task?.target_completion ??
    null
  )
}

/* ==========================================================================
 * CORE ANALYSIS
 * ========================================================================== */

const emptyAnalysis: TaskAnalysis = {
  startDate: null,
  targetDate: null,
  actualDate: null,
  targetDays: null,
  actualDays: null,
  varianceDays: null,
  deviationDays: null,
  bucket: null,
  rate: null,
}

/**
 * Classify the actual completion date/time against the target date/time.
 * When the target has no time-of-day, the comparison is made on the calendar
 * day so "completed on the target date" counts as ON-TIME.
 */
export function classifyBucket(target: Date, actual: Date): PerfBucket {
  if (!hasTimeComponent(target)) {
    const t = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
    const a = new Date(actual.getFullYear(), actual.getMonth(), actual.getDate()).getTime()
    if (a === t) return 'on_time'
    return a < t ? 'early' : 'delayed'
  }
  const diff = actual.getTime() - target.getTime()
  if (Math.abs(diff) <= ONE_MINUTE_MS) return 'on_time'
  return diff < 0 ? 'early' : 'delayed'
}

/**
 * Rate of a single task:
 *   on-time -> exactly 100%
 *   early   -> (target duration / actual duration) x 100  => above 100%
 *   delayed -> (target duration / actual duration) x 100  => below 100%
 */
export function computeTaskRate(
  bucket: PerfBucket,
  targetDays: number | null,
  actualDays: number | null
): number {
  if (bucket === 'on_time') return 100
  const t = Math.max(toNumber(targetDays), MIN_DURATION_DAYS)
  const a = Math.max(toNumber(actualDays), MIN_DURATION_DAYS)
  const rate = (t / a) * 100
  if (!isFinite(rate) || rate < 0) return 0
  return Math.min(Math.round(rate * 100) / 100, MAX_RATE)
}

/**
 * Full per-task analysis.
 *
 * @param task              Normalised task object.
 * @param targetDaysConfig  Optional "Add New Target Duration" configuration
 *                          used to derive the target date when the task has
 *                          no explicit target_completion_date.
 */
export function analyzeTask(task: any, targetDaysConfig: any[] = []): TaskAnalysis {
  if (!task) return { ...emptyAnalysis }

  const startDate = parseDate(getVarianceStartValue(task))
  const actualDate = parseDate(getActualCompletionValue(task))

  let targetDate = parseDate(getTargetCompletionValue(task))

  // FALLBACK: derive the target date from the configured category duration.
  if (!targetDate && startDate) {
    const configuredDays = getConfiguredTargetDays(task, targetDaysConfig)
    if (configuredDays !== null) {
      targetDate = new Date(startDate.getTime() + configuredDays * MS_PER_DAY)
    }
  }

  const targetDays = diffInDays(startDate, targetDate)
  const actualDays = diffInDays(startDate, actualDate)
  const varianceDays =
    targetDays !== null && actualDays !== null
      ? Math.round((actualDays - targetDays) * 100) / 100
      : null

  if (!targetDate || !actualDate) {
    return {
      startDate,
      targetDate,
      actualDate,
      targetDays,
      actualDays,
      varianceDays,
      deviationDays: varianceDays === null ? null : Math.abs(varianceDays),
      bucket: null,
      rate: null,
    }
  }

  const bucket = classifyBucket(targetDate, actualDate)
  const rate = computeTaskRate(bucket, targetDays, actualDays)

  return {
    startDate,
    targetDate,
    actualDate,
    targetDays,
    actualDays,
    varianceDays,
    deviationDays: varianceDays === null ? null : Math.abs(varianceDays),
    bucket,
    rate,
  }
}

/** Aggregates per-task analyses into the summary figures. */
export function aggregateAnalyses(analyses: TaskAnalysis[]): EfficiencyAggregate {
  const total = analyses.length
  const early = analyses.filter(a => a.bucket === 'early')
  const onTime = analyses.filter(a => a.bucket === 'on_time')
  const delayed = analyses.filter(a => a.bucket === 'delayed')
  const classified = early.length + onTime.length + delayed.length

  const share = (count: number) =>
    total > 0 ? Math.round((count / total) * 10000) / 100 : 0

  const totalEarlyRate = average(early.map(a => toNumber(a.rate)))
  // Every on-time task scores exactly 100%, so the bucket total is 100%.
  const totalOnTimeRate = onTime.length > 0 ? 100 : 0
  const totalDelayRate = average(delayed.map(a => toNumber(a.rate)))

  // Overall Efficiency = average of the Early / On-Time / Delay totals.
  // Buckets with no tasks are skipped, otherwise an empty bucket would drag
  // the index towards 0 and "all tasks on time" would not report 100%.
  const applicable: number[] = []
  if (early.length > 0) applicable.push(totalEarlyRate)
  if (onTime.length > 0) applicable.push(totalOnTimeRate)
  if (delayed.length > 0) applicable.push(totalDelayRate)

  return {
    total,
    classified,
    unclassified: total - classified,
    earlyCount: early.length,
    onTimeCount: onTime.length,
    delayedCount: delayed.length,
    earlyShare: share(early.length),
    onTimeShare: share(onTime.length),
    delayedShare: share(delayed.length),
    totalEarlyRate,
    totalOnTimeRate,
    totalDelayRate,
    overallEfficiency: average(applicable),
    avgTargetDays: average(analyses.map(a => a.targetDays).filter((v): v is number => v !== null)),
    avgActualDays: average(analyses.map(a => a.actualDays).filter((v): v is number => v !== null)),
    avgVarianceDays: average(analyses.map(a => a.varianceDays).filter((v): v is number => v !== null)),
  }
}

/* ==========================================================================
 * FILTER HELPERS (shared by the table view and the export)
 * ========================================================================== */

/**
 * Inclusive date-range test on a date/time value.
 * `start` and `end` are `yyyy-MM-dd` strings coming from <input type="date">.
 * The end date is expanded to 23:59:59.999 so the whole day is included.
 */
export function isWithinDateRange(
  value?: string | null,
  start?: string | null,
  end?: string | null
): boolean {
  if (!start && !end) return true
  const d = parseDate(value ?? null)
  if (!d) return false

  if (start) {
    const s = new Date(`${start}T00:00:00`)
    if (!isNaN(s.getTime()) && d.getTime() < s.getTime()) return false
  }
  if (end) {
    const e = new Date(`${end}T23:59:59.999`)
    if (!isNaN(e.getTime()) && d.getTime() > e.getTime()) return false
  }
  return true
}

/** Split a task's assigned-engineer field into individual trimmed names. */
export function splitEngineerNames(assigned: any): string[] {
  return String(assigned ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0)
}

/**
 * Engineer filter test.
 *
 * An empty `selected` list means "all engineers inside the current role scope"
 * and therefore matches every task. Matching is case-insensitive and tolerates
 * comma separated multi-engineer assignments as well as partial names.
 */
export function matchesEngineerFilter(assigned: any, selected: string[]): boolean {
  if (!selected || selected.length === 0) return true

  const taskNames = splitEngineerNames(assigned).map(n => n.toLowerCase())
  if (taskNames.length === 0) return false

  const wanted = selected
    .map(s => String(s ?? '').trim().toLowerCase())
    .filter(s => s.length > 0 && s !== 'all')

  if (wanted.length === 0) return true

  return wanted.some(w =>
    taskNames.some(n => n === w || n.includes(w) || w.includes(n))
  )
}

/** Normalises a free-form engineer selection (dedupe / trim / drop "all"). */
export function cleanEngineerSelection(selected: string[]): string[] {
  return Array.from(
    new Set(
      (selected ?? [])
        .map(e => String(e ?? '').trim())
        .filter(e => e.length > 0 && e.toLowerCase() !== 'all')
    )
  )
}