/**ApprovalWorkflowActions Component - AMENDED v26 (ROLE-BASED WORKFLOW SIMPLIFICATION)
 *
 * WHAT v26 CHANGES (per the "Simplify the Approval Workflow (Role-Based Logic)" +
 * "Enhance the Delegate Button" amendments):
 *
 *  1. SCENARIO A — Shop-Team-Leader-prepared records (originator-led) render a single
 *     CONFIRM button with an OPTIONAL comment field. Reject, Request Revision and
 *     Submit are NOT rendered on this path — a leader unhappy with their own record
 *     amends it (Edit) instead. Confirming finalizes the record IMMEDIATELY.
 *
 *  2. SCENARIO B — Engineer- or delegate-prepared records route to the Shop Team
 *     Leader, who holds FULL authority at the review stage: edit the record directly,
 *     APPROVE with an optional comment, REJECT with a mandatory reason, SEND BACK for
 *     revision (real /return endpoint now — the record STAYS ALIVE), or delegate.
 *
 *  3. OPTIONAL APPROVAL COMMENT — the Approve AND Confirm actions open a dialog with
 *     an optional approval comment field (the requirement: "include an optional
 *     approval comment field for users to add comments as they approve"). An empty
 *     comment is a valid approval; the backend persists "No comment provided".
 *
 *  4. DELEGATE UPGRADE — the Delegate dialog now grants REAL authority: it sends
 *     `assignToUserName` (the server resolves the delegation grant by display name)
 *     and the delegated `responsibility` level (full workflow / approval-only /
 *     creation-only), plus an optional expiration date. A live delegate sees a
 *     disclosure badge and receives delegated-level workflow actions (edit, submit,
 *     approve, reject, return) — the server re-verifies every action.
 *
 * CARRIED FORWARD (v24/v25 notes):
 *  - v25 removed the gray "Approval Status" informational box; audit provenance lives
 *    exclusively in the "Record." stamp (RecordAccountabilityStamp).
 *  - v24/v6 bug fixes preserved: reassign sends numeric assignToUserId; ApiError
 *    guarded instanceof; the signed-in user id feeds the fallback's assigned-preparer
 *    rule; trailSource disclosure.
 *  - All existing props are unchanged, so every call site (DocumentWorkspace,
 *    FormDocumentChrome, the 8 form cards) keeps compiling as-is.
 */
'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription
} from '@/components/ui/dialog'
import {
  Send, CheckCircle2, XCircle, RotateCcw, Users, Loader2,
  AlertTriangle, Pencil, ShieldCheck, GitBranch
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { normalizeRole } from '@/lib/role-utils'
import {
  ApprovalStatus, getApprovalStatusLabel,
  getRolePermissions, type UserRole, type ATARecordDto,
  type WorkflowAuditLogDto,
  isATARecordFinalized, isATARecordWithOriginator, isOriginatorLedRecord,
  isLeaderTierRole, isPendingStatus,
} from '@/lib/self-evaluation/types'
import {
  submitForm, approveForm, rejectForm, delegateForm, returnFormForRevision,
  submitATARecord, approveATARecord, rejectATARecord,
  getATARecordById, getUsers, getFormSubmissionById, getFormsByATARecord, startATARecordRevision,
  getAuditLogsByEntity, ApiError
} from '@/lib/self-evaluation/api'
import { TOC_CATEGORIES } from '@/lib/self-evaluation/toc-structure'
import type { UserDto } from '@/lib/self-evaluation/api'
import {
  useATARecordWorkflow, buildFallbackCapabilities,
  confirmATARecord, returnATARecordForRevision, delegateATARecord,
} from '@/lib/self-evaluation/ata-workflow'
import {
  useDelegatedATAAuthority,
  DELEGATION_RESPONSIBILITY_ATA_WORKFLOW,
  DELEGATION_RESPONSIBILITY_ATA_APPROVAL,
  DELEGATION_RESPONSIBILITY_ATA_CREATION,
} from '@/lib/self-evaluation/delegation-api'
import type { WorkflowInstanceResponse } from '@/lib/workflow/workflow-types'
import { useFormWorkflowInstance } from '@/lib/workflow/useFormWorkflowInstance'
import { useToast } from '@/hooks/use-toast'

interface Props {
  entityType: 'form' | 'ata_record'
  entityId: string
  currentStatus: ApprovalStatus
  onStatusChange: (newStatus: ApprovalStatus) => void
  /** Prevents stale ATA snapshot actions while the persisted record is loading. */
  statusLoading?: boolean
  rejectionReason?: string
  /** Optional: callback when Edit is clicked */
  onEdit?: () => void
  /** Called with the refreshed record after a new revision starts. */
  onRevisionStarted?: (record: ATARecordDto) => void
  /** True while a rejected form is locally held as a correction draft. */
  formRevisionDraft?: boolean
  /** Persisted comment from the latest approve, reject, or revision action. */
  reviewComments?: string
  /**
   * v22 DEPRECATED: the View action was removed from the workflow action bar per the
   * amendment. The prop is kept ONLY so existing call sites keep compiling; it is
   * ignored — no View button is ever rendered from this component.
   */
  onView?: () => void
  /**
   * MNT-1229B: the form's resolved workflow instance (GET /api/workflow/forms/{id}).
   * When present, Approve / Reject / Return / Delegate visibility follows the SERVER's
   * canIAct / canIDelegate flags of the CURRENT step instead of the client role guess,
   * so a viewer who is not the currently responsible role never sees an action button.
   */
  workflowInstance?: WorkflowInstanceResponse | null
}

/** Maps a structured denial (403 { code, message }) to a user-facing line. */
function describeError(err: unknown, fallback: string): string {
  // Guarded on purpose: `ApiError` may be undefined if the module graph is
  // partially evaluated, and `x instanceof undefined` throws a TypeError.
  if (typeof ApiError === 'function' && err instanceof ApiError) {
    if (err.code) return `${err.code}: ${err.message}`
    return err.message || fallback
  }

  // Structural fallback: any thrown object carrying { code, message }.
  if (err && typeof err === 'object') {
    const candidate = err as { code?: string | null; message?: string }
    if (candidate.code) return `${candidate.code}: ${candidate.message || fallback}`
    if (candidate.message) return candidate.message
  }

  return fallback
}

/** Options of the delegated-responsibility select in the Delegate dialog. */
const DELEGATION_LEVEL_OPTIONS = [
  {
    value: DELEGATION_RESPONSIBILITY_ATA_WORKFLOW,
    label: 'Full workflow — view ToC, edit, submit, approve, reject, return',
  },
  {
    value: DELEGATION_RESPONSIBILITY_ATA_APPROVAL,
    label: 'Approval only — approve, reject, return (no creation)',
  },
  {
    value: DELEGATION_RESPONSIBILITY_ATA_CREATION,
    label: 'Creation only — create and submit new records',
  },
]

const PARALLEL_FORM_TYPES = new Set(
  TOC_CATEGORIES.flatMap(category => [
    ...category.forms.map(form => form.formType),
    ...(category.subGroups ?? []).flatMap(group => group.forms.map(form => form.formType)),
  ]),
)

function prerequisiteFormTypes(formType: string): string[] {
  if (formType === 'periodic_self_audit') return [...PARALLEL_FORM_TYPES]
  if (formType === 'confirmation_letter' || formType === 'request_letter') return ['periodic_self_audit']
  if (formType === '918_faa' || formType === '918a_caa') return ['confirmation_letter', 'request_letter']
  return []
}

const STL_FORWARD_FORM_TYPES = new Set([
  'training_verification_inspection',
  'training_verification_technician',
  'competency_assessment',
])

const PREREQUISITE_LABELS: Record<string, string> = {
  periodic_self_audit: 'Periodic Capability Self-Audit (MNT-1325)',
  confirmation_letter: 'Letter of Confirmation',
  request_letter: 'Amendment Request',
  '918_faa': '918 FAA',
  '918a_caa': '918 A CAA',
}

export default function ApprovalWorkflowActions({
  entityType,
  entityId,
  currentStatus,
  onStatusChange,
  statusLoading = false,
  rejectionReason,
  onEdit,
  onRevisionStarted,
  formRevisionDraft = false,
  reviewComments,
  workflowInstance,
}: Props) {
  const { user } = useAuth()
  const { toast } = useToast()

  // FIXED: Use centralized normalizeRole() for proper role mapping
  const userRole = normalizeRole(user?.role) as UserRole
  const permissions = getRolePermissions(userRole)

  // v6: the signed-in user's numeric id, used by the fallback to enforce the
  // ASSIGNED-preparer rule (defect #2) before the capabilities endpoint is deployed.
  const u = user as { userId?: string | number; id?: string | number; fullName?: string; username?: string } | null | undefined
  const currentUserId = String(u?.userId ?? u?.id ?? '') || null
  const isATA = entityType === 'ata_record'
  const internallyResolvedWorkflow = useFormWorkflowInstance({
    formSubmissionId: isATA ? null : entityId,
  })
  const effectiveWorkflowInstance = workflowInstance ?? internallyResolvedWorkflow.instance
  const effectiveFormStatus = !isATA && effectiveWorkflowInstance
    ? effectiveWorkflowInstance.status
    : currentStatus

  useEffect(() => {
    if (!isATA) void internallyResolvedWorkflow.reload()
  }, [currentStatus, entityId, internallyResolvedWorkflow.reload, isATA])

  const [loading, setLoading] = useState(false)
  const [serverActionDenied, setServerActionDenied] = useState(false)

  useEffect(() => {
    setServerActionDenied(false)
  }, [currentStatus, entityId])
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showDelegateDialog, setShowDelegateDialog] = useState(false)
  const [showReturnDialog, setShowReturnDialog] = useState(false)
  const [showRevisionDialog, setShowRevisionDialog] = useState(false)
  const [reason, setReason] = useState('')
  const [revisionReason, setRevisionReason] = useState('')
  const [delegateUserId, setDelegateUserId] = useState('')
  const [availableUsers, setAvailableUsers] = useState<UserDto[]>([])
  const [ataRecordLoading, setAtaRecordLoading] = useState(isATA)
  const [parentWorkflowApproved, setParentWorkflowApproved] = useState(false)
  const [parentWorkflowChecked, setParentWorkflowChecked] = useState(isATA)
  const [formType, setFormType] = useState('')
  const [formAtaRecordId, setFormAtaRecordId] = useState('')
  const [formPrerequisites, setFormPrerequisites] = useState<{ checked: boolean; missing: string[] }>({
    checked: false,
    missing: [],
  })
  const [ataRecord, setAtaRecord] = useState<ATARecordDto | null>(null)

  // ===== v26: OPTIONAL APPROVAL COMMENT dialog (Approve + Confirm paths) =====
  const [showApprovalDialog, setShowApprovalDialog] = useState(false)
  const [approvalComment, setApprovalComment] = useState('')
  const [approvalKind, setApprovalKind] = useState<'approve' | 'confirm'>('approve')
  const [ataAuditLogs, setAtaAuditLogs] = useState<WorkflowAuditLogDto[]>([])
  const [justSubmittedForReview, setJustSubmittedForReview] = useState(false)

  // ===== v26: delegation dialog extras =====
  const [delegateResponsibility, setDelegateResponsibility] = useState<string>(DELEGATION_RESPONSIBILITY_ATA_WORKFLOW)
  const [delegateExpiration, setDelegateExpiration] = useState('')

  // ===== PHASE 2: server capabilities for the ATA record path =====
  useEffect(() => {
    let cancelled = false
    if (isATA) {
      setFormType('')
      setFormAtaRecordId('')
      setParentWorkflowApproved(true)
      setParentWorkflowChecked(true)
      return
    }

    setFormType('')
    setFormAtaRecordId('')
    setParentWorkflowApproved(false)
    setParentWorkflowChecked(false)
    getFormSubmissionById(entityId)
      .then(async form => {
        if (form) {
          setFormType(form.formType)
          setFormAtaRecordId(form.ataRecordId)
        }
        return form ? getATARecordById(form.ataRecordId) : null
      })
      .then(record => {
        if (cancelled) return
        setParentWorkflowApproved(record?.approvalStatus === ApprovalStatus.Approved)
        setParentWorkflowChecked(true)
      })
      .catch(() => {
        if (!cancelled) setParentWorkflowChecked(true)
      })

    return () => { cancelled = true }
  }, [entityId, isATA])

  useEffect(() => {
    if (isATA) {
      setFormPrerequisites({ checked: true, missing: [] })
      return
    }

    const prerequisiteTypes = prerequisiteFormTypes(formType)
    if (prerequisiteTypes.length === 0) {
      setFormPrerequisites({ checked: true, missing: [] })
      return
    }

    if (!formAtaRecordId) {
      setFormPrerequisites({ checked: false, missing: [] })
      return
    }

    let cancelled = false
    setFormPrerequisites({ checked: false, missing: [] })
    getFormsByATARecord(formAtaRecordId)
      .then(forms => {
        if (cancelled) return
        const approved = new Set(
          forms
            .filter(form => form.approvalStatus === ApprovalStatus.Approved)
            .map(form => form.formType),
        )
        setFormPrerequisites({
          checked: true,
          missing: prerequisiteTypes.filter(type => !approved.has(type)),
        })
      })
      .catch(() => {
        if (!cancelled) setFormPrerequisites({ checked: true, missing: prerequisiteTypes })
      })

    return () => { cancelled = true }
  }, [ataRecord, formAtaRecordId, formType, isATA])

  // Fallback input: the record itself (needed for the opt-in stage flags).
  useEffect(() => {
    let cancelled = false
    const resolveAtaRecord = async () => {
      try {
        if (isATA) {
          setAtaRecordLoading(true)
          const r = await getATARecordById(entityId)
          if (cancelled) return
          setAtaRecord(r)
          onStatusChange(r.approvalStatus as ApprovalStatus)
          return
        }

        const formSubmission = await getFormSubmissionById(entityId)
        if (!formSubmission?.ataRecordId) {
          if (!cancelled) setAtaRecord(null)
          return
        }

        const r = await getATARecordById(formSubmission.ataRecordId)
        if (!cancelled) setAtaRecord(r)
      } catch {
        if (!cancelled) setAtaRecord(null)
      } finally {
        if (!cancelled) setAtaRecordLoading(false)
      }
    }

    setAtaRecordLoading(true)
    resolveAtaRecord()
    return () => { cancelled = true }
    // The parent callback is intentionally excluded: the ATA detail passes an inline
    // callback, and including it would refetch the record after every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isATA, entityId])

  useEffect(() => {
    if (!isATA) {
      setAtaAuditLogs([])
      return
    }

    let cancelled = false
    getAuditLogsByEntity('ATARecord', entityId)
      .then(logs => {
        if (!cancelled) {
          setAtaAuditLogs([...logs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()))
        }
      })
      .catch(() => {
        if (!cancelled) setAtaAuditLogs([])
      })

    return () => {
      cancelled = true
    }
  }, [entityId, isATA])

  const { capabilities, refresh } = useATARecordWorkflow(
    isATA ? entityId : null,
    currentStatus as number,
    ataRecord?.revisionNumber ?? 1,
    ataRecord,
    userRole,
    currentUserId,
  )

  // Effective capability object for ATA records.
  const ataCaps = isATA
    ? (capabilities ?? buildFallbackCapabilities(ataRecord, userRole, currentUserId))
    : null

  // v26 SCENARIO A/B decision. Server payload wins when it carries isOriginatorLed;
  // otherwise the shared types.ts predicate (fail-closed) decides from the frozen
  // creator role / preparer identity.
  const originatorLed = !!ataRecord
    ? (ataCaps?.isOriginatorLed ??
       isOriginatorLedRecord(ataRecord, {
         currentUserId,
         currentUserName: u?.fullName ?? u?.username ?? null,
         currentUserRole: user?.role ?? null,
       }))
    : false
  // v22/v26 amendment: a LIVE delegation held by the signed-in user extends their
  // permissions to delegated-level workflow actions. A delegatee may EDIT and SUBMIT
  // records they created under the delegation (or that are assigned to them) while
  // the record is still pre-finalization, and — v24 backend — take review-stage
  // actions (approve / reject / return) when the grant carries the approval or full
  // workflow responsibility. The server re-checks every action against the delegation
  // table, so the client flags only decide RENDERING.
  const delegatedAuth = useDelegatedATAAuthority(user?.role, user)
  const delegatedOriginator = (() => {
    if (!delegatedAuth.active || !ataRecord) return false
    const amendable =
      currentStatus === ApprovalStatus.Draft || currentStatus === ApprovalStatus.Returned
    if (!amendable) return false
    const creator = (ataRecord.createdBy ?? '').trim().toLowerCase()
    const viewer = (user?.fullName ?? user?.username ?? '').trim().toLowerCase()
    if (creator && viewer && creator === viewer) return true
    const assignedId =
      ataRecord.assignedToUserId != null && ataRecord.assignedToUserId !== ''
        ? String(ataRecord.assignedToUserId)
        : null
    return Boolean(assignedId && currentUserId && assignedId === currentUserId)
  })()

  /**
   * v26 DELEGATED REVIEW AUTHORITY: when the signed-in user holds a live grant at the
   * approval or full-workflow level and the record sits at a review stage, the
   * delegated-level action verbs render (the backend ATARecordCommandHandler grants
   * exactly this via FindLiveDelegationAsync). Creation-only grants do NOT unlock
   * review actions — they only enable the delegated-originator edit/submit path above.
   */
  const delegatedReviewAuthority =
    !!ataRecord &&
    delegatedAuth.active &&
    delegatedAuth.responsibilities.some(
      r => r === DELEGATION_RESPONSIBILITY_ATA_WORKFLOW || r === DELEGATION_RESPONSIBILITY_ATA_APPROVAL,
    ) &&
    !isATARecordFinalized(currentStatus) &&
    !isATARecordWithOriginator(currentStatus)

  // Permission checks:
  //  - ata_record: server capabilities (or catalog-mirrored fallback) - problems #2/#3.
  //  - form: legacy behaviour, unchanged from v5.
  // MNT-1229B: when the form's workflow instance is loaded, the SERVER's per-user
  // capability flags on the CURRENT step are the authority for the action verbs.
  const workflowLoading = !isATA && internallyResolvedWorkflow.loading && !workflowInstance
  const serverStep = !isATA && effectiveWorkflowInstance
    ? (effectiveWorkflowInstance.steps ?? []).find(s => s.stepNo === effectiveWorkflowInstance.currentStepNo) ?? null
    : null
  const serverCanAct = serverStep ? serverStep.canIAct : null
  const serverCanDelegate = serverStep ? serverStep.canIDelegate : null
  const isStlForwardStep = !isATA
    && STL_FORWARD_FORM_TYPES.has(formType)
    && effectiveFormStatus === ApprovalStatus.PendingTeamLeaderReview
    && serverCanAct === true

  // SCENARIO A: Confirm replaces Approve entirely (canApprove is forced false so the
  // two buttons can never render together). The leader-tier guarantee: on a live
  // originator-led record the Confirm button ALWAYS renders for the Shop Team Leader,
  // even if a partially-deployed capabilities payload omits canConfirm — the server
  // re-checks confirm authority on every call, so this only decides rendering.
  const actionsLocked = isATA && (statusLoading || ataRecordLoading || loading)
  const finalizedState = isATA && isATARecordFinalized(currentStatus)
  const ataStatusReady = !isATA || (!ataRecordLoading && !statusLoading && ataRecord !== null)

  const isReviewStage = (isATA || entityType === 'form') && (
    justSubmittedForReview ||
    currentStatus === ApprovalStatus.PendingTeamLeaderReview ||
    currentStatus === ApprovalStatus.PendingManagerApproval ||
    currentStatus === ApprovalStatus.PendingDirectorApproval ||
    currentStatus === ApprovalStatus.PendingQAApproval ||
    currentStatus === ApprovalStatus.PendingDelegatedReview ||
    currentStatus === ApprovalStatus.PendingAssignment ||
    currentStatus === ApprovalStatus.PendingCertifyingStaffAction ||
    currentStatus === ApprovalStatus.PendingEngineerAction ||
    currentStatus === ApprovalStatus.PendingDocumentationTeam ||
    currentStatus === ApprovalStatus.PendingDocumentationClerk ||
    currentStatus === ApprovalStatus.PendingDocumentationLeaderSignOff ||
    currentStatus === ApprovalStatus.PendingShopTeamLeaderIssue ||
    currentStatus === ApprovalStatus.PendingSpecialTeamLeaderApproval ||
    currentStatus === ApprovalStatus.PendingInhouseProcess ||
    currentStatus === ApprovalStatus.PendingHRVerification ||
    currentStatus === ApprovalStatus.PendingHRManagerApproval ||
    currentStatus === ApprovalStatus.PendingRequesterVerification ||
    currentStatus === ApprovalStatus.PendingInspectorReview ||
    currentStatus === ApprovalStatus.PendingInspectorApproval ||
    currentStatus === ApprovalStatus.PendingTechnicianSignOff ||
    currentStatus === ApprovalStatus.PendingECAAEndorsement ||
    currentStatus === ApprovalStatus.PendingSelfAuditCheck ||
    currentStatus === ApprovalStatus.PendingFinalSignOff ||
    currentStatus === ApprovalStatus.PendingAmendmentApproval
  )

  const currentUserIsRecordCreator = !!ataRecord && (
    (ataRecord.createdByUserId != null && currentUserId != null && String(ataRecord.createdByUserId) === String(currentUserId)) ||
    (!!ataRecord.createdBy && !!u?.fullName && ataRecord.createdBy.trim().toLowerCase() === u.fullName.trim().toLowerCase()) ||
    (!!ataRecord.createdBy && !!u?.username && ataRecord.createdBy.trim().toLowerCase() === u.username.trim().toLowerCase())
  )
  const selfCreatedLeaderReview = !!ataRecord && currentUserIsRecordCreator && isLeaderTierRole(userRole) && isReviewStage
  const creatorOnlyEditReview = !!ataRecord && currentUserIsRecordCreator && !isLeaderTierRole(userRole) && isReviewStage
  const leaderCreatedReview = !!ataRecord && originatorLed && isLeaderTierRole(userRole) && isReviewStage
  const delegatedReview = !!ataRecord && !originatorLed && isLeaderTierRole(userRole) && isReviewStage

  const canConfirm = isATA && !actionsLocked && !finalizedState && !isReviewStage
    ? !isATARecordFinalized(currentStatus) &&
      originatorLed &&
      (ataCaps?.canConfirm === true ||
        isLeaderTierRole(userRole) ||
        delegatedReviewAuthority ||
        !!ataCaps?.canApprove)
    : false
  const formWorkflowReady = parentWorkflowChecked && parentWorkflowApproved && formType.length > 0 &&
    formPrerequisites.checked && formPrerequisites.missing.length === 0
  const formCorrectionDraft =
    !isATA &&
    (formRevisionDraft ||
      (currentStatus === ApprovalStatus.Draft && !!rejectionReason?.trim()))
  const canSubmit = isATA
    ? !actionsLocked && !finalizedState && ataStatusReady && ((!!ataCaps?.canSubmit && !originatorLed) || delegatedOriginator)
    : (formWorkflowReady || formCorrectionDraft) && permissions.canSubmit &&
      (!effectiveWorkflowInstance ||
        effectiveWorkflowInstance.status === ApprovalStatus.Draft ||
        effectiveWorkflowInstance.status === ApprovalStatus.Returned ||
        effectiveWorkflowInstance.status === ApprovalStatus.Rejected) &&
      (currentStatus === ApprovalStatus.Draft || currentStatus === ApprovalStatus.Returned)
  const canEdit = isATA
    ? !actionsLocked && !finalizedState && ataStatusReady && (
        selfCreatedLeaderReview ||
        leaderCreatedReview ||
        creatorOnlyEditReview ||
        ((!!ataCaps?.canEdit && !(originatorLed && isATARecordFinalized(currentStatus))) || delegatedOriginator)
      )
    : permissions.canEdit && (
        currentStatus === ApprovalStatus.Draft ||
        currentStatus === ApprovalStatus.Returned ||
        currentStatus === ApprovalStatus.Rejected ||
        (currentStatus === ApprovalStatus.PendingTeamLeaderReview &&
          effectiveWorkflowInstance?.originatorUserId != null &&
          String(effectiveWorkflowInstance.originatorUserId) === currentUserId &&
          serverCanAct === true)
      )
  const rejectedFormEditAvailable =
    !isATA &&
    (currentStatus === ApprovalStatus.Rejected ||
      String(currentStatus).toLowerCase() === 'rejected' ||
      effectiveFormStatus === ApprovalStatus.Rejected ||
      String(effectiveFormStatus).toLowerCase() === 'rejected' ||
      formRevisionDraft ||
      !!rejectionReason?.trim()) &&
    typeof onEdit === 'function'
  const originatorFormEditAvailable =
    !isATA &&
    typeof onEdit === 'function' &&
    effectiveWorkflowInstance?.originatorUserId != null &&
    String(effectiveWorkflowInstance.originatorUserId) === currentUserId &&
    (isPendingStatus(effectiveFormStatus) || formRevisionDraft)
  const formEditAvailable = rejectedFormEditAvailable || originatorFormEditAvailable
  const reviewStageActionEnabled = isATA && isReviewStage && (
    isLeaderTierRole(userRole) || delegatedReviewAuthority || !!ataCaps?.canApprove || !!ataCaps?.canReject || !!ataCaps?.canDelegate || !!ataCaps?.canRequestRevision
  )

  const canApprove = isATA
    ? !actionsLocked && !finalizedState && ataStatusReady && (
        leaderCreatedReview ||
        delegatedReview ||
        selfCreatedLeaderReview ||
        (reviewStageActionEnabled && (isLeaderTierRole(userRole) || delegatedReviewAuthority || !!ataCaps?.canApprove)) ||
        (!!ataCaps?.canApprove && !originatorLed) ||
        delegatedReviewAuthority
      )
    : !serverActionDenied && !workflowLoading && isPendingStatus(effectiveFormStatus) && serverCanAct === true
  const canReject = isATA
    ? !actionsLocked && !finalizedState && ataStatusReady && !originatorLed && (
        (reviewStageActionEnabled && (isLeaderTierRole(userRole) || delegatedReviewAuthority || !!ataCaps?.canReject)) ||
        (!!ataCaps?.canReject && !originatorLed) ||
        delegatedReviewAuthority
      )
    : !serverActionDenied && !workflowLoading && isPendingStatus(effectiveFormStatus) && serverCanAct === true
  const canDelegate = isATA
    ? !actionsLocked && !finalizedState && ataStatusReady && (
        leaderCreatedReview ||
        delegatedReview ||
        selfCreatedLeaderReview ||
        (reviewStageActionEnabled && (isLeaderTierRole(userRole) || delegatedReviewAuthority || !!ataCaps?.canDelegate)) ||
        (!!ataCaps?.canDelegate && !originatorLed) ||
        delegatedReviewAuthority
      )
    : !serverActionDenied && !workflowLoading && isPendingStatus(effectiveFormStatus) && serverCanDelegate === true
  const canReturn = isATA
    ? !actionsLocked && !finalizedState && ataStatusReady && !originatorLed && (
        (reviewStageActionEnabled && (isLeaderTierRole(userRole) || delegatedReviewAuthority || !!ataCaps?.canRequestRevision)) ||
        (!!ataCaps?.canRequestRevision && !originatorLed) ||
        delegatedReviewAuthority
      )
    : !serverActionDenied && !workflowLoading && isPendingStatus(effectiveFormStatus) && serverCanAct === true

  const canStartRevision =
    isATA &&
    currentStatus === ApprovalStatus.Approved &&
    isLeaderTierRole(userRole)

  // v25: the progress strip was removed together with the Approval Status informational box.

  // v13: the backend is the only authority on the resulting status after a
  // form workflow action - re-read it instead of predicting the transition.
  const syncFormStatus = async (): Promise<ApprovalStatus> => {
    if (entityType === 'form') {
      try {
        const fresh = await getFormSubmissionById(entityId)
        if (fresh) {
          const s = fresh.approvalStatus as ApprovalStatus
          onStatusChange(s)
          return s
        }
      } catch { /* fall back to the caller-provided status */ }
      return currentStatus
    }

    try {
      const fresh = await getATARecordById(entityId)
      setAtaRecord(fresh)
      onStatusChange(fresh.approvalStatus as ApprovalStatus)
      await refresh()
      return fresh.approvalStatus as ApprovalStatus
    } catch {
      await refresh()
      return currentStatus
    }
  }

  const handleSubmit = async () => {
    if (
      entityType === 'form' &&
      effectiveWorkflowInstance &&
      effectiveWorkflowInstance.status !== ApprovalStatus.Draft &&
      effectiveWorkflowInstance.status !== ApprovalStatus.Returned &&
      effectiveWorkflowInstance.status !== ApprovalStatus.Rejected
    ) {
      toast({
        title: 'Already submitted',
        description: 'This form is already in the approval workflow.',
        variant: 'destructive',
      })
      return
    }
    if (entityType === 'form' && !parentWorkflowApproved) {
      toast({
        title: 'ATA workflow incomplete',
        description: 'Complete and approve the ATA Record Workflow before submitting this form.',
        variant: 'destructive',
      })
      return
    }
    setLoading(true)
    try {
      if (entityType === 'form') {
        setJustSubmittedForReview(true)
        // Rejected corrections must switch the shared action bar to review mode
        // before the follow-up GET completes; the POST itself only routes the
        // form and does not finalize it.
        if (currentStatus === ApprovalStatus.Rejected || formRevisionDraft || !!rejectionReason?.trim()) {
          onStatusChange(ApprovalStatus.PendingTeamLeaderReview)
        }
        await submitForm(entityId)
        // Refresh the per-user workflow capabilities immediately. The form
        // status may be pending before the old instance snapshot is replaced.
        await internallyResolvedWorkflow.reload()
      } else {
        setJustSubmittedForReview(true)
        onStatusChange(ApprovalStatus.PendingTeamLeaderReview)
        await submitATARecord(entityId)
      }
      const next = await syncFormStatus()
      // Keep the review state visible if the follow-up GET briefly returns the
      // pre-submit snapshot. Clear it only when the server reports a non-pending
      // outcome.
      if (entityType === 'form') {
        setJustSubmittedForReview(true)
      }
      toast({ title: 'Submitted', description: `Now ${getApprovalStatusLabel(next)}.` })
    } catch (err) {
      toast({ title: 'Error', description: describeError(err, 'Failed to submit'), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  /** v26: opens the OPTIONAL approval-comment dialog for Approve / Confirm. */
  const openApprovalDialog = (kind: 'approve' | 'confirm') => {
    setApprovalKind(kind)
    setApprovalComment('')
    setShowApprovalDialog(true)
  }

  const handleApprovalConfirm = async () => {
    setLoading(true)
    try {
      if (approvalKind === 'confirm') {
        // SCENARIO A: confirming finalizes the record immediately. Comment optional.
        await confirmATARecord(entityId, { comments: approvalComment })
      } else if (entityType === 'form') {
        // Legacy form path kept: empty comment falls back to the historical default.
        await approveForm(entityId, { comments: approvalComment || 'Approved' })
      } else {
        // SCENARIO B: approve with the OPTIONAL approval comment.
        await approveATARecord(entityId, { comments: approvalComment })
      }
      let nextStatus: ApprovalStatus
      if (isATA) {
        if (approvalKind === 'confirm') {
          nextStatus = ApprovalStatus.Approved
        } else if (ataCaps?.nextStageTitle) {
          // ATA path keeps the server-computed chain preview (capabilities endpoint).
          const nextStage = ataCaps.chain.find(s => s.title === ataCaps.nextStageTitle)
          nextStatus = nextStage ? (nextStage.status as ApprovalStatus) : ApprovalStatus.Approved
        } else {
          nextStatus = ApprovalStatus.Approved
        }
        onStatusChange(nextStatus)
        await refresh()
      } else {
        // v13 form path: the catalog workflow advanced server-side - re-read
        // the authoritative status instead of predicting the next level.
        nextStatus = await syncFormStatus()
      }
      setShowApprovalDialog(false)
      setApprovalComment('')
      toast({
        title: approvalKind === 'confirm'
          ? 'Confirmed'
          : isStlForwardStep
            ? 'Forwarded'
            : 'Approved',
        description: approvalKind === 'confirm'
          ? 'The record has been confirmed and finalized.'
          : `Progressed to ${getApprovalStatusLabel(nextStatus)}.`,
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: describeError(err, approvalKind === 'confirm' ? 'Failed to confirm' : 'Failed to approve'),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleReject = async () => {
    if (entityType === 'form' && !isPendingStatus(effectiveFormStatus)) {
      toast({
        title: 'Action unavailable',
        description: 'This form is no longer waiting for a review decision.',
        variant: 'destructive',
      })
      setShowRejectDialog(false)
      return
    }
    if (!reason.trim()) {
      toast({ title: 'Required', description: 'Please provide a reason for rejection.', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      if (entityType === 'form') {
        await rejectForm(entityId, { reason })
      } else {
        await rejectATARecord(entityId, { reason })
      }
      onStatusChange(ApprovalStatus.Rejected)
      setShowRejectDialog(false)
      setReason('')
      await refresh()
      toast({ title: 'Rejected', description: 'The submission has been rejected.' })
    } catch (err) {
      if (typeof ApiError === 'function' && err instanceof ApiError && err.status === 403) {
        setServerActionDenied(true)
        await internallyResolvedWorkflow.reload()
      }
      toast({ title: 'Error', description: describeError(err, 'Failed to reject'), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleDelegate = async () => {
    if (!delegateUserId) {
      toast({ title: 'Required', description: 'Please select a user to delegate to.', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      if (entityType === 'form') {
        // v13: DelegateFormSubmissionCommand.DelegateToUserId is a numeric C#
        // long; the old `delegatedTo` string was silently ignored server-side.
        await delegateForm(entityId, { delegateToUserId: Number(delegateUserId), reason })
      } else {
        // v26 UPGRADE: the delegation now GRANTS AUTHORITY at the chosen level.
        // assignToUserName is required — the server resolves the persisted
        // ResponsibilityDelegation grant by display name, and the responsibility
        // key decides which workflow actions the delegatee may take.
        const selected = availableUsers.find(u2 => u2.id === delegateUserId)
        await delegateATARecord(entityId, {
          assignToUserId: delegateUserId,
          assignToUserName: selected?.fullName ?? '',
          responsibility: delegateResponsibility,
          expirationDate: delegateExpiration || null,
          reason,
        })
      }
      setShowDelegateDialog(false)
      setReason('')
      setDelegateUserId('')
      setDelegateExpiration('')
      setDelegateResponsibility(DELEGATION_RESPONSIBILITY_ATA_WORKFLOW)
      await syncFormStatus()
      toast({
        title: 'Delegated',
        description: 'Authority delegated — the user can now act at the delegated level.',
      })
    } catch (err) {
      toast({ title: 'Error', description: describeError(err, 'Failed to delegate'), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleReturn = async () => {
    if (!reason.trim()) {
      toast({ title: 'Required', description: 'Please provide comments for the return.', variant: 'destructive' })
      return
    }
    setLoading(true)
    try {
      if (entityType === 'form') {
        await returnFormForRevision(entityId, { reason })
      } else {
        // v26 SCENARIO B: the REAL return endpoint — the record goes back to the
        // preparer and STAYS ALIVE (the old reject-with-"RETURNED:"-prefix hack
        // permanently killed the record and is gone).
        await returnATARecordForRevision(entityId, { comments: reason })
      }
      onStatusChange(ApprovalStatus.Returned)
      setShowReturnDialog(false)
      setReason('')
      await refresh()
      toast({ title: 'Returned', description: 'Returned for revision with comments.' })
    } catch (err) {
      toast({ title: 'Error', description: describeError(err, 'Failed to return'), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleStartRevision = async () => {
    setLoading(true)
    try {
      await startATARecordRevision(entityId, { reason: revisionReason.trim() })
      const refreshed = await getATARecordById(entityId)
      onStatusChange(refreshed.approvalStatus)
      onRevisionStarted?.(refreshed)
      setShowRevisionDialog(false)
      setRevisionReason('')
      toast({
        title: `Revision v${refreshed.revisionNumber ?? 1} started`,
        description: 'The Table of Contents approval workflow has been reset for re-approval.',
      })
    } catch (err) {
      toast({
        title: 'Unable to start revision',
        description: describeError(err, 'Only the Shop Team Leader can start a revision.'),
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    try {
      const users = await getUsers()
      setAvailableUsers(users.filter(u2 => u2.isActive && u2.id !== String(u?.userId ?? u?.id ?? '')))
    } catch {
      setAvailableUsers([])
    }
  }

  const approvalDialogTitle =
    approvalKind === 'confirm'
      ? 'Confirm Record'
      : isStlForwardStep
        ? 'Assign Submission'
        : 'Approve Submission'
  const approvalDialogDescription =
    approvalKind === 'confirm'
      ? 'Confirming finalizes this record immediately. You may add an optional comment.'
      : isStlForwardStep
        ? 'The employee information is correct. Assign this submission to the next approval role.'
        : 'You may add an optional approval comment before approving.'
  const approvalActionButtonLabel =
    approvalKind === 'confirm'
      ? 'Confirm & Finalize'
      : isStlForwardStep
        ? 'Assign'
        : 'Confirm Approval'

  const postSubmitReviewStatus = (
    justSubmittedForReview ||
    currentStatus === ApprovalStatus.PendingTeamLeaderReview ||
    currentStatus === ApprovalStatus.PendingManagerApproval ||
    currentStatus === ApprovalStatus.PendingDirectorApproval ||
    currentStatus === ApprovalStatus.PendingQAApproval ||
    currentStatus === ApprovalStatus.PendingDelegatedReview ||
    currentStatus === ApprovalStatus.PendingAssignment ||
    currentStatus === ApprovalStatus.PendingCertifyingStaffAction ||
    currentStatus === ApprovalStatus.PendingEngineerAction ||
    currentStatus === ApprovalStatus.PendingDocumentationTeam ||
    currentStatus === ApprovalStatus.PendingDocumentationClerk ||
    currentStatus === ApprovalStatus.PendingDocumentationLeaderSignOff ||
    currentStatus === ApprovalStatus.PendingShopTeamLeaderIssue ||
    currentStatus === ApprovalStatus.PendingSpecialTeamLeaderApproval ||
    currentStatus === ApprovalStatus.PendingInhouseProcess ||
    currentStatus === ApprovalStatus.PendingHRVerification ||
    currentStatus === ApprovalStatus.PendingHRManagerApproval ||
    currentStatus === ApprovalStatus.PendingRequesterVerification ||
    currentStatus === ApprovalStatus.PendingInspectorReview ||
    currentStatus === ApprovalStatus.PendingInspectorApproval ||
    currentStatus === ApprovalStatus.PendingTechnicianSignOff ||
    currentStatus === ApprovalStatus.PendingECAAEndorsement ||
    currentStatus === ApprovalStatus.PendingSelfAuditCheck ||
    currentStatus === ApprovalStatus.PendingFinalSignOff ||
    currentStatus === ApprovalStatus.PendingAmendmentApproval
  )

  const showSingleSubmitAction = !postSubmitReviewStatus && !isReviewStage && (currentStatus === ApprovalStatus.Draft || currentStatus === ApprovalStatus.Returned)
  const showReviewActions = entityType === 'form'
    ? (justSubmittedForReview || isPendingStatus(effectiveFormStatus)) && !actionsLocked
    : (currentStatus !== ApprovalStatus.Rejected && (postSubmitReviewStatus || isReviewStage) && !finalizedState && !actionsLocked &&
    (isATA || (formWorkflowReady && formPrerequisites.missing.length === 0))
    )
  const workflowCommentEntries = ataAuditLogs
    .filter(log => {
      const message = (log.details ?? '').trim()
      return message.length > 0
    })
    .slice(0, 8)

  return (
    <div className="space-y-4">
      {/* v26: delegated-authority disclosure. Rendered ONLY when the signed-in user
          is acting under a live delegation, so accountability stays visible. */}
      {isATA && delegatedAuth.active && delegatedAuth.delegation && (
        <div className="inline-flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          <ShieldCheck className="h-3 w-3" />
          Acting under delegation from {delegatedAuth.delegation.delegatedBy} — delegated
          workflow actions are enabled
        </div>
      )}

      {/* Rejection Reason Display */}
      {currentStatus === ApprovalStatus.Rejected && rejectionReason && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-red-700">Rejection Reason:</p>
              <p className="text-xs text-red-600 mt-0.5">{rejectionReason}</p>
            </div>
          </div>
        </div>
      )}

      {rejectedFormEditAvailable && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <span>Edit this form to address the rejection comments, save the correction, then resubmit it for approval.</span>
        </div>
      )}

      {reviewComments && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700">Latest workflow comment</p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                {reviewComments}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Returned Status Display */}
      {currentStatus === ApprovalStatus.Returned && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <RotateCcw className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-700">Returned for Revision</p>
              <p className="text-xs text-amber-600 mt-0.5">This item has been returned. Please edit and resubmit.</p>
            </div>
          </div>
        </div>
      )}

      {entityType === 'form' && (!formWorkflowReady || formPrerequisites.missing.length > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          <p className="font-semibold">Workflow Order Required:</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-5">
            <li><strong>ATA Record Workflow</strong> must be approved first.</li>
            <li><strong>Documentation</strong>, <strong>Training</strong>, <strong>Tools</strong>, <strong>Facility</strong>, and <strong>Consumables</strong> forms can proceed in parallel.</li>
            <li><strong>MNT-1325</strong> becomes active only after all parallel form groups are complete.</li>
            <li><strong>Letter of Confirmation</strong> and <strong>Amendment Request</strong> activate only after MNT-1325 approval.</li>
            <li><strong>Form 918 (FAA)</strong> and <strong>Form 918A (ECAA)</strong> activate only after both letters are fully approved.</li>
          </ol>
          <p className="mt-2 text-amber-900">
            {!parentWorkflowChecked || !formType || !formAtaRecordId || !formPrerequisites.checked
              ? 'Checking the required preceding approvals.'
              : !parentWorkflowApproved
                ? 'Complete and approve the ATA Record Workflow before continuing.'
                : `Required before this form: ${formPrerequisites.missing
                    .map(type => PREREQUISITE_LABELS[type] ?? type)
                    .join(', ')}.`}
          </p>
        </div>
      )}

      {/* Action Buttons - visibility bound to server capabilities (ATA) / legacy gates (form) */}
      <div className="flex flex-wrap gap-2">
        {isATA && showSingleSubmitAction ? (
          <Button
            size="sm"
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
            Submit for Approval
          </Button>
        ) : (
          <>
            {(canEdit || formEditAvailable) && !rejectedFormEditAvailable && onEdit && (
              <Button
                size="sm"
                variant="outline"
                className="text-blue-700 border-blue-300 hover:bg-blue-50"
                onClick={onEdit}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
            )}

            {canStartRevision && (
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 text-amber-800 hover:bg-amber-50"
                onClick={() => { setRevisionReason(''); setShowRevisionDialog(true) }}
                disabled={loading}
              >
                <GitBranch className="mr-1 h-3.5 w-3.5" />
                Start new revision
              </Button>
            )}

            {!isATA && canSubmit && (
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={handleSubmit}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                Submit for Approval
              </Button>
            )}

            {showReviewActions && (
              <>
                {canApprove && !creatorOnlyEditReview && !isStlForwardStep && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => openApprovalDialog('approve')}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                    Approve
                  </Button>
                )}

                {isStlForwardStep && (
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => openApprovalDialog('approve')}
                    disabled={loading}
                  >
                    {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                    Assign
                  </Button>
                )}

                {canReject && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setShowRejectDialog(true)}
                    disabled={loading}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1" />
                    Reject
                  </Button>
                )}

                {canDelegate && !isStlForwardStep && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { loadUsers(); setShowDelegateDialog(true) }}
                    disabled={loading}
                  >
                    <Users className="h-3.5 w-3.5 mr-1" />
                    Delegate
                  </Button>
                )}

                {canReturn && !isStlForwardStep && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-amber-700 border-amber-300 hover:bg-amber-50"
                    onClick={() => setShowReturnDialog(true)}
                    disabled={loading}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Revision
                  </Button>
                )}
              </>
            )}

            {canConfirm && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                onClick={() => openApprovalDialog('confirm')}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1" />}
                Confirm
              </Button>
            )}
          </>
        )}
      </div>

      {isATA && workflowCommentEntries.length > 0 && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-500" />
            Audit History
          </div>
          <div className="space-y-2.5">
            {workflowCommentEntries.map(log => (
              <div key={log.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-slate-300">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                    {log.action || 'Workflow update'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">By {log.performedBy}</p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                  {log.details}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={showRevisionDialog} onOpenChange={setShowRevisionDialog}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-amber-600" />
              Start new ATA revision
            </DialogTitle>
            <DialogDescription>
              This creates the next revision and resets every Table of Contents approval to Draft.
              All assigned roles must approve the content again.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label className="text-sm font-medium">Revision reason (Optional)</Label>
            <Textarea
              value={revisionReason}
              onChange={(e) => setRevisionReason(e.target.value)}
              placeholder="Describe why this revision is required..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevisionDialog(false)}>
              Cancel
            </Button>
            <Button className="bg-amber-600 text-white hover:bg-amber-700" onClick={handleStartRevision} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <GitBranch className="mr-2 h-4 w-4" />}
              Start revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* v26 OPTIONAL APPROVAL COMMENT DIALOG (Approve + Confirm) */}
      <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              {approvalDialogTitle}
            </DialogTitle>
            <DialogDescription>{approvalDialogDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label className="text-sm font-medium">Approval Comment (Optional)</Label>
            <Textarea
              value={approvalComment}
              onChange={(e) => setApprovalComment(e.target.value)}
              placeholder="Add an approval comment (optional)..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowApprovalDialog(false); setApprovalComment('') }}>
              Cancel
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleApprovalConfirm}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              {approvalActionButtonLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              Reject Submission
            </DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this submission.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label className="text-sm font-medium">Reason for Rejection *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this submission is being rejected..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowRejectDialog(false); setReason('') }}>Cancel</Button>
            <Button variant="destructive" onClick={handleReject} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delegate Dialog — v26: grants authority at a chosen responsibility level */}
      <Dialog open={showDelegateDialog} onOpenChange={setShowDelegateDialog}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              Delegate Authority
            </DialogTitle>
            <DialogDescription>
              The selected user will be granted the chosen authority level on this record
              (Table of Contents access and workflow actions) until it expires or is revoked.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Delegate To *</Label>
              <Select value={delegateUserId} onValueChange={setDelegateUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a user..." />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {availableUsers.map(u2 => (
                    <SelectItem key={u2.id} value={u2.id}>
                      {u2.fullName} ({u2.roleDisplayName || u2.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Delegated Authority Level *</Label>
              <Select value={delegateResponsibility} onValueChange={setDelegateResponsibility}>
                <SelectTrigger>
                  <SelectValue placeholder="Select the authority level..." />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {DELEGATION_LEVEL_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Expires On (Optional)</Label>
              <Input
                type="date"
                value={delegateExpiration}
                onChange={(e) => setDelegateExpiration(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Reason (Optional)</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for delegation..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDelegateDialog(false); setReason(''); setDelegateUserId('') }}>Cancel</Button>
            <Button className="bg-blue-600 hover:bg-blue-700" onClick={handleDelegate} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirm Delegation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request Revision Dialog */}
      <Dialog open={showReturnDialog} onOpenChange={setShowReturnDialog}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-amber-500" />
              Request Revision
            </DialogTitle>
            <DialogDescription>
              Provide comments explaining what needs to be revised. The record returns to
              its preparer and stays active.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label className="text-sm font-medium">Revision Comments *</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain what needs to be corrected or updated..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowReturnDialog(false); setReason('') }}>Cancel</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleReturn} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirm Return
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
