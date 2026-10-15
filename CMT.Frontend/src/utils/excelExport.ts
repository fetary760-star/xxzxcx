/**
 * Excel export utility for Reports Dashboard.
 *
 * Provides a reusable `exportToExcel` helper that converts any array of
 * plain-object rows into an .xlsx file and triggers a browser download.
 * Multiple sheets can be exported in a single workbook by passing an
 * array of `SheetDefinition` objects to `exportMultiSheetExcel`.
 *
 * =============================================================================
 *  REPORT METRIC FORMULAS (authoritative reference)
 * =============================================================================
 *  The values written into the exported workbook are the SAME values shown on
 *  screen — this utility does not recompute anything. For full definitions,
 *  see the block comments in:
 *    - components/reports/TaskMetricsCards.tsx  (overview KPIs)
 *    - components/reports/EngineerPerformanceTable.tsx  (per-engineer rows)
 *    - components/reports/DelayAnalysis.tsx  (delivery breakdown & delays)
 *
 *  Quick-reference cheat sheet:
 *
 *  Overview sheet
 *    Completion Rate   = completedTasks / totalTasks × 100
 *    On-Time Rate      = onTime / (onTime + early + late) × 100
 *    Avg Delay (days)  = signed mean of (actualDate − targetDate) across
 *                        ALL completed tasks with both dates set
 *    On-Time / Early / Late Tasks — counts classified by delay sign
 *      (delay = 0 → on-time, < 0 → early, > 0 → late)
 *
 *  Engineer Performance sheet
 *    Avg Delay (days)  = per-engineer "Avg Completion"
 *                      = signed mean of delay days over that engineer's
 *                        completed tasks
 *    On-Time Rate      = onTime / completed × 100   (per engineer)
 *    Completion Rate   = completed / totalAssigned × 100   (per engineer)
 *
 *  Delay Breakdown sheet
 *    Delay Days (per row) = actualDate − targetDate in whole days;
 *                           negative values indicate early delivery.
 * =============================================================================
 */

import * as XLSX from 'xlsx'

export interface SheetDefinition {
  /** Worksheet name (max 31 chars — will be truncated if longer) */
  name: string
  /** Array of objects; keys become column headers */
  rows: Array<Record<string, unknown>>
  /** Optional explicit column order; if omitted, keys from first row are used */
  columns?: string[]
}

/**
 * Download a single-sheet Excel file.
 *
 * @param rows        Array of row objects
 * @param filename    Output filename (without extension)
 * @param sheetName   Worksheet name (defaults to "Sheet1")
 * @param columns     Optional explicit column order
 */
export function exportToExcel(
  rows: Array<Record<string, unknown>>,
  filename: string,
  sheetName: string = 'Sheet1',
  columns?: string[]
): void {
  exportMultiSheetExcel([{ name: sheetName, rows, columns }], filename)
}

/**
 * Download a multi-sheet Excel file.
 *
 * @param sheets   Array of `SheetDefinition` objects
 * @param filename Output filename (without extension)
 */
export function exportMultiSheetExcel(
  sheets: SheetDefinition[],
  filename: string
): void {
  const workbook = XLSX.utils.book_new()

  sheets.forEach(({ name, rows, columns }) => {
    const header = columns && columns.length > 0
      ? columns
      : rows.length > 0
        ? Object.keys(rows[0])
        : []

    const worksheet = XLSX.utils.json_to_sheet(rows, { header })

    // Auto-size columns based on header + content length (capped at 40)
    const colWidths = header.map((h) => {
      const maxContent = rows.reduce((max, r) => {
        const v = r[h]
        const len = v === null || v === undefined ? 0 : String(v).length
        return Math.max(max, len)
      }, h.length)
      return { wch: Math.min(Math.max(maxContent + 2, 10), 40) }
    })
    worksheet['!cols'] = colWidths

    const safeName = name.substring(0, 31)
    XLSX.utils.book_append_sheet(workbook, worksheet, safeName)
  })

  const safeFilename = filename.replace(/[^a-z0-9_\-]/gi, '_')
  XLSX.writeFile(workbook, `${safeFilename}.xlsx`)
}

/**
 * Format a number for display (handles null/undefined/NaN).
 *
 * Used for non-percentage metrics such as Avg Delay (days) and per-engineer
 * Avg Completion. Does NOT round the underlying value — rounding is only for
 * the returned display string.
 */
export function formatNumber(
  value: number | null | undefined,
  decimals: number = 2
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return Number(value).toFixed(decimals)
}

/**
 * Format a percentage.
 *
 * Expects the raw number already expressed on a 0–100 scale (e.g. 87.5 means
 * 87.5%), NOT a fraction. Percentage metrics such as Completion Rate,
 * On-Time Rate, Early % and Late % are all passed through unchanged here:
 *
 *   formatPercent(87.5)   → "87.5%"
 *   formatPercent("87.5") → "87.5%"
 *   formatPercent(0)      → "0.0%"
 *
 * Rates are computed upstream as:
 *   Completion Rate = completedTasks / totalTasks × 100
 *   On-Time Rate    = onTime         / totalAnalyzed × 100
 */
export function formatPercent(
  value: number | string | null | undefined,
  decimals: number = 1
): string {
  if (value === null || value === undefined || value === '') return '-'
  const n = typeof value === 'string' ? parseFloat(value) : value
  if (Number.isNaN(n)) return '-'
  return `${n.toFixed(decimals)}%`
}