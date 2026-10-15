/**
 * =====================================================================================
 * AMENDED v17 - PHASE 1 (FRONTEND)
 * CMT.Frontend/src/components/workflow/FormSignatureBlock.tsx        (NEW FILE)
 *
 * WHAT THIS FILE IS
 * -----------------
 * The printed "Prepared by / Processed by / Verified by / Reviewed by / Approved by /
 * Issued by / Signed off by / Endorsed by" block of EVERY form — requirement #13:
 *
 *   "Capture the user's name, date, signature. Automatically date, signature, name
 *    approvals on each form on each existing location accordingly on each form. Link a
 *    stored name, date, signature image from the database storage path to the corresponding
 *    user ID upon approval ... while maintaining the existing form structures without
 *    modifying their layouts."
 *
 * WHY IT IS NEEDED
 * ----------------
 * `signature-render.ts` (v16) resolves a userId into a credential-free object URL, and
 * `WorkflowInstanceResponse.signatures[]` already carries block / caption / stepNo /
 * userId / personName / personRole / signedAt / signatureHash. But no component consumes
 * either of them, so today every form still prints EMPTY signature cells even after the
 * chain has been fully executed — the approval is recorded in the database and invisible
 * on paper.
 *
 * HOW THE "DO NOT MODIFY THE LAYOUT" RULE IS HONOURED
 * ---------------------------------------------------
 * This component NEVER decides which captions a form has. It renders exactly the blocks
 * the SERVER declares for that form:
 *
 *   - `instance.signatures[]`  -> the blocks already SIGNED (name + role + date + image);
 *   - `instance.steps[]`       -> the blocks still to be signed, in `SIGNATURE_BLOCK_ORDER`,
 *                                rendered as EMPTY cells with the same caption, so the
 *                                printed grid keeps the number of cells the paper form has
 *                                from the first draft to the final sign-off.
 *
 * Two rendering modes, one source of truth:
 *   variant="grid"   - the boxed signature grid at the bottom of a form (default, print-safe)
 *   variant="inline" - a compact single-row strip for a list / dialog header
 *
 * THREE HARD RULES INHERITED FROM signature-render.ts
 *   (1) The raw storage path is never touched: the specimen is streamed from the authorised
 *       endpoint and wrapped in a short-lived object URL.
 *   (2) User ids are NUMBERS (C# long); signature ids are STRINGS (C# Guid).
 *   (3) A MISSING SPECIMEN IS NOT AN ERROR. The cell still prints the signer's name, role
 *       and UTC date, plus a discreet note, because the image only exists "after being
 *       uploaded by the admin".
 * =====================================================================================
 */

'use client'

import { useMemo } from 'react'

import {
  SIGNATURE_BLOCK_ORDER,
  SignatureBlockType,
  signatureCaption,
  type FormSignatureResponse,
  type WorkflowInstanceResponse,
} from '@/lib/workflow/workflow-types'

import { roleLabel } from '@/lib/role-hierarchy'
import {
  formatSignatureDate,
  formatSignatureTimestamp,
  signatureTrace,
  useSignatureImage,
} from '@/lib/workflow/signature-render'

// =====================================================================================
// 1. ONE CELL
// =====================================================================================

interface CellModel {
  block: SignatureBlockType
  caption: string
  stepNo: number
  signature: FormSignatureResponse | null
}

function SignatureCell({
  model,
  compact,
}: {
  model: CellModel
  compact: boolean
}) {
  const signed = model.signature
  const userId = signed?.userId ?? null
  const { signature: specimen, loading } = useSignatureImage(userId, !!userId)

  const name = signed?.personName?.trim() ?? ''
  const role = signed ? signed.personRoleLabel || roleLabel(signed.personRole) : ''
  const date = formatSignatureDate(signed?.signedAt)
  const trace = signatureTrace(signed?.signatureHash, specimen?.version)

  return (
    <div
      className={`flex flex-col rounded-md border border-slate-300 bg-white ${
        compact ? 'px-2 py-1.5' : 'p-3'
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {model.caption}
      </span>

      {/* ---- the specimen area: fixed height so the grid never reflows on load ---- */}
      <div
        className={`mt-1 flex items-end justify-center border-b border-slate-300 ${
          compact ? 'h-8' : 'h-16'
        }`}
      >
        {!signed ? (
          <span className="pb-1 text-[10px] italic text-slate-400">Pending</span>
        ) : loading ? (
          <span className="pb-1 text-[10px] text-slate-400">Loading specimen…</span>
        ) : specimen?.hasSpecimen && specimen.isPdf ? (
          <object
            data={specimen.imageUrl}
            type={specimen.contentType || 'application/pdf'}
            className="h-full w-full"
            aria-label={`Signature specimen of ${name || 'the approver'}`}
          >
            <span className="pb-1 text-[10px] text-slate-500">{name}</span>
          </object>
        ) : specimen?.hasSpecimen ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={specimen.imageUrl}
            alt={`Signature of ${name || 'the approver'}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <span
            className="pb-1 text-center text-[10px] leading-tight text-slate-500"
            title={specimen?.unavailableReason || ''}
          >
            Signed electronically
          </span>
        )}
      </div>

      {/* ---- name / role / date: always printed, image or not ---- */}
      <div className="mt-1 space-y-0.5">
        <p className="truncate text-xs font-semibold text-slate-900" title={name}>
          {name || '\u00A0'}
        </p>
        <p className="truncate text-[10px] text-slate-600" title={role}>
          {role || '\u00A0'}
        </p>
        <p className="text-[10px] text-slate-700">
          <span className="font-medium text-slate-500">Date: </span>
          {date || '\u00A0'}
        </p>
        {!compact && trace && (
          <p className="text-[9px] text-slate-400" title={formatSignatureTimestamp(signed?.signedAt)}>
            {trace}
          </p>
        )}
      </div>
    </div>
  )
}

// =====================================================================================
// 2. THE BLOCK
// =====================================================================================

interface Props {
  instance: WorkflowInstanceResponse
  /** "grid" = the boxed block at the bottom of a form. "inline" = compact strip. */
  variant?: 'grid' | 'inline'
  /** Hides the "Approval signatures" caption when the paper form already prints one. */
  showHeading?: boolean
  className?: string
}

export default function FormSignatureBlock({
  instance,
  variant = 'grid',
  showHeading = true,
  className = '',
}: Props) {
  const compact = variant === 'inline'

  /**
   * The cell list is derived from the SERVER, never hardcoded:
   *   - a step whose `signatureBlock` is not None contributes exactly one cell;
   *   - a signature already recorded fills that cell;
   *   - the printed order follows SIGNATURE_BLOCK_ORDER, then the step number, so the grid
   *     reads the way the paper form reads.
   */
  const cells = useMemo<CellModel[]>(() => {
    const signatures = instance.signatures ?? []
    const byKey = new Map<string, FormSignatureResponse>()
    for (const s of signatures) byKey.set(`${s.block}:${s.stepNo}`, s)

    const models: CellModel[] = []

    for (const step of instance.steps ?? []) {
      if (step.signatureBlock === SignatureBlockType.None) continue
      models.push({
        block: step.signatureBlock,
        caption: step.signatureCaption || signatureCaption(step.signatureBlock),
        stepNo: step.stepNo,
        signature: byKey.get(`${step.signatureBlock}:${step.stepNo}`) ?? null,
      })
    }

    // Signatures whose step is no longer in the chain (revision / amendment) are still printed.
    for (const s of signatures) {
      const exists = models.some(m => m.block === s.block && m.stepNo === s.stepNo)
      if (!exists) {
        models.push({
          block: s.block,
          caption: s.caption || signatureCaption(s.block),
          stepNo: s.stepNo,
          signature: s,
        })
      }
    }

    return models.sort((a, b) => {
      const orderA = SIGNATURE_BLOCK_ORDER.indexOf(a.block)
      const orderB = SIGNATURE_BLOCK_ORDER.indexOf(b.block)
      if (orderA !== orderB) return orderA - orderB
      return a.stepNo - b.stepNo
    })
  }, [instance])

  if (cells.length === 0) return null

  const columns = Math.min(4, Math.max(2, cells.length))

  return (
    <section className={`print:break-inside-avoid ${className}`}>
      {showHeading && !compact && (
        <div className="mb-2 flex items-baseline justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wide text-slate-700">
            Approval signatures
          </h4>
          {instance.isLocked && (
            <span className="text-[10px] font-medium text-emerald-800">
              Signed off and locked
            </span>
          )}
        </div>
      )}

      <div
        className={
          compact
            ? 'flex flex-wrap gap-2'
            : `grid gap-2 sm:grid-cols-2 ${
                columns >= 4
                  ? 'lg:grid-cols-4'
                  : columns === 3
                    ? 'lg:grid-cols-3'
                    : 'lg:grid-cols-2'
              }`
        }
      >
        {cells.map(cell => (
          <div key={`${cell.block}-${cell.stepNo}`} className={compact ? 'w-44' : ''}>
            <SignatureCell model={cell} compact={compact} />
          </div>
        ))}
      </div>
    </section>
  )
}