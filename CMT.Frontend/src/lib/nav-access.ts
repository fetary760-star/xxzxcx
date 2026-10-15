/**
 * Navigation & User-Management access rules — NEW in v9.
 *
 * ================================ WHY THIS FILE ================================
 * The sidebar used to hard-code `roles: ['admin', 'director']` on the
 * "Users Management" entry. That contradicted the amended hierarchy, where the
 * shop layer is OWNED by the department Manager:
 *
 *   Manager      -> creates Shop Manager, Shop Team Leader
 *   ShopManager  -> creates Shop Team Leader, Certifying Staff
 *   TeamLeader   -> creates Technician, Certifying Staff, QA, ECAA Personnel
 *   SpecialTL    -> creates Engineer
 *
 * All four roles therefore NEED the User Management screen, but the sidebar hid
 * it, so the hierarchy could never be populated below the Director.
 *
 * This module derives navigation visibility from the SINGLE source of truth
 * (`@/lib/role-hierarchy`, the 1:1 mirror of RoleHierarchy.cs) instead of from a
 * hand-written role list, so the menu can never drift from the server rules
 * again:
 *
 *   - a role sees "User Management" when it can create at least one role
 *     (CREATION_MATRIX) or when it may assign privileges (PRIVILEGE_GRANTOR_ROLES);
 *   - Individual Personnel (Engineer, Technician, Certifying Staff, QA, ECAA)
 *     create nobody, so the entry stays hidden for them;
 *   - the "FYI" delegation rule is honoured: once the department has an active
 *     Manager, department-level creators (Director) no longer get Shop Manager /
 *     Shop Team Leader offered.
 *
 * The same helpers are meant to guard the /admin page itself, so the sidebar link
 * and the page guard can never disagree:
 *
 *   const canAccessAdmin =
 *     creationRules.length > 0 || canAccessUserManagement(user?.role)
 */

import {
  ORG_ROLES,
  type OrgRole,
  type RoleRule,
  ALL_ROLES,
  PERMISSIONS,
  canGrantPrivileges,
  creatableRoles,
  creatableRulesFiltered,
  effectivePermissions,
  isIndividualPersonnel,
  normalizeRole as normalizeCanonicalRole,
  rankOf,
  roleLabel,
} from '@/lib/role-hierarchy'

import { canManageSignatures } from '@/lib/signature/signature-access';
/** Effective-permission inputs carried on the signed-in user, when available. */
export interface PermissionOverrides {
  additionalPermissions?: string | null
  revokedPermissions?: string | null
}

/** Canonical PascalCase role for any spelling (legacy, snake_case, display). */
export function toCanonicalRole(role?: string | null): OrgRole | null {
  return normalizeCanonicalRole(role ?? undefined)
}

/**
 * Roles that must see the "User Management" entry, DERIVED from the creation
 * matrix + the privilege-grantor list. Currently resolves to:
 * Admin, Director, SpecialTeamLeader, Manager, ShopManager, TeamLeader.
 */
export const USER_MANAGEMENT_ROLES: OrgRole[] = ALL_ROLES.filter(
  role => creatableRoles(role).length > 0 || canGrantPrivileges(role),
)

/** Roles with cross-shop / cross-department oversight (reporting & analytics). */
export const OVERSIGHT_ROLES: OrgRole[] = [
  ORG_ROLES.Admin,
  ORG_ROLES.Director,
  ORG_ROLES.SpecialTeamLeader,
  ORG_ROLES.Manager,
  ORG_ROLES.ShopManager,
]

/**
 * AMENDED v14 FEATURE 2 — roles that see the "Engineer Metrics" counter tab on the
 * dashboard. The Special Team Leader owns Engineer provisioning and output tracking;
 * Admin / Director keep central oversight. Derived here so the sidebar entry and the
 * dashboard view can never disagree (same pattern as USER_MANAGEMENT_ROLES).
 */
export const ENGINEER_METRICS_ROLES: OrgRole[] = [
  ORG_ROLES.SpecialTeamLeader,
  ORG_ROLES.Admin,
  ORG_ROLES.Director,
]

/** True when the role may open the Engineer record-counter metrics view. */
export function canViewEngineerMetrics(role?: string | null): boolean {
  const canonical = toCanonicalRole(role)
  return !!canonical && ENGINEER_METRICS_ROLES.includes(canonical)
}

/**
 * True when the role may create or promote at least one other role.
 *
 * Pass `departmentHasActiveManager = true` to apply the delegation rule, so a
 * Director whose department already has a Manager is evaluated against its
 * REMAINING creatable roles (Manager) rather than the raw matrix.
 */
export function canCreateAnyUser(
  role?: string | null,
  departmentHasActiveManager = false,
): boolean {
  return creatableRulesFiltered(toCanonicalRole(role), departmentHasActiveManager).length > 0
}

/**
 * THE SIDEBAR RULE.
 *
 * "Ensure that Managers have access to User Management to create Shop Manager
 *  and Shop Team Leader roles. Additionally, Shop Managers and Shop Team Leaders
 *  must be able to access User Management to create Certifying Staff etc."
 *
 * A role sees User Management when it can create somebody OR when it may adjust
 * privileges (Directors "assign privileges such as edit, delete, etc.").
 * Individual Personnel never see it.
 */
export function canAccessUserManagement(
  role?: string | null,
  departmentHasActiveManager = false,
): boolean {
  const canonical = toCanonicalRole(role)
  if (!canonical) return false
  if (isIndividualPersonnel(canonical)) return false
  return canCreateAnyUser(canonical, departmentHasActiveManager) || canGrantPrivileges(canonical)
}

/** The role rules the "Create User" dropdown may render for this creator. */
export function creatableRoleRules(
  role?: string | null,
  departmentHasActiveManager = false,
): RoleRule[] {
  return creatableRulesFiltered(toCanonicalRole(role), departmentHasActiveManager)
}

/** Display labels of the roles this user may create — used as menu hint text. */
export function creatableRoleLabels(
  role?: string | null,
  departmentHasActiveManager = false,
): string[] {
  return creatableRoleRules(role, departmentHasActiveManager).map(rule => roleLabel(rule.role))
}

/** True for roles allowed to open the reports / analytics view. */
export function canAccessReports(role?: string | null): boolean {
  const canonical = toCanonicalRole(role)
  return !!canonical && OVERSIGHT_ROLES.includes(canonical)
}

/**
 * True when the role may open the Self Evaluation workspace at all — derived
 * from the effective permission set (defaults + granted − revoked), so a revoked
 * `form.view` really removes the entry.
 */
export function canAccessSelfEvaluation(
  role?: string | null,
  overrides?: PermissionOverrides,
): boolean {
  const canonical = toCanonicalRole(role)
  if (!canonical) return false
  return effectivePermissions(
    canonical,
    overrides?.additionalPermissions ?? null,
    overrides?.revokedPermissions ?? null,
  ).includes(PERMISSIONS.ViewForm)
}

/** True when the role supervises a whole shop group (several Shop Team Leaders). */
export function canViewShopGroup(role?: string | null): boolean {
  const canonical = toCanonicalRole(role)
  if (!canonical) return false
  return rankOf(canonical) <= rankOf(ORG_ROLES.ShopManager)
}
export function canAccessSignatureLibrary(role: string | null | undefined): boolean {
  return canManageSignatures(role);
}