/**
 * =====================================================================================
 * AMENDED v30 — ITEM 14 / DELIVERABLE 2: THE SHARED "HARD COPY" CHROME
 *                                        WITH THE SIGNER WIRE RECONNECTED
 * Copy to: CMT.Frontend/src/components/self-evaluation/forms/FormDocumentChrome.tsx
 *          (REPLACES the whole v24 file)
 *
 * WHY THIS FILE IS THE ENTIRE DEFECT
 * ----------------------------------
 * You reported, and you were right:
 *
 *   "The chain matrix -> blocks -> print -> cell/line -> SignatureBlock is internally sound,
 *    but nothing in it ever reads the logged-in user — every printed value depends on an
 *    already-executed workflow step, so 'Prepared By / Approved By' stay blank exactly."
 *
 * v27/v28 already built the missing half:
 *   - `current-signer.ts`   -> `useCurrentSigner()`  produces the logged-in signer;
 *   - `signature-blocks.ts` -> `applyProvisionalFill(slots, rows, signer)`;
 *   - `signature-print.ts`  -> `resolvePrintedLines(rows, instance, formType, signer)`;
 *   - `AutoSignatureLine` / `AutoSignatureCell` -> render `line.provisional`.
 *
 * But the wire was cut at the ONE place every controlled document actually goes through.
 * v24 of this file called:
 *
 *     const declaredLines = resolvePrintedLines(rows, effectiveInstance, formType)   // 3 args
 *
 * `signer` is the 4th, OPTIONAL parameter. It arrived as `undefined`, so
 * `applyProvisionalToTriples()` returned the triples untouched, `isUsableSigner(undefined)`
 * was false, `canFillProvisionally()` was never reached, and EVERY printed line fell back to
 * `PrintedSignatureState.Blank`.
 *
 * TNA (MNT-1229B), MNT-1325, MNT-1420A (SB), MNT-1420B (AD), MNT-918, MNT-918A, the Request
 * Letter, the tools cards, the training forms, the facility forms and the consumables sheets
 * all render their signature block through THIS component — which is why ALL of them were
 * blank, not just one.
 *
 * THE THREE AMENDMENTS OF v30 (everything else is byte-identical to v24)
 * --------------------------------------------------------------------
 * FIX 1 — RECONNECT THE SIGNER.
 *     + const signer = useCurrentSigner()
 *     - resolvePrintedLines(rows, effectiveInstance, formType)
 *     + resolvePrintedLines(rows, effectiveInstance, formType, signer)
 *
 * FIX 2 — PREFETCH THE SIGNER'S OWN SPECIMEN.
 *   `useSignatureSpecimenPrefetch(buildSignatureRows(instance))` only warms the specimens of
 *   users who ALREADY have an executed step. On a brand-new form there are none, so the
 *   logged-in user's name and date appeared but his `Signature:` cell stayed empty — the
 *   second half of the reported symptom. `useSignerSpecimenPrefetch(signer)` streams and
 *   caches HIS specimen before the browser paints his line.
 *
 * FIX 3 — REPORT THE PROVISIONAL LINE HONESTLY IN THE FOOTER.
 *   `printedLineProgress()` (v28) returns `provisional` / `provisionalCount`. A provisional
 *   line is NOT a signature and is NOT "awaiting somebody else", so it gets its own, clearly
 *   non-committal footer sentence. The footer is suppressed entirely when `showProgress` is
 *   false, so a print-exact copy is unaffected.
 *
 * WHAT DELIBERATELY DID **NOT** CHANGE
 * -----------------------------------
 *   - NO form component is edited. `ADForm.tsx`, `SBForm.tsx`,
 *     `ToolNeedAnalysisReportForm.tsx`, `Form918FAA.tsx`, `Form918ACAA.tsx`,
 *     `PeriodicSelfAuditForm.tsx`, `RequestLetterForm.tsx`,
 *     `AlternateToolsEquivalencyForm.tsx`, `InhouseManufacturedToolsForm.tsx` and
 *     `TableOfContentForm.tsx` keep their current JSX, their current `rows={[...]}` arrays and
 *     their current `slotIndex` values. They become automatic because the component they all
 *     render now resolves the session itself.
 *   - The printed GEOMETRY is untouched: same borders, same widths, same captions, same order.
 *     A provisional line is styled by `AutoSignatureLine` / `AutoSignatureCell`, not here.
 *   - `DocumentHeader`, `DocumentFieldGrid`, `CheckCell`, `InstructionList`, `FormToolbar` and
 *     `FormWorkflowFooter` are unchanged from v24.
 *
 * PRECEDENCE, IN ONE LINE (enforced by `signature-blocks.ts`, not by this component)
 *     frozen stamp  >  executed step  >  logged-in signer (provisional)  >  blank hard copy
 *
 * A provisional value is a PREVIEW: `isSigned` stays false, the cell stays editable, and the
 * frozen server stamp overwrites it the instant the step is recorded.
 *
 * HOW A FORM ADOPTS IT (two props, no layout edit anywhere)
 * -------------------------------------------------------
 *     const { instance, reload } = useFormWorkflowInstance({
 *       formSubmissionId,
 *       folderId: selectedATARecord?.evaluationFolderId,
 *     })
 *
 *     <SignatureBlock
 *       editable={isEditing}
 *       formType={FORM_TYPE}   // REQUIRED: unlocks captions + role titles + expectedRoles
 *       instance={instance}    // unlocks the recorded stamps; may be null on a new draft
 *       statement={CONFIRMATION_STATEMENT}
 *       rows={[
 *         { slotIndex: 0, label: 'prepared  By:', role: APPROVER_TITLES.tnaPreparedBy, ... },
 *         { slotIndex: 1, label: 'Approved by:',  role: APPROVER_TITLES.tnaApprovedByManager, ... },
 *         { slotIndex: 2, label: 'Approved by:',  role: APPROVER_TITLES.tnaApprovedByEngineering, ... },
 *       ]}
 *     />
 *
 * and `onStatusChange={() => { void loadFromBackend(); void reload() }}` on the footer, so an
 * approval repaints the signatures immediately.
 *
 * IF A LINE IS STILL BLANK — THE 4 CHECKS, IN ORDER
 *   1. `formType` is missing on the `SignatureBlock` call. Without it the matrix key cannot be
 *      resolved, `expectedRoles` is empty, and RULE 5 forbids filling an ungated line. This is
 *      by far the most common cause.
 *   2. The session carries no usable role: log `useCurrentSigner()`; if `canonicalRole` is
 *      null, add the exact persisted string to `HOST_ROLE_ALIASES` in `current-signer.ts`.
 *   3. The user's role is not in that line's `expectedRoles` — correct behaviour.
 *   4. The line is already Signed / Skipped / Returned — correct behaviour: a recorded outcome
 *      is never overwritten by a preview.
 * =====================================================================================
 */
'use client'

import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Edit, Loader2, Lock, Save, Send } from 'lucide-react'
import {
  ApprovalStatus,
  getApprovalStatusColor,
  getApprovalStatusLabel,
} from '@/lib/self-evaluation/types'
import type { FormNodeType } from '@/lib/self-evaluation/types'
import type { PrintedSignatureRow } from '@/lib/workflow/signature-blocks'
import type { SignatureSlotDefinition } from '@/lib/workflow/signature-matrix'
import {
  printedLineProgress,
  printStyleOf,
  resolvePrintedLines,
  SignaturePrintStyle,
  supplementalPrintedLines,
} from '@/lib/workflow/signature-print'
import {
  useSignatureSpecimenPrefetch,
  useSignerSpecimenPrefetch,
} from '@/lib/workflow/useFormSignatureRows'
import { buildSignatureRows } from '@/lib/workflow/signature-blocks'
// AMENDED v30 (FIX 1) — the one import that was missing from this file.
import { useCurrentSigner } from '@/lib/workflow/current-signer'
import type { WorkflowInstanceResponse } from '@/lib/workflow/workflow-types'
import ApprovalWorkflowActions from '../ApprovalWorkflowActions'
import FileUploadPanel from '../FileUploadPanel'
import AutoSignatureCell from './AutoSignatureCell'
import AutoSignatureLine from './AutoSignatureLine'

// ===========================================================================
// Title bar   (unchanged since v19)
// ===========================================================================

export interface DocumentMetaLine {
  label: string
  value: string
}

interface DocumentHeaderProps {
  /** Organisation line printed above the title, e.g. "ETHIOPIAN MRO". */
  organisation?: string
  title: string
  /** Second title line, e.g. "COMPONENT CAPABILITY DEVELOPMENT". */
  subtitle?: string
  meta: DocumentMetaLine[]
}

/** Bordered title bar: centred title on the left, controlled-document meta on the right. */
export function DocumentHeader({ organisation, title, subtitle, meta }: DocumentHeaderProps) {
  return (
    <div className="border border-gray-400">
      <div className="flex flex-col sm:flex-row">
        <div className="flex-1 px-3 py-2 text-center border-b sm:border-b-0 sm:border-r border-gray-400">
          {organisation && (
            <p className="text-[11px] font-semibold tracking-wide text-gray-700">{organisation}</p>
          )}
          <h3 className="text-sm font-bold uppercase leading-snug text-gray-900">{title}</h3>
          {subtitle && (
            <p className="text-[11px] font-medium uppercase text-gray-600 mt-0.5">{subtitle}</p>
          )}
        </div>
        <div className="sm:w-64 divide-y divide-gray-400">
          {meta.map(line => (
            <div key={`${line.label}-${line.value}`} className="flex px-2 py-1 text-[11px]">
              <span className="text-gray-600 whitespace-nowrap">{line.label}</span>
              <span className="ml-1 font-semibold text-gray-900 break-words">{line.value || '—'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
// Identity block (auto-populated from the ATA Record)   (unchanged since v19)
// ===========================================================================

export interface DocumentField {
  label: string
  value: string
  /** Grid columns to span, defaults to 1. */
  span?: 1 | 2 | 3 | 4
}

interface DocumentFieldGridProps {
  fields: DocumentField[]
  /** Columns on large screens, defaults to 4. */
  columns?: 2 | 3 | 4
  /** Show the "auto-populated from the ATA Record" hint. */
  autoFilled?: boolean
}

const SPAN_CLASS: Record<number, string> = {
  1: '',
  2: 'sm:col-span-2',
  3: 'sm:col-span-2 lg:col-span-3',
  4: 'sm:col-span-2 lg:col-span-4',
}

const COLUMN_CLASS: Record<number, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
}

/** Bordered, read-only identity grid. Values always come from the ATA Record. */
export function DocumentFieldGrid({ fields, columns = 4, autoFilled = false }: DocumentFieldGridProps) {
  return (
    <div className="border border-gray-400 border-t-0">
      <div className={`grid ${COLUMN_CLASS[columns]}`}>
        {fields.map(field => (
          <div
            key={field.label}
            className={`px-2 py-1.5 border-b border-r border-gray-300 last:border-r-0 ${SPAN_CLASS[field.span ?? 1]}`}
          >
            <p className="text-[9px] font-medium uppercase tracking-wide text-gray-500">{field.label}</p>
            <p className="text-xs font-semibold text-gray-900 break-words">{field.value || '—'}</p>
          </div>
        ))}
      </div>
      {autoFilled && (
        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 text-[10px] text-gray-500">
          <Lock className="h-3 w-3" />
          Auto-populated from the ATA Record — edit the ATA Record to change these values.
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// Check cells ("x" / "√" boxes of the printed forms)   (unchanged since v19)
// ===========================================================================

interface CheckCellProps {
  checked: boolean
  onChange?: (checked: boolean) => void
  disabled?: boolean
  /** Printed mark, "x" on MNT 918, "√" on MNT-1325. */
  mark?: 'x' | '√'
  ariaLabel?: string
}

/** A single tick box. Renders the printed mark when read-only. */
export function CheckCell({ checked, onChange, disabled = true, mark = 'x', ariaLabel }: CheckCellProps) {
  if (disabled || !onChange) {
    return (
      <span
        aria-label={ariaLabel}
        className="inline-flex h-4 w-4 items-center justify-center border border-gray-500 text-[11px] font-bold leading-none text-gray-900"
      >
        {checked ? mark : ''}
      </span>
    )
  }
  return (
    <Checkbox
      aria-label={ariaLabel}
      checked={checked}
      onCheckedChange={value => onChange(!!value)}
      className="h-4 w-4"
    />
  )
}

// ===========================================================================
// Signature block   (AMENDED v30 — the PAPER geometry, now session-aware)
// ===========================================================================

export interface SignatureRow {
  /** Left caption, verbatim from the hard copy, e.g. "prepared  By:". */
  label: string
  /** Printed role underneath the name rule, e.g. "Shop Team Leader / Engineer". */
  role: string
  name: string
  date: string
  onNameChange?: (value: string) => void
  onDateChange?: (value: string) => void

  /**
   * The PRINTED POSITION of this line inside the form matrix
   * (`FORM_SIGNATURE_MATRIX[formType]`), 0-based.
   *
   * ALWAYS supply it. It is what makes the automatic layer deterministic:
   *   - MNT-1229B prints "Approved by:" TWICE — slotIndex 1 is the Manager line,
   *     slotIndex 2 is the "TL. Component Engineering Support" line, so a Manager approval
   *     can never be printed on the TL line;
   *   - MNT-918 renders TWO separate 1-row blocks — slotIndex 0 is
   *     "RESPONSIBLE DIRECTOR:", slotIndex 1 is "Manager Quality Assurance:".
   *
   * AMENDED v30: it is ALSO what gates the provisional fill. `withPinnedExpectations()` in
   * `signature-print.ts` copies `slots[slotIndex].expectedRoles` onto the row, and RULE 5 of
   * `signature-blocks.ts` refuses to fill a line with no `expectedRoles`. A row with no
   * `slotIndex` and no matrix match therefore stays blank BY DESIGN.
   */
  slotIndex?: number

  /**
   * OPTIONAL explicit signature block, for a printed caption that is a JOB TITLE
   * ("RESPONSIBLE DIRECTOR:") and therefore not resolvable from the caption text.
   * Redundant once `slotIndex` is supplied.
   */
  block?: PrintedSignatureRow['block']
  /** OPTIONAL per-row canonical role hint. Redundant once `slotIndex` is supplied. */
  expectedRoles?: string[]

  /**
   * The executed step behind this printed caption. Normally left undefined: the block
   * resolves it itself from `instance`. It is only populated when the document already ran
   * `useAutoFilledSignatureRows(rows, instance, formType)`, in which case the block detects
   * it and does NOT match a second time.
   */
  signature?: PrintedSignatureRow | null
  /** The matrix slot behind the printed line, when the document resolved it itself. */
  slot?: SignatureSlotDefinition | null
}

interface SignatureBlockProps {
  rows: SignatureRow[]
  editable: boolean
  /** Statement printed above the signatures, verbatim from the hard copy. */
  statement?: ReactNode
  /**
   * The persisted FormSubmission.FormType ('tna', '918_faa', 'sb', ...).
   * Supplying it unlocks the verbatim captions, the fixed role titles, the printed geometry
   * AND the automatic name / date / signature (the matrix is what declares which role owns
   * which printed line). Omitted -> the block prints the captions the form declares and NO
   * provisional fill happens at all.
   */
  formType?: string | null
  /**
   * The workflow instance of THIS form, from
   * `useFormWorkflowInstance({ formSubmissionId, folderId })`.
   *
   * Null / undefined is FULLY SUPPORTED and is the important v30 case: a brand-new MNT-1229B
   * has no workflow instance at all, yet the Shop Team Leader who opens it must already see
   * his own name, today's UTC date and his specimen on the "prepared  By:" line.
   */
  instance?: WorkflowInstanceResponse | null
  /**
   * Also print the executed steps the PAPER has no line for (the MNT-1420A clerk entry and DL
   * sign-off, the MNT-1420B approval). Only steps the workflow has actually REACHED are
   * appended — `SelfFill` is excluded by `supplementalPrintedLines()` — so an unsigned form
   * stays byte-identical to the hard copy. Default: true.
   */
  includeWorkflowSteps?: boolean
  /** Small state badge next to each caption. OFF by default: the paper has no badge. */
  showState?: boolean
  /** Footer line with the outstanding signature. ON by default, OFF for a print-exact copy. */
  showProgress?: boolean
  /**
   * AMENDED v30 — set to `false` for a PRINT-EXACT / EXPORT rendering, where only RECORDED
   * signatures may appear and a preview of the current user's own line must not.
   * The folder PDF exporter passes `false`; every interactive screen leaves it `true`.
   */
  autoFillFromSession?: boolean
}

/**
 * The printed "Prepared by / Approved by" block.
 *
 *   Inline  (every hard copy except MNT-918/918A) — one paper line per signatory:
 *       prepared  By: ____________  Signature: ______  Date: ______
 *                     Shop Team Leader / Engineer
 *
 *   Columns (MNT-918 / MNT-918A only) — the labelled NAME / SIGNATURE / DATE band that IS
 *       printed on those two originals.
 */
export function SignatureBlock({
  rows,
  editable,
  statement,
  formType,
  instance,
  includeWorkflowSteps = true,
  showState = false,
  showProgress = true,
  autoFillFromSession = true,
}: SignatureBlockProps) {
  /**
   * AMENDED v30 (FIX 1) — THE LINE THAT FIXES THE REPORTED DEFECT.
   *
   * `useCurrentSigner()` is called UNCONDITIONALLY (React hook rules); the opt-out is applied
   * to the RESULT, not to the call, so the number of hooks never changes between renders.
   */
  const sessionSigner = useCurrentSigner()
  const signer = autoFillFromSession ? sessionSigner : null

  /**
   * A document that already ran `useAutoFilledSignatureRows()` delivers rows carrying
   * `signature`. Matching them again would be harmless but wasteful, so the instance is only
   * used when NO row has been pre-filled. The provisional overlay is applied on BOTH paths
   * (`printedLinesFromRows` -> `applyProvisionalToTriples`, `printedInlineLines` ->
   * `autoFillLegacyRows`), so a pre-filled document is automatic too.
   */
  const preFilled = rows.some(row => row.signature !== undefined)
  const effectiveInstance = preFilled ? null : instance ?? null

  // AMENDED v30: `signer` is the 4th argument. v24 stopped at 3 — that single omission is why
  // every "Prepared By / Approved By" line printed blank on every controlled document.
  const declaredLines = resolvePrintedLines(rows, effectiveInstance, formType, signer)
  const extraLines = includeWorkflowSteps
    ? supplementalPrintedLines(declaredLines, formType, instance ?? null)
    : []

  const style = printStyleOf(formType)
  const printedLines = [...declaredLines, ...extraLines]
  const progress = printedLineProgress(printedLines)

  // Warms the shared per-user specimen cache of `signature-render.ts` for the RECORDED
  // signers, so a folder PDF preview with 11 forms fetches each specimen ONCE.
  useSignatureSpecimenPrefetch(buildSignatureRows(instance ?? null), !!instance)

  // AMENDED v30 (FIX 2) — the LOGGED-IN user's own specimen. Without this his line printed his
  // name and date but an empty `Signature:` cell on a brand-new form, because he has no
  // executed step yet and therefore appears in no workflow row.
  useSignerSpecimenPrefetch(signer, autoFillFromSession)

  return (
    <div className="border border-gray-400 border-t-0">
      {statement && (
        <div className="px-2 py-2 text-[11px] leading-relaxed text-gray-800 border-b border-gray-300">
          {statement}
        </div>
      )}

      {style === SignaturePrintStyle.Columns ? (
        <div className="divide-y divide-gray-300">
          {/* The MNT-918 family prints these headers on the paper. */}
          <div className="grid grid-cols-1 gap-2 bg-gray-50 px-2 py-1 md:grid-cols-12">
            <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-600 md:col-span-4">
              Position
            </p>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-600 md:col-span-3">
              Name
            </p>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-600 md:col-span-3">
              Signature
            </p>
            <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-600 md:col-span-2">
              Date
            </p>
          </div>

          {printedLines.map(line => {
            const nameEditable =
              editable && !line.supplemental && !line.locked && !!line.source.onNameChange
            const dateEditable =
              editable && !line.supplemental && !line.locked && !!line.source.onDateChange

            return (
              <div key={line.key} className="grid grid-cols-1 gap-2 px-2 py-2 md:grid-cols-12">
                <div className="min-w-0 md:col-span-4">
                  <p
                    className="text-[11px] font-semibold text-gray-900 [overflow-wrap:anywhere]"
                    title={line.tooltip || undefined}
                  >
                    {line.caption}
                  </p>
                  <p className="text-[9px] uppercase text-gray-600 [overflow-wrap:anywhere]">
                    {line.roleCaption}
                  </p>
                </div>

                <div className="min-w-0 md:col-span-3">
                  {nameEditable ? (
                    <Input
                      value={line.name}
                      onChange={event => line.source.onNameChange?.(event.target.value)}
                      className="h-8 text-xs"
                      aria-label={`${line.caption} name`}
                    />
                  ) : (
                    <p
                      className={`min-h-[20px] break-words border-b text-xs font-medium [overflow-wrap:anywhere] ${
                        line.provisional
                          ? 'border-dashed border-indigo-400 text-indigo-900'
                          : 'border-gray-600 text-gray-900'
                      }`}
                      title={line.tooltip || undefined}
                    >
                      {line.name || ''}
                    </p>
                  )}
                </div>

                <div className="min-w-0 md:col-span-3">
                  <AutoSignatureCell row={line.signature} height={24} solidRule compact />
                </div>

                <div className="min-w-0 md:col-span-2">
                  {dateEditable ? (
                    <Input
                      type="date"
                      value={line.date}
                      onChange={event => line.source.onDateChange?.(event.target.value)}
                      className="h-8 text-xs"
                      aria-label={`${line.caption} date`}
                    />
                  ) : (
                    <p
                      className={`min-h-[20px] border-b text-xs font-medium ${
                        line.provisional
                          ? 'border-dashed border-indigo-400 text-indigo-900'
                          : 'border-gray-600 text-gray-900'
                      }`}
                      title={line.tooltip || undefined}
                    >
                      {line.date || ''}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="divide-y divide-gray-200">
          {printedLines.map(line => (
            <AutoSignatureLine
              key={line.key}
              line={line}
              editable={editable}
              showState={showState}
              footnote={
                line.signature?.comments ? (
                  <p className="text-[9px] text-gray-600 [overflow-wrap:anywhere]">
                    Remarks: {line.signature.comments}
                  </p>
                ) : null
              }
            />
          ))}
        </div>
      )}

      {showProgress && progress.total > 0 && (progress.pending || progress.provisional) && (
        <div className="border-t border-gray-300 bg-gray-50 px-2 py-1 text-[10px] text-gray-600">
          {progress.pending && (
            <span>
              {progress.settled} of {progress.total} signatures recorded —{' '}
              {progress.pending.caption} awaiting{' '}
              {progress.pending.signature?.awaitingName ||
                progress.pending.signature?.awaitingUnit ||
                progress.pending.roleCaption ||
                'signature'}
            </span>
          )}

          {/*
            AMENDED v30 (FIX 3) — a provisional line is NOT a signature and is NOT "awaiting
            somebody else". It gets its own, deliberately non-committal sentence so the footer
            can never read as though an approval had already been granted.
          */}
          {progress.provisional && (
            <span className={progress.pending ? 'ml-1 text-indigo-800' : 'text-indigo-800'}>
              {progress.pending ? '· ' : ''}
              {progress.provisional.caption} is pre-filled from your account — it is recorded
              only when you approve this form.
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ===========================================================================
// Numbered instruction list (MNT 918 / MNT 918A footer)   (unchanged since v19)
// ===========================================================================

interface InstructionListProps {
  heading: string
  intro?: string
  items: string[]
}

export function InstructionList({ heading, intro, items }: InstructionListProps) {
  return (
    <div className="border border-gray-400 border-t-0 px-2 py-2">
      <p className="text-[11px] font-semibold text-gray-800">{heading}</p>
      {intro && <p className="text-[11px] text-gray-700">{intro}</p>}
      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-[11px] text-gray-700">
        {items.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </div>
  )
}

// ===========================================================================
// Toolbar (status badge + Edit / Cancel / Save)   (unchanged since v19)
// ===========================================================================

interface FormToolbarProps {
  title: string
  meta?: string
  approvalStatus: ApprovalStatus
  canEdit: boolean
  showEditButton?: boolean
  isEditing: boolean
  saving: boolean
  onEdit: () => void
  onCancel: () => void
  onSave: () => void
}

export function FormToolbar({
  approvalStatus,
  canEdit,
  showEditButton = true,
  isEditing,
  saving,
  onEdit,
  onCancel,
  onSave,
}: FormToolbarProps) {
  return (
    <div className="flex flex-wrap items-start justify-end gap-3">
      <div className="flex items-center gap-2">
        <Badge className={getApprovalStatusColor(approvalStatus)}>
          {getApprovalStatusLabel(approvalStatus)}
        </Badge>
        {showEditButton && (canEdit || approvalStatus === ApprovalStatus.Rejected) && !isEditing && (
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Edit className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
        )}
        {isEditing && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={onSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1" />
              )}
              Save
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ===========================================================================
// Workflow footer (approval actions + attachments + submit)
// ===========================================================================

interface FormWorkflowFooterProps {
  formSubmissionId: string | null
  approvalStatus: ApprovalStatus
  ataRecordId: string
  formNodeType: FormNodeType
  canEdit: boolean
  canUpload?: boolean
  showWorkflowActions?: boolean
  hideSubmitButton?: boolean
  canSubmit: boolean
  saving: boolean
  onSubmit: () => void
  onEdit?: () => void
  /**
   * MUST also call `reload()` of `useFormWorkflowInstance`, otherwise an approval will not
   * repaint the signature block until the screen is remounted:
   *
   *     onStatusChange={() => { void loadFromBackend(); void reload() }}
   */
  onStatusChange?: () => void
  /**
   * MNT-1229B: the resolved workflow instance of THIS form. Forwarded to the action bar so
   * Approve / Reject / Return / Delegate follow the SERVER's canIAct / canIDelegate flags of
   * the currently responsible step — a viewer who is not that role sees no action buttons,
   * while every completed approval / signature stays visible through the signature block.
   */
  workflowInstance?: WorkflowInstanceResponse | null
}

const ASSIGNMENT_WORKFLOW_FORM_TYPES: ReadonlySet<FormNodeType> = new Set([
  'training_verification_inspection',
  'training_verification_technician',
  'inspector_proficiency',
  'competency_assessment',
])

export function FormWorkflowFooter({
  formSubmissionId,
  approvalStatus,
  ataRecordId,
  formNodeType,
  canEdit,
  canSubmit,
  saving,
  onSubmit,
  onEdit,
  onStatusChange,
  canUpload,
  showWorkflowActions = true,
  hideSubmitButton = false,
  workflowInstance,
}: FormWorkflowFooterProps) {
  /**
   * The guard that produces the reported
    *   "Cannot submit. Form must be in Draft, Returned, or Rejected status."
    * on the SECOND and THIRD click. It is correct and stays: only Draft / Returned / Rejected may be
    * submitted. The DUPLICATE-REQUEST half of that defect is solved one layer down, in
   * `src/app/api/self-evaluation/[...path]/route.ts` (v30), which collapses identical submits
   * fired within the same instant into a single backend call.
   */
  const submittable =
    canSubmit &&
    (approvalStatus === ApprovalStatus.Draft || approvalStatus === ApprovalStatus.Returned)
  const usesAssignmentWorkflow = ASSIGNMENT_WORKFLOW_FORM_TYPES.has(formNodeType)

  return (
    <div className="space-y-4">
      {ataRecordId && (
        <FileUploadPanel
          ataRecordId={ataRecordId}
          formSubmissionId={formSubmissionId || undefined}
          formNodeType={formNodeType}
          canUpload={canUpload ?? canEdit}
          canApproveFiles={false}
        />
      )}

      {submittable && !formSubmissionId && !hideSubmitButton && (
        <div className="flex justify-end pt-1">
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            size="sm"
            onClick={onSubmit}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1" />
            )}
            Submit for Approval
          </Button>
        </div>
      )}

      {!formSubmissionId && !submittable && (approvalStatus === ApprovalStatus.Draft || approvalStatus === ApprovalStatus.Returned) && (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Complete and approve the required preceding workflow stages before submitting this form.
        </p>
      )}

      {formSubmissionId && showWorkflowActions && !usesAssignmentWorkflow && (
        <ApprovalWorkflowActions
          entityType="form"
          entityId={formSubmissionId}
          currentStatus={approvalStatus}
          onStatusChange={() => onStatusChange?.()}
          onEdit={onEdit}
          workflowInstance={workflowInstance}
        />
      )}
    </div>
  )
}