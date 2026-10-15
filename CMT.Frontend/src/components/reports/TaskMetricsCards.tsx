'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  TrendingUp,
  Users,
  ListTodo,
  Info,
} from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { formatNumber, formatPercent } from '@/utils/excelExport'

/* =============================================================================
 *  METRIC DEFINITIONS & FORMULAS
 * =============================================================================
 *
 *  These are the exact formulas used on the Reports Dashboard. They match the
 *  calculations performed in /api/analytics/completion-rate and
 *  /api/analytics/avg-delay on the backend, and are applied client-side here
 *  for display purposes only. No aggregation logic lives in this component —
 *  it simply renders pre-computed values passed in via `metrics`.
 *
 *  -- Task counts ------------------------------------------------------------
 *    totalTasks        = count of all tasks matching the active filters
 *                        (date range, engineer, priority, status).
 *    completedTasks    = count of tasks whose status === 'Completed'.
 *    pendingTasks      = count of tasks whose status === 'Pending'.
 *    inProgressTasks   = count of tasks whose status === 'In Progress'.
 *    blockedTasks      = count of tasks whose status === 'Blocked'.
 *
 *  -- Completion -------------------------------------------------------------
 *    Completion        = completedTasks              (count, not a rate)
 *    Completion Rate   = (completedTasks / totalTasks) * 100
 *                        — expressed as a percentage. If totalTasks === 0,
 *                        Completion Rate is reported as 0.
 *
 *  -- Delay analysis (only over COMPLETED tasks with a target+actual date) --
 *    delayDays (per task) = (actualDate − targetDate) in whole days.
 *                           Positive  → late
 *                           Zero      → on-time
 *                           Negative  → early
 *
 *    onTime            = count of completed tasks where delayDays === 0
 *    early             = count of completed tasks where delayDays  <  0
 *    late              = count of completed tasks where delayDays  >  0
 *    totalAnalyzed     = onTime + early + late
 *
 *    onTimePercentage  = (onTime / totalAnalyzed) * 100
 *    earlyPercentage   = (early  / totalAnalyzed) * 100
 *    latePercentage    = (late   / totalAnalyzed) * 100
 *
 *  -- Average delay ---------------------------------------------------------
 *    avgDelayDays      = Overall Average Delay
 *                      = sum(delayDays across ALL analyzed completed tasks)
 *                        / totalAnalyzed
 *                        (early tasks contribute negative values, so this
 *                         is a signed mean — a negative result means on
 *                         average tasks finished early.)
 *
 *    avgLateDelay      = sum(delayDays across LATE tasks only) / late
 *                        (always >= 0; average tardiness in days for
 *                         tasks that missed the target.)
 *
 *    avgEarlyDelivery  = sum(|delayDays| across EARLY tasks only) / early
 *                        (always >= 0; average number of days delivered
 *                         ahead of the target for early tasks.)
 *
 *  -- Misc ------------------------------------------------------------------
 *    engineerCount     = number of distinct engineers appearing in the
 *                        per-engineer performance table (post-filter).
 * =============================================================================
 */

export interface TaskMetrics {
  totalTasks: number
  completedTasks: number
  pendingTasks: number
  inProgressTasks: number
  blockedTasks: number
  /** Completion Rate (%) = (completedTasks / totalTasks) * 100 */
  completionRate: number | string
  /** On-Time Rate (%) = (onTime / totalAnalyzed) * 100 */
  onTimePercentage: number | string
  /** Overall Average Delay (days, signed) across all completed tasks */
  avgDelayDays: number
  /** Completed tasks finishing after their target date (delayDays > 0) */
  late: number
  /** Completed tasks finishing exactly on their target date (delayDays === 0) */
  onTime: number
  /** Completed tasks finishing before their target date (delayDays < 0) */
  early: number
  engineerCount: number
}

interface Props {
  metrics: TaskMetrics
  loading?: boolean
}

interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  sub?: string
  accent: string
  /** Short, plain-language formula shown in a tooltip next to the label. */
  formula?: string
}

function MetricCard({
  icon,
  label,
  value,
  sub,
  accent,
  formula,
}: MetricCardProps): JSX.Element {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <div className={`rounded-lg p-3 ${accent}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <p className="truncate text-xs font-medium text-gray-500">{label}</p>
            {formula ? (
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={`How ${label} is calculated`}
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
          </div>
          <p className="text-xl font-bold text-gray-900">{value}</p>
          {sub ? <p className="text-xs text-gray-500">{sub}</p> : null}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Top-level KPI cards for the Reports Dashboard.
 *
 * Each card now exposes a small info-icon tooltip that documents the formula
 * used to produce the displayed value. See the block comment at the top of
 * this file for the authoritative definitions.
 */
export default function TaskMetricsCards({ metrics, loading }: Props): JSX.Element {
  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="h-16 animate-pulse rounded bg-gray-100" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <MetricCard
        icon={<ListTodo className="h-5 w-5 text-blue-600" />}
        label="Total Tasks"
        value={metrics.totalTasks}
        accent="bg-blue-50"
        formula="Total Tasks = count of all tasks matching the active filters (date range, engineer, priority, status)."
      />
      <MetricCard
        icon={<CheckCircle2 className="h-5 w-5 text-green-600" />}
        label="Completed"
        value={metrics.completedTasks}
        sub={`${formatPercent(metrics.completionRate)} completion`}
        accent="bg-green-50"
        formula={
          'Completed = count of tasks with status = "Completed". ' +
          'Completion Rate = (Completed / Total Tasks) × 100. ' +
          'If there are no tasks in range, Completion Rate is reported as 0%.'
        }
      />
      <MetricCard
        icon={<TrendingUp className="h-5 w-5 text-emerald-600" />}
        label="On-Time Rate"
        value={formatPercent(metrics.onTimePercentage)}
        sub={`${metrics.onTime} on time`}
        accent="bg-emerald-50"
        formula={
          'A completed task is "On Time" when actualDate = targetDate (delay = 0 days). ' +
          'On-Time Rate = (On-Time tasks / Total Analyzed completed tasks) × 100.'
        }
      />
      <MetricCard
        icon={<Clock className="h-5 w-5 text-orange-600" />}
        label="Avg Delay"
        value={`${formatNumber(metrics.avgDelayDays, 1)} d`}
        sub={`${metrics.late} late tasks`}
        accent="bg-orange-50"
        formula={
          'Overall Average Delay = average of (actualDate − targetDate) in whole days across ALL analyzed completed tasks. ' +
          'Early deliveries contribute negative values, late deliveries positive — so a negative average means tasks finished early on average.'
        }
      />
      <MetricCard
        icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
        label="Blocked / Pending"
        value={`${metrics.blockedTasks} / ${metrics.pendingTasks}`}
        sub={`${metrics.inProgressTasks} in progress`}
        accent="bg-red-50"
        formula='Counts of tasks grouped by status. Blocked = status "Blocked", Pending = status "Pending", In Progress = status "In Progress".'
      />
      <MetricCard
        icon={<Users className="h-5 w-5 text-purple-600" />}
        label="Engineers"
        value={metrics.engineerCount}
        accent="bg-purple-50"
        formula="Number of distinct engineers appearing in the per-engineer performance table after filters are applied."
      />
    </div>
  )
}