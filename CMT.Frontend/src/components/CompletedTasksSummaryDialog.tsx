'use client'

/**
 * CompletedTasksSummaryDialog.tsx  —  NEW (part of the amendment)
 * ---------------------------------------------------------------------------
 * The "Overall Summary" requested for the Completed Tasks screen: every task
 * row already carries its own Early / On-Time / Delayed rate, and this dialog
 * shows the aggregate for ALL currently displayed (filtered) tasks behind a
 * single button.
 *
 * WHAT IS SHOWN
 *   Total Completed Tasks
 *   Early    : count + Total Early Rate    (mean of Target ÷ Actual × 100, > 100%)
 *   On-Time  : count + Total On-Time Rate  (onTimeCount / total × 100)
 *   Delayed  : count + Total Delayed Rate  (mean of Target ÷ Actual × 100, < 100%)
 *   Overall Efficiency = average of the three totals above (empty buckets are
 *   skipped, so "all tasks on time" reads exactly 100.00%).
 *
 * The numbers come from `buildPerformanceSummary`, the SAME function the Excel
 * export uses, so the dialog and the workbook can never disagree.
 * ---------------------------------------------------------------------------
 */

import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatRate, type PerformanceSummary } from '@/lib/completed-task-metrics'

export interface CompletedTasksSummaryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  summary: PerformanceSummary
  /** Human readable description of the active filters. */
  filterDescription?: string
}

interface StatCardProps {
  label: string
  count: number
  rate: number
  hint: string
  tone: 'early' | 'on_time' | 'delayed'
}

const TONE_CLASSES: Record<StatCardProps['tone'], string> = {
  early: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  on_time: 'bg-blue-50 border-blue-200 text-blue-900',
  delayed: 'bg-red-50 border-red-200 text-red-900',
}

function StatCard({ label, count, rate, hint, tone }: StatCardProps) {
  return (
    <div className={`rounded-lg border p-4 ${TONE_CLASSES[tone]}`}>
      <div className="text-sm font-medium">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold">{count}</span>
        <span className="text-xs opacity-80">task{count === 1 ? '' : 's'}</span>
      </div>
      <div className="mt-2 text-lg font-semibold">{formatRate(rate) || '0.00%'}</div>
      <div className="mt-1 text-[11px] leading-snug opacity-80">{hint}</div>
    </div>
  )
}

export default function CompletedTasksSummaryDialog({
  open,
  onOpenChange,
  summary,
  filterDescription,
}: CompletedTasksSummaryDialogProps) {
  const bucketsUsed = [
    summary.earlyCount > 0,
    summary.onTimeCount > 0,
    summary.delayedCount > 0,
  ].filter(Boolean).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Overall Summary — Completed Tasks</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 p-2">
          {filterDescription && (
            <div className="text-xs text-gray-500">Filters: {filterDescription}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm font-medium text-gray-700">Total Completed Tasks</div>
              <div className="mt-1 text-2xl font-bold text-gray-900">{summary.total}</div>
              <div className="mt-1 text-[11px] text-gray-500">
                Early + On-Time + Delayed = {summary.earlyCount + summary.onTimeCount + summary.delayedCount}
              </div>
            </div>

            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4 sm:col-span-2">
              <div className="text-sm font-medium text-purple-900">Overall Efficiency</div>
              <div className="mt-1 text-3xl font-bold text-purple-900">
                {formatRate(summary.overallEfficiency) || '0.00%'}
              </div>
              <div className="mt-1 text-[11px] text-purple-800">
                Average of the Total Early Rate, Total On-Time Rate and Total Delayed Rate
                {bucketsUsed > 0 && ` (${bucketsUsed} of 3 buckets contain tasks)`}.
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label="Early"
              count={summary.earlyCount}
              rate={summary.totalEarlyRate}
              hint="(Target ÷ Actual) × 100 — the earlier the completion, the higher the rate."
              tone="early"
            />
            <StatCard
              label="On-Time"
              count={summary.onTimeCount}
              rate={summary.totalOnTimeRate}
              hint="Completed exactly on the target date. Each task counts as 1; all on time = 100.00%."
              tone="on_time"
            />
            <StatCard
              label="Delayed"
              count={summary.delayedCount}
              rate={summary.totalDelayedRate}
              hint="(Target ÷ Actual) × 100 — the higher the delay, the lower the rate."
              tone="delayed"
            />
          </div>

          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-2 text-left font-semibold">Metric</th>
                  <th className="p-2 text-center font-semibold">Tasks</th>
                  <th className="p-2 text-center font-semibold">Share of total</th>
                  <th className="p-2 text-center font-semibold">Rate</th>
                  <th className="p-2 text-center font-semibold">Avg days</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="p-2 font-medium">Early</td>
                  <td className="p-2 text-center">{summary.earlyCount}</td>
                  <td className="p-2 text-center">{formatRate(summary.earlyRate) || '0.00%'}</td>
                  <td className="p-2 text-center font-semibold text-emerald-700">
                    {formatRate(summary.totalEarlyRate) || '0.00%'}
                  </td>
                  <td className="p-2 text-center">{summary.avgEarly.toFixed(2)}</td>
                </tr>
                <tr className="border-t">
                  <td className="p-2 font-medium">On-Time</td>
                  <td className="p-2 text-center">{summary.onTimeCount}</td>
                  <td className="p-2 text-center">{formatRate(summary.onTimeRate) || '0.00%'}</td>
                  <td className="p-2 text-center font-semibold text-blue-700">
                    {formatRate(summary.totalOnTimeRate) || '0.00%'}
                  </td>
                  <td className="p-2 text-center">{summary.avgOnTime.toFixed(2)}</td>
                </tr>
                <tr className="border-t">
                  <td className="p-2 font-medium">Delayed</td>
                  <td className="p-2 text-center">{summary.delayedCount}</td>
                  <td className="p-2 text-center">{formatRate(summary.delayRate) || '0.00%'}</td>
                  <td className="p-2 text-center font-semibold text-red-700">
                    {formatRate(summary.totalDelayedRate) || '0.00%'}
                  </td>
                  <td className="p-2 text-center">{summary.avgDelayed.toFixed(2)}</td>
                </tr>
                <tr className="border-t-2 border-gray-300 bg-gray-50 font-bold">
                  <td className="p-2">Overall Efficiency</td>
                  <td className="p-2 text-center">{summary.total}</td>
                  <td className="p-2 text-center">100.00%</td>
                  <td className="p-2 text-center text-purple-800">
                    {formatRate(summary.overallEfficiency) || '0.00%'}
                  </td>
                  <td className="p-2 text-center">{summary.avgTargetDays.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="text-[11px] text-gray-500 leading-relaxed">
            Target and actual durations are both measured from <strong>Task Assigned At</strong>, and the
            target used is the <strong>effective</strong> target completion date, so approved deadline
            extensions are honoured here, in the table and in the exported workbook.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}