'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Info } from 'lucide-react'
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { formatNumber, formatPercent } from '@/utils/excelExport'

/* =============================================================================
 *  DELAY ANALYSIS FORMULAS
 * =============================================================================
 *
 *  This panel visualises the backend /api/analytics/avg-delay response. All
 *  calculations operate on COMPLETED tasks that have both a targetDate and
 *  an actualDate. Tasks without either date are excluded from the analysis.
 *
 *    delayDays (per task) = (actualDate − targetDate) in whole days.
 *      > 0   → Late
 *      = 0   → On Time
 *      < 0   → Early
 *
 *  -- Counts ---------------------------------------------------------------
 *    totalAnalyzed     = onTime + early + late
 *    onTime            = count where delayDays === 0
 *    early             = count where delayDays  <  0
 *    late              = count where delayDays  >  0
 *
 *  -- Percentages ----------------------------------------------------------
 *    onTimePercentage  = (onTime / totalAnalyzed) × 100
 *    earlyPercentage   = (early  / totalAnalyzed) × 100
 *    latePercentage    = (late   / totalAnalyzed) × 100
 *
 *  -- Averages -------------------------------------------------------------
 *    avgDelayDays      = Overall Average Delay (SIGNED)
 *                      = sum(delayDays across ALL analyzed tasks) /
 *                        totalAnalyzed
 *                        (early tasks contribute negative values)
 *
 *    avgLateDelay      = average tardiness for LATE tasks only
 *                      = sum(delayDays where delayDays > 0) / late
 *                        (always ≥ 0)
 *
 *    avgEarlyDelivery  = average head-start for EARLY tasks only
 *                      = sum(|delayDays| where delayDays < 0) / early
 *                        (always ≥ 0; reported as a positive number of days
 *                         delivered ahead of target)
 * =============================================================================
 */

export interface DelayItem {
  taskId: string | number
  serialNumber?: string
  partNumber?: string
  description?: string
  /** (actualDate − targetDate) in days; negative = early, 0 = on-time, positive = late. */
  delayDays: number
  status: string
  actualDate: string
  targetDate: string
  engineer: string
  priority: string
}

export interface DelaySummary {
  /** Signed mean delay across all analyzed completed tasks (can be negative). */
  avgDelayDays: number
  /** Mean delay across LATE tasks only (delayDays > 0). */
  avgLateDelay: number
  /** Mean early-delivery magnitude across EARLY tasks only (|delayDays|). */
  avgEarlyDelivery: number
  totalAnalyzed: number
  onTime: number
  early: number
  late: number
  onTimePercentage: string | number
  earlyPercentage: string | number
  latePercentage: string | number
  delayBreakdown: DelayItem[]
}

interface Props {
  summary: DelaySummary | null
  loading?: boolean
}

const PIE_COLORS = ['#10b981', '#3b82f6', '#ef4444'] // green / blue / red

function InfoIcon({ text }: { text: string }): JSX.Element {
  return (
    <TooltipProvider delayDuration={150}>
      <UITooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Formula"
            className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-400 hover:text-gray-600"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          {text}
        </TooltipContent>
      </UITooltip>
    </TooltipProvider>
  )
}

/**
 * Delay analysis panel with pie chart breakdown and top delayed tasks.
 *
 * See the block comment at the top of this file for the precise formulas
 * used to produce every number rendered by this component.
 */
export default function DelayAnalysis({ summary, loading }: Props): JSX.Element {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="h-64 animate-pulse rounded bg-gray-100" />
        </CardContent>
      </Card>
    )
  }

  if (!summary || summary.totalAnalyzed === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delay Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-gray-500">
            No completed-task delay data available for the current filters.
          </p>
        </CardContent>
      </Card>
    )
  }

  const pieData = [
    { name: 'On Time', value: summary.onTime },
    { name: 'Early', value: summary.early },
    { name: 'Late', value: summary.late },
  ]

  // Top 10 LATE tasks (positive delayDays, descending by magnitude).
  // Early / on-time tasks are intentionally excluded from this chart.
  const topLate = summary.delayBreakdown
    .filter((d) => d.delayDays > 0)
    .slice(0, 10)
    .map((d) => ({
      name: d.serialNumber || String(d.taskId),
      delay: d.delayDays,
      engineer: d.engineer,
    }))

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Breakdown Pie */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-base">
            Delivery Breakdown
            <InfoIcon
              text={
                'Each completed task is classified by delay = actualDate − targetDate: ' +
                'On Time (delay = 0), Early (delay < 0), Late (delay > 0). ' +
                'Percentages are share of the Total Analyzed completed tasks.'
              }
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3 pb-4 text-center">
            <div>
              <p className="text-2xl font-bold text-green-600">
                {formatPercent(summary.onTimePercentage)}
              </p>
              <p className="text-xs text-gray-500">On Time ({summary.onTime})</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-600">
                {formatPercent(summary.earlyPercentage)}
              </p>
              <p className="text-xs text-gray-500">Early ({summary.early})</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-red-600">
                {formatPercent(summary.latePercentage)}
              </p>
              <p className="text-xs text-gray-500">Late ({summary.late})</p>
            </div>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={(entry) => `${entry.name}: ${entry.value}`}
                >
                  {pieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
            <div>
              <span className="font-semibold">Overall Avg Delay:</span>{' '}
              {formatNumber(summary.avgDelayDays, 2)} d
              <InfoIcon
                text={
                  'Overall Average Delay = sum(delayDays across ALL analyzed completed tasks) / totalAnalyzed. ' +
                  'Signed: early tasks contribute negative days. A value < 0 means early on average, > 0 means late on average.'
                }
              />
            </div>
            <div>
              <span className="font-semibold">Avg Late:</span>{' '}
              {formatNumber(summary.avgLateDelay, 2)} d
              <InfoIcon
                text={
                  'Average tardiness for LATE tasks only = sum(delayDays where delayDays > 0) / count(late). Always ≥ 0.'
                }
              />
            </div>
            <div>
              <span className="font-semibold">Avg Early:</span>{' '}
              {formatNumber(summary.avgEarlyDelivery, 2)} d
              <InfoIcon
                text={
                  'Average early-delivery magnitude for EARLY tasks only = sum(|delayDays| where delayDays < 0) / count(early). Reported as a positive number of days ahead of target.'
                }
              />
            </div>
            <div>
              <span className="font-semibold">Analyzed:</span>{' '}
              {summary.totalAnalyzed}
              <InfoIcon
                text={
                  'Total Analyzed = count of completed tasks that have both a targetDate and an actualDate. Tasks missing either date are excluded.'
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top delayed tasks */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-base">
            Top 10 Delayed Tasks
            <InfoIcon
              text={
                'Top 10 completed tasks with the largest positive delayDays (actualDate − targetDate in days). Early and on-time tasks are not included.'
              }
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          {topLate.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No late tasks in the selected range.
            </p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topLate} layout="vertical" margin={{ left: 20 }}>
                  <XAxis type="number" stroke="#6b7280" fontSize={12} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#6b7280"
                    fontSize={11}
                    width={90}
                  />
                  <Tooltip
                    formatter={(v: number) => [`${v} days late`, 'Delay']}
                    labelFormatter={(l, payload) => {
                      const p = payload && payload[0]?.payload
                      return p ? `${l} — ${p.engineer}` : l
                    }}
                  />
                  <Bar dataKey="delay" fill="#ef4444" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}