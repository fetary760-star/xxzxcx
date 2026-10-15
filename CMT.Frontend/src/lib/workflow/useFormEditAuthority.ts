/**
 * =====================================================================================
 * AMENDED v31 - ROLE-BASED EDIT AUTHORITY  (NEW FILE)
 * Copy to: CMT.Frontend/src/lib/workflow/useFormEditAuthority.ts
 *
 * DEFECT 2, IN YOUR WORDS
 * -----------------------
 *   "The Edit button appears at the top of Form MNT-1325 even after approval, which should
 *    not be allowed. Editing rights must be granted strictly based on role authorization -
 *    users should only be allowed to edit forms they are specifically assigned to prepare
 *    or approve."
 *
 * WHY IT HAPPENS TODAY
 * --------------------
 * `FormToolbar` in FormDocumentChrome.tsx renders
 *
 *      {canEdit && !isEditing && <Button onClick={onEdit}>Edit</Button>}
 *
 * and `canEdit` comes from `useFormData()`:
 *
 *      const canEdit = permissions.canEdit &&
 *        (approvalStatus === ApprovalStatus.Draft || approvalStatus === ApprovalStatus.Returned)
 *
 * That is a ROLE-CAPABILITY test plus a STAGE test, and nothing else. It never asks the
 * only question that matters: "is THIS form, at THIS step, mine?" So every user whose role
 * carries the generic `canEdit` capability sees the Edit button on every draft in the
 * system - including a Team Leader looking at a form that is sitting on the Manager's desk,
 * and including the Draft badge you screenshotted.
 *
 * WHAT THIS HOOK ADDS
 * -------------------
 * The OWNERSHIP gate that was missing, resolved from three independent facts:
 *
 *   1. THE SERVER FLAG. `WorkflowStepResponse.CanIAct` is computed FOR THE CALLING USER by
 *      WorkflowInstanceQueryService (isAdmin || assignedToActor || eligibleActor). It is the
 *      authority and is always preferred. It only becomes readable once
 *      WorkflowFormsController.cs is deployed - which is why DEFECT 1 and DEFECT 2 share a
 *      root cause.
 *   2. THE MATRIX. `signatureSlotsFor(formType)[i].expectedRoles` declares which canonical
 *      role owns which printed line. The signer's own line is `ownedSlotIndex`. A Manager
 *      therefore owns "Approved By:" (slot 1) on MNT-1325 and NEVER "Self-audited By:".
 *   3. THE SETTLED STATE. Once the signer's own line is Signed / Skipped / Returned it is
 *      the legal record, so it is locked for him for good - even if the form is somehow
 *      pushed back to Draft.
 *
 * THE RULE, IN ONE SENTENCE
 *   You may edit when the stage allows editing AND (you are Admin, OR the pending step is
 *   yours, OR - on a form that has not started yet - you own the PREPARING line).
 *
 * WHY IT DEGRADES SAFELY
 *   `stageAllowsEdit` is the value `useFormData()` already computes, so this hook can only
 *   ever make the button STRICTER, never more permissive. If the matrix has no entry for a
 *   form type (`expectedRoles` empty), `ownedSlotIndex` is -1 and the hook falls back to the
 *   pending-step test alone, so an unmapped form keeps working instead of locking everybody
 *   out.
 *
 * IDS: user ids are NUMBERS (C# long).
 * =====================================================================================
 */
'use client'

import { useMemo } from 'react'

import { ORG_ROLES, normalizeRole } from '@/lib/role-hierarchy'
import { useCurrentSigner } from '@/lib/workflow/current-signer'
import {
  PrintedSignatureState,
  buildSignatureRows,
  matchRowsToSlots,
  type PrintedSignatureRow,
} from '@/lib/workflow/signature-blocks'
import { signatureSlotsFor } from '@/lib/workflow/signature-matrix'
import {
  ApprovalStatus,
  SignatureBlockType,
  WorkflowStepKind,
  WorkflowStepState,
  isWithOriginator,
  type WorkflowInstanceResponse,
  type WorkflowStepResponse,
} from '@/lib/workflow/workflow-types'

// =====================================================================================
// 1. THE RESULT
// =====================================================================================

export interface FormEditAuthority {
  /**
   * Pass this to `FormToolbar.canEdit`. It is `stageAllowsEdit && ownership`, so the Edit
   * button disappears the moment the form stops belonging to the signed-in user.
   */
  canEdit: boolean
  /** The signed-in user owns the step the form is waiting on right now. */
  canApprove: boolean
  /** True when the pending step is the signer's, by server flag or by local fallback. */
  isCurrentStepMine: boolean
  /** Printed line the signer owns by role, or -1. Feed it to `useSignatureLedger()`. */
  ownedSlotIndex: number
  /** The signer's own line already carries a recorded outcome and is locked for good. */
  ownedLineLocked: boolean
  /** True when the form has no workflow instance yet (a brand-new draft). */
  isUnstarted: boolean
  /** Short, user-facing sentence for the disabled tooltip. Empty when `canEdit` is true. */
  reason: string
}

export interface UseFormEditAuthorityArgs {
  /** The persisted FormSubmission.FormType, also the matrix key. */
  formType: string
  /** The resolved instance, from `useFormWorkflowInstance()`. May be null. */
  instance: WorkflowInstanceResponse | null | undefined
  /**
   * The `canEdit` value `useFormData()` already returns (role capability + Draft/Returned
   * stage). This hook can only narrow it.
   */
  stageAllowsEdit: boolean
}

// =====================================================================================
// 2. HELPERS
// =====================================================================================

const SETTLED_STATES: PrintedSignatureState[] = [
  PrintedSignatureState.Signed,
  PrintedSignatureState.Skipped,
  PrintedSignatureState.Returned,
]

/** The step the instance is waiting on, or null. */
function pendingStepOf(
  instance: WorkflowInstanceResponse | null | undefined,
): WorkflowStepResponse | null {
  if (!instance || !Array.isArray(instance.steps)) return null

  const exact = instance.steps.find(step => step.stepNo === instance.currentStepNo)
  if (exact) return exact

  return (
    instance.steps.find(
      step =>
        step.state === WorkflowStepState.Active ||
        step.state === WorkflowStepState.AwaitingAssignment,
    ) ?? null
  )
}

/**
 * LOCAL fallback for "is the pending step mine", used only when the server did not send
 * `canIAct` (an older API build, or a cached row). Mirrors the server expression:
 * assigned to me, or my canonical role is in the step's eligible roles.
 */
function localStepIsMine(
  step: WorkflowStepResponse | null,
  canonicalRole: string | null,
  userId: number | null,
): boolean {
  if (!step || !canonicalRole) return false

  const pending =
    step.state === WorkflowStepState.Active ||
    step.state === WorkflowStepState.AwaitingAssignment
  if (!pending) return false

  if (userId !== null && step.assignedToUserId === userId) return true

  return (step.eligibleRoles ?? []).some(role => normalizeRole(role) === canonicalRole)
}

// =====================================================================================
// 3. THE HOOK
// =====================================================================================

export function useFormEditAuthority({
  formType,
  instance,
  stageAllowsEdit,
}: UseFormEditAuthorityArgs): FormEditAuthority {
  const signer = useCurrentSigner()

  const canonicalRole = signer.canonicalRole ?? null
  const userId = signer.userId

  return useMemo<FormEditAuthority>(() => {
    const isAdmin = canonicalRole === ORG_ROLES.Admin
    const isUnstarted = !instance

    // ---- The printed line this signer owns, straight from the matrix -----------------
    const slots = signatureSlotsFor(formType)
    const ownedSlotIndex = canonicalRole
      ? slots.findIndex(
          slot =>
            slot.expectedRoles.length > 0 &&
            slot.expectedRoles.includes(canonicalRole as never),
        )
      : -1

    // ---- Has that line already been settled? ----------------------------------------
    let ownedRow: PrintedSignatureRow | null = null
    if (ownedSlotIndex >= 0) {
      const matched = matchRowsToSlots(slots, buildSignatureRows(instance ?? null))
      ownedRow = matched[ownedSlotIndex] ?? null
    }
    const ownedLineLocked = !!ownedRow && SETTLED_STATES.includes(ownedRow.state)

    // ---- Is the pending step mine? Server flag first ---------------------------------
    const pendingStep = pendingStepOf(instance)

    // A record sitting WITH ITS ORIGINATOR (Draft / Returned) belongs to the PREPARER
    // alone. The server deliberately answers canIAct=false on a Draft step — the verb
    // there is Submit, never Approve — so draft ownership is decided by the originator
    // id, not by "anybody holding a preparing role".
    const isOriginator = !!instance && instance.originatorUserId === userId
    const pendingIsWithOriginator =
      !!instance &&
      (pendingStep?.kind === WorkflowStepKind.Draft
        || isWithOriginator(instance.status)
        || instance.status === ApprovalStatus.Rejected)

    const pendingManualAssignment =
      pendingStep?.state === WorkflowStepState.Active && pendingStep.requiresManualAssignment
    const canRoutePendingAssignment =
      pendingManualAssignment &&
      (isOriginator || pendingStep?.assignerRoles?.some(role => normalizeRole(role) === canonicalRole))

    const isCurrentStepMine =
      isAdmin ||
      (pendingIsWithOriginator
        ? isOriginator
        : pendingStep?.canIAct === true ||
          localStepIsMine(pendingStep, canonicalRole, userId))

    // ---- The drafting line, for a form that has not started at all -------------------
    const ownsPreparingLine =
      ownedSlotIndex >= 0 && slots[ownedSlotIndex]?.block === SignatureBlockType.PreparedBy

    // =============================================================================
    // THE DECISION
    // =============================================================================

    if (isAdmin) {
      return {
        canEdit: stageAllowsEdit,
        canApprove: true,
        isCurrentStepMine: true,
        ownedSlotIndex,
        ownedLineLocked,
        isUnstarted,
        reason: stageAllowsEdit ? '' : 'The form is not in an editable stage.',
      }
    }

    // Rejected forms are returned for correction. The rejection workflow already
    // authorizes the correction at the form level, so do not hide the header Edit
    // action because the refreshed workflow instance has stale ownership metadata.
    if (stageAllowsEdit && instance?.status === ApprovalStatus.Rejected) {
      return {
        canEdit: true,
        canApprove: false,
        isCurrentStepMine: true,
        ownedSlotIndex,
        ownedLineLocked: false,
        isUnstarted,
        reason: '',
      }
    }

    const canApprove = isCurrentStepMine && !ownedLineLocked

    // A recorded outcome on my own line is final: I never edit this form again.
    if (ownedLineLocked) {
      return {
        canEdit: false,
        canApprove: false,
        isCurrentStepMine,
        ownedSlotIndex,
        ownedLineLocked,
        isUnstarted,
        reason:
          'Your signature is already recorded on this form, so it can no longer be edited.',
      }
    }

    if (!stageAllowsEdit) {
      return {
        canEdit: false,
        canApprove,
        isCurrentStepMine,
        ownedSlotIndex,
        ownedLineLocked,
        isUnstarted,
        reason: 'The form is not in an editable stage.',
      }
    }

    if (pendingManualAssignment && !canRoutePendingAssignment) {
      return {
        canEdit: false,
        canApprove,
        isCurrentStepMine,
        ownedSlotIndex,
        ownedLineLocked,
        isUnstarted,
        reason: 'Only the form originator or an authorized assigner may edit before routing.',
      }
    }

    // A brand-new form: only the role that PREPARES this sheet may open it for editing.
    if (isUnstarted) {
      const allowed = ownedSlotIndex < 0 ? false : ownsPreparingLine
      return {
        canEdit: allowed,
        canApprove,
        isCurrentStepMine,
        ownedSlotIndex,
        ownedLineLocked,
        isUnstarted,
        reason: allowed
          ? ''
          : 'Only the role that prepares this form may create its draft.',
      }
    }

    // A running form: the pending step decides, exactly like the server does.
    return {
      canEdit: isCurrentStepMine,
      canApprove,
      isCurrentStepMine,
      ownedSlotIndex,
      ownedLineLocked,
      isUnstarted,
      reason: isCurrentStepMine
        ? ''
        : 'This form is waiting on another role, so you cannot edit it.',
    }
  }, [formType, instance, stageAllowsEdit, canonicalRole, userId])
}