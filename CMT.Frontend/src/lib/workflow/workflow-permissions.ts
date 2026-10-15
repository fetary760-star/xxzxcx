/**
 * =====================================================================================
 * AMENDED v18 - PHASE 1 (FRONTEND), THE ROLE-PERMISSION MATRIX MIRROR
 * CMT.Frontend/src/lib/workflow/workflow-permissions.ts   (REPLACES the whole v14 file)
 * Copy to: CMT.Frontend/src/lib/workflow/workflow-permissions.ts
 *
 * WHAT THIS FILE IS
 * -----------------
 * The FRONTEND MIRROR of the two server-side permission matrices you already amended:
 *
 *   CMT.Domain/Models/Workflow/WorkflowPermissionMatrix.cs      (GENERIC layer)
 *   CMT.Domain/Models/Workflow/DocumentationPermissionMatrix.cs (SPECIALISED layer)
 *
 * It consumes ONLY the two mirrors that already exist on the client:
 *   src/lib/workflow/workflow-types.ts   (v18 - enums + request / response shapes)
 *   src/lib/role-hierarchy.ts            (v12 - 16 roles + permissions + scopes)
 *
 * WHAT CHANGED AGAINST v14  (five amendments, nothing else was touched)
 * --------------------------------------------------------------------
 * AMENDMENT 1 - `requiredFields` IS NO LONGER THROWN AWAY.
 *   v14 hardcoded `requiredFields: []` in BOTH `stepFactsFromCatalog()` and
 *   `stepFactsFromInstanceStep()`, because the v11 mirror did not declare the member.
 *   Consequence: `validateDecisionPayload()` could NEVER detect a missing MNT-1420A
 *   `bulletinNumber`, a missing MNT-1420B `adNumber` or a missing MNT-1229B tool field, so
 *   the client happily posted an incomplete decision and the server answered
 *   422 REQUIRED_FIELDS_MISSING with no field list to show the user.
 *   workflow-types.ts v18 declares `requiredFields` on CatalogStepResponse AND on
 *   WorkflowStepResponse, so both normalisers now READ it.
 *
 * AMENDMENT 2 - THE UNSAFE CAST IN `draftRequiredFieldsOf()` IS GONE.
 *   v14 had to write
 *       (form as unknown as { requiredDraftFields?: string[] }).requiredDraftFields
 *   because CatalogFormResponse did not declare the member. v18 declares it, so the cast
 *   is deleted. A cast like that silently survives a rename on the server; a typed read
 *   does not.
 *
 * AMENDMENT 3 - THE CATALOG NOW CARRIES `requiresComments` AND `isStepByStepChecklist`.
 *   v14 hardcoded both to `false` for a CATALOG step, so a Table-of-Contents row could not
 *   know that MNT-1325 step 1 is a step-by-step gate, and the "Comments are mandatory"
 *   pre-flight only worked once the form had been opened. Both are now read from the
 *   catalog when the server supplies them (they are OPTIONAL in the mirror, so an older
 *   server build still type-checks and simply falls back to `false`).
 *
 * AMENDMENT 4 - STEP FACTS NOW CARRY THE SIGNATURE BLOCK (requirement #13).
 *   "Automatically generate and apply name, date and signatures upon approval based on the
 *    signer's identity and role" needs to know WHICH caption a step stamps BEFORE the step
 *   is executed, otherwise the printed block changes shape mid-chain - which requirement
 *   #13 forbids. `StepFacts` therefore gains `signatureBlock` + `signatureCaption`:
 *     - an INSTANCE step delivers `signatureBlock` as a number -> used directly;
 *     - a CATALOG step delivers only `signatureCaption` as a string -> mapped back with
 *       `signatureBlockFromCaption()`.
 *
 * AMENDMENT 5 - SIGNATURE AUTHORITY IS NOW PART OF THE MATRIX.
 *   Requirement #13 puts the specimen upload on the ADMIN dashboard only
 *   ("Ensure signatures are securely linked per user after being uploaded by the admin"),
 *   while EVERY approver must be able to READ the specimen of the signers of a form he is
 *   looking at. Section 11 adds `canUploadSignature()`, `canRevokeSignature()`,
 *   `canViewSignatureSpecimen()` and `signatureStampFacts()`, so the Admin dashboard and
 *   the printed form stop guessing and both use ONE rule.
 *
 * THE ONE RULE THAT GOVERNS THIS FILE
 * -----------------------------------
 * The SERVER IS ALWAYS THE AUTHORITY. Every `resolve*` function in section 9 reads the
 * server flag FIRST and only falls back to the local decision when the flag is missing.
 * The local decisions exist to (a) pre-flight a request so an impossible payload is never
 * sent, (b) disable a control with a precise reason, (c) render the printed matrix,
 * (d) fail fast in a unit test when client and server drift apart.
 * NEVER use a local decision to OVERRIDE a server flag that is present.
 *
 * TWO BINDING RULES COPIED FROM WorkflowApiContracts.cs - DO NOT BREAK THEM
 *   (1) every USER id is a number (C# long): userId / assignToUserId / delegateToUserId /
 *       assignedClerkUserId / designatedUserId / employeeUserId. Entity ids (folder /
 *       instance / submission / ticket / shop / department) are string (C# Guid).
 *   (2) GET /api/workflow/catalog returns step enums as STRINGS ("PendingManagerApproval",
 *       "Approval", "ManualOrAuto") while GET /api/workflow/forms/{id} returns them as
 *       NUMBERS. Section 4 normalises BOTH shapes into one `StepFacts` before any rule is
 *       evaluated - that drift is what made the old client treat every catalog step as
 *       `kind = undefined` and deny everything.
 * =====================================================================================
 */

import {
  ApprovalStatus,
  SIGNATURE_CAPTIONS,
  SignatureBlockType,
  SkipMode,
  WorkflowStepKind,
  isAwaitingDelegatedReview,
  isManuallySkippable,
  signatureCaption as captionOfBlock,
  stepKindActionLabel,
  type CatalogFormResponse,
  type CatalogStepResponse,
  type FormSignatureResponse,
  type InboxItemResponse,
  type MyPermissionsResponse,
  type TableOfContentsItemResponse,
  type WorkflowInstanceResponse,
  type WorkflowStepResponse,
} from '@/lib/workflow/workflow-types'

import {
  DELEGATION_ROLES,
  FUNCTIONAL_UNITS,
  ORG_ROLES,
  PERMISSIONS,
  WORKFLOW_SCOPES,
  canConfirmDelegatedReview,
  canRequestDelegatedReview,
  canSkipSteps,
  effectivePermissions,
  functionalUnitLabel,
  functionalUnitOf,
  isInFunctionalUnit,
  leadsFunctionalUnit,
  normalizeRole,
  rankOf,
  roleLabel,
} from '@/lib/role-hierarchy'

// =====================================================================================
// 1. DECISION CODES  (mirror of WorkflowDecisionCodes + DocumentationErrorCodes)
//    The string values are deliberately identical to WorkflowErrorCodes, so ONE
//    vocabulary covers the local pre-flight decision AND the server rejection.
// =====================================================================================

export const WORKFLOW_DECISION_CODES = {
  Allowed: 'ALLOWED',
  FormNotCatalogued: 'FORM_NOT_CATALOGUED',
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
  RequiredFieldsMissing: 'REQUIRED_FIELDS_MISSING',
  ChecklistIncomplete: 'CHECKLIST_INCOMPLETE',
  OutsideOwnShop: 'OUTSIDE_OWN_SHOP',
  OutsideFunctionalUnit: 'OUTSIDE_FUNCTIONAL_UNIT',
  PermissionDenied: 'PERMISSION_DENIED',
  InstanceLocked: 'INSTANCE_LOCKED',
  AlreadyCompleted: 'ALREADY_COMPLETED',
  ExclusiveDesignation: 'EXCLUSIVE_DESIGNATION',

  // ===== AMENDED v14 - delegated review (the approver KEEPS the approval) =====
  /** The step does not declare a usable delegated-review pool. */
  DelegatedReviewNotAllowed: 'DELEGATED_REVIEW_NOT_ALLOWED',
  /** The actor is not in the step's DelegatedReviewRoles pool. */
  NotDelegatedReviewer: 'NOT_DELEGATED_REVIEWER',
  /** The delegated reviewer must write a review comment before confirming. */
  DelegatedReviewCommentsRequired: 'DELEGATED_REVIEW_COMMENTS_REQUIRED',

  // ===== AMENDED v18 - signature authority (requirement #13) =====
  /** Only an Admin may upload or revoke a specimen. */
  SignatureAdminOnly: 'SIGNATURE_ADMIN_ONLY',
  /** The signer has no active specimen yet: name + role + date only. */
  SignatureSpecimenMissing: 'SIGNATURE_SPECIMEN_MISSING',
} as const

export type WorkflowDecisionCode =
  (typeof WORKFLOW_DECISION_CODES)[keyof typeof WORKFLOW_DECISION_CODES]

/** Mirror of DocumentationErrorCodes - the SPECIALISED Documentation layer. */
export const DOCUMENTATION_DECISION_CODES = {
  Allowed: 'ALLOWED',
  NotDocumentationForm: 'NOT_DOCUMENTATION_FORM',
  NotDocumentationUnitMember: 'NOT_DOCUMENTATION_UNIT_MEMBER',
  NotTicketOwnerClerk: 'NOT_TICKET_OWNER_CLERK',
  NotDocumentationLeader: 'NOT_DOCUMENTATION_LEADER',
  ClerkNotAvailable: 'CLERK_NOT_AVAILABLE',
  ClerkAtCapacity: 'CLERK_AT_CAPACITY',
  AssigneeNotClerk: 'ASSIGNEE_NOT_CLERK',
  TicketAlreadyAssigned: 'TICKET_ALREADY_ASSIGNED',
  TicketNotAssigned: 'TICKET_NOT_ASSIGNED',
  TicketClosed: 'TICKET_CLOSED',
  InitiationCategoryNotOthers: 'INITIATION_CATEGORY_NOT_OTHERS',
  AdSoleAuthorityViolation: 'AD_SOLE_AUTHORITY_VIOLATION',
  AdOutsideOwnShop: 'AD_OUTSIDE_OWN_SHOP',
  RegisterLocked: 'REGISTER_LOCKED',
  DirectiveAlreadyIssued: 'DIRECTIVE_ALREADY_ISSUED',
  PermissionMissing: 'PERMISSION_MISSING',
} as const

export type DocumentationDecisionCode =
  (typeof DOCUMENTATION_DECISION_CODES)[keyof typeof DOCUMENTATION_DECISION_CODES]

/**
 * Short, user-facing sentence per code. Used to explain a DISABLED control, which the
 * `message` of a rejected response cannot do because no request was ever sent.
 */
export const DECISION_CODE_MESSAGES: Record<string, string> = {
  ALLOWED: '',
  FORM_NOT_CATALOGUED: 'This form type has no routing definition on the server.',
  NOT_DRAFT_ROLE: 'Your role is not allowed to create this form.',
  ROLE_NOT_ELIGIBLE: 'Your role is not eligible to act on this step.',
  NOT_ASSIGNEE: 'This step is assigned to somebody else.',
  STEP_NOT_ACTIVE: 'That step is not the one currently pending.',
  ASSIGNMENT_REQUIRED: 'An assignee must be selected before this step can start.',
  ASSIGNEE_INVALID_ROLE: 'The selected person does not hold a role eligible for this step.',
  ASSIGNEE_OUTSIDE_SHOP: 'The selected person does not belong to the originating shop.',
  DELEGATE_NOT_LOWER_TIER: 'A step may only be delegated to strictly lower-tier staff.',
  DELEGATION_NOT_ALLOWED: 'This step cannot be delegated.',
  STEP_NOT_SKIPPABLE: 'This step cannot be skipped.',
  SKIP_NOT_PERMITTED: 'Your role does not hold skip authority.',
  REGULATORY_DATE_REACHED:
    'The regulatory target date has been reached: this step can no longer be deferred.',
  COMMENTS_REQUIRED: 'Comments are mandatory for this action.',
  REQUIRED_FIELDS_MISSING: 'Mandatory fields are still empty.',
  CHECKLIST_INCOMPLETE: 'Every checklist item must be verified before the final release.',
  OUTSIDE_OWN_SHOP: 'You may only act on records of your own shop.',
  OUTSIDE_FUNCTIONAL_UNIT: 'This step is owned by a central functional unit.',
  PERMISSION_DENIED: 'You do not have permission to perform this action.',
  INSTANCE_LOCKED: 'The record is locked. Raise an amendment or a revision cycle first.',
  ALREADY_COMPLETED: 'This record is already completed.',
  EXCLUSIVE_DESIGNATION: 'This step is routed exclusively to the designated person.',

  // ----- AMENDED v14 - delegated review -----
  DELEGATED_REVIEW_NOT_ALLOWED: 'This step does not support a delegated review.',
  NOT_DELEGATED_REVIEWER: 'You are not the designated reviewer of this step.',
  DELEGATED_REVIEW_COMMENTS_REQUIRED:
    'The delegated review must include your review comments before it can be confirmed.',

  // ----- AMENDED v18 -----
  SIGNATURE_ADMIN_ONLY: 'Only an Admin may upload or revoke a signature specimen.',
  SIGNATURE_SPECIMEN_MISSING:
    'No signature specimen has been uploaded for this user yet, so the approval is printed with the signer name, role and date only.',

  // ----- Documentation specialised layer -----
  NOT_DOCUMENTATION_FORM: 'The form does not belong to the DOCUMENTATION section.',
  NOT_DOCUMENTATION_UNIT_MEMBER: 'You do not belong to the Documentation Team.',
  NOT_TICKET_OWNER_CLERK: 'The ticket is assigned to a different clerk.',
  NOT_DOCUMENTATION_LEADER: 'Only the Documentation Team Leader may perform this action.',
  CLERK_NOT_AVAILABLE: 'The selected clerk is currently marked unavailable.',
  CLERK_AT_CAPACITY: 'The selected clerk has reached the concurrent-ticket cap.',
  ASSIGNEE_NOT_CLERK: 'The assignee must hold the Documentation Clerk role.',
  TICKET_ALREADY_ASSIGNED: 'The ticket has already been assigned.',
  TICKET_NOT_ASSIGNED: 'The ticket is not on that routing step yet.',
  TICKET_CLOSED: 'The ticket is closed.',
  INITIATION_CATEGORY_NOT_OTHERS: 'MNT-1420A must be initiated under the "Others" category.',
  AD_SOLE_AUTHORITY_VIOLATION: 'The Shop Team Leader holds sole authority over MNT-1420B.',
  AD_OUTSIDE_OWN_SHOP: 'A Shop Team Leader may only act on the directives of his own shop.',
  REGISTER_LOCKED: 'The register line was signed off and is locked.',
  DIRECTIVE_ALREADY_ISSUED: 'The directive has already been issued.',
  PERMISSION_MISSING: 'A required permission is missing.',
}

export function decisionCodeMessage(code?: string | null): string {
  if (!code) return ''
  return DECISION_CODE_MESSAGES[code] ?? code
}

// =====================================================================================
// 2. DECISION RESULT  (mirror of WorkflowAccessDecision / DocumentationAccessDecision)
// =====================================================================================

export interface AccessDecision {
  allowed: boolean
  /** WORKFLOW_DECISION_CODES / DOCUMENTATION_DECISION_CODES value. */
  code: string
  /** Message safe to render in a tooltip or a toast. */
  reason: string
}

export function allow(): AccessDecision {
  return { allowed: true, code: WORKFLOW_DECISION_CODES.Allowed, reason: '' }
}

export function deny(code: string, reason?: string): AccessDecision {
  return { allowed: false, code, reason: reason || decisionCodeMessage(code) }
}

/** First denial of a list, or an allow when every decision passed. */
export function firstDenial(...decisions: AccessDecision[]): AccessDecision {
  for (const decision of decisions) {
    if (!decision.allowed) return decision
  }
  return allow()
}

// =====================================================================================
// 3. THE ACTOR  (mirror of WorkflowActorContext)
//    Built ONCE per session from GET /api/workflow/permissions/me, so the effective
//    permission list is the SERVER's list and is never recomputed from the role alone.
// =====================================================================================

export interface WorkflowActor {
  /** C# long. */
  userId: number
  /** Raw role from the JWT / Users row; may be a legacy alias. */
  role?: string | null
  /** C# Guid, therefore string. */
  shopId?: string | null
  departmentId?: string | null
  /**
   * Effective permissions from GET /api/workflow/permissions/me
   * ((defaults + AdditionalPermissions) - RevokedPermissions).
   * When undefined the local DEFAULT_PERMISSIONS fallback is used.
   */
  permissions?: string[] | null
  /** Users.AdditionalPermissions CSV - offline fallback only. */
  additionalPermissionsCsv?: string | null
  /** Users.RevokedPermissions CSV - offline fallback only. */
  revokedPermissionsCsv?: string | null
}

/** Canonical OrgRoles value, or null when the role is unknown. */
export function actorRole(actor: WorkflowActor): string | null {
  return normalizeRole(actor.role)
}

export function isAdmin(actor: WorkflowActor): boolean {
  return actorRole(actor) === ORG_ROLES.Admin
}

export function actorFunctionalUnit(actor: WorkflowActor): string | null {
  return functionalUnitOf(actor.role)
}

export function actorLeadsFunctionalUnit(actor: WorkflowActor): boolean {
  return leadsFunctionalUnit(actor.role)
}

export function actorRank(actor: WorkflowActor): number {
  return rankOf(actor.role)
}

export function actorIsInUnit(actor: WorkflowActor, unit?: string | null): boolean {
  return isInFunctionalUnit(actor.role, unit)
}

/** Mirror of WorkflowActorContext.EffectivePermissions. */
export function actorPermissions(actor: WorkflowActor): string[] {
  if (Array.isArray(actor.permissions) && actor.permissions.length > 0) {
    return actor.permissions
  }
  return effectivePermissions(
    actor.role,
    actor.additionalPermissionsCsv,
    actor.revokedPermissionsCsv,
  )
}

/** Mirror of WorkflowActorContext.Has - the Admin short-circuit is intentional. */
export function actorHas(actor: WorkflowActor, permission: string): boolean {
  if (isAdmin(actor)) return true
  return actorPermissions(actor).includes(permission)
}

/** Preferred constructor: GET /api/workflow/permissions/me. */
export function actorFromMyPermissions(me: MyPermissionsResponse): WorkflowActor {
  return {
    userId: me.userId,
    role: me.role,
    shopId: me.shopId ?? null,
    departmentId: me.departmentId ?? null,
    permissions: me.permissions ?? [],
  }
}

/** Offline fallback constructor for the auth-store user shape. */
export function actorFromUser(user: {
  userId?: number | string | null
  id?: number | string | null
  role?: string | null
  shopId?: string | null
  departmentId?: string | null
  additionalPermissions?: string | null
  revokedPermissions?: string | null
}): WorkflowActor {
  const raw = user.userId ?? user.id ?? 0
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10)
  return {
    userId: Number.isFinite(parsed) && parsed > 0 ? parsed : 0,
    role: user.role ?? null,
    shopId: user.shopId ?? null,
    departmentId: user.departmentId ?? null,
    permissions: null,
    additionalPermissionsCsv: user.additionalPermissions ?? null,
    revokedPermissionsCsv: user.revokedPermissions ?? null,
  }
}

// =====================================================================================
// 4. NORMALISED STEP AND INSTANCE FACTS
//    The catalog delivers step enums as STRINGS, a running instance as NUMBERS. Both are
//    normalised here so every rule below reads ONE shape.
// =====================================================================================

/** Mirror of WorkflowStepDefinition, reduced to what a client rule actually needs. */
export interface StepFacts {
  stepNo: number
  title: string
  kind: WorkflowStepKind
  /** Status the record sits in WHILE the step is pending. */
  pendingStatus: ApprovalStatus
  eligibleRoles: string[]
  requiresManualAssignment: boolean
  assignerRoles: string[]
  assignmentUnit: string | null
  skipMode: SkipMode
  skipConditionField: string | null
  restrictToOriginatorShop: boolean
  allowsDelegation: boolean
  requiresComments: boolean
  isStepByStepChecklist: boolean
  /** FormDataJson keys that must be filled before the step can be completed. */
  requiredFields: string[]

  // ----- AMENDED v14 - delegated review (the approver KEEPS the approval) -----
  /** True when this step's approver may borrow a delegated reviewer. */
  allowsDelegatedReview: boolean
  /** Canonical roles eligible to act as the delegated reviewer of this step. */
  delegatedReviewRoles: string[]
  /** The reviewer must write a review comment before he may confirm. */
  delegatedReviewRequiresComments: boolean

  /**
   * AMENDED v18 (requirement #13) - the printed caption this step stamps.
   * `SignatureBlockType.None` means the step leaves no signature cell on the form.
   */
  signatureBlock: SignatureBlockType
  signatureCaption: string
}

function enumValueFrom(
  enumObject: Record<string, string | number>,
  value: unknown,
  fallback: number,
): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return enumObject[String(value)] !== undefined ? value : fallback
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const raw = value.trim()
    const numeric = Number.parseInt(raw, 10)
    if (Number.isFinite(numeric) && String(numeric) === raw) {
      return enumValueFrom(enumObject, numeric, fallback)
    }
    const hit = Object.keys(enumObject).find(
      key => Number.isNaN(Number(key)) && key.toLowerCase() === raw.toLowerCase(),
    )
    if (hit) {
      const resolved = enumObject[hit]
      if (typeof resolved === 'number') return resolved
    }
  }
  return fallback
}

export function parseStepKind(value: unknown): WorkflowStepKind {
  return enumValueFrom(
    WorkflowStepKind as unknown as Record<string, string | number>,
    value,
    WorkflowStepKind.Approval,
  ) as WorkflowStepKind
}

export function parseApprovalStatus(value: unknown): ApprovalStatus {
  return enumValueFrom(
    ApprovalStatus as unknown as Record<string, string | number>,
    value,
    ApprovalStatus.Draft,
  ) as ApprovalStatus
}

export function parseSkipMode(value: unknown): SkipMode {
  return enumValueFrom(
    SkipMode as unknown as Record<string, string | number>,
    value,
    SkipMode.NotSkippable,
  ) as SkipMode
}

/**
 * AMENDED v18 - the CATALOG endpoint serialises only `signatureCaption` ("Approved by"),
 * never the numeric block. This maps the printed caption BACK to the enum so a
 * Table-of-Contents row can reserve the correct cell before the step is executed.
 */
export function signatureBlockFromCaption(caption?: string | null): SignatureBlockType {
  const needle = (caption ?? '').trim().toLowerCase()
  if (needle === '') return SignatureBlockType.None

  const entries = Object.entries(SIGNATURE_CAPTIONS) as Array<[string, string]>
  for (const [key, value] of entries) {
    if (value && value.trim().toLowerCase() === needle) {
      return Number(key) as SignatureBlockType
    }
  }
  return SignatureBlockType.None
}

/** AMENDED v18 - the STEP KIND a caption is normally produced by, used as a last resort. */
export function signatureBlockForKind(kind: WorkflowStepKind): SignatureBlockType {
  switch (kind) {
    case WorkflowStepKind.Draft:
      return SignatureBlockType.PreparedBy
    case WorkflowStepKind.Processing:
      return SignatureBlockType.ProcessedBy
    case WorkflowStepKind.Verification:
      return SignatureBlockType.VerifiedBy
    case WorkflowStepKind.Review:
      return SignatureBlockType.ReviewedBy
    case WorkflowStepKind.Approval:
      return SignatureBlockType.ApprovedBy
    case WorkflowStepKind.SignOff:
      return SignatureBlockType.SignedOffBy
    case WorkflowStepKind.Endorsement:
      return SignatureBlockType.EndorsedBy
    case WorkflowStepKind.Gate:
      return SignatureBlockType.VerifiedBy
    default:
      return SignatureBlockType.None
  }
}

function nonEmptyUnit(value?: string | null): string | null {
  return value && value.trim() !== '' ? value.trim() : null
}

function stringArray(value?: string[] | null): string[] {
  return Array.isArray(value) ? value.filter(x => typeof x === 'string' && x.trim() !== '') : []
}

/**
 * Normalises a CATALOG step (string enums).
 * AMENDED v18: `requiredFields`, `requiresComments`, `isStepByStepChecklist` and the
 * signature block are now READ instead of being hardcoded.
 */
export function stepFactsFromCatalog(step: CatalogStepResponse): StepFacts {
  const eligible = step.eligibleRoles ?? []
  const kind = parseStepKind(step.kind)

  const captionBlock = signatureBlockFromCaption(step.signatureCaption)
  const block =
    captionBlock !== SignatureBlockType.None ? captionBlock : signatureBlockForKind(kind)

  return {
    stepNo: step.stepNo,
    title: step.title ?? '',
    kind,
    pendingStatus: parseApprovalStatus(step.status),
    eligibleRoles: eligible,
    requiresManualAssignment: step.requiresManualAssignment === true,
    assignerRoles:
      step.assignerRoles && step.assignerRoles.length > 0 ? step.assignerRoles : eligible,
    assignmentUnit: nonEmptyUnit(step.assignmentUnit),
    skipMode: parseSkipMode(step.skipMode),
    skipConditionField: step.skipConditionField ?? null,
    restrictToOriginatorShop: step.restrictToOriginatorShop === true,
    allowsDelegation: step.allowsDelegation !== false,

    // ===== AMENDED v14 - delegated review =====
    allowsDelegatedReview: step.allowsDelegatedReview === true,
    delegatedReviewRoles: stringArray(step.delegatedReviewRoles),
    delegatedReviewRequiresComments: step.delegatedReviewRequiresComments !== false,

    // ===== AMENDED v18 =====
    requiresComments: step.requiresComments === true,
    isStepByStepChecklist: step.isStepByStepChecklist === true,
    requiredFields: stringArray(step.requiredFields),
    signatureBlock: block,
    signatureCaption: step.signatureCaption || captionOfBlock(block),
  }
}

/**
 * Normalises a RUNNING step (numeric enums + per-user capability flags).
 * AMENDED v18: `requiredFields` is now READ, and the signature block comes straight off
 * the response.
 */
export function stepFactsFromInstanceStep(step: WorkflowStepResponse): StepFacts {
  const eligible = step.eligibleRoles ?? []
  const kind = parseStepKind(step.kind)

  const block =
    typeof step.signatureBlock === 'number'
      ? step.signatureBlock
      : signatureBlockFromCaption(step.signatureCaption)

  return {
    stepNo: step.stepNo,
    title: step.title ?? '',
    kind,
    pendingStatus: parseApprovalStatus(step.pendingStatus),
    eligibleRoles: eligible,
    requiresManualAssignment: step.requiresManualAssignment === true,
    assignerRoles:
      step.assignerRoles && step.assignerRoles.length > 0 ? step.assignerRoles : eligible,
    assignmentUnit: nonEmptyUnit(step.assignmentUnit),
    skipMode: parseSkipMode(step.skipMode),
    skipConditionField: step.skipConditionField ?? null,
    restrictToOriginatorShop: step.restrictToOriginatorShop === true,
    allowsDelegation: step.allowsDelegation !== false,

    // ===== AMENDED v14 - delegated review =====
    allowsDelegatedReview: step.allowsDelegatedReview === true,
    delegatedReviewRoles: stringArray(step.delegatedReviewRoles),
    delegatedReviewRequiresComments: step.delegatedReviewRequiresComments !== false,

    requiresComments: step.requiresComments === true,
    isStepByStepChecklist: step.isStepByStepChecklist === true,

    // ===== AMENDED v18 =====
    requiredFields: stringArray(step.requiredFields),
    signatureBlock: block,
    signatureCaption: step.signatureCaption || captionOfBlock(block),
  }
}

/** Mirror of WorkflowInstanceFacts. Entity ids are strings, user ids numbers. */
export interface InstanceFacts {
  instanceId: string
  formType: string
  status: ApprovalStatus
  currentStepNo: number
  currentAssigneeUserId?: number | null
  currentAssignmentUnit?: string | null
  originatorUserId: number
  /** Shop of the originator, frozen at draft time. */
  originatorShopId?: string | null
  evaluationFolderId?: string | null
  isComplete: boolean
  isLocked: boolean
  /** Drives the 918 / 918A "Optional / May Skip Now" flag. ISO string or null. */
  regulatoryTargetDate?: string | null
  /** Exclusive designation (MNT-1378 Inspector, MNT-922C Technician). */
  designatedUserId?: number | null
  /** Mandatory checklist items still unverified on a Gate step. */
  outstandingChecklistItems: number
  /** The steps of the instance, so a rule never needs a second fetch. */
  steps: StepFacts[]
  /** AMENDED v18 - the signature rows already stamped on this instance. */
  signatures: FormSignatureResponse[]
}

/** Builds the facts from GET /api/workflow/forms/{instanceId}. */
export function instanceFactsFrom(instance: WorkflowInstanceResponse): InstanceFacts {
  const steps = (instance.steps ?? []).map(stepFactsFromInstanceStep)
  const pending = (instance.steps ?? []).find(s => s.stepNo === instance.currentStepNo)
  const outstanding = pending
    ? Math.max(0, (pending.checklistTotalItems ?? 0) - (pending.checklistVerifiedItems ?? 0))
    : 0

  return {
    instanceId: instance.id,
    formType: instance.formType,
    status: instance.status,
    currentStepNo: instance.currentStepNo,
    currentAssigneeUserId: instance.currentAssigneeUserId ?? null,
    currentAssignmentUnit: nonEmptyUnit(instance.currentAssignmentUnit),
    originatorUserId: instance.originatorUserId,
    originatorShopId: instance.shopId ?? null,
    evaluationFolderId: instance.evaluationFolderId ?? null,
    isComplete: instance.isComplete === true,
    isLocked: instance.isLocked === true,
    regulatoryTargetDate: instance.regulatoryTargetDate ?? null,
    designatedUserId: instance.currentAssigneeUserId ?? null,
    outstandingChecklistItems: outstanding,
    steps,
    signatures: instance.signatures ?? [],
  }
}

/**
 * Partial facts from an INBOX row. An inbox row carries no step table, so the catalog is
 * used to recover it; the resolvers of section 9 prefer the row's own server flags anyway.
 */
export function instanceFactsFromInbox(
  row: InboxItemResponse,
  catalog?: CatalogFormResponse[] | null,
): InstanceFacts {
  return {
    instanceId: row.instanceId,
    formType: row.formType,
    status: row.status,
    currentStepNo: row.stepNo,
    currentAssigneeUserId: null,
    currentAssignmentUnit: nonEmptyUnit(row.assignmentUnit),
    originatorUserId: 0,
    originatorShopId: null,
    evaluationFolderId: row.evaluationFolderId ?? null,
    isComplete: false,
    isLocked: false,
    regulatoryTargetDate: null,
    designatedUserId: null,
    outstandingChecklistItems: 0,
    steps: catalogStepFacts(catalog, row.formType),
    signatures: [],
  }
}

export function stepAt(facts: InstanceFacts, stepNo?: number | null): StepFacts | null {
  const target = stepNo ?? facts.currentStepNo
  return facts.steps.find(s => s.stepNo === target) ?? null
}

export function findCatalogForm(
  catalog: CatalogFormResponse[] | null | undefined,
  formType?: string | null,
): CatalogFormResponse | null {
  if (!catalog || !formType) return null
  const needle = formType.trim().toLowerCase()
  return catalog.find(f => (f.formType ?? '').trim().toLowerCase() === needle) ?? null
}

export function catalogStepFacts(
  catalog: CatalogFormResponse[] | null | undefined,
  formType?: string | null,
): StepFacts[] {
  const definition = findCatalogForm(catalog, formType)
  return definition ? (definition.steps ?? []).map(stepFactsFromCatalog) : []
}

// =====================================================================================
// 5. THE TWO COLUMNS THE CATALOG DOES NOT CARRY
//    Exact mirrors of WorkflowPermissionMatrix.PermissionForStep /
//    AssignPermissionForStep / ScopeForStep. Any change here MUST be made in the .cs too.
// =====================================================================================

/** Mirror of WorkflowPermissionMatrix.PermissionForStep. */
export function permissionForStep(step: StepFacts): string {
  switch (step.kind) {
    case WorkflowStepKind.Draft:
      return PERMISSIONS.CreateForm
    case WorkflowStepKind.Assignment:
      return PERMISSIONS.AssignFormStep
    case WorkflowStepKind.Processing:
      return PERMISSIONS.EditForm
    case WorkflowStepKind.Verification:
      return step.pendingStatus === ApprovalStatus.PendingHRVerification
        ? PERMISSIONS.VerifyTraining
        : PERMISSIONS.EditForm
    case WorkflowStepKind.Review:
      return PERMISSIONS.ApproveForm
    case WorkflowStepKind.Approval:
      if (step.pendingStatus === ApprovalStatus.PendingHRManagerApproval) {
        return PERMISSIONS.ApproveTraining
      }
      if (step.pendingStatus === ApprovalStatus.PendingAmendmentApproval) {
        return PERMISSIONS.AmendExpiredRecord
      }
      return PERMISSIONS.ApproveForm
    case WorkflowStepKind.SignOff:
      return step.pendingStatus === ApprovalStatus.PendingDocumentationLeaderSignOff
        ? PERMISSIONS.SignOffDocumentation
        : PERMISSIONS.SignOffForm
    case WorkflowStepKind.Endorsement:
      return PERMISSIONS.ApproveForm
    case WorkflowStepKind.Gate:
      return PERMISSIONS.ApproveForm
    case WorkflowStepKind.Conditional:
      return PERMISSIONS.EditForm
    default:
      return PERMISSIONS.ApproveForm
  }
}

/** Mirror of WorkflowPermissionMatrix.AssignPermissionForStep. */
export function assignPermissionForStep(step: StepFacts): string {
  const isDocumentationUnit =
    !!step.assignmentUnit &&
    step.assignmentUnit.toLowerCase() === FUNCTIONAL_UNITS.Documentation.toLowerCase()
  return isDocumentationUnit
    ? PERMISSIONS.AssignDocumentationClerk
    : PERMISSIONS.AssignFormStep
}

/** Mirror of WorkflowPermissionMatrix.ScopeForStep. */
export function scopeForStep(step: StepFacts): string {
  if (step.assignmentUnit) {
    if (step.requiresManualAssignment) return WORKFLOW_SCOPES.FunctionalUnit

    return step.kind === WorkflowStepKind.Processing ||
      step.kind === WorkflowStepKind.Verification
      ? WORKFLOW_SCOPES.AssignedOnly
      : WORKFLOW_SCOPES.FunctionalUnit
  }

  if (
    step.pendingStatus === ApprovalStatus.PendingInspectorReview ||
    step.pendingStatus === ApprovalStatus.PendingInspectorApproval ||
    step.pendingStatus === ApprovalStatus.PendingTechnicianSignOff
  ) {
    return WORKFLOW_SCOPES.DesignatedOnly
  }

  if (step.restrictToOriginatorShop) return WORKFLOW_SCOPES.OwnShop

  if (
    step.pendingStatus === ApprovalStatus.PendingManagerApproval ||
    step.pendingStatus === ApprovalStatus.PendingDirectorApproval ||
    step.pendingStatus === ApprovalStatus.PendingFinalSignOff
  ) {
    return WORKFLOW_SCOPES.Department
  }

  return WORKFLOW_SCOPES.Global
}

// =====================================================================================
// 6. ROLE GATES  (mirror of the FormWorkflowCatalog role helpers, catalog-driven)
// =====================================================================================

function containsRole(roles: string[] | null | undefined, role: string | null): boolean {
  if (!role || !roles) return false
  return roles.some(r => normalizeRole(r) === role)
}

/** Mirror of FormWorkflowCatalog.CanActOnStep - role gate only. */
export function roleCanActOnStep(role: string | null | undefined, step: StepFacts): boolean {
  const canonical = normalizeRole(role)
  if (!canonical) return false
  if (canonical === ORG_ROLES.Admin) return true
  return containsRole(step.eligibleRoles, canonical)
}

/** Mirror of FormWorkflowCatalog.CanAssignStep - role gate only. */
export function roleCanAssignStep(role: string | null | undefined, step: StepFacts): boolean {
  const canonical = normalizeRole(role)
  if (!canonical) return false
  if (canonical === ORG_ROLES.Admin) return true
  const assigners = step.assignerRoles.length > 0 ? step.assignerRoles : step.eligibleRoles
  return containsRole(assigners, canonical)
}

/** Mirror of FormWorkflowCatalog.CanDraft - role gate only. */
export function roleCanDraftForm(
  role: string | null | undefined,
  form: CatalogFormResponse | null,
): boolean {
  const canonical = normalizeRole(role)
  if (!canonical || !form) return false
  if (canonical === ORG_ROLES.Admin) return true
  if (form.isGeneratedByJointApproval) return false
  return containsRole(form.draftRoles, canonical)
}

/** Mirror of FormWorkflowCatalog.CanDelegateStep - role + strictly-lower-tier rule. */
export function roleCanDelegateStep(
  actorRoleValue: string | null | undefined,
  delegateRoleValue: string | null | undefined,
  step: StepFacts,
): boolean {
  if (!step.allowsDelegation) return false

  const actor = normalizeRole(actorRoleValue)
  const target = normalizeRole(delegateRoleValue)
  if (!actor || !target) return false
  if (actor === ORG_ROLES.Admin) return true
  if (!DELEGATION_ROLES.some(r => r === actor)) return false

  return rankOf(target) > rankOf(actor)
}

/**
 * AMENDED v14 - mirror of FormWorkflowCatalog.CanRequestDelegatedReview (role layer):
 * the step must declare a usable reviewer pool, the role must be a delegated-review
 * REQUESTER (Director / QA Manager / ECAA Team / HR Manager / DL / Manager) and an
 * eligible EXECUTOR of that very step, i.e. it really owns the approval it is about to
 * keep. Admin bypasses the role gates.
 */
export function roleCanRequestDelegatedReview(
  role: string | null | undefined,
  step: StepFacts,
): boolean {
  if (!step.allowsDelegatedReview || step.delegatedReviewRoles.length === 0) return false
  const canonical = normalizeRole(role)
  if (!canonical) return false
  if (canonical === ORG_ROLES.Admin) return true
  if (!canRequestDelegatedReview(canonical)) return false
  return containsRole(step.eligibleRoles, canonical)
}

/**
 * AMENDED v14 - mirror of FormWorkflowCatalog.CanActAsDelegatedReviewer: the step's own
 * DelegatedReviewRoles pool wins, and the role must additionally be allowed to confirm at
 * all (RoleHierarchy.DelegatedReviewerRoles / Permissions.ConfirmDelegatedReview).
 */
export function roleCanActAsDelegatedReviewer(
  role: string | null | undefined,
  step: StepFacts,
): boolean {
  if (step.delegatedReviewRoles.length === 0) return false
  const canonical = normalizeRole(role)
  if (!canonical) return false
  if (canonical === ORG_ROLES.Admin) return true
  if (!canConfirmDelegatedReview(canonical)) return false
  return containsRole(step.delegatedReviewRoles, canonical)
}

/** Mirror of FormWorkflowCatalog.CanSkipManually - step SkipMode + role authority. */
export function roleCanSkipManually(
  role: string | null | undefined,
  step: StepFacts,
): boolean {
  if (!isManuallySkippable(step.skipMode)) return false
  const canonical = normalizeRole(role)
  if (!canonical) return false
  if (canonical === ORG_ROLES.Admin) return true
  return canSkipSteps(canonical)
}

/** Mirror of FormWorkflowCatalog.MaySkipByRegulatoryDate. */
export function maySkipByRegulatoryDate(
  step: StepFacts,
  regulatoryTargetDate?: string | null,
  now: Date = new Date(),
): boolean {
  if (step.skipMode !== SkipMode.RegulatoryDate) return false
  if (!regulatoryTargetDate) return true
  const target = new Date(regulatoryTargetDate)
  if (Number.isNaN(target.getTime())) return true
  return target.getTime() > now.getTime()
}

/**
 * FormDataJson keys required before the DRAFT may be submitted.
 * AMENDED v18: the `as unknown as { requiredDraftFields?: string[] }` cast of v14 is gone,
 * because CatalogFormResponse now declares the member.
 */
export function draftRequiredFieldsOf(form: CatalogFormResponse | null): string[] {
  if (!form) return []
  return stringArray(form.requiredDraftFields)
}

/** Mirror of FormWorkflowCatalog.MissingRequiredFields. */
export function missingRequiredFields(
  requiredFields: string[] | null | undefined,
  formFields: Record<string, unknown> | null | undefined,
): string[] {
  if (!requiredFields || requiredFields.length === 0) return []
  const source = formFields ?? {}
  return requiredFields.filter(key => {
    const value = source[key]
    if (value === undefined || value === null) return true
    if (typeof value === 'string') return value.trim() === ''
    if (Array.isArray(value)) return value.length === 0
    return false
  })
}

/**
 * AMENDED v18 - convenience for a form editor: parse `formDataJson` once and hand the
 * object to `canDraft()` / `validateDecisionPayload()`. A malformed JSON string yields an
 * empty object rather than throwing, so the pre-flight degrades to "nothing filled" and
 * the user gets the field list instead of a crash.
 */
export function parseFormFields(formDataJson?: string | null): Record<string, unknown> {
  if (!formDataJson || formDataJson.trim() === '') return {}
  try {
    const parsed = JSON.parse(formDataJson)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

// =====================================================================================
// 7. DECISION FUNCTIONS  (mirror of WorkflowPermissionMatrix section 3)
// =====================================================================================

/** May the actor create a draft of this form? Mirror of CanDraft. */
export function canDraft(
  actor: WorkflowActor,
  form: CatalogFormResponse | null,
  formFields?: Record<string, unknown> | null,
): AccessDecision {
  if (!form) return deny(WORKFLOW_DECISION_CODES.FormNotCatalogued)

  if (!roleCanDraftForm(actor.role, form)) {
    return deny(
      WORKFLOW_DECISION_CODES.NotDraftRole,
      `${roleLabel(actor.role)} may not draft ${form.formNo || form.formType}.`,
    )
  }

  if (!actorHas(actor, PERMISSIONS.CreateForm)) {
    return deny(
      WORKFLOW_DECISION_CODES.PermissionDenied,
      `The '${PERMISSIONS.CreateForm}' permission is missing.`,
    )
  }

  if (formFields) {
    const missing = missingRequiredFields(draftRequiredFieldsOf(form), formFields)
    if (missing.length > 0) {
      return deny(
        WORKFLOW_DECISION_CODES.RequiredFieldsMissing,
        `Missing required draft fields: ${missing.join(', ')}.`,
      )
    }
  }

  return allow()
}

/**
 * May the actor EXECUTE the pending step? Mirror of CanActOnStep - the central gate:
 * role + permission + scope + assignment / designation ownership.
 */
export function canActOnStep(
  actor: WorkflowActor,
  facts: InstanceFacts,
  stepNo?: number | null,
): AccessDecision {
  if (isAdmin(actor)) return allow()

  const targetStepNo = stepNo ?? facts.currentStepNo
  const step = stepAt(facts, targetStepNo)

  if (!step) {
    return deny(WORKFLOW_DECISION_CODES.StepNotActive, 'The step does not exist on this form.')
  }

  if (facts.isLocked) return deny(WORKFLOW_DECISION_CODES.InstanceLocked)
  if (facts.isComplete) return deny(WORKFLOW_DECISION_CODES.AlreadyCompleted)

  if (targetStepNo !== facts.currentStepNo) {
    return deny(
      WORKFLOW_DECISION_CODES.StepNotActive,
      `Step ${targetStepNo} is not the pending step (currently ${facts.currentStepNo}).`,
    )
  }

  // AMENDED v14 - inside the delegated-review excursion the REVIEWER pool of the current
  // step acts (mirror of FormWorkflowCatalog.ApproverRolesFor), and the verb is CONFIRM,
  // not approve: the approver resumes only after the reviewer confirms.
  const awaitingReview = isAwaitingDelegatedReview(facts.status)
  const roleOk = awaitingReview
    ? roleCanActAsDelegatedReviewer(actor.role, step)
    : roleCanActOnStep(actor.role, step)

  if (!roleOk) {
    return deny(
      WORKFLOW_DECISION_CODES.RoleNotEligible,
      awaitingReview
        ? `${roleLabel(actor.role)} is not the delegated reviewer of step ${step.stepNo}.`
        : `${roleLabel(actor.role)} is not eligible for step ${step.stepNo} ("${step.title}").`,
    )
  }

  const permission = awaitingReview ? PERMISSIONS.ConfirmDelegatedReview : permissionForStep(step)
  if (!actorHas(actor, permission)) {
    return deny(
      WORKFLOW_DECISION_CODES.PermissionDenied,
      `The '${permission}' permission is missing.`,
    )
  }

  // The reviewer pool is role-scoped, not shop / unit scoped (mirror of
  // FormWorkflowCatalog.CanActAsDelegatedReviewer, which applies no scope rule).
  if (!awaitingReview) {
    const scopeDecision = checkScope(actor, facts, step)
    if (!scopeDecision.allowed) return scopeDecision
  }

  if (step.kind === WorkflowStepKind.Gate && facts.outstandingChecklistItems > 0) {
    return deny(
      WORKFLOW_DECISION_CODES.ChecklistIncomplete,
      `${facts.outstandingChecklistItems} mandatory checklist items are still unverified.`,
    )
  }

  return allow()
}

/** Mirror of WorkflowPermissionMatrix.CheckScope. */
export function checkScope(
  actor: WorkflowActor,
  facts: InstanceFacts,
  step: StepFacts,
): AccessDecision {
  if (isAdmin(actor)) return allow()

  switch (scopeForStep(step)) {
    case WORKFLOW_SCOPES.OwnShop:
      if (facts.originatorShopId && (!actor.shopId || actor.shopId !== facts.originatorShopId)) {
        return deny(
          WORKFLOW_DECISION_CODES.OutsideOwnShop,
          'The step is restricted to the originating shop.',
        )
      }
      break

    case WORKFLOW_SCOPES.FunctionalUnit:
      if (!actorIsInUnit(actor, step.assignmentUnit)) {
        return deny(
          WORKFLOW_DECISION_CODES.OutsideFunctionalUnit,
          `The step is owned by the ${functionalUnitLabel(step.assignmentUnit)}.`,
        )
      }
      break

    case WORKFLOW_SCOPES.AssignedOnly: {
      // The unit leader may always intervene on his own unit's record.
      if (actorLeadsFunctionalUnit(actor) && actorIsInUnit(actor, step.assignmentUnit)) break

      if (!actorIsInUnit(actor, step.assignmentUnit)) {
        return deny(
          WORKFLOW_DECISION_CODES.OutsideFunctionalUnit,
          `The step is owned by the ${functionalUnitLabel(step.assignmentUnit)}.`,
        )
      }

      if (facts.currentAssigneeUserId === null || facts.currentAssigneeUserId === undefined) {
        return deny(
          WORKFLOW_DECISION_CODES.AssignmentRequired,
          'The step has not been assigned yet.',
        )
      }

      if (facts.currentAssigneeUserId !== actor.userId) {
        return deny(WORKFLOW_DECISION_CODES.NotAssignee)
      }
      break
    }

    case WORKFLOW_SCOPES.DesignatedOnly: {
      if (facts.designatedUserId === null || facts.designatedUserId === undefined) {
        return deny(
          WORKFLOW_DECISION_CODES.AssignmentRequired,
          'No designated actor has been chosen yet.',
        )
      }

      if (facts.designatedUserId !== actor.userId) {
        return deny(
          WORKFLOW_DECISION_CODES.ExclusiveDesignation,
          `This step is routed exclusively to the designated ${roleLabel(step.eligibleRoles[0])}.`,
        )
      }
      break
    }

    default:
      break
  }

  return allow()
}

/** May the actor ASSIGN or RE-ASSIGN the pending step? Mirror of CanAssignStep. */
export function canAssignStep(
  actor: WorkflowActor,
  facts: InstanceFacts,
  stepNo?: number | null,
): AccessDecision {
  if (isAdmin(actor)) return allow()

  const step = stepAt(facts, stepNo)
  if (!step) {
    return deny(WORKFLOW_DECISION_CODES.StepNotActive, 'The step does not exist on this form.')
  }

  if (facts.isLocked) return deny(WORKFLOW_DECISION_CODES.InstanceLocked)

  if (!roleCanAssignStep(actor.role, step)) {
    return deny(
      WORKFLOW_DECISION_CODES.RoleNotEligible,
      `${roleLabel(actor.role)} may not assign step ${step.stepNo}.`,
    )
  }

  const permission = assignPermissionForStep(step)
  if (!actorHas(actor, permission)) {
    return deny(
      WORKFLOW_DECISION_CODES.PermissionDenied,
      `The '${permission}' permission is missing.`,
    )
  }

  // A shop-scoped step may only be assigned from inside the originating shop.
  if (
    !step.assignmentUnit &&
    step.restrictToOriginatorShop &&
    facts.originatorShopId &&
    (!actor.shopId || actor.shopId !== facts.originatorShopId)
  ) {
    // "A Special Team Leader can assign records or update entries directly": he is
    // department scoped, so the shop rule deliberately does not apply to him.
    if (actorRole(actor) !== ORG_ROLES.SpecialTeamLeader) {
      return deny(
        WORKFLOW_DECISION_CODES.OutsideOwnShop,
        'Assignment is restricted to the originating shop.',
      )
    }
  }

  return allow()
}

/** The proposed assignee, as far as the client knows him. */
export interface AssigneeCandidate {
  userId: number
  role?: string | null
  shopId?: string | null
  /** Derived from the role when omitted. */
  functionalUnit?: string | null
}

/** Mirror of WorkflowPermissionMatrix.IsValidAssignee. */
export function isValidAssignee(
  facts: InstanceFacts,
  stepNo: number,
  candidate: AssigneeCandidate,
): AccessDecision {
  const step = stepAt(facts, stepNo)
  if (!step) {
    return deny(WORKFLOW_DECISION_CODES.StepNotActive, 'The step does not exist on this form.')
  }

  const canonical = normalizeRole(candidate.role)
  if (!canonical || !containsRole(step.eligibleRoles, canonical)) {
    return deny(
      WORKFLOW_DECISION_CODES.AssigneeInvalidRole,
      `The assignee role is not eligible for step ${stepNo}.`,
    )
  }

  if (step.assignmentUnit) {
    const unit = candidate.functionalUnit ?? functionalUnitOf(candidate.role)
    if (!unit || unit.toLowerCase() !== step.assignmentUnit.toLowerCase()) {
      return deny(
        WORKFLOW_DECISION_CODES.OutsideFunctionalUnit,
        `The assignee must belong to the ${functionalUnitLabel(step.assignmentUnit)}.`,
      )
    }
    return allow()
  }

  if (
    step.restrictToOriginatorShop &&
    facts.originatorShopId &&
    (!candidate.shopId || candidate.shopId !== facts.originatorShopId)
  ) {
    return deny(WORKFLOW_DECISION_CODES.AssigneeOutsideShop)
  }

  return allow()
}

/**
 * May the actor DELEGATE the pending step to lower-tier staff?
 * "Shop Team Leaders can assign these to lower-tier staff if workload is high."
 */
export function canDelegateStep(
  actor: WorkflowActor,
  facts: InstanceFacts,
  candidate: AssigneeCandidate,
  stepNo?: number | null,
): AccessDecision {
  if (isAdmin(actor)) return allow()

  const step = stepAt(facts, stepNo)
  if (!step) {
    return deny(WORKFLOW_DECISION_CODES.StepNotActive, 'The step does not exist on this form.')
  }

  if (!step.allowsDelegation) {
    return deny(
      WORKFLOW_DECISION_CODES.DelegationNotAllowed,
      `Step ${step.stepNo} may not be delegated.`,
    )
  }

  if (!actorHas(actor, PERMISSIONS.DelegateForm)) {
    return deny(
      WORKFLOW_DECISION_CODES.PermissionDenied,
      `The '${PERMISSIONS.DelegateForm}' permission is missing.`,
    )
  }

  if (!roleCanDelegateStep(actor.role, candidate.role, step)) {
    return deny(
      WORKFLOW_DECISION_CODES.DelegateNotLowerTier,
      `The delegate must be strictly less senior than ${roleLabel(actor.role)}.`,
    )
  }

  if (
    !step.assignmentUnit &&
    step.restrictToOriginatorShop &&
    facts.originatorShopId &&
    (!candidate.shopId || candidate.shopId !== facts.originatorShopId)
  ) {
    return deny(
      WORKFLOW_DECISION_CODES.AssigneeOutsideShop,
      'The delegate must belong to the originating shop.',
    )
  }

  return allow()
}

/**
 * "May I delegate at all" without naming a delegate yet - used to render the Delegate
 * button before the user picks somebody. Mirror of CanDelegateStepGeneric.
 */
export function canDelegateStepGeneric(
  actor: WorkflowActor,
  facts: InstanceFacts,
  stepNo?: number | null,
): boolean {
  const step = stepAt(facts, stepNo)
  if (!step || !step.allowsDelegation) return false
  if (isAdmin(actor)) return true
  if (!actorHas(actor, PERMISSIONS.DelegateForm)) return false

  const canonical = actorRole(actor)
  if (!canonical) return false

  return DELEGATION_ROLES.some(r => r === canonical) && roleCanActOnStep(canonical, step)
}

/** May the actor SKIP the pending step? Mirror of CanSkipStep. */
export function canSkipStep(
  actor: WorkflowActor,
  facts: InstanceFacts,
  now: Date = new Date(),
  stepNo?: number | null,
): AccessDecision {
  const step = stepAt(facts, stepNo)
  if (!step) {
    return deny(WORKFLOW_DECISION_CODES.StepNotActive, 'The step does not exist on this form.')
  }

  if (step.skipMode === SkipMode.NotSkippable) {
    return deny(
      WORKFLOW_DECISION_CODES.StepNotSkippable,
      `Step ${step.stepNo} may not be skipped.`,
    )
  }

  if (isAdmin(actor)) return allow()

  if (!roleCanSkipManually(actor.role, step)) {
    return deny(
      WORKFLOW_DECISION_CODES.SkipNotPermitted,
      `${roleLabel(actor.role)} does not hold skip authority.`,
    )
  }

  if (!actorHas(actor, PERMISSIONS.SkipFormStep)) {
    return deny(
      WORKFLOW_DECISION_CODES.PermissionDenied,
      `The '${PERMISSIONS.SkipFormStep}' permission is missing.`,
    )
  }

  if (
    step.skipMode === SkipMode.RegulatoryDate &&
    !maySkipByRegulatoryDate(step, facts.regulatoryTargetDate, now)
  ) {
    return deny(WORKFLOW_DECISION_CODES.RegulatoryDateReached)
  }

  return allow()
}

/**
 * AMENDED v14 - may the actor send the pending approval step to a delegated reviewer while
 * KEEPING the approval? Mirror of FormWorkflowCatalog.CanRequestDelegatedReview plus the
 * Permissions.RequestDelegatedReview gate. Deliberately distinct from canDelegateStep,
 * which transfers the APPROVAL itself.
 */
export function canRequestDelegatedReviewOnStep(
  actor: WorkflowActor,
  facts: InstanceFacts,
  stepNo?: number | null,
): AccessDecision {
  if (isAdmin(actor)) return allow()

  const step = stepAt(facts, stepNo)
  if (!step) {
    return deny(WORKFLOW_DECISION_CODES.StepNotActive, 'The step does not exist on this form.')
  }

  if (facts.isLocked) return deny(WORKFLOW_DECISION_CODES.InstanceLocked)
  if (facts.isComplete) return deny(WORKFLOW_DECISION_CODES.AlreadyCompleted)

  if (isAwaitingDelegatedReview(facts.status)) {
    return deny(
      WORKFLOW_DECISION_CODES.DelegatedReviewNotAllowed,
      'A delegated review is already in progress on this step.',
    )
  }

  if (!step.allowsDelegatedReview || step.delegatedReviewRoles.length === 0) {
    return deny(
      WORKFLOW_DECISION_CODES.DelegatedReviewNotAllowed,
      `Step ${step.stepNo} does not support a delegated review.`,
    )
  }

  if (!roleCanRequestDelegatedReview(actor.role, step)) {
    return deny(
      WORKFLOW_DECISION_CODES.RoleNotEligible,
      `${roleLabel(actor.role)} may not delegate the review of step ${step.stepNo}.`,
    )
  }

  if (!actorHas(actor, PERMISSIONS.RequestDelegatedReview)) {
    return deny(
      WORKFLOW_DECISION_CODES.PermissionDenied,
      `The '${PERMISSIONS.RequestDelegatedReview}' permission is missing.`,
    )
  }

  return allow()
}

/**
 * AMENDED v14 - may the actor CONFIRM the delegated review of the pending step, routing it
 * back to its original approver on the SAME StepNo? Mirror of
 * FormWorkflowCatalog.CanActAsDelegatedReviewer + IsDelegatedReviewConfirmationValid.
 */
export function canConfirmDelegatedReviewOnStep(
  actor: WorkflowActor,
  facts: InstanceFacts,
  comments?: string | null,
  stepNo?: number | null,
): AccessDecision {
  if (isAdmin(actor)) return allow()

  const step = stepAt(facts, stepNo)
  if (!step) {
    return deny(WORKFLOW_DECISION_CODES.StepNotActive, 'The step does not exist on this form.')
  }

  if (facts.isLocked) return deny(WORKFLOW_DECISION_CODES.InstanceLocked)
  if (facts.isComplete) return deny(WORKFLOW_DECISION_CODES.AlreadyCompleted)

  if (!isAwaitingDelegatedReview(facts.status)) {
    return deny(
      WORKFLOW_DECISION_CODES.DelegatedReviewNotAllowed,
      'The step is not waiting for a delegated review.',
    )
  }

  if (!roleCanActAsDelegatedReviewer(actor.role, step)) {
    return deny(
      WORKFLOW_DECISION_CODES.NotDelegatedReviewer,
      `${roleLabel(actor.role)} is not the delegated reviewer of step ${step.stepNo}.`,
    )
  }

  if (!actorHas(actor, PERMISSIONS.ConfirmDelegatedReview)) {
    return deny(
      WORKFLOW_DECISION_CODES.PermissionDenied,
      `The '${PERMISSIONS.ConfirmDelegatedReview}' permission is missing.`,
    )
  }

  if (step.delegatedReviewRequiresComments && (!comments || comments.trim() === '')) {
    return deny(
      WORKFLOW_DECISION_CODES.DelegatedReviewCommentsRequired,
      'The delegated review must include your review comments before it can be confirmed.',
    )
  }

  return allow()
}

/**
 * Mirror of WorkflowPermissionMatrix.ValidateDecisionPayload.
 * AMENDED v18: `step.requiredFields` is now populated (section 4), so this finally does
 * what its name promises - a missing MNT-1420A `bulletinNumber` is caught BEFORE the POST.
 */
export function validateDecisionPayload(
  facts: InstanceFacts,
  stepNo: number,
  comments?: string | null,
  formFields?: Record<string, unknown> | null,
): AccessDecision {
  const step = stepAt(facts, stepNo)
  if (!step) return allow()

  if (step.requiresComments && (!comments || comments.trim() === '')) {
    return deny(
      WORKFLOW_DECISION_CODES.CommentsRequired,
      `Comments are mandatory on step ${stepNo}.`,
    )
  }

  const missing = missingRequiredFields(step.requiredFields, formFields)
  if (missing.length > 0) {
    return deny(
      WORKFLOW_DECISION_CODES.RequiredFieldsMissing,
      `Missing required fields: ${missing.join(', ')}.`,
    )
  }

  return allow()
}

/** May the actor SEE the record? Mirror of WorkflowPermissionMatrix.CanView. */
export function canView(actor: WorkflowActor, facts: InstanceFacts): boolean {
  if (isAdmin(actor)) return true
  if (!actorHas(actor, PERMISSIONS.ViewForm)) return false
  if (facts.originatorUserId === actor.userId) return true
  if (facts.currentAssigneeUserId === actor.userId) return true
  if (actorIsInUnit(actor, facts.currentAssignmentUnit)) return true

  if (actor.shopId && facts.originatorShopId && actor.shopId === facts.originatorShopId) {
    return true
  }

  // Management and QA oversight.
  return actorRank(actor) <= rankOf(ORG_ROLES.Manager) || actorRole(actor) === ORG_ROLES.QAPersonnel
}

export interface WorkflowCapabilities {
  canAct: boolean
  canAssign: boolean
  canDelegate: boolean
  canSkip: boolean
  canView: boolean
  /** AMENDED v14 - the actor may borrow a delegated reviewer for the pending step. */
  canRequestDelegatedReview: boolean
  /** AMENDED v14 - the actor may confirm the delegated review in progress. */
  canConfirmDelegatedReview: boolean
}

/** Mirror of WorkflowPermissionMatrix.CapabilitiesFor - the LOCAL computation. */
export function capabilitiesFor(
  actor: WorkflowActor,
  facts: InstanceFacts,
  now: Date = new Date(),
  candidate?: AssigneeCandidate | null,
): WorkflowCapabilities {
  return {
    canAct: canActOnStep(actor, facts).allowed,
    canAssign: canAssignStep(actor, facts).allowed,
    canDelegate: candidate
      ? canDelegateStep(actor, facts, candidate).allowed
      : canDelegateStepGeneric(actor, facts),
    canSkip: canSkipStep(actor, facts, now).allowed,
    canView: canView(actor, facts),
    canRequestDelegatedReview: canRequestDelegatedReviewOnStep(actor, facts).allowed,
    canConfirmDelegatedReview: canConfirmDelegatedReviewOnStep(actor, facts).allowed,
  }
}

// =====================================================================================
// 8. FILTERED PICKER LISTS
//    Used by the Assign / Delegate dialogs so an impossible candidate is never offered.
// =====================================================================================

export interface CandidateUser extends AssigneeCandidate {
  fullName?: string | null
  employeeNo?: string | null
  isActive?: boolean | null
  /** Documentation Clerk availability facts. */
  isAvailable?: boolean | null
  isAbsentNow?: boolean | null
  openTickets?: number | null
  maxConcurrent?: number | null
  /** AMENDED v18 - drives the "no specimen on file" warning in the Assign dialog. */
  hasActiveSignature?: boolean | null
}

/** Candidates legitimately assignable to the pending step. */
export function assignableCandidates(
  facts: InstanceFacts,
  stepNo: number,
  users: CandidateUser[],
): CandidateUser[] {
  return users.filter(
    user => user.isActive !== false && isValidAssignee(facts, stepNo, user).allowed,
  )
}

/** Candidates the actor may legitimately delegate the pending step to. */
export function delegatableCandidates(
  actor: WorkflowActor,
  facts: InstanceFacts,
  users: CandidateUser[],
  stepNo?: number | null,
): CandidateUser[] {
  return users.filter(
    user =>
      user.isActive !== false &&
      user.userId !== actor.userId &&
      canDelegateStep(actor, facts, user, stepNo).allowed,
  )
}

/**
 * AMENDED v18 - the Documentation Team Leader assigns "an available clerk". A clerk that is
 * absent or at capacity is still ELIGIBLE by role, so it must be offered but flagged, not
 * hidden: hiding it made the DL believe the team was empty.
 */
export function clerkAvailability(user: CandidateUser): {
  available: boolean
  code: string
  reason: string
} {
  if (user.isAbsentNow === true || user.isAvailable === false) {
    return {
      available: false,
      code: DOCUMENTATION_DECISION_CODES.ClerkNotAvailable,
      reason: decisionCodeMessage(DOCUMENTATION_DECISION_CODES.ClerkNotAvailable),
    }
  }

  const open = user.openTickets ?? 0
  const cap = user.maxConcurrent ?? 0
  if (cap > 0 && open >= cap) {
    return {
      available: false,
      code: DOCUMENTATION_DECISION_CODES.ClerkAtCapacity,
      reason: `${user.fullName ?? 'The clerk'} already holds ${open} of ${cap} concurrent tickets.`,
    }
  }

  return { available: true, code: WORKFLOW_DECISION_CODES.Allowed, reason: '' }
}

// =====================================================================================
// 9. SERVER-FIRST RESOLVERS  -  ALWAYS USE THESE IN COMPONENTS
//    The server flag wins whenever it is present; the local decision only fills the gap
//    and supplies the human reason for a disabled control.
// =====================================================================================

export interface ResolvedCapability {
  allowed: boolean
  /** 'server' when the API flag decided it, 'local' when this file did. */
  source: 'server' | 'local'
  code: string
  reason: string
}

function fromServerFlag(flag: boolean | undefined | null): ResolvedCapability | null {
  if (flag === true) {
    return { allowed: true, source: 'server', code: WORKFLOW_DECISION_CODES.Allowed, reason: '' }
  }
  return null
}

function localCapability(decision: AccessDecision): ResolvedCapability {
  return {
    allowed: decision.allowed,
    source: 'local',
    code: decision.code,
    reason: decision.reason,
  }
}

/**
 * "May I act on this step right now?" Reads `step.canIAct` first; when the flag is missing
 * (cached row, optimistic row) it falls back to the local rule, so the button is neither
 * wrongly enabled nor silently dead.
 */
export function resolveCanAct(
  actor: WorkflowActor,
  facts: InstanceFacts,
  serverStep?: Pick<WorkflowStepResponse, 'canIAct'> | null,
): ResolvedCapability {
  return fromServerFlag(serverStep?.canIAct) ?? localCapability(canActOnStep(actor, facts))
}

export function resolveCanAssign(
  actor: WorkflowActor,
  facts: InstanceFacts,
  serverStep?: Pick<WorkflowStepResponse, 'canIAssign'> | null,
): ResolvedCapability {
  return fromServerFlag(serverStep?.canIAssign) ?? localCapability(canAssignStep(actor, facts))
}

export function resolveCanDelegate(
  actor: WorkflowActor,
  facts: InstanceFacts,
  serverStep?: Pick<WorkflowStepResponse, 'canIDelegate'> | null,
): ResolvedCapability {
  const server = fromServerFlag(serverStep?.canIDelegate)
  if (server) return server
  const allowed = canDelegateStepGeneric(actor, facts)
  return localCapability(
    allowed ? allow() : deny(WORKFLOW_DECISION_CODES.DelegationNotAllowed),
  )
}

export function resolveCanSkip(
  actor: WorkflowActor,
  facts: InstanceFacts,
  serverStep?: Pick<WorkflowStepResponse, 'canISkip'> | null,
  now: Date = new Date(),
): ResolvedCapability {
  return fromServerFlag(serverStep?.canISkip) ?? localCapability(canSkipStep(actor, facts, now))
}

/** Table of Contents "Start" button: prefers `row.canIDraft`. */
export function resolveCanDraft(
  actor: WorkflowActor,
  form: CatalogFormResponse | null,
  row?: Pick<TableOfContentsItemResponse, 'canIDraft'> | null,
): ResolvedCapability {
  return fromServerFlag(row?.canIDraft) ?? localCapability(canDraft(actor, form))
}

/** AMENDED v14 - prefers `step.canIRequestDelegatedReview` (approver keeps the approval). */
export function resolveCanRequestDelegatedReview(
  actor: WorkflowActor,
  facts: InstanceFacts,
  serverStep?: Pick<WorkflowStepResponse, 'canIRequestDelegatedReview'> | null,
): ResolvedCapability {
  return (
    fromServerFlag(serverStep?.canIRequestDelegatedReview) ??
    localCapability(canRequestDelegatedReviewOnStep(actor, facts))
  )
}

/**
 * AMENDED v14 - prefers `step.canIConfirmDelegatedReview`. Pass `comments` once the caller
 * collected them, so the comments gate is evaluated on the real payload.
 */
export function resolveCanConfirmDelegatedReview(
  actor: WorkflowActor,
  facts: InstanceFacts,
  serverStep?: Pick<WorkflowStepResponse, 'canIConfirmDelegatedReview'> | null,
  comments?: string | null,
): ResolvedCapability {
  return (
    fromServerFlag(serverStep?.canIConfirmDelegatedReview) ??
    localCapability(canConfirmDelegatedReviewOnStep(actor, facts, comments))
  )
}

/**
 * Everything a step action bar needs in one call: the primary verb, whether it is enabled,
 * and the tooltip explaining why it is not.
 */
export interface StepActionState {
  actionLabel: string
  canAct: ResolvedCapability
  canAssign: ResolvedCapability
  canDelegate: ResolvedCapability
  canSkip: ResolvedCapability
  /** AMENDED v14 - true while the instance sits inside PendingDelegatedReview. */
  isAwaitingDelegatedReview: boolean
  /** AMENDED v14 - the approver may send this step to a delegated reviewer. */
  canRequestDelegatedReview: ResolvedCapability
  /** AMENDED v14 - the delegated reviewer may confirm and route the step back. */
  canConfirmDelegatedReview: ResolvedCapability
  /** AMENDED v14 - roles eligible to act as delegated reviewer of this step. */
  delegatedReviewRoles: string[]
  /** AMENDED v14 - the reviewer must write review comments before confirming. */
  delegatedReviewRequiresComments: boolean
  needsAssignment: boolean
  scope: string
  requiresComments: boolean
  isChecklistGate: boolean
  /** AMENDED v18 - FormDataJson keys this step still needs. */
  requiredFields: string[]
  /** AMENDED v18 - the caption this step will stamp when it is executed. */
  signatureBlock: SignatureBlockType
  signatureCaption: string
  disabledReason: string
}

export function stepActionState(
  actor: WorkflowActor,
  facts: InstanceFacts,
  serverStep?: WorkflowStepResponse | null,
  now: Date = new Date(),
): StepActionState {
  const stepNo = serverStep?.stepNo ?? facts.currentStepNo
  const step = stepAt(facts, stepNo)
  const canAct = resolveCanAct(actor, facts, serverStep)

  // AMENDED v14 - the delegated-review pair. The confirm capability is evaluated WITHOUT
  // comments here; when the step requires them the state carries
  // delegatedReviewRequiresComments = true plus the DELEGATED_REVIEW_COMMENTS_REQUIRED
  // code, so the action bar can enable the button as soon as the reviewer typed them.
  const canRequestReview =
    fromServerFlag(serverStep?.canIRequestDelegatedReview) ??
    localCapability(canRequestDelegatedReviewOnStep(actor, facts, stepNo))
  const canConfirmReview =
    fromServerFlag(serverStep?.canIConfirmDelegatedReview) ??
    localCapability(canConfirmDelegatedReviewOnStep(actor, facts, undefined, stepNo))

  return {
    actionLabel: stepKindActionLabel(step?.kind),
    canAct,
    canAssign: resolveCanAssign(actor, facts, serverStep),
    canDelegate: resolveCanDelegate(actor, facts, serverStep),
    canSkip: resolveCanSkip(actor, facts, serverStep, now),
    isAwaitingDelegatedReview: isAwaitingDelegatedReview(facts.status),
    canRequestDelegatedReview: canRequestReview,
    canConfirmDelegatedReview: canConfirmReview,
    delegatedReviewRoles: step?.delegatedReviewRoles ?? [],
    delegatedReviewRequiresComments: step?.delegatedReviewRequiresComments ?? true,
    needsAssignment:
      (step?.requiresManualAssignment ?? false) &&
      (facts.currentAssigneeUserId === null || facts.currentAssigneeUserId === undefined),
    scope: step ? scopeForStep(step) : WORKFLOW_SCOPES.Global,
    requiresComments: step?.requiresComments ?? false,
    isChecklistGate:
      step?.isStepByStepChecklist === true || step?.kind === WorkflowStepKind.Gate,
    requiredFields: step?.requiredFields ?? [],
    signatureBlock: step?.signatureBlock ?? SignatureBlockType.None,
    signatureCaption: step?.signatureCaption ?? '',
    disabledReason: canAct.allowed ? '' : canAct.reason,
  }
}

/**
 * AMENDED v18 - ONE pre-flight for the whole action bar. Call it in the click handler
 * BEFORE `approveWorkflowStep()` so an impossible payload never leaves the browser and the
 * user sees the exact missing field instead of a bare 422.
 */
export function preflightDecision(args: {
  actor: WorkflowActor
  facts: InstanceFacts
  stepNo?: number | null
  comments?: string | null
  formDataJson?: string | null
  now?: Date
}): AccessDecision {
  const stepNo = args.stepNo ?? args.facts.currentStepNo
  const gate = canActOnStep(args.actor, args.facts, stepNo)
  if (!gate.allowed) return gate

  return validateDecisionPayload(
    args.facts,
    stepNo,
    args.comments,
    parseFormFields(args.formDataJson),
  )
}

// =====================================================================================
// 10. DOCUMENTATION SPECIALISED LAYER  (mirror of DocumentationPermissionMatrix)
//     MNT-1420A: Others -> Documentation Team -> DL assigns clerk -> clerk processes ->
//     back to DL for final review and sign-off.
//     MNT-1420B: the Shop Team Leader drafts, processes AND issues, alone.
// =====================================================================================

export function isDocumentationUnitStep(step: StepFacts): boolean {
  return (
    !!step.assignmentUnit &&
    step.assignmentUnit.toLowerCase() === FUNCTIONAL_UNITS.Documentation.toLowerCase()
  )
}

/** DL only: "Documentation Team Leader (DL) assigns to an available clerk." */
export function canAssignDocumentationClerk(
  actor: WorkflowActor,
  facts: InstanceFacts,
  candidate: CandidateUser,
  stepNo?: number | null,
): AccessDecision {
  const step = stepAt(facts, stepNo)
  if (!step) return deny(WORKFLOW_DECISION_CODES.StepNotActive)

  if (!isDocumentationUnitStep(step)) {
    return deny(DOCUMENTATION_DECISION_CODES.NotDocumentationForm)
  }

  if (!isAdmin(actor) && actorRole(actor) !== ORG_ROLES.DocumentationTeamLeader) {
    return deny(DOCUMENTATION_DECISION_CODES.NotDocumentationLeader)
  }

  if (!actorHas(actor, PERMISSIONS.AssignDocumentationClerk)) {
    return deny(
      DOCUMENTATION_DECISION_CODES.PermissionMissing,
      `The '${PERMISSIONS.AssignDocumentationClerk}' permission is missing.`,
    )
  }

  if (normalizeRole(candidate.role) !== ORG_ROLES.DocumentationClerk) {
    return deny(DOCUMENTATION_DECISION_CODES.AssigneeNotClerk)
  }

  const availability = clerkAvailability(candidate)
  if (!availability.available) {
    return deny(availability.code, availability.reason)
  }

  return allow()
}

/** "AD (MNT-1420B): STL holds sole authority to draft, process, and issue final approvals." */
export function canActOnDirective(
  actor: WorkflowActor,
  facts: InstanceFacts,
  stepNo?: number | null,
): AccessDecision {
  if (isAdmin(actor)) return allow()

  if (actorRole(actor) !== ORG_ROLES.TeamLeader) {
    return deny(DOCUMENTATION_DECISION_CODES.AdSoleAuthorityViolation)
  }

  if (
    facts.originatorShopId &&
    (!actor.shopId || actor.shopId !== facts.originatorShopId)
  ) {
    return deny(DOCUMENTATION_DECISION_CODES.AdOutsideOwnShop)
  }

  return canActOnStep(actor, facts, stepNo)
}

// =====================================================================================
// 11. SIGNATURE AUTHORITY  (requirement #13, AMENDED v18)
//     "On the Admin Role Dashboard, provide a dedicated upload option for signature files."
//     "Ensure signatures are securely linked per user after being uploaded by the admin."
//     Uploading / revoking is ADMIN ONLY; reading the specimen of a signer of a form the
//     caller may already view is allowed for EVERY approver, otherwise a Manager could not
//     print the form he just approved.
// =====================================================================================

export function canUploadSignature(actor: WorkflowActor): AccessDecision {
  return isAdmin(actor) ? allow() : deny(WORKFLOW_DECISION_CODES.SignatureAdminOnly)
}

export function canRevokeSignature(actor: WorkflowActor): AccessDecision {
  return isAdmin(actor) ? allow() : deny(WORKFLOW_DECISION_CODES.SignatureAdminOnly)
}

/**
 * May the actor see the specimen of `signerUserId` while printing `facts`?
 * The rule is deliberately derived from `canView`: if you may read the form, you may read
 * the signatures printed on it - that is what a signed document means.
 */
export function canViewSignatureSpecimen(
  actor: WorkflowActor,
  facts: InstanceFacts,
  signerUserId?: number | null,
): AccessDecision {
  if (isAdmin(actor)) return allow()
  if (!signerUserId || signerUserId <= 0) {
    return deny(WORKFLOW_DECISION_CODES.SignatureSpecimenMissing)
  }
  if (signerUserId === actor.userId) return allow()
  return canView(actor, facts)
    ? allow()
    : deny(WORKFLOW_DECISION_CODES.PermissionDenied, 'You may not view this record.')
}

/**
 * What the printed block needs to know about ONE executed step, without any React:
 * who signed, in which role, when, and whether an image may be requested for him.
 * `toc-view-model.ts` (`buildSignatureBlock`) builds the CELLS; this returns the AUTHORITY
 * facts that decide whether `useSignatureImage(userId)` should even be called.
 */
export interface SignatureStampFacts {
  stepNo: number
  block: SignatureBlockType
  caption: string
  userId: number | null
  personName: string
  personRole: string
  signedAt: string | null
  /** True once a real person executed the step. */
  isSigned: boolean
  /** True when the specimen image may be streamed for this cell. */
  mayLoadSpecimen: boolean
  /** Why the image is not requested; printed as a `title`, never as an error. */
  unavailableReason: string
}

export function signatureStampFacts(
  actor: WorkflowActor,
  facts: InstanceFacts,
  step: StepFacts,
): SignatureStampFacts {
  const row =
    facts.signatures.find(s => s.stepNo === step.stepNo && s.block === step.signatureBlock) ??
    facts.signatures.find(s => s.stepNo === step.stepNo) ??
    null

  const userId = row?.userId ?? null
  const isSigned = Boolean(userId) && Boolean(row?.signedAt)
  const view = canViewSignatureSpecimen(actor, facts, userId)

  return {
    stepNo: step.stepNo,
    block: step.signatureBlock,
    caption: step.signatureCaption || captionOfBlock(step.signatureBlock),
    userId,
    personName: row?.personName ?? '',
    personRole: row?.personRole ?? '',
    signedAt: row?.signedAt ?? null,
    isSigned,
    mayLoadSpecimen: isSigned && view.allowed,
    unavailableReason: isSigned
      ? view.allowed
        ? ''
        : view.reason
      : decisionCodeMessage(WORKFLOW_DECISION_CODES.SignatureSpecimenMissing),
  }
}

/** Every stamp fact of an instance, in step order - the printed footer of one form. */
export function signatureStampFactsOf(
  actor: WorkflowActor,
  facts: InstanceFacts,
): SignatureStampFacts[] {
  return facts.steps
    .filter(step => step.signatureBlock !== SignatureBlockType.None)
    .sort((a, b) => a.stepNo - b.stepNo)
    .map(step => signatureStampFacts(actor, facts, step))
}