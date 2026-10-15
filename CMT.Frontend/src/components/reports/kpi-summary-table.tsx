'use client'

import React from 'react'
import {
  formatMetric,
  resolveColumnKey,
  type CategoryColumn,
  type DateRange,
  type KpiTable,
  type NormalizedTask,
} from '@/lib/kpi-report-utils'

/* ===========================================================================
 * CMT STATUS — metric contract
 * ---------------------------------------------------------------------------
 * Source: Completed Task table (task.isCompleted === true)
 *   ACTUAL OUTPUT           tasks whose completion date falls in the range.
 *   ACTUAL OUTPUT avg. TAT  average turn-around time, in days, of exactly
 *                           those tasks (completion date - creation date).
 *
 * Source: Task table + Completed Task table (all non-discarded rows)
 *   OUTPUT TARGET           tasks whose Target Completion Date
 *                           (= task creation date + category target duration)
 *                           falls in the selected date range.
 *   INPUT                   not-completed tasks created inside the range.
 *
 * Source: Task table, currently available active inventory (NO date filter)
 *   INVENTORY               all currently open tasks.
 *   AVERAGE BACKLOG         mean age in days of the INVENTORY tasks.
 *   MAX AGE                 oldest age in days among the INVENTORY tasks.
 *   PENDING / IN PROGRESS / PAUSED / ON HOLD
 *                           INVENTORY split by current status.
 *
 * ---------------------------------------------------------------------------
 * FIX (OUTPUT TARGET was always 0)
 * ---------------------------------------------------------------------------
 * Three independent problems were making the row collapse to zero:
 *
 *   1. The target date was ONLY read from the backend column
 *      (TargetCompletionDate / EstimatedCompletionDate). Whenever the API does
 *      not populate it, `targetDate` is null and nothing can ever match.
 *      -> `resolveTargetDate()` now falls back to
 *         task creation date + category target duration (the column header
 *         value, e.g. "DTC Task Card (2)" => 2 days), exactly as described in
 *         the reference-data rule.
 *
 *   2. The row was restricted to not-completed tasks, so a task that was
 *      delivered inside the range no longer contributed to the target it was
 *      committed to. ACTUAL OUTPUT could therefore be > 0 while OUTPUT TARGET
 *      stayed 0.
 *      -> every non-discarded task (open AND completed) is now counted.
 *
 *   3. The range comparison used exact timestamps, so an ISO date carrying a
 *      time / timezone offset (e.g. "2026-03-31T22:00:00Z") could land outside
 *      an end boundary of the same calendar day.
 *      -> all range checks are now done at CALENDAR-DAY granularity in local
 *         time (`isWithinRangeByDay`), which is immune to time-of-day and to
 *         mixed date formats.
 *
 * A small resolution summary is printed under the table so the numbers can be
 * audited at a glance (explicit vs derived vs missing target dates).
 * ======================================================================== */

/* ===========================================================================
 * Local, self-contained helpers
 * ---------------------------------------------------------------------------
 * Deliberately defined in this file so the component only depends on stable
 * exports of `kpi-report-utils` (formatMetric / resolveColumnKey / types).
 * ======================================================================== */

const MS_PER_DAY = 86_400_000

/** Statuses that must never be counted anywhere in the report. */
const DISCARDED_STATUSES = new Set(['Rejected', 'Cancelled'])

function isDiscardedTask(task: NormalizedTask): boolean {
  return DISCARDED_STATUSES.has(task.status)
}

/** Currently available (open) inventory — mirrors the CMT BREAKDOWN filter. */
export function isActiveInventoryTask(task: NormalizedTask): boolean {
  if (task.isCompleted) return false
  if (task.status === 'Completed') return false
  return !isDiscardedTask(task)
}

/** Not-completed workload rows of the Task table. */
export function isOpenWorkloadTask(task: NormalizedTask): boolean {
  return isActiveInventoryTask(task)
}

/** Fractional days between two dates (never negative). */
export function diffInDaysExact(later: Date, earlier: Date): number {
  const ms = later.getTime() - earlier.getTime()
  if (!Number.isFinite(ms) || ms <= 0) return 0
  return ms / MS_PER_DAY
}

/** Whole days between two dates (never negative). */
export function diffInWholeDays(later: Date, earlier: Date): number {
  return Math.floor(diffInDaysExact(later, earlier))
}

/**
 * Comparable calendar-day serial (yyyymmdd) in LOCAL time.
 * Using a serial instead of a timestamp makes the comparison independent of
 * the time-of-day, of DST and of the incoming date format.
 */
function toDaySerial(date: Date): number {
  return (
    date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate()
  )
}

function isValidDate(date: Date | null | undefined): date is Date {
  return date instanceof Date && !Number.isNaN(date.getTime())
}

/** Range test at calendar-day granularity (inclusive on both edges). */
export function isWithinRangeByDay(
  date: Date | null | undefined,
  range: DateRange,
): boolean {
  if (!isValidDate(date)) return false
  const value = toDaySerial(date)
  if (isValidDate(range.start) && value < toDaySerial(range.start)) return false
  if (isValidDate(range.end) && value > toDaySerial(range.end)) return false
  return true
}

export type TargetDateSource = 'explicit' | 'derived' | 'none'

export interface ResolvedTargetDate {
  date: Date | null
  source: TargetDateSource
}

/**
 * Target Completion Date of a task.
 *
 *   1. the value stored by the backend, when present;
 *   2. otherwise task creation date + category target duration (days);
 *   3. otherwise the creation date itself (no duration configured);
 *   4. `null` only when the task has no usable creation date at all.
 */
export function resolveTargetDate(
  task: NormalizedTask,
  column: CategoryColumn | undefined,
): ResolvedTargetDate {
  if (isValidDate(task.targetDate)) {
    return { date: task.targetDate, source: 'explicit' }
  }

  if (isValidDate(task.createdAt)) {
    const days = column?.targetDays ?? 0
    const safeDays = Number.isFinite(days) && days > 0 ? days : 0
    return {
      date: new Date(task.createdAt.getTime() + safeDays * MS_PER_DAY),
      source: 'derived',
    }
  }

  return { date: null, source: 'none' }
}

/* ===========================================================================
 * Row model
 * ======================================================================== */

export interface KpiSummaryRow {
  key: string
  label: string
  decimals: number
  values: number[]
  hideWhenEmpty?: boolean
  isStatusRow?: boolean
  /** Short explanation surfaced as the row tooltip. */
  hint?: string
}

/** Audit counters explaining how OUTPUT TARGET was obtained. */
export interface KpiDiagnostics
{
  consideredTasks: number
  explicitTargetDates: number
  derivedTargetDates: number
  missingTargetDates: number
  targetsInRange: number
  targetsOutsideRange: number
}

export interface KpiSummaryResult {
  rows: KpiSummaryRow[]
  diagnostics: KpiDiagnostics
}

const STATUS_ROW_DEFS: Array<{ key: string; label: string; statuses: string[] }> = [
  { key: 'pending', label: 'PENDING', statuses: ['Pending', 'Pending TL Approval'] },
  { key: 'inProgress', label: 'IN PROGRESS', statuses: ['In Progress'] },
  { key: 'paused', label: 'PAUSED', statuses: ['Paused'] },
  { key: 'onHold', label: 'ON HOLD', statuses: ['On Hold', 'Blocked'] },
]

const OTHER_OPEN_ROW_KEY = 'otherOpen'

const STATUS_ROW_KEYS = new Set<string>([
  ...STATUS_ROW_DEFS.map(def => def.key),
  OTHER_OPEN_ROW_KEY,
])

const REMOVED_ROW_KEYS = new Set<string>(['active'])

const EMPTY_DIAGNOSTICS: KpiDiagnostics = {
  consideredTasks: 0,
  explicitTargetDates: 0,
  derivedTargetDates: 0,
  missingTargetDates: 0,
  targetsInRange: 0,
  targetsOutsideRange: 0,
}

/* ===========================================================================
 * Aggregation
 * ======================================================================== */

export function buildKpiSummary(
  tasks: NormalizedTask[],
  columns: CategoryColumn[],
  range: DateRange,
): KpiSummaryResult {
  /**
   * Stock metrics are always evaluated "as of now": the currently available
   * inventory does not depend on the selected date range.
   */
  const asOf = new Date()
  const size = columns.length

  const indexByKey = new Map<string, number>()
  columns.forEach((column, index) => indexByKey.set(column.key, index))

  const zeros = () => new Array<number>(size).fill(0)

  // ---- flow metrics -------------------------------------------------------
  const outputTarget = zeros()
  const actualOutput = zeros()
  const input = zeros()

  // ---- turn-around time (Completed Task table only) -----------------------
  const tatSum = zeros()
  const tatCount = zeros()

  // ---- stock metrics (current inventory, no date filter) ------------------
  const inventory = zeros()
  const ageSum = zeros()
  const maxAge = zeros()

  const diagnostics: KpiDiagnostics = { ...EMPTY_DIAGNOSTICS }

  const statusCounts = new Map<string, number[]>()
  for (const def of STATUS_ROW_DEFS) statusCounts.set(def.key, zeros())
  statusCounts.set(OTHER_OPEN_ROW_KEY, zeros())

  const rowKeyByStatus = new Map<string, string>()
  for (const def of STATUS_ROW_DEFS) {
    for (const status of def.statuses) rowKeyByStatus.set(status, def.key)
  }

  for (const task of tasks) {
    const index = indexByKey.get(resolveColumnKey(task, columns))
    if (index === undefined) continue

    // Rejected / Cancelled rows are noise for every metric of this table.
    if (isDiscardedTask(task)) continue

    diagnostics.consideredTasks += 1

    /* ---- OUTPUT TARGET ---------------------------------------------------
     * Creation date + category target duration, compared with the selected
     * range on a calendar-day basis. Completed tasks are included: the target
     * they were committed to still belongs to the period.
     * ------------------------------------------------------------------- */
    const target = resolveTargetDate(task, columns[index])

    if (target.source === 'explicit') diagnostics.explicitTargetDates += 1
    else if (target.source === 'derived') diagnostics.derivedTargetDates += 1
    else diagnostics.missingTargetDates += 1

    if (isWithinRangeByDay(target.date, range)) {
      outputTarget[index] += 1
      diagnostics.targetsInRange += 1
    } else if (target.date) {
      diagnostics.targetsOutsideRange += 1
    }

    /* ---- Completed Task table -> ACTUAL OUTPUT + avg. TAT --------------- */
    if (task.isCompleted || task.status === 'Completed') {
      if (isWithinRangeByDay(task.completedAt, range)) {
        actualOutput[index] += 1

        if (isValidDate(task.completedAt) && isValidDate(task.createdAt)) {
          tatSum[index] += diffInDaysExact(task.completedAt, task.createdAt)
          tatCount[index] += 1
        }
      }
      continue
    }

    /* ---- Task table (not completed) -> INPUT ---------------------------- */
    if (isOpenWorkloadTask(task) && isWithinRangeByDay(task.createdAt, range)) {
      input[index] += 1
    }

    /* ---- Task table -> current active inventory (range independent) ----- */
    if (!isActiveInventoryTask(task)) continue

    inventory[index] += 1

    const age = isValidDate(task.createdAt)
      ? diffInWholeDays(asOf, task.createdAt)
      : 0
    ageSum[index] += age
    if (age > maxAge[index]) maxAge[index] = age

    const statusRowKey = rowKeyByStatus.get(task.status) ?? OTHER_OPEN_ROW_KEY
    statusCounts.get(statusRowKey)![index] += 1
  }

  const actualOutputTat = tatSum.map((sum, i) =>
    tatCount[i] > 0 ? Number((sum / tatCount[i]).toFixed(2)) : 0,
  )

  const averageBacklog = inventory.map((count, i) =>
    count > 0 ? Number((ageSum[i] / count).toFixed(2)) : 0,
  )

  const rows: KpiSummaryRow[] = [
    {
      key: 'outputTarget',
      label: 'OUTPUT TARGET',
      decimals: 0,
      values: outputTarget,
      hint: 'Tasks whose Target Completion Date (task creation date + category target duration) falls within the selected date range. Open and completed tasks both count; Rejected / Cancelled are excluded.',
    },
    {
      key: 'actualOutput',
      label: 'ACTUAL OUTPUT',
      decimals: 0,
      values: actualOutput,
      hint: 'Completed Task table: tasks completed within the selected date range.',
    },
    {
      key: 'actualOutputTat',
      label: 'ACTUAL OUTPUT avg. TAT',
      decimals: 2,
      values: actualOutputTat,
      hint: 'Completed Task table: average turn-around time in days (completion date - creation date) of the tasks counted in ACTUAL OUTPUT.',
    },
    {
      key: 'input',
      label: 'INPUT',
      decimals: 0,
      values: input,
      hint: 'Task table (not completed): tasks created within the selected date range.',
    },
    {
      key: 'inventory',
      label: 'INVENTORY',
      decimals: 0,
      values: inventory,
      hint: 'Task table: all currently available active tasks. Not affected by the date range, and equal to the CMT BREAKDOWN total.',
    },
    {
      key: 'averageBacklog',
      label: 'AVERAGE BACKLOG',
      decimals: 2,
      values: averageBacklog,
      hint: 'Average age in days of the current INVENTORY tasks. Not affected by the date range.',
    },
    {
      key: 'maxAge',
      label: 'MAX AGE',
      decimals: 0,
      values: maxAge,
      hint: 'Oldest age in days among the current INVENTORY tasks. Not affected by the date range.',
    },
  ]

  for (const def of STATUS_ROW_DEFS) {
    rows.push({
      key: def.key,
      label: def.label,
      decimals: 0,
      values: statusCounts.get(def.key)!,
      isStatusRow: true,
      hint: `Current INVENTORY tasks with status: ${def.statuses.join(', ')}. Not affected by the date range.`,
    })
  }

  rows.push({
    key: OTHER_OPEN_ROW_KEY,
    label: 'OTHER (OPEN)',
    decimals: 0,
    values: statusCounts.get(OTHER_OPEN_ROW_KEY)!,
    isStatusRow: true,
    hideWhenEmpty: true,
    hint: 'Current INVENTORY tasks whose status does not map to the rows above.',
  })

  return { rows, diagnostics }
}

/** Backward compatible wrapper — returns the rows only. */
export function buildKpiSummaryRows(
  tasks: NormalizedTask[],
  columns: CategoryColumn[],
  range: DateRange,
): KpiSummaryRow[] {
  return buildKpiSummary(tasks, columns, range).rows
}

function adaptLegacyRows(table: KpiTable | undefined): KpiSummaryRow[] {
  if (!table) return []
  return table.rows
    .filter(row => !REMOVED_ROW_KEYS.has(row.key))
    .map(row => ({
      key: row.key,
      label: row.label,
      decimals: row.decimals,
      values: row.values,
      isStatusRow: STATUS_ROW_KEYS.has(row.key),
      // `row.key` is a KpiRowKey union, while OTHER_OPEN_ROW_KEY is an extra
      // status row that only exists in the new row model — compare as strings.
      hideWhenEmpty: (row.key as string) === OTHER_OPEN_ROW_KEY,
    }))
}

/* ===========================================================================
 * Helpers
 * ======================================================================== */

const ROW_TINT: Record<string, string> = {
  outputTarget: 'bg-sky-600 text-white',
  actualOutputTat: 'bg-sky-100 text-gray-900',
  input: 'bg-lime-100 text-gray-900',
  inventory: 'bg-lime-200 text-gray-900',
  averageBacklog: 'bg-lime-100 text-gray-900',
  maxAge: 'bg-lime-200 text-gray-900',
  pending: 'bg-amber-50 text-gray-900',
  inProgress: 'bg-sky-50 text-gray-900',
  paused: 'bg-violet-50 text-gray-900',
  onHold: 'bg-orange-50 text-gray-900',
  otherOpen: 'bg-gray-50 text-gray-900',
}

const ROW_LABEL_TINT = 'bg-lime-300 text-gray-900'
const STATUS_ROW_LABEL_TINT = 'bg-lime-200 text-gray-900'
/** Sub-row of ACTUAL OUTPUT — visually attached to it. */
const TAT_ROW_LABEL_TINT = 'bg-lime-200 text-gray-900'

/** Rows that ignore the Date Range Filter get a small "current" marker. */
const RANGE_INDEPENDENT_ROW_KEYS = new Set<string>([
  'inventory',
  'averageBacklog',
  'maxAge',
  ...STATUS_ROW_DEFS.map(def => def.key),
  OTHER_OPEN_ROW_KEY,
])

function actualOutputCellClass(actual: number, target: number): string {
  return actual >= target
    ? 'bg-green-50 text-green-700'
    : 'bg-red-50 text-red-600'
}

function densityClasses(columnCount: number): {
  text: string
  cell: string
  header: string
} {
  if (columnCount > 12) {
    return {
      text: 'text-[9px] sm:text-[10px]',
      cell: 'px-0.5 py-1',
      header: 'px-0.5 py-1',
    }
  }
  if (columnCount > 8) {
    return {
      text: 'text-[10px] sm:text-[11px]',
      cell: 'px-1 py-1.5',
      header: 'px-1 py-1.5',
    }
  }
  return {
    text: 'text-[11px] sm:text-xs',
    cell: 'px-1.5 py-2',
    header: 'px-1.5 py-2',
  }
}

function labelColumnWidth(columnCount: number): string {
  if (columnCount > 12) return '20%'
  if (columnCount > 8) return '22%'
  return '24%'
}

export interface KpiSummaryTableProps {
  tasks?: NormalizedTask[]
  columns?: CategoryColumn[]
  range?: DateRange
  table?: KpiTable
  title?: string
  loading?: boolean
  dateRangeLabel?: string
  /** Shows the OUTPUT TARGET resolution summary under the table. */
  showTargetDiagnostics?: boolean
  className?: string
}

const ALL_TIME_RANGE: DateRange = { start: null, end: null }

export function KpiSummaryTable({
  tasks,
  columns,
  range,
  table,
  title = 'CMT ENG STATUS REPORT',
  loading = false,
  dateRangeLabel,
  showTargetDiagnostics = true,
  className = '',
}: KpiSummaryTableProps) {
  const resolvedColumns: CategoryColumn[] = columns ?? table?.columns ?? []

  const { rows, diagnostics } = React.useMemo<KpiSummaryResult>(() => {
    if (tasks && columns) {
      return buildKpiSummary(tasks, columns, range ?? ALL_TIME_RANGE)
    }
    return { rows: adaptLegacyRows(table), diagnostics: { ...EMPTY_DIAGNOSTICS } }
  }, [tasks, columns, range, table])

  const hasColumns = resolvedColumns.length > 0
  const targetValues = rows.find(row => row.key === 'outputTarget')?.values ?? []
  const targetTotal = targetValues.reduce((sum, value) => sum + value, 0)
  const visibleRows = rows.filter(
    row => !row.hideWhenEmpty || row.values.some(value => value > 0),
  )

  const density = densityClasses(resolvedColumns.length)

  return (
    <div
      className={`w-full bg-white shadow overflow-hidden rounded-none sm:rounded ${className}`}
    >
      <div className="bg-lime-200 px-4 py-2 text-center font-bold text-teal-800 tracking-wide">
        {title}
        {dateRangeLabel ? (
          <span className="ml-2 font-normal text-[11px] text-teal-900/80">
            (Date Range: {dateRangeLabel})
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="p-6 text-sm text-gray-500">Loading KPI data...</div>
      ) : !hasColumns ? (
        <div className="p-6 text-sm text-gray-500">
          No categories available for the selected date range.
        </div>
      ) : (
        <div className="w-full">
          <table
            className={`w-full table-fixed border-collapse ${density.text}`}
          >
            <colgroup>
              <col style={{ width: labelColumnWidth(resolvedColumns.length) }} />
              {resolvedColumns.map(column => (
                <col key={`col-${column.key}`} />
              ))}
            </colgroup>

            <thead>
              <tr>
                <th
                  scope="col"
                  className={`border border-white/70 text-center font-bold align-middle ${density.header} ${ROW_LABEL_TINT}`}
                >
                  KPI
                </th>
                {resolvedColumns.map(column => (
                  <th
                    key={column.key}
                    scope="col"
                    className={`border border-gray-300 bg-white text-center font-bold text-gray-900 align-middle whitespace-normal break-words leading-tight ${density.header}`}
                    title={
                      column.targetDays !== null
                        ? `${column.headerLabel} — target duration: ${column.targetDays} day(s)`
                        : `${column.headerLabel} — no target duration configured`
                    }
                  >
                    {column.headerLabel}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {visibleRows.map(row => {
                const isActualOutput = row.key === 'actualOutput'
                const isTatRow = row.key === 'actualOutputTat'
                const isStatusRow = row.isStatusRow === true
                const isRangeIndependent = RANGE_INDEPENDENT_ROW_KEYS.has(row.key)

                const labelTint = isStatusRow
                  ? STATUS_ROW_LABEL_TINT
                  : isTatRow
                    ? TAT_ROW_LABEL_TINT
                    : ROW_LABEL_TINT

                return (
                  <tr key={row.key}>
                    <th
                      scope="row"
                      title={row.hint}
                      className={`border border-white/70 text-center font-semibold whitespace-normal break-words leading-tight ${density.cell} ${labelTint}`}
                    >
                      {isStatusRow || isTatRow ? (
                        <span className="flex items-center justify-center gap-1">
                          <span className="text-[10px] text-teal-800">└</span>
                          {row.label}
                          {isTatRow ? (
                            <span className="font-normal text-[9px] text-teal-800">
                              (days)
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        row.label
                      )}
                      {isRangeIndependent ? (
                        <span
                          className="ml-1 align-middle text-[9px] font-normal text-teal-700"
                          title="Current inventory — not affected by the selected date range."
                        >
                          ●
                        </span>
                      ) : null}
                    </th>

                    {resolvedColumns.map((column, index) => {
                      const value = row.values[index] ?? 0
                      const target = targetValues[index] ?? 0
                      const cellClass = isActualOutput
                        ? actualOutputCellClass(value, target)
                        : ROW_TINT[row.key] ?? 'bg-white text-gray-900'

                      return (
                        <td
                          key={`${row.key}-${column.key}`}
                          className={`border border-gray-300 text-center font-semibold ${density.cell} ${cellClass}`}
                        >
                          <span className="inline-flex items-center justify-center gap-0.5">
                            {formatMetric(value, row.decimals)}
                            {isActualOutput ? (
                              <span aria-hidden className="text-[9px]">
                                {value >= target ? '▲' : '▼'}
                              </span>
                            ) : null}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-1 border-t bg-gray-50 px-4 py-2 text-[11px] leading-relaxed text-gray-600">
        <p className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-green-500" />
            Actual Output ≥ Output Target
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-red-500" />
            Actual Output &lt; Output Target
          </span>
          <span className="flex items-center gap-1">
            <span className="text-teal-700">●</span>
            Current inventory — ignores the Date Range Filter
          </span>
        </p>
        <p>
          <span className="font-semibold">Output Target — Reference Data:</span>{' '}
          The Target Completion Date is the task creation date plus the category
          target duration shown in the column header. OUTPUT TARGET counts the
          tasks — open and completed — whose Target Completion Date falls within
          the selected date range (compared by calendar day, so any date format
          or time-of-day is accepted). Rejected and Cancelled tasks are excluded.
        </p>
        {showTargetDiagnostics && diagnostics.consideredTasks > 0 ? (
          <p>
            <span className="font-semibold">Output Target — resolution:</span>{' '}
            {diagnostics.consideredTasks} task(s) evaluated ·{' '}
            {diagnostics.explicitTargetDates} used the stored Target Completion
            Date · {diagnostics.derivedTargetDates} derived from creation date +
            target duration · {diagnostics.missingTargetDates} without any
            usable date · {diagnostics.targetsInRange} inside and{' '}
            {diagnostics.targetsOutsideRange} outside the selected range.
            {targetTotal === 0 && diagnostics.targetsOutsideRange > 0 ? (
              <span className="ml-1 font-semibold text-amber-700">
                All target dates fall outside the selected range — widen the
                Start / End dates (target dates are often in the future).
              </span>
            ) : null}
          </p>
        ) : null}
        <p>
          <span className="font-semibold">Sources:</span> ACTUAL OUTPUT and
          ACTUAL OUTPUT avg. TAT come from the Completed Task table (TAT =
          completion date − creation date, in days). INPUT comes from the Task
          table (not-completed tasks) filtered by the selected date range.
        </p>
        <p>
          <span className="font-semibold">Inventory:</span> INVENTORY, AVERAGE
          BACKLOG, MAX AGE, PENDING, IN PROGRESS, PAUSED and ON HOLD are based on
          the currently available inventory (not-completed tasks) in the Task
          table and are therefore not affected by the selected date range. The
          INVENTORY total matches the CMT BREAKDOWN table.
        </p>
      </div>
    </div>
  )
}

export default KpiSummaryTable