/**
 * =====================================================================================
 * AMENDED v15 - CMT.Frontend/src/lib/self-evaluation/types-workflow-bridge.ts  (NEW FILE)
 * Copy to: CMT.Frontend/src/lib/self-evaluation/types-workflow-bridge.ts
 *
 * WHAT THIS FILE IS
 * -----------------
 * The MIGRATION SHIM between the legacy `src/lib/self-evaluation/types.ts` and the v11
 * mirror `src/lib/workflow/workflow-types.ts`.
 *
 * WHY IT IS NEEDED
 * ----------------
 * `self-evaluation/types.ts` still declares its OWN ApprovalStatus with only 8 members
 * (Draft = 0 .. Returned = 7) plus `getApprovalStatusLabel`, `getApprovalStatusColor`,
 * `getApprovalStatusIcon` and `canPerformAction`. The backend now persists values up to
 * 30 (PendingAmendmentApproval), so today:
 *
 *   - `getApprovalStatusLabel(13)`  -> "Unknown"          (should be "Pending Documentation Team")
 *   - `getApprovalStatusColor(19)`  -> grey               (should be the amber Pending bucket)
 *   - `canPerformAction('approve', 14, 'documentation_clerk')` -> FALSE for all 23 new
 *     statuses, because the switch has no case for them and the UserRole union has no
 *     Documentation / HR / Inspector member at all. Every Documentation, AD, TNA, Training,
 *     918 and Amendment record therefore renders as un-actionable even though the server
 *     WOULD accept the action.
 *
 * WHY A SHIM INSTEAD OF EDITING types.ts DIRECTLY
 * ----------------------------------------------
 * ~40 components import `ApprovalStatus`, `getApprovalStatusLabel` and
 * `getApprovalStatusColor` from '@/lib/self-evaluation/types'. Rewriting that file in one
 * step would force all of them to change at once. Instead:
 *
 *   STEP 1 (this file)  - provide drop-in replacements built on the v11 enum.
 *   STEP 2 (types.ts)   - delete the truncated enum + the four helpers and RE-EXPORT from
 *                         here, so every existing import keeps compiling but now resolves
 *                         to the 31-member truth:
 *
 *       // ---- REMOVE from src/lib/self-evaluation/types.ts ----
 *       // export enum ApprovalStatus { Draft = 0, ... Returned = 7 }
 *       // export function getApprovalStatusLabel(...)  { ... }
 *       // export function getApprovalStatusColor(...)  { ... }
 *       // export function getApprovalStatusIcon(...)   { ... }
 *       // export function canPerformAction(...)        { ... }
 *
 *       // ---- ADD to src/lib/self-evaluation/types.ts ----
 *       export {
 *         ApprovalStatus,
 *         getApprovalStatusLabel,
 *         getApprovalStatusColor,
 *         getApprovalStatusIcon,
 *         canPerformAction,
 *         APPROVAL_PROGRESS_STEPS,
 *       } from './types-workflow-bridge'
 *
 * IMPORTANT: `role-hierarchy.ts` imports ApprovalStatus from '@/lib/workflow/workflow-types',
 * and this file does the same, so after step 2 there is exactly ONE ApprovalStatus in the
 * whole client and the enum can never drift again.
 *
 * DEPRECATION NOTICE
 * ------------------
 * `canPerformAction()` below is kept ONLY so the legacy call sites keep compiling. It is a
 * ROLE-SHAPED GUESS and it does not know about assignment ownership, functional-unit scope,
 * exclusive designation, checklist gates or the regulatory date. NEW CODE MUST USE
 * `resolveCanAct()` / `stepActionState()` from '@/lib/workflow/workflow-permissions', which
 * read the server's own canIAct / canIAssign / canIDelegate / canISkip flags.
 * =====================================================================================
 */

import {
  ApprovalStatus,
  FormLifecycleState,
  approvalStatusClasses,
  approvalStatusLabel,
  isPendingStatus,
  isWithOriginator,
  lifecycleStateOf,
} from '@/lib/workflow/workflow-types'

import { ORG_ROLES, isAnyRole, normalizeRole } from '@/lib/role-hierarchy'

// Re-exported so `export { ApprovalStatus } from './types-workflow-bridge'` works in types.ts.
export { ApprovalStatus }

// =====================================================================================
// 1. DROP-IN REPLACEMENTS FOR THE FOUR LEGACY HELPERS
// =====================================================================================

/**
 * Replaces the old 8-case switch. Covers all 31 statuses.
 * PREFER the `statusLabel` string the API already delivers; this is the offline fallback.
 */
export function getApprovalStatusLabel(status: ApprovalStatus): string {
  return approvalStatusLabel(status)
}

/**
 * Replaces the old colour switch with the LIFECYCLE BUCKET colouring of the v11 mirror, so
 * all 23 new pending statuses render amber instead of grey "Unknown".
 * Text and background always contrast (dark text on a light background).
 */
export function getApprovalStatusColor(status: ApprovalStatus): string {
  return approvalStatusClasses(status)
}

/** Replaces the old icon switch; driven by the lifecycle bucket, not by the raw number. */
export function getApprovalStatusIcon(status: ApprovalStatus): string {
  switch (lifecycleStateOf(status)) {
    case FormLifecycleState.Draft:
      return '○'
    case FormLifecycleState.Pending:
      return '◑'
    case FormLifecycleState.Approved:
      return '●'
    case FormLifecycleState.Skipped:
      return '⤼'
    case FormLifecycleState.Expired:
      return '⌛'
    case FormLifecycleState.ActionRequired:
      return '✕'
    default:
      return '?'
  }
}

// =====================================================================================
// 2. THE PROGRESS DOTS
// =====================================================================================

/**
 * The old progress strip hardcoded six statuses and compared them with `currentStatus >= step`.
 * That comparison is meaningless now: PendingDocumentationClerk (14) is NOT "further along"
 * than PendingManagerApproval (2) - they belong to different chains entirely.
 *
 * The generic chain below is used ONLY when no workflow instance is loaded. As soon as an
 * instance is available, render `instance.steps` (completedSteps / totalSteps) instead - that
 * is the real chain of THAT form, whatever its routing is.
 */
export const APPROVAL_PROGRESS_STEPS: ApprovalStatus[] = [
  ApprovalStatus.Draft,
  ApprovalStatus.PendingTeamLeaderReview,
  ApprovalStatus.PendingManagerApproval,
  ApprovalStatus.PendingDirectorApproval,
  ApprovalStatus.PendingQAApproval,
  ApprovalStatus.Approved,
]

/** Lifecycle-bucket-driven dot colour; never uses a numeric `>=` comparison. */
export function progressDotClasses(status: ApprovalStatus, step: ApprovalStatus): string {
  const state = lifecycleStateOf(status)

  if (state === FormLifecycleState.ActionRequired) return 'bg-red-300'
  if (state === FormLifecycleState.Expired) return 'bg-orange-300'
  if (state === FormLifecycleState.Skipped && step === status) return 'bg-sky-400'
  if (state === FormLifecycleState.Approved) return 'bg-emerald-500'
  if (status === step) return 'bg-amber-500'

  const order = APPROVAL_PROGRESS_STEPS.indexOf(status)
  const stepOrder = APPROVAL_PROGRESS_STEPS.indexOf(step)
  if (order >= 0 && stepOrder >= 0 && stepOrder < order) return 'bg-emerald-500'
  return 'bg-gray-200'
}

// =====================================================================================
// 3. THE LEGACY ROLE GATE  (DEPRECATED - kept for compilation only)
// =====================================================================================

/**
 * Roles that legitimately own each pending status. This is the ROLE column of the Functional
 * Workflow Matrix and nothing else: it deliberately ignores assignment ownership, shop and
 * functional-unit scope, exclusive designation, checklist gates and the regulatory date,
 * because a static map cannot know them.
 *
 * @deprecated Use `resolveCanAct()` from '@/lib/workflow/workflow-permissions'.
 */
const STATUS_OWNER_ROLES: Partial<Record<ApprovalStatus, string[]>> = {
  // ---------- generic chain ----------
  [ApprovalStatus.PendingTeamLeaderReview]: [
    ORG_ROLES.TeamLeader,
    ORG_ROLES.ShopManager,
    ORG_ROLES.SpecialTeamLeader,
  ],
  [ApprovalStatus.PendingManagerApproval]: [ORG_ROLES.Manager, ORG_ROLES.ShopManager],
  [ApprovalStatus.PendingDirectorApproval]: [ORG_ROLES.Director],
  [ApprovalStatus.PendingQAApproval]: [ORG_ROLES.QAPersonnel],

  // ---------- New ATA Record management (#4) ----------
  [ApprovalStatus.PendingAssignment]: [
    ORG_ROLES.TeamLeader,
    ORG_ROLES.SpecialTeamLeader,
    ORG_ROLES.ShopManager,
  ],
  [ApprovalStatus.PendingCertifyingStaffAction]: [ORG_ROLES.CertifyingStaff],
  [ApprovalStatus.PendingEngineerAction]: [ORG_ROLES.Engineer],

  // ---------- Documentation & AD / SB (#5) ----------
  [ApprovalStatus.PendingDocumentationTeam]: [ORG_ROLES.DocumentationTeamLeader],
  [ApprovalStatus.PendingDocumentationClerk]: [ORG_ROLES.DocumentationClerk],
  [ApprovalStatus.PendingDocumentationLeaderSignOff]: [ORG_ROLES.DocumentationTeamLeader],
  /** MNT-1420B: the STL holds SOLE authority to draft, process and issue. */
  [ApprovalStatus.PendingShopTeamLeaderIssue]: [ORG_ROLES.TeamLeader],

  // ---------- Tools & Equipment (#6 / #7) ----------
  [ApprovalStatus.PendingSpecialTeamLeaderApproval]: [ORG_ROLES.SpecialTeamLeader],
  [ApprovalStatus.PendingInhouseProcess]: [ORG_ROLES.Engineer, ORG_ROLES.TeamLeader],

  // ---------- Training & qualification ----------
  [ApprovalStatus.PendingHRVerification]: [ORG_ROLES.HRSpecialist],
  [ApprovalStatus.PendingHRManagerApproval]: [ORG_ROLES.HRManager],
  [ApprovalStatus.PendingRequesterVerification]: [ORG_ROLES.TeamLeader],
  [ApprovalStatus.PendingInspectorReview]: [ORG_ROLES.Inspector],
  [ApprovalStatus.PendingInspectorApproval]: [ORG_ROLES.Inspector],
  [ApprovalStatus.PendingTechnicianSignOff]: [ORG_ROLES.Technician],

  // ---------- Regulatory compliance 918 / 918A (#9) ----------
  [ApprovalStatus.PendingECAAEndorsement]: [ORG_ROLES.ECAAPersonnel],
  [ApprovalStatus.PendingSelfAuditCheck]: [
    ORG_ROLES.QAPersonnel,
    ORG_ROLES.TeamLeader,
    ORG_ROLES.Manager,
  ],

  // ---------- Folder level (#11 / #13) ----------
  [ApprovalStatus.PendingFinalSignOff]: [
    ORG_ROLES.Director,
    ORG_ROLES.Manager,
    ORG_ROLES.ShopManager,
    ORG_ROLES.TeamLeader,
  ],
  [ApprovalStatus.PendingAmendmentApproval]: [
    ORG_ROLES.Director,
    ORG_ROLES.Manager,
    ORG_ROLES.HRManager,
    ORG_ROLES.TeamLeader,
  ],

  // ---------- AMENDED v14 - delegated-review excursion ----------
  /**
   * While the record sits in PendingDelegatedReview the step is held by the delegated
   * REVIEWER pool of the step under review (union of every pool the catalog declares).
   * The legacy helper cannot know WHICH step is under review, so this is the widest
   * role-shaped answer; `resolveCanAct()` / `stepActionState()` remain the real decision.
   */
  [ApprovalStatus.PendingDelegatedReview]: [
    ORG_ROLES.Manager,
    ORG_ROLES.ShopManager,
    ORG_ROLES.TeamLeader,
    ORG_ROLES.Engineer,
    ORG_ROLES.CertifyingStaff,
    ORG_ROLES.Inspector,
    ORG_ROLES.Technician,
    ORG_ROLES.QAPersonnel,
    ORG_ROLES.HRSpecialist,
    ORG_ROLES.DocumentationClerk,
  ],
}

/** Roles that own a pending status - exported so a tooltip can name them. */
export function ownerRolesOf(status: ApprovalStatus): string[] {
  return STATUS_OWNER_ROLES[status] ?? []
}

/**
 * @deprecated Legacy signature kept so existing components compile. It answers ONLY the role
 * question. Use `resolveCanAct()` / `stepActionState()` for a real decision.
 */
export function canPerformAction(
  action: 'approve' | 'reject' | 'delegate' | 'return' | 'skip' | 'assign',
  currentStatus: ApprovalStatus,
  userRole: string | null | undefined,
): boolean {
  const canonical = normalizeRole(userRole)
  if (!canonical) return false
  if (canonical === ORG_ROLES.Admin) return true

  // A record sitting with its originator (Draft / Rejected / Returned / Expired) has no
  // approver at all - it must be edited and resubmitted first.
  if (isWithOriginator(currentStatus)) return false
  if (!isPendingStatus(currentStatus)) return false

  const owners = ownerRolesOf(currentStatus)
  if (owners.length === 0) return false
  if (!isAnyRole(canonical, owners)) return false

  switch (action) {
    case 'approve':
    case 'reject':
      return true
    case 'return':
      // The Documentation Clerk and the Technician execute a task; they never return it.
      return canonical !== ORG_ROLES.DocumentationClerk && canonical !== ORG_ROLES.Technician
    case 'delegate':
    case 'assign':
      return isAnyRole(canonical, [
        ORG_ROLES.Director,
        ORG_ROLES.SpecialTeamLeader,
        ORG_ROLES.Manager,
        ORG_ROLES.HRManager,
        ORG_ROLES.DocumentationTeamLeader,
        ORG_ROLES.ShopManager,
        ORG_ROLES.TeamLeader,
      ])
    case 'skip':
      return isAnyRole(canonical, [
        ORG_ROLES.Director,
        ORG_ROLES.Manager,
        ORG_ROLES.SpecialTeamLeader,
        ORG_ROLES.TeamLeader,
        ORG_ROLES.ShopManager,
      ])
    default:
      return false
  }
}