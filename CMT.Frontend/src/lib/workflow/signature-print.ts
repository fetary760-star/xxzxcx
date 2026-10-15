/**
 * =====================================================================================
 * AMENDED v28 — ITEM 14 / DELIVERABLE 3: THE PRINTED LINE RESOLVER
 * Copy to: CMT.Frontend/src/lib/workflow/signature-print.ts     (REPLACES the v24 file)
 *
 * WHAT v24 ALREADY FIXED (kept in full)
 * -------------------------------------
 *   DEFECT A — the forms never passed `instance` / `formType`.
 *   DEFECT B — a form printing several ONE-ROW blocks (MNT-918) could never resolve a slot;
 *              solved by `slotIndex` pinning.
 *   DEFECT C — executed steps the paper prints no line for vanished (the MNT-1420A clerk
 *              entry and DL sign-off); solved by `supplementalPrintedLines()`.
 *
 * WHAT v28 ADDS — THE MISSING HALF OF REQUIREMENT 14
 * -------------------------------------------------
 * Everything above still derives EVERY printed value from an ALREADY-EXECUTED step. So a form
 * opened by the very person who is supposed to prepare or approve it still prints:
 *
 *     prepared  By: ______________________   Signature: __________   Date: __________
 *                   Shop Team Leader / Engineer
 *
 * v28 threads the LOGGED-IN SIGNER through the resolver, so the line that belongs to him BY
 * ROLE is printed with his name, today's UTC date and his stored specimen, as a PROVISIONAL
 * value (`PrintedSignatureState.SelfFill`) that the server overwrites the instant the step is
 * recorded.
 *
 * THE PRECEDENCE, IN ONE LINE
 *     frozen stamp  >  executed step  >  logged-in signer (provisional)  >  blank hard copy
 *
 * TWO PLACES THE SIGNER IS APPLIED
 *   1. `printedInlineLines()` / `resolvePrintedLines()` — the FULL pipeline, where
 *      `autoFillLegacyRows(..., signer)` performs the fill on the synthesised slots;
 *   2. `printedLinesFromRows()` — the ALREADY-MATCHED path, where the rows must NOT be
 *      matched twice; the fill is therefore applied here, on the resolved slot/row triples,
 *      by `applyProvisionalToTriples()`.
 *
 * FOUR HARD RULES (inherited, unchanged)
 *   (1) NO REACT HERE. Pure projection, reusable by the folder PDF exporter and by tests.
 *   (2) THE SERVER WINS ON FACTS (name / date / hash / state).
 *   (3) THE PRINTED ROLE LINE IS ALWAYS THE MATRIX ROLE TITLE, signed or not.
 *   (4) A MISSING SPECIMEN IS NEVER AN ERROR: the line still prints name + role + date.
 *
 * BACKWARD COMPATIBILITY
 *   `signer` is always the LAST, OPTIONAL parameter. Omitting it reproduces v24 exactly.
 * =====================================================================================
 */

import {
  applyProvisionalFill,
  autoFillLegacyRows,
  buildSignatureRows,
  canFillProvisionally,
  isUsableSigner,
  printedCellValues,
  PrintedSignatureState,
  printedSignatureStateLabel,
  provisionalRowFor,
  rowsForForm,
  type AutoFilledRow,
  type LegacySignatureRowLike,
  type PrintedSignatureRow,
  type ProvisionalSignerLike,
} from '@/lib/workflow/signature-blocks'
import {
  dateCaptionOfSlot,
  formSignatureConfig,
  geometryFor,
  roleCaptionOfSlot,
  signatureCaptionOfSlot,
  SignaturePrintStyle,
  type FormSignatureConfig,
  type SignatureLineGeometry,
  type SignatureSlotDefinition,
} from '@/lib/workflow/signature-matrix'
import type { WorkflowInstanceResponse } from '@/lib/workflow/workflow-types'

/** Re-exported so a form component never has to import the matrix directly. */
export { SignaturePrintStyle }
export type { SignatureLineGeometry, SignatureSlotDefinition, ProvisionalSignerLike }

// =====================================================================================
// 1. A ROW THAT HAS ALREADY BEEN THROUGH THE AUTOMATIC LAYER
// =====================================================================================

/**
 * The shape `FormDocumentChrome.SignatureRow` has after the automatic layer: the printed
 * caption / role the form declares itself, PLUS the matched workflow row and the matrix slot.
 *
 * Every member is OPTIONAL, so a pre-v19 call site that still passes plain rows keeps
 * compiling and simply prints the empty hard-copy rules.
 */
export interface FilledSignatureRowLike extends LegacySignatureRowLike {
  signature?: PrintedSignatureRow | null
  slot?: SignatureSlotDefinition | null
  onNameChange?: (value: string) => void
  onDateChange?: (value: string) => void

  /**
   * The PRINTED POSITION of this line inside the form matrix
   * (`FORM_SIGNATURE_MATRIX[formType][slotIndex]`), 0-based.
   *
   * Supply it whenever the printed block does NOT contain every line of the form:
   *
   *   MNT-1229B  slotIndex 0 -> "prepared  By:"        (Shop Team Leader / Engineer)
   *              slotIndex 1 -> "Approved by:"         (Mgr. Componenet Shop)
   *              slotIndex 2 -> "Approved by:"         (TL. Component Engineering Support)
   *   MNT-918    band 1 -> slotIndex 0 ("RESPONSIBLE DIRECTOR:")
   *              band 2 -> slotIndex 1 ("Manager Quality Assurance:")
   *   MNT-1420A  single printed line -> slotIndex 0 ("Prepared By:")
   *
   * It is ALSO what makes the v28 provisional fill deterministic: the signer's canonical role
   * is checked against `slots[slotIndex].expectedRoles`, so a Manager can never be printed on
   * the "TL. Component Engineering Support" line.
   */
  slotIndex?: number
}

// =====================================================================================
// 2. ONE FULLY RESOLVED PRINTED LINE
// =====================================================================================

export interface PrintedInlineLine<T extends FilledSignatureRowLike = FilledSignatureRowLike> {
  /** Stable react key. */
  key: string
  /** The caller's own row, so the component can still reach its change handlers. */
  source: T
  slot: SignatureSlotDefinition | null
  signature: PrintedSignatureRow | null

  /** VERBATIM paper caption, e.g. "prepared  By:". Matrix wins over the typed label. */
  caption: string
  /** FIXED role title printed UNDER the name rule, e.g. "Mgr. Componenet Shop". */
  roleCaption: string
  /** Inline caption of the specimen cell, e.g. "Signature:". */
  signatureCaption: string
  /** Inline caption of the date cell, e.g. "Date:". */
  dateCaption: string
  /** Printed widths of the four cells of this line. */
  geometry: SignatureLineGeometry

  /** Automatic value: the frozen stamp, else the logged-in signer, else the typed draft. */
  name: string
  /** "YYYY-MM-DD", UTC. */
  date: string

  /** True once a real signature / skip / return exists: the cell must stop being editable. */
  locked: boolean
  tooltip: string
  state: PrintedSignatureState
  stateLabel: string

  /**
   * True for a line the PAPER does not print but the WORKFLOW executed (the MNT-1420A clerk
   * entry / DL sign-off). Never editable, never a typed draft value.
   */
  supplemental: boolean

  /**
   * AMENDED v28 — true when `name` / `date` / the specimen come from the LOGGED-IN USER and
   * the step has not been executed yet. The cell stays editable and the line must be rendered
   * with the discreet "to be signed by you" treatment, never as a recorded approval.
   */
  provisional: boolean
}

function lineKey(caption: string, roleCaption: string, index: number): string {
  return `${caption}|${roleCaption}|${index}`
}

/** The single place a row + slot becomes a printed line. */
function toPrintedLine<T extends FilledSignatureRowLike>(
  row: T,
  slot: SignatureSlotDefinition | null,
  signature: PrintedSignatureRow | null,
  formType: string | null | undefined,
  index: number,
  supplemental = false,
): PrintedInlineLine<T> {
  const cell = printedCellValues(row, signature)

  // RULE: the matrix caption is the paper caption; the typed label is only the fallback.
  const caption = (slot?.caption ?? '').trim() || row.label || ''
  // RULE: the printed role line is ALWAYS the matrix role title.
  const roleCaption =
    roleCaptionOfSlot(slot) || (cell.roleCaption ?? '').trim() || (row.role ?? '').trim()

  return {
    key: lineKey(caption, roleCaption, index),
    source: row,
    slot,
    signature,
    caption,
    roleCaption,
    signatureCaption: signatureCaptionOfSlot(slot),
    dateCaption: dateCaptionOfSlot(slot),
    geometry: geometryFor(formType, slot),
    name: cell.name,
    date: cell.date,
    locked: supplemental ? true : cell.locked,
    tooltip: cell.tooltip,
    state: cell.state ?? PrintedSignatureState.Blank,
    stateLabel: cell.stateLabel || printedSignatureStateLabel(cell.state),
    supplemental,
    provisional: !supplemental && cell.provisional,
  }
}

// =====================================================================================
// 3. SLOT PINNING
// =====================================================================================

function pinnedIndexOf(row: FilledSignatureRowLike): number | null {
  const index = row.slotIndex
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null
  return index
}

/** The matrix slot a row pins itself to, or null when it declares no `slotIndex`. */
function pinnedSlotOf(
  row: FilledSignatureRowLike,
  config: FormSignatureConfig,
): SignatureSlotDefinition | null {
  const index = pinnedIndexOf(row)
  if (index === null) return null
  return config.slots[index] ?? null
}

/**
 * Pushes the pinned slot's `block` and `expectedRoles` onto the row BEFORE matching, so
 * `matchRowsToSlots()` resolves the line on set membership instead of falling back to printed
 * order — and so the v28 provisional fill has a non-empty `expectedRoles` to gate itself on
 * (RULE 5 refuses to fill an ungated line).
 */
function withPinnedExpectations<T extends FilledSignatureRowLike>(
  rows: T[],
  config: FormSignatureConfig,
): T[] {
  return rows.map(row => {
    const pinned = pinnedSlotOf(row, config)
    if (!pinned) return row
    const hasExplicitRoles = Array.isArray(row.expectedRoles) && row.expectedRoles.length > 0
    return {
      ...row,
      block: row.block ?? pinned.block,
      expectedRoles: hasExplicitRoles ? row.expectedRoles : ([...pinned.expectedRoles] as string[]),
    }
  })
}

/** The printed position of a resolved line inside the form matrix, or -1. */
export function slotIndexOfLine(
  line: PrintedInlineLine | null | undefined,
  formType?: string | null,
): number {
  if (!line) return -1
  const pinned = pinnedIndexOf(line.source)
  if (pinned !== null) return pinned
  if (!line.slot) return -1
  return formSignatureConfig(formType).slots.indexOf(line.slot)
}

// =====================================================================================
// 4. THE PROVISIONAL FILL ON ALREADY-RESOLVED TRIPLES   (AMENDED v28)
// =====================================================================================

interface ResolvedTriple<T extends FilledSignatureRowLike> {
  row: T
  slot: SignatureSlotDefinition | null
  signature: PrintedSignatureRow | null
}

/**
 * Applies the logged-in signer to a list of ALREADY-RESOLVED slot/row triples.
 *
 * This is the `printedLinesFromRows()` path: the document ran the matching itself through
 * `useAutoFilledSignatureRows()`, so the rows must NOT be matched a second time (that would
 * discard the signatures). Only the provisional overlay is applied here.
 *
 * RULE 3 — ONE LINE PER SIGNER: the first eligible triple wins, in printed order.
 * Returns a NEW array; the input is never mutated.
 */
function applyProvisionalToTriples<T extends FilledSignatureRowLike>(
  triples: ResolvedTriple<T>[],
  signer?: ProvisionalSignerLike | null,
): ResolvedTriple<T>[] {
  if (!isUsableSigner(signer)) return triples

  const index = triples.findIndex(triple =>
    canFillProvisionally(triple.slot, triple.signature, signer),
  )
  if (index < 0) return triples

  const target = triples[index]
  if (!target.slot) return triples

  const next = [...triples]
  next[index] = {
    ...target,
    signature: provisionalRowFor(target.slot, signer, target.signature),
  }
  return next
}

// =====================================================================================
// 5. THE ENTRY POINTS
// =====================================================================================

/**
 * FULL PIPELINE — legacy rows + the derived workflow rows -> printed lines.
 *
 * `formType` is MANDATORY in practice: it is what unlocks the verbatim captions, the fixed
 * role titles, the expectedRoles disambiguation, the printed geometry AND the provisional
 * fill (which refuses to act on an ungated line).
 */
export function printedInlineLines<T extends FilledSignatureRowLike>(
  legacyRows: T[] | null | undefined,
  autoRows: PrintedSignatureRow[] | null | undefined,
  formType?: string | null,
  signer?: ProvisionalSignerLike | null,
): PrintedInlineLine<AutoFilledRow<T>>[] {
  const list = Array.isArray(legacyRows) ? legacyRows : []
  if (list.length === 0) return []

  const config = formSignatureConfig(formType)
  const prepared = withPinnedExpectations(list, config)
  const filled = autoFillLegacyRows(prepared, autoRows, formType, signer)

  return filled.map((row, index) => {
    // The PINNED slot wins over whatever the positional / block heuristics produced.
    const slot = pinnedSlotOf(row, config) ?? row.slot ?? null
    return toPrintedLine(row, slot, row.signature ?? null, formType, index)
  })
}

/** Convenience: instance -> printed lines, for callers that hold the instance directly. */
export function printedInlineLinesForInstance<T extends FilledSignatureRowLike>(
  legacyRows: T[] | null | undefined,
  instance: WorkflowInstanceResponse | null | undefined,
  formType?: string | null,
  signer?: ProvisionalSignerLike | null,
): PrintedInlineLine<AutoFilledRow<T>>[] {
  return printedInlineLines(legacyRows, buildSignatureRows(instance), formType, signer)
}

/**
 * ALREADY-FILLED ROWS -> printed lines, used when the FORM has already run
 * `useAutoFilledSignatureRows()`. The rows MUST NOT be matched a second time (a second match
 * with `autoRows = null` would silently throw the signatures away).
 *
 * SLOT RESOLUTION ORDER
 *   1. `row.slot`                     — attached by the hook;
 *   2. the PINNED `row.slotIndex`     — deterministic, works for a 1-row block;
 *   3. the positional matrix slot     — ONLY when the form type has an explicit matrix row
 *      AND the number of printed lines matches exactly, otherwise a 3-line block could
 *      inherit the 2-line DEFAULT chain and print "Approved By:" on a "Reviewed By:" line.
 *
 * AMENDED v28: the provisional overlay is applied AFTER the slots are resolved, so a document
 * that pre-filled its rows still shows the logged-in user on his own line.
 */
export function printedLinesFromRows<T extends FilledSignatureRowLike>(
  rows: T[] | null | undefined,
  formType?: string | null,
  signer?: ProvisionalSignerLike | null,
): PrintedInlineLine<T>[] {
  const list = Array.isArray(rows) ? rows : []
  if (list.length === 0) return []

  const config = formSignatureConfig(formType)
  const positionalAllowed = config.fromMatrix && config.slots.length === list.length

  const triples: ResolvedTriple<T>[] = list.map((row, index) => ({
    row,
    slot:
      row.slot ??
      pinnedSlotOf(row, config) ??
      (positionalAllowed ? config.slots[index] ?? null : null),
    signature: row.signature ?? null,
  }))

  return applyProvisionalToTriples(triples, signer).map((triple, index) =>
    toPrintedLine(triple.row, triple.slot, triple.signature, formType, index),
  )
}

/**
 * THE ONE CALL A COMPONENT NEEDS
 *
 *   - `instance` supplied  -> the FULL pipeline runs here: the component no longer has to
 *     remember `useAutoFilledSignatureRows(rows, instance, formType)`;
 *   - `instance` null/undefined -> the rows are printed as they are, and the PROVISIONAL fill
 *     still applies. THIS IS THE IMPORTANT v28 CASE: a brand-new MNT-1229B has no workflow
 *     instance at all, yet the Shop Team Leader who opens it must already see his own name,
 *     today's date and his specimen on the "prepared  By:" line.
 */
export function resolvePrintedLines<T extends FilledSignatureRowLike>(
  rows: T[] | null | undefined,
  instance: WorkflowInstanceResponse | null | undefined,
  formType?: string | null,
  signer?: ProvisionalSignerLike | null,
): PrintedInlineLine<T>[] {
  if (!instance) {
    // No instance: no matching to do, but the pinned slots still have to be attached so the
    // provisional fill can gate itself on `expectedRoles`.
    const config = formSignatureConfig(formType)
    const prepared = withPinnedExpectations(Array.isArray(rows) ? rows : [], config)
    return printedLinesFromRows(prepared, formType, signer)
  }

  // `AutoFilledRow<T>` is `T & { signature, slot }`, so the result is assignable to
  // `PrintedInlineLine<T>`; the cast only hides the intersection from the caller.
  return printedInlineLines(
    rows,
    buildSignatureRows(instance),
    formType,
    signer,
  ) as unknown as PrintedInlineLine<T>[]
}

// =====================================================================================
// 6. SUPPLEMENTAL LINES
// =====================================================================================

const REACHED_STATES: PrintedSignatureState[] = [
  PrintedSignatureState.Signed,
  PrintedSignatureState.Pending,
  PrintedSignatureState.Skipped,
  PrintedSignatureState.Returned,
]

/**
 * The matrix lines that NO declared row claimed AND that the workflow has actually reached.
 *
 * WHY THIS EXISTS
 *   MNT-1420A prints a single "Prepared by:" line, but its routing is
 *   Documentation Team -> DL assigns a clerk -> back to DL for final sign-off. Without this
 *   function the clerk entry and the DL sign-off are executed, stamped and audited server
 *   side and printed NOWHERE. MNT-1420B has the same problem with its STL approval.
 *
 * WHY IT CANNOT CHANGE AN UNSIGNED LAYOUT
 *   A slot is only returned when its row state is Signed / Pending / Skipped / Returned.
 *   `SelfFill` is DELIBERATELY EXCLUDED: a provisional value must never invent a printed line
 *   the paper does not have. On a form whose workflow has not started the function returns an
 *   EMPTY array, so the printed block is byte-identical to the hard copy.
 */
export function supplementalPrintedLines(
  declaredLines: PrintedInlineLine[] | null | undefined,
  formType: string | null | undefined,
  instance: WorkflowInstanceResponse | null | undefined,
): PrintedInlineLine<FilledSignatureRowLike>[] {
  if (!instance) return []

  const config = formSignatureConfig(formType)
  if (!config.fromMatrix || config.slots.length === 0) return []

  const claimed = new Set<number>()
  for (const line of Array.isArray(declaredLines) ? declaredLines : []) {
    const index = slotIndexOfLine(line, formType)
    if (index >= 0) claimed.add(index)
  }

  // NOTE: no signer is passed — supplemental lines are a RECORD of the executed chain only.
  const matrixRows = rowsForForm(formType, instance)
  const out: PrintedInlineLine<FilledSignatureRowLike>[] = []

  config.slots.forEach((slot, index) => {
    if (claimed.has(index)) return
    const row = matrixRows[index] ?? null
    if (!row || !REACHED_STATES.includes(row.state)) return

    const synthetic: FilledSignatureRowLike = {
      label: slot.caption,
      role: roleCaptionOfSlot(slot),
      name: '',
      date: '',
      block: slot.block,
      expectedRoles: [...slot.expectedRoles] as string[],
      slotIndex: index,
      signature: row,
      slot,
    }

    out.push(toPrintedLine(synthetic, slot, row, formType, 1000 + index, true))
  })

  return out
}

// =====================================================================================
// 7. PRINT STYLE AND COUNTERS
// =====================================================================================

/**
 * How the signature block of this form must be PRINTED.
 *   Inline  — every hard copy except the MNT-918 family.
 *   Columns — MNT-918 / MNT-918A only: the paper really does print an explicit
 *             NAME / SIGNATURE / DATE band under "RESPONSIBLE DIRECTOR:".
 */
export function printStyleOf(formType?: string | null): SignaturePrintStyle {
  return formSignatureConfig(formType).style
}

/** True when the form type has a verbatim matrix row (false = the DEFAULT chain was used). */
export function hasVerbatimMatrix(formType?: string | null): boolean {
  return formSignatureConfig(formType).fromMatrix
}

/**
 * Counters for the small footer line under a printed block.
 *
 * AMENDED v28: a PROVISIONAL line is NOT settled (it is not a signature) and is NOT reported
 * as "pending" either (nobody else is being waited for). It is counted separately so a form
 * can print "1 line awaiting your signature" without ever implying an approval.
 */
export function printedLineProgress(
  lines: PrintedInlineLine[] | null | undefined,
): {
  total: number
  settled: number
  pending: PrintedInlineLine | null
  provisional: PrintedInlineLine | null
  provisionalCount: number
} {
  const list = Array.isArray(lines) ? lines : []
  const settled = list.filter(
    line =>
      line.state === PrintedSignatureState.Signed ||
      line.state === PrintedSignatureState.Skipped,
  ).length
  const pending = list.find(line => line.state === PrintedSignatureState.Pending) ?? null
  const provisionalLines = list.filter(line => line.provisional)
  return {
    total: list.length,
    settled,
    pending,
    provisional: provisionalLines[0] ?? null,
    provisionalCount: provisionalLines.length,
  }
}

/**
 * Convenience re-export of the pure fill, so the folder PDF exporter can build the same
 * printed rows without going through React.
 */
export { applyProvisionalFill }