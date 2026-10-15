/**
 * =====================================================================================
 * AMENDED v15 - CMT.Frontend/src/components/workflow/WorkflowStepActions.tsx  (NEW FILE)
 * Copy to: CMT.Frontend/src/components/workflow/WorkflowStepActions.tsx
 *
 * WHAT THIS FILE IS
 * -----------------
 * The REPLACEMENT for `src/components/self-evaluation/ApprovalWorkflowActions.tsx`.
 * It is the single action bar of ONE workflow instance and it covers every column of the
 * Functional Workflow Matrix.
 *
 * WHY ApprovalWorkflowActions.tsx HAD TO BE REPLACED
 * -------------------------------------------------
 * The old component cannot express the matrix, for six structural reasons:
 *
 *   (1) FIVE ACTIONS ONLY - Submit / Approve / Reject / Delegate / Return. There is no
 *       ASSIGN, so the STL cannot assign an ATA record to a Certifying Staff member (#4) and
 *       the Documentation Team Leader cannot assign a clerk (#5); no SKIP, so the
 *       "Optional / May Skip Now" 918/918A flag and the conditional in-house tool steps are
 *       unreachable (#6 #7 #9); no CHECKLIST, so the MNT-1325 final-release gate cannot be
 *       verified (#2); no JOINT APPROVAL, so DIR -> QA -> ECAA never generates the companion
 *       form (#9).
 *   (2) IT GUESSES THE NEXT STATUS in `handleApprove()` with a hardcoded
 *       TL -> MGR -> DIR -> QA ladder. Every non-generic chain then displays the WRONG badge
 *       until the page is reloaded: approving the Documentation Clerk step shows
 *       "Pending Director approval" instead of "Pending Documentation Team Leader sign-off".
 *       The amended API RETURNS the resulting status, step, assignee and skipped steps in
 *       `WorkflowActionResponse` - it must never be recomputed.
 *   (3) IT POSTS `delegatedTo` AS A STRING while DelegateStepRequest.DelegateToUserId is a
 *       C# long -> 400 application/problem+json.
 *   (4) IT CALLS THE PRE-v8 ROUTES `/api/self-evaluation/forms/{id}/...`, which have no
 *       assign / skip / checklist / joint-approval endpoint at all.
 *   (5) IT DERIVES PERMISSION LOCALLY from `getRolePermissions(userRole)` + the truncated
 *       8-member ApprovalStatus, so it renders 23 of the 31 real statuses as un-actionable.
 *   (6) IT CANNOT EXPLAIN A DISABLED BUTTON. The user presses Approve and only learns from a
 *       403 that the step belongs to somebody else.
 *
 * WHAT THIS VERSION DOES
 * ----------------------
 * - The SERVER IS THE AUTHORITY: every button is driven by `stepActionState()`, which reads
 *   canIAct / canIAssign / canIDelegate / canISkip off the response and only falls back to
 *   the local matrix when a flag is absent. A disabled button always carries the reason in
 *   its tooltip.
 * - The status, the pending step, the assignee and `autoSkippedSteps` come from
 *   `WorkflowActionResponse`; nothing is guessed.
 * - Assign / Delegate pickers offer ONLY legitimate candidates (`assignableFor` /
 *   `delegatableFor`), so ASSIGNEE_INVALID_ROLE / ASSIGNEE_OUTSIDE_SHOP /
 *   DELEGATE_NOT_LOWER_TIER can no longer be triggered by the UI.
 * - The primary verb follows the step KIND (Submit / Assign / Verify / Review / Approve /
 *   Sign off / Endorse / Verify checklist), so MNT-1378 says "Approve" and MNT-922C says
 *   "Sign off" as printed.
 * - Comments are enforced client side when `requiresComments` is set (COMMENTS_REQUIRED).
 * - Requirement #11: when a decision closes the folder, `folderCompleted` / `reportGenerated`
 *   are surfaced so the parent can offer the PDF immediately.
 *
 * BINDING RULES
 *   user ids are NUMBERS (C# long); instance / folder ids are STRINGS (C# Guid).
 * =====================================================================================
 */
'use client'

import { useMemo, useState } from 'react'

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
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'

import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  Loader2,
  RotateCcw,
  Send,
  Shield,
  ShieldCheck,
  SkipForward,
  UserPlus,
  Users,
  XCircle,
} from 'lucide-react'

import {
  approveWorkflowStep,
  assignWorkflowStep,
  confirmDelegatedReview,
  delegateWorkflowStep,
  enableJointApproval,
  approveAndAssignTrainingManager,
  reviewAndAssignTrainingStep,
  rejectWorkflowStep,
  requestDelegatedReview,
  returnWorkflowStep,
  skipWorkflowStep,
  submitFormDraft,
} from '@/lib/workflow/workflow-api'

import {
  ApprovalStatus,
  approvalStatusClasses,
  approvalStatusLabel,
  stepKindActionLabel,
  WorkflowStepKind,
  type WorkflowActionResponse,
  type WorkflowInstanceResponse,
  type WorkflowStepResponse,
} from '@/lib/workflow/workflow-types'

import {
  instanceFactsFrom,
  stepActionState,
  type CandidateUser,
  type WorkflowActor,
} from '@/lib/workflow/workflow-permissions'

import { useCandidateUsers, useWorkflowAction } from '@/lib/workflow/useWorkflow'
import { normalizeRole, roleLabel, workflowScopeLabel } from '@/lib/role-hierarchy'

const ASSIGNMENT_WORKFLOW_FORM_TYPES = new Set([
  'training_verification_inspection',
  'training_verification_technician',
  'inspector_proficiency',
  'competency_assessment',
])

// =====================================================================================
// Props
// =====================================================================================

export interface WorkflowStepActionsProps {
  /** The loaded instance. `null` while it is still being fetched. */
  instance: WorkflowInstanceResponse | null
  /** From `useWorkflowActor()`. `null` disables everything (never "enables by default"). */
  actor: WorkflowActor | null
  /** Called with the server answer after every successful action. */
  onActionCompleted: (response: WorkflowActionResponse) => void | Promise<void>
  /** Opens the MNT-1325 step-by-step checklist panel (requirement #2). */
  onOpenChecklist?: (step: WorkflowStepResponse) => void
  /** Draft is still with the originator: let the parent open the form editor. */
  onEdit?: () => void
  /** Requirement #9: only rendered for 918 / 918A. */
  showJointApprovalToggle?: boolean
  className?: string
}

// =====================================================================================
// Component
// =====================================================================================

export default function WorkflowStepActions({
  instance,
  actor,
  onActionCompleted,
  onOpenChecklist,
  onEdit,
  showJointApprovalToggle = false,
  className = '',
}: WorkflowStepActionsProps) {
  const { toast } = useToast()
  const { running, run } = useWorkflowAction()

  const [dialog, setDialog] = useState<
    | 'reject'
    | 'return'
    | 'assign'
    | 'approve-manager'
    | 'delegate'
    | 'skip'
    | 'request-review'
    | 'confirm-review'
    | null
  >(null)
  const [comments, setComments] = useState('')
  const [selectedUserId, setSelectedUserId] = useState('')

  const facts = useMemo(() => (instance ? instanceFactsFrom(instance) : null), [instance])

  const pendingStep = useMemo<WorkflowStepResponse | null>(() => {
    if (!instance) return null
    return instance.steps?.find(step => step.stepNo === instance.currentStepNo) ?? null
  }, [instance])

  const isSpecialAdminTrainingStage =
    pendingStep?.stepNo === 1 &&
    ['training_verification_inspection', 'training_verification_technician'].includes(
      instance?.formType ?? '',
    )

  const isManagerTrainingStage =
    pendingStep?.stepNo === 2 &&
    ['training_verification_inspection', 'training_verification_technician'].includes(
      instance?.formType ?? '',
    ) &&
    normalizeRole(actor?.role) === 'Manager'

  const isManagerHrAssignmentStage =
    pendingStep?.stepNo === 3 &&
    ['training_verification_inspection', 'training_verification_technician'].includes(
      instance?.formType ?? '',
    ) &&
    normalizeRole(actor?.role) === 'Manager'

  const isHrSpecialistFinalStage =
    pendingStep?.stepNo === 3 &&
    ['training_verification_inspection', 'training_verification_technician'].includes(
      instance?.formType ?? '',
    ) &&
    normalizeRole(actor?.role) === 'HRSpecialist'

  // HR Specialists are a global pool for the Special Admin handoff. Other assignment
  // steps remain scoped to their originating shop or functional unit.
  const candidates = useCandidateUsers({
    // Documentation and HR are central queues. Passing the originating shop here
    // hides valid unit members such as the Documentation Team Leader.
    shopId: pendingStep?.assignmentUnit || isManagerTrainingStage || isManagerHrAssignmentStage
      ? null
      : instance?.shopId ?? null,
    role: isSpecialAdminTrainingStage
      ? 'Manager'
      : isManagerTrainingStage || isManagerHrAssignmentStage
        ? 'HRSpecialist'
        : null,
    managerPool: isSpecialAdminTrainingStage,
    functionalUnit: isSpecialAdminTrainingStage || isManagerHrAssignmentStage
      ? null
      : pendingStep?.assignmentUnit ?? null,
  })

  const actionState = useMemo(() => {
    if (!actor || !facts) return null
    return stepActionState(actor, facts, pendingStep)
  }, [actor, facts, pendingStep])

  const assignable = useMemo(
    () => candidates.assignableFor(facts, pendingStep?.stepNo),
    [candidates, facts, pendingStep?.stepNo],
  )

  const managerAssignees = useMemo(
    () => candidates.users.filter(user => normalizeRole(user.role) === 'Manager'),
    [candidates.users],
  )

  const hrSpecialistAssignees = useMemo(
    () => candidates.users.filter(user => normalizeRole(user.role) === 'HRSpecialist'),
    [candidates.users],
  )

  // The Special Admin step approves step 1 and selects the Manager for step 2.
  // That target belongs to the NEXT step, so the candidate pool must be restricted to
  // the next-step role instead of the current step's role.
  const trainingManagerAssignees = managerAssignees

  const delegatable = useMemo(
    () => candidates.delegatableFor(actor, facts, pendingStep?.stepNo),
    [candidates, actor, facts, pendingStep?.stepNo],
  )

  // AMENDED v14 - the delegated-review pool: only people whose canonical role is in the
  // step's DelegatedReviewRoles. The server re-validates on POST; this only feeds the picker.
  const reviewerRoles = useMemo(
    () =>
      (pendingStep?.delegatedReviewRoles ?? [])
        .map(role => normalizeRole(role))
        .filter((role): role is NonNullable<ReturnType<typeof normalizeRole>> => !!role),
    [pendingStep?.delegatedReviewRoles],
  )

  const reviewers = useMemo(
    () =>
      reviewerRoles.length === 0
        ? []
        : candidates.users.filter(user => {
            const canonical = normalizeRole(user.role)
            return !!canonical && reviewerRoles.includes(canonical)
          }),
    [candidates.users, reviewerRoles],
  )

  if (!instance || !facts) {
    return (
      <div className={`rounded-lg border border-gray-200 bg-gray-50 p-3 ${className}`}>
        <p className="text-xs text-gray-600">The workflow record is not loaded yet.</p>
      </div>
    )
  }

  const closeDialog = () => {
    setDialog(null)
    setComments('')
    setSelectedUserId('')
  }

  /** Every mutation funnels through here: ONE toast policy, ONE authority (the server). */
  const dispatch = async (
    label: string,
    action: () => Promise<WorkflowActionResponse>,
  ): Promise<void> => {
    const response = await run(action, {
      onError: message => toast({ title: label, description: message, variant: 'destructive' }),
    })
    if (!response) return

    if (!response.success) {
      toast({ title: label, description: response.message, variant: 'destructive' })
      return
    }

    // The status / step / assignee shown next comes from the SERVER, never from a guess.
    const details: string[] = [response.message || `${label} completed.`]
    if (response.autoSkippedSteps?.length) {
      details.push(`${response.autoSkippedSteps.length} step(s) skipped automatically.`)
    }
    if (response.currentStepTitle) {
      details.push(`Now: ${response.currentStepTitle}.`)
    }
    if (response.companionInstanceId) {
      details.push('The companion regulatory form has been generated.')
    }
    if (response.folderCompleted) {
      details.push(
        response.reportGenerated
          ? 'The folder is complete and the PDF report is ready.'
          : 'The folder is complete.',
      )
    }

    toast({ title: label, description: details.join(' ') })
    closeDialog()
    await onActionCompleted(response)
  }

  const requireComments = (value: string): boolean => {
    if (value.trim()) return true
    toast({
      title: 'Comments required',
      description: 'Comments are mandatory for this action.',
      variant: 'destructive',
    })
    return false
  }

  const requireUser = (value: string): boolean => {
    if (value) return true
    toast({
      title: 'Person required',
      description: 'Select a person before sending this action.',
      variant: 'destructive',
    })
    return false
  }

  // ---------------------------------------------------------------------------
  // Action handlers - every one posts the CONTRACT shape and nothing else.
  // ---------------------------------------------------------------------------

  const handleSubmit = () =>
    dispatch('Submitted', () =>
      submitFormDraft(instance.id, {
        comments,
        // Pre-assigns the first manual-assignment step in the same round trip (#4).
        assignToUserId: selectedUserId ? Number(selectedUserId) : null,
      }),
    )

  const handlePrimaryDecision = () => {
    if (actionState?.requiresComments && !requireComments(comments)) return
    const label = actionState?.actionLabel ?? 'Approved'
    return dispatch(label, () =>
      approveWorkflowStep(instance.id, { stepNo: pendingStep?.stepNo ?? null, comments }),
    )
  }

  const handleReject = () => {
    if (!requireComments(comments)) return
    return dispatch('Rejected', () =>
      rejectWorkflowStep(instance.id, { stepNo: pendingStep?.stepNo ?? null, comments }),
    )
  }

  const handleReturn = () => {
    if (!requireComments(comments)) return
    return dispatch('Returned for rework', () =>
      returnWorkflowStep(instance.id, { stepNo: pendingStep?.stepNo ?? null, comments }),
    )
  }

  const handleAssign = () => {
    if (!requireUser(selectedUserId)) return
    if (isSpecialAdminTrainingStage) {
      return dispatch('Reviewed and assigned to Manager', () =>
        reviewAndAssignTrainingStep(instance.id, {
          stepNo: 2,
          assignToUserId: Number(selectedUserId),
          comments,
        }),
      )
    }
    if (isManagerHrAssignmentStage) {
      return dispatch('Approved and assigned to HR Specialist', () =>
        approveAndAssignTrainingManager(instance.id, {
          stepNo: 3,
          assignToUserId: Number(selectedUserId),
          comments,
        }),
      )
    }
    return dispatch('Assigned', () =>
      assignWorkflowStep(instance.id, {
        stepNo: pendingStep?.stepNo ?? null,
        assignToUserId: Number(selectedUserId),
        comments,
      }),
    )
  }

  const handleApproveManager = () => {
    if (!requireUser(selectedUserId)) return
    return dispatch('Approved', () =>
      approveAndAssignTrainingManager(instance.id, {
        stepNo: 3,
        assignToUserId: Number(selectedUserId),
        comments,
      }),
    )
  }

  const handleDelegate = () => {
    if (!requireUser(selectedUserId)) return
    // The reason is MANDATORY: it is the "workload is high" justification of requirement #4.
    if (!requireComments(comments)) return
    return dispatch('Delegated', () =>
      delegateWorkflowStep(instance.id, {
        stepNo: pendingStep?.stepNo ?? null,
        delegateToUserId: Number(selectedUserId),
        reason: comments,
      }),
    )
  }

  // AMENDED v14 - the approver sends the step to a delegated reviewer and KEEPS the approval.
  const handleRequestReview = () => {
    if (!requireUser(selectedUserId)) return
    return dispatch('Review delegated', () =>
      requestDelegatedReview(instance.id, {
        stepNo: pendingStep?.stepNo ?? null,
        reviewerUserId: Number(selectedUserId),
        comments,
      }),
    )
  }

  // AMENDED v14 - the delegated reviewer confirms; the step returns to its original approver.
  const handleConfirmReview = () => {
    if (actionState?.delegatedReviewRequiresComments && !requireComments(comments)) return
    return dispatch('Delegated review confirmed', () =>
      confirmDelegatedReview(instance.id, {
        stepNo: pendingStep?.stepNo ?? null,
        comments,
      }),
    )
  }

  const handleSkip = () => {
    if (!requireComments(comments)) return
    return dispatch('Step skipped', () =>
      skipWorkflowStep(instance.id, { stepNo: pendingStep?.stepNo ?? null, reason: comments }),
    )
  }

  const handleJointApproval = (enable: boolean) =>
    dispatch(enable ? 'Joint approval enabled' : 'Joint approval disabled', () =>
      enableJointApproval(instance.id, {
        enable,
        regulatoryTargetDate: instance.regulatoryTargetDate ?? null,
        generateCompanionForm: enable,
      }),
    )

  // ---------------------------------------------------------------------------
  // Derived visibility
  // ---------------------------------------------------------------------------

  const isDraftWithOriginator =
    instance.status === ApprovalStatus.Draft ||
    instance.status === ApprovalStatus.Rejected ||
    instance.status === ApprovalStatus.Returned

  const canSubmitDraft = isDraftWithOriginator && instance.originatorUserId === actor?.userId
  const canAct = actionState?.canAct.allowed === true && !instance.isLocked && !instance.isComplete
  const canAssign = actionState?.canAssign.allowed === true && !instance.isLocked
  const canDelegate = actionState?.canDelegate.allowed === true && !instance.isLocked
  // AMENDED v14 - delegated review: request (approver keeps the approval) vs confirm (reviewer).
  const isAwaitingReview = actionState?.isAwaitingDelegatedReview === true
  const canRequestReview =
    actionState?.canRequestDelegatedReview.allowed === true &&
    !instance.isLocked &&
    !isAwaitingReview
  const canConfirmReview =
    actionState?.canConfirmDelegatedReview.allowed === true && !instance.isLocked
  const canSkip = actionState?.canSkip.allowed === true && !instance.isLocked
  // A routing owner should receive Assign without being presented with a direct
  // approval decision that the server will not allow.
  const assignmentOnly = canAssign && !canAct
  const isChecklistGate = pendingStep?.kind === WorkflowStepKind.Gate
  const isAssignmentWorkflowForm = ASSIGNMENT_WORKFLOW_FORM_TYPES.has(instance.formType)

  const primaryLabel = pendingStep
    ? stepKindActionLabel(pendingStep.kind)
    : stepKindActionLabel(null)

  const candidateLabel = (user: CandidateUser): string => {
    const name = user.fullName || `User ${user.userId}`
    const parts = [name, roleLabel(user.role)]
    if (user.employeeNo) parts.push(user.employeeNo)
    if (user.openTickets !== null && user.openTickets !== undefined) {
      parts.push(`${user.openTickets} open`)
    }
    return parts.filter(Boolean).join(' · ')
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* ---------- Status header: everything below comes from the server ---------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
        <div className="flex items-start gap-3">
          <Shield className="mt-0.5 h-4 w-4 text-gray-500" />
          <div>
            <p className="text-xs font-medium text-gray-500">
              {instance.formNo ? `${instance.formNo} · ` : ''}
              {instance.sectionTitle || 'Workflow status'}
            </p>
            <Badge className={`mt-1 border ${approvalStatusClasses(instance.status)}`}>
              {instance.statusLabel || approvalStatusLabel(instance.status)}
            </Badge>
            {pendingStep && (
              <p className="mt-1 text-xs text-gray-600">
                Step {pendingStep.stepNo}/{instance.totalSteps} — {pendingStep.title}
                {pendingStep.eligibleRoleLabels?.length
                  ? ` · ${pendingStep.eligibleRoleLabels.join(' / ')}`
                  : ''}
              </p>
            )}
          </div>
        </div>

        <div className="text-right text-xs text-gray-600">
          <p>
            {instance.currentAssigneeName
              ? `Assigned to ${instance.currentAssigneeName}`
              : instance.currentAssignmentUnit
                ? `Team queue: ${instance.currentAssignmentUnit}`
                : 'Not assigned yet'}
          </p>
          <p className="mt-0.5">{instance.progressPercent}% complete</p>
          {actionState && (
            <p className="mt-0.5 text-[11px] text-gray-500">
              {workflowScopeLabel(actionState.scope)}
            </p>
          )}
        </div>
      </div>

      {/* ---------- Why nothing can be done, stated explicitly ---------- */}
      {!canAct && actionState?.disabledReason && !instance.isComplete && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
          <p className="text-xs text-amber-900">{actionState.disabledReason}</p>
        </div>
      )}

      {instance.isLocked && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-300 bg-slate-100 p-3">
          <FileSignature className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-600" />
          <p className="text-xs text-slate-800">
            The record is signed off and locked. Raise an amendment or a revision cycle to change it.
          </p>
        </div>
      )}

      {actionState?.needsAssignment && (
        <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3">
          <UserPlus className="mt-0.5 h-4 w-4 flex-shrink-0 text-violet-600" />
          <p className="text-xs text-violet-900">
            This step must be assigned to a named person before it can start.
          </p>
        </div>
      )}

      {isAwaitingReview && (
        <div className="flex items-start gap-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
          <ArrowRightLeft className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-600" />
          <p className="text-xs text-indigo-900">
            A delegated review is in progress on this step. The designated reviewer must confirm it
            before the approval returns to its owner.
          </p>
        </div>
      )}

      {/* ---------- Action bar ---------- */}
      <div className="flex flex-wrap gap-2">
        {onEdit && (isDraftWithOriginator || isSpecialAdminTrainingStage || isManagerTrainingStage || isHrSpecialistFinalStage) && (
          <Button size="sm" variant="outline" onClick={onEdit} disabled={running}>
            Edit Form
          </Button>
        )}

        {canSubmitDraft && !assignmentOnly && (
          <Button
            size="sm"
            className="bg-blue-600 text-white hover:bg-blue-700"
            onClick={() => void handleSubmit()}
            disabled={running}
          >
            {running ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="mr-1 h-3.5 w-3.5" />
            )}
            Submit
          </Button>
        )}

        {/* The MNT-1325 gate is verified item by item, never approved in one click. */}
        {canAct && !isAssignmentWorkflowForm && isChecklistGate && onOpenChecklist && pendingStep && (
          <Button
            size="sm"
            className="bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={() => onOpenChecklist(pendingStep)}
            disabled={running}
          >
            <ClipboardCheck className="mr-1 h-3.5 w-3.5" />
            Verify checklist ({pendingStep.checklistVerifiedItems}/{pendingStep.checklistTotalItems})
          </Button>
        )}

        {canAct && !isAssignmentWorkflowForm && !assignmentOnly && !isChecklistGate && !isAwaitingReview && !isSpecialAdminTrainingStage && !isManagerTrainingStage && (
          <Button
            size="sm"
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={() => void handlePrimaryDecision()}
            disabled={running}
            title={primaryLabel}
          >
            {running ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            )}
            {primaryLabel}
          </Button>
        )}

        {isSpecialAdminTrainingStage && !instance.isLocked && !instance.isComplete && (
          <Button
            size="sm"
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={() => setDialog('assign')}
            disabled={running}
          >
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            Review
          </Button>
        )}

        {canAct && isManagerTrainingStage && (
          <Button
            size="sm"
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={() => setDialog('approve-manager')}
            disabled={running}
          >
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            Approve
          </Button>
        )}

        {canAct && isHrSpecialistFinalStage && (
          <Button
            size="sm"
            className="bg-green-600 text-white hover:bg-green-700"
            onClick={() => void handlePrimaryDecision()}
            disabled={running}
          >
            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
            Final Approval
          </Button>
        )}

        {canAct && !assignmentOnly && !isAwaitingReview && (
          <>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setDialog('reject')}
              disabled={running}
            >
              <XCircle className="mr-1 h-3.5 w-3.5" />
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 text-amber-800 hover:bg-amber-50"
              onClick={() => setDialog('return')}
              disabled={running}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" />
              Return For Rework
            </Button>
          </>
        )}

        {canAssign && !isManagerTrainingStage && !isManagerHrAssignmentStage && (
          <Button
            size="sm"
            variant="outline"
            className="border-violet-300 text-violet-800 hover:bg-violet-50"
            onClick={() => setDialog('assign')}
            disabled={running}
          >
            <UserPlus className="mr-1 h-3.5 w-3.5" />
            {isAssignmentWorkflowForm || !instance.currentAssigneeUserId ? 'Assign' : 'Re-assign'}
          </Button>
        )}

        {canDelegate && !isAssignmentWorkflowForm && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialog('delegate')}
            disabled={running}
          >
            <Users className="mr-1 h-3.5 w-3.5" />
            Delegate
          </Button>
        )}

        {/* AMENDED v14 - delegate the REVIEW while keeping the approval. */}
        {canRequestReview && !isAssignmentWorkflowForm && (
          <Button
            size="sm"
            variant="outline"
            className="border-indigo-300 text-indigo-800 hover:bg-indigo-50"
            onClick={() => setDialog('request-review')}
            disabled={running}
          >
            <ArrowRightLeft className="mr-1 h-3.5 w-3.5" />
            Delegate review
          </Button>
        )}

        {/* AMENDED v14 - the delegated reviewer confirms; the step returns to its approver. */}
        {isAwaitingReview && !isAssignmentWorkflowForm && (
          <Button
            size="sm"
            className="bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            onClick={() => setDialog('confirm-review')}
            disabled={running || !canConfirmReview}
            title={canConfirmReview ? undefined : actionState?.canConfirmDelegatedReview?.reason}
          >
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            Confirm review
          </Button>
        )}

        {canSkip && !isAssignmentWorkflowForm && (
          <Button
            size="sm"
            variant="outline"
            className="border-sky-300 text-sky-800 hover:bg-sky-50"
            onClick={() => setDialog('skip')}
            disabled={running}
            title={
              instance.maySkipNow
                ? 'Optional / May Skip Now'
                : 'This step is marked skippable by the catalog.'
            }
          >
            <SkipForward className="mr-1 h-3.5 w-3.5" />
            Skip now
          </Button>
        )}

        {/* Requirement #9: DIR -> QA (MNT-918) -> ECAA Team (MNT-918A). */}
        {showJointApprovalToggle && canAct && !isAssignmentWorkflowForm && (
          <Button
            size="sm"
            variant="outline"
            className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
            onClick={() => void handleJointApproval(!instance.jointApprovalEnabled)}
            disabled={running}
          >
            <FileSignature className="mr-1 h-3.5 w-3.5" />
            {instance.jointApprovalEnabled ? 'Disable joint approval' : 'Enable joint approval'}
          </Button>
        )}
      </div>

      {/* =================== Dialogs =================== */}

      <Dialog
        open={dialog === 'reject' || dialog === 'return' || dialog === 'skip'}
        onOpenChange={open => (open ? undefined : closeDialog())}
      >
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle>
              {dialog === 'reject'
                ? 'Reject this step'
                : dialog === 'return'
                  ? 'Return for rework'
                  : 'Skip this step'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'skip'
                ? 'A skip is written to the audit log, so the reason is mandatory.'
                : 'The comment is written to the audit log and shown to the originator.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm font-medium">
              {dialog === 'skip' ? 'Reason *' : 'Comments *'}
            </Label>
            <Textarea
              value={comments}
              onChange={event => setComments(event.target.value)}
              rows={4}
              placeholder={
                dialog === 'skip'
                  ? 'Why is this step not applicable right now?'
                  : 'Explain what must be corrected...'
              }
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={running}>
              Cancel
            </Button>
            <Button
              className={
                dialog === 'reject'
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : dialog === 'return'
                    ? 'bg-amber-600 text-white hover:bg-amber-700'
                    : 'bg-sky-600 text-white hover:bg-sky-700'
              }
              onClick={() => {
                if (dialog === 'reject') void handleReject()
                else if (dialog === 'return') void handleReturn()
                else void handleSkip()
              }}
              disabled={running}
            >
              {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === 'assign' || dialog === 'approve-manager' || dialog === 'delegate'}
        onOpenChange={open => (open ? undefined : closeDialog())}
      >
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle>
              {dialog === 'assign' && isSpecialAdminTrainingStage
                ? 'Review and assign to Respective Manager'
                : dialog === 'approve-manager'
                ? 'Approve and assign to HR Specialist'
                : dialog === 'assign' && isManagerHrAssignmentStage
                ? 'Assign to HR Specialist'
                : dialog === 'assign'
                  ? 'Assign this step'
                  : 'Delegate to lower-tier staff'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'assign' && isSpecialAdminTrainingStage
                ? 'Select the Respective Manager who will approve this training verification.'
                : dialog === 'approve-manager'
                ? 'Select the HR Specialist who will complete the final verification step.'
                : dialog === 'assign' && isManagerHrAssignmentStage
                ? 'Select the HR Specialist who will process the next step.'
                : dialog === 'assign'
                ? 'Only people whose role is eligible for this step - and who belong to the required shop or functional unit - are listed.'
                : 'Only people strictly less senior than you are listed. The reason is mandatory.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {dialog === 'approve-manager' || dialog === 'assign' ? 'Assign to *' : 'Delegate to *'}
              </Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      candidates.loading ? 'Loading people...' : 'Select a person...'
                    }
                  />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {(dialog === 'approve-manager'
                    ? hrSpecialistAssignees
                    : dialog === 'assign' && isSpecialAdminTrainingStage
                    ? trainingManagerAssignees
                    : dialog === 'assign'
                    ? assignable
                    : delegatable).map(user => (
                    <SelectItem key={user.userId} value={String(user.userId)}>
                      {candidateLabel(user)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!candidates.loading &&
                (dialog === 'approve-manager'
                  ? hrSpecialistAssignees
                  : dialog === 'assign' && isSpecialAdminTrainingStage
                  ? trainingManagerAssignees
                  : dialog === 'assign'
                  ? assignable
                  : delegatable).length === 0 && (
                  <p className="text-xs text-amber-800">
                    {candidates.error ??
                      (dialog === 'assign' && isSpecialAdminTrainingStage
                        ? 'No Manager users are available in the user directory.'
                        : dialog === 'assign' && isManagerHrAssignmentStage
                        ? 'No active HR Specialists are currently available.'
                        : 'Nobody currently satisfies the role, shop and functional-unit rules of this step.')}
                  </p>
                )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                {dialog === 'delegate' ? 'Reason *' : 'Comments'}
              </Label>
              <Textarea
                value={comments}
                onChange={event => setComments(event.target.value)}
                rows={3}
                placeholder={
                  dialog === 'delegate'
                    ? 'e.g. workload is high this week'
                    : 'Optional note for the assignee...'
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={running}>
              Cancel
            </Button>
            <Button
              className="bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => {
                if (dialog === 'approve-manager') void handleApproveManager()
                else if (dialog === 'assign') void handleAssign()
                else void handleDelegate()
              }}
              disabled={running}
            >
              {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {dialog === 'assign' && isSpecialAdminTrainingStage
                ? 'Assign to Respective Manager'
                : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================== Delegated review dialogs (AMENDED v14) =================== */}

      <Dialog
        open={dialog === 'request-review'}
        onOpenChange={open => (open ? undefined : closeDialog())}
      >
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle>Delegate the review of this step</DialogTitle>
            <DialogDescription>
              You keep the approval: the designated reviewer only confirms the review, then the step
              returns to you for the final decision.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Reviewer *</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={candidates.loading ? 'Loading people...' : 'Select a reviewer...'}
                  />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {reviewers.map(user => (
                    <SelectItem key={user.userId} value={String(user.userId)}>
                      {candidateLabel(user)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!candidates.loading && reviewers.length === 0 && (
                <p className="text-xs text-amber-800">
                  {candidates.error ?? 'Nobody matches the review pool of this step.'}
                </p>
              )}
              {reviewerRoles.length > 0 && (
                <p className="text-xs text-gray-600">
                  Review pool: {reviewerRoles.map(roleLabel).join(' / ')}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Comments</Label>
              <Textarea
                value={comments}
                onChange={event => setComments(event.target.value)}
                rows={3}
                placeholder="Optional context for the reviewer..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={running}>
              Cancel
            </Button>
            <Button
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => void handleRequestReview()}
              disabled={running}
            >
              {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send for review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === 'confirm-review'}
        onOpenChange={open => (open ? undefined : closeDialog())}
      >
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle>Confirm the delegated review</DialogTitle>
            <DialogDescription>
              Confirming routes the step back to its original approver
              {actionState?.delegatedReviewRequiresComments
                ? '; your review comments are mandatory.'
                : '.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <Label className="text-sm font-medium">
              Review comments{actionState?.delegatedReviewRequiresComments ? ' *' : ''}
            </Label>
            <Textarea
              value={comments}
              onChange={event => setComments(event.target.value)}
              rows={4}
              placeholder="Record the outcome of your review..."
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={running}>
              Cancel
            </Button>
            <Button
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => void handleConfirmReview()}
              disabled={running}
            >
              {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}