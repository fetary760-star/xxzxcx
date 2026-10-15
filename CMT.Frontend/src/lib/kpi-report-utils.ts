/**
 * kpi-report-utils.ts
 * ---------------------------------------------------------------------------
 * Pure aggregation helpers for the "CMT Eng Status Report" tab.
 *
 * These helpers contain NO React and NO fetch logic, so they can be unit
 * tested and reused by other pages (Reports, Performance, exports, ...).
 *
 * Data sources they are designed to consume (already existing in the system):
 *   - GET /api/tasks                        -> active tasks (RBAC scoped)
 *   - GET /api/tasks/completed              -> completed tasks (RBAC scoped)
 *   - GET /api/reference-data/categories    -> category list
 *   - GET /api/reference-data/target-days   -> category target duration
 *
 * All field readers tolerate PascalCase / camelCase / snake_case because the
 * .NET backend and the Next.js proxies are not consistent about casing.
 * ---------------------------------------------------------------------------
 */

/* ===========================================================================
 * Generic field helpers
 * ======================================================================== */

/** Reads the first defined/non-null value among the given keys. */
export function pickField(source: any, keys: string[]): any {
  if (!source || typeof source !== 'object') return undefined
  for (const key of keys) {
    const value = source[key]
    if (value !== undefined && value !== null && value !== '') return value
  }
  return undefined
}

export function toNumberOrNull(value: any): number | null {
  if (value === undefined || value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Parses a backend date string into a Date, or null when unusable. */
export function parseDate(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

/** Whole days between two dates (never negative). */
export function diffInDays(later: Date, earlier: Date): number {
  const ms = later.getTime() - earlier.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return Math.floor(ms / 86_400_000)
}

/* ===========================================================================
 * Task status normalisation
 * ======================================================================== */

/**
 * Mirrors CMT.Domain.Enums.TaskStatus.
 * Pending=0, InProgress=1, Completed=2, Blocked=3, OnHold=4,
 * Rejected=5, Cancelled=6, Paused=7, PendingTLApproval=8
 */
export const TASK_STATUS_BY_CODE: Record<number, string> = {
  0: 'Pending',
  1: 'In Progress',
  2: 'Completed',
  3: 'Blocked',
  4: 'On Hold',
  5: 'Rejected',
  6: 'Cancelled',
  7: 'Paused',
  8: 'Pending TL Approval',
}

/** Statuses that count towards the "ACTIVE" KPI row. */
const ACTIVE_STATUSES = new Set(['In Progress'])

export function normalizeStatus(raw: any): string {
  if (raw === undefined || raw === null || raw === '') return 'Unknown'

  if (typeof raw === 'number') {
    return TASK_STATUS_BY_CODE[raw] ?? 'Unknown'
  }

  const text = String(raw).trim()
  if (/^\d+$/.test(text)) {
    return TASK_STATUS_BY_CODE[Number(text)] ?? 'Unknown'
  }

  const compact = text.toLowerCase().replace(/[\s_-]+/g, '')
  switch (compact) {
    case 'pending': return 'Pending'
    case 'inprogress': return 'In Progress'
    case 'completed': return 'Completed'
    case 'blocked': return 'Blocked'
    case 'onhold': return 'On Hold'
    case 'rejected': return 'Rejected'
    case 'cancelled':
    case 'canceled': return 'Cancelled'
    case 'paused': return 'Paused'
    case 'pendingtlapproval':
    case 'pendingtl':
    case 'pendingapproval': return 'Pending TL Approval'
    default: return text
  }
}

/* ===========================================================================
 * Normalised task shape
 * ======================================================================== */

export interface NormalizedTask {
  taskId: string
  categoryId: number | null
  categoryName: string
  status: string
  /** True when the record represents a finished task. */
  isCompleted: boolean
  createdAt: Date | null
  targetDate: Date | null
  completedAt: Date | null
}

/**
 * Normalises one raw record coming from /api/tasks or /api/tasks/completed.
 *
 * @param raw            the backend record
 * @param fromCompleted  true when the record came from /api/tasks/completed
 */
export function normalizeTask(raw: any, fromCompleted: boolean): NormalizedTask {
  const status = normalizeStatus(
    pickField(raw, ['status', 'Status', 'taskStatus', 'task_status']),
  )

  const createdAt = parseDate(
    pickField(raw, [
      'taskCreatedAt', 'TaskCreatedAt', 'task_created_at',
      'createdAt', 'CreatedAt', 'created_at',
    ]),
  )

  const targetDate = parseDate(
    pickField(raw, [
      'targetCompletionDate', 'TargetCompletionDate', 'target_completion_date',
      'estimatedCompletionDate', 'EstimatedCompletionDate', 'estimated_completion_date',
    ]),
  )

  const completedAt = parseDate(
    pickField(raw, [
      'actualCompletionDate', 'ActualCompletionDate', 'actual_completion_date',
      'engineerCompletedAt', 'EngineerCompletedAt', 'engineer_completed_at',
      'completedAt', 'CompletedAt', 'completed_at',
      'tlApprovalDate', 'TlApprovalDate', 'tl_approval_date',
      'movedToCompletedAt', 'MovedToCompletedAt', 'moved_to_completed_at',
    ]),
  )

  const rawId = pickField(raw, [
    'completedTaskId', 'CompletedTaskId', 'completed_task_id',
    'taskId', 'TaskId', 'task_id', 'id', 'Id',
  ])

  return {
    taskId: `${fromCompleted ? 'c' : 'a'}-${rawId ?? Math.random().toString(36).slice(2)}`,
    categoryId: toNumberOrNull(
      pickField(raw, ['categoryId', 'CategoryId', 'category_id']),
    ),
    categoryName: String(
      pickField(raw, ['categoryName', 'CategoryName', 'category_name']) ?? '',
    ).trim(),
    status,
    isCompleted: fromCompleted || status === 'Completed',
    createdAt,
    targetDate,
    completedAt,
  }
}

/** Normalises a whole payload, accepting the many envelope shapes in use. */
export function extractRecords(payload: any): any[] {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  for (const key of ['tasks', 'data', 'results', 'items', 'completedTasks']) {
    if (Array.isArray(payload[key])) return payload[key]
  }
  if (typeof payload === 'object') {
    for (const key of Object.keys(payload)) {
      if (Array.isArray(payload[key])) return payload[key]
    }
  }
  return []
}

/* ===========================================================================
 * Category columns (with target duration in the header)
 * ======================================================================== */

export interface CategoryColumn {
  key: string
  categoryId: number | null
  categoryName: string
  /** Target duration expressed in days (may be fractional). */
  targetDays: number | null
  /** e.g. "DTC Task Card (2)" */
  headerLabel: string
}

export const UNCATEGORIZED_KEY = 'uncategorized'

function formatTargetDays(days: number | null): string {
  if (days === null) return ''
  if (Number.isInteger(days)) return String(days)
  return days.toFixed(2).replace(/\.?0+$/, '')
}

/**
 * Builds the ordered category columns for the KPI table.
 *
 * @param categories  payload of /api/reference-data/categories
 * @param targetDays  payload of /api/reference-data/target-days
 */
export function buildCategoryColumns(
  categories: any[],
  targetDays: any[],
): CategoryColumn[] {
  const targetByCategoryId = new Map<number, number>()
  const targetByCategoryName = new Map<string, number>()

  for (const row of targetDays ?? []) {
    const days = toNumberOrNull(pickField(row, ['target_days', 'targetDays', 'TargetDays', 'days'])) ?? 0
    const hours = toNumberOrNull(pickField(row, ['target_hours', 'targetHours', 'TargetHours'])) ?? 0
    const minutes = toNumberOrNull(pickField(row, ['target_minutes', 'targetMinutes', 'TargetMinutes'])) ?? 0
    const total = days + hours / 24 + minutes / 1440
    if (total <= 0) continue

    const id = toNumberOrNull(pickField(row, ['category_id', 'categoryId', 'CategoryId']))
    if (id !== null) targetByCategoryId.set(id, total)

    const name = String(pickField(row, ['category_name', 'categoryName', 'CategoryName']) ?? '').trim().toLowerCase()
    if (name) targetByCategoryName.set(name, total)
  }

  return (categories ?? []).map((category, index) => {
    const categoryId = toNumberOrNull(
      pickField(category, ['category_id', 'categoryId', 'CategoryId', 'id', 'Id']),
    )
    const categoryName = String(
      pickField(category, ['name', 'Name', 'category_name', 'categoryName']) ?? `Category ${index + 1}`,
    ).trim()

    const target =
      (categoryId !== null ? targetByCategoryId.get(categoryId) : undefined) ??
      targetByCategoryName.get(categoryName.toLowerCase()) ??
      null

    const suffix = formatTargetDays(target)

    return {
      key: categoryId !== null ? `id-${categoryId}` : `name-${categoryName.toLowerCase()}`,
      categoryId,
      categoryName,
      targetDays: target,
      headerLabel: suffix ? `${categoryName} (${suffix})` : categoryName,
    }
  })
}

/** Resolves which column a task belongs to (id first, then name). */
export function resolveColumnKey(task: NormalizedTask, columns: CategoryColumn[]): string {
  if (task.categoryId !== null) {
    const byId = columns.find(c => c.categoryId === task.categoryId)
    if (byId) return byId.key
  }
  const name = task.categoryName.toLowerCase()
  if (name) {
    const byName = columns.find(c => c.categoryName.toLowerCase() === name)
    if (byName) return byName.key
  }
  return UNCATEGORIZED_KEY
}

/**
 * Appends an "Uncategorized" column when some tasks cannot be mapped, so no
 * real data is silently dropped from the report.
 */
export function withUncategorizedColumn(
  columns: CategoryColumn[],
  tasks: NormalizedTask[],
): CategoryColumn[] {
  const hasOrphans = tasks.some(t => resolveColumnKey(t, columns) === UNCATEGORIZED_KEY)
  if (!hasOrphans) return columns
  return [
    ...columns,
    {
      key: UNCATEGORIZED_KEY,
      categoryId: null,
      categoryName: 'Uncategorized',
      targetDays: null,
      headerLabel: 'Uncategorized',
    },
  ]
}

/* ===========================================================================
 * Date range
 * ======================================================================== */

export interface DateRange {
  start: Date | null
  end: Date | null
}

export function isWithinRange(date: Date | null, range: DateRange): boolean {
  if (!date) return false
  if (range.start && date.getTime() < range.start.getTime()) return false
  if (range.end && date.getTime() > range.end.getTime()) return false
  return true
}

/** The "as of" instant used for stock metrics (inventory, backlog, max age). */
export function resolveAsOf(range: DateRange): Date {
  const now = new Date()
  if (range.end && range.end.getTime() < now.getTime()) return range.end
  return now
}

/* ===========================================================================
 * Active inventory — the SINGLE source of truth
 * ---------------------------------------------------------------------------
 * Both the CMT STATUS "INVENTORY" row (and everything derived from it:
 * AVERAGE BACKLOG / MAX AGE / PENDING / IN PROGRESS / PAUSED / ON HOLD) and
 * the CMT BREAKDOWN month x category matrix MUST use this predicate, so the
 * INVENTORY figure always equals the BREAKDOWN grand total.
 *
 * Important: inventory is a STOCK metric. It reflects every task that is
 * currently still open in the Task table and is therefore NEVER filtered by
 * the selected date range.
 * ======================================================================== */

/** Statuses that are never part of the currently available active inventory. */
export const ACTIVE_INVENTORY_EXCLUDED_STATUSES = new Set([
  'Completed',
  'Rejected',
  'Cancelled',
])

/**
 * True when the record is a currently open task from the Task table.
 *
 *  - completed records (Completed Task table) never count,
 *  - Rejected / Cancelled records never count,
 *  - a record without a creation date cannot be aged or bucketed by month,
 *    so it is excluded from both tables to keep them aligned.
 */
export function isActiveInventoryTask(task: NormalizedTask): boolean {
  if (task.isCompleted) return false
  if (task.completedAt !== null) return false
  if (ACTIVE_INVENTORY_EXCLUDED_STATUSES.has(task.status)) return false
  if (!task.createdAt) return false
  return true
}

/**
 * True when the record is a Task-table row that still represents real
 * workload — used by the flow metrics OUTPUT TARGET and INPUT, which are
 * sourced from the Task table (not-completed tasks) and filtered by the
 * selected date range.
 */
export function isOpenWorkloadTask(task: NormalizedTask): boolean {
  if (task.isCompleted) return false
  if (ACTIVE_INVENTORY_EXCLUDED_STATUSES.has(task.status)) return false
  return true
}

/**
 * Fractional days between two dates (never negative).
 * Used for turn-around time, where whole-day flooring would hide sub-day
 * performance (e.g. a task finished in 6 hours would read as 0).
 */
export function diffInDaysExact(later: Date, earlier: Date): number {
  const ms = later.getTime() - earlier.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return ms / 86_400_000
}

/* ===========================================================================
 * Table 1 — KPI summary
 * ======================================================================== */

export const KPI_ROWS = [
  { key: 'outputTarget', label: 'OUTPUT TARGET', decimals: 0 },
  { key: 'actualOutput', label: 'ACTUAL OUTPUT', decimals: 0 },
  { key: 'actualOutputTat', label: 'ACTUAL OUTPUT avg. TAT', decimals: 2 },
  { key: 'input', label: 'INPUT', decimals: 0 },
  { key: 'inventory', label: 'INVENTORY', decimals: 0 },
  { key: 'averageBacklog', label: 'AVERAGE BACKLOG', decimals: 2 },
  { key: 'maxAge', label: 'MAX AGE', decimals: 0 },
  { key: 'active', label: 'ACTIVE', decimals: 0 },
] as const

export type KpiRowKey = typeof KPI_ROWS[number]['key']

export interface KpiTable {
  columns: CategoryColumn[]
  rows: Array<{
    key: KpiRowKey
    label: string
    decimals: number
    /** One value per column, in the same order as `columns`. */
    values: number[]
  }>
}

/**
 * Computes the KPI matrix.
 *
 * Metric definitions (documented so they can be tuned in one place):
 *
 * Flow metrics — filtered by the selected date range:
 *   OUTPUT TARGET   - Task table (not completed): tasks whose TARGET
 *                     completion date (creation date + category target
 *                     duration) falls in the range.
 *   ACTUAL OUTPUT   - Completed Task table: tasks completed inside the range.
 *   ACTUAL OUTPUT
 *   avg. TAT        - Completed Task table: average turn-around time in days
 *                     (completion date - creation date) of those same tasks.
 *   INPUT           - Task table (not completed): tasks created in the range.
 *
 * Stock metrics — the currently available active inventory, NEVER filtered by
 * the selected date range (see `isActiveInventoryTask`):
 *   INVENTORY       - all currently open tasks in the Task table.
 *   AVERAGE BACKLOG - mean age in days of the INVENTORY tasks.
 *   MAX AGE         - oldest age in days among the INVENTORY tasks.
 *   ACTIVE          - INVENTORY tasks currently "In Progress".
 */
export function computeKpiTable(
  tasks: NormalizedTask[],
  columns: CategoryColumn[],
  range: DateRange,
): KpiTable {
  /** Stock metrics are always evaluated as of now, independent of the range. */
  const asOf = new Date()
  const indexByKey = new Map<string, number>()
  columns.forEach((column, index) => indexByKey.set(column.key, index))

  const size = columns.length
  const outputTarget = new Array<number>(size).fill(0)
  const actualOutput = new Array<number>(size).fill(0)
  const input = new Array<number>(size).fill(0)
  const inventory = new Array<number>(size).fill(0)
  const active = new Array<number>(size).fill(0)
  const ageSum = new Array<number>(size).fill(0)
  const maxAge = new Array<number>(size).fill(0)
  const tatSum = new Array<number>(size).fill(0)
  const tatCount = new Array<number>(size).fill(0)

  for (const task of tasks) {
    const index = indexByKey.get(resolveColumnKey(task, columns))
    if (index === undefined) continue

    // ---- Completed Task table -> ACTUAL OUTPUT + avg. TAT -----------------
    if (task.isCompleted) {
      if (isWithinRange(task.completedAt, range)) {
        actualOutput[index] += 1
        if (task.completedAt && task.createdAt) {
          tatSum[index] += diffInDaysExact(task.completedAt, task.createdAt)
          tatCount[index] += 1
        }
      }
      continue
    }

    // ---- Task table (not completed) -> OUTPUT TARGET + INPUT --------------
    if (isOpenWorkloadTask(task)) {
      if (isWithinRange(task.targetDate, range)) outputTarget[index] += 1
      if (isWithinRange(task.createdAt, range)) input[index] += 1
    }

    // ---- stock metrics (current inventory, range independent) -------------
    if (!isActiveInventoryTask(task)) continue

    inventory[index] += 1
    const age = task.createdAt ? diffInDays(asOf, task.createdAt) : 0
    ageSum[index] += age
    if (age > maxAge[index]) maxAge[index] = age
    if (ACTIVE_STATUSES.has(task.status)) active[index] += 1
  }

  const averageBacklog = inventory.map((count, i) =>
    count > 0 ? Number((ageSum[i] / count).toFixed(2)) : 0,
  )

  const actualOutputTat = tatSum.map((sum, i) =>
    tatCount[i] > 0 ? Number((sum / tatCount[i]).toFixed(2)) : 0,
  )

  const valuesByKey: Record<KpiRowKey, number[]> = {
    outputTarget,
    actualOutput,
    actualOutputTat,
    input,
    inventory,
    averageBacklog,
    maxAge,
    active,
  }

  return {
    columns,
    rows: KPI_ROWS.map(row => ({
      key: row.key,
      label: row.label,
      decimals: row.decimals,
      values: valuesByKey[row.key],
    })),
  }
}

/* ===========================================================================
 * Table 2 — category x month matrix
 * ======================================================================== */

export type DateBasis = 'created' | 'completed'

export interface MonthColumn {
  /** Sortable key, e.g. "2026-01". */
  key: string
  year: number
  /** 0-based month index. */
  month: number
  /** e.g. "JANUARY" or "JAN '25" when the range spans several years. */
  label: string
  tone: MonthTone
}

export type MonthTone = 'current' | 'previous' | 'older' | 'future'

export interface MonthlyMatrix {
  months: MonthColumn[]
  rows: Array<{
    key: string
    categoryName: string
    counts: number[]
    total: number
  }>
  /** Column totals, aligned with `months`. */
  monthTotals: number[]
  /** Column averages per contributing category, aligned with `months`. */
  monthAverages: number[]
  grandTotal: number
  /** Average tasks per month across the whole matrix. */
  overallMonthlyAverage: number
}

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]

function monthIndexOf(year: number, month: number): number {
  return year * 12 + month
}

/** Classifies a month relative to the reference date (defaults to today). */
export function getMonthTone(year: number, month: number, reference: Date = new Date()): MonthTone {
  const current = monthIndexOf(reference.getFullYear(), reference.getMonth())
  const value = monthIndexOf(year, month)
  if (value === current) return 'current'
  if (value === current - 1) return 'previous'
  if (value < current - 1) return 'older'
  return 'future'
}

function basisDate(task: NormalizedTask, basis: DateBasis): Date | null {
  return basis === 'completed' ? task.completedAt : task.createdAt
}

/**
 * Builds the "task count per category per month" matrix.
 * Only months that actually contain data are emitted, matching the reference
 * layout where empty months are skipped.
 */
export function computeMonthlyMatrix(
  tasks: NormalizedTask[],
  columns: CategoryColumn[],
  range: DateRange,
  basis: DateBasis = 'created',
  reference: Date = new Date(),
): MonthlyMatrix {
  const rowKeys = columns.map(c => c.key)
  const rowIndexByKey = new Map<string, number>()
  rowKeys.forEach((key, index) => rowIndexByKey.set(key, index))

  // monthKey -> (rowIndex -> count)
  const buckets = new Map<string, number[]>()
  const monthMeta = new Map<string, { year: number; month: number }>()

  for (const task of tasks) {
    const date = basisDate(task, basis)
    if (!date || !isWithinRange(date, range)) continue
    if (basis === 'completed' && !task.isCompleted) continue

    const rowIndex = rowIndexByKey.get(resolveColumnKey(task, columns))
    if (rowIndex === undefined) continue

    const year = date.getFullYear()
    const month = date.getMonth()
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`

    if (!buckets.has(monthKey)) {
      buckets.set(monthKey, new Array<number>(rowKeys.length).fill(0))
      monthMeta.set(monthKey, { year, month })
    }
    buckets.get(monthKey)![rowIndex] += 1
  }

  const sortedKeys = Array.from(buckets.keys()).sort()
  const years = new Set(sortedKeys.map(k => Number(k.slice(0, 4))))
  const multiYear = years.size > 1

  const months: MonthColumn[] = sortedKeys.map(key => {
    const meta = monthMeta.get(key)!
    const shortYear = String(meta.year).slice(-2)
    return {
      key,
      year: meta.year,
      month: meta.month,
      label: multiYear
        ? `${MONTH_NAMES[meta.month].slice(0, 3)} '${shortYear}`
        : MONTH_NAMES[meta.month],
      tone: getMonthTone(meta.year, meta.month, reference),
    }
  })

  const rows = columns.map((column, rowIndex) => {
    const counts = months.map(m => buckets.get(m.key)![rowIndex])
    return {
      key: column.key,
      categoryName: column.categoryName,
      counts,
      total: counts.reduce((sum, n) => sum + n, 0),
    }
  })

  const monthTotals = months.map((_, colIndex) =>
    rows.reduce((sum, row) => sum + row.counts[colIndex], 0),
  )

  // "Average" is expressed per contributing category so that categories with
  // no activity at all do not dilute the figure.
  const contributingRows = rows.filter(row => row.total > 0).length
  const monthAverages = monthTotals.map(total =>
    contributingRows > 0 ? Number((total / contributingRows).toFixed(2)) : 0,
  )

  const grandTotal = monthTotals.reduce((sum, n) => sum + n, 0)
  const overallMonthlyAverage = months.length > 0
    ? Number((grandTotal / months.length).toFixed(2))
    : 0

  return { months, rows, monthTotals, monthAverages, grandTotal, overallMonthlyAverage }
}

/* ===========================================================================
 * Formatting + presentation helpers
 * ======================================================================== */

export function formatMetric(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '-'
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value))
}

/** Tailwind classes for the month body cells. */
export const MONTH_TONE_CELL_CLASS: Record<MonthTone, string> = {
  current: 'bg-green-500 text-white',
  previous: 'bg-yellow-300 text-gray-900',
  older: 'bg-red-200 text-gray-900',
  future: 'bg-blue-50 text-gray-900',
}

/** Tailwind classes for the month header cells. */
export const MONTH_TONE_HEADER_CLASS: Record<MonthTone, string> = {
  current: 'bg-green-600 text-white',
  previous: 'bg-yellow-400 text-gray-900',
  older: 'bg-red-300 text-gray-900',
  future: 'bg-blue-100 text-gray-900',
}

/** Converts an <input type="date"> value into a normalised range boundary. */
export function toRangeBoundary(value: string, edge: 'start' | 'end'): Date | null {
  if (!value) return null
  const parsed = parseDate(value)
  if (!parsed) return null
  return edge === 'start' ? startOfDay(parsed) : endOfDay(parsed)
}

/** Formats a Date as the yyyy-MM-dd value expected by <input type="date">. */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}