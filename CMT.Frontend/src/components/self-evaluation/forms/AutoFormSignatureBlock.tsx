/**
 * =====================================================================================
 * AMENDED v26 — ITEM 14 / DELIVERABLE 1 (NEW FILE): THE ONE-IMPORT WIRING WRAPPER
 * Copy to: CMT.Frontend/src/components/self-evaluation/forms/AutoFormSignatureBlock.tsx
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * v24/v25 made `FormDocumentChrome.SignatureBlock` fully automatic, but every document still
 * has to remember FOUR things before the printed block fills itself:
 *
 *      1. import + call `useFormWorkflowInstance({ formSubmissionId, folderId })`
 *      2. pass `formType`
 *      3. pass `instance`
 *      4. call `reload()` from `onStatusChange`
 *
 * TNA (MNT-1229B), MNT-1325, MNT-1420A, MNT-1420B, MNT-918, MNT-918A and the Table of
 * Content have already been amended by hand. The REMAINING ~15 documents (tools, training,
 * facility, consumables, letters) each need the same four edits, and every one of them is an
 * opportunity to forget step 3 or step 4 — which is exactly the defect that produced the
 * blank signature column in "TNA SYSTEM.png".
 *
 * This wrapper collapses the four edits into TWO PROPS:
 *
 *      <AutoFormSignatureBlock
 *        editable={isEditing}
 *        formType={FORM_TYPE}                                 // matrix key
 *        formSubmissionId={formSubmissionId}                  // from useFormData()
 *        folderId={selectedATARecord?.evaluationFolderId}
 *        reloadSignal={signatureSignal}                       // bumped on any status change
 *        statement={CONFIRMATION_STATEMENT}
 *        rows={[ { slotIndex: 0, label: 'Prepared By:', ... } ]}
 *      />
 *
 * WHAT IT DOES NOT DO
 * -------------------
 *   - it invents NO layout. It forwards everything to `SignatureBlock`, which owns the
 *     printed geometry (`AutoSignatureLine` for the inline hard copies, the labelled
 *     NAME / SIGNATURE / DATE band for the MNT-918 family);
 *   - it never throws. `useFormWorkflowInstance` resolves defensively; when nothing resolves
 *     `instance` is null and the block prints the blank hard-copy rules, which is the correct
 *     rendering of a form whose draft has not been started through the workflow;
 *   - it does NOT re-match rows that a document already filled itself through
 *     `useAutoFilledSignatureRows()` — `SignatureBlock` detects pre-filled rows.
 *
 * THE RELOAD CONTRACT (this is step 4, made impossible to forget)
 * -------------------------------------------------------------
 * A recorded approval only repaints when the INSTANCE is re-fetched. Use the companion hook:
 *
 *      const [signatureSignal, refreshSignatures] = useSignatureReloadSignal()
 *      ...
 *      <FormWorkflowFooter
 *        onStatusChange={() => { void loadFromBackend(); refreshSignatures() }}
 *      />
 *
 * `loadFromBackend()` refreshes the FORM DATA; `refreshSignatures()` refreshes the EXECUTED
 * STEPS, which is where the printed name, the frozen UTC date and the specimen come from.
 *
 * IDS: user ids are NUMBERS (C# long); submission / instance / folder ids are STRINGS (Guid).
 * =====================================================================================
 */
'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { useFormWorkflowInstance } from '@/lib/workflow/useFormWorkflowInstance'
import type { WorkflowInstanceResponse } from '@/lib/workflow/workflow-types'
import { SignatureBlock, type SignatureRow } from './FormDocumentChrome'

// =====================================================================================
// 1. THE RELOAD SIGNAL
// =====================================================================================

/**
 * A monotonically increasing counter plus its bumper. Bump it from `onStatusChange` of
 * `FormWorkflowFooter` (and from `ApprovalWorkflowActions` on the older cards) and every
 * `AutoFormSignatureBlock` of the screen re-fetches its instance.
 */
export function useSignatureReloadSignal(): [number, () => void] {
  const [signal, setSignal] = useState(0)
  const bump = useCallback(() => setSignal(previous => previous + 1), [])
  return [signal, bump]
}

// =====================================================================================
// 2. THE WRAPPER
// =====================================================================================

interface AutoFormSignatureBlockProps {
  /** The printed lines the hard copy declares, in printed order. */
  rows: SignatureRow[]
  /** The form is in edit mode. A LOCKED (already signed) cell stays read-only regardless. */
  editable: boolean
  /** The persisted FormSubmission.FormType — also the key of FORM_SIGNATURE_MATRIX. */
  formType: string
  /** The FormSubmission Guid every document holds through `useFormData()`. */
  formSubmissionId: string | null
  /** Evaluation folder Guid. Unlocks the Table-of-Contents resolution step with no server change. */
  folderId?: string | null
  /** Bump this (see `useSignatureReloadSignal`) to re-fetch the executed steps. */
  reloadSignal?: number
  /** Statement printed above the signatures, verbatim from the hard copy. */
  statement?: ReactNode
  /**
   * Print the executed steps the PAPER has no line for (e.g. the MNT-1420A clerk entry).
   * Leave at `true` for a document that renders ONE band; set `false` on a document that
   * renders SEVERAL one-row bands (MNT-918 / MNT-918A), otherwise each band would also
   * append the lines of the other bands.
   */
  includeWorkflowSteps?: boolean
  /** Small state badge next to each caption. OFF by default: the paper has no badge. */
  showState?: boolean
  /** Footer line with the outstanding signature. ON by default; OFF for a print-exact copy. */
  showProgress?: boolean
  /** Optional observer, for a screen that wants the resolved instance (progress dashboards). */
  onInstanceResolved?: (instance: WorkflowInstanceResponse | null) => void
}

export default function AutoFormSignatureBlock({
  rows,
  editable,
  formType,
  formSubmissionId,
  folderId,
  reloadSignal = 0,
  statement,
  includeWorkflowSteps = true,
  showState = false,
  showProgress = true,
  onInstanceResolved,
}: AutoFormSignatureBlockProps) {
  const { instance, reload } = useFormWorkflowInstance({ formSubmissionId, folderId })

  // The first render already loads through the hook; only SUBSEQUENT bumps re-fetch.
  const lastSignal = useRef(reloadSignal)
  useEffect(() => {
    if (reloadSignal === lastSignal.current) return
    lastSignal.current = reloadSignal
    void reload()
  }, [reloadSignal, reload])

  useEffect(() => {
    onInstanceResolved?.(instance)
    // `onInstanceResolved` is an optional observer; re-running it on identity changes only
    // would hide a real instance update from the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance])

  return (
    <SignatureBlock
      rows={rows}
      editable={editable}
      formType={formType}
      instance={instance}
      statement={statement}
      includeWorkflowSteps={includeWorkflowSteps}
      showState={showState}
      showProgress={showProgress}
    />
  )
}