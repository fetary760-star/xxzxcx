'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowUpDown, Download, Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatNumber, formatPercent, exportToExcel } from '@/utils/excelExport'

/* =============================================================================
 *  PER-ENGINEER PERFORMANCE FORMULAS
 * =============================================================================
 *
 *  Every row represents ONE engineer, aggregated over the currently-filtered
 *  set of tasks (date range, priority). The values are produced by
 *  /api/performance on the backend and mirrored here for display.
 *
 *    totalAssigned   = count of tasks assigned to this engineer
 *                      (includes every status).
 *    completed       = count of those tasks whose status === 'Completed'.
 *    onTime          = count of completed tasks with actualDate = targetDate
 *                      (delayDays === 0).
 *    delayed         = count of completed tasks with actualDate > targetDate
 *                      (delayDays  >  0). Early-delivered tasks are NOT
 *                      counted as delayed.
 *
 *    avgDelayDays    = "Avg Completion" on the Engineer Workload breakdown
 *                    = sum(delayDays across this engineer's COMPLETED tasks)
 *                      / completed
 *                      (signed mean; early tasks contribute negative values.
 *                       A value close to 0 means the engineer finishes near
 *                       the target date on average; a negative value means
 *                       the engineer finishes early on average.)
 *
 *    onTimeRate      = (onTime   / completed) * 100
 *                      (undefined / 0 when completed === 0, displayed as 0%).
 *    completionRate  = (completed / totalAssigned) * 100
 *                      (undefined / 0 when totalAssigned === 0, displayed as 0%).
 *
 *    rating          = qualitative bucket derived from onTimeRate &
 *                      completionRate (see `computeRating`):
 *                        Excellent : onTimeRate ≥ 90 AND completionRate ≥ 80
 *                        Good      : onTimeRate ≥ 75
 *                        Average   : onTimeRate ≥ 50
 *                        Poor      : otherwise
 * =============================================================================
 */

export interface EngineerRow {
  engineerName: string
  /** All tasks assigned to this engineer, any status. */
  totalAssigned: number
  /** Subset of totalAssigned with status = "Completed". */
  completed: number
  /** Completed tasks with delay = 0 days (actualDate = targetDate). */
  onTime: number
  /** Completed tasks with delay > 0 days (actualDate > targetDate). */
  delayed: number
  /** Signed mean of delay days over completed tasks — shown as "Avg Completion". */
  avgDelayDays: number
  /** (onTime / completed) × 100 */
  onTimeRate: number
  /** (completed / totalAssigned) × 100 */
  completionRate: number
  rating: string
}

interface Props {
  rows: EngineerRow[]
  loading?: boolean
}

type SortKey = keyof EngineerRow

/**
 * Compute a simple performance rating from on-time rate and completion rate.
 *
 *   Excellent : onTimeRate ≥ 90 AND completionRate ≥ 80
 *   Good      : onTimeRate ≥ 75
 *   Average   : onTimeRate ≥ 50
 *   Poor      : otherwise
 *
 * Both inputs are percentages (0–100), NOT fractions.
 */
export function computeRating(onTimeRate: number, completionRate: number): string {
  if (onTimeRate >= 90 && completionRate >= 80) return 'Excellent'
  if (onTimeRate >= 75) return 'Good'
  if (onTimeRate >= 50) return 'Average'
  return 'Poor'
}

const RATING_COLOR: Record<string, string> = {
  Excellent: 'bg-green-100 text-green-800',
  Good: 'bg-blue-100 text-blue-800',
  Average: 'bg-yellow-100 text-yellow-800',
  Poor: 'bg-red-100 text-red-800',
}

/** Short formula text for each column header's info tooltip. */
const COLUMN_FORMULAS: Partial<Record<SortKey, string>> = {
  totalAssigned:
    'All tasks assigned to this engineer within the active filters, regardless of status.',
  completed: 'Tasks where status = "Completed".',
  onTime:
    'Completed tasks with delay = 0 days (actualDate = targetDate). Early-delivered tasks are NOT counted here.',
  delayed:
    'Completed tasks with delay > 0 days (actualDate > targetDate). Early-delivered tasks are NOT counted as delayed.',
  avgDelayDays:
    'Avg Completion = signed average of (actualDate − targetDate) in days across this engineer\'s completed tasks. Negative means finishing early on average.',
  onTimeRate: 'On-Time % = (On Time / Completed) × 100.',
  completionRate: 'Completion % = (Completed / Total Assigned) × 100.',
  rating:
    'Rating bands: Excellent (On-Time ≥ 90% AND Completion ≥ 80%), Good (On-Time ≥ 75%), Average (On-Time ≥ 50%), Poor otherwise.',
}

/**
 * Sortable, exportable per-engineer performance table.
 *
 * Columns: engineer, total assigned, completed, on-time, delayed,
 * avg delay days (a.k.a. "Avg Completion"), on-time rate %,
 * completion rate %, rating.
 *
 * Each column header includes an info icon showing the underlying formula.
 */
export default function EngineerPerformanceTable({
  rows,
  loading,
}: Props): JSX.Element {
  const [sortKey, setSortKey] = useState<SortKey>('onTimeRate')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const as = String(av ?? '')
      const bs = String(bv ?? '')
      return sortDir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as)
    })
    return copy
  }, [rows, sortKey, sortDir])

  const handleSort = (key: SortKey): void => {
    if (key === sortKey) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const handleExport = (): void => {
    // The exported columns mirror the on-screen columns 1:1 so that the
    // exported file values match what the user sees in the dashboard.
    const data = sorted.map((r) => ({
      Engineer: r.engineerName,
      'Total Assigned': r.totalAssigned,
      Completed: r.completed,
      'On Time': r.onTime,
      Delayed: r.delayed,
      'Avg Delay (days)': formatNumber(r.avgDelayDays, 2),
      'On-Time Rate': formatPercent(r.onTimeRate),
      'Completion Rate': formatPercent(r.completionRate),
      Rating: r.rating,
    }))
    exportToExcel(data, `engineer_performance_${Date.now()}`, 'Engineer Performance')
  }

  const header = (
    label: string,
    key: SortKey,
    align: 'left' | 'right' = 'left'
  ) => {
    const formula = COLUMN_FORMULAS[key]
    return (
      <th
        className={`cursor-pointer select-none px-3 py-2 text-xs font-semibold text-gray-600 ${
          align === 'right' ? 'text-right' : 'text-left'
        }`}
        onClick={() => handleSort(key)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <ArrowUpDown className="h-3 w-3 opacity-50" />
          {formula ? (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={`How ${label} is calculated`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-400 hover:text-gray-600"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-xs">
                  {formula}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : null}
        </span>
      </th>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Per-Engineer Performance</CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={rows.length === 0}
        >
          <Download className="mr-1 h-4 w-4" />
          Export
        </Button>
      </CardHeader>
      <CardContent>
        {/* Plain-language summary so the calculations are visible even without
            hovering the individual column tooltips. */}
        <div className="mb-3 rounded-md border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900">
          <p className="mb-1 font-semibold">How these numbers are calculated</p>
          <ul className="list-inside list-disc space-y-0.5">
            <li>
              <b>Assigned</b> = all tasks assigned to the engineer (any status).
              <b> Completed</b> = tasks with status = "Completed".
            </li>
            <li>
              <b>On Time</b> counts completed tasks where delay = 0 days.{' '}
              <b>Delayed</b> counts completed tasks where actualDate &gt;
              targetDate. Early-delivered tasks are <i>not</i> counted as
              delayed.
            </li>
            <li>
              <b>Avg Delay (a.k.a. Avg Completion)</b> = average of (actualDate
              − targetDate) across the engineer's completed tasks. Negative
              values mean finishing early on average.
            </li>
            <li>
              <b>On-Time %</b> = On Time ÷ Completed × 100.{' '}
              <b>Completion %</b> = Completed ÷ Assigned × 100.
            </li>
          </ul>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            No engineer performance data available.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  {header('Engineer', 'engineerName')}
                  {header('Assigned', 'totalAssigned', 'right')}
                  {header('Completed', 'completed', 'right')}
                  {header('On Time', 'onTime', 'right')}
                  {header('Delayed', 'delayed', 'right')}
                  {header('Avg Delay (d)', 'avgDelayDays', 'right')}
                  {header('On-Time %', 'onTimeRate', 'right')}
                  {header('Completion %', 'completionRate', 'right')}
                  {header('Rating', 'rating', 'right')}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr
                    key={r.engineerName}
                    className="border-b hover:bg-gray-50"
                  >
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {r.engineerName}
                    </td>
                    <td className="px-3 py-2 text-right">{r.totalAssigned}</td>
                    <td className="px-3 py-2 text-right text-green-700">
                      {r.completed}
                    </td>
                    <td className="px-3 py-2 text-right">{r.onTime}</td>
                    <td className="px-3 py-2 text-right text-red-700">
                      {r.delayed}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(r.avgDelayDays, 1)}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatPercent(r.onTimeRate)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatPercent(r.completionRate)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                          RATING_COLOR[r.rating] ?? 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {r.rating}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}