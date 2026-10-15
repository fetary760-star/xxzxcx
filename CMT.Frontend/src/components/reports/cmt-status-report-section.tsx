'use client'

import React from 'react'
import KpiSummaryTable from './kpi-summary-table'
import MonthlyCategoryTable from './monthly-category-table'
import type {
  CategoryColumn,
  DateRange,
  KpiTable,
  MonthlyMatrix,
  NormalizedTask,
} from '@/lib/kpi-report-utils'

/**
 * Sub-tabbed (full width) layout for the "Eng Status Report" tab.
 *
 *   Eng Status Report
 *   ├── [ CMT STATUS ]     -> CMT ENG STATUS REPORT table only
 *   └── [ CMT BREAKDOWN ]  -> MONTHLY TASK COUNT BY CATEGORY table only
 *
 * Behaviour
 * ---------------------------------------------------------------------------
 * 1. A modern segmented control (pill switcher) is rendered at the top of the
 *    section: two clickable buttons, `CMT STATUS` and `CMT BREAKDOWN`.
 * 2. Only the table belonging to the ACTIVE sub-tab is mounted/visible — the
 *    two tables are NEVER displayed simultaneously.
 * 3. The selected segment has a clear active state (raised white pill, teal
 *    label, lime accent bar) while the inactive one stays muted.
 * 4. Each table spans 100% of the container width, so its content is fully
 *    visible without a horizontal scroll bar.
 * 5. Fully keyboard accessible (ArrowLeft / ArrowRight / Home / End) and
 *    exposed with the WAI-ARIA tab pattern.
 *
 * Data handling, filters, table structures and table styling are untouched:
 * the exact same props are forwarded to `KpiSummaryTable` and
 * `MonthlyCategoryTable` as before.
 *
 * Updated in this revision
 * ---------------------------------------------------------------------------
 * - The CMT STATUS hint now documents the corrected OUTPUT TARGET rule
 *   (creation date + category target duration, open AND completed tasks,
 *   compared by calendar day).
 * - The CMT BREAKDOWN hint documents the new colour banding:
 *   3 most recent months green, the 3 months before them yellow, the rest red.
 * - `showTargetDiagnostics` is forwarded so the OUTPUT TARGET resolution
 *   summary under the KPI table can be toggled from the page.
 *
 * Wiring — either mode works
 * ---------------------------------------------------------------------------
 * A) Self contained (recommended, each table aggregates its own data):
 *
 *   <CmtStatusReportSection
 *     tasks={normalizedTasks}
 *     columns={categoryColumns}
 *     range={{ start, end }}
 *     dateRangeLabel={rangeLabel}
 *   />
 *
 * B) Legacy precomputed props (still supported):
 *
 *   <CmtStatusReportSection
 *     kpiTable={computeKpiTable(tasks, columns, range)}
 *     monthlyMatrix={computeOpenMonthlyMatrix(tasks, columns)}
 *     dateRangeLabel={rangeLabel}
 *   />
 */

/* ===========================================================================
 * Sub-tab model
 * ======================================================================== */

export type CmtStatusReportTabKey = 'kpi' | 'monthly'

interface SubTabDef {
  key: CmtStatusReportTabKey
  /** Label shown inside the segmented control. */
  label: string
  /** Short helper shown under the segmented control. */
  hint: string
}

const SUB_TABS: SubTabDef[] = [
  {
    key: 'kpi',
    label: 'CMT STATUS',
    hint: 'KPI summary per task category. OUTPUT TARGET counts the tasks whose Target Completion Date (task creation date + category target duration) falls inside the Date Range Filter — open and completed tasks both count, and the comparison is done by calendar day. ACTUAL OUTPUT and ACTUAL OUTPUT avg. TAT come from the Completed Task table; INPUT comes from the Task table — all filtered by the Date Range Filter. INVENTORY, AVERAGE BACKLOG, MAX AGE, PENDING, IN PROGRESS, PAUSED and ON HOLD always reflect the current active inventory and ignore the date range.',
  },
  {
    key: 'monthly',
    label: 'CMT BREAKDOWN',
    hint: 'Count by Months of the active inventory — the Task table (not-completed tasks) broken down by creation month and category. Colour banding: the 3 most recent months are green, the 3 months before them are yellow, all earlier months are red. Its grand total matches the INVENTORY row of CMT STATUS and ignores the Date Range Filter.',
  },
]

/* ===========================================================================
 * Props
 * ======================================================================== */

export interface CmtStatusReportSectionProps {
  /** Preferred: normalised active + completed tasks. */
  tasks?: NormalizedTask[]
  /** Preferred: ordered category columns (buildCategoryColumns(...)). */
  columns?: CategoryColumn[]
  /** The active Date Range Filter — applies to the KPI table only. */
  range?: DateRange
  /** Legacy: a precomputed KPI table. */
  kpiTable?: KpiTable
  /** Legacy: a precomputed monthly matrix. */
  monthlyMatrix?: MonthlyMatrix
  loadingKpi?: boolean
  loadingMonthly?: boolean
  /** Human readable active date range, shown in the KPI table header. */
  dateRangeLabel?: string
  /** Shows the OUTPUT TARGET resolution summary under the KPI table. */
  showTargetDiagnostics?: boolean
  /** Sub-tab selected on first render. Defaults to CMT STATUS. */
  defaultTab?: CmtStatusReportTabKey
  /** Controlled mode: the currently active sub-tab. */
  activeTab?: CmtStatusReportTabKey
  /** Controlled mode: called whenever the user picks another sub-tab. */
  onTabChange?: (tab: CmtStatusReportTabKey) => void
  /** Extra classes on the outer wrapper. */
  className?: string
}

/* ===========================================================================
 * Presentation helpers — modern segmented control
 * ======================================================================== */

/** The grey track that holds the two segments. */
const SEGMENT_TRACK_CLASS =
  'inline-flex w-full max-w-xl items-center gap-1 rounded-xl border border-gray-200 bg-gray-100 p-1 shadow-inner sm:w-auto'

const SEGMENT_BASE_CLASS =
  'relative flex-1 select-none rounded-lg px-5 py-2.5 text-center text-[11px] font-bold uppercase tracking-wider transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 sm:min-w-[190px] sm:text-xs'

/** Clear active state: raised white pill + teal label + lime accent bar. */
const SEGMENT_ACTIVE_CLASS =
  'bg-white text-teal-800 shadow-md ring-1 ring-lime-300'

const SEGMENT_INACTIVE_CLASS =
  'bg-transparent text-gray-500 hover:bg-white/60 hover:text-teal-700'

/* ===========================================================================
 * Component
 * ======================================================================== */

export function CmtStatusReportSection({
  tasks,
  columns,
  range,
  kpiTable,
  monthlyMatrix,
  loadingKpi = false,
  loadingMonthly = false,
  dateRangeLabel,
  showTargetDiagnostics = true,
  defaultTab = 'kpi',
  activeTab,
  onTabChange,
  className = '',
}: CmtStatusReportSectionProps) {
  const [internalTab, setInternalTab] =
    React.useState<CmtStatusReportTabKey>(defaultTab)

  /** Controlled when `activeTab` is provided, otherwise self managed. */
  const currentTab: CmtStatusReportTabKey = activeTab ?? internalTab

  const tabRefs = React.useRef<Record<string, HTMLButtonElement | null>>({})

  const selectTab = React.useCallback(
    (tab: CmtStatusReportTabKey) => {
      if (activeTab === undefined) setInternalTab(tab)
      onTabChange?.(tab)
    },
    [activeTab, onTabChange],
  )

  /** ArrowLeft / ArrowRight / Home / End navigation across the segments. */
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = SUB_TABS.findIndex(tab => tab.key === currentTab)
    let nextIndex: number | null = null

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (index + 1) % SUB_TABS.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (index - 1 + SUB_TABS.length) % SUB_TABS.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = SUB_TABS.length - 1
        break
      default:
        return
    }

    event.preventDefault()
    const nextTab = SUB_TABS[nextIndex].key
    selectTab(nextTab)
    tabRefs.current[nextTab]?.focus()
  }

  const activeHint = SUB_TABS.find(tab => tab.key === currentTab)?.hint ?? ''

  return (
    <div className={`flex w-full flex-col ${className}`}>
      {/* ---- modern segmented control (CMT STATUS / CMT BREAKDOWN) -------- */}
      <div className="flex w-full flex-col items-stretch gap-2 sm:items-start">
        <div
          role="tablist"
          aria-label="CMT report tables"
          className={SEGMENT_TRACK_CLASS}
        >
          {SUB_TABS.map(tab => {
            const isActive = tab.key === currentTab
            return (
              <button
                key={tab.key}
                ref={node => {
                  tabRefs.current[tab.key] = node
                }}
                type="button"
                role="tab"
                id={`cmt-report-tab-${tab.key}`}
                aria-selected={isActive}
                aria-controls={`cmt-report-panel-${tab.key}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => selectTab(tab.key)}
                onKeyDown={handleKeyDown}
                className={`${SEGMENT_BASE_CLASS} ${
                  isActive ? SEGMENT_ACTIVE_CLASS : SEGMENT_INACTIVE_CLASS
                }`}
              >
                {tab.label}
                {/* accent bar reinforcing the active state */}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute bottom-1 left-1/2 h-0.5 -translate-x-1/2 rounded-full bg-lime-400 transition-all duration-200 ${
                    isActive ? 'w-8 opacity-100' : 'w-0 opacity-0'
                  }`}
                />
              </button>
            )
          })}
        </div>

        {activeHint ? (
          <p className="px-1 text-[11px] leading-relaxed text-gray-500">
            {activeHint}
          </p>
        ) : null}
      </div>

      {/* ---- only the selected table is rendered, always full width ------ */}
      <div className="mt-3 w-full">
        {currentTab === 'kpi' ? (
          <div
            role="tabpanel"
            id="cmt-report-panel-kpi"
            aria-labelledby="cmt-report-tab-kpi"
            tabIndex={0}
            className="w-full focus:outline-none"
          >
            <KpiSummaryTable
              tasks={tasks}
              columns={columns}
              range={range}
              table={kpiTable}
              loading={loadingKpi}
              dateRangeLabel={dateRangeLabel}
              showTargetDiagnostics={showTargetDiagnostics}
            />
          </div>
        ) : (
          <div
            role="tabpanel"
            id="cmt-report-panel-monthly"
            aria-labelledby="cmt-report-tab-monthly"
            tabIndex={0}
            className="w-full focus:outline-none"
          >
            <MonthlyCategoryTable
              tasks={tasks}
              columns={columns}
              matrix={monthlyMatrix}
              loading={loadingMonthly}
            />
          </div>
        )}
      </div>
    </div>
  )
}

export default CmtStatusReportSection