'use client'

import React from 'react'
import {
  resolveColumnKey,
  type CategoryColumn,
  type MonthlyMatrix,
  type NormalizedTask,
} from '@/lib/kpi-report-utils'

/* ===========================================================================
 * CMT BREAKDOWN / CMT COUNT — "Count by Months" of the active inventory
 * ---------------------------------------------------------------------------
 * Source: the Task table only (not-completed tasks), bucketed by the task
 * creation month and broken down by category.
 *
 * The rows are filtered with `isActiveInventoryTask`, the SAME predicate that
 * feeds the INVENTORY row of the CMT STATUS table, which guarantees:
 *
 *     BREAKDOWN grand total  ===  sum of the CMT STATUS INVENTORY row
 *
 * This table is deliberately NOT filtered by the Date Range Filter: it always
 * reflects all currently available active tasks.
 *
 * ---------------------------------------------------------------------------
 * COLOUR CODING (updated)
 * ---------------------------------------------------------------------------
 *   GREEN   the 3 most recent months  (current month + the 2 before it)
 *   YELLOW  the 3 months before those (months 4, 5 and 6 back)
 *   RED     every earlier month
 *   BLUE    future months (target/creation dates ahead of today), if any
 *
 * The banding is computed locally by `getMonthTone` in this file, so it no
 * longer depends on the 1-month/1-month logic of `kpi-report-utils`.
 * ======================================================================== */

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]

/* ===========================================================================
 * Month banding
 * ======================================================================== */

/** How many of the most recent months are GREEN. */
export const GREEN_MONTHS = 3
/** How many months right after the green band are YELLOW. */
export const YELLOW_MONTHS = 3

export type MonthBandTone = 'recent' | 'previous' | 'older' | 'future'

function monthIndexOf(year: number, month: number): number {
  return year * 12 + month
}

/**
 * Classifies a month relative to the reference date (defaults to today).
 *
 *   monthsAgo  0 | 1 | 2        -> 'recent'   (green)
 *   monthsAgo  3 | 4 | 5        -> 'previous' (yellow)
 *   monthsAgo  >= 6             -> 'older'    (red)
 *   monthsAgo  < 0              -> 'future'   (blue)
 */
export function getMonthTone(
  year: number,
  month: number,
  reference: Date = new Date(),
): MonthBandTone {
  const current = monthIndexOf(reference.getFullYear(), reference.getMonth())
  const monthsAgo = current - monthIndexOf(year, month)

  if (monthsAgo < 0) return 'future'
  if (monthsAgo < GREEN_MONTHS) return 'recent'
  if (monthsAgo < GREEN_MONTHS + YELLOW_MONTHS) return 'previous'
  return 'older'
}

/** Tailwind classes for the month body cells. */
export const MONTH_TONE_CELL_CLASS: Record<MonthBandTone, string> = {
  recent: 'bg-green-500 text-white',
  previous: 'bg-yellow-300 text-gray-900',
  older: 'bg-red-200 text-gray-900',
  future: 'bg-blue-50 text-gray-900',
}

/** Tailwind classes for the month header cells. */
export const MONTH_TONE_HEADER_CLASS: Record<MonthBandTone, string> = {
  recent: 'bg-green-600 text-white',
  previous: 'bg-yellow-400 text-gray-900',
  older: 'bg-red-300 text-gray-900',
  future: 'bg-blue-100 text-gray-900',
}

const TONE_TITLE: Record<MonthBandTone, string> = {
  recent: `One of the last ${GREEN_MONTHS} months`,
  previous: `One of the ${YELLOW_MONTHS} months before the last ${GREEN_MONTHS}`,
  older: 'Earlier month',
  future: 'Future month',
}

/* ===========================================================================
 * Active inventory predicate (local copy, identical to CMT STATUS)
 * ======================================================================== */

const DISCARDED_STATUSES = new Set(['Rejected', 'Cancelled'])

export function isActiveInventoryTask(task: NormalizedTask): boolean {
  if (task.isCompleted) return false
  if (task.status === 'Completed') return false
  return !DISCARDED_STATUSES.has(task.status)
}

/* ===========================================================================
 * Matrix building
 * ======================================================================== */

export interface BreakdownMonthColumn {
  /** Sortable key, e.g. "2026-01". */
  key: string
  year: number
  /** 0-based month index. */
  month: number
  label: string
  tone: MonthBandTone
}

export interface OpenMonthlyRow {
  key: string
  categoryName: string
  counts: number[]
  total: number
}

export interface OpenMonthlyMatrix {
  months: BreakdownMonthColumn[]
  rows: OpenMonthlyRow[]
}

export function buildOpenMonthlyMatrix(
  tasks: NormalizedTask[],
  columns: CategoryColumn[],
  reference: Date = new Date(),
): OpenMonthlyMatrix {
  const rowIndexByKey = new Map<string, number>()
  columns.forEach((column, index) => rowIndexByKey.set(column.key, index))

  const buckets = new Map<string, number[]>()
  const monthMeta = new Map<string, { year: number; month: number }>()

  for (const task of tasks) {
    // Single source of truth shared with the CMT STATUS INVENTORY row.
    if (!isActiveInventoryTask(task)) continue

    const date = task.createdAt
    if (!date || Number.isNaN(date.getTime())) continue

    const rowIndex = rowIndexByKey.get(resolveColumnKey(task, columns))
    if (rowIndex === undefined) continue

    const year = date.getFullYear()
    const month = date.getMonth()
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`

    if (!buckets.has(monthKey)) {
      buckets.set(monthKey, new Array<number>(columns.length).fill(0))
      monthMeta.set(monthKey, { year, month })
    }
    buckets.get(monthKey)![rowIndex] += 1
  }

  const sortedKeys = Array.from(buckets.keys()).sort()
  const years = new Set(sortedKeys.map(key => Number(key.slice(0, 4))))
  const multiYear = years.size > 1
  const useShortLabels = multiYear || sortedKeys.length > 5

  const months: BreakdownMonthColumn[] = sortedKeys.map(key => {
    const meta = monthMeta.get(key)!
    const shortYear = String(meta.year).slice(-2)
    const shortName = MONTH_NAMES[meta.month].slice(0, 3)
    return {
      key,
      year: meta.year,
      month: meta.month,
      label: multiYear
        ? `${shortName} '${shortYear}`
        : useShortLabels
          ? shortName
          : MONTH_NAMES[meta.month],
      tone: getMonthTone(meta.year, meta.month, reference),
    }
  })

  const rows: OpenMonthlyRow[] = columns.map((column, rowIndex) => {
    const counts = months.map(month => buckets.get(month.key)![rowIndex])
    return {
      key: column.key,
      categoryName: column.categoryName,
      counts,
      total: counts.reduce((sum, n) => sum + n, 0),
    }
  })

  return { months, rows }
}

/** Re-tones a precomputed (legacy) matrix with the new 3 / 3 / rest banding. */
function adaptLegacyMatrix(
  matrix: MonthlyMatrix,
  reference: Date = new Date(),
): OpenMonthlyMatrix {
  return {
    months: matrix.months.map(month => ({
      key: month.key,
      year: month.year,
      month: month.month,
      label: month.label,
      tone: getMonthTone(month.year, month.month, reference),
    })),
    rows: matrix.rows.map(row => ({
      key: row.key,
      categoryName: row.categoryName,
      counts: row.counts,
      total: row.total,
    })),
  }
}

/* ===========================================================================
 * Presentation helpers
 * ======================================================================== */

function densityClasses(columnCount: number): {
  text: string
  cell: string
} {
  if (columnCount > 12) {
    return { text: 'text-[9px] sm:text-[10px]', cell: 'px-0.5 py-1' }
  }
  if (columnCount > 8) {
    return { text: 'text-[10px] sm:text-[11px]', cell: 'px-1 py-1.5' }
  }
  return { text: 'text-[11px] sm:text-xs', cell: 'px-1.5 py-2' }
}

function labelColumnWidth(columnCount: number): string {
  if (columnCount > 12) return '20%'
  if (columnCount > 8) return '24%'
  return '28%'
}

export interface MonthlyCategoryTableProps {
  tasks?: NormalizedTask[]
  columns?: CategoryColumn[]
  matrix?: MonthlyMatrix
  title?: string
  rowHeaderLabel?: string
  loading?: boolean
  className?: string
}

export function MonthlyCategoryTable({
  tasks,
  columns,
  matrix,
  title = 'MONTHLY TASK COUNT BY CATEGORY',
  rowHeaderLabel = 'C.C',
  loading = false,
  className = '',
}: MonthlyCategoryTableProps) {
  const resolved = React.useMemo<OpenMonthlyMatrix>(() => {
    if (tasks && columns) return buildOpenMonthlyMatrix(tasks, columns)
    if (matrix) return adaptLegacyMatrix(matrix)
    return { months: [], rows: [] }
  }, [tasks, columns, matrix])

  const visibleRows = resolved.rows.filter(row => row.total > 0)
  const hasData = resolved.months.length > 0 && visibleRows.length > 0
  const hasFutureMonths = resolved.months.some(month => month.tone === 'future')

  const monthTotals = resolved.months.map((_, colIndex) =>
    visibleRows.reduce((sum, row) => sum + (row.counts[colIndex] ?? 0), 0),
  )
  const monthAverages = monthTotals.map(total =>
    visibleRows.length > 0 ? Number((total / visibleRows.length).toFixed(2)) : 0,
  )
  const grandTotal = monthTotals.reduce((sum, n) => sum + n, 0)
  const overallMonthlyAverage =
    resolved.months.length > 0
      ? Number((grandTotal / resolved.months.length).toFixed(2))
      : 0

  const dataColumnCount = resolved.months.length + 1
  const density = densityClasses(dataColumnCount)

  return (
    <div
      className={`w-full bg-white shadow overflow-hidden rounded-none sm:rounded ${className}`}
    >
      <div className="bg-lime-200 px-4 py-2 text-center font-bold text-teal-800 tracking-wide">
        {title}
        <span className="ml-2 font-normal text-[11px] text-teal-900/80">
          (Active inventory — all currently available tasks)
        </span>
      </div>

      {loading ? (
        <div className="p-6 text-sm text-gray-500">Loading monthly data...</div>
      ) : !hasData ? (
        <div className="p-6 text-sm text-gray-500">
          No not-completed tasks available.
        </div>
      ) : (
        <div className="w-full">
          <table
            className={`w-full table-fixed border-collapse ${density.text}`}
          >
            <colgroup>
              <col style={{ width: labelColumnWidth(dataColumnCount) }} />
              {resolved.months.map(month => (
                <col key={`col-${month.key}`} />
              ))}
              <col />
            </colgroup>

            <thead>
              <tr>
                <th
                  scope="col"
                  className={`border border-white/70 bg-cyan-100 text-center font-bold text-gray-900 ${density.cell}`}
                >
                  {rowHeaderLabel}
                </th>
                {resolved.months.map(month => (
                  <th
                    key={month.key}
                    scope="col"
                    className={`border border-gray-300 text-center font-bold whitespace-normal break-words leading-tight ${density.cell} ${MONTH_TONE_HEADER_CLASS[month.tone]}`}
                    title={`${MONTH_NAMES[month.month]} ${month.year} — ${TONE_TITLE[month.tone]}`}
                  >
                    {month.label}
                  </th>
                ))}
                <th
                  scope="col"
                  className={`border border-gray-300 bg-lime-300 text-center font-bold text-gray-900 ${density.cell}`}
                >
                  TOTAL
                </th>
              </tr>
            </thead>

            <tbody>
              {visibleRows.map(row => (
                <tr key={row.key}>
                  <th
                    scope="row"
                    className={`border border-white/70 bg-cyan-50 text-left font-semibold text-gray-900 whitespace-normal break-words leading-tight ${density.cell}`}
                    title={row.categoryName}
                  >
                    {row.categoryName}
                  </th>
                  {resolved.months.map((month, index) => {
                    const count = row.counts[index] ?? 0
                    return (
                      <td
                        key={`${row.key}-${month.key}`}
                        className={`border border-gray-300 text-center font-bold ${density.cell} ${MONTH_TONE_CELL_CLASS[month.tone]}`}
                      >
                        {count > 0 ? count : ''}
                      </td>
                    )
                  })}
                  <td
                    className={`border border-gray-300 bg-sky-50 text-center font-bold text-gray-900 ${density.cell}`}
                    title={`${row.categoryName} — current inventory: ${row.total}`}
                  >
                    {row.total > 0 ? row.total : ''}
                  </td>
                </tr>
              ))}
            </tbody>

            <tfoot>
              <tr>
                <th
                  scope="row"
                  className={`border border-white/70 bg-gray-200 text-left font-bold text-gray-900 ${density.cell}`}
                >
                  TOTAL
                </th>
                {monthTotals.map((total, index) => (
                  <td
                    key={`total-${resolved.months[index].key}`}
                    className={`border border-gray-300 bg-gray-100 text-center font-bold text-gray-900 ${density.cell}`}
                  >
                    {total}
                  </td>
                ))}
                <td
                  className={`border border-gray-300 bg-gray-200 text-center font-bold text-gray-900 ${density.cell}`}
                  title="Total active inventory — matches the INVENTORY row of the CMT STATUS table"
                >
                  {grandTotal}
                </td>
              </tr>
              <tr>
                <th
                  scope="row"
                  className={`border border-white/70 bg-gray-200 text-left font-bold text-gray-900 ${density.cell}`}
                >
                  AVERAGE
                </th>
                {monthAverages.map((average, index) => (
                  <td
                    key={`avg-${resolved.months[index].key}`}
                    className={`border border-gray-300 bg-gray-50 text-center font-semibold text-gray-800 ${density.cell}`}
                  >
                    {average.toFixed(2)}
                  </td>
                ))}
                <td
                  className={`border border-gray-300 bg-gray-200 text-center font-bold text-gray-900 ${density.cell}`}
                  title="Average number of not-completed tasks per month"
                >
                  {overallMonthlyAverage.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="space-y-1 border-t bg-gray-50 px-4 py-2 text-[11px] leading-relaxed text-gray-600">
        <p className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-green-500" /> Last{' '}
            {GREEN_MONTHS} months (current month included)
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-yellow-300" />{' '}
            Previous {YELLOW_MONTHS} months
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded bg-red-200" /> Earlier
            months
          </span>
          {hasFutureMonths ? (
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-blue-100" />{' '}
              Future months
            </span>
          ) : null}
        </p>
        <p>
          <span className="font-semibold">Source:</span> Task table
          (not-completed tasks) bucketed by task creation month. The grand total
          equals the INVENTORY row of the CMT STATUS table and is not affected by
          the Date Range Filter.
        </p>
      </div>
    </div>
  )
}

export default MonthlyCategoryTable