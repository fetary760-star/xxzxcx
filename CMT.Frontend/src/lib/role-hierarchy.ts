/**
 * =====================================================================================
 * AMENDED v12 - CMT.Frontend/src/lib/role-hierarchy.ts
 * Copy to: CMT.Frontend/src/lib/role-hierarchy.ts   (REPLACES the whole existing file)
 *
 * WHAT THIS FILE IS
 * -----------------
 * The FRONTEND MIRROR of CMT.Domain/Models/Shared/RoleHierarchy.cs (v8) plus the two
 * files amended around it:
 *
 *   CMT.Domain/Models/Shared/RoleHierarchy.cs   -> OrgRoles, FunctionalUnits, aliases,
 *                                                 CreationMatrix, Rules, DefaultPermissions,
 *                                                 StandardChain, ApproverRolesFor
 *   CMT.Domain/Models/Shared/ApprovalStatus.cs  -> Permissions constants (v8 additions)
 *   CMT.Domain/Models/Workflow/WorkflowPermissionMatrix.cs -> Scopes + decision-code vocabulary
 *
 * WHY IT HAD TO BE AMENDED
 * ------------------------
 * The previous mirror was still the 11-role file while the server moved to the 16-role
 * Functional Workflow Matrix. The two disagreed on rows that decide whether a routing
 * step can reach a real human at all:
 *
 *   old mirror : 11 roles                 -> DocumentationTeamLeader (DL), DocumentationClerk,
 *                                            HRSpecialist, HRManager and Inspector DID NOT
 *                                            EXIST, so MNT-1420A steps 2/3, the HR training
 *                                            chain and MNT-1378 rendered "Unknown role" and
 *                                            every capability check returned false.
 *   old mirror : 31 permissions           -> form.return / form.skip / form.assign /
 *                                            form.signoff / folder.* / documentation.* /
 *                                            training.* / expiry.amend / revision.* /
 *                                            matrix.* / notification.view /
 *                                            workflow.view_audit were MISSING, so the
 *                                            privilege editor could not grant them and
 *                                            hasPermission() denied every v8 action.
 *   old mirror : truncated defaults       -> a Shop Team Leader looked unable to assign,
 *                                            skip, enrol training or complete a folder.
 *   old mirror : approverRolesFor()       -> returned [] for the 23 v8 statuses.
 *   old mirror : "ECAA Personnel"         -> the printed caption on MNT-918A is "ECAA Team".
 *   old mirror : ApprovalStatus import    -> came from '@/lib/self-evaluation/types', which
 *                                            still declares the truncated 8-member enum; it
 *                                            must come from the v11 workflow-types mirror.
 *
 * WHAT v12 GUARANTEES
 *   (1) 16 canonical roles in the SAME seniority order as RoleHierarchy.AllRoles, so
 *       rankOf() and the "strictly lower tier" delegation rule agree with the server.
 *   (2) The five v8 roles with their aliases, rules, functional units and default permissions.
 *   (3) FUNCTIONAL UNITS (Documentation / HumanResources / QualityAssurance / Authority)
 *       plus functionalUnitOf() and leadsFunctionalUnit(), so a unit QUEUE can be rendered
 *       instead of a single assignee.
 *   (4) The complete v8 Permissions vocabulary and the complete DefaultPermissions matrix.
 *   (5) SKIP_AUTHORITY_ROLES + canSkipSteps() for the skip logic
 *       ("Optional / May Skip Now", conditional in-house steps).
 *   (6) approverRolesFor() covering ALL 31 statuses, mirroring RoleHierarchy.ApproverRolesFor.
 *   (7) WORKFLOW_SCOPES mirroring WorkflowPermissionMatrix.Scopes, so the UI explains WHY a
 *       button is disabled using the same vocabulary the API returns.
 *
 * BINDING RULES (identical to WorkflowApiContracts.cs)
 *   - every USER id is a number (C# long); folder / instance / submission ids are string (Guid).
 *   - the SERVER is always the authority. This file is (a) the offline fallback for
 *     GET /api/users/creation-rules and GET /api/workflow/my-permissions, (b) the labelling
 *     aid, (c) the local pre-flight validator that stops an impossible request being sent.
 *     Never re-implement a routing decision the API already returns
 *     (canIAct / canIAssign / canIDelegate / canISkip / canIDraft).
 * =====================================================================================
 */

import { ApprovalStatus } from '@/lib/workflow/workflow-types'

// =====================================================================================
// 1. CANONICAL ROLES  (mirror of OrgRoles)
// =====================================================================================

export const ORG_ROLES = {
  Admin: 'Admin',
  SpecialAdmin: 'SpecialAdmin',
  Director: 'Director',
  SpecialTeamLeader: 'SpecialTeamLeader',
  Manager: 'Manager',
  ShopManager: 'ShopManager',
  /** Shop Team Leader (STL). The PERSISTED value stays "TeamLeader". */
  TeamLeader: 'TeamLeader',
  Engineer: 'Engineer',
  Technician: 'Technician',
  CertifyingStaff: 'CertifyingStaff',
  QAPersonnel: 'QAPersonnel',
  ECAAPersonnel: 'ECAAPersonnel',

  // ===== AMENDED v12: the five roles the Functional Workflow Matrix needs =====
  /** Documentation Team Leader (DL) - assigns clerks and signs off MNT-1420A. */
  DocumentationTeamLeader: 'DocumentationTeamLeader',
  /** Documentation Clerk - processes the bulletin entry assigned by the DL. */
  DocumentationClerk: 'DocumentationClerk',
  /** HR Specialist - verifies enrolments and updates training status records. */
  HRSpecialist: 'HRSpecialist',
  /** HR Manager - approves the verified training package. */
  HRManager: 'HRManager',
  /** Inspector - exclusive reviewer / approver of MNT-1378. */
  Inspector: 'Inspector',
} as const

export type OrgRole = (typeof ORG_ROLES)[keyof typeof ORG_ROLES]

/**
 * Top-to-bottom org chart order === seniority rank. MUST stay identical to
 * RoleHierarchy.AllRoles, because "delegate to strictly lower-tier staff" compares these
 * indexes on both sides of the wire.
 */
export const ALL_ROLES: OrgRole[] = [
  ORG_ROLES.Admin,
  ORG_ROLES.SpecialAdmin,
  ORG_ROLES.Director,
  ORG_ROLES.SpecialTeamLeader,
  ORG_ROLES.Manager,
  ORG_ROLES.HRManager,                 // v12 - department level, peer of Manager
  ORG_ROLES.DocumentationTeamLeader,   // v12 - unit leader under the Director
  ORG_ROLES.ShopManager,
  ORG_ROLES.TeamLeader,
  ORG_ROLES.HRSpecialist,              // v12
  ORG_ROLES.DocumentationClerk,        // v12
  ORG_ROLES.Engineer,
  ORG_ROLES.Inspector,                 // v12
  ORG_ROLES.CertifyingStaff,
  ORG_ROLES.QAPersonnel,
  ORG_ROLES.Technician,
  ORG_ROLES.ECAAPersonnel,
]

/** Mirror of RoleHierarchy.DisplayNames - these are the PRINTED labels on the forms. */
export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  Admin: 'Admin',
  SpecialAdmin: 'Special Admin',
  Director: 'Director',
  SpecialTeamLeader: 'Special Team Leader',
  Manager: 'Manager',
  ShopManager: 'Shop Manager',
  TeamLeader: 'Shop Team Leader',
  Engineer: 'Engineer',
  Technician: 'Technician',
  CertifyingStaff: 'Certifying Staff',
  QAPersonnel: 'QA Personnel',
  /** v12: the printed caption on MNT-918A is "ECAA Team", not "ECAA Personnel". */
  ECAAPersonnel: 'ECAA Team',
  DocumentationTeamLeader: 'Documentation Team Leader',
  DocumentationClerk: 'Documentation Clerk',
  HRSpecialist: 'HR Specialist',
  HRManager: 'HR Manager',
  Inspector: 'Inspector',
}

/** Short codes used by the Functional Workflow Matrix wording (STL, ENG, DL, MGR, DIR ...). */
export const ROLE_SHORT_CODES: Record<string, string> = {
  Admin: 'ADMIN',
  SpecialAdmin: 'S-ADMIN',
  Director: 'DIR',
  SpecialTeamLeader: 'STL-SP',
  Manager: 'MGR',
  ShopManager: 'SHM',
  TeamLeader: 'STL',
  Engineer: 'ENG',
  Technician: 'TECH',
  CertifyingStaff: 'CS',
  QAPersonnel: 'QA',
  ECAAPersonnel: 'ECAA',
  DocumentationTeamLeader: 'DL',
  DocumentationClerk: 'CLERK',
  HRSpecialist: 'HR-SP',
  HRManager: 'HR-MGR',
  Inspector: 'INSP',
}

/** Names of the central functional units - mirror of FunctionalUnits. */
export const FUNCTIONAL_UNITS = {
  Documentation: 'Documentation',
  HumanResources: 'HumanResources',
  QualityAssurance: 'QualityAssurance',
  Authority: 'Authority',
} as const

export type FunctionalUnit = (typeof FUNCTIONAL_UNITS)[keyof typeof FUNCTIONAL_UNITS]

export const FUNCTIONAL_UNIT_LABELS: Record<string, string> = {
  Documentation: 'Documentation Team',
  HumanResources: 'HR Team',
  QualityAssurance: 'Quality Assurance',
  Authority: 'Authority (ECAA)',
}

export function functionalUnitLabel(unit?: string | null): string {
  if (!unit) return '-'
  return FUNCTIONAL_UNIT_LABELS[unit] ?? unit
}

// =====================================================================================
// 2. ALIASES AND NORMALISATION  (mirror of Aliases / Normalize / PersistedVariants)
// =====================================================================================

/**
 * Every legacy value, snake_case spelling, short code and display text the backend
 * accepts. Keys are lowercase; the lookup lowercases the incoming value, which
 * reproduces the C# StringComparer.OrdinalIgnoreCase dictionary.
 */
const ROLE_ALIASES: Record<string, OrgRole> = {
  admin: ORG_ROLES.Admin,
  administrator: ORG_ROLES.Admin,
  system_admin: ORG_ROLES.Admin,
  special_admin: ORG_ROLES.SpecialAdmin,
  specialadmin: ORG_ROLES.SpecialAdmin,
  'special admin': ORG_ROLES.SpecialAdmin,

  director: ORG_ROLES.Director,
  dir: ORG_ROLES.Director,
  department_director: ORG_ROLES.Director,

  special_team_leader: ORG_ROLES.SpecialTeamLeader,
  specialteamleader: ORG_ROLES.SpecialTeamLeader,
  'special team leader': ORG_ROLES.SpecialTeamLeader,
  special_tl: ORG_ROLES.SpecialTeamLeader,
  specialtl: ORG_ROLES.SpecialTeamLeader,

  manager: ORG_ROLES.Manager,
  mgr: ORG_ROLES.Manager,
  manager_role: ORG_ROLES.Manager,
  'manager role': ORG_ROLES.Manager,
  department_manager: ORG_ROLES.Manager,
  'department manager': ORG_ROLES.Manager,
  section_manager: ORG_ROLES.Manager,
  'section manager': ORG_ROLES.Manager,

  shop_manager: ORG_ROLES.ShopManager,
  shopmanager: ORG_ROLES.ShopManager,
  'shop manager': ORG_ROLES.ShopManager,

  team_leader: ORG_ROLES.TeamLeader,
  teamleader: ORG_ROLES.TeamLeader,
  shop_tl: ORG_ROLES.TeamLeader,
  shoptl: ORG_ROLES.TeamLeader,
  stl: ORG_ROLES.TeamLeader,
  shopteamleader: ORG_ROLES.TeamLeader,
  shop_team_leader: ORG_ROLES.TeamLeader,
  'shop team leader': ORG_ROLES.TeamLeader,

  engineer: ORG_ROLES.Engineer,
  eng: ORG_ROLES.Engineer,

  technician: ORG_ROLES.Technician,
  tech: ORG_ROLES.Technician,

  certifying_staff: ORG_ROLES.CertifyingStaff,
  certifyingstaff: ORG_ROLES.CertifyingStaff,
  'certifying staff': ORG_ROLES.CertifyingStaff,
  cs: ORG_ROLES.CertifyingStaff,

  qa: ORG_ROLES.QAPersonnel,
  qa_personnel: ORG_ROLES.QAPersonnel,
  qapersonnel: ORG_ROLES.QAPersonnel,
  qa_staff: ORG_ROLES.QAPersonnel,
  qastaff: ORG_ROLES.QAPersonnel,
  qa_manager: ORG_ROLES.QAPersonnel,
  qamanager: ORG_ROLES.QAPersonnel,
  quality_assurance: ORG_ROLES.QAPersonnel,

  ecaa: ORG_ROLES.ECAAPersonnel,
  ecaa_personnel: ORG_ROLES.ECAAPersonnel,
  ecaapersonnel: ORG_ROLES.ECAAPersonnel,
  ecaa_team: ORG_ROLES.ECAAPersonnel,
  'ecaa team': ORG_ROLES.ECAAPersonnel,

  // ===== AMENDED v12 aliases =====
  dl: ORG_ROLES.DocumentationTeamLeader,
  documentation_tl: ORG_ROLES.DocumentationTeamLeader,
  documentationtl: ORG_ROLES.DocumentationTeamLeader,
  documentation_team_leader: ORG_ROLES.DocumentationTeamLeader,
  documentationteamleader: ORG_ROLES.DocumentationTeamLeader,
  'documentation team leader': ORG_ROLES.DocumentationTeamLeader,
  doc_leader: ORG_ROLES.DocumentationTeamLeader,

  documentation_clerk: ORG_ROLES.DocumentationClerk,
  documentationclerk: ORG_ROLES.DocumentationClerk,
  'documentation clerk': ORG_ROLES.DocumentationClerk,
  doc_clerk: ORG_ROLES.DocumentationClerk,
  clerk: ORG_ROLES.DocumentationClerk,

  hr_specialist: ORG_ROLES.HRSpecialist,
  hrspecialist: ORG_ROLES.HRSpecialist,
  'hr specialist': ORG_ROLES.HRSpecialist,
  hr: ORG_ROLES.HRSpecialist,

  hr_manager: ORG_ROLES.HRManager,
  hrmanager: ORG_ROLES.HRManager,
  'hr manager': ORG_ROLES.HRManager,

  inspector: ORG_ROLES.Inspector,
  inspection: ORG_ROLES.Inspector,
  inspection_staff: ORG_ROLES.Inspector,
}

/** Canonicalises any incoming role string, or returns null when it is unknown. */
export function normalizeRole(role?: string | null): OrgRole | null {
  if (!role) return null
  return ROLE_ALIASES[role.trim().toLowerCase()] ?? null
}

export function roleLabel(role?: string | null): string {
  const canonical = normalizeRole(role)
  if (canonical) return ROLE_DISPLAY_NAMES[canonical]
  return role?.trim() || '-'
}

export function roleShortCode(role?: string | null): string {
  const canonical = normalizeRole(role)
  if (canonical) return ROLE_SHORT_CODES[canonical] ?? canonical
  return role?.trim() || '-'
}

/** "Shop Team Leader (STL)" - the caption used by the workflow timeline and the matrix. */
export function roleLabelWithCode(role?: string | null): string {
  const canonical = normalizeRole(role)
  if (!canonical) return role?.trim() || '-'
  const code = ROLE_SHORT_CODES[canonical]
  return code ? `${ROLE_DISPLAY_NAMES[canonical]} (${code})` : ROLE_DISPLAY_NAMES[canonical]
}

export function roleLabels(roles?: Array<string | null | undefined> | null): string[] {
  if (!roles) return []
  return roles.map(roleLabel)
}

/**
 * Mirror of RoleHierarchy.PersistedVariants: every spelling of a canonical role that may
 * legitimately sit in the Users.Role column. Use it whenever the UI filters a user list by
 * role, otherwise a legacy row (Role = "shop_tl") is silently dropped.
 */
const VARIANTS_BY_CANONICAL: Record<string, string[]> = ALL_ROLES.reduce(
  (acc, role) => {
    const aliasKeys = Object.keys(ROLE_ALIASES).filter(key => ROLE_ALIASES[key] === role)
    acc[role] = Array.from(new Set<string>([role, role.toLowerCase(), ...aliasKeys]))
    return acc
  },
  {} as Record<string, string[]>,
)

export function persistedVariants(role?: string | null): string[] {
  const canonical = normalizeRole(role)
  if (!canonical) return role?.trim() ? [role.trim()] : []
  return VARIANTS_BY_CANONICAL[canonical] ?? [canonical]
}

export function persistedVariantsOf(roles?: Array<string | null | undefined> | null): string[] {
  if (!roles) return []
  return Array.from(new Set(roles.flatMap(r => persistedVariants(r))))
}

/** True when `userRole` is any accepted spelling of `expectedRole`. */
export function isRole(userRole?: string | null, expectedRole?: string | null): boolean {
  const a = normalizeRole(userRole)
  const b = normalizeRole(expectedRole)
  return !!a && !!b && a === b
}

/** True when `userRole` matches ANY of `expectedRoles` (the usual step-eligibility check). */
export function isAnyRole(
  userRole?: string | null,
  expectedRoles?: Array<string | null | undefined> | null,
): boolean {
  const canonical = normalizeRole(userRole)
  if (!canonical || !expectedRoles) return false
  return expectedRoles.some(r => normalizeRole(r) === canonical)
}

/** Seniority index; lower is more senior. Unknown roles sort last. */
export function rankOf(role?: string | null): number {
  const canonical = normalizeRole(role)
  if (!canonical) return Number.MAX_SAFE_INTEGER
  const index = ALL_ROLES.indexOf(canonical)
  return index < 0 ? Number.MAX_SAFE_INTEGER : index
}

/** True when `role` is strictly less senior than `referenceRole` (the delegation rule). */
export function isLowerTierThan(role?: string | null, referenceRole?: string | null): boolean {
  const a = rankOf(role)
  const b = rankOf(referenceRole)
  if (a === Number.MAX_SAFE_INTEGER || b === Number.MAX_SAFE_INTEGER) return false
  return a > b
}

// =====================================================================================
// 3. ROLE CLASSES  (mirror of the role arrays in RoleHierarchy)
// =====================================================================================

/** Only the Admin may create these. "Directors can only be assigned by Admin." */
export const ADMIN_ONLY_ROLES: OrgRole[] = [ORG_ROLES.Director, ORG_ROLES.SpecialTeamLeader]

/** The shop layer owned by the department Manager. */
export const MANAGER_DELEGATED_ROLES: OrgRole[] = [ORG_ROLES.ShopManager, ORG_ROLES.TeamLeader]

/** Department-level creators that sit ABOVE the Manager (restricted creators). */
export const DEPARTMENT_LEVEL_ROLES: OrgRole[] = [ORG_ROLES.Director]

/** Individual personnel. They create nobody. */
export const INDIVIDUAL_PERSONNEL_ROLES: OrgRole[] = [
  ORG_ROLES.Engineer,
  ORG_ROLES.Technician,
  ORG_ROLES.CertifyingStaff,
  ORG_ROLES.QAPersonnel,
  ORG_ROLES.ECAAPersonnel,
  ORG_ROLES.Inspector,             // v12
  ORG_ROLES.DocumentationClerk,    // v12
  ORG_ROLES.HRSpecialist,          // v12
]

/** Roles whose data scope is the whole shop (shared responsibilities). */
export const SHOP_GROUP_ROLES: OrgRole[] = [ORG_ROLES.ShopManager, ORG_ROLES.TeamLeader]

/** v12 - the Documentation Team (MNT-1420A routing). */
export const DOCUMENTATION_ROLES: OrgRole[] = [
  ORG_ROLES.DocumentationTeamLeader,
  ORG_ROLES.DocumentationClerk,
]

/** v12 - the HR Team (training verification routing). */
export const HR_ROLES: OrgRole[] = [ORG_ROLES.HRManager, ORG_ROLES.HRSpecialist]

/** v12 - every role whose inbox is a UNIT QUEUE rather than a shop queue. */
export const FUNCTIONAL_UNIT_ROLES: OrgRole[] = [...DOCUMENTATION_ROLES, ...HR_ROLES]

/** Roles allowed to grant or revoke privileges on another user. */
export const PRIVILEGE_GRANTOR_ROLES: OrgRole[] = [
  ORG_ROLES.Admin,
  ORG_ROLES.Director,
  ORG_ROLES.SpecialTeamLeader,
  ORG_ROLES.Manager,
  ORG_ROLES.HRManager,
  ORG_ROLES.DocumentationTeamLeader,
  ORG_ROLES.ShopManager,
  ORG_ROLES.TeamLeader,
]

/** Roles allowed to delegate a pending approval step to lower-tier staff. */
export const DELEGATION_ROLES: OrgRole[] = [
  ORG_ROLES.Admin,
  ORG_ROLES.Director,
  ORG_ROLES.SpecialTeamLeader,
  ORG_ROLES.Manager,
  ORG_ROLES.HRManager,
  ORG_ROLES.DocumentationTeamLeader,
  ORG_ROLES.ShopManager,
  ORG_ROLES.TeamLeader,
]

/**
 * v12 - roles that may SKIP a conditional / optional step.
 * "Conditional in-house steps can be dynamically skipped by the user" and
 * "Dynamic 'Optional / May Skip Now' flag based on regulatory target dates".
 */
export const SKIP_AUTHORITY_ROLES: OrgRole[] = [
  ORG_ROLES.Admin,
  ORG_ROLES.Director,
  ORG_ROLES.Manager,
  ORG_ROLES.SpecialTeamLeader,
  ORG_ROLES.TeamLeader,
  ORG_ROLES.ShopManager,
]

/**
 * AMENDED v14 - roles that may DELEGATE A REVIEW while KEEPING the approval
 * (mirror of RoleHierarchy.DelegatedReviewRequesterRoles). The 918 / 918A requirement
 * keeps the approval with the Director / QA Manager / ECAA Team and lets them borrow only
 * a REVIEWER; the Service Bulletin DL and the Training Verification HR Manager reuse the
 * same mechanism. Membership is necessary but not sufficient: the STEP must also declare
 * AllowsDelegatedReview and the actor must be an eligible executor of that step.
 */
export const DELEGATED_REVIEW_REQUESTER_ROLES: OrgRole[] = [
  ORG_ROLES.Admin,
  ORG_ROLES.Director,
  ORG_ROLES.Manager,
  ORG_ROLES.HRManager,
  ORG_ROLES.DocumentationTeamLeader,
  ORG_ROLES.QAPersonnel,
  ORG_ROLES.ECAAPersonnel,
]

/**
 * AMENDED v14 - roles that may act AS a delegated reviewer and CONFIRM the review, which
 * routes the step back to its original approver (mirror of
 * RoleHierarchy.DelegatedReviewerRoles - the union of every pool the catalog declares).
 * Membership is necessary but not sufficient: the concrete pool of the concrete step
 * (DelegatedReviewRoles) always wins.
 */
export const DELEGATED_REVIEWER_ROLES: OrgRole[] = [
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
]

export function isAdminOnly(role?: string | null): boolean {
  const canonical = normalizeRole(role)
  return !!canonical && ADMIN_ONLY_ROLES.includes(canonical)
}

export function isManagerDelegated(role?: string | null): boolean {
  const canonical = normalizeRole(role)
  return !!canonical && MANAGER_DELEGATED_ROLES.includes(canonical)
}

export function isDepartmentLevel(role?: string | null): boolean {
  const canonical = normalizeRole(role)
  return !!canonical && DEPARTMENT_LEVEL_ROLES.includes(canonical)
}

export function isIndividualPersonnel(role?: string | null): boolean {
  const canonical = normalizeRole(role)
  return !!canonical && INDIVIDUAL_PERSONNEL_ROLES.includes(canonical)
}

export function sharesShopScope(role?: string | null): boolean {
  const canonical = normalizeRole(role)
  return !!canonical && SHOP_GROUP_ROLES.includes(canonical)
}

export function isDocumentationRole(role?: string | null): boolean {
  const canonical = normalizeRole(role)
  return !!canonical && DOCUMENTATION_ROLES.includes(canonical)
}

export function isHRRole(role?: string | null): boolean {
  const canonical = normalizeRole(role)
  return !!canonical && HR_ROLES.includes(canonical)
}

/** True when the role's inbox is a central unit queue instead of a shop queue. */
export function isFunctionalUnitRole(role?: string | null): boolean {
  const canonical = normalizeRole(role)
  return !!canonical && FUNCTIONAL_UNIT_ROLES.includes(canonical)
}

/** Mirror of CanSkipSteps - ROLE authority only; the step's SkipMode is checked separately. */
export function canSkipSteps(role?: string | null): boolean {
  const canonical = normalizeRole(role)
  return !!canonical && SKIP_AUTHORITY_ROLES.includes(canonical)
}

/**
 * AMENDED v14 - mirror of RoleHierarchy.CanRequestDelegatedReview: true when the role is,
 * in principle, allowed to borrow a delegated reviewer. The STEP must additionally declare
 * AllowsDelegatedReview and the actor must be an eligible executor of that step - use the
 * full resolver of workflow-permissions.ts for the real decision.
 */
export function canRequestDelegatedReview(role?: string | null): boolean {
  const canonical = normalizeRole(role)
  return !!canonical && DELEGATED_REVIEW_REQUESTER_ROLES.includes(canonical)
}

/**
 * AMENDED v14 - mirror of RoleHierarchy.CanConfirmDelegatedReview: true when the role may,
 * in principle, act as a delegated reviewer. The STEP's own DelegatedReviewRoles pool must
 * additionally contain it - use the full resolver of workflow-permissions.ts.
 */
export function canConfirmDelegatedReview(role?: string | null): boolean {
  const canonical = normalizeRole(role)
  if (!canonical) return false
  if (canonical === ORG_ROLES.Admin) return true
  return DELEGATED_REVIEWER_ROLES.includes(canonical)
}

// =====================================================================================
// 3b. THE STANDARD APPROVAL CHAIN  (mirror of RoleHierarchy.StandardChain /
//     ApproverRolesFor / CanActOn / CanDelegate)
//     Consumed by the Admin approval-routing card so a newly created role can be
//     verified against every stage it is entitled to act on.
// =====================================================================================

/** Mirror of RoleHierarchy.ApprovalStage. */
export interface ApprovalStage {
  status: ApprovalStatus
  title: string
  approverRoles: OrgRole[]
}

/**
 * Mirror of RoleHierarchy.StandardChain - the DEFAULT chain of a generic approval:
 * Shop Team Leader review -> QA / Certifying Staff -> Manager -> Director -> Approved.
 */
export const STANDARD_CHAIN: readonly ApprovalStage[] = [
  {
    status: ApprovalStatus.PendingTeamLeaderReview,
    title: 'Shop Team Leader / Engineer review',
    approverRoles: [
      ORG_ROLES.TeamLeader,
      ORG_ROLES.ShopManager,
      ORG_ROLES.SpecialTeamLeader,
      ORG_ROLES.Engineer,
      ORG_ROLES.Admin,
    ],
  },
  {
    status: ApprovalStatus.PendingQAApproval,
    title: 'QA / Certifying Staff approval',
    approverRoles: [
      ORG_ROLES.QAPersonnel,
      ORG_ROLES.CertifyingStaff,
      ORG_ROLES.ECAAPersonnel,
      ORG_ROLES.Admin,
    ],
  },
  {
    status: ApprovalStatus.PendingManagerApproval,
    title: 'Department Manager approval',
    approverRoles: [ORG_ROLES.Manager, ORG_ROLES.ShopManager, ORG_ROLES.Admin],
  },
  {
    status: ApprovalStatus.PendingDirectorApproval,
    title: 'Director approval',
    approverRoles: [ORG_ROLES.Director, ORG_ROLES.SpecialTeamLeader, ORG_ROLES.Admin],
  },
]

/**
 * Mirror of RoleHierarchy.ApproverRolesFor: the StandardChain stage wins; every other
 * status falls back to the hand-written v8 read-path table. While a step sits in
 * PendingDelegatedReview the actor is the delegated REVIEWER, so the fallback returns
 * exactly DelegatedReviewerRoles + Admin (the union of the pools the catalog declares).
 */
export function approverRolesFor(status: ApprovalStatus): OrgRole[] {
  const stage = STANDARD_CHAIN.find(s => s.status === status)
  if (stage) return [...stage.approverRoles]

  switch (status) {
    case ApprovalStatus.PendingAssignment:
      return [
        ORG_ROLES.TeamLeader,
        ORG_ROLES.ShopManager,
        ORG_ROLES.SpecialTeamLeader,
        ORG_ROLES.DocumentationTeamLeader,
        ORG_ROLES.HRManager,
        ORG_ROLES.Admin,
      ]
    case ApprovalStatus.PendingCertifyingStaffAction:
      return [ORG_ROLES.CertifyingStaff, ORG_ROLES.TeamLeader, ORG_ROLES.Admin]
    case ApprovalStatus.PendingEngineerAction:
      return [ORG_ROLES.Engineer, ORG_ROLES.SpecialTeamLeader, ORG_ROLES.Admin]
    case ApprovalStatus.PendingDocumentationTeam:
      return [ORG_ROLES.DocumentationTeamLeader, ORG_ROLES.Admin]
    case ApprovalStatus.PendingDocumentationClerk:
      return [ORG_ROLES.DocumentationClerk, ORG_ROLES.DocumentationTeamLeader, ORG_ROLES.Admin]
    case ApprovalStatus.PendingDocumentationLeaderSignOff:
      return [ORG_ROLES.DocumentationTeamLeader, ORG_ROLES.Admin]
    case ApprovalStatus.PendingShopTeamLeaderIssue:
      return [ORG_ROLES.TeamLeader, ORG_ROLES.Admin]
    case ApprovalStatus.PendingSpecialTeamLeaderApproval:
      return [ORG_ROLES.SpecialTeamLeader, ORG_ROLES.Admin]
    case ApprovalStatus.PendingInhouseProcess:
      return [
        ORG_ROLES.Engineer,
        ORG_ROLES.TeamLeader,
        ORG_ROLES.SpecialTeamLeader,
        ORG_ROLES.Admin,
      ]
    case ApprovalStatus.PendingHRVerification:
      return [ORG_ROLES.HRSpecialist, ORG_ROLES.HRManager, ORG_ROLES.Admin]
    case ApprovalStatus.PendingHRManagerApproval:
      return [ORG_ROLES.HRManager, ORG_ROLES.Admin]
    case ApprovalStatus.PendingRequesterVerification:
      return [ORG_ROLES.TeamLeader, ORG_ROLES.ShopManager, ORG_ROLES.Admin]
    case ApprovalStatus.PendingInspectorReview:
      return [ORG_ROLES.Inspector, ORG_ROLES.Admin]
    case ApprovalStatus.PendingInspectorApproval:
      return [ORG_ROLES.Inspector, ORG_ROLES.Admin]
    case ApprovalStatus.PendingTechnicianSignOff:
      return [ORG_ROLES.Technician, ORG_ROLES.Admin]
    case ApprovalStatus.PendingECAAEndorsement:
      return [ORG_ROLES.ECAAPersonnel, ORG_ROLES.Admin]
    case ApprovalStatus.PendingSelfAuditCheck:
      return [
        ORG_ROLES.QAPersonnel,
        ORG_ROLES.TeamLeader,
        ORG_ROLES.ShopManager,
        ORG_ROLES.Admin,
      ]
    case ApprovalStatus.PendingFinalSignOff:
      return [ORG_ROLES.Director, ORG_ROLES.Manager, ORG_ROLES.Admin]
    case ApprovalStatus.PendingAmendmentApproval:
      return [
        ORG_ROLES.TeamLeader,
        ORG_ROLES.ShopManager,
        ORG_ROLES.Manager,
        ORG_ROLES.HRManager,
        ORG_ROLES.Admin,
      ]
    case ApprovalStatus.PendingDelegatedReview:
      return [...DELEGATED_REVIEWER_ROLES, ORG_ROLES.Admin]
    default:
      return []
  }
}

/** Mirror of RoleHierarchy.CanActOn - the Admin short-circuit included. */
export function canActOn(role?: string | null, status?: ApprovalStatus | null): boolean {
  const canonical = normalizeRole(role)
  if (!canonical || status === null || status === undefined) return false
  if (canonical === ORG_ROLES.Admin) return true
  return approverRolesFor(status).includes(canonical)
}

/** Mirror of RoleHierarchy.CanDelegate - a delegation role that may also act on the stage. */
export function canDelegate(role?: string | null, status?: ApprovalStatus | null): boolean {
  const canonical = normalizeRole(role)
  if (!canonical || status === null || status === undefined) return false
  if (canonical === ORG_ROLES.Admin) return true
  return DELEGATION_ROLES.includes(canonical) && canActOn(canonical, status)
}

// =====================================================================================
// 4. THE CREATION MATRIX  (mirror of RoleHierarchy.CreationMatrix, v8)
// =====================================================================================

/**
 *   Admin                    -> every role (top-level authority + bootstrap)
 *   Director                 -> Manager, HR Manager, Documentation Team Leader, and the shop
 *                               layer ONLY while the department has no active Manager
 *   SpecialTeamLeader        -> Engineer
 *   Manager                  -> ShopManager, TeamLeader
 *   ShopManager              -> TeamLeader, CertifyingStaff
 *   TeamLeader (STL)         -> Technician, CertifyingStaff, QAPersonnel, Inspector, ECAAPersonnel
 *   DocumentationTeamLeader  -> DocumentationClerk
 *   HRManager                -> HRSpecialist
 * Individual personnel create nobody.
 */
export const CREATION_MATRIX: Record<string, OrgRole[]> = {
  Admin: [
    ORG_ROLES.SpecialAdmin,
    ORG_ROLES.Director,
    ORG_ROLES.SpecialTeamLeader,
    ORG_ROLES.Manager,
    ORG_ROLES.HRManager,
    ORG_ROLES.DocumentationTeamLeader,
    ORG_ROLES.ShopManager,
    ORG_ROLES.TeamLeader,
    ORG_ROLES.HRSpecialist,
    ORG_ROLES.DocumentationClerk,
    ORG_ROLES.Engineer,
    ORG_ROLES.Inspector,
    ORG_ROLES.Technician,
    ORG_ROLES.CertifyingStaff,
    ORG_ROLES.QAPersonnel,
    ORG_ROLES.ECAAPersonnel,
    ORG_ROLES.Admin,
  ],
  Director: [
    ORG_ROLES.Manager,
    ORG_ROLES.HRManager,
    ORG_ROLES.DocumentationTeamLeader,
    ORG_ROLES.ShopManager,
    ORG_ROLES.TeamLeader,
  ],
  SpecialTeamLeader: [ORG_ROLES.Engineer],
  Manager: [ORG_ROLES.SpecialAdmin, ORG_ROLES.ShopManager, ORG_ROLES.TeamLeader],
  ShopManager: [ORG_ROLES.TeamLeader, ORG_ROLES.CertifyingStaff],
  TeamLeader: [
    ORG_ROLES.Technician,
    ORG_ROLES.CertifyingStaff,
    ORG_ROLES.QAPersonnel,
    ORG_ROLES.Inspector,
    ORG_ROLES.ECAAPersonnel,
  ],

  // ===== AMENDED v12 =====
  DocumentationTeamLeader: [ORG_ROLES.DocumentationClerk],
  HRManager: [ORG_ROLES.HRSpecialist],

  Engineer: [],
  Technician: [],
  CertifyingStaff: [],
  QAPersonnel: [],
  ECAAPersonnel: [],
  Inspector: [],
  DocumentationClerk: [],
  HRSpecialist: [],
}

// =====================================================================================
// 5. STRUCTURAL RULES  (mirror of RoleHierarchy.Rules)
// =====================================================================================

export interface RoleRule {
  role: string
  displayName: string
  shortCode: string
  description: string
  requiresDepartment: boolean
  requiresShop: boolean
  requiresSupervisor: boolean
  allowedSupervisorRoles: string[]
  /** The parent the server picks first when none is supplied. */
  preferredSupervisorRoles: string[]
  /** Only an Admin may create this role. */
  adminOnly: boolean
  /** Belongs to the Manager-owned shop layer. */
  managerDelegated: boolean
  /** Creates nobody; only edits, approves and views data. */
  isIndividualPersonnel: boolean
  /** Data scope is the whole shop. */
  sharesShopScope: boolean
  /** v12: central functional unit, or null for shop / department roles. */
  functionalUnit: string | null
  /** v12: leads its functional unit and may dispatch work inside it. */
  leadsFunctionalUnit: boolean
}

export const ROLE_RULES: Record<string, RoleRule> = {
  Admin: {
    role: ORG_ROLES.Admin,
    displayName: 'Admin',
    shortCode: 'ADMIN',
    description:
      'Top-level authority with strategic oversight. Creates Directors and Special Team Leaders and may bootstrap any branch of the organisation.',
    requiresDepartment: false,
    requiresShop: false,
    requiresSupervisor: false,
    allowedSupervisorRoles: [ORG_ROLES.Admin],
    preferredSupervisorRoles: [],
    adminOnly: true,
    managerDelegated: false,
    isIndividualPersonnel: false,
    sharesShopScope: false,
    functionalUnit: null,
    leadsFunctionalUnit: false,
  },
  SpecialAdmin: {
    role: ORG_ROLES.SpecialAdmin,
    displayName: 'Special Admin',
    shortCode: 'S-ADMIN',
    description:
      'Reviews and approves Training Documents submissions for Training Verification (Inspection), Training Verification (Technician), and Competency Assessment (MNT 3.14-020).',
    requiresDepartment: true,
    requiresShop: false,
    requiresSupervisor: false,
    allowedSupervisorRoles: [ORG_ROLES.Manager, ORG_ROLES.Admin],
    preferredSupervisorRoles: [ORG_ROLES.Manager],
    adminOnly: false,
    managerDelegated: false,
    isIndividualPersonnel: false,
    sharesShopScope: false,
    functionalUnit: null,
    leadsFunctionalUnit: false,
  },
  Director: {
    role: ORG_ROLES.Director,
    displayName: 'Director',
    shortCode: 'DIR',
    description:
      'One per department, assigned ONLY by the Admin. Final sign-off of Amendment Requests (MNT-918) and Letters of Confirmation, and entry point of the joint 918 / 918A approval path.',
    requiresDepartment: true,
    requiresShop: false,
    requiresSupervisor: false,
    allowedSupervisorRoles: [ORG_ROLES.Admin],
    preferredSupervisorRoles: [ORG_ROLES.Admin],
    adminOnly: true,
    managerDelegated: false,
    isIndividualPersonnel: false,
    sharesShopScope: false,
    functionalUnit: null,
    leadsFunctionalUnit: false,
  },
  SpecialTeamLeader: {
    role: ORG_ROLES.SpecialTeamLeader,
    displayName: 'Special Team Leader',
    shortCode: 'STL-SP',
    description:
      'Created by the Admin UNDER a Director. Approves TNA (MNT-1229B) after the Manager, approves alternate-tool pathways, assigns Engineers, and may assign ATA records or update entries directly.',
    requiresDepartment: false,
    requiresShop: false,
    requiresSupervisor: true,
    allowedSupervisorRoles: [ORG_ROLES.Director, ORG_ROLES.Admin],
    preferredSupervisorRoles: [ORG_ROLES.Director],
    adminOnly: true,
    managerDelegated: false,
    isIndividualPersonnel: false,
    sharesShopScope: false,
    functionalUnit: null,
    leadsFunctionalUnit: false,
  },
  Manager: {
    role: ORG_ROLES.Manager,
    displayName: 'Manager',
    shortCode: 'MGR',
    description:
      'Reports to the Director. Runs a department section (ACS, MCS, NDT, Standard ...). First approval of the standard TNA sequence and first tier of the Letter of Confirmation escalation. Owns the shop layer.',
    requiresDepartment: true,
    requiresShop: false,
    requiresSupervisor: false,
    allowedSupervisorRoles: [ORG_ROLES.Director, ORG_ROLES.Admin],
    preferredSupervisorRoles: [ORG_ROLES.Director],
    adminOnly: false,
    managerDelegated: false,
    isIndividualPersonnel: false,
    sharesShopScope: false,
    functionalUnit: null,
    leadsFunctionalUnit: false,
  },
  HRManager: {
    role: ORG_ROLES.HRManager,
    displayName: 'HR Manager',
    shortCode: 'HR-MGR',
    description:
      'AMENDED v12. Leads the HR Team. Approves the training package after HR Specialist verification, then the record returns to the requesting Shop Team Leader.',
    requiresDepartment: false,
    requiresShop: false,
    requiresSupervisor: false,
    allowedSupervisorRoles: [ORG_ROLES.Director, ORG_ROLES.Admin],
    preferredSupervisorRoles: [ORG_ROLES.Director],
    adminOnly: false,
    managerDelegated: false,
    isIndividualPersonnel: false,
    sharesShopScope: false,
    functionalUnit: FUNCTIONAL_UNITS.HumanResources,
    leadsFunctionalUnit: true,
  },
  DocumentationTeamLeader: {
    role: ORG_ROLES.DocumentationTeamLeader,
    displayName: 'Documentation Team Leader',
    shortCode: 'DL',
    description:
      'AMENDED v12. Documentation Team Leader (DL). Receives SB/SL/SIL (MNT-1420A), assigns an available Documentation Clerk, and performs the final review and sign-off.',
    requiresDepartment: false,
    requiresShop: false,
    requiresSupervisor: false,
    allowedSupervisorRoles: [ORG_ROLES.Director, ORG_ROLES.Manager, ORG_ROLES.Admin],
    preferredSupervisorRoles: [ORG_ROLES.Director],
    adminOnly: false,
    managerDelegated: false,
    isIndividualPersonnel: false,
    sharesShopScope: false,
    functionalUnit: FUNCTIONAL_UNITS.Documentation,
    leadsFunctionalUnit: true,
  },
  ShopManager: {
    role: ORG_ROLES.ShopManager,
    displayName: 'Shop Manager',
    shortCode: 'SHM',
    description:
      'Reports to the department Manager. Oversees shop-level operations and sees all Shop Team Leaders of the shop as one group.',
    requiresDepartment: false,
    requiresShop: true,
    requiresSupervisor: false,
    allowedSupervisorRoles: [ORG_ROLES.Manager, ORG_ROLES.Director, ORG_ROLES.Admin],
    preferredSupervisorRoles: [ORG_ROLES.Manager],
    adminOnly: false,
    managerDelegated: true,
    isIndividualPersonnel: false,
    sharesShopScope: true,
    functionalUnit: null,
    leadsFunctionalUnit: false,
  },
  TeamLeader: {
    role: ORG_ROLES.TeamLeader,
    displayName: 'Shop Team Leader',
    shortCode: 'STL',
    description:
      'Shop Team Leader (STL). Drafts New ATA Records, manually assigns them to a Certifying Staff member, reassigns to lower-tier staff when workload is high, holds sole authority over AD (MNT-1420B), drafts TNA (MNT-1229B) or assigns it to an Engineer, and enrols employees of HIS OWN SHOP ONLY for training.',
    requiresDepartment: false,
    requiresShop: true,
    requiresSupervisor: false,
    allowedSupervisorRoles: [
      ORG_ROLES.ShopManager,
      ORG_ROLES.Manager,
      ORG_ROLES.Director,
      ORG_ROLES.Admin,
    ],
    preferredSupervisorRoles: [ORG_ROLES.ShopManager, ORG_ROLES.Manager],
    adminOnly: false,
    managerDelegated: true,
    isIndividualPersonnel: false,
    sharesShopScope: true,
    functionalUnit: null,
    leadsFunctionalUnit: false,
  },
  HRSpecialist: {
    role: ORG_ROLES.HRSpecialist,
    displayName: 'HR Specialist',
    shortCode: 'HR-SP',
    description:
      'AMENDED v12. Verifies training enrolments submitted by a Shop Team Leader, updates training status records, filters eligible employees and forwards the package to the HR Manager.',
    requiresDepartment: false,
    requiresShop: false,
    requiresSupervisor: false,
    allowedSupervisorRoles: [ORG_ROLES.HRManager, ORG_ROLES.Director, ORG_ROLES.Admin],
    preferredSupervisorRoles: [ORG_ROLES.HRManager],
    adminOnly: false,
    managerDelegated: false,
    isIndividualPersonnel: true,
    sharesShopScope: false,
    functionalUnit: FUNCTIONAL_UNITS.HumanResources,
    leadsFunctionalUnit: false,
  },
  DocumentationClerk: {
    role: ORG_ROLES.DocumentationClerk,
    displayName: 'Documentation Clerk',
    shortCode: 'CLERK',
    description:
      'AMENDED v12. Processes the SB/SL/SIL entry assigned by the Documentation Team Leader and returns it to the DL for sign-off.',
    requiresDepartment: false,
    requiresShop: false,
    requiresSupervisor: false,
    allowedSupervisorRoles: [
      ORG_ROLES.DocumentationTeamLeader,
      ORG_ROLES.Director,
      ORG_ROLES.Admin,
    ],
    preferredSupervisorRoles: [ORG_ROLES.DocumentationTeamLeader],
    adminOnly: false,
    managerDelegated: false,
    isIndividualPersonnel: true,
    sharesShopScope: false,
    functionalUnit: FUNCTIONAL_UNITS.Documentation,
    leadsFunctionalUnit: false,
  },
  Engineer: {
    role: ORG_ROLES.Engineer,
    displayName: 'Engineer',
    shortCode: 'ENG',
    description:
      'Assigned by a Special Team Leader or an STL. Creates ATA Record drafts, drafts TNA (MNT-1229B) and the alternate-tool pathway which routes to the Special Team Leader for approval.',
    requiresDepartment: false,
    requiresShop: false,
    requiresSupervisor: false,
    allowedSupervisorRoles: [
      ORG_ROLES.SpecialTeamLeader,
      ORG_ROLES.TeamLeader,
      ORG_ROLES.Director,
      ORG_ROLES.Admin,
    ],
    preferredSupervisorRoles: [ORG_ROLES.SpecialTeamLeader],
    adminOnly: false,
    managerDelegated: false,
    isIndividualPersonnel: true,
    sharesShopScope: false,
    functionalUnit: null,
    leadsFunctionalUnit: false,
  },
  Inspector: {
    role: ORG_ROLES.Inspector,
    displayName: 'Inspector',
    shortCode: 'INSP',
    description:
      'AMENDED v12. Designated Inspector. Inspection Proficiency (MNT-1378) is routed EXCLUSIVELY to this role for sequential review and final approval.',
    requiresDepartment: false,
    requiresShop: true,
    requiresSupervisor: false,
    allowedSupervisorRoles: [
      ORG_ROLES.TeamLeader,
      ORG_ROLES.ShopManager,
      ORG_ROLES.Manager,
      ORG_ROLES.Admin,
    ],
    preferredSupervisorRoles: [ORG_ROLES.TeamLeader, ORG_ROLES.ShopManager],
    adminOnly: false,
    managerDelegated: false,
    isIndividualPersonnel: true,
    sharesShopScope: false,
    functionalUnit: null,
    leadsFunctionalUnit: false,
  },
  CertifyingStaff: {
    role: ORG_ROLES.CertifyingStaff,
    displayName: 'Certifying Staff',
    shortCode: 'CS',
    description:
      'Certifying Staff. Receives New ATA Records manually assigned by the STL, certifies and approves shop forms.',
    requiresDepartment: false,
    requiresShop: true,
    requiresSupervisor: false,
    allowedSupervisorRoles: [
      ORG_ROLES.TeamLeader,
      ORG_ROLES.ShopManager,
      ORG_ROLES.Manager,
      ORG_ROLES.Admin,
    ],
    preferredSupervisorRoles: [ORG_ROLES.TeamLeader, ORG_ROLES.ShopManager],
    adminOnly: false,
    managerDelegated: false,
    isIndividualPersonnel: true,
    sharesShopScope: false,
    functionalUnit: null,
    leadsFunctionalUnit: false,
  },
  QAPersonnel: {
    role: ORG_ROLES.QAPersonnel,
    displayName: 'QA Personnel',
    shortCode: 'QA',
    description:
      'Quality assurance. Second stage of the joint 918 / 918A path: signs Form MNT-918 after the Director.',
    requiresDepartment: false,
    requiresShop: true,
    requiresSupervisor: false,
    allowedSupervisorRoles: [
      ORG_ROLES.TeamLeader,
      ORG_ROLES.ShopManager,
      ORG_ROLES.Manager,
      ORG_ROLES.Admin,
    ],
    preferredSupervisorRoles: [ORG_ROLES.TeamLeader, ORG_ROLES.ShopManager],
    adminOnly: false,
    managerDelegated: false,
    isIndividualPersonnel: true,
    sharesShopScope: false,
    functionalUnit: FUNCTIONAL_UNITS.QualityAssurance,
    leadsFunctionalUnit: false,
  },
  Technician: {
    role: ORG_ROLES.Technician,
    displayName: 'Technician',
    shortCode: 'TECH',
    description:
      'Shop floor personnel promoted by a Shop Team Leader. Competency Assessment (MNT 3.14-020 / MNT-922C) is routed directly to the Technician for review and task completion sign-off.',
    requiresDepartment: false,
    requiresShop: true,
    requiresSupervisor: false,
    allowedSupervisorRoles: [
      ORG_ROLES.TeamLeader,
      ORG_ROLES.ShopManager,
      ORG_ROLES.Manager,
      ORG_ROLES.Admin,
    ],
    preferredSupervisorRoles: [ORG_ROLES.TeamLeader, ORG_ROLES.ShopManager],
    adminOnly: false,
    managerDelegated: false,
    isIndividualPersonnel: true,
    sharesShopScope: false,
    functionalUnit: null,
    leadsFunctionalUnit: false,
  },
  ECAAPersonnel: {
    role: ORG_ROLES.ECAAPersonnel,
    displayName: 'ECAA Team',
    shortCode: 'ECAA',
    description:
      'ECAA Team. Final stage of the joint 918 / 918A path: endorses Form MNT-918A.',
    requiresDepartment: false,
    requiresShop: false,
    requiresSupervisor: false,
    allowedSupervisorRoles: [
      ORG_ROLES.TeamLeader,
      ORG_ROLES.ShopManager,
      ORG_ROLES.Manager,
      ORG_ROLES.Director,
      ORG_ROLES.Admin,
    ],
    preferredSupervisorRoles: [ORG_ROLES.TeamLeader, ORG_ROLES.ShopManager],
    adminOnly: false,
    managerDelegated: false,
    isIndividualPersonnel: true,
    sharesShopScope: false,
    functionalUnit: FUNCTIONAL_UNITS.Authority,
    leadsFunctionalUnit: false,
  },
}

export function ruleFor(role?: string | null): RoleRule | null {
  const canonical = normalizeRole(role)
  return canonical ? ROLE_RULES[canonical] ?? null : null
}

/** v12 - the functional unit of a role, or null for shop / department roles. */
export function functionalUnitOf(role?: string | null): string | null {
  return ruleFor(role)?.functionalUnit ?? null
}

/** v12 - true when the role leads its functional unit (DL, HR Manager). */
export function leadsFunctionalUnit(role?: string | null): boolean {
  return ruleFor(role)?.leadsFunctionalUnit === true
}

/** True when the role belongs to `unit` - the client-side FUNCTIONAL_UNIT scope check. */
export function isInFunctionalUnit(role?: string | null, unit?: string | null): boolean {
  if (!unit) return false
  const own = functionalUnitOf(role)
  return !!own && own.toLowerCase() === unit.trim().toLowerCase()
}

/** True when `supervisorRole` may supervise `targetRole`. */
export function canSupervise(supervisorRole?: string | null, targetRole?: string | null): boolean {
  const supervisor = normalizeRole(supervisorRole)
  const rule = ruleFor(targetRole)
  if (!supervisor || !rule) return false
  if (supervisor === ORG_ROLES.Admin) return true
  return rule.allowedSupervisorRoles.includes(supervisor)
}

/** Mirror of RoleHierarchy.CanCreate: the matrix PLUS the Admin-only guard. */
export function canCreate(creatorRole?: string | null, targetRole?: string | null): boolean {
  const creator = normalizeRole(creatorRole)
  const target = normalizeRole(targetRole)
  if (!creator || !target) return false
  if (isAdminOnly(target) && creator !== ORG_ROLES.Admin) return false
  return (CREATION_MATRIX[creator] ?? []).includes(target)
}

/** Canonical role names the creator may create (Admin-only guard applied). */
export function creatableRoles(creatorRole?: string | null): OrgRole[] {
  const creator = normalizeRole(creatorRole)
  if (!creator) return []
  const allowed = CREATION_MATRIX[creator] ?? []
  if (creator === ORG_ROLES.Admin) return [...allowed]
  return allowed.filter(r => !isAdminOnly(r))
}

/**
 * THE MANAGER DELEGATION RULE, client side.
 * "Once the Manager role is created, User Management must stop department-level users from
 *  creating Shop Team Leaders or Shop Managers."
 */
export function isBlockedByManagerDelegation(
  creatorRole: string | null | undefined,
  targetRole: string | null | undefined,
  departmentHasActiveManager: boolean,
): boolean {
  if (!departmentHasActiveManager) return false
  const creator = normalizeRole(creatorRole)
  if (!creator || creator === ORG_ROLES.Admin) return false
  return isDepartmentLevel(creator) && isManagerDelegated(targetRole)
}

/** Local fallback used only when /api/users/creation-rules is unavailable. */
export function creatableRules(creatorRole?: string | null): RoleRule[] {
  return creatableRoles(creatorRole)
    .map(role => ROLE_RULES[role])
    .filter((rule): rule is RoleRule => Boolean(rule))
}

/** What the "Create User" dropdown must render, after the Manager delegation rule. */
export function creatableRulesFiltered(
  creatorRole: string | null | undefined,
  departmentHasActiveManager: boolean,
): RoleRule[] {
  return creatableRules(creatorRole).filter(
    rule => !isBlockedByManagerDelegation(creatorRole, rule.role, departmentHasActiveManager),
  )
}

// =====================================================================================
// 6. PERMISSIONS  (mirror of CMT.Domain.Models.Shared.Permissions - v8, COMPLETE)
// =====================================================================================

export const PERMISSIONS = {
  // ----- Shop -----
  CreateShop: 'shop.create',
  EditShop: 'shop.edit',
  DeleteShop: 'shop.delete',
  ViewShop: 'shop.view',

  // ----- ATA Record -----
  CreateATARecord: 'ata_record.create',
  EditATARecord: 'ata_record.edit',
  DeleteATARecord: 'ata_record.delete',
  ViewATARecord: 'ata_record.view',
  SubmitATARecord: 'ata_record.submit',
  ApproveATARecord: 'ata_record.approve',
  RejectATARecord: 'ata_record.reject',
  /** v12: STL manually assigns the record to a Certifying Staff member. */
  AssignATARecord: 'ata_record.assign',
  /** v12: Special Team Leader may update entries directly. */
  DirectUpdateATARecord: 'ata_record.direct_update',

  // ----- Form -----
  CreateForm: 'form.create',
  EditForm: 'form.edit',
  DeleteForm: 'form.delete',
  ViewForm: 'form.view',
  SubmitForm: 'form.submit',
  ApproveForm: 'form.approve',
  RejectForm: 'form.reject',
  DelegateForm: 'form.delegate',
  /** v12: return a form to the previous step for rework. */
  ReturnForm: 'form.return',
  /** v12: skip a conditional / optional step (skip logic). */
  SkipFormStep: 'form.skip',
  /** v12: manually assign or re-assign a pending step. */
  AssignFormStep: 'form.assign',
  /** v12: place the legally binding signature on a form. */
  SignOffForm: 'form.signoff',
  /**
   * AMENDED v14 - the OWNER of an approval step (Director / QA Manager / ECAA Team /
   * HR Manager / Documentation Team Leader) sends that step to a delegated reviewer while
   * KEEPING the approval. Deliberately NOT DelegateForm, which transfers the approval.
   */
  RequestDelegatedReview: 'form.request_review',
  /** AMENDED v14 - the delegated reviewer confirms the review; the step returns to its approver. */
  ConfirmDelegatedReview: 'form.confirm_review',

  // ----- Evaluation folder -----
  CreateFolder: 'folder.create',
  EditFolder: 'folder.edit',
  ViewFolder: 'folder.view',
  CompleteFolder: 'folder.complete',
  LockFolder: 'folder.lock',
  GenerateFolderReport: 'folder.report',

  // ----- Documentation team -----
  AssignDocumentationClerk: 'documentation.assign_clerk',
  SignOffDocumentation: 'documentation.signoff',

  // ----- Training / HR -----
  EnrollTraining: 'training.enroll',
  VerifyTraining: 'training.verify',
  ApproveTraining: 'training.approve',

  // ----- Expiry / revision / matrices -----
  AmendExpiredRecord: 'expiry.amend',
  TriggerRevision: 'revision.trigger',
  ApproveRevision: 'revision.approve',
  ViewMatrix: 'matrix.view',
  EditMatrix: 'matrix.edit',

  // ----- Notifications & audit -----
  ViewNotification: 'notification.view',
  ViewWorkflowAudit: 'workflow.view_audit',

  // ----- File -----
  UploadFile: 'file.upload',
  DeleteFile: 'file.delete',
  ViewFile: 'file.view',
  ApproveFile: 'file.approve',

  // ----- User management -----
  CreateUser: 'user.create',
  EditUser: 'user.edit',
  DeleteUser: 'user.delete',
  ViewUser: 'user.view',
  AssignRole: 'user.assign_role',

  // ----- Department -----
  CreateDepartment: 'department.create',
  EditDepartment: 'department.edit',
  ViewDepartment: 'department.view',
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

/** Human labels for the privilege editor (PrivilegesDialog). */
export const PERMISSION_LABELS: Record<string, string> = {
  'shop.create': 'Create shop',
  'shop.edit': 'Edit shop',
  'shop.delete': 'Delete shop',
  'shop.view': 'View shop',

  'ata_record.create': 'Create ATA record',
  'ata_record.edit': 'Edit ATA record',
  'ata_record.delete': 'Delete ATA record',
  'ata_record.view': 'View ATA record',
  'ata_record.submit': 'Submit ATA record',
  'ata_record.approve': 'Approve ATA record',
  'ata_record.reject': 'Reject ATA record',
  'ata_record.assign': 'Assign ATA record to Certifying Staff',
  'ata_record.direct_update': 'Update ATA entries directly',

  'form.create': 'Create form',
  'form.edit': 'Edit form',
  'form.delete': 'Delete form',
  'form.view': 'View form',
  'form.submit': 'Submit form',
  'form.approve': 'Approve form',
  'form.reject': 'Reject form',
  'form.delegate': 'Delegate form step',
  'form.return': 'Return form for rework',
  'form.skip': 'Skip a conditional / optional step',
  'form.assign': 'Assign or re-assign a form step',
  'form.signoff': 'Sign off a form',
  'form.request_review': 'Delegate a review while keeping the approval',
  'form.confirm_review': 'Confirm a delegated review',

  'folder.create': 'Create evaluation folder',
  'folder.edit': 'Edit evaluation folder',
  'folder.view': 'View evaluation folder',
  'folder.complete': 'Mark folder complete',
  'folder.lock': 'Lock folder after final sign-off',
  'folder.report': 'Generate folder PDF report',

  'documentation.assign_clerk': 'Assign a Documentation Clerk',
  'documentation.signoff': 'Documentation final sign-off',

  'training.enroll': 'Enrol employees for training',
  'training.verify': 'Verify training records',
  'training.approve': 'Approve training package',

  'expiry.amend': 'Amend an expired record',
  'revision.trigger': 'Raise a revision cycle',
  'revision.approve': 'Approve a revision cycle',
  'matrix.view': 'View competency / tool matrix',
  'matrix.edit': 'Edit competency / tool matrix',

  'notification.view': 'View notifications',
  'workflow.view_audit': 'View workflow audit log',

  'file.upload': 'Upload file',
  'file.delete': 'Delete file',
  'file.view': 'View file',
  'file.approve': 'Approve file',

  'user.create': 'Create user',
  'user.edit': 'Edit user',
  'user.delete': 'Delete user',
  'user.view': 'View user',
  'user.assign_role': 'Assign role',

  'department.create': 'Create department',
  'department.edit': 'Edit department',
  'department.view': 'View department',
}

export function permissionLabel(permission: string): string {
  return PERMISSION_LABELS[permission] ?? permission
}

/** Groups used by the privilege editor so 50+ checkboxes stay readable. */
export const PERMISSION_GROUPS: ReadonlyArray<{ title: string; prefixes: string[] }> = [
  { title: 'Shops', prefixes: ['shop.'] },
  { title: 'ATA records', prefixes: ['ata_record.'] },
  { title: 'Forms & workflow', prefixes: ['form.', 'workflow.'] },
  { title: 'Evaluation folders', prefixes: ['folder.'] },
  { title: 'Documentation team', prefixes: ['documentation.'] },
  { title: 'Training & HR', prefixes: ['training.'] },
  { title: 'Expiry, revision & matrices', prefixes: ['expiry.', 'revision.', 'matrix.'] },
  { title: 'Files', prefixes: ['file.'] },
  { title: 'Notifications', prefixes: ['notification.'] },
  { title: 'Users & departments', prefixes: ['user.', 'department.'] },
]

export function permissionGroupTitle(permission: string): string {
  const hit = PERMISSION_GROUPS.find(g => g.prefixes.some(p => permission.startsWith(p)))
  return hit ? hit.title : 'Other'
}

// =====================================================================================
// 7. DEFAULT PERMISSIONS  (mirror of RoleHierarchy.DefaultPermissions - v8, COMPLETE)
// =====================================================================================

export const DEFAULT_PERMISSIONS: Record<string, string[]> = {
  Admin: [
    PERMISSIONS.CreateShop, PERMISSIONS.EditShop, PERMISSIONS.DeleteShop, PERMISSIONS.ViewShop,
    PERMISSIONS.CreateATARecord, PERMISSIONS.EditATARecord, PERMISSIONS.DeleteATARecord, PERMISSIONS.ViewATARecord,
    PERMISSIONS.SubmitATARecord, PERMISSIONS.ApproveATARecord, PERMISSIONS.RejectATARecord,
    PERMISSIONS.AssignATARecord, PERMISSIONS.DirectUpdateATARecord,
    PERMISSIONS.CreateForm, PERMISSIONS.EditForm, PERMISSIONS.DeleteForm, PERMISSIONS.ViewForm,
    PERMISSIONS.SubmitForm, PERMISSIONS.ApproveForm, PERMISSIONS.RejectForm, PERMISSIONS.DelegateForm,
    PERMISSIONS.ReturnForm, PERMISSIONS.SkipFormStep, PERMISSIONS.AssignFormStep, PERMISSIONS.SignOffForm,
    // AMENDED v14 - Admin may both request and confirm a delegated review.
    PERMISSIONS.RequestDelegatedReview, PERMISSIONS.ConfirmDelegatedReview,
    PERMISSIONS.CreateFolder, PERMISSIONS.EditFolder, PERMISSIONS.ViewFolder,
    PERMISSIONS.CompleteFolder, PERMISSIONS.LockFolder, PERMISSIONS.GenerateFolderReport,
    PERMISSIONS.AssignDocumentationClerk, PERMISSIONS.SignOffDocumentation,
    PERMISSIONS.EnrollTraining, PERMISSIONS.VerifyTraining, PERMISSIONS.ApproveTraining,
    PERMISSIONS.AmendExpiredRecord, PERMISSIONS.TriggerRevision, PERMISSIONS.ApproveRevision,
    PERMISSIONS.ViewMatrix, PERMISSIONS.EditMatrix,
    PERMISSIONS.ViewNotification, PERMISSIONS.ViewWorkflowAudit,
    PERMISSIONS.UploadFile, PERMISSIONS.DeleteFile, PERMISSIONS.ViewFile, PERMISSIONS.ApproveFile,
    PERMISSIONS.CreateUser, PERMISSIONS.EditUser, PERMISSIONS.DeleteUser, PERMISSIONS.ViewUser, PERMISSIONS.AssignRole,
    PERMISSIONS.CreateDepartment, PERMISSIONS.EditDepartment, PERMISSIONS.ViewDepartment,
  ],
  SpecialAdmin: [
    PERMISSIONS.ViewForm, PERMISSIONS.EditForm, PERMISSIONS.ApproveForm,
    PERMISSIONS.RejectForm, PERMISSIONS.ReturnForm, PERMISSIONS.SignOffForm,
    PERMISSIONS.ViewNotification, PERMISSIONS.ViewWorkflowAudit,
    PERMISSIONS.ViewFile, PERMISSIONS.ApproveFile,
  ],
  Director: [
    PERMISSIONS.CreateShop, PERMISSIONS.EditShop, PERMISSIONS.ViewShop,
    PERMISSIONS.ViewATARecord, PERMISSIONS.EditATARecord, PERMISSIONS.ApproveATARecord, PERMISSIONS.RejectATARecord,
    PERMISSIONS.ViewForm, PERMISSIONS.EditForm, PERMISSIONS.ApproveForm, PERMISSIONS.RejectForm,
    PERMISSIONS.DelegateForm, PERMISSIONS.ReturnForm, PERMISSIONS.SkipFormStep, PERMISSIONS.SignOffForm,
    // AMENDED v14 - 918 / 918A: borrow a departmental reviewer, keep the approval.
    PERMISSIONS.RequestDelegatedReview,
    PERMISSIONS.ViewFolder, PERMISSIONS.EditFolder, PERMISSIONS.CompleteFolder, PERMISSIONS.LockFolder,
    PERMISSIONS.GenerateFolderReport,
    PERMISSIONS.ApproveTraining, PERMISSIONS.ApproveRevision, PERMISSIONS.TriggerRevision,
    PERMISSIONS.ViewMatrix, PERMISSIONS.ViewNotification, PERMISSIONS.ViewWorkflowAudit,
    PERMISSIONS.ViewFile, PERMISSIONS.ApproveFile,
    PERMISSIONS.CreateUser, PERMISSIONS.EditUser, PERMISSIONS.DeleteUser, PERMISSIONS.ViewUser, PERMISSIONS.AssignRole,
    PERMISSIONS.CreateDepartment, PERMISSIONS.EditDepartment, PERMISSIONS.ViewDepartment,
  ],
  SpecialTeamLeader: [
    PERMISSIONS.ViewShop,
    PERMISSIONS.ViewATARecord, PERMISSIONS.EditATARecord, PERMISSIONS.ApproveATARecord, PERMISSIONS.RejectATARecord,
    PERMISSIONS.AssignATARecord, PERMISSIONS.DirectUpdateATARecord,
    PERMISSIONS.ViewForm, PERMISSIONS.EditForm, PERMISSIONS.ApproveForm, PERMISSIONS.RejectForm,
    PERMISSIONS.DelegateForm, PERMISSIONS.ReturnForm, PERMISSIONS.SkipFormStep,
    PERMISSIONS.AssignFormStep, PERMISSIONS.SignOffForm,
    PERMISSIONS.ViewFolder, PERMISSIONS.GenerateFolderReport,
    PERMISSIONS.ViewMatrix, PERMISSIONS.ViewNotification, PERMISSIONS.ViewWorkflowAudit,
    PERMISSIONS.ViewFile, PERMISSIONS.ApproveFile,
    PERMISSIONS.CreateUser, PERMISSIONS.EditUser, PERMISSIONS.ViewUser, PERMISSIONS.AssignRole,
  ],
  Manager: [
    PERMISSIONS.ViewShop, PERMISSIONS.EditShop,
    PERMISSIONS.ViewATARecord, PERMISSIONS.EditATARecord, PERMISSIONS.ApproveATARecord, PERMISSIONS.RejectATARecord,
    PERMISSIONS.ViewForm, PERMISSIONS.EditForm, PERMISSIONS.ApproveForm, PERMISSIONS.RejectForm,
    PERMISSIONS.DelegateForm, PERMISSIONS.ReturnForm, PERMISSIONS.SkipFormStep, PERMISSIONS.SignOffForm,
    // AMENDED v14 - a Manager both borrows reviewers (own approval tiers) and may BE picked
    // as the delegated reviewer of a Director / QA 918 step.
    PERMISSIONS.RequestDelegatedReview, PERMISSIONS.ConfirmDelegatedReview,
    PERMISSIONS.ViewFolder, PERMISSIONS.EditFolder, PERMISSIONS.GenerateFolderReport,
    PERMISSIONS.ApproveTraining, PERMISSIONS.ApproveRevision,
    PERMISSIONS.ViewMatrix, PERMISSIONS.ViewNotification, PERMISSIONS.ViewWorkflowAudit,
    PERMISSIONS.ViewFile, PERMISSIONS.ApproveFile,
    PERMISSIONS.CreateUser, PERMISSIONS.EditUser, PERMISSIONS.ViewUser, PERMISSIONS.AssignRole,
    PERMISSIONS.ViewDepartment,
  ],
  HRManager: [
    PERMISSIONS.ViewShop, PERMISSIONS.ViewATARecord,
    PERMISSIONS.ViewForm, PERMISSIONS.EditForm, PERMISSIONS.ApproveForm, PERMISSIONS.RejectForm,
    PERMISSIONS.DelegateForm, PERMISSIONS.ReturnForm, PERMISSIONS.AssignFormStep, PERMISSIONS.SignOffForm,
    // AMENDED v14 - Training Verification: delegate the initial review to an HR Specialist,
    // then provide the final approval personally.
    PERMISSIONS.RequestDelegatedReview,
    PERMISSIONS.ViewFolder,
    PERMISSIONS.VerifyTraining, PERMISSIONS.ApproveTraining,
    PERMISSIONS.AmendExpiredRecord, PERMISSIONS.ViewMatrix, PERMISSIONS.EditMatrix,
    PERMISSIONS.ViewNotification, PERMISSIONS.ViewWorkflowAudit,
    PERMISSIONS.ViewFile, PERMISSIONS.ApproveFile,
    PERMISSIONS.CreateUser, PERMISSIONS.EditUser, PERMISSIONS.ViewUser,
  ],
  DocumentationTeamLeader: [
    PERMISSIONS.ViewShop, PERMISSIONS.ViewATARecord,
    PERMISSIONS.CreateForm, PERMISSIONS.EditForm, PERMISSIONS.ViewForm, PERMISSIONS.SubmitForm,
    PERMISSIONS.ApproveForm, PERMISSIONS.RejectForm, PERMISSIONS.DelegateForm, PERMISSIONS.ReturnForm,
    PERMISSIONS.AssignFormStep, PERMISSIONS.SignOffForm,
    // AMENDED v14 - Service Bulletins: assign the sign-off to a clerk for review, then
    // issue the final approval personally.
    PERMISSIONS.RequestDelegatedReview,
    PERMISSIONS.AssignDocumentationClerk, PERMISSIONS.SignOffDocumentation,
    PERMISSIONS.ViewFolder, PERMISSIONS.ViewMatrix,
    PERMISSIONS.ViewNotification, PERMISSIONS.ViewWorkflowAudit,
    PERMISSIONS.UploadFile, PERMISSIONS.ViewFile, PERMISSIONS.ApproveFile,
    PERMISSIONS.CreateUser, PERMISSIONS.EditUser, PERMISSIONS.ViewUser,
  ],
  ShopManager: [
    PERMISSIONS.ViewShop, PERMISSIONS.EditShop,
    PERMISSIONS.CreateATARecord, PERMISSIONS.EditATARecord, PERMISSIONS.ViewATARecord,
    PERMISSIONS.SubmitATARecord, PERMISSIONS.ApproveATARecord, PERMISSIONS.RejectATARecord,
    PERMISSIONS.AssignATARecord,
    PERMISSIONS.CreateForm, PERMISSIONS.EditForm, PERMISSIONS.ViewForm,
    PERMISSIONS.SubmitForm, PERMISSIONS.ApproveForm, PERMISSIONS.RejectForm,
    PERMISSIONS.DelegateForm, PERMISSIONS.ReturnForm, PERMISSIONS.SkipFormStep,
    PERMISSIONS.AssignFormStep, PERMISSIONS.SignOffForm,
    // AMENDED v14 - eligible delegated reviewer of a 918 / 918A departmental review.
    PERMISSIONS.ConfirmDelegatedReview,
    PERMISSIONS.CreateFolder, PERMISSIONS.EditFolder, PERMISSIONS.ViewFolder,
    PERMISSIONS.CompleteFolder, PERMISSIONS.GenerateFolderReport,
    PERMISSIONS.EnrollTraining, PERMISSIONS.AmendExpiredRecord, PERMISSIONS.TriggerRevision,
    PERMISSIONS.ViewMatrix, PERMISSIONS.EditMatrix,
    PERMISSIONS.ViewNotification, PERMISSIONS.ViewWorkflowAudit,
    PERMISSIONS.UploadFile, PERMISSIONS.ViewFile, PERMISSIONS.ApproveFile,
    PERMISSIONS.CreateUser, PERMISSIONS.EditUser, PERMISSIONS.ViewUser, PERMISSIONS.AssignRole,
  ],
  TeamLeader: [
    PERMISSIONS.ViewShop, PERMISSIONS.EditShop,
    PERMISSIONS.CreateATARecord, PERMISSIONS.EditATARecord, PERMISSIONS.ViewATARecord,
    PERMISSIONS.SubmitATARecord, PERMISSIONS.ApproveATARecord, PERMISSIONS.RejectATARecord,
    PERMISSIONS.AssignATARecord,
    PERMISSIONS.CreateForm, PERMISSIONS.EditForm, PERMISSIONS.ViewForm,
    PERMISSIONS.SubmitForm, PERMISSIONS.ApproveForm, PERMISSIONS.RejectForm,
    PERMISSIONS.DelegateForm, PERMISSIONS.ReturnForm, PERMISSIONS.SkipFormStep,
    PERMISSIONS.AssignFormStep, PERMISSIONS.SignOffForm,
    // AMENDED v14 - eligible delegated reviewer of a 918 / 918A departmental review.
    PERMISSIONS.ConfirmDelegatedReview,
    PERMISSIONS.CreateFolder, PERMISSIONS.EditFolder, PERMISSIONS.ViewFolder,
    PERMISSIONS.CompleteFolder, PERMISSIONS.GenerateFolderReport,
    PERMISSIONS.EnrollTraining, PERMISSIONS.AmendExpiredRecord, PERMISSIONS.TriggerRevision,
    PERMISSIONS.ViewMatrix, PERMISSIONS.EditMatrix,
    PERMISSIONS.ViewNotification, PERMISSIONS.ViewWorkflowAudit,
    PERMISSIONS.UploadFile, PERMISSIONS.DeleteFile, PERMISSIONS.ViewFile, PERMISSIONS.ApproveFile,
    PERMISSIONS.CreateUser, PERMISSIONS.EditUser, PERMISSIONS.ViewUser, PERMISSIONS.AssignRole,
  ],
  HRSpecialist: [
    PERMISSIONS.ViewShop, PERMISSIONS.ViewATARecord,
    PERMISSIONS.EditForm, PERMISSIONS.ViewForm, PERMISSIONS.SubmitForm, PERMISSIONS.ApproveForm,
    PERMISSIONS.ReturnForm,
    // AMENDED v14 - Training Verification: act as the HR Manager's delegated reviewer.
    PERMISSIONS.ConfirmDelegatedReview,
    PERMISSIONS.ViewFolder,
    PERMISSIONS.VerifyTraining,
    PERMISSIONS.ViewMatrix, PERMISSIONS.EditMatrix,
    PERMISSIONS.ViewNotification,
    PERMISSIONS.UploadFile, PERMISSIONS.ViewFile,
  ],
  DocumentationClerk: [
    PERMISSIONS.ViewShop, PERMISSIONS.ViewATARecord,
    PERMISSIONS.EditForm, PERMISSIONS.ViewForm, PERMISSIONS.SubmitForm, PERMISSIONS.ReturnForm,
    // AMENDED v14 - Service Bulletins: act as the DL's delegated reviewer.
    PERMISSIONS.ConfirmDelegatedReview,
    PERMISSIONS.ViewFolder,
    PERMISSIONS.ViewNotification,
    PERMISSIONS.UploadFile, PERMISSIONS.ViewFile,
  ],
  Engineer: [
    PERMISSIONS.ViewShop,
    PERMISSIONS.CreateATARecord, PERMISSIONS.EditATARecord, PERMISSIONS.ViewATARecord, PERMISSIONS.SubmitATARecord,
    PERMISSIONS.CreateForm, PERMISSIONS.EditForm, PERMISSIONS.ViewForm, PERMISSIONS.SubmitForm,
    PERMISSIONS.ApproveForm, PERMISSIONS.RejectForm, PERMISSIONS.ReturnForm, PERMISSIONS.SkipFormStep,
    // AMENDED v14 - eligible delegated reviewer (918 / 918A, ECAA pool).
    PERMISSIONS.ConfirmDelegatedReview,
    PERMISSIONS.ViewFolder,
    PERMISSIONS.ViewMatrix, PERMISSIONS.ViewNotification,
    PERMISSIONS.UploadFile, PERMISSIONS.ViewFile,
  ],
  Inspector: [
    PERMISSIONS.ViewShop, PERMISSIONS.ViewATARecord,
    PERMISSIONS.EditForm, PERMISSIONS.ViewForm, PERMISSIONS.SubmitForm,
    PERMISSIONS.ApproveForm, PERMISSIONS.RejectForm, PERMISSIONS.ReturnForm, PERMISSIONS.SignOffForm,
    // AMENDED v14 - eligible delegated reviewer (918 / 918A, ECAA pool).
    PERMISSIONS.ConfirmDelegatedReview,
    PERMISSIONS.ViewFolder,
    PERMISSIONS.ViewMatrix, PERMISSIONS.ViewNotification,
    PERMISSIONS.UploadFile, PERMISSIONS.ViewFile, PERMISSIONS.ApproveFile,
  ],
  CertifyingStaff: [
    PERMISSIONS.ViewShop,
    PERMISSIONS.ViewATARecord, PERMISSIONS.EditATARecord, PERMISSIONS.SubmitATARecord,
    PERMISSIONS.EditForm, PERMISSIONS.ViewForm, PERMISSIONS.SubmitForm,
    PERMISSIONS.ApproveForm, PERMISSIONS.ReturnForm, PERMISSIONS.SignOffForm,
    // AMENDED v14 - eligible delegated reviewer (918 / 918A, ECAA pool).
    PERMISSIONS.ConfirmDelegatedReview,
    PERMISSIONS.ViewFolder,
    PERMISSIONS.ViewMatrix, PERMISSIONS.ViewNotification,
    PERMISSIONS.UploadFile, PERMISSIONS.ViewFile, PERMISSIONS.ApproveFile,
  ],
  QAPersonnel: [
    PERMISSIONS.ViewShop,
    PERMISSIONS.ViewATARecord, PERMISSIONS.ApproveATARecord, PERMISSIONS.RejectATARecord,
    PERMISSIONS.ViewForm, PERMISSIONS.ApproveForm, PERMISSIONS.RejectForm,
    PERMISSIONS.ReturnForm, PERMISSIONS.SignOffForm,
    // AMENDED v14 - the QA Manager BOTH borrows a reviewer for his own MNT-918 approval AND
    // may be picked as the ECAA Team's delegated reviewer on MNT-918A.
    PERMISSIONS.RequestDelegatedReview, PERMISSIONS.ConfirmDelegatedReview,
    PERMISSIONS.ViewFolder, PERMISSIONS.GenerateFolderReport,
    PERMISSIONS.ViewMatrix, PERMISSIONS.ViewNotification, PERMISSIONS.ViewWorkflowAudit,
    PERMISSIONS.ViewFile, PERMISSIONS.ApproveFile,
    PERMISSIONS.ViewUser, PERMISSIONS.ViewDepartment,
  ],
  Technician: [
    PERMISSIONS.ViewShop,
    PERMISSIONS.ViewATARecord,
    PERMISSIONS.EditForm, PERMISSIONS.ViewForm, PERMISSIONS.SubmitForm,
    PERMISSIONS.ApproveForm, PERMISSIONS.SignOffForm,
    // AMENDED v14 - eligible delegated reviewer (918 / 918A departmental pool).
    PERMISSIONS.ConfirmDelegatedReview,
    PERMISSIONS.ViewFolder,
    PERMISSIONS.ViewNotification,
    PERMISSIONS.UploadFile, PERMISSIONS.ViewFile,
  ],
  ECAAPersonnel: [
    PERMISSIONS.ViewShop,
    PERMISSIONS.ViewATARecord,
    PERMISSIONS.ViewForm, PERMISSIONS.ApproveForm, PERMISSIONS.RejectForm, PERMISSIONS.SignOffForm,
    // AMENDED v14 - MNT-918A: borrow a reviewer, keep the endorsement.
    PERMISSIONS.RequestDelegatedReview,
    PERMISSIONS.ViewFolder,
    PERMISSIONS.ViewNotification,
    PERMISSIONS.ViewFile,
  ],
}

/** Every permission the system knows about, sorted - mirror of RoleHierarchy.AllPermissions. */
export const ALL_PERMISSIONS: string[] = Array.from(
  new Set(Object.values(DEFAULT_PERMISSIONS).flat()),
).sort()

function splitCsv(csv?: string | null): string[] {
  if (!csv) return []
  return csv
    .split(',')
    .map(x => x.trim())
    .filter(x => x.length > 0)
}

/** role defaults + AdditionalPermissions - RevokedPermissions. */
export function effectivePermissions(
  role?: string | null,
  additionalCsv?: string | null,
  revokedCsv?: string | null,
): string[] {
  const canonical = normalizeRole(role)
  const result = new Set<string>(canonical ? DEFAULT_PERMISSIONS[canonical] ?? [] : [])
  for (const p of splitCsv(additionalCsv)) result.add(p)
  for (const p of splitCsv(revokedCsv)) result.delete(p)
  return Array.from(result).sort()
}

/**
 * The Admin short-circuit is intentional and mirrors WorkflowActorContext.Has: the Admin is
 * the universal supervisor and holds every permission implicitly.
 */
export function hasPermission(
  role: string | null | undefined,
  additionalCsv: string | null | undefined,
  revokedCsv: string | null | undefined,
  permission: string,
): boolean {
  if (normalizeRole(role) === ORG_ROLES.Admin) return true
  return effectivePermissions(role, additionalCsv, revokedCsv).includes(permission)
}

/**
 * Convenience check for components that already hold the resolved permission list coming
 * from GET /api/workflow/my-permissions (ALWAYS prefer this over recomputing locally).
 */
export function hasPermissionIn(
  permissions: string[] | null | undefined,
  permission: string,
  role?: string | null,
): boolean {
  if (normalizeRole(role) === ORG_ROLES.Admin) return true
  return Array.isArray(permissions) && permissions.includes(permission)
}

// =====================================================================================
// 8. PRIVILEGE DELEGATION  ("Directors can assign privileges such as edit, delete ...")
// =====================================================================================

export function canGrantPrivileges(grantorRole?: string | null): boolean {
  const canonical = normalizeRole(grantorRole)
  return !!canonical && PRIVILEGE_GRANTOR_ROLES.includes(canonical)
}

/**
 * The permissions a grantor may hand out. An Admin may grant everything; anybody else may
 * only grant permissions from its OWN default set, which makes privilege escalation
 * structurally impossible.
 */
export function grantablePermissions(grantorRole?: string | null): string[] {
  const canonical = normalizeRole(grantorRole)
  if (!canonical || !canGrantPrivileges(canonical)) return []
  if (canonical === ORG_ROLES.Admin) return [...ALL_PERMISSIONS]
  return Array.from(new Set(DEFAULT_PERMISSIONS[canonical] ?? [])).sort()
}

export function canAdjustPrivilegesOf(
  grantorRole?: string | null,
  targetRole?: string | null,
): boolean {
  const grantor = normalizeRole(grantorRole)
  const target = normalizeRole(targetRole)
  if (!grantor || !target) return false
  if (!canGrantPrivileges(grantor)) return false
  if (grantor === ORG_ROLES.Admin) return true
  if (grantor === ORG_ROLES.Manager && target === ORG_ROLES.SpecialAdmin) return true
  if (isAdminOnly(target)) return false
  return rankOf(target) > rankOf(grantor)
}

/** Single check mirroring the server guard on PUT /api/users/{id}/permissions. */
export function canGrantPermission(
  grantorRole: string | null | undefined,
  targetRole: string | null | undefined,
  permission: string,
): boolean {
  if (!canAdjustPrivilegesOf(grantorRole, targetRole)) return false
  if (!permission || !permission.trim()) return false
  return grantablePermissions(grantorRole).includes(permission.trim())
}

// =====================================================================================
// 9. SCOPE VOCABULARY  (mirror of WorkflowPermissionMatrix.Scopes)
//    Used ONLY to explain a disabled control with the same words the API returns.
// =====================================================================================

export const WORKFLOW_SCOPES = {
  OwnShop: 'OWN_SHOP',
  FunctionalUnit: 'FUNCTIONAL_UNIT',
  AssignedOnly: 'ASSIGNED_ONLY',
  DesignatedOnly: 'DESIGNATED_ONLY',
  Department: 'DEPARTMENT',
  Global: 'GLOBAL',
} as const

export type WorkflowScope = (typeof WORKFLOW_SCOPES)[keyof typeof WORKFLOW_SCOPES]

export const WORKFLOW_SCOPE_LABELS: Record<string, string> = {
  OWN_SHOP: 'Restricted to the originating shop',
  FUNCTIONAL_UNIT: 'Owned by a central functional unit',
  ASSIGNED_ONLY: 'Only the assigned person may act',
  DESIGNATED_ONLY: 'Routed exclusively to the designated person',
  DEPARTMENT: 'Department tier (Manager / Director)',
  GLOBAL: 'No additional scope restriction',
}

export function workflowScopeLabel(scope?: string | null): string {
  if (!scope) return '-'
  return WORKFLOW_SCOPE_LABELS[scope] ?? scope
}