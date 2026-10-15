/**
 * =====================================================================================
 * AMENDED v16 - PHASE 1 (FRONTEND)
 * Copy to: CMT.Frontend/src/components/workflow/WorkflowActionBar.tsx        (NEW FILE)
 *
 * THIS FILE REPLACES  src/components/self-evaluation/ApprovalWorkflowActions.tsx
 * -----------------------------------------------------------------------------
 * The old component cannot express the Functional Workflow Matrix. Concretely:
 *
 *   OLD                                          WHY IT IS BROKEN
 *   ------------------------------------------   ------------------------------------------
 *   5 actions: submit/approve/reject/            No ASSIGN  -> STL cannot hand an ATA record
 *   delegate/return                              to a Certifying Staff member; DL cannot
 *                                                assign a clerk.
 *                                                No SKIP    -> 918/918A "Optional / May Skip
 *                                                Now" and the conditional in-house tool
 *                                                steps are unreachable.
 *                                                No CHECKLIST -> the MNT-1325 final-release
 *                                                gate cannot be verified.
 *                                                No JOINT APPROVAL -> DIR -> QA -> ECAA never
 *                                                generates the companion form.
 *   `canPerformAction(action, status, role)`      Role-shaped GUESS. Ignores assignment
 *                                                ownership, functional-unit scope, exclusive
 *                                                designation, checklist gates and the
 *                                                regulatory date. Returned false for all 23
 *                                                v8 statuses.
 *   next status computed CLIENT SIDE with a       Meaningless after v8: the chain of MNT-1420A
 *   hardcoded TL -> MGR -> DIR -> QA ladder       is DL -> clerk -> DL, not that ladder.
 *   `delegatedTo: delegateUserId` (STRING)        DelegateStepRequest.DelegateToUserId is a
 *                                                C# long -> 400 application/problem+json.
 *   `currentStatus >= step` progress dots         PendingDocumentationClerk (14) is not
 *                                                "further along" than
 *                                                PendingManagerApproval (2).
 *
 * WHAT THIS COMPONENT DOES
 * ------------------------
 * It is the ONE mutating surface for a workflow instance and covers every action of the
 * matrix: Submit, Assign, Delegate, Approve/Verify/Review/Sign-off/Endorse, Reject,
 * Return-for-rework, Skip, Checklist verify (MNT-1325 gate) and the Joint Approval toggle
 * (918 / 918A).
 *
 * THE THREE RULES IT ENFORCES
 *   (1) THE SERVER IS THE AUTHORITY. Every control is gated by `stepActionState()` from
 *       workflow-permissions.ts (v14), which prefers the server flags canIAct / canIAssign /
 *       canIDelegate / canISkip and only falls back to the local matrix to supply a REASON.
 *       A disabled button therefore always carries a human explanation in its `title`.
 *   (2) THE PRIMARY VERB IS DERIVED FROM THE STEP KIND, not hardcoded. A Verification step
 *       renders "Verify", a SignOff step "Sign off", an Endorsement step "Endorse", a Gate
 *       step "Verify checklist" (STEP_KIND_ACTION_LABELS in workflow-types.ts). That is what
 *       makes ONE component serve all 11 sections of the Table of Contents.
 *   (3) NO STATUS IS COMPUTED LOCALLY. After every action the returned
 *       `WorkflowActionResponse` is handed back through `onChanged`, and the instance is
 *       re-fetched. `autoSkippedSteps`, `companionInstanceId`, `folderCompleted` and
 *       `reportGenerated` are surfaced to the user instead of being ignored.
 *
 * BINDING RULES
 *   - assignToUserId / delegateToUserId are NUMBERS (C# long); `toUserId()` from
 *     workflow-api.ts performs the single conversion from the `<Select>` string.
 *   - instanceId is a STRING (C# Guid).
 * =====================================================================================
 */

'use client'

import { useMemo, useState } from 'react'

import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  RotateCcw,
  Send,
  ShieldCheck,
  SkipForward,
  UserPlus,
  XCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

import {
  approveWorkflowStep,
  assignWorkflowStep,
  confirmDelegatedReview,
  delegateWorkflowStep,
  enableJointApproval,
  rejectWorkflowStep,
  requestDelegatedReview,
  returnWorkflowStep,
  skipWorkflowStep,
  submitFormDraft,
  verifyChecklistItem,
} from '@/lib/workflow/workflow-api'

import {
  ApprovalStatus,
  WorkflowStepKind,
  approvalStatusClasses,
  type WorkflowActionResponse,
  type WorkflowInstanceResponse,
} from '@/lib/workflow/workflow-types'

import {
  stepActionState,
  type InstanceFacts,
  type WorkflowActor,
  type CandidateUser,
} from '@/lib/workflow/workflow-permissions'

import { useWorkflowAction } from '@/lib/workflow/useWorkflow'
import { functionalUnitLabel, roleLabelWithCode, workflowScopeLabel } from '@/lib/role-hierarchy'

// =====================================================================================
// 1. PROPS
// =====================================================================================

export interface WorkflowActionBarProps {
  /** The loaded instance (GET /api/workflow/forms/{instanceId}). */
  instance: WorkflowInstanceResponse | null
  /** Normalised facts, from `instanceFactsFrom(instance)` in useWorkflowInstance(). */
  facts: InstanceFacts | null
  /** The caller, from `useWorkflowActor()`. Null while still loading. */
  actor: WorkflowActor | null

  /** Candidates for the ASSIGN dialog: `candidates.assignableFor(facts)`. */
  assignableUsers?: CandidateUser[]
  /** Candidates for the DELEGATE dialog: `candidates.delegatableFor(actor, facts)`. */
  delegatableUsers?: CandidateUser[]
  /**
   * AMENDED v14 - candidates for the REQUEST-REVIEW dialog: the pool matching the step's
   * DelegatedReviewRoles. Falls back to `delegatableUsers` when omitted.
   */
  reviewerUsers?: CandidateUser[]

  /**
   * The current FormDataJson of the editor, sent with Submit / Approve so a late edit is
   * persisted in the same round trip. Omit it to keep the stored payload untouched.
   */
  formDataJson?: string | null

  /** Called after every successful action so the parent can re-fetch and refresh the ToC. */
  onChanged?: (result: WorkflowActionResponse) => void | Promise<void>
  /** Called when the joint approval path generated the companion 918A instance. */
  onCompanionCreated?: (companionInstanceId: string) => void

  /** Checklist item codes of the MNT-1325 gate ("PAGE-07", "TOOL-EQ-03", "FAC-TEMP", ...). */
  checklistItemCodes?: string[]

  className?: string
}

type DialogKind =
  | 'assign'
  | 'delegate'
  | 'request-review'
  | 'confirm-review'
  | 'reject'
  | 'return'
  | 'skip'
  | 'checklist'
  | 'joint'
  | null

// =====================================================================================
// 2. COMPONENT
// =====================================================================================

export default function WorkflowActionBar({
  instance,
  facts,
  actor,
  assignableUsers = [],
  delegatableUsers = [],
  reviewerUsers,
  formDataJson = null,
  onChanged,
  onCompanionCreated,
  checklistItemCodes = [],
  className = '',
}: WorkflowActionBarProps) {
  const { toast } = useToast()
  const { running, run } = useWorkflowAction()

  const [dialog, setDialog] = useState<DialogKind>(null)
  const [comments, setComments] = useState('')
  const [reason, setReason] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')
  const [returnToStepNo, setReturnToStepNo] = useState('')

  // checklist state
  const [checklistCode, setChecklistCode] = useState('')
  const [checklistFinding, setChecklistFinding] = useState('')

  // joint approval state
  const [jointDate, setJointDate] = useState('')

  const currentStep = useMemo(
    () => instance?.steps?.find(step => step.stepNo === instance.currentStepNo) ?? null,
    [instance],
  )

  /**
   * The whole gate in one object: the primary verb, the four resolved capabilities, whether
   * an assignment is still missing, the scope and the reason a control is disabled.
   * Server flags win; the local matrix only fills the gaps.
   */
  const state = useMemo(() => {
    if (!actor || !facts) return null
    return stepActionState(actor, facts, currentStep, new Date())
  }, [actor, facts, currentStep])

  const closeDialog = () => {
    setDialog(null)
    setComments('')
    setReason('')
    setSelectedUserId('')
    setReturnToStepNo('')
    setChecklistCode('')
    setChecklistFinding('')
  }

  /** Single success path: toast the server message, surface side effects, notify the parent. */
  const applyResult = async (result: WorkflowActionResponse, fallbackTitle: string) => {
    toast({
      title: result.success ? fallbackTitle : 'Not completed',
      description: result.message || result.statusLabel,
      variant: result.success ? undefined : 'destructive',
    })

    if (result.autoSkippedSteps && result.autoSkippedSteps.length > 0) {
      toast({
        title: 'Steps auto-skipped',
        description: `${result.autoSkippedSteps.length} step(s) were skipped automatically from the form fields: ${result.autoSkippedSteps.join(', ')}.`,
      })
    }

    if (result.companionInstanceId) {
      toast({
        title: 'Companion form generated',
        description: 'The joint approval path created the companion regulatory form.',
      })
      onCompanionCreated?.(result.companionInstanceId)
    }

    if (result.folderCompleted) {
      toast({
        title: 'Folder complete',
        description: result.reportGenerated
          ? 'The last task was approved and the consolidated PDF report was generated.'
          : 'The last task was approved. The folder is now marked complete.',
      })
    }

    closeDialog()
    await onChanged?.(result)
  }

  const failure = (message: string) =>
    toast({ title: 'Not completed', description: message, variant: 'destructive' })

  // ---------------------------------------------------------------------------------
  // 3. ACTIONS
  // ---------------------------------------------------------------------------------

  const doSubmit = () =>
    run(
      () =>
        submitFormDraft(instance!.id, {
          formDataJson,
          assignToUserId: selectedUserId ? Number.parseInt(selectedUserId, 10) : null,
          comments,
        }),
      {
        onSuccess: result => applyResult(result, 'Submitted'),
        onError: message => failure(message),
      },
    )

  const doAssign = () => {
    if (!selectedUserId) {
      failure('Select the person the step must be assigned to.')
      return
    }
    return run(
      () =>
        assignWorkflowStep(instance!.id, {
          stepNo: instance!.currentStepNo,
          assignToUserId: Number.parseInt(selectedUserId, 10),
          comments,
        }),
      {
        onSuccess: result => applyResult(result, 'Assigned'),
        onError: message => failure(message),
      },
    )
  }

  const doDelegate = () => {
    if (!selectedUserId) {
      failure('Select the lower-tier staff member the step is delegated to.')
      return
    }
    if (!reason.trim()) {
      failure('A justification is mandatory when delegating because of workload.')
      return
    }
    return run(
      () =>
        delegateWorkflowStep(instance!.id, {
          stepNo: instance!.currentStepNo,
          delegateToUserId: Number.parseInt(selectedUserId, 10),
          reason,
        }),
      {
        onSuccess: result => applyResult(result, 'Delegated'),
        onError: message => failure(message),
      },
    )
  }

  // AMENDED v14 - the approver sends the step to a delegated reviewer and KEEPS the approval.
  const doRequestReview = () => {
    if (!selectedUserId) {
      failure('Select the reviewer who will confirm this step.')
      return
    }
    return run(
      () =>
        requestDelegatedReview(instance!.id, {
          stepNo: instance!.currentStepNo,
          reviewerUserId: Number.parseInt(selectedUserId, 10),
          comments,
        }),
      {
        onSuccess: result => applyResult(result, 'Review delegated'),
        onError: message => failure(message),
      },
    )
  }

  // AMENDED v14 - the delegated reviewer confirms; the step returns to its original approver.
  const doConfirmReview = () => {
    if (state?.delegatedReviewRequiresComments && !comments.trim()) {
      failure('The delegated review must include your review comments before it can be confirmed.')
      return
    }
    return run(
      () =>
        confirmDelegatedReview(instance!.id, {
          stepNo: instance!.currentStepNo,
          comments,
        }),
      {
        onSuccess: result => applyResult(result, 'Delegated review confirmed'),
        onError: message => failure(message),
      },
    )
  }

  const doApprove = () => {
    if (state?.requiresComments && !comments.trim()) {
      failure('Comments are mandatory on this step.')
      return
    }
    return run(
      () =>
        approveWorkflowStep(instance!.id, {
          stepNo: instance!.currentStepNo,
          comments,
          formDataJson,
        }),
      {
        onSuccess: result => applyResult(result, state?.actionLabel ?? 'Approved'),
        onError: message => failure(message),
      },
    )
  }

  const doReject = () => {
    if (!reason.trim()) {
      failure('A reason is mandatory when rejecting.')
      return
    }
    return run(
      () => rejectWorkflowStep(instance!.id, { stepNo: instance!.currentStepNo, comments: reason }),
      {
        onSuccess: result => applyResult(result, 'Rejected'),
        onError: message => failure(message),
      },
    )
  }

  const doReturn = () => {
    if (!reason.trim()) {
      failure('Explain what must be corrected before returning the form.')
      return
    }
    const parsed = returnToStepNo ? Number.parseInt(returnToStepNo, 10) : null
    return run(
      () =>
        returnWorkflowStep(instance!.id, {
          stepNo: instance!.currentStepNo,
          comments: reason,
          returnToStepNo: Number.isFinite(parsed as number) ? parsed : null,
        }),
      {
        onSuccess: result => applyResult(result, 'Returned for rework'),
        onError: message => failure(message),
      },
    )
  }

  const doSkip = () => {
    if (!reason.trim()) {
      failure('A reason is mandatory when skipping a step.')
      return
    }
    return run(
      () => skipWorkflowStep(instance!.id, { stepNo: instance!.currentStepNo, reason }),
      {
        onSuccess: result => applyResult(result, 'Step skipped'),
        onError: message => failure(message),
      },
    )
  }

  const doChecklist = (verified: boolean) => {
    if (!checklistCode.trim()) {
      failure('Enter or select the checklist item code.')
      return
    }
    if (!verified && !checklistFinding.trim()) {
      failure('A finding is mandatory when an item is not verified.')
      return
    }
    return run(
      () =>
        verifyChecklistItem(instance!.id, {
          stepNo: instance!.currentStepNo,
          itemCode: checklistCode.trim(),
          verified,
          finding: checklistFinding,
        }),
      {
        onSuccess: async result => {
          toast({
            title: verified ? 'Item verified' : 'Finding recorded',
            description: result.message || `${checklistCode.trim()} updated.`,
          })
          setChecklistCode('')
          setChecklistFinding('')
          await onChanged?.(result)
        },
        onError: message => failure(message),
      },
    )
  }

  const doJointApproval = (enable: boolean) =>
    run(
      () =>
        enableJointApproval(instance!.id, {
          enable,
          regulatoryTargetDate: jointDate || null,
          generateCompanionForm: enable,
        }),
      {
        onSuccess: result =>
          applyResult(result, enable ? 'Joint approval path enabled' : 'Joint approval disabled'),
        onError: message => failure(message),
      },
    )

  // ---------------------------------------------------------------------------------
  // 4. GUARDS
  // ---------------------------------------------------------------------------------

  if (!instance) {
    return (
      <div className={`rounded-md border border-gray-200 bg-gray-50 px-3 py-2 ${className}`}>
        <p className="text-xs text-gray-600">
          No approval chain exists for this form yet. Create the draft from the Table of Contents to
          materialise its routing steps.
        </p>
      </div>
    )
  }

  if (!actor || !facts || !state) {
    return (
      <div className={`rounded-md border border-gray-200 bg-white px-3 py-2 ${className}`}>
        <p className="flex items-center gap-2 text-xs text-gray-600">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Resolving your permissions…
        </p>
      </div>
    )
  }

  const locked = instance.isLocked
  const complete = instance.isComplete
  const isDraft = instance.status === ApprovalStatus.Draft
  const withOriginator =
    instance.status === ApprovalStatus.Rejected ||
    instance.status === ApprovalStatus.Returned ||
    instance.status === ApprovalStatus.Expired

  const canSubmit = (isDraft || withOriginator) && instance.originatorUserId === actor.userId && !locked
  const isRegulatoryForm =
    instance.formType === '918_faa' || instance.formType === '918a_caa' || instance.isOptionalByRegulatoryDate

  // AMENDED v14 - reviewer pool offered by the request-review dialog.
  const reviewers = reviewerUsers ?? delegatableUsers

  return (
    <div className={`space-y-3 ${className}`}>
      {/* ================= STATUS STRIP ================= */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <ShieldCheck className="h-4 w-4 text-gray-500" aria-hidden="true" />
        <Badge className={`border text-[11px] ${approvalStatusClasses(instance.status)}`}>
          {instance.statusLabel}
        </Badge>

        {!complete && currentStep && (
          <span className="min-w-0 break-words text-xs text-gray-700 [overflow-wrap:anywhere]">
            Step {currentStep.stepNo} · {currentStep.title}
          </span>
        )}

        {instance.currentAssigneeName ? (
          <span className="text-xs text-gray-600">→ {instance.currentAssigneeName}</span>
        ) : instance.currentAssignmentUnit ? (
          <span className="text-xs text-gray-600">
            → {functionalUnitLabel(instance.currentAssignmentUnit)} queue
          </span>
        ) : null}

        <span className="ml-auto text-xs text-gray-600">
          {instance.completedSteps}/{instance.totalSteps} · {instance.progressPercent}%
        </span>
      </div>

      {/* ================= CONTEXT NOTICES ================= */}
      {locked && (
        <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
          This record is signed off and locked. Raise an amendment or a revision cycle to change it.
        </p>
      )}

      {withOriginator && (
        <p className="flex items-start gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
          <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            The record is back with its originator. Correct the form and submit it again to restart
            the chain.
          </span>
        </p>
      )}

      {state.needsAssignment && (
        <p className="flex items-start gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-900">
          <UserPlus className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            This step must be assigned before it can start
            {currentStep?.assignerRoles?.length
              ? ` (assigned by ${currentStep.assignerRoles.map(roleLabelWithCode).join(' / ')})`
              : ''}
            .
          </span>
        </p>
      )}

      {state.isAwaitingDelegatedReview && (
        <p className="flex items-start gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-900">
          <ArrowRightLeft className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            A delegated review is in progress on this step. The designated reviewer
            {state.delegatedReviewRoles.length > 0
              ? ` (${state.delegatedReviewRoles.map(roleLabelWithCode).join(' / ')})`
              : ''}{' '}
            must confirm it before the approval returns to its owner.
          </span>
        </p>
      )}

      {!complete && !locked && !state.canAct.allowed && state.disabledReason && (
        <p className="flex items-start gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">
            {state.disabledReason}
            <span className="ml-1 text-gray-500">({workflowScopeLabel(state.scope)})</span>
          </span>
        </p>
      )}

      {/* ================= ACTION BUTTONS ================= */}
      <div className="flex flex-wrap gap-2">
        {/* ---- Submit (originator) ---- */}
        {canSubmit && (
          <Button
            size="sm"
            className="bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => void doSubmit()}
            disabled={running}
          >
            {running ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1 h-3.5 w-3.5" />
            )}
            Submit for approval
          </Button>
        )}

        {/* ---- Primary verb: Approve / Verify / Review / Sign off / Endorse ---- */}
        {/* AMENDED v14 - hidden while a delegated review is in flight: the reviewer confirms, then the approver resumes. */}
        {!complete && !locked && !isDraft && !state.isAwaitingDelegatedReview && (
          <Button
            size="sm"
            className="bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            onClick={() => void doApprove()}
            disabled={running || !state.canAct.allowed}
            title={state.canAct.allowed ? undefined : state.canAct.reason}
          >
            {running ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            )}
            {state.actionLabel}
          </Button>
        )}

        {/* ---- Assign / re-assign ---- */}
        {!complete && !locked && (
          <Button
            size="sm"
            variant="outline"
            className="border-violet-300 text-violet-800 hover:bg-violet-50 disabled:opacity-50"
            onClick={() => setDialog('assign')}
            disabled={running || !state.canAssign.allowed}
            title={state.canAssign.allowed ? undefined : state.canAssign.reason}
          >
            <UserPlus className="mr-1 h-3.5 w-3.5" />
            {instance.currentAssigneeUserId ? 'Re-assign' : 'Assign'}
          </Button>
        )}

        {/* ---- Delegate to lower-tier staff ---- */}
        {!complete && !locked && (
          <Button
            size="sm"
            variant="outline"
            className="border-blue-300 text-blue-800 hover:bg-blue-50 disabled:opacity-50"
            onClick={() => setDialog('delegate')}
            disabled={running || !state.canDelegate.allowed}
            title={state.canDelegate.allowed ? undefined : state.canDelegate.reason}
          >
            <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
            Delegate
          </Button>
        )}

        {/* ---- AMENDED v14: delegate the REVIEW while keeping the approval ---- */}
        {!complete && !locked && !state.isAwaitingDelegatedReview && (
          <Button
            size="sm"
            variant="outline"
            className="border-indigo-300 text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
            onClick={() => setDialog('request-review')}
            disabled={running || !state.canRequestDelegatedReview.allowed}
            title={
              state.canRequestDelegatedReview.allowed
                ? undefined
                : state.canRequestDelegatedReview.reason
            }
          >
            <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
            Delegate review
          </Button>
        )}

        {/* ---- AMENDED v14: the delegated reviewer confirms, the step returns to its approver ---- */}
        {!complete && !locked && state.isAwaitingDelegatedReview && (
          <Button
            size="sm"
            className="bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            onClick={() => setDialog('confirm-review')}
            disabled={running || !state.canConfirmDelegatedReview.allowed}
            title={
              state.canConfirmDelegatedReview.allowed
                ? undefined
                : state.canConfirmDelegatedReview.reason
            }
          >
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            Confirm review
          </Button>
        )}

        {/* ---- Reject ---- */}
        {!complete && !locked && !isDraft && !state.isAwaitingDelegatedReview && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setDialog('reject')}
            disabled={running || !state.canAct.allowed}
            title={state.canAct.allowed ? undefined : state.canAct.reason}
          >
            <XCircle className="mr-1 h-3.5 w-3.5" />
            Reject
          </Button>
        )}

        {/* ---- Return for rework ---- */}
        {!complete && !locked && !isDraft && !state.isAwaitingDelegatedReview && (
          <Button
            size="sm"
            variant="outline"
            className="border-orange-300 text-orange-800 hover:bg-orange-50 disabled:opacity-50"
            onClick={() => setDialog('return')}
            disabled={running || !state.canAct.allowed}
            title={state.canAct.allowed ? undefined : state.canAct.reason}
          >
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Return for rework
          </Button>
        )}

        {/* ---- Skip (conditional in-house step / Optional-May-Skip-Now) ---- */}
        {!complete && !locked && (
          <Button
            size="sm"
            variant="outline"
            className="border-sky-300 text-sky-800 hover:bg-sky-50 disabled:opacity-50"
            onClick={() => setDialog('skip')}
            disabled={running || !state.canSkip.allowed}
            title={
              state.canSkip.allowed
                ? instance.maySkipNow
                  ? 'Optional / May skip now'
                  : undefined
                : state.canSkip.reason
            }
          >
            <SkipForward className="mr-1 h-3.5 w-3.5" />
            Skip step
          </Button>
        )}

        {/* ---- MNT-1325 step-by-step gate ---- */}
        {!complete && !locked && state.isChecklistGate && (
          <Button
            size="sm"
            variant="outline"
            className="border-blue-300 text-blue-800 hover:bg-blue-50 disabled:opacity-50"
            onClick={() => setDialog('checklist')}
            disabled={running || !state.canAct.allowed}
            title={state.canAct.allowed ? undefined : state.canAct.reason}
          >
            <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
            Verify checklist
            {currentStep && currentStep.checklistTotalItems > 0
              ? ` (${currentStep.checklistVerifiedItems}/${currentStep.checklistTotalItems})`
              : ''}
          </Button>
        )}

        {/* ---- Joint approval path (918 -> QA -> ECAA) ---- */}
        {!locked && isRegulatoryForm && (
          <Button
            size="sm"
            variant="outline"
            className="border-teal-300 text-teal-800 hover:bg-teal-50 disabled:opacity-50"
            onClick={() => {
              setJointDate(instance.regulatoryTargetDate?.slice(0, 10) ?? '')
              setDialog('joint')
            }}
            disabled={running}
            title="Director -> QA Personnel (MNT-918) -> ECAA Team (MNT-918A)"
          >
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            {instance.jointApprovalEnabled ? 'Joint approval: on' : 'Enable joint approval'}
          </Button>
        )}
      </div>

      {/* ================= ASSIGN DIALOG ================= */}
      <Dialog open={dialog === 'assign'} onOpenChange={open => (open ? null : closeDialog())}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-violet-600" aria-hidden="true" />
              Assign step {instance.currentStepNo}
            </DialogTitle>
            <DialogDescription>
              Only people whose role is eligible for this step — and who belong to the required shop
              or functional unit — are offered.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Assign to *</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an eligible person…" />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {assignableUsers.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No eligible person is available
                    </SelectItem>
                  ) : (
                    assignableUsers.map(candidate => (
                      <SelectItem key={candidate.userId} value={String(candidate.userId)}>
                        {candidate.fullName || `User ${candidate.userId}`} ·{' '}
                        {roleLabelWithCode(candidate.role)}
                        {candidate.openTickets !== null && candidate.openTickets !== undefined
                          ? ` · ${candidate.openTickets} open`
                          : ''}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Comments</Label>
              <Textarea
                value={comments}
                onChange={event => setComments(event.target.value)}
                rows={3}
                placeholder="Optional instruction for the assignee…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              className="bg-violet-600 text-white hover:bg-violet-700"
              onClick={() => void doAssign()}
              disabled={running}
            >
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm assignment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= DELEGATE DIALOG ================= */}
      <Dialog open={dialog === 'delegate'} onOpenChange={open => (open ? null : closeDialog())}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-blue-600" aria-hidden="true" />
              Delegate step {instance.currentStepNo}
            </DialogTitle>
            <DialogDescription>
              A step may only be delegated to strictly lower-tier staff. The justification is
              mandatory and is stored in the audit log.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Delegate to *</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select lower-tier staff…" />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {delegatableUsers.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      No lower-tier staff is available for this step
                    </SelectItem>
                  ) : (
                    delegatableUsers.map(candidate => (
                      <SelectItem key={candidate.userId} value={String(candidate.userId)}>
                        {candidate.fullName || `User ${candidate.userId}`} ·{' '}
                        {roleLabelWithCode(candidate.role)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Reason *</Label>
              <Textarea
                value={reason}
                onChange={event => setReason(event.target.value)}
                rows={3}
                placeholder="e.g. Workload is high during the C-check window."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => void doDelegate()}
              disabled={running}
            >
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm delegation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= REJECT DIALOG ================= */}
      <Dialog open={dialog === 'reject'} onOpenChange={open => (open ? null : closeDialog())}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" aria-hidden="true" />
              Reject step {instance.currentStepNo}
            </DialogTitle>
            <DialogDescription>
              The record returns to its originator and the rejection reason is printed in the audit
              log.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <Label className="text-sm font-medium">Reason *</Label>
            <Textarea
              value={reason}
              onChange={event => setReason(event.target.value)}
              rows={4}
              placeholder="Explain why this submission is rejected…"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void doReject()} disabled={running}>
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= RETURN DIALOG ================= */}
      <Dialog open={dialog === 'return'} onOpenChange={open => (open ? null : closeDialog())}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-orange-600" aria-hidden="true" />
              Return for rework
            </DialogTitle>
            <DialogDescription>
              Choose the step the record goes back to, or leave it empty to return it to the
              originator&apos;s draft step.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Return to step</Label>
              <Select value={returnToStepNo} onValueChange={setReturnToStepNo}>
                <SelectTrigger>
                  <SelectValue placeholder="Originator draft step (default)" />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {(instance.steps ?? [])
                    .filter(step => step.stepNo < instance.currentStepNo)
                    .map(step => (
                      <SelectItem key={step.stepNo} value={String(step.stepNo)}>
                        Step {step.stepNo} · {step.title}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Revision comments *</Label>
              <Textarea
                value={reason}
                onChange={event => setReason(event.target.value)}
                rows={4}
                placeholder="Explain what must be corrected or completed…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              className="bg-orange-600 text-white hover:bg-orange-700"
              onClick={() => void doReturn()}
              disabled={running}
            >
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= SKIP DIALOG ================= */}
      <Dialog open={dialog === 'skip'} onOpenChange={open => (open ? null : closeDialog())}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SkipForward className="h-5 w-5 text-sky-600" aria-hidden="true" />
              Skip step {instance.currentStepNo}
            </DialogTitle>
            <DialogDescription>
              {instance.isOptionalByRegulatoryDate
                ? 'This step is optional while the regulatory target date has not been reached. Once it is reached the server refuses the skip.'
                : 'Conditional steps such as in-house manufacturing may be skipped when they do not apply.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {instance.regulatoryTargetDate && (
              <p className="rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-xs text-sky-900">
                Regulatory target date: {instance.regulatoryTargetDate.slice(0, 10)} ·{' '}
                {instance.maySkipNow ? 'may skip now' : 'no longer deferrable'}
              </p>
            )}
            <Label className="text-sm font-medium">Reason *</Label>
            <Textarea
              value={reason}
              onChange={event => setReason(event.target.value)}
              rows={3}
              placeholder="e.g. The tool is procured, so no in-house manufacturing is required."
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              className="bg-sky-600 text-white hover:bg-sky-700"
              onClick={() => void doSkip()}
              disabled={running}
            >
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm skip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= CHECKLIST DIALOG (MNT-1325 gate) ================= */}
      <Dialog open={dialog === 'checklist'} onOpenChange={open => (open ? null : closeDialog())}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-blue-600" aria-hidden="true" />
              Periodic Capability Self-Audit gate
            </DialogTitle>
            <DialogDescription>
              Each required page, tool equivalency and facility metric is verified step by step
              before the final release.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {currentStep && currentStep.checklistTotalItems > 0 && (
              <p className="rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs text-blue-900">
                {currentStep.checklistVerifiedItems} of {currentStep.checklistTotalItems} items
                verified.
              </p>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Item code *</Label>
              {checklistItemCodes.length > 0 ? (
                <Select value={checklistCode} onValueChange={setChecklistCode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select the checklist item…" />
                  </SelectTrigger>
                  <SelectContent className="z-[110]">
                    {checklistItemCodes.map(code => (
                      <SelectItem key={code} value={code}>
                        {code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={checklistCode}
                  onChange={event => setChecklistCode(event.target.value)}
                  placeholder="e.g. PAGE-07, TOOL-EQ-03, FAC-TEMP"
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Finding (mandatory when not verified)</Label>
              <Textarea
                value={checklistFinding}
                onChange={event => setChecklistFinding(event.target.value)}
                rows={3}
                placeholder="Describe the discrepancy…"
              />
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={closeDialog}>
              Close
            </Button>
            <Button
              variant="outline"
              className="border-red-300 text-red-800 hover:bg-red-50"
              onClick={() => void doChecklist(false)}
              disabled={running}
            >
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Record finding
            </Button>
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => void doChecklist(true)}
              disabled={running}
            >
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Mark verified
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= JOINT APPROVAL DIALOG ================= */}
      <Dialog open={dialog === 'joint'} onOpenChange={open => (open ? null : closeDialog())}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-teal-600" aria-hidden="true" />
              Joint approval path (918 / 918A)
            </DialogTitle>
            <DialogDescription>
              When enabled, the companion form is generated and the sequence Director → QA
              Personnel (MNT-918) → ECAA Team (MNT-918A) is seeded.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Regulatory target date</Label>
              <Input
                type="date"
                value={jointDate}
                onChange={event => setJointDate(event.target.value)}
              />
              <p className="text-xs text-gray-600">
                Drives the dynamic “Optional / May Skip Now” flag. Leave empty when no date has been
                set yet.
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            {instance.jointApprovalEnabled && (
              <Button
                variant="outline"
                className="border-gray-300 text-gray-800 hover:bg-gray-50"
                onClick={() => void doJointApproval(false)}
                disabled={running}
              >
                {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Disable
              </Button>
            )}
            <Button
              className="bg-teal-600 text-white hover:bg-teal-700"
              onClick={() => void doJointApproval(true)}
              disabled={running}
            >
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enable joint approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= REQUEST DELEGATED REVIEW DIALOG (AMENDED v14) ================= */}
      <Dialog
        open={dialog === 'request-review'}
        onOpenChange={open => (open ? null : closeDialog())}
      >
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-indigo-600" aria-hidden="true" />
              Delegate the review of step {instance.currentStepNo}
            </DialogTitle>
            <DialogDescription>
              You keep the approval: the designated reviewer only confirms the review, then the step
              returns to you for the final decision. The signature block keeps stamping you.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Reviewer *</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reviewer from the step's review pool…" />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {reviewers.length === 0 ? (
                    <SelectItem value="__none" disabled>
                      Nobody is eligible to review this step
                    </SelectItem>
                  ) : (
                    reviewers.map(candidate => (
                      <SelectItem key={candidate.userId} value={String(candidate.userId)}>
                        {candidate.fullName || `User ${candidate.userId}`} ·{' '}
                        {roleLabelWithCode(candidate.role)}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {state.delegatedReviewRoles.length > 0 && (
                <p className="text-xs text-gray-600">
                  Review pool: {state.delegatedReviewRoles.map(roleLabelWithCode).join(' / ')}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Comments</Label>
              <Textarea
                value={comments}
                onChange={event => setComments(event.target.value)}
                rows={3}
                placeholder="Optional context for the reviewer…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => void doRequestReview()}
              disabled={running}
            >
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send for review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================= CONFIRM DELEGATED REVIEW DIALOG (AMENDED v14) ================= */}
      <Dialog
        open={dialog === 'confirm-review'}
        onOpenChange={open => (open ? null : closeDialog())}
      >
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-600" aria-hidden="true" />
              Confirm the delegated review of step {instance.currentStepNo}
            </DialogTitle>
            <DialogDescription>
              Confirming routes the step back to its original approver
              {state.delegatedReviewRequiresComments
                ? '; your review comments are mandatory.'
                : '.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <Label className="text-sm font-medium">
              Review comments{state.delegatedReviewRequiresComments ? ' *' : ''}
            </Label>
            <Textarea
              value={comments}
              onChange={event => setComments(event.target.value)}
              rows={4}
              placeholder="Record the outcome of your review…"
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => void doConfirmReview()}
              disabled={running}
            >
              {running ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Confirm review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Re-exported so a parent can decide whether to render the checklist button at all without
 * duplicating the enum import.
 */
export const CHECKLIST_GATE_KIND = WorkflowStepKind.Gate