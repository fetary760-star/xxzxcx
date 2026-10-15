/**
 * =====================================================================================
 * AMENDED v18 - PHASE 1 (FRONTEND), ITEM 1: THE TYPED CONTRACT LAYER
 * CMT.Frontend/src/lib/workflow/workflow-types.ts   (REPLACES the whole v11 file)
 * Copy to: CMT.Frontend/src/lib/workflow/workflow-types.ts
 *
 * WHAT THIS FILE IS
 * -----------------
 * The FRONTEND MIRROR of the amended backend workflow layer you already updated:
 *
 *   CMT.Domain/Models/Shared/ApprovalStatus.cs          -> ApprovalStatus, FormLifecycleState,
 *                                                         ApprovalStatusInfo (labels / buckets)
 *   CMT.Domain/Models/Shared/Enums.cs                   -> ProficiencyLevel, ToolStatus,
 *                                                         FormNodeTypes
 *   CMT.Domain/Models/Workflow/WorkflowContracts.cs     -> WorkflowStepKind, SignatureBlockType,
 *                                                         WorkflowStepAction, SkipMode, ToCSections,
 *                                                         RequiredFields / RequiredDraftFields
 *   CMT.Domain/Models/Workflow/WorkflowEntities.cs      -> WorkflowStepState, RevisionTrigger,
 *                                                         NotificationCategories
 *   CMT.Application/Contracts/Workflow/WorkflowApiContracts.cs -> every request / response shape
 *                                                                + WorkflowErrorCodes
 *
 * WHAT CHANGED AGAINST v11  (four amendments, nothing else was touched)
 * --------------------------------------------------------------------
 * AMENDMENT 1 - THE MODULE IMPORT CYCLE IS BROKEN.
 *   v11 opened with
 *       export { ProficiencyLevel, ToolStatus } from '@/lib/self-evaluation/types'
 *   while `self-evaluation/types.ts` (v11 note A) now RE-EXPORTS ApprovalStatus FROM THIS
 *   FILE. That is a hard circular import: under Turbopack/webpack one of the two modules is
 *   evaluated before the other finishes, so `ApprovalStatus` is `undefined` at module scope
 *   and EVERY object built from it (APPROVAL_STATUS_LABELS, LIFECYCLE_STATE_CLASSES,
 *   permissionForStep) silently becomes an empty map. That is the real reason a correct
 *   status still rendered as "Unknown".
 *   FIX: ProficiencyLevel and ToolStatus are DECLARED HERE, straight off Enums.cs
 *   (NotRated=0..Instructor=5 / NotRequired=0..OutOfService=5). This file now imports
 *   NOTHING. `self-evaluation/types.ts` keeps re-exporting from here, one-way.
 *
 * AMENDMENT 2 - THE TWO v11 CONTRACT MEMBERS WERE MISSING FROM THE MIRROR.
 *   WorkflowContracts.cs (v11) added `WorkflowStepDefinition.RequiredFields` and
 *   `FormWorkflowDefinition.RequiredDraftFields`, and the catalog endpoint serialises both.
 *   The mirror never declared them, which forced `workflow-permissions.ts` to cast
 *       (form as unknown as { requiredDraftFields?: string[] })
 *   and forced `stepFactsFromInstanceStep()` to hardcode `requiredFields: []`, so
 *   `validateDecisionPayload()` could never detect a missing MNT-1420A `bulletinNumber`.
 *   FIX: `requiredFields` on CatalogStepResponse + WorkflowStepResponse, and
 *   `requiredDraftFields` on CatalogFormResponse. Both optional, so a server that has not
 *   been redeployed yet keeps type-checking.
 *
 * AMENDMENT 3 - UNIFORM ErrorCode SURFACING WAS INCOMPLETE.
 *   `workflow-transport.ts` (v17) derives 'REQUIRED_FIELDS_MISSING' for HTTP 422 and
 *   `workflow-permissions.ts` (v14) denies with the same code, but WORKFLOW_ERROR_CODES did
 *   not contain it, so `workflowErrorMessage()` fell through to the generic sentence.
 *   FIX: RequiredFieldsMissing + OutsideFunctionalUnit + InstanceLocked + ExclusiveDesignation
 *   are added to the code table and to the message map, so ONE vocabulary now covers the
 *   local pre-flight decision, the server rejection and the transport failure.
 *
 * AMENDMENT 4 - THE ToC CONTRACT IS COMPLETED.
 *   `TableOfContentsSectionResponse` carried no `actionRequiredItems` / `draftItems` counter
 *   even though the brief demands per-section counters over the SIX lifecycle buckets, and
 *   `FolderProgressResponse` carried no `remainingMandatoryItems` alias. Both are declared
 *   OPTIONAL here and RECOMPUTED locally by `toc-view-model.ts`, so the renderer is correct
 *   whether or not the server sends them.
 *
 * TWO BINDING RULES COPIED FROM WorkflowApiContracts.cs - DO NOT BREAK THEM
 *   (1) every USER id is a number (C# long). Entity ids (folder / instance / submission /
 *       item) are string (C# Guid). Sending a number where a Guid is expected - or a Guid
 *       where a long is expected - is what produced the 400 application/problem+json
 *       responses on the user endpoints.
 *   (2) every enum is ALSO delivered as a string label by the API (statusLabel, stateLabel,
 *       kindLabel, ...). PREFER the server label when it is present; the local label maps
 *       below are the OFFLINE FALLBACK only.
 * =====================================================================================
 */

// =====================================================================================
// 0. SHARED ENUMS  (AMENDED v18 - declared here, no import, no cycle)
//    Mirror of CMT.Domain/Models/Shared/Enums.cs - DO NOT RENUMBER.
// =====================================================================================

export enum ProficiencyLevel {
  NotRated = 0,
  Trainee = 1,
  Supervised = 2,
  Competent = 3,
  Expert = 4,
  Instructor = 5,
}

export const PROFICIENCY_LEVEL_LABELS: Record<ProficiencyLevel, string> = {
  [ProficiencyLevel.NotRated]: 'Not rated',
  [ProficiencyLevel.Trainee]: 'Trainee',
  [ProficiencyLevel.Supervised]: 'Supervised',
  [ProficiencyLevel.Competent]: 'Competent',
  [ProficiencyLevel.Expert]: 'Expert',
  [ProficiencyLevel.Instructor]: 'Instructor',
}

export function proficiencyLevelLabel(level?: ProficiencyLevel | null): string {
  if (level === undefined || level === null) return '—'
  return PROFICIENCY_LEVEL_LABELS[level] ?? String(level)
}

export enum ToolStatus {
  NotRequired = 0,
  Required = 1,
  Available = 2,
  OnOrder = 3,
  NeedsCalibration = 4,
  OutOfService = 5,
}

export const TOOL_STATUS_LABELS: Record<ToolStatus, string> = {
  [ToolStatus.NotRequired]: 'Not required',
  [ToolStatus.Required]: 'Required',
  [ToolStatus.Available]: 'Available',
  [ToolStatus.OnOrder]: 'On order',
  [ToolStatus.NeedsCalibration]: 'Needs calibration',
  [ToolStatus.OutOfService]: 'Out of service',
}

export function toolStatusLabel(status?: ToolStatus | null): string {
  if (status === undefined || status === null) return '—'
  return TOOL_STATUS_LABELS[status] ?? String(status)
}

// =====================================================================================
// 1. APPROVAL STATUS  (mirror of ApprovalStatus.cs - v8 numbering, DO NOT RENUMBER)
// =====================================================================================

export enum ApprovalStatus {
  // ---------- v1..v7 values ----------
  Draft = 0,
  PendingTeamLeaderReview = 1,
  PendingManagerApproval = 2,
  PendingDirectorApproval = 3,
  PendingQAApproval = 4,
  Approved = 5,
  Rejected = 6,
  Returned = 7,

  // ---------- v8 lifecycle additions ----------
  Skipped = 8,
  Expired = 9,
  PendingAssignment = 10,

  // ---------- New ATA Record management ----------
  PendingCertifyingStaffAction = 11,
  PendingEngineerAction = 12,

  // ---------- Documentation & AD / SB (MNT-1420A / MNT-1420B) ----------
  PendingDocumentationTeam = 13,
  PendingDocumentationClerk = 14,
  PendingDocumentationLeaderSignOff = 15,
  PendingShopTeamLeaderIssue = 16,

  // ---------- Tools & Equipment (MNT-1229B) ----------
  PendingSpecialTeamLeaderApproval = 17,
  PendingInhouseProcess = 18,

  // ---------- Training & qualification ----------
  PendingHRVerification = 19,
  PendingHRManagerApproval = 20,
  PendingRequesterVerification = 21,
  PendingInspectorReview = 22,
  PendingInspectorApproval = 23,
  PendingTechnicianSignOff = 24,

  // ---------- Regulatory compliance 918 / 918A ----------
  PendingECAAEndorsement = 25,
  PendingSelfAuditCheck = 26,

  // ---------- Folder level ----------
  PendingFinalSignOff = 27,
  Completed = 28,
  Locked = 29,
  PendingAmendmentApproval = 30,

  // ---------- AMENDED v12: delegated review (approver borrowed a reviewer) ----------
  PendingDelegatedReview = 31,

  // ---------- AMENDED v14: archive / soft-delete (an approval was withdrawn) ----------
  Revoked = 32,
}

/** Mirror of ApprovalStatusInfo.Label. */
export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  [ApprovalStatus.Draft]: 'Draft',
  [ApprovalStatus.PendingTeamLeaderReview]: 'Pending Shop Team Leader review',
  [ApprovalStatus.PendingManagerApproval]: 'Pending Manager approval',
  [ApprovalStatus.PendingDirectorApproval]: 'Pending Director approval',
  [ApprovalStatus.PendingQAApproval]: 'Pending QA approval',
  [ApprovalStatus.Approved]: 'Approved',
  [ApprovalStatus.Rejected]: 'Rejected',
  [ApprovalStatus.Returned]: 'Returned for correction',
  [ApprovalStatus.Skipped]: 'Skipped',
  [ApprovalStatus.Expired]: 'Expired',
  [ApprovalStatus.PendingAssignment]: 'Pending assignment',
  [ApprovalStatus.PendingCertifyingStaffAction]: 'Pending Certifying Staff action',
  [ApprovalStatus.PendingEngineerAction]: 'Pending Engineer action',
  [ApprovalStatus.PendingDocumentationTeam]: 'Pending Documentation Team',
  [ApprovalStatus.PendingDocumentationClerk]: 'Pending Documentation Clerk',
  [ApprovalStatus.PendingDocumentationLeaderSignOff]: 'Pending Documentation Team Leader sign-off',
  [ApprovalStatus.PendingShopTeamLeaderIssue]: 'Pending Shop Team Leader issue',
  [ApprovalStatus.PendingSpecialTeamLeaderApproval]: 'Pending Special Admin approval',
  [ApprovalStatus.PendingInhouseProcess]: 'Pending in-house process',
  [ApprovalStatus.PendingHRVerification]: 'Pending HR Specialist verification',
  [ApprovalStatus.PendingHRManagerApproval]: 'Pending HR Manager approval',
  [ApprovalStatus.PendingRequesterVerification]: 'Pending requester (STL) verification',
  [ApprovalStatus.PendingInspectorReview]: 'Pending Inspector review',
  [ApprovalStatus.PendingInspectorApproval]: 'Pending Inspector approval',
  [ApprovalStatus.PendingTechnicianSignOff]: 'Pending Technician sign-off',
  [ApprovalStatus.PendingECAAEndorsement]: 'Pending ECAA endorsement',
  [ApprovalStatus.PendingSelfAuditCheck]: 'Pending MNT-1325 self-audit check',
  [ApprovalStatus.PendingFinalSignOff]: 'Pending final sign-off',
  [ApprovalStatus.Completed]: 'Completed',
  [ApprovalStatus.Locked]: 'Completed and locked',
  [ApprovalStatus.PendingAmendmentApproval]: 'Pending amendment approval',
  [ApprovalStatus.PendingDelegatedReview]: 'Pending delegated review',
  [ApprovalStatus.Revoked]: 'Revoked',
}

/** Offline fallback. Prefer the `statusLabel` delivered by the API. */
export function approvalStatusLabel(status?: ApprovalStatus | null): string {
  if (status === undefined || status === null) return '—'
  return APPROVAL_STATUS_LABELS[status] ?? `Status ${status}`
}

/**
 * AMENDED v12/v14 - true while the instance sits inside the delegated-review excursion
 * of its current step: the REVIEWER acts now, the original approver stamps the signature.
 */
export function isAwaitingDelegatedReview(status?: ApprovalStatus | null): boolean {
  return status === ApprovalStatus.PendingDelegatedReview
}

// =====================================================================================
// 2. FORM LIFECYCLE STATE  (the 5 + 1 buckets the Table of Contents renders)
// =====================================================================================

export enum FormLifecycleState {
  Draft = 0,
  Pending = 1,
  Approved = 2,
  Skipped = 3,
  Expired = 4,
  /** Rejected / Returned - still owned by the originator, shown in red. */
  ActionRequired = 5,
}

export const LIFECYCLE_STATE_LABELS: Record<FormLifecycleState, string> = {
  [FormLifecycleState.Draft]: 'Draft',
  [FormLifecycleState.Pending]: 'Pending',
  [FormLifecycleState.Approved]: 'Approved',
  [FormLifecycleState.Skipped]: 'Skipped',
  [FormLifecycleState.Expired]: 'Expired',
  [FormLifecycleState.ActionRequired]: 'Action required',
}

/** Mirror of ApprovalStatusInfo.StateOf. */
export function lifecycleStateOf(status: ApprovalStatus): FormLifecycleState {
  switch (status) {
    case ApprovalStatus.Draft:
      return FormLifecycleState.Draft
    case ApprovalStatus.Skipped:
      return FormLifecycleState.Skipped
    case ApprovalStatus.Expired:
      return FormLifecycleState.Expired
    case ApprovalStatus.Approved:
    case ApprovalStatus.Completed:
    case ApprovalStatus.Locked:
      return FormLifecycleState.Approved
    case ApprovalStatus.Rejected:
    case ApprovalStatus.Returned:
    case ApprovalStatus.Revoked:
      return FormLifecycleState.ActionRequired
    default:
      return FormLifecycleState.Pending
  }
}

export function lifecycleStateLabel(state?: FormLifecycleState | null): string {
  if (state === undefined || state === null) return '—'
  return LIFECYCLE_STATE_LABELS[state] ?? String(state)
}

/**
 * Tailwind classes per bucket. Text and background always contrast:
 * dark text on a light background, never text-x-600 on bg-x-600.
 */
export const LIFECYCLE_STATE_CLASSES: Record<FormLifecycleState, string> = {
  [FormLifecycleState.Draft]: 'bg-slate-100 text-slate-800 border-slate-300',
  [FormLifecycleState.Pending]: 'bg-amber-100 text-amber-900 border-amber-300',
  [FormLifecycleState.Approved]: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  [FormLifecycleState.Skipped]: 'bg-sky-100 text-sky-900 border-sky-300',
  [FormLifecycleState.Expired]: 'bg-orange-100 text-orange-900 border-orange-300',
  [FormLifecycleState.ActionRequired]: 'bg-red-100 text-red-900 border-red-300',
}

export function lifecycleStateClasses(state?: FormLifecycleState | null): string {
  if (state === undefined || state === null) return LIFECYCLE_STATE_CLASSES[FormLifecycleState.Draft]
  return LIFECYCLE_STATE_CLASSES[state] ?? LIFECYCLE_STATE_CLASSES[FormLifecycleState.Draft]
}

export function approvalStatusClasses(status: ApprovalStatus): string {
  return lifecycleStateClasses(lifecycleStateOf(status))
}

/** Mirror of ApprovalStatusInfo.IsTerminal. */
export function isTerminalStatus(status: ApprovalStatus): boolean {
  return (
    status === ApprovalStatus.Approved ||
    status === ApprovalStatus.Completed ||
    status === ApprovalStatus.Locked ||
    status === ApprovalStatus.Skipped
  )
}

/** Mirror of ApprovalStatusInfo.IsWithOriginator. */
export function isWithOriginator(status: ApprovalStatus): boolean {
  return (
    status === ApprovalStatus.Draft ||
    status === ApprovalStatus.Rejected ||
    status === ApprovalStatus.Returned ||
    status === ApprovalStatus.Expired
  )
}

/** Mirror of ApprovalStatusInfo.CountsAsComplete - used by the progress dashboard. */
export function countsAsComplete(status: ApprovalStatus): boolean {
  return (
    status === ApprovalStatus.Approved ||
    status === ApprovalStatus.Completed ||
    status === ApprovalStatus.Locked ||
    status === ApprovalStatus.Skipped
  )
}

export function isPendingStatus(status: ApprovalStatus): boolean {
  return lifecycleStateOf(status) === FormLifecycleState.Pending
}

// =====================================================================================
// 3. STEP ENUMS  (mirror of WorkflowContracts.cs + WorkflowEntities.cs)
// =====================================================================================

export enum WorkflowStepKind {
  Draft = 0,
  Assignment = 1,
  Processing = 2,
  Verification = 3,
  Review = 4,
  Approval = 5,
  SignOff = 6,
  Conditional = 7,
  Endorsement = 8,
  Gate = 9,
}

/** Action verb the UI renders on the primary button of a pending step. */
export const STEP_KIND_ACTION_LABELS: Record<WorkflowStepKind, string> = {
  [WorkflowStepKind.Draft]: 'Submit',
  [WorkflowStepKind.Assignment]: 'Assign',
  [WorkflowStepKind.Processing]: 'Complete',
  [WorkflowStepKind.Verification]: 'Verify',
  [WorkflowStepKind.Review]: 'Review',
  [WorkflowStepKind.Approval]: 'Approve',
  [WorkflowStepKind.SignOff]: 'Sign off',
  [WorkflowStepKind.Conditional]: 'Complete',
  [WorkflowStepKind.Endorsement]: 'Endorse',
  [WorkflowStepKind.Gate]: 'Verify checklist',
}

export const STEP_KIND_LABELS: Record<WorkflowStepKind, string> = {
  [WorkflowStepKind.Draft]: 'Draft',
  [WorkflowStepKind.Assignment]: 'Assignment',
  [WorkflowStepKind.Processing]: 'Processing',
  [WorkflowStepKind.Verification]: 'Verification',
  [WorkflowStepKind.Review]: 'Review',
  [WorkflowStepKind.Approval]: 'Approval',
  [WorkflowStepKind.SignOff]: 'Sign-off',
  [WorkflowStepKind.Conditional]: 'Conditional',
  [WorkflowStepKind.Endorsement]: 'Endorsement',
  [WorkflowStepKind.Gate]: 'Step-by-step gate',
}

export function stepKindActionLabel(kind?: WorkflowStepKind | null): string {
  if (kind === undefined || kind === null) return 'Approve'
  return STEP_KIND_ACTION_LABELS[kind] ?? 'Approve'
}

export function stepKindLabel(kind?: WorkflowStepKind | null): string {
  if (kind === undefined || kind === null) return '—'
  return STEP_KIND_LABELS[kind] ?? String(kind)
}

export enum SignatureBlockType {
  None = 0,
  PreparedBy = 1,
  ProcessedBy = 2,
  VerifiedBy = 3,
  ReviewedBy = 4,
  ApprovedBy = 5,
  IssuedBy = 6,
  SignedOffBy = 7,
  EndorsedBy = 8,
}

/** Mirror of FormWorkflowCatalog.SignatureCaption - the printed caption. */
export const SIGNATURE_CAPTIONS: Record<SignatureBlockType, string> = {
  [SignatureBlockType.None]: '',
  [SignatureBlockType.PreparedBy]: 'Prepared by',
  [SignatureBlockType.ProcessedBy]: 'Processed by',
  [SignatureBlockType.VerifiedBy]: 'Verified by',
  [SignatureBlockType.ReviewedBy]: 'Reviewed by',
  [SignatureBlockType.ApprovedBy]: 'Approved by',
  [SignatureBlockType.IssuedBy]: 'Issued by',
  [SignatureBlockType.SignedOffBy]: 'Signed off by',
  [SignatureBlockType.EndorsedBy]: 'Endorsed by',
}

export function signatureCaption(block?: SignatureBlockType | null): string {
  if (block === undefined || block === null) return ''
  return SIGNATURE_CAPTIONS[block] ?? ''
}

/** The printed order of the "Prepared by / Reviewed by / Approved by / Dates" block. */
export const SIGNATURE_BLOCK_ORDER: SignatureBlockType[] = [
  SignatureBlockType.PreparedBy,
  SignatureBlockType.ProcessedBy,
  SignatureBlockType.VerifiedBy,
  SignatureBlockType.ReviewedBy,
  SignatureBlockType.ApprovedBy,
  SignatureBlockType.IssuedBy,
  SignatureBlockType.SignedOffBy,
  SignatureBlockType.EndorsedBy,
]

export enum WorkflowStepAction {
  None = 0,
  Created = 1,
  Submitted = 2,
  Assigned = 3,
  Reassigned = 4,
  Delegated = 5,
  Verified = 6,
  Reviewed = 7,
  Approved = 8,
  Rejected = 9,
  Returned = 10,
  Skipped = 11,
  SignedOff = 12,
  Endorsed = 13,
  Amended = 14,
  Reopened = 15,
}

export const STEP_ACTION_LABELS: Record<WorkflowStepAction, string> = {
  [WorkflowStepAction.None]: '—',
  [WorkflowStepAction.Created]: 'Created',
  [WorkflowStepAction.Submitted]: 'Submitted',
  [WorkflowStepAction.Assigned]: 'Assigned',
  [WorkflowStepAction.Reassigned]: 'Re-assigned',
  [WorkflowStepAction.Delegated]: 'Delegated',
  [WorkflowStepAction.Verified]: 'Verified',
  [WorkflowStepAction.Reviewed]: 'Reviewed',
  [WorkflowStepAction.Approved]: 'Approved',
  [WorkflowStepAction.Rejected]: 'Rejected',
  [WorkflowStepAction.Returned]: 'Returned',
  [WorkflowStepAction.Skipped]: 'Skipped',
  [WorkflowStepAction.SignedOff]: 'Signed off',
  [WorkflowStepAction.Endorsed]: 'Endorsed',
  [WorkflowStepAction.Amended]: 'Amended',
  [WorkflowStepAction.Reopened]: 'Reopened',
}

export function stepActionLabel(action?: WorkflowStepAction | null): string {
  if (action === undefined || action === null) return '—'
  return STEP_ACTION_LABELS[action] ?? String(action)
}

export enum SkipMode {
  NotSkippable = 0,
  Manual = 1,
  Auto = 2,
  ManualOrAuto = 3,
  /** "Optional / May Skip Now" driven by a regulatory target date (918 / 918A). */
  RegulatoryDate = 4,
}

export const SKIP_MODE_LABELS: Record<SkipMode, string> = {
  [SkipMode.NotSkippable]: 'Not skippable',
  [SkipMode.Manual]: 'May be skipped manually',
  [SkipMode.Auto]: 'Auto-allocated from form fields',
  [SkipMode.ManualOrAuto]: 'Manual or automatic skip',
  [SkipMode.RegulatoryDate]: 'Optional / May Skip Now (regulatory date)',
}

export function skipModeLabel(mode?: SkipMode | null): string {
  if (mode === undefined || mode === null) return SKIP_MODE_LABELS[SkipMode.NotSkippable]
  return SKIP_MODE_LABELS[mode] ?? String(mode)
}

/** True when a human may press "Skip now" on this step (role check is separate). */
export function isManuallySkippable(mode?: SkipMode | null): boolean {
  return (
    mode === SkipMode.Manual || mode === SkipMode.ManualOrAuto || mode === SkipMode.RegulatoryDate
  )
}

/** Execution state of ONE materialised step (WorkflowEntities.cs). */
export enum WorkflowStepState {
  NotStarted = 0,
  AwaitingAssignment = 1,
  Active = 2,
  Completed = 3,
  Skipped = 4,
  Rejected = 5,
  Returned = 6,
}

export const STEP_STATE_LABELS: Record<WorkflowStepState, string> = {
  [WorkflowStepState.NotStarted]: 'Not started',
  [WorkflowStepState.AwaitingAssignment]: 'Awaiting assignment',
  [WorkflowStepState.Active]: 'Active',
  [WorkflowStepState.Completed]: 'Completed',
  [WorkflowStepState.Skipped]: 'Skipped',
  [WorkflowStepState.Rejected]: 'Rejected',
  [WorkflowStepState.Returned]: 'Returned',
}

export const STEP_STATE_CLASSES: Record<WorkflowStepState, string> = {
  [WorkflowStepState.NotStarted]: 'bg-slate-100 text-slate-700 border-slate-300',
  [WorkflowStepState.AwaitingAssignment]: 'bg-violet-100 text-violet-900 border-violet-300',
  [WorkflowStepState.Active]: 'bg-amber-100 text-amber-900 border-amber-300',
  [WorkflowStepState.Completed]: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  [WorkflowStepState.Skipped]: 'bg-sky-100 text-sky-900 border-sky-300',
  [WorkflowStepState.Rejected]: 'bg-red-100 text-red-900 border-red-300',
  [WorkflowStepState.Returned]: 'bg-orange-100 text-orange-900 border-orange-300',
}

export function stepStateLabel(state?: WorkflowStepState | null): string {
  if (state === undefined || state === null) return '—'
  return STEP_STATE_LABELS[state] ?? String(state)
}

export function stepStateClasses(state?: WorkflowStepState | null): string {
  if (state === undefined || state === null) return STEP_STATE_CLASSES[WorkflowStepState.NotStarted]
  return STEP_STATE_CLASSES[state] ?? STEP_STATE_CLASSES[WorkflowStepState.NotStarted]
}

/** Why a revision cycle was raised (requirement #12). */
export enum RevisionTrigger {
  TwoYearCycle = 0,
  CmmRevised = 1,
  ComponentMaintenanceTaskRevised = 2,
  TaskCardRevised = 3,
  Manual = 4,
}

export const REVISION_TRIGGER_LABELS: Record<RevisionTrigger, string> = {
  [RevisionTrigger.TwoYearCycle]: 'Standard two-year cycle',
  [RevisionTrigger.CmmRevised]: 'CMM revised',
  [RevisionTrigger.ComponentMaintenanceTaskRevised]: 'Component Maintenance Task revised',
  [RevisionTrigger.TaskCardRevised]: 'Task Card revised',
  [RevisionTrigger.Manual]: 'Raised manually',
}

export function revisionTriggerLabel(trigger?: RevisionTrigger | null): string {
  if (trigger === undefined || trigger === null) return '—'
  return REVISION_TRIGGER_LABELS[trigger] ?? String(trigger)
}

/** Mirror of NotificationCategories. */
export const NOTIFICATION_CATEGORIES = {
  Assignment: 'Assignment',
  Approval: 'Approval',
  Rejection: 'Rejection',
  Expiry: 'Expiry',
  Amendment: 'Amendment',
  Revision: 'Revision',
  Completion: 'Completion',
} as const

export type NotificationCategory =
  (typeof NOTIFICATION_CATEGORIES)[keyof typeof NOTIFICATION_CATEGORIES]

// =====================================================================================
// 4. TABLE OF CONTENTS SECTIONS  (mirror of ToCSections)
// =====================================================================================

export const TOC_SECTIONS = {
  SelfAudit: 'PERIODIC_CAPABILITY_SELF_AUDIT',
  LetterOfConfirmation: 'LETTER_OF_CONFIRMATION',
  AmendmentRequest: 'AMENDMENT_REQUEST',
  Form918FAA: '918_FAA',
  Form918ACAA: '918A_CAA',
  Documentation: 'DOCUMENTATION',
  Training: 'TRAINING_DOCUMENT',
  Tools: 'TOOLS_AND_EQUIPMENT',
  Facility: 'FACILITY_REQUIREMENT_EVALUATION',
  Consumables: 'CONSUMABLES',
  FinalSignOff: 'FINAL_SIGN_OFF',
} as const

export type ToCSectionCode = (typeof TOC_SECTIONS)[keyof typeof TOC_SECTIONS]

/** Printed titles + order, exactly as ToCSections.Ordered lists them. */
export const TOC_SECTIONS_ORDERED: ReadonlyArray<{
  code: string
  title: string
  order: number
}> = [
  { code: TOC_SECTIONS.SelfAudit, title: 'PERIODIC CAPABILITY SELF-AUDIT (MNT-1325)', order: 1 },
  { code: TOC_SECTIONS.LetterOfConfirmation, title: 'LETTER OF CONFIRMATION', order: 2 },
  { code: TOC_SECTIONS.AmendmentRequest, title: 'AMENDMENT REQUEST', order: 3 },
  { code: TOC_SECTIONS.Form918FAA, title: '918 FAA', order: 4 },
  { code: TOC_SECTIONS.Form918ACAA, title: '918 A CAA', order: 5 },
  { code: TOC_SECTIONS.Documentation, title: 'DOCUMENTATION', order: 6 },
  { code: TOC_SECTIONS.Training, title: 'TRAINING DOCUMENT', order: 7 },
  { code: TOC_SECTIONS.Tools, title: 'TOOLS AND EQUIPMENT', order: 8 },
  { code: TOC_SECTIONS.Facility, title: 'FACILITY REQUIREMENT EVALUATION', order: 9 },
  { code: TOC_SECTIONS.Consumables, title: 'CONSUMABLES', order: 10 },
  { code: TOC_SECTIONS.FinalSignOff, title: 'FINAL SIGN-OFF', order: 11 },
]

export function tocSectionTitle(code?: string | null): string {
  if (!code) return ''
  const hit = TOC_SECTIONS_ORDERED.find(s => s.code.toLowerCase() === code.trim().toLowerCase())
  return hit ? hit.title : code
}

export function tocSectionOrder(code?: string | null): number {
  if (!code) return Number.MAX_SAFE_INTEGER
  const hit = TOC_SECTIONS_ORDERED.find(s => s.code.toLowerCase() === code.trim().toLowerCase())
  return hit ? hit.order : Number.MAX_SAFE_INTEGER
}

// =====================================================================================
// 5. FORM TYPES AND FORM NUMBERS
//    FormNodeTypes (Enums.cs) + the catalog-local virtual form types.
//    These strings are persisted verbatim in FormSubmission.FormType - never rename.
// =====================================================================================

export const FORM_TYPES = {
  // ----- FormNodeTypes (Enums.cs) -----
  CapabilitySelfEvaluation: 'capability_self_evaluation',
  PeriodicSelfAudit: 'periodic_self_audit',
  ConfirmationLetter: 'confirmation_letter',
  RequestLetter: 'request_letter',
  TableOfContent: 'table_of_content',
  Form918FAA: '918_faa',
  Form918ACAA: '918a_caa',
  SB: 'sb',
  AD: 'ad',
  ComponentMaintenanceTraining: 'component_maintenance_training',
  InspectorProficiency: 'inspector_proficiency',
  CompetencyAssessment: 'competency_assessment',
  SimilarTechnology: 'similar_technology',
  TNA: 'tna',
  ToolNeedAnalysisReport: 'tool_need_analysis_report',
  AlternateToolsEquivalency: 'alternate_tools_equivalency',
  InhouseManufacturedTools: 'inhouse_manufactured_tools',
  RepairFacilityEvaluation: 'repair_facility_evaluation',
  CleaningFacilityEvaluation: 'cleaning_facility_evaluation',
  EnvironmentalFacilityEvaluation: 'environmental_facility_evaluation',
  ConsumablesList: 'list_of_consumables',
  AlternateConsumableDeclaration: 'alternate_consumable_declaration',
  TaskCard: 'task_card',
  TrainingVerificationInspection: 'training_verification_inspection',
  TrainingVerificationTechnician: 'training_verification_technician',
  SimilarTask: 'similar_task',
  SimpleTask: 'simple_task',
  ToolMfgJic: 'tool_mfg_jic',
  ToolRiskAssessment: 'tool_risk_assessment',
  ToolMfgForm1554: 'tool_mfg_form_1554',

  // ----- Catalog-local types (FormWorkflowCatalog.Regulatory.cs / .Documentation.cs) -----
  /** New ATA Record management chain (STL / ENG draft -> Certifying Staff). */
  ATARecord: 'ata_record',
  /** CMM / technical data row of the DOCUMENTATION section (MNT-1420). */
  CmmDocumentation: 'cmm_documentation',
  /** Folder-level final sign-off chain (requirement #13). */
  FolderSignOff: 'evaluation_folder_signoff',
  /** Amendment cycle raised from an expiry (requirement #10). */
  ExpiryAmendment: 'expiry_amendment',
  /** Two-year / documentation-triggered revision cycle (requirement #12). */
  FolderRevision: 'folder_revision',
} as const

export type WorkflowFormType = (typeof FORM_TYPES)[keyof typeof FORM_TYPES]

/**
 * Printed form numbers. Offline fallback only - the authoritative value is
 * `formNo` from GET /api/workflow/catalog.
 */
export const FORM_NUMBERS: Record<string, string> = {
  [FORM_TYPES.PeriodicSelfAudit]: 'MNT-1325',
  [FORM_TYPES.ConfirmationLetter]: 'MNT-LOC',
  [FORM_TYPES.RequestLetter]: 'MNT-918 (Request Letter)',
  [FORM_TYPES.Form918FAA]: 'MNT-918',
  [FORM_TYPES.Form918ACAA]: 'MNT-918A',
  [FORM_TYPES.CmmDocumentation]: 'MNT-1420',
  [FORM_TYPES.SB]: 'MNT-1420A',
  [FORM_TYPES.AD]: 'MNT-1420B',
  [FORM_TYPES.TaskCard]: 'MNT-1420C',
  [FORM_TYPES.TNA]: 'MNT-1229B',
  [FORM_TYPES.InspectorProficiency]: 'MNT-1378',
  [FORM_TYPES.CompetencyAssessment]: 'MNT 3.14-020',
  [FORM_TYPES.ATARecord]: 'ATA-REC',
}

export function formNumberOf(formType?: string | null): string {
  if (!formType) return ''
  return FORM_NUMBERS[formType.trim().toLowerCase()] ?? ''
}

/**
 * Form types whose data comes from an EXTERNAL source system (no approval process —
 * the row closes on submit / sync). Values mirror EXTERNAL_SOURCE_FORM_TYPES of
 * status-badge.ts; kept here so the view-model has a single import source.
 */
const AUTO_GENERATED_FORM_SOURCES: Readonly<Record<string, string>> = {
  capability_self_evaluation: 'CMM REV. STATUS · external integration',
  task_card: 'TASK CARD · external integration',
}

/** True when the form's data is auto-generated: no approval process, closes on submit. */
export function isAutoGeneratedFormType(formType?: string | null): boolean {
  return Boolean(AUTO_GENERATED_FORM_SOURCES[String(formType ?? '').trim().toLowerCase()])
}

/** Name of the external source system, rendered next to the "Auto-generated" badge. */
export function autoGeneratedSourceOf(formType?: string | null): string {
  return AUTO_GENERATED_FORM_SOURCES[String(formType ?? '').trim().toLowerCase()] ?? ''
}

/**
 * MNT-1420A initiation rule: the SB / SL / SIL draft is "Triggered under the
 * Others category". Mirror of DocumentationInitiationCategories.
 */
export const DOCUMENTATION_INITIATION_CATEGORY_OTHERS = 'others'

export function isOthersInitiationCategory(value?: string | null): boolean {
  return (value ?? '').trim().toLowerCase() === DOCUMENTATION_INITIATION_CATEGORY_OTHERS
}

/** camelCase FormDataJson keys the Documentation catalog part declares. */
export const WORKFLOW_FIELDS = {
  InitiationCategory: 'initiationCategory',
  BulletinNumber: 'bulletinNumber',
  BulletinType: 'bulletinType',
  ADNumber: 'adNumber',
  Applicability: 'applicability',
  ComplianceMethod: 'complianceMethod',
  CmmNumber: 'cmmNumber',
  CmmRevision: 'cmmRevision',
  TaskCardNumber: 'taskCardNumber',
  RequiresLibraryCrossCheck: 'requiresLibraryCrossCheck',
  RequiresTechnicalReview: 'requiresTechnicalReview',
} as const

// =====================================================================================
// 6. REQUEST SHAPES  (1:1 with WorkflowApiContracts.cs)
// =====================================================================================

export interface CreateFolderRequest {
  ataRecordId: string
  shopId?: string | null
  title: string
  /** Drives the "Optional / May Skip Now" flag of 918 / 918A. Null = no date set yet. */
  regulatoryTargetDate?: string | null
  enableJointApprovalPath?: boolean
  linkedCmmRevision?: string
  linkedComponentTaskRevision?: string
  linkedTaskCardRevision?: string
}

export interface CreateFormDraftRequest {
  formType: string
  evaluationFolderId?: string | null
  ataRecordId?: string | null
  formDataJson: string
  /** MNT-1420A only: must be "others". */
  initiationCategory?: string | null
  regulatoryTargetDate?: string | null
}

export interface SubmitFormRequest {
  formDataJson?: string | null
  /** Optional pre-assignment of the first step. NUMBER, never a Guid. */
  assignToUserId?: number | null
  comments?: string
}

export interface AssignStepRequest {
  stepNo?: number | null
  assignToUserId: number
  comments?: string
}

export interface DelegateStepRequest {
  stepNo?: number | null
  delegateToUserId: number
  /** Mandatory "workload is high" justification. */
  reason: string
}

/**
 * AMENDED v14 - POST /api/workflow/forms/{instanceId}/request-review
 * The approver sends the step to a delegated reviewer while KEEPING the approval.
 */
export interface RequestDelegatedReviewRequest {
  stepNo?: number | null
  reviewerUserId: number
  comments?: string
}

/**
 * AMENDED v14 - POST /api/workflow/forms/{instanceId}/confirm-review
 * The delegated reviewer confirms; the step returns to the SAME StepNo and its own
 * Status so the original approver performs the final approval.
 */
export interface ConfirmDelegatedReviewRequest {
  stepNo?: number | null
  comments?: string
}

export interface DecisionRequest {
  stepNo?: number | null
  comments?: string
  returnToStepNo?: number | null
  formDataJson?: string | null
}

export interface SkipStepRequest {
  stepNo?: number | null
  reason: string
}

export interface ChecklistVerifyRequest {
  stepNo?: number | null
  /** "PAGE-07", "TOOL-EQ-03", "FAC-TEMP" ... */
  itemCode: string
  verified: boolean
  /** Mandatory when verified is false. */
  finding?: string
}

export interface EnableJointApprovalRequest {
  enable: boolean
  regulatoryTargetDate?: string | null
  generateCompanionForm?: boolean
}

export interface StartAmendmentRequest {
  formDataJson: string
  reason?: string
  newValidFrom?: string | null
}

export interface RaiseRevisionRequest {
  trigger: RevisionTrigger
  triggerReference?: string
  newRevision?: string
  notes?: string
}

export interface UpsertCompetencyRequest {
  employeeUserId: number
  trainingCode: string
  trainingTitle?: string
  trainingCompletedDate?: string | null
  level: number
  isEligible: boolean
  remarks?: string
}

export interface UpsertToolEquivalencyRequest {
  id?: string | null
  originalToolPartNumber: string
  originalToolDescription?: string
  alternateToolPartNumber?: string
  alternateToolDescription?: string
  equivalencyBasis?: string
  isInhouseManufactured?: boolean
  calibrationInterval?: string
  lastCalibrationDate?: string | null
}

// =====================================================================================
// 7. RESPONSE SHAPES  (1:1 with WorkflowApiContracts.cs)
// =====================================================================================

export interface WorkflowActionResponse {
  success: boolean
  message: string
  errorCode?: string | null
  instanceId: string
  status: ApprovalStatus
  statusLabel: string
  lifecycleState: FormLifecycleState
  currentStepNo: number
  currentStepTitle: string
  currentAssigneeUserId?: number | null
  currentAssigneeName: string
  /** Steps auto-skipped by this transition -> "N steps skipped" toast. */
  autoSkippedSteps: number[]
  isComplete: boolean
  isLocked: boolean
  folderCompleted: boolean
  reportGenerated: boolean
  companionInstanceId?: string | null
}

export interface WorkflowStepResponse {
  id: string
  stepNo: number
  title: string

  kind: WorkflowStepKind
  kindLabel: string

  state: WorkflowStepState
  stateLabel: string

  pendingStatus: ApprovalStatus
  pendingStatusLabel: string

  actionTaken: WorkflowStepAction

  signatureBlock: SignatureBlockType
  signatureCaption: string

  eligibleRoles: string[]
  eligibleRoleLabels: string[]

  requiresManualAssignment: boolean
  assignerRoles: string[]
  assignmentUnit?: string | null

  restrictToOriginatorShop: boolean
  allowsDelegation: boolean

  /**
   * AMENDED v14 - delegated-review definition of the step. Optional, so a server
   * build that predates the amendment still type-checks.
   */
  allowsDelegatedReview?: boolean | null
  delegatedReviewRoles?: string[] | null
  delegatedReviewRequiresComments?: boolean | null

  requiresComments: boolean
  isStepByStepChecklist: boolean

  /**
   * AMENDED v18 - mirror of WorkflowStepDefinition.RequiredFields (WorkflowContracts.cs v11).
   * FormDataJson keys that must be filled before THIS step can be completed. Optional, so a
   * server build that predates the amendment still type-checks.
   */
  requiredFields?: string[] | null

  skipMode: SkipMode
  skipConditionField?: string | null
  isSkipped: boolean
  skippedAutomatically: boolean
  skipReason: string

  assignedToUserId?: number | null
  assignedToName: string
  assignedToRole: string
  assignedAt?: string | null

  actedByUserId?: number | null
  actedByName: string
  actedByRole: string
  actedAt?: string | null

  comments: string

  wasDelegated: boolean
  delegationReason: string

  /**
   * AMENDED v12/v14 - delegated-review state. When a step is in
   * ApprovalStatus.PendingDelegatedReview the approver has borrowed a reviewer:
   * the REVIEWER acts now, but only the ORIGINAL approver may stamp the final
   * signature. `originalApproverUserId` is who the step belonged to before the
   * borrow; `reviewerUserId` is who is acting under delegation.
   */
  isPendingDelegatedReview?: boolean | null
  originalApproverUserId?: number | null
  originalApproverName?: string | null
  reviewerUserId?: number | null
  reviewerName?: string | null
  /** True when the delegated review is done and the step returns to the approver. */
  returnsToOriginalApprover?: boolean | null

  checklistTotalItems: number
  checklistVerifiedItems: number

  // ----- Capability flags computed server side FOR THE CALLING USER -----
  canIAct: boolean
  canIAssign: boolean
  canIDelegate: boolean
  canISkip: boolean

  /**
   * AMENDED v14 - delegated-review capabilities of the calling user. Optional, so a
   * server build that predates the amendment still type-checks.
   */
  canIRequestDelegatedReview?: boolean | null
  canIConfirmDelegatedReview?: boolean | null
}

export interface FormSignatureResponse {
  block: SignatureBlockType
  caption: string
  stepNo: number
  userId?: number | null
  personName: string
  personRole: string
  personRoleLabel: string
  signedAt: string
  signatureHash: string
}

export interface WorkflowInstanceResponse {
  id: string
  formSubmissionId?: string | null
  evaluationFolderId?: string | null
  ataRecordId?: string | null
  shopId?: string | null

  formType: string
  formNo: string
  title: string
  section: string
  sectionTitle: string

  status: ApprovalStatus
  statusLabel: string
  lifecycleState: FormLifecycleState

  currentStepNo: number
  currentAssigneeUserId?: number | null
  currentAssigneeName: string
  currentAssignmentUnit?: string | null

  originatorUserId: number
  originatorName: string
  originatorRole: string

  submittedAt?: string | null
  completedAt?: string | null
  expiresAt?: string | null

  isComplete: boolean
  isLocked: boolean

  isOptionalByRegulatoryDate: boolean
  regulatoryTargetDate?: string | null
  maySkipNow: boolean
  jointApprovalEnabled: boolean
  jointApprovalCompanionInstanceId?: string | null

  revisionNumber: number

  totalSteps: number
  completedSteps: number
  progressPercent: number

  /**
   * AMENDED v12/v14 - delegated-review summary for the whole instance, so the ToC and the
   * inbox can show "under delegated review by X for Y" without scanning every step.
   */
  isPendingDelegatedReview?: boolean | null
  originalApproverUserId?: number | null
  originalApproverName?: string | null
  reviewerUserId?: number | null
  reviewerName?: string | null

  formDataJson: string

  steps: WorkflowStepResponse[]
  signatures: FormSignatureResponse[]
}

export interface TableOfContentsItemResponse {
  id: string

  sectionCode: string
  sectionTitle: string
  sectionOrder: number
  itemOrder: number

  formType: string
  formNo: string
  formTitle: string

  isMandatory: boolean
  isOptionalByRegulatoryDate: boolean
  maySkipNow: boolean

  formSubmissionId?: string | null
  formWorkflowInstanceId?: string | null

  status: ApprovalStatus
  statusLabel: string

  lifecycleState: FormLifecycleState
  lifecycleStateLabel: string

  totalSteps: number
  completedSteps: number

  currentStepTitle: string
  currentAssigneeUserId?: number | null
  currentAssigneeName: string

  expiresAt?: string | null
  isExpired: boolean

  remarks: string
  routingLabel?: string
  routingReadOnly?: boolean

  /** The calling user may create the draft -> drives the "Start draft" button. */
  canIDraft: boolean
  /** The calling user owns the pending step -> drives the "Act" button. */
  canIAct: boolean
  /** Cross-form and ATA-record approval gate for this row. */
  approvalGateOpen?: boolean
  approvalGateMessage?: string
}

export interface TableOfContentsSectionResponse {
  code: string
  title: string
  order: number
  totalItems: number
  approvedItems: number
  pendingItems: number
  skippedItems: number
  expiredItems: number

  /**
   * AMENDED v18 - the ToC renders SIX lifecycle buckets, so these two complete the set.
   * OPTIONAL, because `toc-view-model.ts` recomputes every counter from the items anyway.
   */
  draftItems?: number | null
  actionRequiredItems?: number | null

  items: TableOfContentsItemResponse[]
}

export interface TableOfContentsResponse {
  folderId: string
  folderCode: string
  title: string
  ataChapterCode: string
  partNumber: string
  status: ApprovalStatus
  statusLabel: string
  completionPercent: number
  /** Current ATA/folder revision, when supplied by the backend. */
  revisionNumber?: number
  sections: TableOfContentsSectionResponse[]
}

export interface FolderProgressResponse {
  folderId: string
  totalItems: number
  approvedItems: number
  skippedItems: number
  pendingItems: number
  expiredItems: number
  completionPercent: number
  isComplete: boolean
  isLocked: boolean
  /** Mandatory forms still blocking completion. */
  remainingItems: TableOfContentsItemResponse[]
  reportAvailable: boolean
  reportGeneratedAt?: string | null
}

export interface FolderSummaryResponse {
  id: string
  ataRecordId: string
  shopId?: string | null
  folderCode: string
  title: string
  ataChapterCode: string
  partNumber: string
  status: ApprovalStatus
  statusLabel: string
  completionPercent: number
  pendingItems: number
  expiredItems: number
  isComplete: boolean
  isLocked: boolean
  revisionNumber: number
  revisionDueDate?: string | null
  completedAt?: string | null
}

export interface FolderDetailResponse {
  folder: FolderSummaryResponse
  tableOfContents: TableOfContentsResponse
  progress: FolderProgressResponse
  signOff?: WorkflowInstanceResponse | null
}

export interface FolderReportResponse {
  folderId: string
  success: boolean
  message: string
  fileName: string
  /** Download URL served by the API - never a raw local path. */
  downloadUrl: string
  generatedAt: string
  includedForms: number
  includedSignatures: number
}

export interface InboxItemResponse {
  instanceId: string
  formSubmissionId?: string | null
  evaluationFolderId?: string | null

  formType: string
  formNo: string
  title: string
  sectionTitle: string

  status: ApprovalStatus
  statusLabel: string

  stepNo: number
  stepTitle: string
  stepKind: WorkflowStepKind

  /** True when the row is in the caller's TEAM queue, not personally assigned. */
  isUnitQueue: boolean
  assignmentUnit?: string | null

  needsAssignment: boolean
  canIAct: boolean
  canIAssign: boolean
  canISkip: boolean

  originatorName: string
  submittedAt?: string | null
  dueDate?: string | null
  isOverdue: boolean

  /** Owning ATA record used by the Self-Evaluation action rail for deep linking. */
  ataRecordId?: string | null
  shopId?: string | null
  ownerRoleLabel?: string | null
  currentAssigneeName?: string | null
}

export interface CatalogStepResponse {
  stepNo: number
  title: string
  status: string
  kind: string
  eligibleRoles: string[]
  eligibleRoleLabels: string[]
  signatureCaption: string
  requiresManualAssignment: boolean
  assignerRoles: string[]
  assignmentUnit?: string | null
  skipMode: string
  skipConditionField?: string | null
  restrictToOriginatorShop: boolean
  allowsDelegation: boolean

  /**
   * AMENDED v14 - delegated-review definition (catalog view of the step table).
   * Optional, so a server build that predates the amendment still type-checks.
   */
  allowsDelegatedReview?: boolean | null
  delegatedReviewRoles?: string[] | null
  delegatedReviewRequiresComments?: boolean | null

  /** AMENDED v18 - mirror of WorkflowStepDefinition.RequiredFields. */
  requiredFields?: string[] | null
  /** AMENDED v18 - the catalog also exposes these two flags of the step table. */
  requiresComments?: boolean | null
  isStepByStepChecklist?: boolean | null
}

export interface CatalogFormResponse {
  formType: string
  formNo: string
  title: string
  section: string
  sectionTitle: string
  order: number

  draftRoles: string[]
  draftRoleLabels: string[]

  /**
   * AMENDED v18 - mirror of FormWorkflowDefinition.RequiredDraftFields
   * (WorkflowContracts.cs v11). Declaring it here removes the
   * `form as unknown as { requiredDraftFields?: string[] }` cast that
   * `workflow-permissions.ts` (v14, section 6) had to use.
   */
  requiredDraftFields?: string[] | null

  includeInFolder: boolean
  isMandatory: boolean
  isOptionalByRegulatoryDate: boolean
  isGeneratedByJointApproval: boolean
  jointApprovalCompanionFormType?: string | null
  expiryMonths?: number | null
  isFinalReleaseGate: boolean
  bypassesLowerTiers: boolean
  remarks: string

  canIDraft: boolean

  steps: CatalogStepResponse[]
}

export interface MyPermissionsResponse {
  userId: number
  role: string
  roleLabel: string
  shopId?: string | null
  departmentId?: string | null
  functionalUnit?: string | null
  leadsFunctionalUnit: boolean
  /** (defaults + AdditionalPermissions) - RevokedPermissions. */
  permissions: string[]
  creatableRoles: string[]
  draftableFormTypes: string[]
  canSkipSteps: boolean
  canDelegate: boolean
  canGrantPrivileges: boolean
}

export interface ExpiryItemResponse {
  id: string
  entityType: string
  entityId: string
  evaluationFolderId?: string | null
  formType: string
  trackedItem: string
  validFrom: string
  expiresAt: string
  daysRemaining: number
  isExpired: boolean
  isInWarningWindow: boolean
  responsibleUserId?: number | null
  responsibleRole: string
  amendmentInstanceId?: string | null
  status: ApprovalStatus
  statusLabel: string
  canIAmend: boolean
}

export interface NotificationResponse {
  id: string
  category: string
  title: string
  message: string
  entityType: string
  entityId: string
  formWorkflowInstanceId?: string | null
  evaluationFolderId?: string | null
  actionUrl: string
  isRead: boolean
  createdAt: string
}

export interface RevisionResponse {
  id: string
  evaluationFolderId: string
  revisionNumber: number
  trigger: RevisionTrigger
  triggerLabel: string
  triggerReference: string
  previousRevision: string
  newRevision: string
  revisionInstanceId?: string | null
  status: ApprovalStatus
  statusLabel: string
  raisedAt: string
  closedAt?: string | null
  notes: string
}

export interface CompetencyMatrixRowResponse {
  id: string
  employeeUserId: number
  employeeName: string
  employeeNo: string
  employeeRole: string
  employeeRoleLabel: string
  trainingCode: string
  trainingTitle: string
  sourceFormType: string
  trainingCompletedDate?: string | null
  trainingExpiryDate?: string | null
  daysRemaining?: number | null
  level: ProficiencyLevel
  isEligible: boolean
  isExpired: boolean
  verifiedByRole: string
  verifiedAt?: string | null
  remarks: string
}

export interface ToolEquivalencyRowResponse {
  id: string
  originalToolPartNumber: string
  originalToolDescription: string
  alternateToolPartNumber: string
  alternateToolDescription: string
  equivalencyBasis: string
  isInhouseManufactured: boolean
  equivalencyApproved: boolean
  approvedByRole: string
  approvedAt?: string | null
  status: ToolStatus
  calibrationInterval: string
  lastCalibrationDate?: string | null
  calibrationDueDate?: string | null
  calibrationOverdue: boolean
  sourceFormType: string
}

// =====================================================================================
// 8. ERROR CODES  (mirror of WorkflowErrorCodes) + user-facing messages
// =====================================================================================

export const WORKFLOW_ERROR_CODES = {
  FormNotCatalogued: 'FORM_NOT_CATALOGUED',
  InstanceNotFound: 'INSTANCE_NOT_FOUND',
  FolderNotFound: 'FOLDER_NOT_FOUND',
  FolderLocked: 'FOLDER_LOCKED',
  NotDraftRole: 'NOT_DRAFT_ROLE',
  RoleNotEligible: 'ROLE_NOT_ELIGIBLE',
  NotAssignee: 'NOT_ASSIGNEE',
  StepNotActive: 'STEP_NOT_ACTIVE',
  AssignmentRequired: 'ASSIGNMENT_REQUIRED',
  AssigneeInvalidRole: 'ASSIGNEE_INVALID_ROLE',
  AssigneeOutsideShop: 'ASSIGNEE_OUTSIDE_SHOP',
  DelegateNotLowerTier: 'DELEGATE_NOT_LOWER_TIER',
  DelegationNotAllowed: 'DELEGATION_NOT_ALLOWED',
  StepNotSkippable: 'STEP_NOT_SKIPPABLE',
  SkipNotPermitted: 'SKIP_NOT_PERMITTED',
  RegulatoryDateReached: 'REGULATORY_DATE_REACHED',
  CommentsRequired: 'COMMENTS_REQUIRED',
  ChecklistIncomplete: 'CHECKLIST_INCOMPLETE',
  OutsideOwnShop: 'OUTSIDE_OWN_SHOP',
  InitiationCategoryInvalid: 'INITIATION_CATEGORY_INVALID',
  PermissionDenied: 'PERMISSION_DENIED',
  MandatoryFormsPending: 'MANDATORY_FORMS_PENDING',
  AlreadyCompleted: 'ALREADY_COMPLETED',

  // ===== AMENDED v18 - codes the client layers already emit but v11 never declared =====
  /** HTTP 422, and the local pre-flight of validateDecisionPayload() / canDraft(). */
  RequiredFieldsMissing: 'REQUIRED_FIELDS_MISSING',
  /** The step is owned by the Documentation / HR functional unit. */
  OutsideFunctionalUnit: 'OUTSIDE_FUNCTIONAL_UNIT',
  /** The record was signed off and locked (folder-level lock). */
  InstanceLocked: 'INSTANCE_LOCKED',
  /** MNT-1378 Inspector / MNT-922C Technician exclusive routing. */
  ExclusiveDesignation: 'EXCLUSIVE_DESIGNATION',

  // ===== AMENDED v14 - archive (ArchiveDenialCodes) =====
  ArchiveNotAuthorizedRole: 'ARCHIVE_NOT_AUTHORIZED_ROLE',
  ArchiveMissingPermission: 'ARCHIVE_MISSING_PERMISSION',
  ArchiveReasonRequired: 'ARCHIVE_REASON_REQUIRED',
  ArchiveAlreadyArchived: 'ARCHIVE_ALREADY_ARCHIVED',
  ArchiveNotArchived: 'ARCHIVE_NOT_ARCHIVED',
  ArchiveEntryNotRestorable: 'ARCHIVE_ENTRY_NOT_RESTORABLE',
  ArchiveItemMismatch: 'ARCHIVE_ITEM_MISMATCH',
  ArchiveShopScopeViolation: 'ARCHIVE_SHOP_SCOPE_VIOLATION',

  // ===== AMENDED v14 - engineer provisioning & shop routing (EngineerRoutingDenialCodes) =====
  EngNotSpecialTeamLeader: 'ENG_NOT_SPECIAL_TEAM_LEADER',
  EngTargetNotEngineer: 'ENG_TARGET_NOT_ENGINEER',
  EngMissingPermission: 'ENG_MISSING_PERMISSION',
  EngNoTargetShops: 'ENG_NO_TARGET_SHOPS',
  EngDuplicateTargetShop: 'ENG_DUPLICATE_TARGET_SHOP',
  EngShopHasNoTeamLeader: 'ENG_SHOP_HAS_NO_TEAM_LEADER',
  EngNotOwningTeamLeader: 'ENG_NOT_OWNING_TEAM_LEADER',
  EngDelegationNotUsable: 'ENG_DELEGATION_NOT_USABLE',
} as const

export type WorkflowErrorCode =
  (typeof WORKFLOW_ERROR_CODES)[keyof typeof WORKFLOW_ERROR_CODES]

const WORKFLOW_ERROR_MESSAGES: Record<string, string> = {
  FORM_NOT_CATALOGUED: 'This form type has no routing definition on the server.',
  INSTANCE_NOT_FOUND: 'The workflow record no longer exists.',
  FOLDER_NOT_FOUND: 'The evaluation folder no longer exists.',
  FOLDER_LOCKED: 'The folder is signed off and locked. Raise a revision or amendment first.',
  NOT_DRAFT_ROLE: 'Your role is not allowed to create this form.',
  ROLE_NOT_ELIGIBLE: 'Your role is not eligible to act on this step.',
  NOT_ASSIGNEE: 'This step is assigned to somebody else.',
  STEP_NOT_ACTIVE: 'That step is not the one currently pending.',
  ASSIGNMENT_REQUIRED: 'An assignee must be selected before this step can start.',
  ASSIGNEE_INVALID_ROLE: 'The selected person does not hold a role eligible for this step.',
  ASSIGNEE_OUTSIDE_SHOP: 'The selected person does not belong to your shop.',
  DELEGATE_NOT_LOWER_TIER: 'A step may only be delegated to strictly lower-tier staff.',
  DELEGATION_NOT_ALLOWED: 'This step cannot be delegated.',
  STEP_NOT_SKIPPABLE: 'This step cannot be skipped.',
  SKIP_NOT_PERMITTED: 'Your role does not hold skip authority.',
  REGULATORY_DATE_REACHED:
    'The regulatory target date has been reached: this step can no longer be deferred.',
  COMMENTS_REQUIRED: 'Comments are mandatory for this action.',
  CHECKLIST_INCOMPLETE: 'Every checklist item must be verified before the final release.',
  OUTSIDE_OWN_SHOP: 'You may only act on records of your own shop.',
  INITIATION_CATEGORY_INVALID: 'MNT-1420A must be initiated under the "Others" category.',
  PERMISSION_DENIED: 'You do not have permission to perform this action.',
  MANDATORY_FORMS_PENDING: 'Mandatory forms are still open, so the folder cannot be completed.',
  ALREADY_COMPLETED: 'This record is already completed.',

  // ===== AMENDED v18 =====
  REQUIRED_FIELDS_MISSING: 'Mandatory fields are still empty.',
  OUTSIDE_FUNCTIONAL_UNIT: 'This step is owned by a central functional unit.',
  INSTANCE_LOCKED: 'The record is locked. Raise an amendment or a revision cycle first.',
  EXCLUSIVE_DESIGNATION: 'This step is routed exclusively to the designated person.',

  // ===== AMENDED v14 - archive =====
  ARCHIVE_NOT_AUTHORIZED_ROLE: 'Only the Director, QA Manager, ECAA or an Admin may revoke or delete a record.',
  ARCHIVE_MISSING_PERMISSION: 'You may view this archived item but not perform this action; the archive permission is required.',
  ARCHIVE_REASON_REQUIRED: 'A written reason is mandatory: a revoked approval without a recorded justification is itself an audit finding.',
  ARCHIVE_ALREADY_ARCHIVED: 'This item is already in the Archive.',
  ARCHIVE_NOT_ARCHIVED: 'This item is not in the Archive; edit it through the normal form route.',
  ARCHIVE_ENTRY_NOT_RESTORABLE: 'This archive entry has already been closed. Only an entry still in the Archived state can be restored.',
  ARCHIVE_ITEM_MISMATCH: 'The archive entry does not belong to the item being restored.',
  ARCHIVE_SHOP_SCOPE_VIOLATION: 'You may only act on archived records of your own shop.',

  // ===== AMENDED v14 - engineer provisioning & shop routing =====
  ENG_NOT_SPECIAL_TEAM_LEADER: 'The Engineer role is created and assigned by the Special Team Leader.',
  ENG_TARGET_NOT_ENGINEER: 'This rule governs the Engineer role only; use the standard user-creation matrix for any other role.',
  ENG_MISSING_PERMISSION: 'Routing an ATA record to a shop requires the Engineer, Shop Team Leader, Special Team Leader, Shop Manager or Manager role.',
  ENG_NO_TARGET_SHOPS: 'Select at least one target shop: an ATA record cannot be routed to nobody.',
  ENG_DUPLICATE_TARGET_SHOP: 'The same shop was selected more than once. Each shop must appear exactly once.',
  ENG_SHOP_HAS_NO_TEAM_LEADER: 'This shop has no active Shop Team Leader. Assign one before this routing can be actioned.',
  ENG_NOT_OWNING_TEAM_LEADER: 'This record is routed to the designated Shop Team Leader of that shop. Only that Shop Team Leader can action it.',
  ENG_DELEGATION_NOT_USABLE: 'The delegated reviewer is no longer eligible to act on this routing.',
}

/** Toast-safe message. Prefers the server `message`, falls back to the code map. */
export function workflowErrorMessage(response?: {
  message?: string
  errorCode?: string | null
} | null): string {
  if (!response) return 'The action could not be completed.'
  if (response.message && response.message.trim()) return response.message
  if (response.errorCode && WORKFLOW_ERROR_MESSAGES[response.errorCode]) {
    return WORKFLOW_ERROR_MESSAGES[response.errorCode]
  }
  return 'The action could not be completed.'
}

/** Message of a bare code, used to explain a control that is disabled locally. */
export function workflowErrorCodeMessage(code?: string | null): string {
  if (!code) return ''
  return WORKFLOW_ERROR_MESSAGES[code] ?? code
}

// =====================================================================================
// 9. AMENDED v14 - PROGRESS TRACKING & STATUS BADGES
//    Mirror of CMT.Domain/Models/Workflow/ToCProgressContracts.cs
// =====================================================================================

/** Mirror of StatusBadgeTone. Maps 1:1 to a corporate palette; never switch on raw status. */
export enum StatusBadgeTone {
  /** Draft / not started - grey. */
  Neutral = 0,
  /** In flight, waiting on somebody - amber. */
  InProgress = 1,
  /** Approved / completed / locked - green. */
  Success = 2,
  /** Skipped - muted blue; closed but not approved. */
  Muted = 3,
  /** Rejected / returned / revoked - red. */
  Danger = 4,
  /** Expired - orange; time-based failure. */
  Expired = 5,
}

/** Tailwind classes per tone. Dark text on light background - always contrasting. */
export const STATUS_BADGE_TONE_CLASSES: Record<StatusBadgeTone, string> = {
  [StatusBadgeTone.Neutral]: 'bg-slate-100 text-slate-800 border-slate-300',
  [StatusBadgeTone.InProgress]: 'bg-amber-100 text-amber-900 border-amber-300',
  [StatusBadgeTone.Success]: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  [StatusBadgeTone.Muted]: 'bg-sky-100 text-sky-900 border-sky-300',
  [StatusBadgeTone.Danger]: 'bg-red-100 text-red-900 border-red-300',
  [StatusBadgeTone.Expired]: 'bg-orange-100 text-orange-900 border-orange-300',
}

/**
 * Urgency palette for expiry / calibration date chips, from the same corporate palette:
 * red when overdue or due today, orange inside the 30-day warning window, amber inside
 * 90 days, emerald when comfortably valid, slate when the date is not tracked.
 */
export function expiryUrgencyClasses(daysRemaining?: number | null): string {
  if (daysRemaining === null || daysRemaining === undefined || !Number.isFinite(daysRemaining)) {
    return 'border-slate-300 bg-slate-100 text-slate-800'
  }
  if (daysRemaining <= 0) return 'border-red-300 bg-red-100 text-red-900'
  if (daysRemaining <= 30) return 'border-orange-300 bg-orange-100 text-orange-900'
  if (daysRemaining <= 90) return 'border-amber-300 bg-amber-100 text-amber-900'
  return 'border-emerald-300 bg-emerald-100 text-emerald-900'
}

/** Progress-bar fill per tone. */
export const STATUS_BADGE_TONE_BAR_CLASSES: Record<StatusBadgeTone, string> = {
  [StatusBadgeTone.Neutral]: 'bg-slate-400',
  [StatusBadgeTone.InProgress]: 'bg-amber-500',
  [StatusBadgeTone.Success]: 'bg-emerald-500',
  [StatusBadgeTone.Muted]: 'bg-sky-400',
  [StatusBadgeTone.Danger]: 'bg-red-500',
  [StatusBadgeTone.Expired]: 'bg-orange-500',
}

export function statusBadgeToneClasses(tone?: StatusBadgeTone | null): string {
  if (tone === undefined || tone === null) return STATUS_BADGE_TONE_CLASSES[StatusBadgeTone.Neutral]
  return STATUS_BADGE_TONE_CLASSES[tone] ?? STATUS_BADGE_TONE_CLASSES[StatusBadgeTone.Neutral]
}

/** Mirror of StatusBadge. */
export interface StatusBadgeDto {
  status: ApprovalStatus
  state: FormLifecycleState
  label: string
  shortLabel: string
  tone: StatusBadgeTone
  isOutstanding: boolean
}

/** Mirror of ApprovalBottleneck - "which role is causing the hold-up". */
export interface ApprovalBottleneckDto {
  /** Step currently pending; -1 when nothing is pending. */
  stepNo: number
  stepTitle: string
  blockingRoles: string[]
  blockingRolesLabel: string
  blockingUserId?: number | null
  blockingUserName: string
  /** True when the hold-up is a v12 delegated review (chase the REVIEWER, not the approver). */
  isDelegatedReview: boolean
  daysWaiting: number
}

/** True when nothing is blocked. Mirror of ApprovalBottleneck.IsClear. */
export function isBottleneckClear(bottleneck?: ApprovalBottleneckDto | null): boolean {
  return !bottleneck || bottleneck.stepNo < 0
}

/** Mirror of FormProgressView. */
export interface FormProgressViewDto {
  formWorkflowInstanceId?: string | null
  formType: string
  formNo: string
  title: string
  sectionCode: string
  orderInSection: number
  badge: StatusBadgeDto
  bottleneck: ApprovalBottleneckDto
  totalApprovalSteps: number
  completedApprovalSteps: number
  remainingApprovalSteps: number
  completionPercent: number
  isComplete: boolean
  isMandatory: boolean
  isAutoGenerated: boolean
  remainingApprovalsText: string
}

/** Mirror of SectionProgressView. */
export interface SectionProgressViewDto {
  sectionCode: string
  sectionTitle: string
  sectionOrder: number
  totalForms: number
  completedForms: number
  remainingForms: number
  totalApprovalSteps: number
  completedApprovalSteps: number
  remainingApprovalSteps: number
  completionPercent: number
  worstTone: StatusBadgeTone
  blockingRoles: string[]
  blockingRolesLabel: string
  remainingApprovalsText: string
  forms: FormProgressViewDto[]
}

/** Mirror of FolderProgressView - the whole ToC progress tree. */
export interface FolderProgressViewDto {
  evaluationFolderId?: string | null
  ataRecordId?: string | null
  ataChapterCode: string
  totalForms: number
  completedForms: number
  remainingForms: number
  totalApprovalSteps: number
  completedApprovalSteps: number
  remainingApprovalSteps: number
  /** The single number the top progress bar renders. */
  completionPercent: number
  worstTone: StatusBadgeTone
  primaryBlockingRole: string
  primaryBlockingRoleLabel: string
  primaryBlockingRoleFormCount: number
  longestWaitDays: number
  remainingApprovalsText: string
  sections: SectionProgressViewDto[]
}

// =====================================================================================
// 10. AMENDED v14 - ARCHIVE & SOFT-DELETE
//     Mirror of CMT.Domain/Models/SelfEvaluation/ArchiveEntities.cs + ArchivePolicy.cs
// =====================================================================================

export enum ArchivedItemKind {
  /** A whole ATA record and, by containment, its child forms. */
  ATARecord = 0,
  /** A single catalogued form (FormSubmission) inside an ATA record. */
  Form = 1,
  /** A whole evaluation folder. */
  EvaluationFolder = 2,
}

export const ARCHIVED_ITEM_KIND_LABELS: Record<ArchivedItemKind, string> = {
  [ArchivedItemKind.ATARecord]: 'ATA record',
  [ArchivedItemKind.Form]: 'Form',
  [ArchivedItemKind.EvaluationFolder]: 'Evaluation folder',
}

export function archivedItemKindLabel(kind?: ArchivedItemKind | null): string {
  if (kind === undefined || kind === null) return '—'
  return ARCHIVED_ITEM_KIND_LABELS[kind] ?? String(kind)
}

export enum ArchiveTrigger {
  /** An approval was withdrawn after being granted. */
  Revoked = 0,
  /** Soft delete by an authorized role; data retained. */
  Deleted = 1,
  /** Replaced by a newer revision. */
  Superseded = 2,
  /** Pulled out because of an audit finding. */
  AuditFinding = 3,
  /** Archived after an expiry was never amended. */
  Expired = 4,
}

export const ARCHIVE_TRIGGER_LABELS: Record<ArchiveTrigger, string> = {
  [ArchiveTrigger.Revoked]: 'Revoked',
  [ArchiveTrigger.Deleted]: 'Deleted',
  [ArchiveTrigger.Superseded]: 'Superseded',
  [ArchiveTrigger.AuditFinding]: 'Audit finding',
  [ArchiveTrigger.Expired]: 'Expired',
}

export function archiveTriggerLabel(trigger?: ArchiveTrigger | null): string {
  if (trigger === undefined || trigger === null) return '—'
  return ARCHIVE_TRIGGER_LABELS[trigger] ?? String(trigger)
}

export enum ArchiveEntryState {
  /** Currently sitting in the Archive sidebar section. */
  Archived = 0,
  /** Restored to the main capability list; the row is kept as history. */
  Restored = 1,
  /** A permanent deletion was REQUESTED. Nothing is deleted by this flag. */
  PurgeRequested = 2,
}

export const ARCHIVE_ENTRY_STATE_LABELS: Record<ArchiveEntryState, string> = {
  [ArchiveEntryState.Archived]: 'Archived',
  [ArchiveEntryState.Restored]: 'Restored',
  [ArchiveEntryState.PurgeRequested]: 'Purge requested',
}

export function archiveEntryStateLabel(state?: ArchiveEntryState | null): string {
  if (state === undefined || state === null) return '—'
  return ARCHIVE_ENTRY_STATE_LABELS[state] ?? String(state)
}

/** Mirror of SidebarSections - the new Archive section, ordered after FINAL SIGN-OFF (11). */
export const ARCHIVE_SIDEBAR_SECTION = {
  code: 'ARCHIVE',
  title: 'ARCHIVE',
  order: 12,
} as const

/** Mirror of ArchivePermissions ("area.action" convention). */
export const ARCHIVE_PERMISSIONS = {
  ArchiveRecord: 'archive.archive',
  ViewArchive: 'archive.view',
  EditArchived: 'archive.edit',
  RestoreArchived: 'archive.restore',
  RequestPurge: 'archive.request_purge',
} as const

export type ArchivePermission = (typeof ARCHIVE_PERMISSIONS)[keyof typeof ARCHIVE_PERMISSIONS]

/** Mirror of ArchiveEntry - one APPEND-ONLY archive event. */
export interface ArchiveEntryResponse {
  id: string
  itemKind: ArchivedItemKind
  itemId: string
  ataRecordId?: string | null

  itemTitle: string
  itemReference: string
  sectionCode: string
  formType: string
  ataChapterCode: string
  shopId?: string | null
  shopName: string

  statusBeforeArchive: ApprovalStatus
  statusBeforeArchiveLabel: string
  revisionNumberBeforeArchive: number
  wasApprovedBeforeArchive: boolean

  trigger: ArchiveTrigger
  archivedByUserId: number
  archivedByName: string
  archivedByRole: string
  archivedAt: string
  reason: string

  state: ArchiveEntryState

  editedWhileArchived: boolean
  lastEditedWhileArchivedAt?: string | null
  lastEditedWhileArchivedByUserId?: number | null
  lastEditedWhileArchivedByName: string
  editsWhileArchived: number

  restoredByUserId?: number | null
  restoredByName: string
  restoredByRole: string
  restoredAt?: string | null
  restoreReason: string
  statusAfterRestore?: ApprovalStatus | null
  revisionNumberAfterRestore?: number | null

  purgeRequestedByUserId?: number | null
  purgeRequestedAt?: string | null
  purgeRequestReason: string

  createdAt: string
  updatedAt: string

  /** Derived server-side: State == Archived. */
  isCurrentlyArchived: boolean
  /** Derived server-side: a restore is possible only from the Archived state. */
  isRestorable: boolean
  /** Derived server-side: State == Restored && restoredAt set. */
  isCompletedCycle: boolean
}

/** Mirror of ArchiveDecision. */
export interface ArchiveDecisionResponse {
  allowed: boolean
  denialCode?: string | null
  message: string
}

export interface ArchiveListQuery {
  /** 'archived' (default) | 'history' (all rows incl. restored) | 'purge-requested'. */
  scope?: 'archived' | 'history' | 'purge-requested' | null
  itemKind?: ArchivedItemKind | null
  shopId?: string | null
  search?: string | null
  page?: number | null
  pageSize?: number | null
}

export interface ArchiveItemRequest {
  itemKind: ArchivedItemKind
  itemId: string
  trigger: ArchiveTrigger
  /** Mandatory justification - the server refuses an archive without it. */
  reason: string
}

export interface EditArchivedRequest {
  /** camelCase FormDataJson patch applied while the item sits in the Archive. */
  formDataJson?: string | null
  reason?: string | null
}

export interface RestoreArchivedRequest {
  /** Mandatory: explains why a revoked capability was reinstated. */
  reason: string
}

export interface PurgeRequestPayload {
  reason: string
}

// =====================================================================================
// 11. AMENDED v14 - ENGINEER ROLE & SHOP TEAM ROUTING
//     Mirror of CMT.Domain/Models/SelfEvaluation/EngineerRoutingPolicy.cs
// =====================================================================================

/** Mirror of ShopRoutingTarget - one selected target shop, resolved before routing. */
export interface ShopRoutingTargetDto {
  shopId: string
  shopName: string
  /** Null when the shop currently has no active Shop Team Leader (warning, never dropped). */
  teamLeaderUserId?: number | null
  teamLeaderName: string
  isTeamLeaderActive: boolean
  /** True for the shop that owns the record (the Engineer's own shop). */
  isPrimary: boolean
}

/** Mirror of the HasActionableTeamLeader derived flag. */
export function hasActionableTeamLeader(target: Pick<ShopRoutingTargetDto, 'teamLeaderUserId' | 'isTeamLeaderActive'>): boolean {
  return !!target.teamLeaderUserId && target.teamLeaderUserId > 0 && target.isTeamLeaderActive
}

/** Mirror of ATARecordShopRouting - one per-shop routing row. */
export interface ATARecordShopRoutingResponse {
  id: string
  ataRecordId: string
  targetShopId: string
  targetShopName: string
  isPrimaryTarget: boolean
  resolvedTeamLeaderUserId?: number | null
  resolvedTeamLeaderName: string
  hasActiveTeamLeader: boolean
  status: ApprovalStatus
  statusLabel: string
  routedAt: string
  routedByUserId: number
  isComplete: boolean
  isActive: boolean
  acknowledgedAt?: string | null
  acknowledgedByUserId?: number | null
  completedAt?: string | null
  completedByUserId?: number | null
  notes: string
}

/** Mirror of EngineerRoutingDecision. */
export interface EngineerRoutingDecisionResponse {
  allowed: boolean
  denialCode?: string | null
  message: string
  /** Non-fatal problems, e.g. a target shop without an active STL. */
  warnings: string[]
}

export interface RouteATARecordRequest {
  /** Exactly one row per target shop; duplicates are refused server-side. */
  targets: Array<{ shopId: string; isPrimary?: boolean }>
  notes?: string | null
}

export interface CompleteRoutingRequest {
  notes?: string | null
}

/** Mirror of ShopProgress - "2 of 3 shops complete". */
export interface ShopProgressDto {
  completed: number
  total: number
  text: string
}

/** Permission string used by the routing policy (Permissions.RouteATARecord). */
export const ROUTE_ATA_RECORD_PERMISSION = 'ata_record.route'