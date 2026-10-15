'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { ClipboardList, Loader2, RefreshCw } from 'lucide-react'
import CmtStatusReportSection from '@/components/reports/cmt-status-report-section'
import {
  buildCategoryColumns,
  extractRecords,
  normalizeTask,
  toDateInputValue,
  toRangeBoundary,
  withUncategorizedColumn,
  type CategoryColumn,
  type DateRange,
  type NormalizedTask,
} from '@/lib/kpi-report-utils'

/**
 * Eng Status Report page (route: /status-report)
 * ---------------------------------------------------------------------------
 * This page is the host of the sub-tabbed CMT report section. The sidebar item
 * "Eng Status Report" points at /status-report, and this page mounts
 * <CmtStatusReportSection /> which renders the segmented control:
 *
 *     [ CMT STATUS ]   -> CMT ENG STATUS REPORT (KPI summary)
 *     [ CMT BREAKDOWN ] -> MONTHLY TASK COUNT BY CATEGORY
 *
 * Only one table is visible at a time; clicking a segment swaps the table.
 *
 * Data sources (all pre-existing, RBAC scoped by the backend):
 *   GET /api/tasks                      -> active tasks
 *   GET /api/tasks/completed            -> completed tasks
 *   GET /api/reference-data/categories  -> category columns
 *   GET /api/reference-data/target-days -> target duration shown in headers
 *
 * The Date Range Filter below applies to the CMT STATUS (KPI) table only.
 * CMT BREAKDOWN always shows the current open-task inventory, by design.
 *
 * ---------------------------------------------------------------------------
 * FIX — OUTPUT TARGET showed 0
 * ---------------------------------------------------------------------------
 * The Target Completion Date of a task is "creation date + category target
 * duration", so for any recently created task it lands in the FUTURE. The old
 * default range ended TODAY, which silently excluded every one of those target
 * dates and rendered the whole row as zero even though real output existed.
 *
 *   - the default range is now 1 Jan -> 31 Dec of the current year, so future
 *     target dates of the current year are inside the window;
 *   - quick presets (This month / Last 3 months / This year / All time) make it
 *     obvious how to widen the window;
 *   - "All time" clears both boundaries and disables the filter entirely, which
 *     is the fastest way to confirm the underlying numbers.
 */

interface RangeState {
  start: string
  end: string
}

/** Default range: the whole current year (target dates can be in the future). */
function buildDefaultRange(): RangeState {
  const now = new Date()
  return {
    start: toDateInputValue(new Date(now.getFullYear(), 0, 1)),
    end: toDateInputValue(new Date(now.getFullYear(), 11, 31)),
  }
}

/** Quick range presets offered next to the date inputs. */
const RANGE_PRESETS: Array<{ key: string; label: string; build: () => RangeState }> = [
  {
    key: 'thisMonth',
    label: 'This Month',
    build: () => {
      const now = new Date()
      return {
        start: toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)),
        end: toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      }
    },
  },
  {
    key: 'last3Months',
    label: 'Last 3 Months',
    build: () => {
      const now = new Date()
      return {
        start: toDateInputValue(
          new Date(now.getFullYear(), now.getMonth() - 2, 1),
        ),
        end: toDateInputValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      }
    },
  },
  {
    key: 'thisYear',
    label: 'This Year',
    build: buildDefaultRange,
  },
  {
    key: 'allTime',
    label: 'All Time',
    build: () => ({ start: '', end: '' }),
  },
]

/** Human readable label for the KPI table header. */
function formatRangeLabel(start: string, end: string): string {
  if (!start && !end) return 'All time'
  if (start && !end) return `From ${start}`
  if (!start && end) return `Up to ${end}`
  return `${start} → ${end}`
}

export default function EngStatusReportPage(): JSX.Element {
  const { user, isLoading: authLoading } = useAuth()

  const defaults = useMemo(buildDefaultRange, [])
  const [startDate, setStartDate] = useState<string>(defaults.start)
  const [endDate, setEndDate] = useState<string>(defaults.end)

  const [tasks, setTasks] = useState<NormalizedTask[]>([])
  const [columns, setColumns] = useState<CategoryColumn[]>([])
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState<number>(0)

  /** Fetch tasks + reference data and normalise everything for the tables. */
  const fetchAll = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    const get = async (url: string): Promise<any> => {
      const res = await fetch(url, { credentials: 'same-origin' })
      if (!res.ok) return null
      return res.json().catch(() => null)
    }

    try {
      const [activeJson, completedJson, categoriesJson, targetDaysJson] =
        await Promise.all([
          get('/api/tasks'),
          get('/api/tasks/completed'),
          get('/api/reference-data/categories'),
          get('/api/reference-data/target-days'),
        ])

      const activeTasks = extractRecords(activeJson).map((row) =>
        normalizeTask(row, false)
      )
      const completedTasks = extractRecords(completedJson).map((row) =>
        normalizeTask(row, true)
      )
      const allTasks = [...activeTasks, ...completedTasks]

      const baseColumns = buildCategoryColumns(
        extractRecords(categoriesJson),
        extractRecords(targetDaysJson)
      )

      setTasks(allTasks)
      setColumns(withUncategorizedColumn(baseColumns, allTasks))

      if (allTasks.length === 0) {
        setError('No task data returned for your scope.')
      }
    } catch (e: any) {
      console.error('[EngStatusReport] fetch failed:', e)
      setError(e?.message || 'Failed to load status report data')
    } finally {
      setLoading(false)
    }
  }, [refreshTick])

  useEffect(() => {
    if (!user) return
    void fetchAll()
  }, [user, fetchAll])

  const range: DateRange = useMemo(
    () => ({
      start: toRangeBoundary(startDate, 'start'),
      end: toRangeBoundary(endDate, 'end'),
    }),
    [startDate, endDate]
  )

  const dateRangeLabel = useMemo(
    () => formatRangeLabel(startDate, endDate),
    [startDate, endDate]
  )

  const applyPreset = (build: () => RangeState): void => {
    const next = build()
    setStartDate(next.start)
    setEndDate(next.end)
  }

  const handleResetRange = (): void => {
    setStartDate(defaults.start)
    setEndDate(defaults.end)
  }

  if (authLoading) {
    return (
      <MainLayout>
        <div className="flex min-h-[400px] items-center justify-center">
          <Loader2 className="mr-2 h-6 w-6 animate-spin" />
          Loading...
        </div>
      </MainLayout>
    )
  }

  if (!user) {
    return (
      <MainLayout>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <h2 className="mb-2 text-xl font-semibold text-red-600">
              Access Denied
            </h2>
            <p className="text-gray-600">
              Please log in to access the Eng Status Report.
            </p>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="w-full space-y-4">
        {/* ---- header ---------------------------------------------------- */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Eng Status Report</h1>
            <p className="text-sm text-gray-600">
              Switch between the CMT Status KPI table and the CMT Breakdown
              monthly table.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRefreshTick((t) => t + 1)}
              disabled={loading}
            >
              <RefreshCw
                className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`}
              />
              Refresh
            </Button>
            <ClipboardList className="h-8 w-8 text-gray-300" />
          </div>
        </div>

        {/* ---- date range filter (applies to CMT STATUS only) ------------ */}
        <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="status-report-start">Start Date</Label>
              <input
                id="status-report-start"
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="status-report-end">End Date</Label>
              <input
                id="status-report-end"
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <Button variant="outline" size="sm" onClick={handleResetRange}>
              Reset Range
            </Button>

            <p className="ml-auto max-w-md text-xs text-gray-500">
              The Date Range Filter applies to the output and flow metrics of{' '}
              <b className="text-teal-700">CMT STATUS</b> (Output Target, Actual
              Output, Actual Output avg. TAT, Input). Inventory metrics
              (Inventory, Average Backlog, Max Age, Pending, In Progress,
              Paused, On Hold) and the whole{' '}
              <b className="text-teal-700">CMT BREAKDOWN</b> table always show
              all currently available active tasks.
            </p>
          </div>

          {/* ---- quick presets ------------------------------------------- */}
          <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2">
            <span className="text-xs font-semibold text-gray-500">
              Quick range:
            </span>
            {RANGE_PRESETS.map((preset) => (
              <Button
                key={preset.key}
                variant="outline"
                size="sm"
                onClick={() => applyPreset(preset.build)}
              >
                {preset.label}
              </Button>
            ))}
            <span className="text-[11px] text-gray-500">
              Output Target uses the Target Completion Date (creation date +
              category target duration), which is often in the future — widen
              the range if the row looks empty.
            </span>
          </div>
        </div>

        {error && (
          <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {error}
          </div>
        )}

        {/* ---- the sub-tabbed section (CMT STATUS / CMT BREAKDOWN) ------- */}
        <CmtStatusReportSection
          tasks={tasks}
          columns={columns}
          range={range}
          dateRangeLabel={dateRangeLabel}
          loadingKpi={loading}
          loadingMonthly={loading}
          showTargetDiagnostics
          defaultTab="kpi"
          className="w-full"
        />
      </div>
    </MainLayout>
  )
}