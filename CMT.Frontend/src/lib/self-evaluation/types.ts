/**
 * =====================================================================================
 * AMENDED v17 - CMT.Frontend/src/lib/self-evaluation/types.ts
 * Copy to: CMT.Frontend/src/lib/self-evaluation/types.ts   (REPLACES the whole file)
 *
 * WHAT CHANGED IN v17 (and NOTHING ELSE CHANGED)
 * ----------------------------------------------
 *  REMOVED (5 declarations that were the root cause of the "no buttons" bug):
 *    1. `export enum ApprovalStatus { Draft = 0 ... Returned = 7 }`      (was line ~81)
 *    2. `export function getApprovalStatusLabel(...)`                    (was line ~497)
 *    3. `export function getApprovalStatusColor(...)`                    (was line ~511)
 *    4. `export function getApprovalStatusIcon(...)`                     (was line ~525)
 *    5. `export function canPerformAction(...)`                          (was line ~640)
 *
 *  REMOVED ALSO (to break the module import cycle - see NOTE 2 below):
 *    6. `export enum ProficiencyLevel { ... }`
 *    7. `export enum ToolStatus { ... }`
 *       -> both are now RE-EXPORTED from '@/lib/workflow/workflow-types'.
 *
 *  ADDED:
 *    A. the re-export block at the top, so all ~40 existing
 *       `import { ApprovalStatus, getApprovalStatusLabel } from '@/lib/self-evaluation/types'`
 *       call sites keep compiling but now resolve to the 31-member truth.
 *    B. the five missing members of the `UserRole` union
 *       (inspector / documentation_team_leader / documentation_clerk /
 *        hr_specialist / hr_manager) plus the `ecaa_team` and `user` aliases.
 *    C. `getRolePermissions()` cases for those new roles, so the legacy
 *       permission props of old components stop returning the all-false default.
 *
 *  EVERYTHING ELSE IN THIS FILE IS BYTE-FOR-BYTE THE SAME as the version you
 *  already have: CapabilityStatus, ComplianceStatus, AuditStatus, WorkflowAction,
 *  DelegationStatus, DirectiveApplicability, BulletinCategory, ShopCapabilityFilter,
 *  ResponsibleWorkshopFilter, RolePermissions, FormNodeType, FormTreeNode, every DTO
 *  and every remaining helper. No DTO field was renamed, added or removed.
 *
 * -------------------------------------------------------------------------------------
 * NOTE 1 - WHY THE ENUM COULD NOT STAY HERE
 * -------------------------------------------------------------------------------------
 * The backend (CMT.Domain/Models/Shared/ApprovalStatus.cs, v8) persists values up to
 * 30 = PendingAmendmentApproval. While this file declared its own 8-member copy:
 *
 *   getApprovalStatusLabel(13) -> "Unknown"   (should be "Pending Documentation Team")
 *   getApprovalStatusColor(19) -> grey        (should be the amber Pending bucket)
 *   canPerformAction('approve', 14, 'documentation_clerk') -> false for ALL 23 new
 *   statuses, because the switch had no case for them and the UserRole union had no
 *   Documentation / HR / Inspector member at all.
 *
 * Result: every Documentation (MNT-1420A), AD (MNT-1420B), TNA (MNT-1229B), Training,
 * 918 / 918A and Amendment record rendered with NO action buttons even though the API
 * would have accepted the action. Worse, `role-hierarchy.ts` (v12) imports ApprovalStatus
 * from '@/lib/workflow/workflow-types', so TypeScript saw TWO unrelated enums named
 * ApprovalStatus in one build.
 *
 * SINGLE SOURCE OF TRUTH is now: src/lib/workflow/workflow-types.ts (v11).
 * The 31-member helper replacements live in:  ./types-workflow-bridge.ts (v15).
 *
 * -------------------------------------------------------------------------------------
 * NOTE 2 - MANDATORY 2-LINE COMPANION PATCH (import cycle)
 * -------------------------------------------------------------------------------------
 * `workflow-types.ts` currently starts with:
 *
 *     export { ProficiencyLevel, ToolStatus } from '@/lib/self-evaluation/types'
 *
 * If THIS file also imported from workflow-types.ts, the two modules would form an
 * evaluation cycle. When the bundler happens to evaluate workflow-types.ts FIRST, the
 * bridge builds its `STATUS_OWNER_ROLES` map while `ApprovalStatus` is still
 * uninitialised -> runtime "Cannot read properties of undefined (reading 'Draft')".
 *
 * FIX (see workflow-types.PATCH.md in this folder): delete that single re-export line
 * from workflow-types.ts and declare ProficiencyLevel + ToolStatus locally there.
 * workflow-types.ts then becomes a LEAF module and the dependency graph is acyclic:
 *
 *     self-evaluation/types.ts  ->  self-evaluation/types-workflow-bridge.ts
 *                               ->  workflow/workflow-types.ts   (leaf)
 *                               ->  role-hierarchy.ts            -> workflow-types.ts
 *
 * -------------------------------------------------------------------------------------
 * NOTE 3 - DO NOT RE-DERIVE ROUTING HERE
 * -------------------------------------------------------------------------------------
 * `role-hierarchy.ts` (v12) owns rankOf / hasPermission / approverRolesFor.
 * `workflow-permissions.ts` (v14) owns every step decision and MUST be preferred:
 * it reads the server's own canIAct / canIAssign / canIDelegate / canISkip / canIDraft
 * flags. `canPerformAction()` re-exported below is a DEPRECATED role-shaped guess kept
 * only so the legacy call sites compile.
 * =====================================================================================
 */

// =====================================================================================
// 0. SINGLE-SOURCE-OF-TRUTH RE-EXPORTS  (v17 - replaces the 5 deleted declarations)
// =====================================================================================

// Imported locally because the helpers further down in THIS file still reference them
// (getProficiencyLevelLabel, getToolStatusLabel, ATARecordDto.approvalStatus ...).
// A bare `export { X } from '...'` does NOT put X in local scope, so both an import and
// an export are required.
import {
  ApprovalStatus,
  ProficiencyLevel,
  ToolStatus,
} from '@/lib/workflow/workflow-types'

/**
 * Re-exported so that every existing
 *   `import { ApprovalStatus } from '@/lib/self-evaluation/types'`
 * keeps working while resolving to the 31-member backend mirror.
 */
export { ApprovalStatus, ProficiencyLevel, ToolStatus }

/**
 * The four legacy helpers now come from the v15 migration shim, which understands all
 * 31 statuses and all 16 roles. Signatures are unchanged, so no call site needs editing.
 *
 * - getApprovalStatusLabel(status)  -> label for every status (no more "Unknown")
 * - getApprovalStatusColor(status)  -> lifecycle-bucket Tailwind classes (contrast safe)
 * - getApprovalStatusIcon(status)   -> bucket-driven glyph
 * - canPerformAction(a, status, role) -> DEPRECATED role gate (see NOTE 3)
 * - APPROVAL_PROGRESS_STEPS         -> generic fallback chain for the progress strip
 * - progressDotClasses(status, step) -> dot colour without the broken numeric `>=`
 * - ownerRolesOf(status)            -> role names for the "waiting on ..." tooltip
 */
export {
  getApprovalStatusLabel,
  getApprovalStatusColor,
  getApprovalStatusIcon,
  canPerformAction,
  APPROVAL_PROGRESS_STEPS,
  progressDotClasses,
  ownerRolesOf,
} from './types-workflow-bridge'

// Convenience re-exports: several components need the lifecycle bucket for the Table of
// Contents badges and were previously forced to import from two different modules.
export {
  FormLifecycleState,
  lifecycleStateOf,
  lifecycleStateLabel,
  lifecycleStateClasses,
  isTerminalStatus,
  isWithOriginator,
  isPendingStatus,
  countsAsComplete,
} from '@/lib/workflow/workflow-types'

// =====================================================================================
// 1. ENUMS THAT REMAIN LOCAL  (unchanged - no backend counterpart moved)
// =====================================================================================

export enum CapabilityStatus {
  NotAssessed = 0,
  FullCapability = 1,
  LimitedCapability = 2,
  NoCapability = 3,
  UnderDevelopment = 4,
}

export enum ComplianceStatus {
  NotReviewed = 0,
  Compliant = 1,
  NonCompliant = 2,
  PartiallyCompliant = 3,
  NotApplicable = 4,
}

export enum AuditStatus {
  NotStarted = 0,
  InProgress = 1,
  Completed = 2,
  RequiresFollowUp = 3,
  Closed = 4,
}

/**
 * Legacy audit-trail verb of WorkflowAuditLog. NOT the same enum as
 * `WorkflowStepAction` in workflow-types.ts (which has 16 members and is what the
 * v8 step engine writes). Both are kept: this one still types WorkflowAuditLogDto.
 */
export enum WorkflowAction {
  Created = 0,
  Updated = 1,
  Submitted = 2,
  Approved = 3,
  Rejected = 4,
  Delegated = 5,
  Completed = 6,
  Archived = 7,
  Added = 8,
  Deleted = 9,
  Amended = 10,
  ReturnedForRevision = 11,
  AssignmentChanged = 12,
}

export enum DelegationStatus {
  Active = 0,
  Revoked = 1,
  Expired = 2,
}

export enum DirectiveApplicability {
  NotDetermined = 0,
  Applicable = 1,
  NotApplicable = 2,
  Superseded = 3,
}

export enum BulletinCategory {
  Mandatory = 0,
  Recommended = 1,
  Optional = 2,
  Alert = 3,
}

// ===== Shop Capability (Authority) Filter Options =====
export type ShopCapabilityFilter = 'ALL' | 'ECAA' | 'FAA' | 'EASA'

// ===== Responsible Workshop Filter Options =====
export type ResponsibleWorkshopFilter = 'ALL' | 'Galley' | 'Electric'

// =====================================================================================
// 2. ROLE-BASED PERMISSION TYPES
// =====================================================================================

/**
 * AMENDED v17 — the union now carries EVERY role of the Functional Workflow Matrix.
 *
 * Legacy members are deliberately KEPT so the ~40 components that still pass
 * 'shop_tl' / 'qa_staff' / 'ecaa_personnel' / 'hr' keep type-checking. The canonical
 * server spellings live in `ORG_ROLES` (role-hierarchy.ts v12); `normalizeRole()`
 * maps every member below onto one of the 16 canonical roles.
 *
 *   admin
 *     └── director (one per department, Admin-assigned only)
 *           ├── special_team_leader  (approvals + engineer assignment)
 *           │     └── engineer
 *           ├── documentation_team_leader (DL)      [v17]
 *           │     └── documentation_clerk           [v17]
 *           ├── hr_manager                          [v17]
 *           │     └── hr_specialist                 [v17]
 *           └── manager (ACS / MCS / NDT / Standard ...)
 *                 ├── shop_manager
 *                 │     └── shop_tl
 *                 └── shop_tl / team_leader  (STL — Wheel / Galley / Emergency ...)
 *                       ├── engineer
 *                       ├── technician
 *                       ├── inspector               [v17]
 *                       ├── certifying_staff
 *                       ├── qa_staff / qa_personnel
 *                       └── ecaa_personnel / ecaa_team
 */
export type UserRole =
  | 'admin'
  | 'special_admin'
  | 'director'
  | 'special_team_leader'
  | 'manager'
  // ----- v17: department-tier functional-unit leaders -----
  | 'hr_manager'
  | 'documentation_team_leader'
  // ----- shop tier -----
  | 'shop_manager'
  | 'team_leader'            // = Shop Team Leader (STL), canonical persisted value
  | 'shop_tl'                // legacy spelling of the same role
  // ----- v17: functional-unit executors -----
  | 'hr_specialist'
  | 'documentation_clerk'
  // ----- individual personnel -----
  | 'engineer'
  | 'inspector'              // v17 — MNT-1378 exclusive reviewer / approver
  | 'technician'             // MNT-922C / MNT 3.14-020 exclusive sign-off
  | 'certifying_staff'
  | 'qa_staff'
  | 'qa_personnel'
  | 'ecaa_personnel'
  | 'ecaa_team'              // v17 — printed caption on MNT-918A is "ECAA Team"
  | 'hr'                     // legacy alias -> hr_specialist
  | 'user'                   // v17 — authenticated with no operational role yet

export interface RolePermissions {
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
  canSubmit: boolean
  canApprove: boolean
  canReject: boolean
  canDelegate: boolean
  canReturn: boolean
  canUploadFiles: boolean
  canViewAll: boolean
  canManageShop: boolean
  canCreateATA: boolean
}

const NO_PERMISSIONS: RolePermissions = {
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canSubmit: false,
  canApprove: false,
  canReject: false,
  canDelegate: false,
  canReturn: false,
  canUploadFiles: false,
  canViewAll: false,
  canManageShop: false,
  canCreateATA: false,
}

/**
 * Coarse capability flags used by the OLD component props (show/hide a toolbar button).
 * It is NOT a routing decision — a step is only actionable when the API says
 * `canIAct === true`. Use `stepActionState()` from workflow-permissions.ts for that.
 */
export function getRolePermissions(role: UserRole): RolePermissions {
  switch (role) {
    case 'admin':
      return { canCreate: true, canEdit: true, canDelete: true, canSubmit: true, canApprove: true, canReject: true, canDelegate: true, canReturn: true, canUploadFiles: true, canViewAll: true, canManageShop: true, canCreateATA: true }

    case 'special_admin':
      return { canCreate: false, canEdit: true, canDelete: false, canSubmit: false, canApprove: true, canReject: true, canDelegate: false, canReturn: true, canUploadFiles: false, canViewAll: false, canManageShop: false, canCreateATA: false }

    case 'director':
      return { canCreate: false, canEdit: true, canDelete: false, canSubmit: false, canApprove: true, canReject: true, canDelegate: true, canReturn: true, canUploadFiles: false, canViewAll: true, canManageShop: false, canCreateATA: false }

    // Special Team Leader is created by the Admin under a Director. It exists to approve
    // work, to approve the alternate-tool pathway, to assign Engineers and to assign ATA
    // records or update entries directly — but it does not own shop administration.
    case 'special_team_leader':
      return { canCreate: true, canEdit: true, canDelete: false, canSubmit: true, canApprove: true, canReject: true, canDelegate: true, canReturn: true, canUploadFiles: true, canViewAll: true, canManageShop: false, canCreateATA: true }

    case 'manager':
      return { canCreate: false, canEdit: true, canDelete: false, canSubmit: false, canApprove: true, canReject: true, canDelegate: true, canReturn: true, canUploadFiles: false, canViewAll: true, canManageShop: false, canCreateATA: false }

    // ----- v17: HR Manager approves the verified training package, then the record
    // returns to the requesting Shop Team Leader for STL training verification.
    case 'hr_manager':
      return { canCreate: false, canEdit: true, canDelete: false, canSubmit: false, canApprove: true, canReject: true, canDelegate: true, canReturn: true, canUploadFiles: true, canViewAll: true, canManageShop: false, canCreateATA: false }

    // ----- v17: Documentation Team Leader (DL) receives MNT-1420A, assigns an available
    // clerk, then performs the final review and sign-off.
    case 'documentation_team_leader':
      return { canCreate: true, canEdit: true, canDelete: false, canSubmit: true, canApprove: true, canReject: true, canDelegate: true, canReturn: true, canUploadFiles: true, canViewAll: true, canManageShop: false, canCreateATA: false }

    case 'shop_manager':
      return { canCreate: true, canEdit: true, canDelete: true, canSubmit: true, canApprove: true, canReject: true, canDelegate: true, canReturn: true, canUploadFiles: true, canViewAll: false, canManageShop: true, canCreateATA: true }

    case 'team_leader':
    case 'shop_tl':
      return { canCreate: true, canEdit: true, canDelete: true, canSubmit: true, canApprove: true, canReject: true, canDelegate: true, canReturn: true, canUploadFiles: true, canViewAll: false, canManageShop: true, canCreateATA: true }

    // ----- v17: HR Specialist verifies enrolments, updates training status records and
    // filters eligible employees before forwarding to the HR Manager. Never deletes.
    case 'hr_specialist':
    case 'hr':
      return { canCreate: false, canEdit: true, canDelete: false, canSubmit: true, canApprove: true, canReject: false, canDelegate: false, canReturn: true, canUploadFiles: true, canViewAll: true, canManageShop: false, canCreateATA: false }

    // ----- v17: Documentation Clerk EXECUTES the task assigned by the DL. It processes
    // and submits; it never approves and never returns.
    case 'documentation_clerk':
      return { canCreate: false, canEdit: true, canDelete: false, canSubmit: true, canApprove: false, canReject: false, canDelegate: false, canReturn: false, canUploadFiles: true, canViewAll: false, canManageShop: false, canCreateATA: false }

    case 'engineer':
      return { canCreate: true, canEdit: true, canDelete: false, canSubmit: true, canApprove: false, canReject: false, canDelegate: false, canReturn: false, canUploadFiles: true, canViewAll: false, canManageShop: false, canCreateATA: false }

    // ----- v17: Inspection Proficiency (MNT-1378) is routed EXCLUSIVELY to the
    // designated Inspector for sequential review AND final approval.
    case 'inspector':
      return { canCreate: false, canEdit: true, canDelete: false, canSubmit: true, canApprove: true, canReject: true, canDelegate: false, canReturn: true, canUploadFiles: true, canViewAll: false, canManageShop: false, canCreateATA: false }

    // Competency Assessment (MNT 3.14-020 / MNT-922C) is routed directly to the
    // Technician for review and task-completion sign-off, so canApprove must be true.
    case 'technician':
      return { canCreate: false, canEdit: true, canDelete: false, canSubmit: true, canApprove: true, canReject: false, canDelegate: false, canReturn: false, canUploadFiles: true, canViewAll: false, canManageShop: false, canCreateATA: false }

    case 'certifying_staff':
      return { canCreate: false, canEdit: true, canDelete: false, canSubmit: true, canApprove: true, canReject: false, canDelegate: false, canReturn: true, canUploadFiles: true, canViewAll: false, canManageShop: false, canCreateATA: false }

    case 'qa_staff':
    case 'qa_personnel':
      return { canCreate: false, canEdit: false, canDelete: false, canSubmit: false, canApprove: true, canReject: true, canDelegate: false, canReturn: true, canUploadFiles: false, canViewAll: true, canManageShop: false, canCreateATA: false }

    // Authority reviewer — endorses MNT-918A, never edits.
    case 'ecaa_personnel':
    case 'ecaa_team':
      return { canCreate: false, canEdit: false, canDelete: false, canSubmit: false, canApprove: true, canReject: true, canDelegate: false, canReturn: false, canUploadFiles: false, canViewAll: true, canManageShop: false, canCreateATA: false }

    case 'user':
    default:
      return { ...NO_PERMISSIONS }
  }
}

// =====================================================================================
// 3. HIERARCHICAL TREE NODE TYPES  (unchanged)
// =====================================================================================

export type FormNodeType =
  | 'capability_self_evaluation'
  | 'periodic_self_audit'
  | 'confirmation_letter'
  | 'request_letter'
  | 'table_of_content'
  | '918_faa'
  | '918a_caa'
  | 'sb'
  | 'ad'
  | 'component_maintenance_training'
  | 'inspector_proficiency'
  | 'competency_assessment'
  | 'similar_technology'
  | 'tna'
  | 'tool_need_analysis_report'
  | 'alternate_tools_equivalency'
  | 'inhouse_manufactured_tools'
  | 'repair_facility_evaluation'
  | 'cleaning_facility_evaluation'
  | 'environmental_facility_evaluation'
  | 'list_of_consumables'
  | 'alternate_consumable_declaration'
  | 'task_card'
  // ===== revised Table of Contents — 7 additive values =====
  // Nothing was renamed or removed, so every stored FormSubmission.FormType stays valid.
  // TRAINING DOCUMENT -> MAINTENANCE AND GENERIC COURSES
  | 'training_verification_inspection'
  | 'training_verification_technician'
  // TRAINING DOCUMENT -> SIMILAR TECHNICAL OR SIMPLE TASKS
  | 'similar_task'
  | 'simple_task'
  // TOOLS AND EQUIPMENT -> IN-HOUSE MANUFACTURING TOOL JIC
  | 'tool_mfg_jic'
  | 'tool_risk_assessment'
  | 'tool_mfg_form_1554'
  // ===== AMENDED v17 — catalog-local virtual form types already emitted by
  // FormWorkflowCatalog.Regulatory.cs / .Documentation.cs. They arrive from
  // GET /api/workflow/catalog and previously widened FormTreeNode.formType to a
  // type error. Keep them in sync with FORM_TYPES in workflow-types.ts.
  | 'ata_record'
  | 'cmm_documentation'
  | 'evaluation_folder_signoff'
  | 'expiry_amendment'
  | 'folder_revision'

export interface FormTreeNode {
  id: string
  label: string
  formType: FormNodeType
  parentId: string | null
  children?: FormTreeNode[]
  hasForm: boolean
  approvalStatus?: ApprovalStatus
  lastModified?: string
  modifiedBy?: string
}

// =====================================================================================
// 4. DTOs matching backend exactly  (unchanged)
// =====================================================================================

export interface ShopDto {
  id: string
  name: string
  certificateNumber: string
  address: string
  city: string
  state: string
  zipCode: string
  country: string
  phone: string
  email: string
  accountableManager: string
  qualityManager: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ATAChapterDto {
  id: string
  chapterNumber: string
  title: string
  description: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface ComponentDto {
  id: string
  partNumber: string
  description: string
  manufacturer: string
  modelSeries: string
  ataChapterId: string
  ataChapterNumber: string
  ataChapterTitle: string
  shopId: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/**
 * ATARecordDto includes:
 * - authority: Shop Capability (comma-separated: "ECAA", "FAA", "EASA" or combinations)
 * - responsibleWorkshop: Responsible Workshop (comma-separated: "Galley", "Electric" ...)
 *
 * Legacy ecaaShop/faaShop kept for backward compatibility but not used for display.
 */
export interface ATARecordDto {
  id: string
  description: string
  partNumber: string
  selfEvaluationDate: string
  manufacturer: string
  /** ATA chapter code string (e.g., "34") - used as display value */
  ataChapter: string
  /** Same as ataChapter - backend field name */
  ataChapterCode?: string
  cmmRevDate: string
  revNo: string
  /** v7: URL of the CMM PDF fetched from the external system and persisted per record. */
  cmmPdfUrl: string
  aircraft: string

  /**
   * Shop Capability / Authority - comma-separated values.
   * Possible values: "ECAA", "FAA", "EASA" or combinations like "ECAA,FAA,EASA"
   * Used for dashboard filter tabs: ALL | ECAA | FAA | EASA (with counts)
   */
  authority: string

  /**
   * Responsible Workshop - comma-separated values.
   * Possible values: "Galley", "Electric" or combinations like "Galley,Electric"
   * Used for dashboard filter tabs: ALL | Galley | Electric (with counts)
   */
  responsibleWorkshop: string

  // Legacy fields (backward compatibility - do NOT use for display)
  ecaaShop: string
  faaShop: string

  letterRefNo: string
  shop: string
  shopId: string
  componentId: string
  /** The GUID of the linked ATA Chapter entity (nullable - may be empty string or null) */
  ataChapterId?: string
  /** The chapter number from the linked ATAChapter entity (e.g., "34") */
  ataChapterNumber?: string
  /** The title from the linked ATAChapter entity (e.g., "Navigation") */
  ataChapterTitle?: string
  approvalStatus: ApprovalStatus
  /**
   * AMENDED v19 (defect #2): the backend serialises ATARecordDto.AssignedToUserId as a
   * nullable long (User.Id). Widened from `string` to `string | number` so the workflow
   * fallback can compare the assigned preparer against the signed-in user's numeric id
   * without a lossy cast.
   */
  assignedToUserId?: string | number
  rejectionReason?: string
  revisionNumber?: number

  /**
   * PHASE 2: per-record optional-stage opt-ins, mirroring ATARecord.RequiresQAApproval /
   * RequiresDirectorApproval / RequiresECAAEndorsement on the server. The default chain
   * is Shop Team Leader -> Manager; these flags append QA / Director / ECAA stages.
   */
  requiresQAApproval?: boolean
  requiresDirectorApproval?: boolean
  requiresECAAEndorsement?: boolean

  /**
   * AMENDED v26 — the preparer's role FROZEN AT CREATION TIME
   * (ATARecord.CreatorRole, stamped by CreateATARecordCommand v24).
   *
   * WHY IT DECIDES EVERYTHING: this single value selects the approval path for the rest
   * of the record's life.
   *   • a leader-tier value ('team_leader' / 'shop_tl' / 'shop_manager' /
   *     'special_team_leader' / 'admin')  -> SCENARIO A, originator-led: the Shop Team
   *     Leader CONFIRMS (optional comment) and the record is finalized immediately; there
   *     is no Reject verb, because a leader unhappy with their own record amends it.
   *   • anything else, or any value carrying the ':delegated' marker  -> SCENARIO B: the
   *     record routes to the Shop Team Leader, who may edit it directly, send it back for
   *     revision, or approve / reject it with an approval comment.
   *
   * OPTIONAL ON PURPOSE: the backend `ATARecordDto` (ATARecordQueries.cs) does not
   * round-trip CreatorRole yet. While it is absent, `isOriginatorLedRecord()` falls back
   * to a fail-closed check (the viewer must be PROVABLY the preparer AND leader-tier), so
   * confirm authority can never leak to a user who did not prepare the record.
   */
  creatorRole?: string

  /**
   * AMENDED v26 — ATARecord.CreatedByUserId (User.Id is a C# long, never a Guid).
   * Widened to `string | number` for the same reason as `assignedToUserId`: the numeric
   * id must be comparable against the signed-in user's id without a lossy cast.
   */
  createdByUserId?: string | number

  /** AMENDED v26 — ATARecord.ApprovedByUserId, set by the handler when the record is finalized. */
  approvedByUserId?: string | number

  /** AMENDED v26 — ATARecord.ApprovalDate, stamped when the record reaches Approved. */
  approvalDate?: string | null

  createdBy: string
  updatedBy?: string
  createdByRole?: string
  updatedByRole?: string
  createdAt: string
  updatedAt: string

  /**
   * v18 PHASE 1 (item 2): the Guid of the EvaluationFolder that owns this record's
   * Table of Contents. Mirrors EvaluationFolder.ATARecordId, which is nullable on the
   * server precisely because a folder may be provisioned before or after the record.
   *
   * WHY IT IS OPTIONAL: Phase 1 is frontend-only. Until the Phase 2 folder-provisioning
   * endpoint exists this stays undefined, and the Table of Contents renders in
   * "unprovisioned" mode from the PRINTED tree (every row "Not started"). It is never
   * defaulted to a fabricated Guid — a wrong Guid would make the ToC endpoint answer
   * 404/INSTANCE_NOT_FOUND and look like a transport fault.
   *
   * TYPE RULE: string (C# Guid). Never a number — user ids are the only numbers.
   */
  evaluationFolderId?: string | null

  /** Existing legacy form statuses used while the evaluation folder is unprovisioned. */
  formSubmissions?: FormSubmissionSummaryDto[]
}

export interface FormSubmissionSummaryDto {
  id: string
  formType: string
  formNo: string
  approvalStatus: number
  submittedDate?: string | null
  approvedDate?: string | null
  revisionNumber?: number
}

// =====================================================================================
// 4b. ATA RECORD WORKFLOW SERVER CONTRACTS  (AMENDED v19 — Phase 1 mirror)
//     Declared here (the DTO home) so components and the ata-workflow hook share one
//     definition. `ata-workflow.ts` re-exports them, so existing
//     `import type { ATARecordCapabilitiesDto } from '@/lib/self-evaluation/ata-workflow'`
//     call sites keep compiling unchanged.
//     Mirrors CMT.Application/Contracts/SelfEvaluation/ATARecordWorkflowContracts.cs.
// =====================================================================================

/** One stage of ATARecordWorkflowCatalog.ChainFor(record). */
export interface ATAWorkflowStageDto {
  order: number
  title: string
  /** Printed caption of the signature block this stage signs: "Prepared by" etc. */
  caption: string
  /** ApprovalStatus value the record sits in WHILE this stage is pending. */
  status: number
  roleLabels: string[]
  isOptional: boolean
}

/** Server-computed permission object (IATARecordAuthorizationService). */
export interface ATARecordCapabilitiesDto {
  canView: boolean
  canEdit: boolean
  canSubmit: boolean
  canApprove: boolean
  canReject: boolean
  canRequestRevision: boolean
  canDelegate: boolean
  approvalStatus: number
  revisionNumber: number
  currentStageOrder: number | null
  currentStageTitle: string
  currentStageCaption: string
  nextStageTitle: string
  eligibleRoles: string[]
  chain: ATAWorkflowStageDto[]
  /** True only when computed client-side because the endpoint is not deployed yet. */
  computedFallback?: boolean

  // ===== AMENDED v26 — ROLE-BASED WORKFLOW SIMPLIFICATION =====================
  // All four are OPTIONAL so a server payload predating the amendment still
  // normalizes cleanly and no existing consumer breaks.

  /**
   * SCENARIO A verb. True when the caller may CONFIRM the record, i.e. finalize it in one
   * step (POST /ata-records/{id}/confirm) with an OPTIONAL comment. Confirm and Reject are
   * mutually exclusive by design: on an originator-led record `canReject` is false.
   */
  canConfirm?: boolean

  /**
   * True when the record is ORIGINATOR-LED (prepared by a leader-tier role acting in their
   * own capacity). Drives the whole action bar: Confirm instead of Approve+Reject, and no
   * "send back for revision", because there is nobody downstream to send it back to.
   */
  isOriginatorLed?: boolean

  /**
   * True when the approve / confirm action should surface the OPTIONAL approval comment
   * field. Defaults to true — the requirement asks for the comment box on every approval.
   */
  approvalCommentEnabled?: boolean

  /**
   * Set when the caller's authority for this record comes from a LIVE delegation rather
   * than from their own role. Purely informational (disclosure + audit messaging); it
   * never widens a permission on its own — the individual `can*` flags already did.
   */
  delegatedAuthority?: {
    /** Responsibility key backing the grant, e.g. 'ata_record_workflow'. */
    responsibility: string
    /** Display name of the leader who granted it. */
    delegatedBy: string
  } | null
}

/**
 * One frozen line of the append-only ATARecordSignature trail
 * (CMT.Domain/Models/SelfEvaluation/ATARecordGovernance.cs).
 * `provisional` marks a line reconstructed from WorkflowAuditLog rows by the frontend
 * while the Phase 1 signature endpoints are not deployed; it never comes from the server.
 */
export interface ATARecordSignatureEntryDto {
  id: string
  stageOrder: number
  stageStatus: number
  resultingStatus: number
  block: number
  blockCaption: string
  userId: number | null
  personName: string
  personRole: string
  personRoleLabel: string
  signedAt: string
  userSignatureId?: string | null
  signatureStoragePath?: string | null
  signatureFileName?: string | null
  signatureImageApplied: boolean
  actionTaken: number
  comments: string
  isCurrent: boolean
  supersededAt?: string | null
  recordRevisionNumber: number
  /** AMENDED v19: true for audit-log-derived provisional lines (frontend only). */
  provisional?: boolean
}

/** Where the rendered trail came from. */
export type ATARecordTrailSource = 'server' | 'audit' | 'none'

// =====================================================================================
// 4c. ATA APPROVAL WORKFLOW — ROLE-BASED SIMPLIFICATION  (AMENDED v26)
//
// Mirrors the amended backend:
//   CMT.Application/Commands/SelfEvaluation/ATARecordCommands.cs        (v24)
//   CMT.Application/CommandHandlers/SelfEvaluation/ATARecordCommandHandler.cs (v24)
//   CMT.Web.Api/Controllers/SelfEvaluation/ATARecordController.cs       (v24)
//
// THE TWO PATHS, verbatim from the requirement:
//
//   SCENARIO A — a Shop Team Leader creates or edits the record.
//     The record is ORIGINATOR-LED. There is no counter-signature to collect, so:
//       • the action bar offers CONFIRM with an OPTIONAL comment field,
//       • no Reject button is rendered (the leader amends instead),
//       • confirming finalizes the record IMMEDIATELY (ApprovalStatus.Approved).
//
//   SCENARIO B — an Engineer or a DELEGATE creates the record.
//     It routes to the Shop Team Leader, who holds FULL authority:
//       • edit the record directly (even while it sits in the review stage),
//       • send it back for revision — the record STAYS ALIVE,
//       • approve with an OPTIONAL comment, or reject with a MANDATORY reason.
//     The Shop Team Leader's acceptance is the last signable step, so the record becomes
//     Approved unless it explicitly opted into a QA / Director / ECAA stage.
//
// WHY THESE HELPERS LIVE HERE AND IMPORT NOTHING:
//   `role-utils` -> `role-hierarchy` already imports this module. Importing `normalizeRole`
//   back would create exactly the circular import this file's header warns about (and it
//   would break `ApprovalStatus` at module-init time). So the role canonicalization below
//   is deliberately local, dependency-free and alias-tolerant.
// =====================================================================================

/**
 * Suffix the backend appends to `ATARecord.CreatorRole` when the preparer acted under a
 * delegation (ATARecordCommandHandler.DelegatedRoleMarker).
 *
 * A delegate-prepared record is deliberately NOT originator-led: per Scenario B it must
 * still route to the Shop Team Leader, so a delegate can never finalize their own work.
 */
export const DELEGATED_ROLE_MARKER = ':delegated'

/**
 * Roles that own the Shop Team Leader confirmation authority. Mirrors
 * `ATARecordCommandHandler.LeaderTierRoles`; Admin is the universal supervisor.
 *
 * KEEP IN SYNC WITH THE SERVER. The client copy only decides what to RENDER — the server
 * re-checks every action, so a stale entry here can hide a button but never grant one.
 */
export const LEADER_TIER_ROLES: readonly string[] = [
  'team_leader',
  'shop_tl',
  'shop_manager',
  'special_team_leader',
  'admin',
]

/** Alias spellings that arrive from JWT claims, legacy rows or printed captions. */
const ROLE_ALIASES: Readonly<Record<string, string>> = {
  shop_team_leader: 'team_leader',
  shopteamleader: 'team_leader',
  stl: 'team_leader',
  teamleader: 'team_leader',
  shoptl: 'team_leader',
  shop_manager_role: 'shop_manager',
  shopmanager: 'shop_manager',
  special_teamleader: 'special_team_leader',
  specialteamleader: 'special_team_leader',
  administrator: 'admin',
  special_admin: 'special_admin',
  specialadmin: 'special_admin',
  'special admin': 'special_admin',
}

/**
 * Dependency-free role canonicalization: lower-cases, collapses spaces / hyphens /
 * dots into underscores, strips the ':delegated' marker and resolves known aliases.
 * Returns '' for a missing role — an ABSENT role must never inherit any authority.
 */
export function canonicalizeRoleToken(role: string | null | undefined): string {
  if (!role) return ''
  let token = String(role).trim().toLowerCase()
  if (!token) return ''

  // Drop the delegation marker (and anything after it) before matching.
  const markerAt = token.indexOf(DELEGATED_ROLE_MARKER)
  if (markerAt >= 0) token = token.slice(0, markerAt)

  token = token.replace(/[\s.\-/]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  if (!token) return ''

  return ROLE_ALIASES[token] ?? token
}

/** True when the role alone carries Shop-Team-Leader-level confirmation authority. */
export function isLeaderTierRole(role: string | null | undefined): boolean {
  const canonical = canonicalizeRoleToken(role)
  return canonical.length > 0 && LEADER_TIER_ROLES.includes(canonical)
}

/**
 * True when the frozen creator role carries the ':delegated' marker, i.e. the record was
 * prepared by someone acting under a delegation rather than in their own leader capacity.
 */
export function isDelegatedCreatorRole(creatorRole: string | null | undefined): boolean {
  if (!creatorRole) return false
  return String(creatorRole).toLowerCase().includes(DELEGATED_ROLE_MARKER)
}

/** Identity of the signed-in viewer, used only by the fail-closed fallback below. */
export interface ATARecordOriginatorContext {
  /** Numeric backend id of the signed-in user (User.Id is a long). */
  currentUserId?: string | number | null
  /** Display name of the signed-in user, matched against `record.createdBy`. */
  currentUserName?: string | null
  /** Role of the signed-in user, any alias spelling. */
  currentUserRole?: string | null
}

/**
 * SCENARIO A vs SCENARIO B — the single source of truth for the whole client.
 *
 * Mirrors `ATARecordCommandHandler.IsOriginatorLed(record)`:
 *   originator-led  <=>  CreatorRole is leader-tier AND was not stamped ':delegated'.
 *
 * WHEN `creatorRole` IS ABSENT (the backend DTO does not expose it yet) the answer FAILS
 * CLOSED: the record is treated as originator-led only when the signed-in viewer is
 * PROVABLY the preparer (matching user id, or matching display name when no id is
 * available) AND holds a leader-tier role in their own right. Consequences of that
 * conservative choice, both of them safe:
 *   • a Shop Team Leader opening their own record sees Confirm — correct;
 *   • anyone else sees the Scenario B bar, where the server is still the final authority
 *     and will refuse an action the caller may not take.
 */
export function isOriginatorLedRecord(
  record: ATARecordDto | null | undefined,
  context: ATARecordOriginatorContext = {},
): boolean {
  if (!record) return false

  const frozenRole = (record.creatorRole ?? '').trim()
  if (frozenRole) {
    // The server told us who prepared it: that answer is authoritative.
    if (isDelegatedCreatorRole(frozenRole)) return false
    return isLeaderTierRole(frozenRole)
  }

  // ----- fail-closed fallback (no CreatorRole on the wire) -----
  if (!isLeaderTierRole(context.currentUserRole)) return false

  const preparerId =
    record.createdByUserId != null && record.createdByUserId !== ''
      ? String(record.createdByUserId)
      : ''
  const viewerId =
    context.currentUserId != null && context.currentUserId !== ''
      ? String(context.currentUserId)
      : ''
  if (preparerId && viewerId) return preparerId === viewerId

  const preparerName = (record.createdBy ?? '').trim().toLowerCase()
  const viewerName = (context.currentUserName ?? '').trim().toLowerCase()
  return Boolean(preparerName && viewerName && preparerName === viewerName)
}

/** True once the record is terminal: nothing may be edited, confirmed or rejected. */
export function isATARecordFinalized(status: ApprovalStatus | number | null | undefined): boolean {
  return status === ApprovalStatus.Approved || status === ApprovalStatus.Rejected
}

/** True while the record is still with its preparer (pre-submission window). */
export function isATARecordWithOriginator(status: ApprovalStatus | number | null | undefined): boolean {
  return status === ApprovalStatus.Draft || status === ApprovalStatus.Returned
}

/** Every verb the ATA Record action bar can render. */
export type ATAWorkflowActionKind =
  | 'edit'
  | 'submit'
  | 'confirm'
  | 'approve'
  | 'reject'
  | 'return'
  | 'delegate'

/**
 * Body of POST /ata-records/{id}/approve  (ApproveATARecordCommand v24).
 * `comments` is the OPTIONAL approval comment surfaced on the approve button — an empty
 * string is a perfectly valid approval and is persisted as "No comment provided".
 * ActorRole / ActorUserId are stamped from the JWT server-side; NEVER send them.
 */
export interface ATAApprovalCommentPayload {
  comments?: string
}

/**
 * Body of POST /ata-records/{id}/confirm  (ConfirmATARecordCommand v24).
 * SCENARIO A: finalizes the record immediately. The comment is OPTIONAL.
 */
export interface ATAConfirmPayload {
  comments?: string
}

/**
 * Body of POST /ata-records/{id}/return  (ReturnATARecordForRevisionCommand v24).
 * SCENARIO B: the record returns to the preparer and STAYS ALIVE. Comments are MANDATORY —
 * the controller answers 400 ATA_RETURN_COMMENTS_REQUIRED when they are blank.
 */
export interface ATAReturnForRevisionPayload {
  comments: string
}

/**
 * Body of POST /ata-records/{id}/reject  (RejectATARecordCommand v24).
 * Terminal outcome; the reason is MANDATORY. Refused outright on an originator-led record.
 */
export interface ATARejectPayload {
  reason: string
}

export interface CapabilityAssessmentDto {
  id: string
  componentId: string
  componentPartNumber: string
  componentDescription: string
  shopId: string
  status: CapabilityStatus
  justification: string
  hasRequiredTooling: boolean
  hasRequiredTraining: boolean
  hasTechnicalData: boolean
  hasRequiredFacilities: boolean
  limitations: string
  correctiveActions: string
  assessmentDate: string | null
  nextReviewDate: string | null
  assessedBy: string
  approvedBy: string
}

export interface AirworthinessDirectiveDto {
  id: string
  adNumber: string
  title: string
  description: string
  effectiveDate: string | null
  applicability: DirectiveApplicability
  complianceStatus: ComplianceStatus
  complianceMethod: string
  notes: string
  componentId: string
}

export interface ServiceBulletinDto {
  id: string
  sbNumber: string
  title: string
  description: string
  issueDate: string | null
  revisionDate: string | null
  revision: string
  category: BulletinCategory
  complianceStatus: ComplianceStatus
  complianceNotes: string
  componentId: string
}

export interface ToolNeedsAnalysisDto {
  id: string
  toolName: string
  toolPartNumber: string
  description: string
  manufacturer: string
  status: ToolStatus
  calibrationDueDate: string | null
  calibrationInterval: string
  storageLocation: string
  quantityRequired: number
  quantityAvailable: number
  componentId: string
  componentPartNumber: string
  shopId: string
}

export interface SelfAuditChecklistDto {
  id: string
  section: string
  itemNumber: string
  question: string
  regulatoryReference: string
  complianceStatus: ComplianceStatus
  findings: string
  correctiveAction: string
  dueDate: string | null
  completionDate: string | null
  assignedTo: string
  auditStatus: AuditStatus
  shopId: string
}

export interface WorkflowAuditLogDto {
  id: string
  action: string
  workflowAction: WorkflowAction
  entityType: string
  entityId: string
  performedBy: string
  /**
   * Role of the user who performed the action (e.g., Manager, Engineer, STL, Director).
   * Helps identify the authority level and context of the action.
   */
  userRole: string
  details: string
  /**
   * JSON representation of the previous state/values before the change.
   */
  previousValues: string
  /**
   * JSON representation of the new state/values after the change.
   */
  newValues: string
  timestamp: string
}

export interface EmployeeProficiencyDto {
  id: string
  employeeName: string
  employeeId: string
  jobTitle: string
  department: string
  certifications: string
  proficiencyLevel: ProficiencyLevel
  skillAreas: string
  lastTrainingDate: string | null
  nextTrainingDue: string | null
  trainingHistory: string
  isActive: boolean
  shopId: string
}

export interface ResponsibilityDelegationDto {
  id: string
  delegatedBy: string
  delegatedTo: string
  responsibility: string
  scope: string
  status: DelegationStatus
  effectiveDate: string
  expirationDate: string | null
  shopId: string
}

export interface ShopDashboardSummaryDto {
  shopId: string
  shopName: string
  totalComponents: number
  fullCapabilityCount: number
  limitedCapabilityCount: number
  noCapabilityCount: number
  pendingAuditItems: number
  overdueAuditItems: number
  activeEmployees: number
  toolsNeedingCalibration: number
  activeDelegations: number
}

// =====================================================================================
// 5. HELPER FUNCTIONS
//    (getApprovalStatusLabel / Color / Icon and canPerformAction are NO LONGER declared
//     here — they are re-exported from ./types-workflow-bridge in section 0.)
// =====================================================================================

export function getCapabilityStatusLabel(status: CapabilityStatus): string {
  switch (status) {
    case CapabilityStatus.NotAssessed: return 'Not Assessed'
    case CapabilityStatus.FullCapability: return 'Full Capability'
    case CapabilityStatus.LimitedCapability: return 'Limited Capability'
    case CapabilityStatus.NoCapability: return 'No Capability'
    case CapabilityStatus.UnderDevelopment: return 'Under Development'
    default: return 'Unknown'
  }
}

export function getCapabilityStatusColor(status: CapabilityStatus): string {
  switch (status) {
    case CapabilityStatus.NotAssessed: return 'bg-gray-100 text-gray-800'
    case CapabilityStatus.FullCapability: return 'bg-green-100 text-green-800'
    case CapabilityStatus.LimitedCapability: return 'bg-yellow-100 text-yellow-800'
    case CapabilityStatus.NoCapability: return 'bg-red-100 text-red-800'
    case CapabilityStatus.UnderDevelopment: return 'bg-blue-100 text-blue-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

export function getComplianceStatusLabel(status: ComplianceStatus): string {
  switch (status) {
    case ComplianceStatus.NotReviewed: return 'Not Reviewed'
    case ComplianceStatus.Compliant: return 'Compliant'
    case ComplianceStatus.NonCompliant: return 'Non-Compliant'
    case ComplianceStatus.PartiallyCompliant: return 'Partially Compliant'
    case ComplianceStatus.NotApplicable: return 'N/A'
    default: return 'Unknown'
  }
}

export function getComplianceStatusColor(status: ComplianceStatus): string {
  switch (status) {
    case ComplianceStatus.Compliant: return 'bg-green-100 text-green-800'
    case ComplianceStatus.NonCompliant: return 'bg-red-100 text-red-800'
    case ComplianceStatus.PartiallyCompliant: return 'bg-yellow-100 text-yellow-800'
    case ComplianceStatus.NotApplicable: return 'bg-blue-100 text-blue-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

export function getAuditStatusLabel(status: AuditStatus): string {
  switch (status) {
    case AuditStatus.NotStarted: return 'Not Started'
    case AuditStatus.InProgress: return 'In Progress'
    case AuditStatus.Completed: return 'Completed'
    case AuditStatus.RequiresFollowUp: return 'Requires Follow-Up'
    case AuditStatus.Closed: return 'Closed'
    default: return 'Unknown'
  }
}

export function getAuditStatusColor(status: AuditStatus): string {
  switch (status) {
    case AuditStatus.NotStarted: return 'bg-gray-100 text-gray-800'
    case AuditStatus.InProgress: return 'bg-blue-100 text-blue-800'
    case AuditStatus.Completed: return 'bg-green-100 text-green-800'
    case AuditStatus.RequiresFollowUp: return 'bg-yellow-100 text-yellow-800'
    case AuditStatus.Closed: return 'bg-emerald-100 text-emerald-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

export function getToolStatusLabel(status: ToolStatus): string {
  switch (status) {
    case ToolStatus.NotRequired: return 'Not Required'
    case ToolStatus.Required: return 'Required'
    case ToolStatus.Available: return 'Available'
    case ToolStatus.OnOrder: return 'On Order'
    case ToolStatus.NeedsCalibration: return 'Needs Calibration'
    case ToolStatus.OutOfService: return 'Out of Service'
    default: return 'Unknown'
  }
}

export function getToolStatusColor(status: ToolStatus): string {
  switch (status) {
    case ToolStatus.NotRequired: return 'bg-gray-100 text-gray-600'
    case ToolStatus.Required: return 'bg-orange-100 text-orange-800'
    case ToolStatus.Available: return 'bg-green-100 text-green-800'
    case ToolStatus.OnOrder: return 'bg-blue-100 text-blue-800'
    case ToolStatus.NeedsCalibration: return 'bg-yellow-100 text-yellow-800'
    case ToolStatus.OutOfService: return 'bg-red-100 text-red-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

export function getDirectiveApplicabilityLabel(applicability: DirectiveApplicability): string {
  switch (applicability) {
    case DirectiveApplicability.NotDetermined: return 'Not Determined'
    case DirectiveApplicability.Applicable: return 'Applicable'
    case DirectiveApplicability.NotApplicable: return 'Not Applicable'
    case DirectiveApplicability.Superseded: return 'Superseded'
    default: return 'Unknown'
  }
}

export function getDirectiveApplicabilityColor(applicability: DirectiveApplicability): string {
  switch (applicability) {
    case DirectiveApplicability.NotDetermined: return 'bg-gray-100 text-gray-800'
    case DirectiveApplicability.Applicable: return 'bg-green-100 text-green-800'
    case DirectiveApplicability.NotApplicable: return 'bg-blue-100 text-blue-800'
    case DirectiveApplicability.Superseded: return 'bg-purple-100 text-purple-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

export function getBulletinCategoryLabel(category: BulletinCategory): string {
  switch (category) {
    case BulletinCategory.Mandatory: return 'Mandatory'
    case BulletinCategory.Recommended: return 'Recommended'
    case BulletinCategory.Optional: return 'Optional'
    case BulletinCategory.Alert: return 'Alert'
    default: return 'Unknown'
  }
}

export function getBulletinCategoryColor(category: BulletinCategory): string {
  switch (category) {
    case BulletinCategory.Mandatory: return 'bg-red-100 text-red-800'
    case BulletinCategory.Recommended: return 'bg-blue-100 text-blue-800'
    case BulletinCategory.Optional: return 'bg-gray-100 text-gray-800'
    case BulletinCategory.Alert: return 'bg-amber-100 text-amber-800'
    default: return 'bg-gray-100 text-gray-800'
  }
}

export function getWorkflowActionLabel(action: WorkflowAction): string {
  switch (action) {
    case WorkflowAction.Created: return 'Created'
    case WorkflowAction.Updated: return 'Updated'
    case WorkflowAction.Submitted: return 'Submitted'
    case WorkflowAction.Approved: return 'Approved'
    case WorkflowAction.Rejected: return 'Rejected'
    case WorkflowAction.Delegated: return 'Delegated'
    case WorkflowAction.Completed: return 'Completed'
    case WorkflowAction.Archived: return 'Archived'
    case WorkflowAction.Added: return 'Added'
    case WorkflowAction.Deleted: return 'Deleted'
    case WorkflowAction.Amended: return 'Amended'
    case WorkflowAction.ReturnedForRevision: return 'Returned for Revision'
    case WorkflowAction.AssignmentChanged: return 'Assignment Changed'
    default: return 'Unknown'
  }
}

export function getProficiencyLevelLabel(level: ProficiencyLevel): string {
  switch (level) {
    case ProficiencyLevel.NotRated: return 'Not Rated'
    case ProficiencyLevel.Trainee: return 'Trainee'
    case ProficiencyLevel.Supervised: return 'Supervised'
    case ProficiencyLevel.Competent: return 'Competent'
    case ProficiencyLevel.Expert: return 'Expert'
    case ProficiencyLevel.Instructor: return 'Instructor'
    default: return 'Unknown'
  }
}

// =====================================================================================
// 6. Shop Capability and Responsible Workshop filtering  (unchanged)
// =====================================================================================

/**
 * Parse a comma-separated authority/workshop string into an array of values.
 * Handles whitespace and empty strings gracefully.
 */
export function parseMultiSelectField(value: string): string[] {
  if (!value || value.trim() === '') return []
  return value.split(',').map(v => v.trim()).filter(v => v.length > 0)
}

/**
 * Check if a record matches a Shop Capability filter. 'ALL' matches everything.
 */
export function matchesShopCapabilityFilter(record: ATARecordDto, filter: ShopCapabilityFilter): boolean {
  if (filter === 'ALL') return true
  const authorities = parseMultiSelectField(record.authority)
  return authorities.includes(filter)
}

/**
 * Check if a record matches a Responsible Workshop filter. 'ALL' matches everything.
 */
export function matchesResponsibleWorkshopFilter(record: ATARecordDto, filter: ResponsibleWorkshopFilter): boolean {
  if (filter === 'ALL') return true
  const workshops = parseMultiSelectField(record.responsibleWorkshop)
  return workshops.includes(filter)
}

/**
 * Count records matching each Shop Capability category.
 */
export function getShopCapabilityCounts(records: ATARecordDto[]): Record<ShopCapabilityFilter, number> {
  const counts: Record<ShopCapabilityFilter, number> = {
    ALL: records.length,
    ECAA: 0,
    FAA: 0,
    EASA: 0,
  }
  for (const record of records) {
    const authorities = parseMultiSelectField(record.authority)
    if (authorities.includes('ECAA')) counts.ECAA++
    if (authorities.includes('FAA')) counts.FAA++
    if (authorities.includes('EASA')) counts.EASA++
  }
  return counts
}

/**
 * Count records matching each Responsible Workshop category.
 */
export function getResponsibleWorkshopCounts(records: ATARecordDto[]): Record<ResponsibleWorkshopFilter, number> {
  const counts: Record<ResponsibleWorkshopFilter, number> = {
    ALL: records.length,
    Galley: 0,
    Electric: 0,
  }
  for (const record of records) {
    const workshops = parseMultiSelectField(record.responsibleWorkshop)
    if (workshops.includes('Galley')) counts.Galley++
    if (workshops.includes('Electric')) counts.Electric++
  }
  return counts
}