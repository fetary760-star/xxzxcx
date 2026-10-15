'use client'

import React from 'react'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { RotateCcw, Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

/* =============================================================================
 *  FILTER SEMANTICS — how each filter narrows the reporting dataset
 * =============================================================================
 *
 *  The values chosen here are passed to the Reports page, which translates
 *  them into query parameters for the backend APIs. The same filter set is
 *  applied uniformly to every metric on the dashboard so that Completion,
 *  Completion Rate, Avg Delay, On-Time %, Early Delivery and per-engineer
 *  Avg Completion are all computed over the SAME filtered task set.
 *
 *    dateRange   : Bounds the task set by target/actual date window.
 *                  'all' disables date filtering entirely.
 *                  'custom' uses startDate..endDate inclusive.
 *    engineer    : 'all' or an engineer name. When a specific engineer is
 *                  selected, every metric (except global totals produced by
 *                  the backend) is filtered to that engineer's tasks.
 *    priority    : 'all' | 'High' | 'Medium' | 'Low'.
 *    status      : 'all' or one of the known task statuses (Completed,
 *                  In Progress, Pending, Blocked, On Hold). Note: Completion
 *                  Rate and delay-based metrics still require the Completed
 *                  subset internally even when status filter = 'all'.
 * =============================================================================
 */

export interface FilterState {
  dateRange: string
  startDate: string
  endDate: string
  engineer: string
  priority: string
  status: string
}

interface ReportFiltersProps {
  filters: FilterState
  engineers: string[]
  onChange: (patch: Partial<FilterState>) => void
  onReset: () => void
}

const DATE_RANGES = [
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' },
  { value: 'all', label: 'All Time' },
]

const PRIORITIES = [
  { value: 'all', label: 'All Priorities' },
  { value: 'High', label: 'High' },
  { value: 'Medium', label: 'Medium' },
  { value: 'Low', label: 'Low' },
]

const STATUSES = [
  { value: 'all', label: 'All Statuses' },
  { value: 'Completed', label: 'Completed' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Pending', label: 'Pending' },
  { value: 'Blocked', label: 'Blocked' },
  { value: 'On Hold', label: 'On Hold' },
]

/**
 * Advanced filter bar for the Reports Dashboard.
 *
 * Provides date range, engineer, priority, and status filters.
 * Emits partial updates via `onChange` so the parent can merge into its state.
 *
 * An info icon next to the "Filters" heading explains that the selections
 * here directly scope every calculation shown on the dashboard — i.e. changing
 * the engineer or date range changes the inputs to every formula (Completion
 * Rate, Avg Delay, On-Time %, Avg Completion, etc.).
 */
export default function ReportFilters({
  filters,
  engineers,
  onChange,
  onReset,
}: ReportFiltersProps): JSX.Element {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-1 text-sm font-semibold text-gray-700">
          Filters
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="How filters affect the report"
                  className="inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-400 hover:text-gray-600"
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                All filters apply to every metric on this page. Changing the
                date range, engineer, priority, or status changes the set of
                tasks used to compute Completion, Completion Rate, Overall
                Average Delay, On-Time %, Early Delivery, and per-engineer Avg
                Completion.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="h-8 text-xs"
        >
          <RotateCcw className="mr-1 h-3 w-3" />
          Reset
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-5">
        {/* Date Range — bounds the task set by date window */}
        <div className="space-y-1">
          <Label className="text-xs">Date Range</Label>
          <Select
            value={filters.dateRange}
            onValueChange={(v) => onChange({ dateRange: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Engineer — restricts metrics to a single engineer's tasks */}
        <div className="space-y-1">
          <Label className="text-xs">Engineer</Label>
          <Select
            value={filters.engineer}
            onValueChange={(v) => onChange({ engineer: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Engineers</SelectItem>
              {engineers.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Priority */}
        <div className="space-y-1">
          <Label className="text-xs">Priority</Label>
          <Select
            value={filters.priority}
            onValueChange={(v) => onChange({ priority: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div className="space-y-1">
          <Label className="text-xs">Status</Label>
          <Select
            value={filters.status}
            onValueChange={(v) => onChange({ status: v })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom date range inputs */}
        {filters.dateRange === 'custom' ? (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Start</Label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => onChange({ startDate: e.target.value })}
                className="h-9 w-full rounded-md border border-gray-300 px-2 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">End</Label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => onChange({ endDate: e.target.value })}
                className="h-9 w-full rounded-md border border-gray-300 px-2 text-sm"
              />
            </div>
          </div>
        ) : (
          <div />
        )}
      </div>
    </div>
  )
}