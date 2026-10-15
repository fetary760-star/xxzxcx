/**
 * =====================================================================================
 * AMENDED v26 — ITEM 14 / DELIVERABLE 2: AMENDMENT REQUEST + LETTER OF CONFIRMATION
 * Copy to: CMT.Frontend/src/components/self-evaluation/forms/RequestLetterForm.tsx
 *          (REPLACES the whole existing file)
 *
 * THE HARD COPY ("REQUEST LETTER" sheet) — reproduced byte-for-byte, nothing moved
 * ------------------------------------------------------------------------------
 *   To: Mgr. QA and Safety, ET-MRO                        From: Dir. CMT
 *                                                         Ref:  EAL-CMT/048/2019
 *                                                         Date: 14-Dec-2025
 *   Subject: Capability Amendment Request
 *   This is to request your office to approve the capability amendment request for a component
 *   PN:          HFA2007-01
 *   Description: COFFEE MAKER
 *   For which the maintenance will be performed in Galley Shop.
 *   I hereby confirm that the below requirements are fulfilled ... 1..7
 *   Copy: enclosed all required documents
 *                                                         AYELE G.        <-- THE SIGNATORY
 *
 * WHAT WAS WRONG
 * --------------
 * The letter had NO workflow wiring at all: the signatory name was a hand-typed `Input`, no
 * signature specimen could ever appear, the approval date was never stamped, and the executed
 * routing (Amendment Request bypasses lower tiers straight to DIR; Letter of Confirmation
 * escalates MGR -> DIR) was printed NOWHERE.
 *
 * WHAT THIS VERSION DOES — AND WHY IT DOES NOT ADD A SIGNATURE TABLE
 * ----------------------------------------------------------------
 * A letter has ONE printed signatory position: bottom right, the name on a rule with the job
 * title underneath. Rendering a "Prepared / Reviewed / Approved" band under a letter would be
 * a LAYOUT CHANGE, which is forbidden. So:
 *
 *   (1) `useFormWorkflowInstance` resolves the executed steps of this letter.
 *   (2) THE EXISTING SIGNATORY POSITION becomes automatic — name, specimen and stamped date
 *       come from the executed step, in the SAME bottom-right geometry:
 *
 *         request_letter      -> pinned to LETTER_SLOTS[2]  ApprovedBy  / Director   ("Dir. CMT")
 *         confirmation_letter -> pinned to LETTER_SLOTS[1]  ReviewedBy  / Manager
 *
 *       Those are the roles the CURRENT file already prints in the "From:" line
 *       (`APPROVER_TITLES.letterFrom` for the request, `tnaApprovedByManager` for the
 *       confirmation), so the pinning matches the paper, not a new opinion.
 *   (3) the OTHER executed steps of the letter chain (the STL who prepared it, and the
 *       Director who finally signs a Letter of Confirmation) are the lines the letter does
 *       NOT pre-print. They are appended as WORKFLOW RECORDS — clearly marked, never
 *       editable, in the same printed geometry — and ONLY once the workflow has actually
 *       reached them. On an unsigned letter `extraLines` is EMPTY and the sheet is
 *       byte-identical to the hard copy.
 *   (4) `onStatusChange` reloads the form data AND the instance, so a Director sign-off
 *       repaints the signatory immediately instead of on the next remount.
 *
 * The hand-typed signatory `Input` is KEPT for a letter whose workflow has not started, and
 * it LOCKS ITSELF the moment a real signature exists (`line.locked`), because a recorded
 * approval must never stay editable.
 * =====================================================================================
 */
'use client'

import { useMemo } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useFormData } from '@/lib/self-evaluation/useFormData'
import {
  APPROVER_TITLES,
  DEFAULT_APPROVER_NAMES,
  toDocumentDate,
  useATAAutoFill,
  useATAAutoFillSync,
} from '@/lib/self-evaluation/useATAAutoFill'
import type { FormNodeType } from '@/lib/self-evaluation/types'
import { ORG_ROLES } from '@/lib/role-hierarchy'
import { SignatureBlockType } from '@/lib/workflow/workflow-types'
import { buildSignatureRows } from '@/lib/workflow/signature-blocks'
import {
  printedInlineLines,
  supplementalPrintedLines,
  type FilledSignatureRowLike,
} from '@/lib/workflow/signature-print'
// (1) THE MISSING WIRING LINK — resolves the FormWorkflowInstance of this letter.
import { useFormWorkflowInstance } from '@/lib/workflow/useFormWorkflowInstance'
import AutoSignatureCell from './AutoSignatureCell'
import AutoSignatureLine from './AutoSignatureLine'
import { FormToolbar, FormWorkflowFooter } from './FormDocumentChrome'

// ===========================================================================
// Letter constants — verbatim from the "REQUEST LETTER" hard copy
// ===========================================================================

const SUBJECT_REQUEST = 'Capability Amendment Request'
const SUBJECT_CONFIRMATION = 'Letter of Confirmation for Capability Amendment'

const OPENING_LINE =
  'This is to request your office to approve the capability amendment request for a component'

const CONFIRMATION_LINE =
  'I hereby confirm that the below requirements are fulfilled for the approval of the indicated component:'

/** The seven requirement lines, copied character-for-character. */
const REQUIREMENTS = [
  'The shop has the required qualified and sufficient maintenance personnel.',
  'The shop has the required facility for the requested scope.',
  'The shop can access current technical data.',
  'All the required tools/equipment per the requested scope is available and controlled in the shop.',
  'All the required consumable per the requested scope are available in the shop.',
  'The shop performs the maintenance accordingly to the applicable MPM/MOE/RSM/QCM and supplemental procedures.',
  'All required and applicable forms used for the requested maintenance are available and current.',
]

const COPY_LINE = 'Copy: enclosed all required documents'

/**
 * PRINTED POSITIONS inside FORM_SIGNATURE_MATRIX (LETTER_SLOTS, signature-matrix.ts v22):
 *   0 -> 'Prepared By:'  PreparedBy  / Shop Team Leader   (not pre-printed on the letter)
 *   1 -> 'Reviewed By:'  ReviewedBy  / Manager
 *   2 -> 'Approved By:'  ApprovedBy  / Dir. CMT
 */
const SLOT_LETTER_REVIEWED_BY = 1
const SLOT_LETTER_APPROVED_BY = 2

interface FormData extends Record<string, unknown> {
  /** Auto-filled from the ATA Record. */
  to: string
  from: string
  refNo: string
  date: string
  subject: string
  partNumber: string
  description: string
  performingShop: string
  /** Signatory — editable until the workflow stamps it, then locked. */
  signatoryName: string
  /** Stamped when the signatory step executes. Kept so it persists with the submission. */
  signatoryDate: string
}

interface Props {
  variant: 'request' | 'confirmation'
}

export default function RequestLetterForm({ variant }: Props) {
  const { selectedATARecord } = useSelfEvaluation()
  const auto = useATAAutoFill()

  const isConfirmation = variant === 'confirmation'
  const formNodeType: FormNodeType = isConfirmation ? 'confirmation_letter' : 'request_letter'

  /**
   * The AMENDMENT REQUEST is signed by the Director (Dir. CMT) and addressed to QA;
   * the LETTER OF CONFIRMATION is raised by the Manager to the Director.
   */
  const defaultTo = isConfirmation ? APPROVER_TITLES.letterFrom : APPROVER_TITLES.letterTo
  const defaultFrom = isConfirmation
    ? APPROVER_TITLES.tnaApprovedByManager
    : APPROVER_TITLES.letterFrom

  const defaultData: FormData = {
    to: defaultTo,
    from: defaultFrom,
    refNo: auto.letterRefNo,
    date: auto.selfEvaluationDate,
    subject: isConfirmation ? SUBJECT_CONFIRMATION : SUBJECT_REQUEST,
    partNumber: auto.partNumber,
    description: auto.description,
    performingShop: auto.responsibleWorkshop || auto.shopName,
    signatoryName: DEFAULT_APPROVER_NAMES.letterSignatory,
    signatoryDate: '',
  }

  const {
    formData,
    setFormData,
    isEditing,
    setIsEditing,
    approvalStatus,
    formSubmissionId,
    loading,
    saving,
    canEdit,
    canSubmit,
    handleSave,
    handleSubmitForApproval,
    loadFromBackend,
  } = useFormData<FormData>(defaultData, {
    formType: formNodeType,
    formNo: isConfirmation ? 'MNT-CFL' : 'MNT-RQL',
    revNo: '01',
  })

  /** (1) The executed routing of this letter. Never throws; null = unsigned original. */
  const { instance, reload: reloadInstance } = useFormWorkflowInstance({
    formSubmissionId,
    folderId: selectedATARecord?.evaluationFolderId,
  })

  // The ATA Record is the only writer of the identity values.
  useATAAutoFillSync<FormData>(
    setFormData,
    {
      refNo: auto.letterRefNo,
      date: auto.selfEvaluationDate,
      partNumber: auto.partNumber,
      description: auto.description,
      performingShop: auto.responsibleWorkshop || auto.shopName,
    },
    [loading, auto.ataRecordId],
  )

  /**
   * (2) THE SINGLE PRINTED SIGNATORY OF THE LETTER.
   *
   * Pinned to the matrix slot of the role that signs THIS variant, so a Manager review can
   * never be printed on a Director-signed Amendment Request and vice versa. `block` +
   * `expectedRoles` are supplied as well, so the automatic layer resolves the line by SET
   * MEMBERSHIP even in a deployment whose matrix row was locally edited.
   */
  const signatoryRow: FilledSignatureRowLike = useMemo(
    () => ({
      slotIndex: isConfirmation ? SLOT_LETTER_REVIEWED_BY : SLOT_LETTER_APPROVED_BY,
      label: 'Signature:',
      role: defaultFrom,
      block: isConfirmation ? SignatureBlockType.ReviewedBy : SignatureBlockType.ApprovedBy,
      expectedRoles: isConfirmation
        ? [ORG_ROLES.Manager, ORG_ROLES.ShopManager]
        : [ORG_ROLES.Director],
      name: formData.signatoryName,
      date: formData.signatoryDate,
    }),
    [isConfirmation, defaultFrom, formData.signatoryName, formData.signatoryDate],
  )

  const autoRows = useMemo(() => buildSignatureRows(instance), [instance])

  const declaredLines = useMemo(
    () => printedInlineLines([signatoryRow], autoRows, formNodeType),
    [signatoryRow, autoRows, formNodeType],
  )

  /**
   * (3) The executed steps the LETTER does not pre-print (the STL who prepared it, and the
   * Director who finally signs a Letter of Confirmation). EMPTY until the workflow reaches
   * them, so an unsigned letter is byte-identical to the hard copy.
   */
  const extraLines = useMemo(
    () => supplementalPrintedLines(declaredLines, formNodeType, instance),
    [declaredLines, formNodeType, instance],
  )

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const title = isConfirmation ? 'LETTER OF CONFIRMATION' : 'AMENDMENT REQUEST'

  const signatory = declaredLines[0]
  const signatoryLocked = !!signatory?.locked
  const signatoryName = signatory?.name || formData.signatoryName || ''
  const signatoryStampedDate = signatory?.date || ''

  return (
    <div className="space-y-4">
      <FormToolbar
        title={title}
        meta={`Ref. ${formData.refNo || '—'} · ${toDocumentDate(formData.date) || '—'}`}
        approvalStatus={approvalStatus}
        canEdit={canEdit}
        isEditing={isEditing}
        saving={saving}
        onEdit={() => setIsEditing(true)}
        onCancel={() => {
          setIsEditing(false)
          void loadFromBackend()
        }}
        onSave={() => void handleSave()}
      />

      <Card>
        <CardContent className="p-3">
          {/* The letter itself, printed inside a single bordered sheet. */}
          <div className="border border-gray-400 p-4 text-[12px] leading-relaxed text-gray-900">
            {/* ---- To / From, Ref, Date ------------------------------------ */}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <p className="font-semibold">To: {formData.to}</p>
              <div className="sm:w-72 space-y-0.5">
                <div className="flex gap-2">
                  <span className="w-12 flex-shrink-0 font-semibold">From:</span>
                  <span>{formData.from}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-12 flex-shrink-0 font-semibold">Ref:</span>
                  <span className="font-semibold">{formData.refNo || '—'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-12 flex-shrink-0 font-semibold">Date:</span>
                  <span className="font-semibold">
                    {toDocumentDate(signatoryStampedDate || formData.date) || '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* ---- Subject ------------------------------------------------- */}
            <p className="mt-4 font-bold">Subject: {formData.subject}</p>

            {/* ---- Body ---------------------------------------------------- */}
            <p className="mt-3">{OPENING_LINE}</p>

            <div className="mt-2 space-y-0.5">
              <div className="flex gap-2">
                <span className="w-24 flex-shrink-0 font-semibold">PN:</span>
                <span className="font-semibold">{formData.partNumber || '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-24 flex-shrink-0 font-semibold">Description:</span>
                <span className="font-semibold">{formData.description || '—'}</span>
              </div>
            </div>

            <p className="mt-2">
              For which the maintenance will be performed in{' '}
              <span className="font-semibold">{formData.performingShop || '—'}</span>.
            </p>

            <p className="mt-3">{CONFIRMATION_LINE}</p>

            <ol className="mt-1 list-decimal space-y-1 pl-6">
              {REQUIREMENTS.map(requirement => (
                <li key={requirement}>{requirement}</li>
              ))}
            </ol>

            <p className="mt-4">{COPY_LINE}</p>

            {/*
              ---- (2) THE SIGNATORY POSITION OF THE HARD COPY -------------------------
              Same place, same width, same centred geometry as before. What changed is that
              the specimen, the name and the stamped date are now produced by the EXECUTED
              step instead of being typed. The input survives only for a letter whose
              workflow has not started, and disappears the moment the line is locked.
            */}
            <div className="mt-6 flex justify-end">
              <div className="w-64 text-center">
                {/* The specimen sits ON the signatory rule, exactly where ink would be. */}
                <AutoSignatureCell
                  row={signatory?.signature ?? null}
                  height={26}
                  solidRule={false}
                  compact
                />

                {isEditing && !signatoryLocked ? (
                  <Input
                    value={formData.signatoryName}
                    onChange={event =>
                      setFormData(prev => ({ ...prev, signatoryName: event.target.value }))
                    }
                    className="mt-1 h-8 text-center text-xs"
                    aria-label="Signatory name"
                  />
                ) : (
                  <p
                    className="mt-1 font-semibold text-gray-900"
                    title={signatory?.tooltip || undefined}
                  >
                    {signatoryName}
                  </p>
                )}

                <p className="mt-1 text-[10px] uppercase text-gray-500">
                  {signatory?.roleCaption || formData.from}
                </p>

                {signatoryStampedDate && (
                  <p className="mt-0.5 text-[10px] text-gray-600">
                    Date: {toDocumentDate(signatoryStampedDate) || signatoryStampedDate}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/*
            ---- (3) WORKFLOW RECORDS THE LETTER DOES NOT PRE-PRINT --------------------
            The STL who prepared the letter, and — on a Letter of Confirmation — the
            Director's final sign-off. Rendered in the SAME printed geometry as every other
            controlled document, always read-only, and ONLY once actually executed. When the
            workflow has not reached them this whole section does not render, so the letter
            stays identical to the hard copy.
          */}
          {extraLines.length > 0 && (
            <div className="mt-3 border border-gray-400">
              <div className="border-b border-gray-300 bg-gray-50 px-2 py-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-700">
                  Approval record — not pre-printed on the letter
                </p>
              </div>
              <div className="divide-y divide-gray-200">
                {extraLines.map(line => (
                  <AutoSignatureLine key={line.key} line={line} editable={false} />
                ))}
              </div>
            </div>
          )}

          {/* Auto-fill hint, matching the other controlled documents. */}
          <p className="mt-1 px-1 text-[10px] text-gray-500">
            Ref. No., Date, PN, Description and the performing workshop are auto-populated from the
            ATA Record. The signatory name, date and signature are captured automatically from the
            approval workflow.
          </p>
        </CardContent>
      </Card>

      <FormWorkflowFooter
        formSubmissionId={formSubmissionId}
        approvalStatus={approvalStatus}
        ataRecordId={selectedATARecord?.id || ''}
        formNodeType={formNodeType}
        canEdit={canEdit}
        canSubmit={canSubmit}
        saving={saving}
        onSubmit={() => void handleSubmitForApproval()}
        /** (4) the instance MUST be reloaded, otherwise a sign-off repaints too late. */
        onStatusChange={() => {
          void loadFromBackend()
          void reloadInstance()
        }}
      />
    </div>
  )
}