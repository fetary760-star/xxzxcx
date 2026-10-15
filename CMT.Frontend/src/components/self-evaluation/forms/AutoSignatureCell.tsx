/**
 * =====================================================================================
 * AMENDED v28 — ITEM 14 / DELIVERABLE 5: THE PRINTED SIGNATURE CELL
 * Copy to: CMT.Frontend/src/components/self-evaluation/forms/AutoSignatureCell.tsx
 *          (REPLACES the v23 file)
 *
 * WHAT THIS FILE IS
 * -----------------
 * ONE printed "Signature" cell of a controlled document, in the exact geometry of the hard
 * copy. It replaces the empty rule the v18 chrome printed for EVERY row.
 *
 * SIX RENDER MODES — the geometry is IDENTICAL in all six, so no layout ever shifts
 *   1. Signed + image specimen   -> <img> inside the SAME rule
 *   2. Signed + PDF specimen     -> <object> at the same height, text fallback inside
 *   3. Signed, no specimen yet   -> typed cursive name + "specimen not uploaded" tooltip
 *   4. Pending                   -> "Awaiting <person|unit|role>" in amber, not an error
 *   5. Blank / skipped / returned -> the printed rule (skipped / returned add a caption)
 *   6. AMENDED v28 — SELF-FILL   -> the LOGGED-IN USER's own specimen (or his cursive name),
 *                                   printed provisionally on his own line
 *
 * WHY MODE 6 EXISTS
 * -----------------
 * v23 kept the specimen hook idle unless `row.isSigned`:
 *
 *      const enabled = !!row && row.isSigned && !!row.userId
 *
 * A provisional row is by definition NOT signed, so even after `signature-blocks.ts` v28
 * started printing the logged-in user's name and date, this cell would still have rendered an
 * EMPTY rule next to it. That is literally the reported "signature not displayed". Mode 6
 * enables the same authorised, credential-free specimen stream for a provisional row, and
 * marks it visually as provisional (dashed rule + "to be signed" caption) so it can never be
 * mistaken for a recorded approval.
 *
 * HARD RULES (unchanged)
 *   (1) A MISSING SPECIMEN IS NEVER AN ERROR. Modes 3 and 6b are first-class, valid prints.
 *   (2) THE RAW STORAGE PATH IS NEVER RENDERED. `src` is always the short-lived object URL
 *       produced by `signature-render.ts` from the authorised streaming endpoint.
 *   (3) NO TEXT-ON-SAME-COLOUR. Every caption is dark text on a light background.
 *   (4) A PROVISIONAL SPECIMEN CARRIES NO INTEGRITY TRACE. `signatureHash` is empty until the
 *       server stamps the step, so the `Trace` marker is never printed in mode 6.
 * =====================================================================================
 */
'use client'

import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

import { useSignatureImage } from '@/lib/workflow/signature-render'
import {
  PrintedSignatureState,
  type PrintedSignatureRow,
} from '@/lib/workflow/signature-blocks'

interface AutoSignatureCellProps {
  /** Null when the form prints a caption nothing owns. */
  row?: PrintedSignatureRow | null
  /** Height of the specimen. The printed forms use ~24-28px; keep it consistent. */
  height?: number
  /** Hide the small trace / status caption under the rule (used in dense inline lines). */
  compact?: boolean
  /**
   * Print the SOLID rule of the hard copies instead of the dotted web rule.
   * Used by `AutoSignatureLine`; every legacy call site keeps the dotted rule.
   */
  solidRule?: boolean
}

/** The printed rule. Every mode renders inside this exact shell. */
function Rule({
  children,
  height,
  title,
  solid,
  provisional = false,
}: {
  children?: ReactNode
  height: number
  title?: string
  solid: boolean
  /** A provisional value is printed on a dashed rule, so paper and preview never look alike. */
  provisional?: boolean
}) {
  const border = provisional
    ? 'border-dashed border-indigo-400'
    : solid
      ? 'border-gray-600'
      : 'border-dotted border-gray-400'

  return (
    <div
      title={title || undefined}
      className={`flex items-end border-b ${border}`}
      style={{ minHeight: `${height}px` }}
    >
      {children}
    </div>
  )
}

export default function AutoSignatureCell({
  row,
  height = 28,
  compact = false,
  solidRule = false,
}: AutoSignatureCellProps) {
  const provisional = !!row?.isProvisional

  /**
   * AMENDED v28 — the specimen is resolved for a SIGNED row (the legal record) AND for a
   * PROVISIONAL row (the logged-in user's own line). Everything else keeps the hook idle.
   */
  const enabled = !!row && (row.isSigned || provisional) && !!row.userId
  const { signature, loading } = useSignatureImage(row?.userId ?? null, enabled)

  // ---- Mode 5a: nothing owns this caption -> the empty printed rule -------------------
  if (!row) return <Rule height={height} solid={solidRule} />

  // ---- Mode 5b: skipped --------------------------------------------------------------
  if (row.state === PrintedSignatureState.Skipped) {
    return (
      <div>
        <Rule height={height} solid={solidRule} title={row.skipReason || 'Step skipped'}>
          <span className="pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-900">
            Skipped
          </span>
        </Rule>
        {!compact && row.skipReason && (
          <p className="mt-0.5 truncate text-[9px] text-gray-500" title={row.skipReason}>
            {row.skipReason}
          </p>
        )}
      </div>
    )
  }

  // ---- Mode 5c: returned / rejected at this step --------------------------------------
  if (row.state === PrintedSignatureState.Returned) {
    return (
      <div>
        <Rule
          height={height}
          solid={solidRule}
          title={row.comments || 'Returned for correction'}
        >
          <span className="pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-900">
            Returned
          </span>
        </Rule>
        {!compact && row.comments && (
          <p className="mt-0.5 truncate text-[9px] text-gray-500" title={row.comments}>
            {row.comments}
          </p>
        )}
      </div>
    )
  }

  // ---- Mode 4: pending (waiting for SOMEBODY ELSE) -----------------------------------
  if (row.state === PrintedSignatureState.Pending) {
    const who = row.awaitingName || row.awaitingUnit || row.roleCaption
    return (
      <Rule height={height} solid={solidRule} title={row.stepTitle || 'Awaiting signature'}>
        <span className="truncate pb-0.5 text-[10px] font-medium text-amber-900">
          {who ? `Awaiting ${who}` : 'Awaiting signature'}
        </span>
      </Rule>
    )
  }

  // ---- Mode 5d: not reached yet, and not mine ----------------------------------------
  if (!row.isSigned && !provisional) return <Rule height={height} solid={solidRule} />

  // ---- Loading the specimen ----------------------------------------------------------
  if (loading) {
    return (
      <Rule
        height={height}
        solid={solidRule}
        provisional={provisional}
        title="Loading signature specimen"
      >
        <Loader2 className="mb-1 h-3 w-3 animate-spin text-gray-400" />
      </Rule>
    )
  }

  const provisionalTitle =
    'Your signature specimen — it becomes the recorded signature of this form when you approve it.'

  // ---- Mode 2 / 6a-PDF: PDF specimen -------------------------------------------------
  if (signature?.hasSpecimen && signature.isPdf && signature.imageUrl) {
    return (
      <div>
        <Rule
          height={height}
          solid={solidRule}
          provisional={provisional}
          title={provisional ? provisionalTitle : row.timestamp || undefined}
        >
          <object
            data={signature.imageUrl}
            type="application/pdf"
            className="w-full"
            style={{ height: `${height}px` }}
            aria-label={`Signature of ${row.personName}`}
          >
            <span className="pb-0.5 text-[11px] font-medium text-gray-900">
              {row.personName}
            </span>
          </object>
        </Rule>
        {!compact && provisional && <ProvisionalNote />}
        {!compact && !provisional && <Trace row={row} version={signature.version} />}
      </div>
    )
  }

  // ---- Mode 1 / 6a: image specimen ---------------------------------------------------
  if (signature?.hasSpecimen && signature.imageUrl) {
    return (
      <div>
        <Rule
          height={height}
          solid={solidRule}
          provisional={provisional}
          title={provisional ? provisionalTitle : row.timestamp || undefined}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signature.imageUrl}
            alt={`Signature of ${row.personName}`}
            className="max-w-full object-contain object-left"
            style={{ maxHeight: `${height}px` }}
          />
        </Rule>
        {!compact && provisional && <ProvisionalNote />}
        {!compact && !provisional && <Trace row={row} version={signature.version} />}
      </div>
    )
  }

  // ---- Mode 3 / 6b: no specimen uploaded yet -> the cursive typed name ----------------
  return (
    <div>
      <Rule
        height={height}
        solid={solidRule}
        provisional={provisional}
        title={
          signature?.unavailableReason ||
          'No signature specimen has been uploaded for this user yet.'
        }
      >
        <span
          className={`truncate pb-0.5 text-[13px] font-semibold italic leading-none ${
            provisional ? 'text-indigo-900' : 'text-gray-900'
          }`}
          style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
        >
          {row.personName || '—'}
        </span>
      </Rule>
      {!compact && provisional && <ProvisionalNote />}
      {!compact && !provisional && (
        <p className="mt-0.5 text-[9px] text-gray-500">
          Signed electronically — specimen pending admin upload
        </p>
      )}
    </div>
  )
}

/** Caption under a provisional specimen. Never implies that an approval was granted. */
function ProvisionalNote() {
  return (
    <p className="mt-0.5 text-[9px] text-indigo-700">
      To be recorded when you approve this form
    </p>
  )
}

/** Integrity marker printed under a STAMPED specimen only. */
function Trace({ row, version }: { row: PrintedSignatureRow; version: number }) {
  const hash = row.signatureHash ? row.signatureHash.slice(0, 12) : ''
  if (!hash) return null
  return (
    <p className="mt-0.5 truncate font-mono text-[8px] text-gray-400" title={row.timestamp}>
      {version > 1 ? `${hash} · v${version}` : hash}
    </p>
  )
}