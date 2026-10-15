/**
 * =====================================================================================
 * AMENDED v19 — PHASE 1 (FRONTEND), ITEM 5: THE FULLY AUTOMATIC SIGNATURE BLOCK
 * Copy to: CMT.Frontend/src/components/self-evaluation/forms/AutoSignatureBlock.tsx (NEW)
 *
 * WHAT THIS FILE IS
 * -----------------
 * The "Prepared by / Reviewed by / Approved by / Dates" block DRIVEN ENTIRELY BY THE
 * EXECUTED WORKFLOW. Use it on forms whose signature block is a plain list of captions
 * (MNT-1420A, MNT-1420B, MNT-1229B, MNT-1378, MNT-922C, MNT-918, MNT-918A, the Letter of
 * Confirmation, the Amendment Request and the folder Final Sign-Off).
 *
 * Forms whose signature block is interleaved with other printed cells keep their own
 * layout and instead pass their existing `SignatureRow[]` through
 * `useAutoFilledSignatureRows()` into the amended `FormDocumentChrome.SignatureBlock`.
 *
 * GEOMETRY
 * --------
 * IDENTICAL to `FormDocumentChrome.SignatureBlock`: a bordered container, `border-t-0` so
 * it stacks under the preceding block, one 12-column grid row per signature
 * (3 caption / 4 name / 2 signature / 3 date). Nothing about the printed layout changes;
 * only the CONTENT of the three cells is now automatic.
 * =====================================================================================
 */
'use client'

import type { ReactNode } from 'react'

import {
  printedSignatureStateClasses,
  type PrintedSignatureRow,
} from '@/lib/workflow/signature-blocks'
import { useFormSignatureRows, useSignatureSpecimenPrefetch } from '@/lib/workflow/useFormSignatureRows'
import type { WorkflowInstanceResponse } from '@/lib/workflow/workflow-types'
import AutoSignatureCell from './AutoSignatureCell'

interface AutoSignatureBlockProps {
  /** The executed instance. Null -> the block prints empty, exactly like the hard copy. */
  instance?: WorkflowInstanceResponse | null
  /** Statement printed above the signatures (verbatim text of the hard copy). */
  statement?: ReactNode
  /**
   * Restrict / re-order the printed captions. When omitted EVERY signature-bearing step of
   * the routing chain prints, in execution order — which is what the amended catalog wants.
   */
  onlyBlocks?: PrintedSignatureRow['block'][]
  /** Show the small state badge next to the caption. Off for a print-exact copy. */
  showState?: boolean
  /** Show step comments as a "Remarks" line under the row. */
  showComments?: boolean
  /** Warm the specimen cache immediately (use on the print / PDF preview screen). */
  prefetch?: boolean
}

export default function AutoSignatureBlock({
  instance,
  statement,
  onlyBlocks,
  showState = true,
  showComments = true,
  prefetch = false,
}: AutoSignatureBlockProps) {
  const { rows, progress } = useFormSignatureRows(instance)
  useSignatureSpecimenPrefetch(rows, prefetch)

  const printed = onlyBlocks && onlyBlocks.length > 0
    ? rows.filter(row => onlyBlocks.includes(row.block))
    : rows

  return (
    <div className="border border-gray-400 border-t-0">
      {statement && (
        <div className="border-b border-gray-300 px-2 py-2 text-[11px] leading-relaxed text-gray-800">
          {statement}
        </div>
      )}

      {printed.length === 0 ? (
        <div className="px-2 py-3 text-[11px] text-gray-500">
          The routing chain has not been started yet, so no signature has been recorded.
        </div>
      ) : (
        <div className="divide-y divide-gray-300">
          {printed.map(row => (
            <div
              key={`${row.block}-${row.stepNo}`}
              className="grid grid-cols-1 gap-2 px-2 py-2 md:grid-cols-12"
            >
              {/* ---- Caption + role ------------------------------------------------- */}
              <div className="min-w-0 md:col-span-3">
                <div className="flex items-center gap-1.5">
                  <p
                    className="text-[11px] font-semibold text-gray-800"
                    title={row.stepTitle || undefined}
                  >
                    {row.caption}:
                  </p>
                  {showState && (
                    <span
                      className={`rounded border px-1 py-[1px] text-[8px] font-semibold uppercase tracking-wide ${printedSignatureStateClasses(row.state)}`}
                    >
                      {row.stateLabel}
                    </span>
                  )}
                </div>
                <p className="text-[9px] uppercase text-gray-500 [overflow-wrap:anywhere]">
                  {row.roleCaption || '—'}
                </p>
                {row.wasDelegated && (
                  <p
                    className="text-[9px] text-gray-500"
                    title={row.delegationReason || undefined}
                  >
                    Delegated
                  </p>
                )}
              </div>

              {/* ---- Name ---------------------------------------------------------- */}
              <div className="min-w-0 md:col-span-4">
                <p className="text-[9px] uppercase text-gray-500">Name</p>
                <p className="min-h-[20px] break-words border-b border-dotted border-gray-400 text-xs font-medium text-gray-900 [overflow-wrap:anywhere]">
                  {row.isSigned ? row.personName : ''}
                </p>
              </div>

              {/* ---- Signature ----------------------------------------------------- */}
              <div className="min-w-0 md:col-span-2">
                <p className="text-[9px] uppercase text-gray-500">Signature</p>
                <AutoSignatureCell row={row} />
              </div>

              {/* ---- Date ---------------------------------------------------------- */}
              <div className="min-w-0 md:col-span-3">
                <p className="text-[9px] uppercase text-gray-500">Date</p>
                <p className="min-h-[20px] border-b border-dotted border-gray-400 text-xs font-medium text-gray-900">
                  {row.date}
                </p>
              </div>

              {/* ---- Remarks ------------------------------------------------------- */}
              {showComments && row.comments && (
                <div className="md:col-span-12">
                  <p className="text-[9px] uppercase text-gray-500">Remarks</p>
                  <p className="break-words text-[11px] text-gray-700 [overflow-wrap:anywhere]">
                    {row.comments}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {printed.length > 0 && progress.pendingCaption && (
        <div className="border-t border-gray-300 bg-gray-50 px-2 py-1 text-[10px] text-gray-600">
          {progress.signed + progress.skipped} of {progress.total} signatures recorded —{' '}
          {progress.pendingCaption}
        </div>
      )}
    </div>
  )
}