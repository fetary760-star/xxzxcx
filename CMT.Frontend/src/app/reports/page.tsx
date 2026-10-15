'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2,
  Download,
  BarChart3,
  RefreshCw,
  FileSpreadsheet,
} from 'lucide-react'
import ReportFilters, {
  FilterState,
} from '@/components/reports/ReportFilters'
import TaskMetricsCards, {
  TaskMetrics,
} from '@/components/reports/TaskMetricsCards'
import EngineerPerformanceTable, {
  EngineerRow,
  computeRating,
} from '@/components/reports/EngineerPerformanceTable'
import DelayAnalysis, {
  DelaySummary,
} from '@/components/reports/DelayAnalysis'
import {
  exportMultiSheetExcel,
  formatNumber,
  formatPercent,
} from '@/utils/excelExport'

/**
 * Reports Dashboard
 *
 * A comprehensive reporting page providing:
 *  - Overview KPIs (completion rate, on-time %, avg delay, blocked/pending counts)
 *  - Per-engineer performance breakdown with rating
 *  - Delay analysis with delivery breakdown pie and top delayed tasks
 *  - Advanced filtering (date range, engineer, priority, status)
 *  - Multi-sheet Excel export of all visible report data
 *
 * All data is fetched from the real backend API routes:
 *  - /api/performance                     — per-engineer performance summary
 *  - /api/analytics/completion-rate       — completion rate + status breakdown
 *  - /api/analytics/avg-delay             — delay breakdown + delay-by-task
 *  - /api/engineers                       — engineer list for filter
 *
 * ===========================================================================
 *  FORMULAS USED ON THIS PAGE
 * ===========================================================================
 *  All metrics are computed server-side and simply mapped into the UI here.
 *  The definitions below are the same ones enforced by the backend; they
 *  match the tooltips rendered in the KPI cards, the engineer table and the
 *  delay analysis panel.
 *
 *  Per-task primitive:
 *    delayDays = (actualDate − targetDate) rounded to whole days.
 *      delayDays = 0  → On Time
 *      delayDays < 0  → Early  (|delayDays| days ahead of target)
 *      delayDays > 0  → Late   (delayDays days after target)
 *
 *  Overview KPIs (TaskMetricsCards)
 *    Completion          = count of tasks with status = "Completed"
 *    Completion Rate     = Completion / Total Tasks × 100
 *    On-Time Rate        = onTime / (onTime + early + late) × 100
 *    Overall Avg Delay   = mean(delayDays) over ALL analyzed completed tasks
 *                          (signed — early tasks subtract from the mean)
 *
 *  Delay Analysis (DelayAnalysis)
 *    On-Time %           = onTime / totalAnalyzed × 100
 *    Early %             = early  / totalAnalyzed × 100
 *    Late %              = late   / totalAnalyzed × 100
 *    Avg Late            = mean(delayDays) over LATE tasks only            (≥0)
 *    Avg Early Delivery  = mean(|delayDays|) over EARLY tasks only         (≥0)
 *
 *  Per-engineer row (EngineerPerformanceTable; a.k.a. Engineer Workload
 *  Performance Metrics)
 *    Total Assigned      = all tasks assigned to the engineer (any status)
 *    Completed           = subset with status = "Completed"
 *    On Time             = completed tasks with delayDays = 0
 *    Delayed             = completed tasks with delayDays > 0
 *                          (early-delivered tasks are NOT counted as delayed)
 *    Avg Completion      = mean(delayDays) over the engineer's completed
 *                          tasks (signed; < 0 means early on average)
 *    On-Time %           = On Time / Completed × 100
 *    Completion %        = Completed / Total Assigned × 100
 *    Rating              = Excellent if On-Time ≥ 90% AND Completion ≥ 80%,
 *                          Good if On-Time ≥ 75%, Average if ≥ 50%, else Poor
 *
 *  Filters applied BEFORE every calculation above:
 *    date range, engineer, priority, status — see ReportFilters.tsx.
 * ===========================================================================
 */

const DEFAULT_FILTERS: FilterState = {
  dateRange: 'last_30_days',
  startDate: '',
  endDate: '',
  engineer: 'all',
  priority: 'all',
  status: 'all',
}

/**
 * Compute start/end ISO dates for a given dateRange preset.
 */
function resolveDateRange(
  range: string,
  customStart: string,
  customEnd: string
): { from: string | null; to: string | null } {
  const now = new Date()
  const pad = (d: Date): string => d.toISOString().slice(0, 10)
  const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())

  if (range === 'custom') {
    return { from: customStart || null, to: customEnd || null }
  }
  if (range === 'all') {
    return { from: null, to: null }
  }
  const today = startOfDay(now)
  switch (range) {
    case 'last_7_days': {
      const f = new Date(today)
      f.setDate(f.getDate() - 7)
      return { from: pad(f), to: pad(today) }
    }
    case 'last_30_days': {
      const f = new Date(today)
      f.setDate(f.getDate() - 30)
      return { from: pad(f), to: pad(today) }
    }
    case 'this_month': {
      const f = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from: pad(f), to: pad(today) }
    }
    case 'last_month': {
      const f = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const t = new Date(today.getFullYear(), today.getMonth(), 0)
      return { from: pad(f), to: pad(t) }
    }
    case 'this_year': {
      const f = new Date(today.getFullYear(), 0, 1)
      return { from: pad(f), to: pad(today) }
    }
    default:
      return { from: null, to: null }
  }
}

/**
 * Append non-null query params to a base URL.
 */
function buildUrl(base: string, params: Record<string, string | null>): string {
  const qs = Object.entries(params)
    .filter(([, v]) => v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v as string)}`)
    .join('&')
  return qs ? `${base}?${qs}` : base
}

export default function ReportsPage(): JSX.Element {
  const { user, isLoading: authLoading } = useAuth()

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const [metrics, setMetrics] = useState<TaskMetrics | null>(null)
  const [engineerRows, setEngineerRows] = useState<EngineerRow[]>([])
  const [delaySummary, setDelaySummary] = useState<DelaySummary | null>(null)
  const [engineerList, setEngineerList] = useState<string[]>([])

  /**
   * Fetch engineer list once on mount for the filter dropdown.
   */
  useEffect(() => {
    let mounted = true
    const run = async (): Promise<void> => {
      try {
        const res = await fetch('/api/engineers', {
          credentials: 'same-origin',
        })
        if (!res.ok) return
        const data = await res.json().catch(() => [])
        if (!mounted) return
        const list = (Array.isArray(data) ? data : [])
          .map((e: any) =>
            String(
              e.fullName ?? e.full_name ?? e.name ?? e.engineerName ?? ''
            ).trim()
          )
          .filter(Boolean)
        setEngineerList(Array.from(new Set(list)).sort())
      } catch {
        // non-fatal
      }
    }
    void run()
    return () => {
      mounted = false
    }
  }, [])

  /**
   * Fetch all dashboard data whenever filters or refreshTick change.
   */
  const fetchAll = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)

    const { from, to } = resolveDateRange(
      filters.dateRange,
      filters.startDate,
      filters.endDate
    )

    const dateParams = {
      from,
      to,
      startDate: from,
      endDate: to,
    }

    try {
      const [perfRes, completionRes, delayRes] = await Promise.all([
        fetch(
          buildUrl('/api/performance', {
            ...dateParams,
            engineer: filters.engineer !== 'all' ? filters.engineer : null,
            priority: filters.priority !== 'all' ? filters.priority : null,
          }),
          { credentials: 'same-origin' }
        ),
        fetch(
          buildUrl('/api/analytics/completion-rate', dateParams),
          { credentials: 'same-origin' }
        ),
        fetch(buildUrl('/api/analytics/avg-delay', dateParams), {
          credentials: 'same-origin',
        }),
      ])

      const perfJson = perfRes.ok ? await perfRes.json().catch(() => null) : null
      const completionJson = completionRes.ok
        ? await completionRes.json().catch(() => null)
        : null
      const delayJson = delayRes.ok
        ? await delayRes.json().catch(() => null)
        : null

      // ---------- Engineer Rows ----------
      const rawRows: any[] = Array.isArray(perfJson?.summary_table_data)
        ? perfJson.summary_table_data
        : Array.isArray(perfJson)
          ? perfJson
          : []

      let rows: EngineerRow[] = rawRows.map((r: any) => {
        const name = String(
          r.engineer_name ?? r.engineerName ?? r.name ?? 'Unknown'
        )
        const total = Number(
          r.total_assigned_tasks ?? r.totalAssignedTasks ?? r.total_tasks ?? 0
        )
        const completed = Number(
          r.completed_tasks_count ?? r.completedTasksCount ?? r.completed_tasks ?? 0
        )
        const onTime = Number(
          r.on_time_completed_count ?? r.onTimeCompletedCount ?? r.on_time_tasks ?? 0
        )
        const delayed = Number(
          r.delayed_completed_count ??
            r.delayedCompletedCount ??
            r.delayed_tasks ??
            Math.max(0, completed - onTime)
        )
        const avgDelay = Number(
          r.avg_delay_days ?? r.avgDelayDays ?? r.total_delay_days / (delayed || 1) ?? 0
        )
        const onTimeRate = completed > 0 ? (onTime / completed) * 100 : 0
        const completionRate = total > 0 ? (completed / total) * 100 : 0
        return {
          engineerName: name,
          totalAssigned: total,
          completed,
          onTime,
          delayed,
          avgDelayDays: Number.isFinite(avgDelay) ? avgDelay : 0,
          onTimeRate,
          completionRate,
          rating: computeRating(onTimeRate, completionRate),
        }
      })

      // Apply engineer filter client-side as a safety net
      if (filters.engineer !== 'all') {
        rows = rows.filter((r) =>
          r.engineerName.toLowerCase().includes(filters.engineer.toLowerCase())
        )
      }
      setEngineerRows(rows)

      // ---------- Delay summary ----------
      let delay: DelaySummary | null = null
      if (delayJson && typeof delayJson === 'object') {
        delay = {
          avgDelayDays: Number(delayJson.avgDelayDays ?? 0),
          avgLateDelay: Number(delayJson.avgLateDelay ?? 0),
          avgEarlyDelivery: Number(delayJson.avgEarlyDelivery ?? 0),
          totalAnalyzed: Number(delayJson.totalAnalyzed ?? 0),
          onTime: Number(delayJson.onTime ?? 0),
          early: Number(delayJson.early ?? 0),
          late: Number(delayJson.late ?? 0),
          onTimePercentage: delayJson.onTimePercentage ?? '0',
          earlyPercentage: delayJson.earlyPercentage ?? '0',
          latePercentage: delayJson.latePercentage ?? '0',
          delayBreakdown: Array.isArray(delayJson.delayBreakdown)
            ? delayJson.delayBreakdown
            : [],
        }

        // Apply client-side filters to delayBreakdown
        if (filters.engineer !== 'all') {
          delay.delayBreakdown = delay.delayBreakdown.filter((d) =>
            (d.engineer || '')
              .toLowerCase()
              .includes(filters.engineer.toLowerCase())
          )
        }
        if (filters.priority !== 'all') {
          delay.delayBreakdown = delay.delayBreakdown.filter(
            (d) => d.priority === filters.priority
          )
        }
      }
      setDelaySummary(delay)

      // ---------- Aggregated KPIs ----------
      const completionRate =
        completionJson?.completionRate ??
        completionJson?.completion_rate ??
        (typeof completionJson?.completionPercentage === 'string'
          ? parseFloat(completionJson.completionPercentage)
          : completionJson?.completionPercentage) ??
        0

      const statusBreakdown: Record<string, number> =
        completionJson?.statusBreakdown ??
        completionJson?.status_breakdown ??
        {}

      const totalTasks = Number(
        completionJson?.totalTasks ??
          completionJson?.total_tasks ??
          Object.values(statusBreakdown).reduce(
            (a: number, b: any) => a + Number(b || 0),
            0
          ) ??
          0
      )
      const completedTasks = Number(
        completionJson?.completedTasks ??
          completionJson?.completed_tasks ??
          statusBreakdown['Completed'] ??
          0
      )

      const m: TaskMetrics = {
        totalTasks,
        completedTasks,
        pendingTasks: Number(statusBreakdown['Pending'] ?? 0),
        inProgressTasks: Number(statusBreakdown['In Progress'] ?? 0),
        blockedTasks: Number(statusBreakdown['Blocked'] ?? 0),
        completionRate,
        onTimePercentage: delay?.onTimePercentage ?? 0,
        avgDelayDays: delay?.avgDelayDays ?? 0,
        late: delay?.late ?? 0,
        onTime: delay?.onTime ?? 0,
        early: delay?.early ?? 0,
        engineerCount: rows.length,
      }
      setMetrics(m)
    } catch (e: any) {
      console.error('[ReportsDashboard] fetch failed:', e)
      setError(e?.message || 'Failed to load report data')
    } finally {
      setLoading(false)
    }
    // refreshTick is intentionally referenced to force re-run on manual refresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, refreshTick])

  useEffect(() => {
    if (!user) return
    void fetchAll()
  }, [user, fetchAll])

  /**
   * Export all visible report data to a single multi-sheet Excel workbook.
   */
  const handleExportAll = useCallback((): void => {
    const sheets = []

    if (metrics) {
      sheets.push({
        name: 'Overview',
        rows: [
          { Metric: 'Total Tasks', Value: metrics.totalTasks },
          { Metric: 'Completed Tasks', Value: metrics.completedTasks },
          { Metric: 'Pending', Value: metrics.pendingTasks },
          { Metric: 'In Progress', Value: metrics.inProgressTasks },
          { Metric: 'Blocked', Value: metrics.blockedTasks },
          { Metric: 'Completion Rate', Value: formatPercent(metrics.completionRate) },
          { Metric: 'On-Time Rate', Value: formatPercent(metrics.onTimePercentage) },
          { Metric: 'Avg Delay (days)', Value: formatNumber(metrics.avgDelayDays, 2) },
          { Metric: 'On-Time Tasks', Value: metrics.onTime },
          { Metric: 'Early Tasks', Value: metrics.early },
          { Metric: 'Late Tasks', Value: metrics.late },
          { Metric: 'Engineer Count', Value: metrics.engineerCount },
        ],
        columns: ['Metric', 'Value'],
      })
    }

    if (engineerRows.length > 0) {
      sheets.push({
        name: 'Engineer Performance',
        rows: engineerRows.map((r) => ({
          Engineer: r.engineerName,
          'Total Assigned': r.totalAssigned,
          Completed: r.completed,
          'On Time': r.onTime,
          Delayed: r.delayed,
          'Avg Delay (days)': Number(formatNumber(r.avgDelayDays, 2)),
          'On-Time Rate': formatPercent(r.onTimeRate),
          'Completion Rate': formatPercent(r.completionRate),
          Rating: r.rating,
        })),
      })
    }

    if (delaySummary && delaySummary.delayBreakdown.length > 0) {
      sheets.push({
        name: 'Delay Breakdown',
        rows: delaySummary.delayBreakdown.map((d) => ({
          'Task ID': d.taskId,
          'Serial Number': d.serialNumber ?? '',
          'Part Number': d.partNumber ?? '',
          Description: d.description ?? '',
          Engineer: d.engineer,
          Priority: d.priority,
          Status: d.status,
          'Target Date': d.targetDate,
          'Actual Date': d.actualDate,
          'Delay Days': d.delayDays,
        })),
      })
    }

    if (sheets.length === 0) {
      setError('No data to export.')
      return
    }

    exportMultiSheetExcel(sheets, `reports_dashboard_${Date.now()}`)
  }, [metrics, engineerRows, delaySummary])

  const handleFilterChange = (patch: Partial<FilterState>): void => {
    setFilters((prev) => ({ ...prev, ...patch }))
  }

  const handleReset = (): void => {
    setFilters(DEFAULT_FILTERS)
  }

  const loadedMetrics: TaskMetrics = useMemo(
    () =>
      metrics ?? {
        totalTasks: 0,
        completedTasks: 0,
        pendingTasks: 0,
        inProgressTasks: 0,
        blockedTasks: 0,
        completionRate: 0,
        onTimePercentage: 0,
        avgDelayDays: 0,
        late: 0,
        onTime: 0,
        early: 0,
        engineerCount: 0,
      },
    [metrics]
  )

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
            <p className="text-gray-600">Please log in to access reports.</p>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Reports Dashboard</h1>
            <p className="text-sm text-gray-600">
              Engineer performance, task metrics, and delay analysis — live from
              the API.
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
            <Button
              size="sm"
              onClick={handleExportAll}
              disabled={loading || !metrics}
            >
              <FileSpreadsheet className="mr-1 h-4 w-4" />
              Export All (Excel)
            </Button>
            <BarChart3 className="h-8 w-8 text-gray-300" />
          </div>
        </div>

        {/* Expandable reference of how each metric on this page is calculated.
            Kept as a <details> so it doesn't take up space by default but is
            always one click away. */}
        <details className="group rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
          <summary className="cursor-pointer list-none font-semibold text-gray-800 [&::-webkit-details-marker]:hidden">
            <span className="mr-2 inline-block transition-transform group-open:rotate-90">
              ▸
            </span>
            How these metrics are calculated
          </summary>

          <div className="mt-3 grid grid-cols-1 gap-4 text-xs text-gray-700 md:grid-cols-2">
            <div>
              <p className="mb-1 font-semibold text-gray-900">
                Overview & Completion
              </p>
              <ul className="list-inside list-disc space-y-1">
                <li>
                  <b>Completion</b> = number of tasks with status "Completed"
                  within the active filters.
                </li>
                <li>
                  <b>Completion Rate</b> = Completion ÷ Total Tasks × 100.
                </li>
                <li>
                  <b>On-Time Rate</b> = On-Time completed tasks ÷ Total
                  Analyzed completed tasks × 100.
                </li>
              </ul>
            </div>

            <div>
              <p className="mb-1 font-semibold text-gray-900">
                Delay Analysis (completed tasks only)
              </p>
              <ul className="list-inside list-disc space-y-1">
                <li>
                  <b>delayDays</b> = actualDate − targetDate (whole days).{' '}
                  <i>0</i> = on-time, <i>&lt; 0</i> = early,{' '}
                  <i>&gt; 0</i> = late.
                </li>
                <li>
                  <b>Overall Average Delay</b> = mean of delayDays across ALL
                  analyzed completed tasks ( Assigned — early tasks subtract).
                </li>
                <li>
                  <b>On-Time</b> = count where delayDays = 0.{' '}
                  <b>Early Delivery</b> = count where delayDays &lt; 0 (and{' '}
                  <b>Avg Early Delivery</b> is the mean of |delayDays| for
                  those tasks).
                </li>
              </ul>
            </div>

            <div className="md:col-span-2">
              <p className="mb-1 font-semibold text-gray-900">
                Engineer Workload — Performance Metrics
              </p>
              <ul className="list-inside list-disc space-y-1">
                <li>
                  <b>Total Assigned</b> = all tasks assigned to the engineer
                  (any status). <b>Completed</b> = those with status
                  "Completed".
                </li>
                <li>
                  <b>Avg Completion</b> = mean of (actualDate − targetDate) in
                  days across the engineer's completed tasks. It is Assigned: a
                  negative value means the engineer finishes earlier than the
                  target on average.
                </li>
                <li>
                  <b>On-Time %</b> = On Time ÷ Completed × 100.{' '}
                  <b>Completion %</b> = Completed ÷ Total Assigned × 100.
                </li>
                <li>
                  <b>Rating</b>: Excellent (On-Time ≥ 90% AND Completion ≥
                  80%), Good (On-Time ≥ 75%), Average (On-Time ≥ 50%), Poor
                  otherwise.
                </li>
              </ul>
            </div>
          </div>
        </details>

        {/* Filters */}
        <ReportFilters
          filters={filters}
          engineers={engineerList}
          onChange={handleFilterChange}
          onReset={handleReset}
        />

        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* KPIs */}
        <TaskMetricsCards metrics={loadedMetrics} loading={loading} />

        {/* Tabbed content */}
        <Tabs defaultValue="engineers" className="w-full">
          <TabsList className="grid w-full max-w-xl grid-cols-3">
            <TabsTrigger value="engineers">Engineer Performance</TabsTrigger>
            <TabsTrigger value="delays">Delay Analysis</TabsTrigger>
            <TabsTrigger value="export">Legacy Export</TabsTrigger>
          </TabsList>

          <TabsContent value="engineers" className="space-y-4 pt-4">
            <EngineerPerformanceTable rows={engineerRows} loading={loading} />
          </TabsContent>

          <TabsContent value="delays" className="space-y-4 pt-4">
            <DelayAnalysis summary={delaySummary} loading={loading} />
          </TabsContent>

          <TabsContent value="export" className="space-y-4 pt-4">
            <LegacyReportGenerator />
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  )
}

/* --------------------------------------------------------------------------
 *  Legacy backend report generator (preserved for backwards compatibility
 *  with the existing /api/reports/generate endpoint — PDF / Excel / CSV).
 * ------------------------------------------------------------------------ */

import { getCsrfToken } from '@/lib/csrf'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

function LegacyReportGenerator(): JSX.Element {
  const [reportType, setReportType] = useState('task_completion')
  const [format, setFormat] = useState('excel')
  const [dateRange, setDateRange] = useState('last_30_days')
  const [customStartDate, setCustomStartDate] = useState('')
  const [customEndDate, setCustomEndDate] = useState('')
  const [generating, setGenerating] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const reportTypes = [
    { value: 'task_completion', label: 'Task Completion Report' },
    { value: 'performance', label: 'Performance Report' },
    { value: 'user_activity', label: 'User Activity Report' },
    { value: 'shop_summary', label: 'Shop Summary Report' },
  ]
  const formats = [
    { value: 'pdf', label: 'PDF (Print to PDF)' },
    { value: 'excel', label: 'Excel (.xlsx)' },
    { value: 'csv', label: 'CSV' },
  ]
  const dateRanges = [
    { value: 'today', label: 'Today' },
    { value: 'yesterday', label: 'Yesterday' },
    { value: 'last_7_days', label: 'Last 7 Days' },
    { value: 'last_30_days', label: 'Last 30 Days' },
    { value: 'this_month', label: 'This Month' },
    { value: 'last_month', label: 'Last Month' },
    { value: 'custom', label: 'Custom Range' },
  ]

  const downloadFileWithDataUri = (blob: Blob, filename: string): Promise<void> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        try {
          const link = document.createElement('a')
          link.href = reader.result as string
          link.download = filename
          link.style.display = 'none'
          document.body.appendChild(link)
          link.click()
          document.body.removeChild(link)
          resolve()
        } catch (e) {
          reject(e)
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(blob)
    })

  const handleGenerateReport = async (): Promise<void> => {
    setGenerating(true)
    setErr(null)
    setOk(null)
    try {
      if (dateRange === 'custom') {
        if (!customStartDate || !customEndDate) {
          setErr('Please select both start and end dates for custom range')
          return
        }
        if (new Date(customStartDate) > new Date(customEndDate)) {
          setErr('Start date must be before end date')
          return
        }
      }
      const payload = {
        reportType,
        format,
        dateRange,
        ...(dateRange === 'custom' && {
          startDate: customStartDate,
          endDate: customEndDate,
        }),
      }
      const csrfToken = await getCsrfToken()
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify(payload),
        credentials: 'same-origin',
      })
      if (!response.ok) {
        const e = await response.json().catch(() => ({}))
        throw new Error(e.message || `Failed: ${response.status}`)
      }
      const contentType = response.headers.get('content-type') || ''
      if (format === 'pdf' && contentType.includes('text/html')) {
        const html = await response.text()
        const blob = new Blob([html], { type: 'text/html' })
        const reader = new FileReader()
        reader.onloadend = () => {
          const uri = reader.result as string
          const w = window.open(uri, '_blank')
          if (!w) {
            setErr(
              'Please allow pop-ups to view the PDF report. Use Ctrl/Cmd+P to print.'
            )
          } else {
            setOk('Report opened in new tab. Use Ctrl/Cmd+P to save as PDF.')
          }
        }
        reader.readAsDataURL(blob)
      } else {
        const blob = await response.blob()
        const filename = `report_${reportType}_${Date.now()}.${
          format === 'excel' ? 'xlsx' : format
        }`
        await downloadFileWithDataUri(blob, filename)
        setOk(`Report downloaded as ${format.toUpperCase()}`)
      }
    } catch (e: any) {
      setErr(e?.message || 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Backend Report Generator</CardTitle>
        <CardDescription>
          Generate formatted PDF / Excel / CSV reports from the backend report
          service.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {err && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {err}
          </div>
        )}
        {ok && (
          <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            {ok}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1">
            <Label>Report Type</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {reportTypes.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Format</Label>
            <Select value={format} onValueChange={setFormat}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formats.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Date Range</Label>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dateRanges.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {dateRange === 'custom' && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Start Date</Label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </div>
            <div className="space-y-1">
              <Label>End Date</Label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full rounded border px-3 py-2"
              />
            </div>
          </div>
        )}

        <Button
          onClick={handleGenerateReport}
          disabled={generating}
          className="w-full"
        >
          {generating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Generate Report
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  )
}