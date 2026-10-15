/**
 * =====================================================================================
 * EXCEL / SPREADSHEET PASTE SUPPORT FOR THE DYNAMIC-ROW FORM TABLES
 * Copy to: CMT.Frontend/src/lib/self-evaluation/useGridPaste.ts
 *
 * THE DEFECT THIS FIXES
 * ---------------------
 * Every controlled document that owns a dynamic table (MNT-1229B "+ Add Tool",
 * MNT-1420A "+ Add SB / SL / SIL Entry", the AD list, ...) renders one <Input> per cell.
 * A browser's DEFAULT paste behaviour is "drop the whole clipboard string into the focused
 * text box", so when an engineer copied a vertical column of 30 part numbers out of Excel
 * and pasted it into the first "Mfg P/N" cell, all 30 values were concatenated into that
 * single cell — the operator then had to re-type every row by hand.
 *
 * WHAT THIS MODULE DOES
 * ---------------------
 *   1. Intercepts the `paste` event on a cell (`event.preventDefault()`), so the browser
 *      never performs its single-cell paste.
 *   2. Parses the clipboard as TSV — the format Excel / Google Sheets / LibreOffice put on
 *      the clipboard: cells separated by TAB, rows separated by newline, with RFC-4180 style
 *      double-quoting for any cell that itself contains a tab, a newline or a quote.
 *   3. Grows the table by calling the SAME row factory the "+ Add Tool" button uses, so the
 *      pasted block is never truncated and the new rows are byte-identical to hand-added ones.
 *   4. Distributes the block VERTICALLY from the cell that received the paste: pasted row 0
 *      lands on the target row, pasted row 1 on the next row, and so on. When the clipboard
 *      also carries several columns, they spill RIGHTWARDS across the declared column order,
 *      which is what a user expects when copying a rectangular Excel range.
 *   5. Re-numbers the visible "Item" / "NO" column through the caller's `renumber` callback,
 *      so the printed sequence stays 1..n exactly as the remove-row handler already does.
 *
 * A one-cell clipboard is deliberately LEFT TO THE BROWSER (no preventDefault), so pasting a
 * single value into the middle of an existing cell keeps its normal caret behaviour.
 * =====================================================================================
 */
'use client'

import { useCallback } from 'react'
import type { ClipboardEvent as ReactClipboardEvent } from 'react'

/** Excel puts one TAB between the cells of a row. */
const CELL_SEPARATOR = '\t'

/**
 * Monotonic suffix for generated row ids.
 *
 * `Date.now()` alone is NOT unique here: a paste of 40 rows creates 40 rows inside the same
 * millisecond, which previously produced duplicate React keys (and duplicate ids, so
 * `updateItem(id, ...)` would have edited several rows at once).
 */
let rowIdSequence = 0

/** Stable, collision-free row id — used by every dynamic-table row factory. */
export function createRowId(prefix: string): string {
  rowIdSequence += 1
  return `${prefix}-${Date.now().toString(36)}-${rowIdSequence.toString(36)}`
}

/**
 * Parse a clipboard payload into a rectangular grid of trimmed strings.
 *
 * Implemented as a small state machine instead of `split('\n').map(l => l.split('\t'))`
 * because Excel quotes any cell that contains a newline (a multi-line "Description", a
 * multi-line "Remark"), and a naive split would tear such a cell into several bogus rows.
 */
export function parseClipboardGrid(raw: string): string[][] {
  if (!raw) return []

  const text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const grid: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          // An escaped quote inside a quoted cell.
          cell += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        cell += char
      }
      continue
    }

    if (char === '"' && cell === '') {
      inQuotes = true
    } else if (char === CELL_SEPARATOR) {
      row.push(cell)
      cell = ''
    } else if (char === '\n') {
      row.push(cell)
      grid.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  row.push(cell)
  grid.push(row)

  // Excel terminates the payload with a newline, which yields one trailing empty row.
  while (grid.length > 0 && grid[grid.length - 1].every(value => value.trim() === '')) {
    grid.pop()
  }

  return grid.map(gridRow => gridRow.map(value => value.trim()))
}

/** True when the clipboard holds more than a single value, i.e. we must take over the paste. */
export function isMultiCellClipboard(grid: string[][]): boolean {
  if (grid.length === 0) return false
  if (grid.length > 1) return true
  return grid[0].length > 1
}

export interface ApplyGridPasteParams<TRow> {
  /** The rows currently held by the form. */
  rows: TRow[]
  /** The parsed clipboard block. */
  grid: string[][]
  /** Zero-based index of the row whose cell received the paste. */
  startRowIndex: number
  /** The editable columns, in the same left-to-right order they are printed. */
  columns: readonly (keyof TRow & string)[]
  /** The column whose cell received the paste. */
  startColumn: keyof TRow & string
  /** The very same factory the "+ Add ..." button uses. `index` is zero-based. */
  createRow: (index: number) => TRow
  /** Optional re-numbering of the visible sequence column (Item / NO). */
  renumber?: (row: TRow, index: number) => TRow
}

export interface ApplyGridPasteResult<TRow> {
  rows: TRow[]
  /** How many rows the "+ Add ..." factory had to create. */
  addedRowCount: number
  /** How many cells actually received a value. */
  filledCellCount: number
}

/**
 * Pure distribution of a clipboard block over a dynamic-row table.
 *
 * Kept pure (no React, no state) so it is trivially testable and so the caller can run it
 * inside a `setState` updater — that way the paste always builds on the freshest rows even
 * when several paste events land in the same React batch.
 */
export function applyGridPaste<TRow>({
  rows,
  grid,
  startRowIndex,
  columns,
  startColumn,
  createRow,
  renumber,
}: ApplyGridPasteParams<TRow>): ApplyGridPasteResult<TRow> {
  const startColumnIndex = columns.indexOf(startColumn)

  if (startColumnIndex < 0 || grid.length === 0 || startRowIndex < 0) {
    return { rows, addedRowCount: 0, filledCellCount: 0 }
  }

  const next = [...rows]
  let addedRowCount = 0

  // (3) Grow the table exactly the way "+ Add Tool" would.
  const requiredLength = startRowIndex + grid.length
  while (next.length < requiredLength) {
    next.push(createRow(next.length))
    addedRowCount += 1
  }

  let filledCellCount = 0

  // (4) Distribute vertically, spilling extra clipboard columns to the right.
  grid.forEach((clipboardRow, offset) => {
    const targetIndex = startRowIndex + offset
    const target = next[targetIndex]
    if (!target) return

    const patch: Record<string, string> = {}

    clipboardRow.forEach((value, columnOffset) => {
      const column = columns[startColumnIndex + columnOffset]
      if (!column) return // The clipboard is wider than the table — ignore the overflow.
      patch[column] = value
      filledCellCount += 1
    })

    if (Object.keys(patch).length > 0) {
      next[targetIndex] = { ...target, ...(patch as Partial<TRow>) }
    }
  })

  // (5) Keep the printed sequence column consistent with the array order.
  const renumbered = renumber ? next.map((row, index) => renumber(row, index)) : next

  return { rows: renumbered, addedRowCount, filledCellCount }
}

export interface GridPasteConfig<TRow> {
  /** The editable columns, in printed left-to-right order. */
  columns: readonly (keyof TRow & string)[]
  /** The row factory shared with the "+ Add ..." button. `index` is zero-based. */
  createRow: (index: number) => TRow
  /** Commit the new rows. Receives an updater so the paste never works on stale state. */
  commit: (updater: (rows: TRow[]) => TRow[]) => void
  /** Optional re-numbering of the visible sequence column. */
  renumber?: (row: TRow, index: number) => TRow
  /** Optional notification, e.g. to surface "12 rows pasted, 9 rows added". */
  onPasted?: (summary: { rowCount: number; addedRowCount: number; filledCellCount: number }) => void
  /** When false the handler is inert (the document is not in edit mode). */
  enabled?: boolean
}

/**
 * Build the `onPaste` handler for the cells of a dynamic-row table.
 *
 * Usage inside a form:
 *
 *   const handleCellPaste = useGridPasteHandler<ToolItem>({
 *     columns: TOOL_COLUMNS,
 *     createRow: index => createItem(index + 1),
 *     renumber: (item, index) => (item.itemNo === index + 1 ? item : { ...item, itemNo: index + 1 }),
 *     commit: updater => setFormData(prev => ({ ...prev, items: updater(prev.items) })),
 *     enabled: isEditing,
 *   })
 *
 *   <Input onPaste={event => handleCellPaste(event, rowIndex, 'requiredMfgPN')} ... />
 */
export function useGridPasteHandler<TRow>({
  columns,
  createRow,
  commit,
  renumber,
  onPasted,
  enabled = true,
}: GridPasteConfig<TRow>) {
  return useCallback(
    (
      event: ReactClipboardEvent<HTMLElement>,
      startRowIndex: number,
      startColumn: keyof TRow & string,
    ) => {
      if (!enabled) return

      const raw =
        event.clipboardData?.getData('text/plain') || event.clipboardData?.getData('text') || ''
      const grid = parseClipboardGrid(raw)

      // A single value keeps the browser's native caret-aware paste.
      if (!isMultiCellClipboard(grid)) return

      // (1) Take the paste over completely.
      event.preventDefault()
      event.stopPropagation()

      let summary = { rowCount: grid.length, addedRowCount: 0, filledCellCount: 0 }

      commit(rows => {
        const result = applyGridPaste<TRow>({
          rows,
          grid,
          startRowIndex,
          columns,
          startColumn,
          createRow,
          renumber,
        })
        summary = {
          rowCount: grid.length,
          addedRowCount: result.addedRowCount,
          filledCellCount: result.filledCellCount,
        }
        return result.rows
      })

      onPasted?.(summary)
    },
    [columns, createRow, commit, renumber, onPasted, enabled],
  )
}