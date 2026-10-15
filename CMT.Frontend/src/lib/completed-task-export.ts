/**
 * completed-task-export.ts  —  AMENDED (corrected Excel report structure)
 * ---------------------------------------------------------------------------
 * Builds and downloads the "Completed Tasks" Excel workbook.
 *
 * ===========================================================================
 * CORRECTED WORKBOOK STRUCTURE
 * ===========================================================================
 * The workbook now contains, for EVERY exported task, the four identity /
 * timing columns the analysis needs, plus its own rate breakdown:
 *
 *   Task ID | Assigned Engineer | Target Completion Date | Actual Completion Date
 *   Target Day/s | Actual Day/s | Day Variance | Performance
 *   Early Tasks | On-Time Tasks | Delayed Tasks           <- 1 / 0 records
 *   Early Rate | On-Time Rate | Delayed Rate | Task Efficiency
 *
 * PER TASK
 *   - a task completed exactly on the target date records On-Time Tasks = 1
 *     and On-Time Rate = 100.00%
 *   - an early task records (Target ÷ Actual) × 100 in Early Rate (> 100%)
 *   - a delayed task records (Target ÷ Actual) × 100 in Delayed Rate (< 100%)
 *
 * SUMMARY ROW (last row, "SUMMARY")
 *   Early / On-Time / Delayed task COUNTS,
 *   Total Early Rate / Total On-Time Rate / Total Delayed Rate,
 *   Overall Efficiency = average of those totals.
 *   => when every task is on time: On-Time Tasks = total, On-Time Rate =
 *      100.00% and Overall Efficiency = 100.00%.
 *
 * DATE RANGE FILTER (AMENDED):
 *   Start Date → based on "Task Assigned At" column
 *   End Date   → based on "Engineer Completed At" column
 *
 * GUARANTEES
 *   1. It exports EXACTLY the rows it is given (already role-scoped with
 *      `scopeTasksByRole` and filtered with `filterCompletedTasks`), so the
 *      workbook can never contain extra records.
 *   2. The performance block is written ONLY when
 *      `canViewPerformanceColumns(role)` is true (Team Leader / Director).
 *   3. Every value is calculated against the EFFECTIVE (extended) Target
 *      Completion Date, so a granted deadline extension is reflected in the
 *      workbook exactly as it is on screen.
 *   4. "Target Day/s" is derived from the Category Target Days configuration
 *      under Target Durations, listed according to their category with target
 *      days or hours set accordingly.
 * ---------------------------------------------------------------------------
 */

import { exportToExcel } from '@/utils/excelExport'
import {
  buildExportFileSuffix,
  buildPerformanceSummary,
  calculateTaskRates,
  canViewPerformanceColumns,
  deriveEngineerCompletedAt,
  describeFilters,
  formatDays,
  formatRate,
  getEffectiveTargetCompletion,
  getTlApprovedVarianceDays,
  getVarianceStart,
  humanizeStatus,
  isTargetExtended,
  performanceLabel,
  resolveActualCompletion,
  type CommentsMap,
  type CompletedTaskFilterState,
  type PerformanceSummary,
} from '@/lib/completed-task-metrics'

/** Columns every role receives. */
export const BASE_EXPORT_COLUMNS = [
  'Task ID',
  'Serial Number',
  'Part Number',
  'Description',
  'PO Number',
  'Category',
  'Comments',
  'Status',
  'Assigned Engineer',
  'Priority',
  'Creator',
  'Created At',
  'Task Assigned At',
  'Engineer Completed At',
  'TL Approved At',
  'Engineer Variance (days)',
  'TL Approved Variance (days)',
  'Shop',
] as const

/**
 * Columns restricted to Team Leader / Director.
 * They are inserted right before "TL Approved Variance (days)" so the
 * performance block stays together and easy to read.
 */
export const RESTRICTED_EXPORT_COLUMNS = [
  'Target Completion Date',
  'Actual Completion Date',
  'Target Extended',
  'Target Day/s',
  'Actual Day/s',
  'Day Variance',
  'Performance',
  'Early Tasks',
  'On-Time Tasks',
  'Delayed Tasks',
  'Early Rate',
  'On-Time Rate',
  'Delayed Rate',
  'Task Efficiency',
] as const

export interface CompletedTaskExportOptions {
  /** Rows already role-scoped AND date/engineer filtered. */
  tasks: any[]
  targetDaysData: any[]
  commentsMap?: CommentsMap
  role: string
  currentUserName?: string | null
  filters: CompletedTaskFilterState
  /** Timezone aware formatter supplied by the page. */
  formatDateTime: (value?: string | null) => string
  /** Full comment history formatter supplied by the page. */
  formatComments?: (taskId: number, fallback: string) => string
  fileNamePrefix?: string
  sheetName?: string
}

/** Build the ordered column list for the current role. */
export function buildExportColumns(role: string): string[] {
  const canViewPerformance = canViewPerformanceColumns(role)
  const columns: string[] = []
  for (const col of BASE_EXPORT_COLUMNS) {
    if (col === 'TL Approved Variance (days)' && canViewPerformance) {
      columns.push(...RESTRICTED_EXPORT_COLUMNS)
    }
    columns.push(col)
  }
  return columns
}

/**
 * Build the workbook rows (plus the SUMMARY row) without downloading them.
 * Exposed separately so it can be unit tested and reused by the on-screen
 * "Overall Summary" dialog.
 */
export function buildCompletedTaskExportRows(
  options: CompletedTaskExportOptions
): { columns: string[]; rows: Array<Record<string, unknown>>; summary: PerformanceSummary } {
  const {
    tasks,
    targetDaysData,
    commentsMap = {},
    role,
    filters,
    formatDateTime,
    formatComments,
  } = options

  const canViewPerformance = canViewPerformanceColumns(role)
  const columns = buildExportColumns(role)

  const resolveCompletedAt = (task: any) => deriveEngineerCompletedAt(task, commentsMap)

  const rows: Array<Record<string, unknown>> = tasks.map((task) => {
    const engineerCompletedAt = resolveCompletedAt(task)
    const breakdown = calculateTaskRates(task, targetDaysData, engineerCompletedAt)

    const row: Record<string, unknown> = {
      'Task ID': `TC-${task.task_id}`,
      'Serial Number': task.serial_number ?? '',
      'Part Number': task.part_number ?? '',
      'Description': task.description ?? '',
      'PO Number': task.po_number ?? '',
      'Category': task.category_name ?? '',
      'Comments': formatComments
        ? formatComments(Number(task.task_id), String(task.comments ?? ''))
        : String(task.comments ?? ''),
      'Status': humanizeStatus(task.status),
      'Assigned Engineer': String(task.assigned_engineer ?? '').replace(/,/g, ', '),
      'Priority': task.priority_level_name ?? '',
      'Creator': task.creator_name ?? '',
      'Created At': formatDateTime(task.created_at),
      'Task Assigned At': formatDateTime(getVarianceStart(task)),
      'Engineer Completed At': formatDateTime(engineerCompletedAt),
      'TL Approved At': formatDateTime(task.actual_completion_date),
      'Engineer Variance (days)': formatDays(breakdown.actualDurationDays),
      'TL Approved Variance (days)': formatDays(getTlApprovedVarianceDays(task)),
      'Shop': task.shop_name ?? '',
    }

    if (canViewPerformance) {
      row['Target Completion Date'] = formatDateTime(getEffectiveTargetCompletion(task, targetDaysData))
      row['Actual Completion Date'] = formatDateTime(resolveActualCompletion(task, engineerCompletedAt))
      row['Target Extended'] = isTargetExtended(task, targetDaysData) ? 'Yes' : 'No'
      row['Target Day/s'] = formatDays(breakdown.targetDurationDays)
      row['Actual Day/s'] = formatDays(breakdown.actualDurationDays)
      row['Day Variance'] = breakdown.dayDelta === null ? 'N/A' : breakdown.dayDelta
      row['Performance'] = performanceLabel(breakdown.bucket)

      // 1 / 0 records — an on-time task is recorded as 1 in "On-Time Tasks".
      row['Early Tasks'] = breakdown.earlyFlag
      row['On-Time Tasks'] = breakdown.onTimeFlag
      row['Delayed Tasks'] = breakdown.delayedFlag

      // (Target ÷ Actual) × 100 for early / delayed, 100.00% for on-time.
      row['Early Rate'] = formatRate(breakdown.earlyRate)
      row['On-Time Rate'] = formatRate(breakdown.onTimeRate)
      row['Delayed Rate'] = formatRate(breakdown.delayedRate)
      row['Task Efficiency'] = formatRate(breakdown.taskRate)
    }

    return row
  })

  // ─── SUMMARY ROW ─────────────────────────────────────────────────────────
  const summary = buildPerformanceSummary(tasks, targetDaysData, canViewPerformance, resolveCompletedAt)
  const summaryRow: Record<string, unknown> = {}
  for (const column of columns) summaryRow[column] = ''
  summaryRow['Task ID'] = 'SUMMARY'
  summaryRow['Description'] = describeFilters(filters)
  summaryRow['Status'] = `${tasks.length} record${tasks.length === 1 ? '' : 's'}`
  summaryRow['Assigned Engineer'] = (filters?.engineerNames ?? []).length === 0
    ? 'All engineers (role scoped)'
    : (filters?.engineerNames ?? []).join(', ')
  summaryRow['Engineer Variance (days)'] = summary.avgEngineerVariance.toFixed(2)

  if (canViewPerformance) {
    summaryRow['Target Day/s'] = summary.avgTargetDays.toFixed(2)
    summaryRow['Actual Day/s'] = summary.avgEngineerVariance.toFixed(2)
    summaryRow['Performance'] = `Total completed: ${summary.total}`

    // Counts — Early + On-Time + Delayed always adds up to Total completed.
    summaryRow['Early Tasks'] = summary.earlyCount
    summaryRow['On-Time Tasks'] = summary.onTimeCount
    summaryRow['Delayed Tasks'] = summary.delayedCount

    // Totals — On-Time Rate is 100.00% when every task hit its target date.
    summaryRow['Early Rate'] = formatRate(summary.totalEarlyRate)
    summaryRow['On-Time Rate'] = formatRate(summary.totalOnTimeRate)
    summaryRow['Delayed Rate'] = formatRate(summary.totalDelayedRate)

    // Overall efficiency = average of the totals above (empty buckets ignored).
    summaryRow['Task Efficiency'] = formatRate(summary.overallEfficiency)
  }

  rows.push(summaryRow)
  return { columns, rows, summary }
}

/** Build + download the workbook. Returns the real record count. */
export function exportCompletedTasksToExcel(options: CompletedTaskExportOptions): number {
  const { columns, rows } = buildCompletedTaskExportRows(options)
  const prefix = options.fileNamePrefix ?? 'completed-tasks'
  const filename = `${prefix}_${buildExportFileSuffix(options.filters)}`
  exportToExcel(rows, filename, options.sheetName ?? 'Completed Tasks', columns)
  // rows includes the SUMMARY row — report the real record count.
  return Math.max(rows.length - 1, 0)
}