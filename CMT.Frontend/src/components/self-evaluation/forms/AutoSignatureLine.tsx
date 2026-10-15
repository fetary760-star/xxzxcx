/**
 * =====================================================================================
 * AMENDED v28 — ITEM 14 / DELIVERABLE 6: ONE PRINTED SIGNATURE LINE, HARD-COPY GEOMETRY
 * Copy to: CMT.Frontend/src/components/self-evaluation/forms/AutoSignatureLine.tsx
 *          (REPLACES the v24 file)
 *
 * THE LINE THIS COMPONENT IS (verbatim from the attached TNA.png / MNT-1229B)
 * -------------------------------------------------------------------------
 *     prepared  By: ______________________   Signature: __________   Date: __________
 *                   Shop Team Leader / Engineer
 *
 *     Approved by: _______________________   Signature: __________   Date: __________
 *                  Mgr. Componenet Shop
 *
 *     Approved by: _______________________   Signature: __________   Date: __________
 *                  TL. Component Engineering Support
 *
 *   - the CAPTION is verbatim from the paper, typos included ("prepared  By:");
 *   - the NAME sits ON a solid rule;
 *   - the FIXED role title is printed UNDER that rule and NEVER follows the signer;
 *   - "Signature:" and "Date:" are INLINE captions, each with its own short rule;
 *   - there are NO column headers, because the paper has none.
 *
 * WHAT v24 ALREADY FIXED (kept)
 * -----------------------------
 *   DEFECT 1 — `flex-wrap` let the four cells reflow, so the three lines did not line up;
 *              replaced by `flex-nowrap` + `w-max` in a `print:overflow-visible` wrapper.
 *   DEFECT 2 — the role title could push the line pitch around; fixed-height role slot.
 *   DEFECT 3 — a supplemental (workflow-only) line was indistinguishable from a paper line.
 *
 * WHAT v28 ADDS
 * -------------
 * The provisional line of the LOGGED-IN USER. `signature-print.ts` v28 sets
 * `line.provisional` when the printed name / date / specimen come from the current session
 * rather than from an executed step. This component:
 *
 *   - RENDERS THE VALUE. v24 printed `line.name` inside a read-only rule, so the provisional
 *     name already appears; but when the form is in EDIT mode the cell became an <Input> whose
 *     `value` is `line.name`. That is exactly what we want (the user may still correct it), so
 *     the provisional value now flows into the input as its initial value;
 *   - MARKS IT. A dashed rule and a discreet "Auto-filled from your account — recorded on
 *     approval" note, so a provisional preview can never be read as a granted approval;
 *   - KEEPS THE GEOMETRY IDENTICAL. Same four cell widths, same rule height, same role slot,
 *     so the printed sheet and the on-screen sheet stay pixel-comparable.
 *
 * AUTOMATIC BEHAVIOUR
 *   name  -> `line.name`        : frozen `personName` of the executed step, else the session
 *   sig   -> AutoSignatureCell  : specimen image / PDF / cursive name / "Awaiting X"
 *   date  -> `line.date`        : frozen UTC date of the executed step, else today's UTC
 * and both inputs are LOCKED as soon as a REAL signature exists, because a recorded approval
 * must never stay editable even while the form is in edit mode. A PROVISIONAL value is NOT
 * locked: it is a preview of an action the user has not taken yet.
 *
 * ACCESSIBILITY / CONTRAST
 *   Every caption is dark text on a light background. No text is ever printed in the same hue
 *   as its background.
 * =====================================================================================
 */
'use client'

import type { ReactNode } from 'react'

import { Input } from '@/components/ui/input'
import {
  PrintedSignatureState,
  printedSignatureStateClasses,
} from '@/lib/workflow/signature-blocks'
import type { PrintedInlineLine } from '@/lib/workflow/signature-print'
import {
  PRINTED_DATE_CAPTION,
  PRINTED_RULE_HEIGHT,
  PRINTED_SIGNATURE_CAPTION,
  STANDARD_LINE_GEOMETRY,
  type SignatureLineGeometry,
} from '@/lib/workflow/signature-matrix'
import AutoSignatureCell from './AutoSignatureCell'

/** Height of the specimen cell. Slightly taller than the rule so an image fits on it. */
const SPECIMEN_HEIGHT = PRINTED_RULE_HEIGHT + 6

/** Fixed height of the role slot under the name rule, so every line keeps one pitch. */
const ROLE_SLOT_HEIGHT = 13

interface AutoSignatureLineProps {
  /** One fully resolved printed line, from `resolvePrintedLines()`. */
  line: PrintedInlineLine
  /** The form is in edit mode. An unlocked cell with a change handler becomes an input. */
  editable?: boolean
  /** Small state badge next to the caption. OFF by default: the paper has no badge. */
  showState?: boolean
  /**
   * AMENDED v28 — print the discreet "auto-filled from your account" note under a provisional
   * line. ON by default; turn it OFF for a print-exact export.
   */
  showProvisionalNote?: boolean
  /** Extra content printed under the line (remarks, delegation note...). */
  footnote?: ReactNode
}

/** The printed rule of the hard copies: one solid thin line, fixed minimum height. */
function Rule({
  children,
  title,
  className = '',
  provisional = false,
}: {
  children?: ReactNode
  title?: string
  className?: string
  provisional?: boolean
}) {
  const border = provisional ? 'border-dashed border-indigo-400' : 'border-gray-600'
  return (
    <div
      title={title || undefined}
      className={`flex items-end border-b ${border} ${className}`}
      style={{ minHeight: `${PRINTED_RULE_HEIGHT}px` }}
    >
      {children}
    </div>
  )
}

export default function AutoSignatureLine({
  line,
  editable = false,
  showState = false,
  showProvisionalNote = true,
  footnote,
}: AutoSignatureLineProps) {
  const geometry: SignatureLineGeometry = line.geometry ?? STANDARD_LINE_GEOMETRY
  const signatureCaption = line.signatureCaption?.trim() || PRINTED_SIGNATURE_CAPTION
  const dateCaption = line.dateCaption?.trim() || PRINTED_DATE_CAPTION

  const provisional = !!line.provisional

  /**
   * A supplemental line is a RECORD of an executed step, never an input.
   * A LOCKED line carries a recorded outcome and must never stay editable.
   * A PROVISIONAL line stays editable: the user may still correct the auto-filled value
   * before he approves.
   */
  const nameEditable =
    editable && !line.supplemental && !line.locked && !!line.source.onNameChange
  const dateEditable =
    editable && !line.supplemental && !line.locked && !!line.source.onDateChange

  const badgeVisible =
    showState && line.state !== undefined && line.state !== PrintedSignatureState.Blank

  const provisionalInputClass = provisional
    ? 'border-dashed border-indigo-400 text-indigo-900'
    : 'border-gray-600'

  return (
    <div className="px-2 py-2">
      {/*
        `overflow-x-auto` + `w-max` keep the four printed cells at the SAME x positions on
        every line of the block, exactly like the paper table, and never reflow them onto a
        second row. `print:overflow-visible` restores the full width when the form is printed
        or exported to the folder PDF.
      */}
      <div className="overflow-x-auto print:overflow-visible">
        <div className="flex w-max flex-nowrap items-start gap-x-4 text-[11px] text-gray-900 print:w-full">
          {/* ---- 1. the pre-printed caption ----------------------------------------- */}
          <div className={`${geometry.captionWidth} shrink-0 pt-[3px]`}>
            <p
              className="font-semibold text-gray-900 [overflow-wrap:anywhere]"
              title={line.tooltip || undefined}
            >
              {line.caption}
            </p>
            {badgeVisible && (
              <span
                className={`mt-0.5 inline-block rounded border px-1 py-[1px] text-[8px] font-semibold uppercase tracking-wide ${printedSignatureStateClasses(line.state)}`}
              >
                {line.stateLabel}
              </span>
            )}
          </div>

          {/* ---- 2. the name rule + the FIXED role title underneath ----------------- */}
          <div className={`${geometry.nameWidth} shrink-0`}>
            {nameEditable ? (
              <Input
                value={line.name}
                onChange={event => line.source.onNameChange?.(event.target.value)}
                className={`h-[18px] rounded-none border-0 border-b px-0 text-[11px] shadow-none focus-visible:ring-0 ${provisionalInputClass}`}
                aria-label={`${line.caption} name`}
                title={line.tooltip || undefined}
              />
            ) : (
              <Rule title={line.tooltip || undefined} provisional={provisional}>
                <span
                  className={`truncate pb-[1px] font-medium ${
                    provisional ? 'text-indigo-900' : 'text-gray-900'
                  }`}
                >
                  {line.name || ''}
                </span>
              </Rule>
            )}
            <p
              className="mt-0.5 truncate text-[9px] leading-tight text-gray-700"
              style={{ minHeight: `${ROLE_SLOT_HEIGHT}px` }}
              title={line.roleCaption || undefined}
            >
              {line.roleCaption}
            </p>
          </div>

          {/* ---- 3. inline "Signature:" + specimen rule ------------------------------ */}
          <div className="flex shrink-0 items-start gap-1.5">
            <span className="whitespace-nowrap pt-[3px] font-semibold text-gray-900">
              {signatureCaption}
            </span>
            <div className={geometry.signatureWidth}>
              <AutoSignatureCell
                row={line.signature}
                height={SPECIMEN_HEIGHT}
                solidRule
                compact
              />
            </div>
          </div>

          {/* ---- 4. inline "Date:" + date rule -------------------------------------- */}
          <div className="flex shrink-0 items-start gap-1.5">
            <span className="whitespace-nowrap pt-[3px] font-semibold text-gray-900">
              {dateCaption}
            </span>
            <div className={geometry.dateWidth}>
              {dateEditable ? (
                <Input
                  type="date"
                  value={line.date}
                  onChange={event => line.source.onDateChange?.(event.target.value)}
                  className={`h-[18px] rounded-none border-0 border-b px-0 text-[11px] shadow-none focus-visible:ring-0 ${provisionalInputClass}`}
                  aria-label={`${line.caption} date`}
                  title={line.tooltip || undefined}
                />
              ) : (
                <Rule title={line.tooltip || undefined} provisional={provisional}>
                  <span
                    className={`pb-[1px] font-medium ${
                      provisional ? 'text-indigo-900' : 'text-gray-900'
                    }`}
                  >
                    {line.date || ''}
                  </span>
                </Rule>
              )}
            </div>
          </div>
        </div>
      </div>

      {provisional && showProvisionalNote && (
        <p className="mt-0.5 text-[9px] text-indigo-700 print:hidden">
          Auto-filled from your account — it becomes the recorded name, date and signature when
          you approve this form.
        </p>
      )}

      {line.supplemental && (
        <p className="mt-0.5 text-[9px] text-gray-500">
          Recorded by the approval workflow — this step is not pre-printed on the hard copy.
        </p>
      )}

      {footnote && <div className="mt-1">{footnote}</div>}
    </div>
  )
}