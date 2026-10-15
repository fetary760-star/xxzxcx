/**
 * =====================================================================================
 * AMENDED v18 - PHASE 1 (FRONTEND), ITEM 2: THE TABLE-OF-CONTENTS VIEW MODEL
 * CMT.Frontend/src/lib/workflow/toc-view-model.ts                          (NEW FILE)
 * Copy to: CMT.Frontend/src/lib/workflow/toc-view-model.ts
 *
 * WHAT THIS FILE IS
 * -----------------
 * The PURE, RENDER-READY projection of the three folder endpoints:
 *
 *   GET /api/evaluation-folders/{folderId}/table-of-contents -> TableOfContentsResponse
 *   GET /api/evaluation-folders/{folderId}/progress          -> FolderProgressResponse
 *   GET /api/evaluation-folders/{folderId}                   -> FolderDetailResponse
 *
 * plus the "Prepared by / Reviewed by / Approved by / Dates" SIGNATURE BLOCK of any
 * WorkflowInstanceResponse (requirement #13 / #14).
 *
 * It contains NO JSX, NO hooks, NO fetch and NO mock data, therefore:
 *   - it is safe in a Server Component, in a Client Component and in a unit test;
 *   - it never becomes stale, because every value is derived from the response;
 *   - `SummaryTab`, `DocumentWorkspace`, `FormDocumentChrome` and
 *     `ApprovalWorkflowActions` stop re-deriving the same rules four different ways.
 *
 * WHY IT IS NEEDED (the three defects it removes)
 * ----------------------------------------------
 *  (1) SECTION ORDER AND COUNTERS. The server MAY send the sections in any order and, on a
 *      build that predates the v18 contract, sends neither `draftItems` nor
 *      `actionRequiredItems` (both are declared OPTIONAL in workflow-types.ts, section 7).
 *      A renderer that trusts the payload therefore prints the ToC out of order and shows
 *      "0 draft / 0 action required" while red rows are visible on screen. This file
 *      RE-SORTS into the exact `TOC_SECTIONS_ORDERED` order and RECOMPUTES all SIX
 *      lifecycle buckets from the items, so the header, the section counters and the rows
 *      can never disagree.
 *  (2) BUTTON GATING. `canIDraft` / `canIAct` are computed server side FOR THE CALLING USER
 *      and are the authority. But a cached row, an optimistic row inserted after a POST, or
 *      a row coming back from a build that predates the flags carries neither. Section 6
 *      resolves "server flag first, local pre-flight second" exactly like
 *      `workflow-permissions.ts` section 9 does for a step, so a control is never wrongly
 *      enabled AND never silently dead - and always carries the reason it is disabled.
 *  (3) THE SIGNATURE BLOCK WAS BUILT FROM THE SIGNATURE ROWS ONLY. `instance.signatures`
 *      only contains EXECUTED steps, so a form printed mid-chain lost its empty
 *      "Approved by" cell and the layout of the paper form changed between revisions -
 *      which requirement #13 explicitly forbids ("maintaining the existing form structures
 *      without modifying their layouts"). Section 7 builds ONE cell per step that declares
 *      a `signatureBlock`, in `SIGNATURE_BLOCK_ORDER`, and fills name / role / date from
 *      the executed step when the signature row has not been emitted yet.
 *
 * WHERE TO AMEND THE REST OF THE PROVIDED CODE  (Phase 1, frontend only)
 * ---------------------------------------------------------------------
 *   A. src/lib/workflow/workflow-types.ts            - ALREADY AMENDED by you (v18).
 *        Nothing to change. This file relies on the two OPTIONAL counters
 *        (`draftItems`, `actionRequiredItems`) being optional.
 *   B. src/components/self-evaluation/tabs/SummaryTab.tsx
 *        Replace the local ToC mapping with:
 *            const vm = buildToCViewModel({ toc, progress, actor, catalog })
 *        then render `vm.sections` -> `section.items` -> `item.primaryAction`.
 *        Delete every local status->label / status->colour switch: use
 *        `item.stateLabel` + `item.stateClasses`.
 *   C. src/components/self-evaluation/tabs/RequestApprovalsTab.tsx
 *        Feed the folder panel from `vm.progress` (remainingMandatoryItems / reportLabel /
 *        signOff) instead of recounting pending rows.
 *   D. src/components/self-evaluation/DocumentWorkspace.tsx
 *        Use `buildStepTimeline(instance)` for the step list and
 *        `buildSignatureBlock(instance)` for the footer block.
 *   E. src/components/self-evaluation/forms/FormDocumentChrome.tsx
 *      src/components/self-evaluation/forms/AuthorizationCertificateBlock.tsx
 *        These two own the PRINTED layout. Keep the markup byte-for-byte and only bind:
 *            cell.caption        -> the existing caption cell
 *            cell.personName     -> the existing name cell
 *            cell.personRoleLabel-> the existing designation cell
 *            cell.signedDate     -> the existing date cell
 *            cell.userId         -> useSignatureImage(cell.userId, cell.isSigned)
 *                                   from src/lib/workflow/signature-render.ts
 *        Never print `cell.userId`, never print a storage path.
 *   F. src/components/self-evaluation/ApprovalWorkflowActions.tsx
 *        Keep using `stepActionState()` of workflow-permissions.ts for the ACTION BAR of an
 *        OPEN form; use `item.primaryAction` only for the ToC row buttons.
 *   G. src/lib/workflow/useWorkflow.ts
 *        After every successful action, re-fetch `getTableOfContents` + `getFolderProgress`
 *        and rebuild with `buildToCViewModel`. Do NOT patch counters by hand.
 *
 * BINDING RULES (identical to WorkflowApiContracts.cs - do not break them)
 *   (1) every USER id is a NUMBER (C# long); every ENTITY id is a STRING (C# Guid).
 *   (2) the SERVER label wins whenever it is present (`statusLabel`, `lifecycleStateLabel`,
 *       `stateLabel`, `kindLabel`); the local maps of workflow-types.ts are the OFFLINE
 *       fallback only.
 *   (3) approval stamps are frozen in UTC server side and are printed in UTC. A local
 *       timezone would make two approvers of the same form appear to have signed on
 *       different days.
 * =====================================================================================
 */

import {
  ApprovalStatus,
  FormLifecycleState,
  SIGNATURE_BLOCK_ORDER,
  SignatureBlockType,
  TOC_SECTIONS_ORDERED,
  WorkflowStepKind,
  WorkflowStepState,
  approvalStatusLabel,
  autoGeneratedSourceOf,
  countsAsComplete,
  formNumberOf,
  isAutoGeneratedFormType,
  isAwaitingDelegatedReview,
  lifecycleStateClasses,
  lifecycleStateLabel,
  lifecycleStateOf,
  signatureCaption,
  skipModeLabel,
  stepKindActionLabel,
  stepKindLabel,
  stepStateClasses,
  stepStateLabel,
  tocSectionOrder,
  tocSectionTitle,
  type CatalogFormResponse,
  type FolderDetailResponse,
  type FolderProgressResponse,
  type FolderSummaryResponse,
  type FormSignatureResponse,
  type TableOfContentsItemResponse,
  type TableOfContentsResponse,
  type WorkflowInstanceResponse,
  type WorkflowStepResponse,
} from '@/lib/workflow/workflow-types'

import { ORG_ROLES, PERMISSIONS, normalizeRole, roleLabel, roleLabelWithCode } from '@/lib/role-hierarchy'

import {
  isExternalSourceFormType,
  standardStatusKeyOfStatus,
} from '@/lib/workflow/status-badge'

import {
  WORKFLOW_DECISION_CODES,
  actorHas,
  canDraft,
  catalogStepFacts,
  decisionCodeMessage,
  findCatalogForm,
  isAdmin,
  permissionForStep,
  roleCanActOnStep,
  type ResolvedCapability,
  type WorkflowActor,
} from '@/lib/workflow/workflow-permissions'

// =====================================================================================
// 1. DATE HELPERS
//    Declared LOCALLY on purpose. `signature-render.ts` is a 'use client' module (it owns
//    the React hook that streams the specimen bytes), so importing its formatters here
//    would force this whole projection - and therefore SummaryTab - to become client-only.
//    The names differ from the ones in signature-render.ts so that a component may import
//    both modules without a collision.
// =====================================================================================

/** Appends the missing UTC marker the API omits on some DateTime columns. */
function asUtcIso(value?: string | null): string {
  if (!value) return ''
  const raw = String(value).trim()
  if (!raw) return ''
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : `${raw}Z`
}

/** "2026-08-27" - the printed date cell of every signature and expiry column. */
export function formatIsoDate(value?: string | null): string {
  const normalized = asUtcIso(value)
  if (!normalized) return ''
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return String(value ?? '')
  return date.toISOString().slice(0, 10)
}

/** "2026-08-27 09:14 UTC" - tooltips and the audit trail. */
export function formatIsoTimestamp(value?: string | null): string {
  const normalized = asUtcIso(value)
  if (!normalized) return ''
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return String(value ?? '')
  const iso = date.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

/** Whole days from `now` to `value`. Negative = already in the past. */
export function daysUntil(value?: string | null, now: Date = new Date()): number | null {
  const normalized = asUtcIso(value)
  if (!normalized) return null
  const target = new Date(normalized)
  if (Number.isNaN(target.getTime())) return null
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.ceil((target.getTime() - now.getTime()) / msPerDay)
}

function percentOf(part: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  const value = Math.round((part / total) * 100)
  return Math.min(100, Math.max(0, value))
}

function firstNonEmpty(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (value && String(value).trim() !== '') return String(value).trim()
  }
  return ''
}

// =====================================================================================
// 2. THE SIX LIFECYCLE COUNTERS
//    Recomputed from the items, so the header, the section chips and the visible rows can
//    never disagree - and so a server build without `draftItems` / `actionRequiredItems`
//    still renders a correct ToC.
// =====================================================================================

export interface ToCCounters {
  total: number
  draft: number
  pending: number
  approved: number
  skipped: number
  expired: number
  actionRequired: number
  /** approved + skipped - mirror of ApprovalStatusInfo.CountsAsComplete. */
  complete: number
  /** Mandatory items that do NOT count as complete: these block the final sign-off. */
  remainingMandatory: number
  completionPercent: number
}

function emptyCounters(): ToCCounters {
  return {
    total: 0,
    draft: 0,
    pending: 0,
    approved: 0,
    skipped: 0,
    expired: 0,
    actionRequired: 0,
    complete: 0,
    remainingMandatory: 0,
    completionPercent: 0,
  }
}

function accumulate(counters: ToCCounters, item: ToCItemViewModel): void {
  counters.total += 1

  switch (item.lifecycleState) {
    case FormLifecycleState.Draft:
      counters.draft += 1
      break
    case FormLifecycleState.Pending:
      counters.pending += 1
      break
    case FormLifecycleState.Approved:
      counters.approved += 1
      break
    case FormLifecycleState.Skipped:
      counters.skipped += 1
      break
    case FormLifecycleState.Expired:
      counters.expired += 1
      break
    case FormLifecycleState.ActionRequired:
      counters.actionRequired += 1
      break
    default:
      counters.pending += 1
      break
  }

  if (item.countsAsComplete) counters.complete += 1
  if (item.isBlockingCompletion) counters.remainingMandatory += 1
}

function sealCounters(counters: ToCCounters): ToCCounters {
  counters.completionPercent = percentOf(counters.complete, counters.total)
  return counters
}

/** Chip list a section header renders. Empty buckets are dropped to keep the header calm. */
export interface ToCCounterChip {
  state: FormLifecycleState
  label: string
  count: number
  classes: string
}

export function counterChips(counters: ToCCounters): ToCCounterChip[] {
  const order: Array<{ state: FormLifecycleState; count: number }> = [
    { state: FormLifecycleState.ActionRequired, count: counters.actionRequired },
    { state: FormLifecycleState.Expired, count: counters.expired },
    { state: FormLifecycleState.Pending, count: counters.pending },
    { state: FormLifecycleState.Draft, count: counters.draft },
    { state: FormLifecycleState.Approved, count: counters.approved },
    { state: FormLifecycleState.Skipped, count: counters.skipped },
  ]

  return order
    .filter(entry => entry.count > 0)
    .map(entry => ({
      state: entry.state,
      label: lifecycleStateLabel(entry.state),
      count: entry.count,
      classes: lifecycleStateClasses(entry.state),
    }))
}

// =====================================================================================
// 3. ROW / SECTION / FOLDER SHAPES
// =====================================================================================

export type ToCActionKind = 'draft' | 'act' | 'open' | 'none'

/** The single primary button of a Table of Contents row. */
export interface ToCPrimaryAction {
  kind: ToCActionKind
  label: string
  enabled: boolean
  /** Rendered as a `title` on the disabled button; never as an error toast. */
  disabledReason: string
  /** WORKFLOW_DECISION_CODES value, so the UI can branch on a stable vocabulary. */
  code: string
}

export interface ToCItemViewModel {
  // ----- identity -----
  id: string
  sectionCode: string
  sectionTitle: string
  sectionOrder: number
  itemOrder: number

  formType: string
  formNo: string
  formTitle: string
  /** "MNT-1420A · Service Bulletin (SB / SL / SIL)" - the single printed row caption. */
  displayTitle: string

  instanceId: string | null
  submissionId: string | null
  hasInstance: boolean

  // ----- AMENDED v14 - auto-generated / delegated-review facts -----
  /** True when the form's data is auto-generated: no approval process, closes on submit. */
  isAutoGenerated: boolean
  /** Name of the external source system, rendered next to the "Auto-generated" badge. */
  autoGeneratedSource: string
  /** True while the row sits inside the delegated-review excursion of its current step. */
  isAwaitingDelegatedReview: boolean

  // ----- live state -----
  status: ApprovalStatus
  statusLabel: string
  lifecycleState: FormLifecycleState
  stateLabel: string
  stateClasses: string
  countsAsComplete: boolean
  isBlockingCompletion: boolean

  // ----- mandatory / optional flags -----
  isMandatory: boolean
  isOptionalByRegulatoryDate: boolean
  maySkipNow: boolean
  /** "Mandatory" | "Optional / May Skip Now" | "Optional (regulatory date reached)". */
  mandatoryLabel: string

  // ----- step progress -----
  totalSteps: number
  completedSteps: number
  stepProgressPercent: number
  /** "3 / 7 steps". */
  stepProgressLabel: string

  currentStepTitle: string
  currentAssigneeUserId: number | null
  currentAssigneeName: string
  /** "Pending Manager approval — Nour Adel" or "Awaiting assignment". */
  currentStepLabel: string

  // ----- expiry -----
  expiresAtIso: string | null
  expiresAt: string
  isExpired: boolean
  daysToExpiry: number | null
  /** "Expired 12 days ago" / "Expires in 21 days" / "". */
  expiryLabel: string

  remarks: string

  // ----- gating -----
  canDraft: ResolvedCapability
  canAct: ResolvedCapability
  primaryAction: ToCPrimaryAction

  /** The untouched server row, for a component that needs a field not projected here. */
  raw: TableOfContentsItemResponse
}

export interface ToCSectionViewModel {
  code: string
  title: string
  order: number
  counters: ToCCounters
  chips: ToCCounterChip[]
  items: ToCItemViewModel[]
  isComplete: boolean
  hasActionRequired: boolean
  hasExpired: boolean
  /** True when the section is present in ToCSections but the folder has no rows for it. */
  isEmpty: boolean
}

export interface ToCViewModel {
  folderId: string
  folderCode: string
  title: string
  ataChapterCode: string
  partNumber: string
  revisionNumber: number
  revisionLabel: string

  status: ApprovalStatus
  statusLabel: string
  lifecycleState: FormLifecycleState
  stateLabel: string
  stateClasses: string

  /** Recomputed from the rows - this is what the header progress bar must render. */
  completionPercent: number
  /** `TableOfContentsResponse.completionPercent`, kept for reference / diagnostics. */
  serverCompletionPercent: number

  counters: ToCCounters
  chips: ToCCounterChip[]
  sections: ToCSectionViewModel[]

  allItems: ToCItemViewModel[]
  /** Mandatory rows that still block the final sign-off, in ToC order. */
  remainingMandatoryItems: ToCItemViewModel[]
  /** Rows whose pending step belongs to the calling user ("Pending my action"). */
  actionableItems: ToCItemViewModel[]
  /** Rows the calling user may still start. */
  draftableItems: ToCItemViewModel[]
  /** Rejected / Returned / Expired rows owned by the originator. */
  attentionItems: ToCItemViewModel[]

  isComplete: boolean
}

// =====================================================================================
// 4. ROW PROJECTION
// =====================================================================================

function resolveLifecycleState(row: TableOfContentsItemResponse): FormLifecycleState {
  if (row.isExpired === true) return FormLifecycleState.Expired
  if (typeof row.lifecycleState === 'number') return row.lifecycleState
  return lifecycleStateOf(row.status)
}

function mandatoryLabelOf(row: TableOfContentsItemResponse): string {
  if (row.maySkipNow === true) return 'Optional / May Skip Now'
  if (row.isOptionalByRegulatoryDate === true) return 'Optional (regulatory date reached)'
  return row.isMandatory === true ? 'Mandatory' : 'Optional'
}

function currentStepLabelOf(
  row: TableOfContentsItemResponse,
  state: FormLifecycleState,
  statusLabel: string,
): string {
  if (state === FormLifecycleState.Approved || state === FormLifecycleState.Skipped) {
    return statusLabel
  }

  // AMENDED v14 - inside the delegated-review excursion the label must say WHO reviews,
  // not pretend the approver still holds the step.
  if (isAwaitingDelegatedReview(row.status)) {
    const reviewer = firstNonEmpty(row.currentAssigneeName)
    const base = firstNonEmpty(row.currentStepTitle, 'Delegated review in progress')
    return reviewer
      ? `${base} — delegated review by ${reviewer}`
      : `${base} — awaiting reviewer confirmation`
  }

  const step = firstNonEmpty(row.currentStepTitle, statusLabel)
  const assignee = firstNonEmpty(row.currentAssigneeName)

  if (step && assignee) return `${step} — ${assignee}`
  if (step) {
    return row.formWorkflowInstanceId && !assignee ? `${step} — awaiting assignment` : step
  }
  return assignee || ''
}

function expiryLabelOf(days: number | null, isExpired: boolean, expiresAt: string): string {
  if (!expiresAt) return ''
  if (isExpired) {
    if (days === null) return 'Expired'
    const overdue = Math.abs(days)
    return overdue === 0 ? 'Expires today' : `Expired ${overdue} day${overdue === 1 ? '' : 's'} ago`
  }
  if (days === null) return `Valid until ${expiresAt}`
  if (days === 0) return 'Expires today'
  return `Expires in ${days} day${days === 1 ? '' : 's'}`
}

function serverAllowed(flag: boolean | undefined | null): ResolvedCapability | null {
  if (flag === true) {
    return { allowed: true, source: 'server', code: WORKFLOW_DECISION_CODES.Allowed, reason: '' }
  }
  return null
}

function localDenied(code: string, reason?: string): ResolvedCapability {
  return { allowed: false, source: 'local', code, reason: reason || decisionCodeMessage(code) }
}

function localAllowed(): ResolvedCapability {
  return { allowed: true, source: 'local', code: WORKFLOW_DECISION_CODES.Allowed, reason: '' }
}

/**
 * "May I START this form?" - server flag first, then the same rule the server applies
 * (`canDraft` of workflow-permissions.ts: draft role + `form.create` permission).
 */
export function resolveRowCanDraft(
  row: TableOfContentsItemResponse,
  actor?: WorkflowActor | null,
  catalog?: CatalogFormResponse[] | null,
): ResolvedCapability {
  const server = serverAllowed(row.canIDraft)
  if (server) return server

  // Already started: there is nothing left to draft.
  if (row.formWorkflowInstanceId) {
    return localDenied(WORKFLOW_DECISION_CODES.AlreadyCompleted, 'The form has already been started.')
  }

  if (!actor) {
    return localDenied(
      WORKFLOW_DECISION_CODES.PermissionDenied,
      'Your permissions have not been loaded yet.',
    )
  }

  const form = findCatalogForm(catalog, row.formType)
  if (!form) {
    return localDenied(WORKFLOW_DECISION_CODES.FormNotCatalogued)
  }

  const decision = canDraft(actor, form)
  return decision.allowed ? localAllowed() : localDenied(decision.code, decision.reason)
}

/**
 * "Is the pending step MINE?" - server flag first. The local fallback rebuilds the step
 * facts from the catalog, matches the step whose `pendingStatus` equals the row status and
 * then applies the SAME role + permission gate as `canActOnStep`. Scope (own shop /
 * functional unit / designated person) cannot be evaluated from a ToC row, so a local
 * allow is deliberately treated as "probably yours" and the server still has the final
 * word when the action is posted.
 */
export function resolveRowCanAct(
  row: TableOfContentsItemResponse,
  actor?: WorkflowActor | null,
  catalog?: CatalogFormResponse[] | null,
): ResolvedCapability {
  const server = serverAllowed(row.canIAct)
  if (server) return server

  if (!row.formWorkflowInstanceId) {
    return localDenied(
      WORKFLOW_DECISION_CODES.StepNotActive,
      'The form has not been started yet.',
    )
  }

  const state = resolveLifecycleState(row)
  if (state === FormLifecycleState.Approved || state === FormLifecycleState.Skipped) {
    return localDenied(WORKFLOW_DECISION_CODES.AlreadyCompleted)
  }

  if (!actor) {
    return localDenied(
      WORKFLOW_DECISION_CODES.PermissionDenied,
      'Your permissions have not been loaded yet.',
    )
  }

  if (isAdmin(actor)) return localAllowed()

  // AMENDED v14 - inside the delegated-review excursion no step declares
  // PendingDelegatedReview as its pendingStatus, so the pendingStatus lookup below would
  // never match. The reviewer pool of the excursion is the DelegatedReviewRoles of the
  // step under review; a ToC row does not carry the stepNo, so the local fallback accepts
  // any declared-pool member holding the confirm permission and lets the server - which
  // knows the exact step - keep the final word when the action is posted.
  if (isAwaitingDelegatedReview(row.status)) {
    const pools = catalogStepFacts(catalog, row.formType)
      .map(step => step.delegatedReviewRoles)
      .filter(pool => pool.length > 0)

    if (pools.length === 0) {
      return localDenied(
        WORKFLOW_DECISION_CODES.DelegatedReviewNotAllowed,
        'This form does not declare a delegated-review pool.',
      )
    }

    const canonical = normalizeRole(actor.role)
    const inPool =
      canonical === ORG_ROLES.Admin ||
      (canonical !== null && pools.some(pool => pool.includes(canonical)))
    if (!inPool) {
      return localDenied(
        WORKFLOW_DECISION_CODES.NotDelegatedReviewer,
        `${roleLabel(actor.role)} is not the delegated reviewer of this step.`,
      )
    }

    if (!actorHas(actor, PERMISSIONS.ConfirmDelegatedReview)) {
      return localDenied(
        WORKFLOW_DECISION_CODES.PermissionDenied,
        `The '${PERMISSIONS.ConfirmDelegatedReview}' permission is missing.`,
      )
    }

    return localAllowed()
  }

  const steps = catalogStepFacts(catalog, row.formType)
  const step = steps.find(s => s.pendingStatus === row.status)
  if (!step) {
    return localDenied(
      WORKFLOW_DECISION_CODES.StepNotActive,
      'The pending step could not be resolved from the catalog.',
    )
  }

  if (!roleCanActOnStep(actor.role, step)) {
    return localDenied(
      WORKFLOW_DECISION_CODES.RoleNotEligible,
      `${roleLabel(actor.role)} is not eligible for "${step.title}".`,
    )
  }

  const permission = permissionForStep(step)
  if (!actorHas(actor, permission)) {
    return localDenied(
      WORKFLOW_DECISION_CODES.PermissionDenied,
      `The '${permission}' permission is missing.`,
    )
  }

  // A step that still needs a human assignee is not actionable yet.
  if (step.requiresManualAssignment && !row.currentAssigneeUserId) {
    return localDenied(
      WORKFLOW_DECISION_CODES.AssignmentRequired,
      'The step has not been assigned yet.',
    )
  }

  if (
    row.currentAssigneeUserId !== null &&
    row.currentAssigneeUserId !== undefined &&
    row.currentAssigneeUserId !== actor.userId
  ) {
    return localDenied(WORKFLOW_DECISION_CODES.NotAssignee)
  }

  return localAllowed()
}

function primaryActionOf(
  row: TableOfContentsItemResponse,
  state: FormLifecycleState,
  canDraftIt: ResolvedCapability,
  canActOnIt: ResolvedCapability,
  actionVerb: string,
): ToCPrimaryAction {
  if (row.formWorkflowInstanceId) {
    if (canActOnIt.allowed) {
      return {
        kind: 'act',
        label: actionVerb,
        enabled: true,
        disabledReason: '',
        code: WORKFLOW_DECISION_CODES.Allowed,
      }
    }
    return {
      kind: 'open',
      label: state === FormLifecycleState.Approved ? 'View' : 'Open',
      enabled: true,
      disabledReason: '',
      code: WORKFLOW_DECISION_CODES.Allowed,
    }
  }

  if (canDraftIt.allowed) {
    return {
      kind: 'draft',
      label: 'Start draft',
      enabled: true,
      disabledReason: '',
      code: WORKFLOW_DECISION_CODES.Allowed,
    }
  }

  return {
    kind: 'none',
    label: 'Start draft',
    enabled: false,
    disabledReason: canDraftIt.reason,
    code: canDraftIt.code,
  }
}

/** Projects ONE Table of Contents row. */
export function buildToCItem(
  row: TableOfContentsItemResponse,
  options: {
    actor?: WorkflowActor | null
    catalog?: CatalogFormResponse[] | null
    now?: Date
  } = {},
): ToCItemViewModel {
  const now = options.now ?? new Date()

  const state = resolveLifecycleState(row)
  const statusLabel = firstNonEmpty(row.statusLabel, approvalStatusLabel(row.status))
  const stateLabel = firstNonEmpty(row.lifecycleStateLabel, lifecycleStateLabel(state))

  const formNo = firstNonEmpty(row.formNo, formNumberOf(row.formType))
  const formTitle = firstNonEmpty(row.formTitle, row.formType)

  const isComplete = state === FormLifecycleState.Approved || state === FormLifecycleState.Skipped
  const countsComplete = isComplete || countsAsComplete(row.status)

  const totalSteps = Math.max(0, row.totalSteps ?? 0)
  const completedSteps = Math.min(Math.max(0, row.completedSteps ?? 0), totalSteps || Number.MAX_SAFE_INTEGER)

  const expiresAtIso = row.expiresAt ?? null
  const expiresAt = formatIsoDate(expiresAtIso)
  const days = daysUntil(expiresAtIso, now)
  const isExpired = row.isExpired === true || state === FormLifecycleState.Expired

  const canDraftIt = resolveRowCanDraft(row, options.actor, options.catalog)
  const canActOnIt = resolveRowCanAct(row, options.actor, options.catalog)

  const catalogSteps = catalogStepFacts(options.catalog, row.formType)
  const pendingStep = catalogSteps.find(s => s.pendingStatus === row.status)
  const actionVerb = isAwaitingDelegatedReview(row.status)
    ? 'Confirm review'
    : pendingStep
      ? stepKindActionLabel(pendingStep.kind)
      : 'Act'

  const sectionCode = row.sectionCode ?? ''

  return {
    id: row.id,
    sectionCode,
    sectionTitle: firstNonEmpty(row.sectionTitle, tocSectionTitle(sectionCode)),
    sectionOrder: Number.isFinite(row.sectionOrder) && row.sectionOrder > 0
      ? row.sectionOrder
      : tocSectionOrder(sectionCode),
    itemOrder: row.itemOrder ?? 0,

    formType: row.formType,
    formNo,
    formTitle,
    displayTitle: formNo ? `${formNo} · ${formTitle}` : formTitle,

    instanceId: row.formWorkflowInstanceId ?? null,
    submissionId: row.formSubmissionId ?? null,
    hasInstance: Boolean(row.formWorkflowInstanceId),

    isAutoGenerated: isAutoGeneratedFormType(row.formType),
    autoGeneratedSource: autoGeneratedSourceOf(row.formType),
    isAwaitingDelegatedReview: isAwaitingDelegatedReview(row.status),

    status: row.status,
    statusLabel,
    lifecycleState: state,
    stateLabel,
    stateClasses: lifecycleStateClasses(state),
    countsAsComplete: countsComplete,
    isBlockingCompletion: row.isMandatory === true && !countsComplete,

    isMandatory: row.isMandatory === true,
    isOptionalByRegulatoryDate: row.isOptionalByRegulatoryDate === true,
    maySkipNow: row.maySkipNow === true,
    mandatoryLabel: mandatoryLabelOf(row),

    totalSteps,
    completedSteps,
    stepProgressPercent: percentOf(completedSteps, totalSteps),
    stepProgressLabel: totalSteps > 0 ? `${completedSteps} / ${totalSteps} steps` : '',

    currentStepTitle: row.currentStepTitle ?? '',
    currentAssigneeUserId: row.currentAssigneeUserId ?? null,
    currentAssigneeName: row.currentAssigneeName ?? '',
    currentStepLabel: currentStepLabelOf(row, state, statusLabel),

    expiresAtIso,
    expiresAt,
    isExpired,
    daysToExpiry: days,
    expiryLabel: expiryLabelOf(days, isExpired, expiresAt),

    remarks: row.remarks ?? '',

    canDraft: canDraftIt,
    canAct: canActOnIt,
    primaryAction: primaryActionOf(row, state, canDraftIt, canActOnIt, actionVerb),

    raw: row,
  }
}

// =====================================================================================
// 5. SECTION + FOLDER PROJECTION
//    Sections are emitted in the EXACT ToCSections order. A section the server did not
//    send is still emitted (empty) so the printed Table of Contents keeps its 11 headings,
//    and a section code the client does not know is appended instead of being dropped.
// =====================================================================================

function sortItems(items: ToCItemViewModel[]): ToCItemViewModel[] {
  return [...items].sort((a, b) => {
    if (a.itemOrder !== b.itemOrder) return a.itemOrder - b.itemOrder
    if (a.formNo !== b.formNo) return a.formNo.localeCompare(b.formNo)
    return a.formTitle.localeCompare(b.formTitle)
  })
}

function buildSection(
  code: string,
  title: string,
  order: number,
  items: ToCItemViewModel[],
): ToCSectionViewModel {
  const sorted = sortItems(items)
  const counters = emptyCounters()
  for (const item of sorted) accumulate(counters, item)
  sealCounters(counters)

  return {
    code,
    title,
    order,
    counters,
    chips: counterChips(counters),
    items: sorted,
    isComplete: counters.total > 0 && counters.complete === counters.total,
    hasActionRequired: counters.actionRequired > 0,
    hasExpired: counters.expired > 0,
    isEmpty: counters.total === 0,
  }
}

export interface BuildToCArgs {
  toc: TableOfContentsResponse
  /** GET .../progress. Optional: the ToC alone is enough to render the rows. */
  progress?: FolderProgressResponse | null
  /** GET /api/workflow/permissions/me, mapped with `actorFromMyPermissions`. */
  actor?: WorkflowActor | null
  /** GET /api/workflow/catalog - only needed for the LOCAL gating fallback. */
  catalog?: CatalogFormResponse[] | null
  now?: Date
  /**
   * Emit the 11 ToCSections headings even when the folder carries no row for them.
   * Defaults to TRUE, because the printed document must keep its fixed structure.
   */
  includeEmptySections?: boolean
}

/** THE ENTRY POINT of item 2: one call, one fully render-ready Table of Contents. */
export function buildToCViewModel(args: BuildToCArgs): ToCViewModel {
  const { toc } = args
  const now = args.now ?? new Date()
  const includeEmpty = args.includeEmptySections !== false

  // ---- 1. flatten every row of every section, whatever order they arrived in ----------
  const itemsByCode = new Map<string, ToCItemViewModel[]>()
  const allItems: ToCItemViewModel[] = []

  for (const section of toc.sections ?? []) {
    for (const row of section.items ?? []) {
      const item = buildToCItem(
        {
          ...row,
          sectionCode: firstNonEmpty(row.sectionCode, section.code),
          sectionTitle: firstNonEmpty(row.sectionTitle, section.title),
          sectionOrder:
            Number.isFinite(row.sectionOrder) && row.sectionOrder > 0
              ? row.sectionOrder
              : section.order,
        },
        { actor: args.actor, catalog: args.catalog, now },
      )

      const key = (item.sectionCode || section.code || '').trim().toLowerCase()
      const bucket = itemsByCode.get(key)
      if (bucket) bucket.push(item)
      else itemsByCode.set(key, [item])

      allItems.push(item)
    }
  }

  // ---- 2. emit the canonical sections in the canonical order --------------------------
  const sections: ToCSectionViewModel[] = []
  const consumed = new Set<string>()

  for (const definition of TOC_SECTIONS_ORDERED) {
    const key = definition.code.trim().toLowerCase()
    const items = itemsByCode.get(key) ?? []
    consumed.add(key)
    if (items.length === 0 && !includeEmpty) continue
    sections.push(buildSection(definition.code, definition.title, definition.order, items))
  }

  // ---- 3. append any section code this client build does not know about ---------------
  const unknown = (toc.sections ?? [])
    .filter(section => !consumed.has((section.code ?? '').trim().toLowerCase()))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  for (const section of unknown) {
    const key = (section.code ?? '').trim().toLowerCase()
    if (!key || consumed.has(key)) continue
    consumed.add(key)
    sections.push(
      buildSection(
        section.code,
        firstNonEmpty(section.title, tocSectionTitle(section.code), section.code),
        section.order ?? TOC_SECTIONS_ORDERED.length + sections.length + 1,
        itemsByCode.get(key) ?? [],
      ),
    )
  }

  // ---- 4. roll the folder counters up from the rows -----------------------------------
  const counters = emptyCounters()
  for (const item of allItems) accumulate(counters, item)
  sealCounters(counters)

  const orderedItems = sections.flatMap(section => section.items)
  const state = lifecycleStateOf(toc.status)

  return {
    folderId: toc.folderId,
    folderCode: toc.folderCode ?? '',
    title: toc.title ?? '',
    ataChapterCode: toc.ataChapterCode ?? '',
    partNumber: toc.partNumber ?? '',
    revisionNumber: Math.max(1, toc.revisionNumber ?? 1),
    revisionLabel: `Revision v${Math.max(1, toc.revisionNumber ?? 1)}`,

    status: toc.status,
    statusLabel: firstNonEmpty(toc.statusLabel, approvalStatusLabel(toc.status)),
    lifecycleState: state,
    stateLabel: lifecycleStateLabel(state),
    stateClasses: lifecycleStateClasses(state),

    completionPercent: counters.completionPercent,
    serverCompletionPercent: toc.completionPercent ?? 0,

    counters,
    chips: counterChips(counters),
    sections,

    allItems: orderedItems,
    remainingMandatoryItems: orderedItems.filter(item => item.isBlockingCompletion),
    actionableItems: orderedItems.filter(item => item.canAct.allowed),
    draftableItems: orderedItems.filter(item => !item.hasInstance && item.canDraft.allowed),
    attentionItems: orderedItems.filter(
      item =>
        item.lifecycleState === FormLifecycleState.ActionRequired ||
        item.lifecycleState === FormLifecycleState.Expired,
    ),

    isComplete:
      args.progress?.isComplete === true ||
      (counters.total > 0 && counters.remainingMandatory === 0),
  }
}

export function findSection(vm: ToCViewModel, code?: string | null): ToCSectionViewModel | null {
  if (!code) return null
  const needle = code.trim().toLowerCase()
  return vm.sections.find(section => section.code.trim().toLowerCase() === needle) ?? null
}

export function findItemByFormType(
  vm: ToCViewModel,
  formType?: string | null,
): ToCItemViewModel | null {
  if (!formType) return null
  const needle = formType.trim().toLowerCase()
  return vm.allItems.find(item => item.formType.trim().toLowerCase() === needle) ?? null
}

export function findItemByInstanceId(
  vm: ToCViewModel,
  instanceId?: string | null,
): ToCItemViewModel | null {
  if (!instanceId) return null
  return vm.allItems.find(item => item.instanceId === instanceId) ?? null
}

// =====================================================================================
// 6. THE FOLDER PROGRESS PANEL  (requirements #11 and #14)
// =====================================================================================

export interface FolderSignOffViewModel {
  instanceId: string
  status: ApprovalStatus
  statusLabel: string
  currentStepNo: number
  currentStepTitle: string
  currentAssigneeUserId: number | null
  currentAssigneeName: string
  totalSteps: number
  completedSteps: number
  progressPercent: number
  isComplete: boolean
  isLocked: boolean
  /** True when the calling user owns the pending sign-off step (server flag). */
  canIActNow: boolean
  steps: WorkflowStepViewModel[]
  signatures: SignatureCellViewModel[]
}

export interface FolderProgressViewModel {
  folderId: string
  counters: ToCCounters
  completionPercent: number
  isComplete: boolean
  isLocked: boolean

  remainingMandatoryItems: ToCItemViewModel[]
  remainingCount: number
  /** "4 mandatory forms are still open" / "All mandatory forms are closed". */
  remainingLabel: string

  reportAvailable: boolean
  reportGeneratedAtIso: string | null
  reportGeneratedAt: string
  /** "Report generated 2026-08-27" / "The report is generated on final sign-off". */
  reportLabel: string

  /** True when the folder may be signed off right now (nothing mandatory is open). */
  canRequestSignOff: boolean
  signOff: FolderSignOffViewModel | null
}

export function buildFolderProgress(args: {
  toc: ToCViewModel
  progress?: FolderProgressResponse | null
  signOff?: WorkflowInstanceResponse | null
}): FolderProgressViewModel {
  const { toc, progress } = args

  // The server payload is preferred for the report facts (only the server knows whether the
  // PDF file exists); the COUNTERS stay local so the panel can never contradict the rows.
  const counters = toc.counters
  const remaining = toc.remainingMandatoryItems
  const isComplete = progress?.isComplete === true || toc.isComplete
  const isLocked = progress?.isLocked === true || toc.status === ApprovalStatus.Locked

  const reportGeneratedAtIso = progress?.reportGeneratedAt ?? null
  const reportGeneratedAt = formatIsoDate(reportGeneratedAtIso)
  const reportAvailable = progress?.reportAvailable === true

  return {
    folderId: toc.folderId,
    counters,
    completionPercent: counters.completionPercent,
    isComplete,
    isLocked,

    remainingMandatoryItems: remaining,
    remainingCount: remaining.length,
    remainingLabel:
      remaining.length === 0
        ? 'All mandatory forms are closed.'
        : `${remaining.length} mandatory form${remaining.length === 1 ? ' is' : 's are'} still open.`,

    reportAvailable,
    reportGeneratedAtIso,
    reportGeneratedAt,
    reportLabel: reportAvailable
      ? reportGeneratedAt
        ? `Report generated ${reportGeneratedAt}`
        : 'Report available'
      : 'The report is generated once the folder is signed off.',

    canRequestSignOff: remaining.length === 0 && !isLocked,
    signOff: args.signOff ? buildFolderSignOff(args.signOff) : null,
  }
}

export function buildFolderSignOff(instance: WorkflowInstanceResponse): FolderSignOffViewModel {
  const steps = buildStepTimeline(instance)
  const current = steps.find(step => step.isCurrent) ?? null

  return {
    instanceId: instance.id,
    status: instance.status,
    statusLabel: firstNonEmpty(instance.statusLabel, approvalStatusLabel(instance.status)),
    currentStepNo: instance.currentStepNo,
    currentStepTitle: current?.title ?? '',
    currentAssigneeUserId: instance.currentAssigneeUserId ?? null,
    currentAssigneeName: instance.currentAssigneeName ?? '',
    totalSteps: instance.totalSteps ?? steps.length,
    completedSteps: instance.completedSteps ?? steps.filter(s => s.isDone).length,
    progressPercent:
      Number.isFinite(instance.progressPercent) && instance.progressPercent > 0
        ? instance.progressPercent
        : percentOf(steps.filter(s => s.isDone).length, steps.length),
    isComplete: instance.isComplete === true,
    isLocked: instance.isLocked === true,
    canIActNow: current?.canAct === true,
    steps,
    signatures: buildSignatureBlock(instance),
  }
}

/** One call for a whole folder page: GET /api/evaluation-folders/{folderId}. */
export interface FolderViewModel {
  folder: FolderSummaryResponse
  toc: ToCViewModel
  progress: FolderProgressViewModel
}

export function buildFolderViewModel(
  detail: FolderDetailResponse,
  options: {
    actor?: WorkflowActor | null
    catalog?: CatalogFormResponse[] | null
    now?: Date
  } = {},
): FolderViewModel {
  const toc = buildToCViewModel({
    toc: detail.tableOfContents,
    progress: detail.progress,
    actor: options.actor,
    catalog: options.catalog,
    now: options.now,
  })

  return {
    folder: detail.folder,
    toc,
    progress: buildFolderProgress({
      toc,
      progress: detail.progress,
      signOff: detail.signOff ?? null,
    }),
  }
}

// =====================================================================================
// 7. NAME / DATE / SIGNATURE  (requirement #13, and #14 for the locked folder)
//    "Automatically date, signature, name approvals on each form on each existing
//     location accordingly ... while maintaining the existing form structures without
//     modifying their layouts."
//
//    ONE cell is emitted PER STEP THAT DECLARES A SIGNATURE BLOCK, in
//    SIGNATURE_BLOCK_ORDER, whether or not the step has been executed:
//      - executed + signature row  -> stamped cell (name, role, UTC date, trace, userId)
//      - executed, no row yet      -> filled from the STEP (actedByName / actedAt)
//      - skipped                   -> "Skipped" caption, no name, no date
//      - not executed yet          -> placeholder cell with the eligible role, so the
//                                     printed layout NEVER changes shape mid-chain
//
//    `userId` is what `useSignatureImage(cell.userId, cell.isSigned)` of
//    src/lib/workflow/signature-render.ts consumes to stream the specimen. The raw storage
//    path is never exposed here, and `userId` must never be printed.
// =====================================================================================

export interface SignatureCellViewModel {
  /** SignatureBlockType of the step - drives the printed caption. */
  block: SignatureBlockType
  /** "Prepared by" / "Reviewed by" / "Approved by" / "Endorsed by" ... */
  caption: string
  stepNo: number
  stepTitle: string

  /** True once the step has been executed by a real person. */
  isSigned: boolean
  /** True when the step was skipped: caption stays, name and date stay empty. */
  isSkipped: boolean
  /** True while the cell is still an empty box on the printed form. */
  isPlaceholder: boolean

  /** C# long. Feed to useSignatureImage(); NEVER print it. */
  userId: number | null
  personName: string
  personRole: string
  personRoleLabel: string
  /** "Nour Adel — Shop Team Leader (STL)". */
  signerCaptionText: string

  signedAtIso: string | null
  /** "2026-08-27" - the printed date cell. */
  signedDate: string
  /** "2026-08-27 09:14 UTC" - tooltip / audit only. */
  signedTimestamp: string

  /** Short integrity marker printed next to a stamped signature. */
  trace: string

  /** Roles that MAY sign an unsigned cell: "Pending — Manager (MGR)". */
  expectedRoleLabels: string[]
  /** Text the empty cell renders instead of a name. */
  placeholderText: string
}

function signatureRowFor(
  signatures: FormSignatureResponse[],
  stepNo: number,
  block: SignatureBlockType,
): FormSignatureResponse | null {
  return (
    signatures.find(row => row.stepNo === stepNo && row.block === block) ??
    signatures.find(row => row.stepNo === stepNo) ??
    null
  )
}

function blockOrderIndex(block: SignatureBlockType): number {
  const index = SIGNATURE_BLOCK_ORDER.indexOf(block)
  return index < 0 ? SIGNATURE_BLOCK_ORDER.length : index
}

function cellFromStep(
  step: WorkflowStepResponse,
  signatures: FormSignatureResponse[],
): SignatureCellViewModel {
  const block = step.signatureBlock
  const row = signatureRowFor(signatures, step.stepNo, block)

  const userId = row?.userId ?? step.actedByUserId ?? null
  const personName = firstNonEmpty(row?.personName, step.actedByName)
  const personRole = firstNonEmpty(row?.personRole, step.actedByRole)
  const signedAtIso = firstNonEmpty(row?.signedAt, step.actedAt) || null

  const isSkipped = step.isSkipped === true || step.state === WorkflowStepState.Skipped
  const isSigned = !isSkipped && Boolean(userId) && Boolean(signedAtIso)

  const personRoleLabel = personRole
    ? firstNonEmpty(row?.personRoleLabel, roleLabel(personRole))
    : ''

  const expectedRoleLabels =
    step.eligibleRoleLabels && step.eligibleRoleLabels.length > 0
      ? step.eligibleRoleLabels
      : (step.eligibleRoles ?? []).map(roleLabelWithCode)

  const hash = (row?.signatureHash ?? '').trim()

  return {
    block,
    caption: firstNonEmpty(row?.caption, step.signatureCaption, signatureCaption(block)),
    stepNo: step.stepNo,
    stepTitle: step.title ?? '',

    isSigned,
    isSkipped,
    isPlaceholder: !isSigned && !isSkipped,

    userId: isSigned ? userId : null,
    personName: isSigned ? personName : '',
    personRole: isSigned ? personRole : '',
    personRoleLabel: isSigned ? personRoleLabel : '',
    signerCaptionText:
      isSigned && personName && personRoleLabel
        ? `${personName} — ${personRoleLabel}`
        : isSigned
          ? personName || personRoleLabel
          : '',

    signedAtIso: isSigned ? signedAtIso : null,
    signedDate: isSigned ? formatIsoDate(signedAtIso) : '',
    signedTimestamp: isSigned ? formatIsoTimestamp(signedAtIso) : '',

    trace: isSigned && hash ? (hash.length > 12 ? hash.slice(0, 12) : hash) : '',

    expectedRoleLabels,
    placeholderText: isSkipped
      ? `Skipped${step.skipReason ? ` — ${step.skipReason}` : ''}`
      : expectedRoleLabels.length > 0
        ? `Pending — ${expectedRoleLabels.join(' / ')}`
        : 'Pending',
  }
}

function cellFromOrphanSignature(row: FormSignatureResponse): SignatureCellViewModel {
  const personRoleLabel = firstNonEmpty(row.personRoleLabel, roleLabel(row.personRole))
  const hash = (row.signatureHash ?? '').trim()

  return {
    block: row.block,
    caption: firstNonEmpty(row.caption, signatureCaption(row.block)),
    stepNo: row.stepNo,
    stepTitle: '',

    isSigned: true,
    isSkipped: false,
    isPlaceholder: false,

    userId: row.userId ?? null,
    personName: row.personName ?? '',
    personRole: row.personRole ?? '',
    personRoleLabel,
    signerCaptionText:
      row.personName && personRoleLabel ? `${row.personName} — ${personRoleLabel}` : row.personName ?? '',

    signedAtIso: row.signedAt ?? null,
    signedDate: formatIsoDate(row.signedAt),
    signedTimestamp: formatIsoTimestamp(row.signedAt),

    trace: hash ? (hash.length > 12 ? hash.slice(0, 12) : hash) : '',

    expectedRoleLabels: [],
    placeholderText: '',
  }
}

/**
 * The printed "Prepared by / Reviewed by / Approved by / Dates" block of ONE form.
 * Bind it field-by-field into the EXISTING cells of `FormDocumentChrome` /
 * `AuthorizationCertificateBlock`; do not restructure their markup.
 */
export function buildSignatureBlock(
  instance: WorkflowInstanceResponse,
): SignatureCellViewModel[] {
  const steps = instance.steps ?? []
  const signatures = instance.signatures ?? []

  const cells = steps
    .filter(step => step.signatureBlock !== SignatureBlockType.None)
    .map(step => cellFromStep(step, signatures))

  // Defensive: a signature row whose step is no longer in the definition must still print.
  const covered = new Set(cells.map(cell => `${cell.stepNo}#${cell.block}`))
  for (const row of signatures) {
    if (!covered.has(`${row.stepNo}#${row.block}`)) {
      cells.push(cellFromOrphanSignature(row))
      covered.add(`${row.stepNo}#${row.block}`)
    }
  }

  return cells.sort((a, b) => {
    const byBlock = blockOrderIndex(a.block) - blockOrderIndex(b.block)
    return byBlock !== 0 ? byBlock : a.stepNo - b.stepNo
  })
}

/** The cell of ONE caption, for a form whose layout has a fixed single box. */
export function signatureCellOf(
  cells: SignatureCellViewModel[],
  block: SignatureBlockType,
): SignatureCellViewModel | null {
  return cells.find(cell => cell.block === block) ?? null
}

/** True once every non-skipped signature cell of the form carries a name and a date. */
export function isSignatureBlockComplete(cells: SignatureCellViewModel[]): boolean {
  return cells.length > 0 && cells.every(cell => cell.isSigned || cell.isSkipped)
}

/** The user ids whose specimen the printed form needs, de-duplicated for prefetching. */
export function signatureUserIds(cells: SignatureCellViewModel[]): number[] {
  const ids = cells
    .map(cell => cell.userId)
    .filter((id): id is number => typeof id === 'number' && Number.isFinite(id) && id > 0)
  return Array.from(new Set(ids))
}

// =====================================================================================
// 8. STEP TIMELINE
//    The routing history rendered under a form: role, assignee, action, comments,
//    signature, date. Capability flags are read STRAIGHT off the server response - the
//    action bar still uses `stepActionState()` of workflow-permissions.ts.
// =====================================================================================

export interface WorkflowStepViewModel {
  id: string
  stepNo: number
  title: string

  kind: WorkflowStepKind
  kindLabel: string
  actionVerb: string

  state: WorkflowStepState
  stateLabel: string
  stateClasses: string

  pendingStatusLabel: string
  actionLabel: string

  eligibleRoleLabels: string[]

  assignedToUserId: number | null
  assignedToName: string
  assignedToRoleLabel: string
  assignedAt: string

  actedByUserId: number | null
  actedByName: string
  actedByRoleLabel: string
  actedAt: string
  actedAtTimestamp: string

  comments: string
  wasDelegated: boolean
  delegationReason: string

  isCurrent: boolean
  isDone: boolean
  isSkipped: boolean
  skipLabel: string

  requiresManualAssignment: boolean
  needsAssignment: boolean
  requiresComments: boolean
  isChecklistGate: boolean
  checklistLabel: string

  signatureCell: SignatureCellViewModel | null

  canAct: boolean
  canAssign: boolean
  canDelegate: boolean
  canSkip: boolean
}

export function buildStepTimeline(
  instance: WorkflowInstanceResponse,
): WorkflowStepViewModel[] {
  const signatures = instance.signatures ?? []

  return [...(instance.steps ?? [])]
    .sort((a, b) => a.stepNo - b.stepNo)
    .map(step => {
      const isSkipped = step.isSkipped === true || step.state === WorkflowStepState.Skipped
      const isDone = step.state === WorkflowStepState.Completed || isSkipped

      const eligibleRoleLabels =
        step.eligibleRoleLabels && step.eligibleRoleLabels.length > 0
          ? step.eligibleRoleLabels
          : (step.eligibleRoles ?? []).map(roleLabelWithCode)

      return {
        id: step.id,
        stepNo: step.stepNo,
        title: step.title ?? '',

        kind: step.kind,
        kindLabel: firstNonEmpty(step.kindLabel, stepKindLabel(step.kind)),
        actionVerb: stepKindActionLabel(step.kind),

        state: step.state,
        stateLabel: firstNonEmpty(step.stateLabel, stepStateLabel(step.state)),
        stateClasses: stepStateClasses(step.state),

        pendingStatusLabel: firstNonEmpty(
          step.pendingStatusLabel,
          approvalStatusLabel(step.pendingStatus),
        ),
        actionLabel: stepKindActionLabel(step.kind),

        eligibleRoleLabels,

        assignedToUserId: step.assignedToUserId ?? null,
        assignedToName: step.assignedToName ?? '',
        assignedToRoleLabel: step.assignedToRole ? roleLabel(step.assignedToRole) : '',
        assignedAt: formatIsoDate(step.assignedAt),

        actedByUserId: step.actedByUserId ?? null,
        actedByName: step.actedByName ?? '',
        actedByRoleLabel: step.actedByRole ? roleLabel(step.actedByRole) : '',
        actedAt: formatIsoDate(step.actedAt),
        actedAtTimestamp: formatIsoTimestamp(step.actedAt),

        comments: step.comments ?? '',
        wasDelegated: step.wasDelegated === true,
        delegationReason: step.delegationReason ?? '',

        isCurrent: step.stepNo === instance.currentStepNo && !isDone,
        isDone,
        isSkipped,
        skipLabel: isSkipped
          ? `${step.skippedAutomatically ? 'Auto-skipped' : 'Skipped'}${
              step.skipReason ? ` — ${step.skipReason}` : ''
            }`
          : skipModeLabel(step.skipMode),

        requiresManualAssignment: step.requiresManualAssignment === true,
        needsAssignment:
          step.requiresManualAssignment === true &&
          (step.assignedToUserId === null || step.assignedToUserId === undefined) &&
          !isDone,
        requiresComments: step.requiresComments === true,
        isChecklistGate: step.isStepByStepChecklist === true || step.kind === WorkflowStepKind.Gate,
        checklistLabel:
          (step.checklistTotalItems ?? 0) > 0
            ? `${step.checklistVerifiedItems ?? 0} / ${step.checklistTotalItems} items verified`
            : '',

        signatureCell:
          step.signatureBlock === SignatureBlockType.None
            ? null
            : cellFromStep(step, signatures),

        canAct: step.canIAct === true,
        canAssign: step.canIAssign === true,
        canDelegate: step.canIDelegate === true,
        canSkip: step.canISkip === true,
      }
    })
}

/** The pending step of an open form, or null when the chain is closed. */
export function currentStepOf(
  steps: WorkflowStepViewModel[],
): WorkflowStepViewModel | null {
  return steps.find(step => step.isCurrent) ?? null
}

// =====================================================================================
// 9. REDESIGN v20 - THE MINI-KANBAN TRACKER PROJECTION
//    The redesigned Table of Contents renders ONE simplified row per form
//    (title + form number + ONE standardized status badge) and, when the row is
//    expanded, a horizontal "Mini-Kanban" approver tracker directly below the title.
//    The row carries its tracker pills from THIS projection - built with
//    `buildStepTimeline` (section 8) from the FULL `WorkflowInstanceResponse` of the
//    form, so every pill tooltip can show the person's name, role, state and the
//    EXACT UTC timestamp of the action ("2026-08-27 09:14 UTC").
//
//    The ToC endpoint does NOT carry per-step facts (only `completedSteps` /
//    `currentStepTitle`), so the panel fetches `getWorkflowForm(instanceId)` lazily,
//    when a row is expanded, and feeds the instance here. Pure function - no hooks,
//    no fetch; the server labels win over the local maps (binding rule 2).
// =====================================================================================

/** The six visual states of a tracker pill. */
export type ToCTrackerStepState =
  | 'approved'
  | 'pending'
  | 'revision_requested'
  | 'rejected'
  | 'skipped'
  | 'not_started'

export interface ToCTrackerStep {
  stepNo: number
  title: string
  /** "Approve" / "Verify" / "Sign off" ... - the verb of the step. */
  actionVerb: string
  state: ToCTrackerStepState
  /** Server label of the state, e.g. "Completed" / "Returned". */
  stateLabel: string
  /** True while this step is the one currently pending on the instance. */
  isCurrent: boolean
  /** Person who acted on / is assigned to the step ('' when unknown). */
  name: string
  roleLabel: string
  /** Roles that may act on a step nobody acted on yet. */
  expectedRoleLabels: string[]
  /** "2026-08-27 09:14 UTC" - the exact UTC stamp of the action ('' when not acted). */
  timestamp: string
  /** Comment the person left with the action ('' when none). */
  comments: string
}

/** Maps ONE executed step onto its tracker pill state. */
export function trackerStateOf(step: WorkflowStepViewModel): ToCTrackerStepState {
  if (step.isSkipped) return 'skipped'
  switch (step.state) {
    case WorkflowStepState.Completed:
      return 'approved'
    case WorkflowStepState.Rejected:
      return 'rejected'
    case WorkflowStepState.Returned:
      return 'revision_requested'
    case WorkflowStepState.Active:
    case WorkflowStepState.AwaitingAssignment:
      return 'pending'
    default:
      return 'not_started'
  }
}

/**
 * The complete Mini-Kanban chain of ONE form, in routing order.
 * Feed it to `components/workflow/ToCStepTracker.tsx`.
 */
export function buildToCTracker(instance: WorkflowInstanceResponse): ToCTrackerStep[] {
  return buildStepTimeline(instance).map(step => {
    const state = trackerStateOf(step)
    const hasActed =
      state === 'approved' ||
      state === 'rejected' ||
      state === 'revision_requested' ||
      (state === 'pending' && Boolean(step.actedAtTimestamp))

    return {
      stepNo: step.stepNo,
      title: step.title,
      actionVerb: step.actionVerb,
      state,
      stateLabel: step.stateLabel,
      isCurrent: step.isCurrent,
      name: firstNonEmpty(step.actedByName, step.assignedToName),
      roleLabel: firstNonEmpty(step.actedByRoleLabel, step.assignedToRoleLabel),
      expectedRoleLabels: step.eligibleRoleLabels,
      timestamp: hasActed ? step.actedAtTimestamp : '',
      comments: step.comments,
    }
  })
}

// =====================================================================================
// 10. REDESIGN v21 - THE ONE HIGH-LEVEL ROW STATUS BADGE
//     The redesigned Table of Contents prints ONE badge per row (Form title + ID + badge)
//     instead of the previous dense stack of lifecycle icon + status + hints. The badge
//     vocabulary is deliberately SHORT and business-readable, and the colour system is
//     UNIFIED across the whole sidebar:
//
//       GREEN  -> Approved / Completed & locked        (the form is closed and valid)
//       AMBER  -> In Progress / Action Required / Revision Needed
//       RED    -> Rejected / Revoked
//       ORANGE -> Expired            (an approved form whose validity lapsed)
//       SKY    -> Skipped            (closed without approval, by rule)
//       GRAY   -> Not Started / Draft / External source
//
//     "Action Required" is the SAME amber family as "In Progress" on purpose: both mean
//     "somebody still has to act", and the row only escalates to Action Required when the
//     SERVER says the pending step belongs to the calling user (`canIAct === true`).
//     Absent flag means no - the gate is `=== true`, never `!== false`.
// =====================================================================================

export type ToCHighLevelKey =
  | 'approved'
  | 'in_progress'
  | 'action_required'
  | 'revision_needed'
  | 'rejected'
  | 'expired'
  | 'skipped'
  | 'draft'
  | 'not_started'
  | 'external'

export interface ToCHighLevelStatus {
  key: ToCHighLevelKey
  /** "Approved" / "In Progress" / "Action Required" / "Revision Needed" ... */
  label: string
  /** Badge classes (border + background + text) - always dark text on a light surface. */
  classes: string
  /** Solid dot / progress-fill class of the same tone. */
  dotClasses: string
  /** Rejected / revoked / returned / expired: the row must be chased. */
  isAttention: boolean
  /** Approved / completed & locked / skipped / external rows count as closed. */
  countsAsClosed: boolean
}

const HIGH_LEVEL_STYLE: Record<
  ToCHighLevelKey,
  { label: string; classes: string; dotClasses: string }
> = {
  approved: {
    label: 'Approved',
    classes: 'border-emerald-300 bg-emerald-50 text-emerald-800',
    dotClasses: 'bg-emerald-500',
  },
  in_progress: {
    label: 'In Progress',
    classes: 'border-amber-300 bg-amber-50 text-amber-900',
    dotClasses: 'bg-amber-500',
  },
  action_required: {
    label: 'Action Required',
    classes: 'border-amber-400 bg-amber-100 text-amber-900',
    dotClasses: 'bg-amber-500',
  },
  revision_needed: {
    label: 'Revision Needed',
    classes: 'border-amber-400 bg-amber-100 text-amber-900',
    dotClasses: 'bg-amber-500',
  },
  rejected: {
    label: 'Rejected',
    classes: 'border-red-300 bg-red-50 text-red-800',
    dotClasses: 'bg-red-500',
  },
  expired: {
    label: 'Expired',
    classes: 'border-orange-300 bg-orange-50 text-orange-900',
    dotClasses: 'bg-orange-500',
  },
  skipped: {
    label: 'Skipped',
    classes: 'border-sky-300 bg-sky-50 text-sky-900',
    dotClasses: 'bg-sky-400',
  },
  draft: {
    label: 'Draft',
    classes: 'border-gray-300 bg-gray-50 text-gray-700',
    dotClasses: 'bg-gray-400',
  },
  not_started: {
    label: 'Not Started',
    classes: 'border-gray-300 bg-gray-50 text-gray-600',
    dotClasses: 'bg-gray-300',
  },
  external: {
    label: 'External Source',
    classes: 'border-dashed border-slate-300 bg-slate-50 text-slate-600',
    dotClasses: 'bg-slate-300',
  },
}

const HIGH_LEVEL_ATTENTION: ReadonlySet<ToCHighLevelKey> = new Set<ToCHighLevelKey>([
  'rejected',
  'revision_needed',
  'expired',
])

const HIGH_LEVEL_CLOSED: ReadonlySet<ToCHighLevelKey> = new Set<ToCHighLevelKey>([
  'approved',
  'skipped',
  'external',
])

export function highLevelStatusFor(key: ToCHighLevelKey): ToCHighLevelStatus {
  const style = HIGH_LEVEL_STYLE[key]
  return {
    key,
    label: style.label,
    classes: style.classes,
    dotClasses: style.dotClasses,
    isAttention: HIGH_LEVEL_ATTENTION.has(key),
    countsAsClosed: HIGH_LEVEL_CLOSED.has(key),
  }
}

/**
 * The ONE high-level badge of a Table-of-Contents row.
 * `null` / no instance renders "Not Started", because the printed sheet still lists the form.
 */
export function highLevelStatusOf(
  row: TableOfContentsItemResponse | null | undefined,
): ToCHighLevelStatus {
  if (!row) return highLevelStatusFor('not_started')
  if (isExternalSourceFormType(row.formType)) return highLevelStatusFor('external')
  if (row.isExpired === true) return highLevelStatusFor('expired')

  switch (standardStatusKeyOfStatus(row.status)) {
    case 'approved':
    case 'completed_locked':
      return highLevelStatusFor('approved')
    case 'returned':
      return highLevelStatusFor('revision_needed')
    case 'rejected':
    case 'revoked':
      return highLevelStatusFor('rejected')
    case 'expired':
      return highLevelStatusFor('expired')
    case 'skipped':
      return highLevelStatusFor('skipped')
    case 'draft':
      return highLevelStatusFor(row.formWorkflowInstanceId ? 'draft' : 'not_started')
    case 'not_started':
      return highLevelStatusFor('not_started')
    default:
      // Every Pending* status. The row escalates only on the SERVER flag.
      return highLevelStatusFor(row.canIAct === true ? 'action_required' : 'in_progress')
  }
}

// =====================================================================================
// 11. REDESIGN v21 - MULTI-APPROVER STAGES OF THE MINI-KANBAN TRACKER
//     A single form frequently carries TWO OR MORE approvers, and they come in two
//     different shapes on the same contract:
//
//       SEQUENTIAL  - "Shop Manager approval" then "QA approval": two steps with two
//                     different titles. Each one is its OWN stage, so the chain reads
//                     left-to-right exactly like the printed routing.
//       CONCURRENT  - two (or more) ADJACENT steps that declare the SAME step title
//                     (the way the backend models "either / both of these people must
//                     act on this stage"). They collapse into ONE stage carrying
//                     SEVERAL approver pills, so the row can show "1 of 2 approved -
//                     waiting on Nour Adel", and a rejection by ONE of them is visible
//                     without hiding the approval already given by the other.
//
//     A stage therefore always answers the two questions the redesign asks for:
//       - what is the state of EACH approver of this stage (per-pill), and
//       - what is the state of the STAGE as a whole (rolled up, worst-first).
//
//     Pure projection: no hooks, no fetch, server labels win (binding rule 2).
// =====================================================================================

export const TRACKER_STATE_LABELS: Record<ToCTrackerStepState, string> = {
  approved: 'Approved',
  pending: 'Pending action',
  revision_requested: 'Revision requested',
  rejected: 'Rejected',
  skipped: 'Skipped',
  not_started: 'Not started',
}

/** Tone of ONE tracker state, shared by the pills, the connectors and the legend. */
export interface ToCTrackerTone {
  /** Solid surface of an acted pill. */
  solid: string
  /** Outline surface of a pending / not-acted pill. */
  soft: string
  /** Text tone used in tooltips and stage captions. */
  text: string
  /** Connector / progress fill. */
  fill: string
}

export const TRACKER_TONES: Record<ToCTrackerStepState, ToCTrackerTone> = {
  approved: {
    solid: 'bg-emerald-500 text-white border-emerald-500',
    soft: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    text: 'text-emerald-700',
    fill: 'bg-emerald-400',
  },
  pending: {
    solid: 'bg-amber-500 text-white border-amber-500',
    soft: 'bg-amber-50 text-amber-800 border-amber-400',
    text: 'text-amber-700',
    fill: 'bg-amber-400',
  },
  revision_requested: {
    solid: 'bg-amber-600 text-white border-amber-600',
    soft: 'bg-white text-amber-700 border-amber-500',
    text: 'text-amber-700',
    fill: 'bg-amber-400',
  },
  rejected: {
    solid: 'bg-red-500 text-white border-red-500',
    soft: 'bg-red-50 text-red-700 border-red-300',
    text: 'text-red-700',
    fill: 'bg-red-400',
  },
  skipped: {
    solid: 'bg-sky-100 text-sky-700 border-sky-300',
    soft: 'bg-sky-50 text-sky-700 border-sky-300',
    text: 'text-sky-700',
    fill: 'bg-sky-300',
  },
  not_started: {
    solid: 'bg-white text-gray-400 border-gray-300',
    soft: 'bg-white text-gray-400 border-dashed border-gray-300',
    text: 'text-gray-500',
    fill: 'bg-gray-200',
  },
}

/** ONE approver / action-taker pill of a stage. */
export interface ToCTrackerApprover {
  stepNo: number
  /** Step title, e.g. "Shop Manager approval". */
  title: string
  /** "Approve" / "Verify" / "Sign off" - the verb of the step. */
  actionVerb: string
  /** Printed signature caption of the step ("Approved by"), '' when the step has none. */
  caption: string

  state: ToCTrackerStepState
  /** Server label of the underlying step state ("Completed" / "Returned" ...). */
  stateLabel: string
  /** Standardized tracker label of `state` ("Approved" / "Revision requested" ...). */
  trackerLabel: string
  /** True while this approver is the one currently holding the form. */
  isCurrent: boolean

  /** Person who acted, or who the step is assigned to ('' when nobody yet). */
  name: string
  roleLabel: string
  /** "NA" - rendered inside a pending / not-started pill. */
  initials: string
  /** Roles that MAY act when nobody has acted yet. */
  expectedRoleLabels: string[]

  /** "2026-08-27 09:14 UTC" - the EXACT UTC stamp of the action ('' when not acted). */
  timestamp: string
  /** Comment the person left with the action ('' when none). */
  comments: string
  /** True when the step still has no assignee and needs one. */
  needsAssignment: boolean
}

/** ONE stage of the chain: a single approver, or several concurrent approvers. */
export interface ToCTrackerStage {
  /** Stable key for React lists. */
  key: string
  /** 1-based position of the stage in the chain. */
  order: number
  title: string
  actionVerb: string
  caption: string

  approvers: ToCTrackerApprover[]
  /** True when the stage carries TWO OR MORE approvers / action-takers. */
  isMultiApprover: boolean
  /** How many approvers the stage declares. */
  approverCount: number
  /** Approved (or skipped) approvers of the stage. */
  approvedCount: number

  /** Rolled-up state of the stage: worst-first (rejected > revision > pending > done). */
  state: ToCTrackerStepState
  /** Standardized label of the rolled-up state. */
  stateLabel: string
  /** True when the stage is the one the form is currently waiting on. */
  isCurrent: boolean

  /** "1 of 2 approved · waiting on Nour Adel" / "Nour Adel requested a revision". */
  summaryLabel: string
  /** Names still expected to act on the stage. */
  waitingOn: string[]
  /** Names who rejected or requested a revision on the stage. */
  flaggedBy: string[]
}

/** "Nour Adel" -> "NA". Exported so the pill and the tooltip never disagree. */
export function initialsOfName(name: string): string {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
}

/** Identity of the STAGE a step belongs to: adjacent steps with the same identity merge. */
function stageKeyOf(step: WorkflowStepViewModel): string {
  const title = step.title.trim().toLowerCase().replace(/\s+/g, ' ')
  if (title) return `t:${title}`
  const block = step.signatureCell ? step.signatureCell.block : SignatureBlockType.None
  return `k:${step.kind}:b:${block}`
}

function approverOf(step: WorkflowStepViewModel): ToCTrackerApprover {
  const state = trackerStateOf(step)
  const name = firstNonEmpty(step.actedByName, step.assignedToName)

  return {
    stepNo: step.stepNo,
    title: step.title,
    actionVerb: step.actionVerb,
    caption: step.signatureCell?.caption ?? '',

    state,
    stateLabel: step.stateLabel,
    trackerLabel: TRACKER_STATE_LABELS[state],
    isCurrent: step.isCurrent,

    name,
    roleLabel: firstNonEmpty(step.actedByRoleLabel, step.assignedToRoleLabel),
    initials: initialsOfName(name),
    expectedRoleLabels: step.eligibleRoleLabels,

    timestamp: step.actedAtTimestamp,
    comments: step.comments,
    needsAssignment: step.needsAssignment,
  }
}

/** Worst-first roll-up, so one rejection inside a concurrent stage is never hidden. */
function rollUpStageState(approvers: ToCTrackerApprover[]): ToCTrackerStepState {
  if (approvers.length === 0) return 'not_started'
  if (approvers.some(a => a.state === 'rejected')) return 'rejected'
  if (approvers.some(a => a.state === 'revision_requested')) return 'revision_requested'
  if (approvers.some(a => a.state === 'pending')) return 'pending'
  if (approvers.every(a => a.state === 'skipped')) return 'skipped'
  if (approvers.every(a => a.state === 'approved' || a.state === 'skipped')) return 'approved'
  return 'not_started'
}

function personOf(approver: ToCTrackerApprover): string {
  return (
    approver.name ||
    approver.roleLabel ||
    (approver.expectedRoleLabels.length > 0 ? approver.expectedRoleLabels.join(' / ') : '') ||
    `Step ${approver.stepNo}`
  )
}

function stageSummaryOf(
  approvers: ToCTrackerApprover[],
  state: ToCTrackerStepState,
  isMulti: boolean,
): { summaryLabel: string; waitingOn: string[]; flaggedBy: string[] } {
  const total = approvers.length
  const done = approvers.filter(a => a.state === 'approved' || a.state === 'skipped').length
  const waitingOn = approvers.filter(a => a.state === 'pending').map(personOf)
  const flaggedBy = approvers
    .filter(a => a.state === 'rejected' || a.state === 'revision_requested')
    .map(personOf)

  const ratio = isMulti ? `${done} of ${total} approved` : ''

  if (flaggedBy.length > 0) {
    const verb = approvers.some(a => a.state === 'rejected')
      ? 'rejected this form'
      : 'requested a revision'
    const head = `${flaggedBy.join(', ')} ${verb}`
    return { summaryLabel: ratio ? `${ratio} · ${head}` : head, waitingOn, flaggedBy }
  }

  if (waitingOn.length > 0) {
    const head = `waiting on ${waitingOn.join(', ')}`
    return { summaryLabel: ratio ? `${ratio} · ${head}` : `Waiting on ${waitingOn.join(', ')}`, waitingOn, flaggedBy }
  }

  if (state === 'approved') {
    return { summaryLabel: ratio || 'Approved', waitingOn, flaggedBy }
  }
  if (state === 'skipped') {
    return { summaryLabel: 'Skipped by rule', waitingOn, flaggedBy }
  }

  const expected = approvers
    .flatMap(a => a.expectedRoleLabels)
    .filter((label, index, all) => label && all.indexOf(label) === index)

  return {
    summaryLabel: expected.length > 0 ? `Not started — ${expected.join(' / ')}` : 'Not started',
    waitingOn,
    flaggedBy,
  }
}

/**
 * The complete Mini-Kanban chain of ONE form, GROUPED INTO STAGES, in routing order.
 * Feed it to `components/workflow/ToCStepTracker.tsx`.
 */
export function buildToCTrackerStages(instance: WorkflowInstanceResponse): ToCTrackerStage[] {
  const steps = buildStepTimeline(instance)
  const stages: ToCTrackerStage[] = []

  let currentKey: string | null = null
  let bucket: WorkflowStepViewModel[] = []

  const flush = () => {
    if (bucket.length === 0) return
    const approvers = bucket.map(approverOf)
    const state = rollUpStageState(approvers)
    const isMultiApprover = approvers.length > 1
    const { summaryLabel, waitingOn, flaggedBy } = stageSummaryOf(approvers, state, isMultiApprover)
    const head = bucket[0]!

    stages.push({
      key: `${head.stepNo}-${stages.length + 1}`,
      order: stages.length + 1,
      title: firstNonEmpty(head.title, head.kindLabel, `Step ${head.stepNo}`),
      actionVerb: head.actionVerb,
      caption: approvers.find(a => a.caption)?.caption ?? '',

      approvers,
      isMultiApprover,
      approverCount: approvers.length,
      approvedCount: approvers.filter(a => a.state === 'approved' || a.state === 'skipped').length,

      state,
      stateLabel: TRACKER_STATE_LABELS[state],
      isCurrent: approvers.some(a => a.isCurrent),

      summaryLabel,
      waitingOn,
      flaggedBy,
    })

    bucket = []
  }

  for (const step of steps) {
    const key = stageKeyOf(step)
    if (currentKey !== null && key !== currentKey) flush()
    currentKey = key
    bucket.push(step)
  }
  flush()

  return stages
}

/** Compact roll-up of the whole chain, rendered above the pills when a row is expanded. */
export interface ToCTrackerCounters {
  totalStages: number
  doneStages: number
  percent: number
  totalApprovers: number
  approvedApprovers: number
  /** "Shop Manager approval" - the stage currently holding the form ('' when closed). */
  currentStageTitle: string
  /** Everybody the form is waiting on right now. */
  waitingOn: string[]
  /** True when any stage is rejected / revision-requested. */
  hasAttention: boolean
  /** True when 2+ approvers act on the SAME stage anywhere in the chain. */
  hasConcurrentStage: boolean
  /** "4 of 6 stages approved · waiting on Nour Adel, Sara Kamal". */
  label: string
}

export function trackerCountersOf(stages: ToCTrackerStage[]): ToCTrackerCounters {
  const doneStages = stages.filter(s => s.state === 'approved' || s.state === 'skipped').length
  const approvers = stages.flatMap(s => s.approvers)
  const current = stages.find(s => s.isCurrent) ?? stages.find(s => s.state === 'pending') ?? null
  const waitingOn = stages
    .flatMap(s => s.waitingOn)
    .filter((name, index, all) => name && all.indexOf(name) === index)

  const base = `${doneStages} of ${stages.length} stage${stages.length === 1 ? '' : 's'} approved`

  return {
    totalStages: stages.length,
    doneStages,
    percent: percentOf(doneStages, stages.length),
    totalApprovers: approvers.length,
    approvedApprovers: approvers.filter(a => a.state === 'approved' || a.state === 'skipped').length,
    currentStageTitle: current?.title ?? '',
    waitingOn,
    hasAttention: stages.some(s => s.state === 'rejected' || s.state === 'revision_requested'),
    hasConcurrentStage: stages.some(s => s.isMultiApprover),
    label: waitingOn.length > 0 ? `${base} · waiting on ${waitingOn.join(', ')}` : base,
  }
}