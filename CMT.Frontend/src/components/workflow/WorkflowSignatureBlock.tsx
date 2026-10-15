/**
 * =====================================================================================
 * AMENDED v17 — PHASE 1 (FRONTEND)
 * Copy to: CMT.Frontend/src/components/workflow/WorkflowSignatureBlock.tsx   (NEW FILE)
 *
 * WHAT THIS FILE IS
 * -----------------
 * The RENDERED half of requirement #13. It prints, on EVERY controlled form, the
 * "Prepared by / Reviewed by / Approved by / Dates" block with:
 *
 *     name  +  signature image  +  UTC date
 *
 * auto-filled from the executed workflow steps, and it does so WITHOUT changing the
 * printed geometry of the existing forms.
 *
 * WHY IT IS A SEPARATE COMPONENT AND NOT A CHANGE INSIDE EACH FORM
 * ---------------------------------------------------------------
 * `FormDocumentChrome.tsx` already owns the printed chrome and exports `SignatureBlock`
 * with the exact three-column geometry of the paper forms:
 *
 *     [ caption + role ] [ Name ] [ Signature ] [ Date ]
 *      md:col-span-3      -4       -2            -3
 *
 * ...but that `SignatureBlock` is a DUMB, MANUALLY TYPED block: `SignatureRow.name` and
 * `SignatureRow.date` are strings the form file has to fill in itself, and the Signature
 * column is a hard-coded empty dotted line:
 *
 *     <p className="text-xs text-gray-400 border-b border-dotted ... min-h-[20px]" />
 *
 * So today, requirement #13 is UNREACHABLE through that component:
 *   (1) nothing links a signature IMAGE to the approver — the cell is literally empty;
 *   (2) the name and date are typed by whoever is editing the form, not derived from the
 *       approval, so a form can print "Approved by: <anyone>" without an approval existing;
 *   (3) each of the 25+ form files would have to re-implement the same projection, which is
 *       exactly how the printed forms drifted apart before.
 *
 * This component therefore REPLACES the signature area of a workflow-backed form while
 * REUSING the identical Tailwind geometry (same border, same md:col-span split, same
 * dotted baselines, same [9px] uppercase captions), so the printed output is
 * pixel-compatible with `FormDocumentChrome.SignatureBlock`. Nothing in the existing forms
 * needs its layout touched: a form only swaps `<SignatureBlock rows={...}/>` for
 * `<WorkflowSignatureBlock instance={...}/>`, or renders this one BELOW the legacy block
 * while the migration is in progress.
 *
 * DATA FLOW (all three pieces already exist, this file only joins them)
 *   buildSignatureRows()  (v17 completion-utils) -> WHO owns each printed slot + WHO signed
 *   useSignatureImage()   (v16 signature-render) -> the specimen bytes as an object URL
 *   roleLabel()           (v12 role-hierarchy)   -> the printed role caption
 *
 * FIVE HARD RULES
 *   (1) A MISSING SPECIMEN IS NOT AN ERROR. Requirement #13 links the image "after being
 *       uploaded by the admin"; before that upload the block still prints name + role +
 *       date. Never render a broken-image icon and never block the chain on an admin task.
 *   (2) THE RAW STORAGE PATH IS NEVER RENDERED. The image src is always the short-lived
 *       object URL produced by `useSignatureImage`, which streams the authorised endpoint
 *       with `credentials: 'include'`.
 *   (3) NOTHING IS TYPED BY HAND. There is no editable input in this block: name, date and
 *       signature come from the executed step only. That is the whole point of "Automatically
 *       generate and apply name, date and signatures upon approval based on the signer's
 *       identity and role."
 *   (4) UTC VERBATIM. `utcDate` is used, never a local-timezone conversion.
 *   (5) EMPTY SLOTS STILL PRINT. An unexecuted step renders its caption + role with blank
 *       cells, so the block has the same number of rows before and after approval.
 * =====================================================================================
 */
'use client'

import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'

import { useSignatureImage } from '@/lib/workflow/signature-render'
import {
  buildSignatureRows,
  signatureBlockProgress,
  type PrintedSignatureRow,
} from '@/lib/workflow/completion-utils'
import { roleLabel } from '@/lib/role-hierarchy'
import type { WorkflowInstanceResponse } from '@/lib/workflow/workflow-types'

// =====================================================================================
// 1. ONE SIGNATURE CELL
// =====================================================================================

interface SignatureCellProps {
  row: PrintedSignatureRow
}

/**
 * The Signature column of one printed row.
 *
 * Renders, in this order of preference:
 *   1. the specimen image / PDF of the signer          (row.isSigned && specimen found)
 *   2. "(signed — no specimen on file)" in small print (row.isSigned, no specimen)
 *   3. "Skipped"                                       (row.isSkipped)
 *   4. an empty dotted baseline                        (step not executed yet)
 *
 * The dotted baseline and the 20px minimum height are copied from
 * `FormDocumentChrome.SignatureBlock` so the row height never changes.
 */
function SignatureCell({ row }: SignatureCellProps) {
  // The hook stays idle until the step has actually been executed (rule 5).
  const { signature, loading } = useSignatureImage(row.userId || null, row.isSigned)

  if (row.isSkipped) {
    return (
      <p className="min-h-[20px] border-b border-dotted border-gray-400 text-[10px] italic text-gray-500">
        Skipped
      </p>
    )
  }

  if (!row.isSigned) {
    // Empty printed baseline — identical to the legacy block.
    return <p className="min-h-[20px] border-b border-dotted border-gray-400" />
  }

  if (loading) {
    return (
      <p className="flex min-h-[20px] items-center border-b border-dotted border-gray-400">
        <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
      </p>
    )
  }

  if (signature?.hasSpecimen && signature.imageUrl) {
    if (signature.isPdf) {
      return (
        <div className="min-h-[20px] border-b border-dotted border-gray-400">
          <object
            data={signature.imageUrl}
            type="application/pdf"
            aria-label={`Signature specimen of ${row.personName}`}
            className="h-10 w-full"
          >
            <span className="text-[10px] text-gray-600">{row.personName}</span>
          </object>
        </div>
      )
    }
    return (
      <div className="min-h-[20px] border-b border-dotted border-gray-400">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={signature.imageUrl}
          alt={`Signature of ${row.personName}`}
          title={row.signatureHash ? `Trace ${row.signatureHash.slice(0, 12)}` : undefined}
          className="h-10 max-w-full object-contain object-left"
        />
      </div>
    )
  }

  // Signed, but the Admin has not uploaded a specimen yet (rule 1).
  return (
    <p
      className="min-h-[20px] border-b border-dotted border-gray-400 text-[10px] italic text-gray-500"
      title={signature?.unavailableReason || undefined}
    >
      (signed — no specimen on file)
    </p>
  )
}

// =====================================================================================
// 2. THE PRINTED BLOCK
// =====================================================================================

export interface WorkflowSignatureBlockProps {
  /** GET /api/workflow/forms/{instanceId}. Null while it is still loading. */
  instance?: WorkflowInstanceResponse | null
  /** Statement printed above the signatures, e.g. the MNT-918 declaration. */
  statement?: ReactNode
  /**
   * When true a small "3 of 5 signatures applied" caption is printed in the header. It is
   * on-screen guidance only and is hidden in print (`print:hidden`).
   */
  showProgress?: boolean
  /** Rendered when the form has no workflow instance yet (still a local draft). */
  emptyHint?: string
  className?: string
}

/**
 * Drop-in replacement for `FormDocumentChrome.SignatureBlock` on any workflow-backed form.
 * The outer border and `border-t-0` match the legacy block, so it can sit directly under a
 * `DocumentFieldGrid` / data table without a double border.
 */
export default function WorkflowSignatureBlock({
  instance,
  statement,
  showProgress = true,
  emptyHint = 'The signature block is filled automatically once the form is submitted and each approver signs.',
  className = '',
}: WorkflowSignatureBlockProps) {
  const rows = buildSignatureRows(instance)

  if (rows.length === 0) {
    return (
      <div className={`border border-t-0 border-gray-400 ${className}`}>
        {statement && (
          <div className="border-b border-gray-300 px-2 py-2 text-[11px] leading-relaxed text-gray-800">
            {statement}
          </div>
        )}
        <p className="px-2 py-3 text-[11px] text-gray-500">{emptyHint}</p>
      </div>
    )
  }

  return (
    <div className={`border border-t-0 border-gray-400 ${className}`}>
      {statement && (
        <div className="border-b border-gray-300 px-2 py-2 text-[11px] leading-relaxed text-gray-800">
          {statement}
        </div>
      )}

      {showProgress && (
        <div className="flex items-center justify-between border-b border-gray-300 bg-gray-50 px-2 py-1 print:hidden">
          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-600">
            Approval signatures
          </span>
          <span className="text-[10px] text-gray-600">{signatureBlockProgress(rows)}</span>
        </div>
      )}

      <div className="divide-y divide-gray-300">
        {rows.map(row => {
          const printedRole = row.roleLabel || roleLabel(row.role)
          return (
            <div
              key={`${row.stepNo}-${row.block}`}
              className="grid grid-cols-1 gap-2 px-2 py-2 md:grid-cols-12"
            >
              {/* Caption + role — identical geometry to the legacy block. */}
              <div className="md:col-span-3">
                <p className="text-[11px] font-semibold text-gray-800">{row.caption}:</p>
                <p className="text-[9px] uppercase text-gray-500" title={row.stepTitle}>
                  {printedRole || '—'}
                </p>
              </div>

              {/* Name — auto-filled from the executed step, never typed (rule 3). */}
              <div className="md:col-span-4">
                <p className="text-[9px] uppercase text-gray-500">Name</p>
                <p className="min-h-[20px] border-b border-dotted border-gray-400 text-xs font-medium text-gray-900">
                  {row.personName}
                </p>
              </div>

              {/* Signature — the specimen linked to the signer's user id. */}
              <div className="md:col-span-2">
                <p className="text-[9px] uppercase text-gray-500">Signature</p>
                <SignatureCell row={row} />
              </div>

              {/* Date — UTC verbatim (rule 4). */}
              <div className="md:col-span-3">
                <p className="text-[9px] uppercase text-gray-500">Date</p>
                <p
                  className="min-h-[20px] border-b border-dotted border-gray-400 text-xs font-medium text-gray-900"
                  title={row.signedAt || undefined}
                >
                  {row.date}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}