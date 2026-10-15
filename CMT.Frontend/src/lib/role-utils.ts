/**
 * Role Normalization & Hierarchy Utility — AMENDED v3
 *
 * Centralizes role handling so the sidebar, the permission system, the admin
 * panel, the API layer and every form use the same mapping.
 *
 * The backend stores roles in PascalCase ("TeamLeader", "SpecialTeamLeader")
 * while the frontend permission system uses snake_case ("team_leader",
 * "special_team_leader"). This file owns the translation in both directions.
 *
 * ===================== WHAT v3 CHANGES vs v2 =====================
 * v2 carried its OWN creation matrix (`ROLE_CAN_CREATE`) which was a THIRD,
 * contradictory source of truth next to RoleHierarchy.cs and role-hierarchy.ts:
 *
 *   v2 here     : director      -> special_team_leader, engineer, technician, ...
 *   v7 server   : Director      -> Manager, ShopManager, TeamLeader   (only)
 *   v2 here     : shop_manager  -> engineer, qa, ecaa, ...
 *   v7 server   : ShopManager   -> TeamLeader, CertifyingStaff        (only)
 *
 * Anything that trusted `canRoleCreate()` therefore offered roles the API
 * rejects with a 422, and it let a Director create a Special Team Leader even
 * though that role is Admin-only.
 *
 * v3 fixes it by DERIVING everything from the canonical mirror in
 * `@/lib/role-hierarchy` (which mirrors RoleHierarchy.cs 1:1):
 *   - `ROLE_CAN_CREATE` is now generated from CREATION_MATRIX and keyed by the
 *     snake_case role names this file exposes;
 *   - `canRoleCreate()` delegates to `canCreate()`, so the Admin-only guard for
 *     Director / Special Team Leader is honoured;
 *   - `canRoleCreateInDepartment()` additionally applies the Manager delegation
 *     rule ("once the Manager exists, department-level creators may no longer
 *     create Shop Team Leaders or Shop Managers");
 *   - `isShopOversightRole()` now follows the shop group definition, and
 *     `isPrivilegeGrantorRole()` / `isIndividualPersonnelRole()` are exposed for
 *     the User Management screens.
 *
 * Hierarchy:
 *   admin
 *     └── director (one per department, Admin-assigned only)
 *           ├── special_team_leader   (created by Admin under a Director;
 *           │                          owns approvals + engineer assignment)
 *           │     └── engineer
 *           └── manager (ACS / MCS / NDT / Standard ...)
 *                 ├── shop_manager    (oversees several Shop Team Leaders)
 *                 │     └── shop_tl / certifying_staff
 *                 └── shop_tl         (Wheel / Galley / Emergency / Electric ...)
 *                       ├── technician
 *                       ├── certifying_staff
 *                       ├── qa_personnel
 *                       └── ecaa_personnel
 */

import {
  CREATION_MATRIX,
  canCreate as canCreateCanonical,
  isBlockedByManagerDelegation,
  isIndividualPersonnel,
  canGrantPrivileges,
  sharesShopScope,
  normalizeRole as normalizeCanonicalRole,
} from '@/lib/role-hierarchy'

/** Canonical internal (snake_case) role keys. */
export const NORMALIZED_ROLES = [
  'admin',
  'special_admin',
  'director',
  'special_team_leader',
  'manager',
  'shop_manager',
  'team_leader',
  'shop_tl',
  'engineer',
  'technician',
  'certifying_staff',
  'qa_staff',
  'qa_personnel',
  'ecaa_personnel',
  'hr',
  'customer_personnel',
] as const

export type NormalizedRole = typeof NORMALIZED_ROLES[number]

const ROLE_MAP: Record<string, string> = {
  // Admin
  'admin': 'admin',
  'administrator': 'admin',
  'special_admin': 'special_admin',
  'specialadmin': 'special_admin',
  'special admin': 'special_admin',

  // Director
  'director': 'director',

  // Special Team Leader — created by Admin under a Director
  'special_team_leader': 'special_team_leader',
  'specialteamleader': 'special_team_leader',
  'special-team-leader': 'special_team_leader',
  'special_tl': 'special_team_leader',
  'specialtl': 'special_team_leader',

  // Manager
  'manager': 'manager',
  'department_manager': 'manager',
  'departmentmanager': 'manager',

  // Team Leader (backend sends "TeamLeader")
  'team_leader': 'team_leader',
  'teamleader': 'team_leader',
  'team-leader': 'team_leader',

  // Shop Team Leader
  'shop_tl': 'shop_tl',
  'shoptl': 'shop_tl',
  'shop-tl': 'shop_tl',
  'shop_team_leader': 'shop_tl',
  'shopteamleader': 'shop_tl',
  'shop-team-leader': 'shop_tl',

  // Shop Manager (backend sends "ShopManager")
  'shop_manager': 'shop_manager',
  'shopmanager': 'shop_manager',
  'shop-manager': 'shop_manager',
  'shop_mgr': 'shop_manager',

  // Engineer
  'engineer': 'engineer',

  // Technician
  'technician': 'technician',

  // Certifying Staff (backend sends "CertifyingStaff")
  'certifying_staff': 'certifying_staff',
  'certifyingstaff': 'certifying_staff',
  'certifying-staff': 'certifying_staff',

  // QA Staff / QA Personnel
  'qa_staff': 'qa_staff',
  'qastaff': 'qa_staff',
  'qa-staff': 'qa_staff',
  'qa': 'qa_staff',
  'qa_personnel': 'qa_personnel',
  'qapersonnel': 'qa_personnel',
  'qa-personnel': 'qa_personnel',

  // ECAA Personnel (authority reviewer)
  'ecaa_personnel': 'ecaa_personnel',
  'ecaapersonnel': 'ecaa_personnel',
  'ecaa-personnel': 'ecaa_personnel',
  'ecaa': 'ecaa_personnel',

  // HR
  'hr': 'hr',

  // Customer Personnel
  'customer_personnel': 'customer_personnel',
  'customerpersonnel': 'customer_personnel',
  'customer-personnel': 'customer_personnel',
  'customer': 'customer_personnel',
}

/**
 * Normalizes a role string from any format (PascalCase, camelCase, kebab-case,
 * spaced) to the internal snake_case format used by the permission system.
 *
 *   "TeamLeader"        → "team_leader"
 *   "SpecialTeamLeader" → "special_team_leader"
 *   "ShopTeamLeader"    → "shop_tl"
 *   "QAPersonnel"       → "qa_personnel"
 *   "Engineer"          → "engineer"
 */
export function normalizeRole(role: string | undefined | null): string {
  if (!role) return 'engineer'

  // "TeamLeader" → "teamleader"
  const lowered = role.toLowerCase().trim()

  // "TeamLeader" → "team_leader" (handles consecutive capitals such as "QAPersonnel")
  const snakeCased = role
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .replace(/^_/, '')
    .trim()

  if (ROLE_MAP[lowered]) return ROLE_MAP[lowered]
  if (ROLE_MAP[snakeCased]) return ROLE_MAP[snakeCased]

  const withUnderscores = lowered.replace(/[\s\-]+/g, '_')
  if (ROLE_MAP[withUnderscores]) return ROLE_MAP[withUnderscores]

  return withUnderscores
}

/**
 * Backend role names accepted by UserManagementController.
 * NOTE: the persisted value of a Shop Team Leader is "TeamLeader"; the server
 * normalises "ShopTeamLeader" to it, so both keys map to the canonical value.
 */
export const BACKEND_ROLE_BY_NORMALIZED: Record<string, string> = {
  admin: 'Admin',
  special_admin: 'SpecialAdmin',
  director: 'Director',
  special_team_leader: 'SpecialTeamLeader',
  manager: 'Manager',
  shop_manager: 'ShopManager',
  team_leader: 'TeamLeader',
  shop_tl: 'TeamLeader',
  engineer: 'Engineer',
  technician: 'Technician',
  certifying_staff: 'CertifyingStaff',
  qa_staff: 'QAPersonnel',
  qa_personnel: 'QAPersonnel',
  ecaa_personnel: 'ECAAPersonnel',
}

/** snake_case key for a canonical PascalCase role. */
const NORMALIZED_BY_BACKEND_ROLE: Record<string, string> = {
  Admin: 'admin',
  Director: 'director',
  SpecialTeamLeader: 'special_team_leader',
  Manager: 'manager',
  ShopManager: 'shop_manager',
  TeamLeader: 'shop_tl',
  Engineer: 'engineer',
  Technician: 'technician',
  CertifyingStaff: 'certifying_staff',
  QAPersonnel: 'qa_personnel',
  ECAAPersonnel: 'ecaa_personnel',
}

/**
 * Converts any role spelling into the exact PascalCase value the backend
 * accepts. Prevents 400 "Invalid role" responses from /api/users/assign-role.
 */
export function toBackendRole(role: string | undefined | null): string {
  const normalized = normalizeRole(role)
  return BACKEND_ROLE_BY_NORMALIZED[normalized] ?? 'Engineer'
}

/** Human readable labels, keyed by normalized role. */
export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  admin: 'Admin',
  director: 'Director',
  special_team_leader: 'Special Team Leader',
  manager: 'Manager',
  shop_manager: 'Shop Manager',
  team_leader: 'Shop Team Leader',
  shop_tl: 'Shop Team Leader',
  engineer: 'Engineer',
  technician: 'Technician',
  certifying_staff: 'Certifying Staff',
  qa_staff: 'QA Personnel',
  qa_personnel: 'QA Personnel',
  ecaa_personnel: 'ECAA Personnel',
  hr: 'HR',
  customer_personnel: 'Customer Personnel',
}

/** Returns a display label for any role spelling. */
export function getRoleDisplayName(role: string | undefined | null): string {
  if (!role) return ''
  const normalized = normalizeRole(role)
  return ROLE_DISPLAY_NAMES[normalized] ?? role
}

/**
 * Seniority level — a higher number means broader authority. Used for
 * "can this user manage that user" checks and for ordering org charts.
 */
export const ROLE_LEVEL: Record<string, number> = {
  admin: 100,
  director: 90,
  special_team_leader: 80,
  manager: 70,
  shop_manager: 60,
  team_leader: 50,
  shop_tl: 50,
  certifying_staff: 30,
  qa_staff: 30,
  qa_personnel: 30,
  ecaa_personnel: 30,
  engineer: 20,
  technician: 20,
  hr: 10,
  customer_personnel: 5,
}

export function getRoleLevel(role: string | undefined | null): number {
  return ROLE_LEVEL[normalizeRole(role)] ?? 0
}

/**
 * AMENDED v3 — the creation hierarchy, DERIVED from the canonical
 * CREATION_MATRIX so it can never drift from RoleHierarchy.cs again.
 *
 *   admin              → every role
 *   director           → manager, shop_manager, shop_tl
 *   special_team_leader→ engineer
 *   manager            → shop_manager, shop_tl
 *   shop_manager       → shop_tl, certifying_staff
 *   shop_tl/team_leader→ technician, certifying_staff, qa_personnel, ecaa_personnel
 *
 * Individual personnel (engineer, technician, certifying_staff, qa, ecaa)
 * create nobody.
 */
export const ROLE_CAN_CREATE: Record<string, string[]> = (() => {
  const matrix: Record<string, string[]> = {}

  for (const [canonicalCreator, canonicalTargets] of Object.entries(CREATION_MATRIX)) {
    const creatorKey = NORMALIZED_BY_BACKEND_ROLE[canonicalCreator]
    if (!creatorKey) continue

    const targets = canonicalTargets
      .filter(target => canCreateCanonical(canonicalCreator, target))
      .map(target => NORMALIZED_BY_BACKEND_ROLE[target])
      .filter((key): key is string => Boolean(key))

    matrix[creatorKey] = Array.from(new Set(targets))
  }

  // "team_leader" is the persisted spelling of a Shop Team Leader: same rights.
  matrix.team_leader = [...(matrix.shop_tl ?? [])]
  return matrix
})()

/**
 * True when `creatorRole` is allowed to create/promote `targetRole`.
 * Delegates to the canonical guard, so the Admin-only rule for Director and
 * Special Team Leader is enforced here too.
 */
export function canRoleCreate(
  creatorRole: string | undefined | null,
  targetRole: string | undefined | null
): boolean {
  return canCreateCanonical(toBackendRole(creatorRole), toBackendRole(targetRole))
}

/**
 * AMENDED v3 — the same check PLUS the "FYI" restriction:
 * "Once the Manager role is created, the 'User Management' feature should
 *  restrict creating users who belong to the department from creating Shop Team
 *  Leaders or Shop Managers."
 *
 * Pass `departmentHasActiveManager = true` when the target department already
 * has an active Manager; Shop Manager / Shop Team Leader then disappear for
 * department-level creators (the Director), while the Manager itself and the
 * Admin stay unrestricted.
 */
export function canRoleCreateInDepartment(
  creatorRole: string | undefined | null,
  targetRole: string | undefined | null,
  departmentHasActiveManager: boolean
): boolean {
  const creator = toBackendRole(creatorRole)
  const target = toBackendRole(targetRole)
  if (!canCreateCanonical(creator, target)) return false
  return !isBlockedByManagerDelegation(creator, target, departmentHasActiveManager)
}

/** Roles that bypass the configurable permission matrix. */
export function isPrivilegedRole(role: string | undefined | null): boolean {
  const normalized = normalizeRole(role)
  return normalized === 'admin' || normalized === 'director'
}

/**
 * AMENDED v3 — "Directors ... can assign privileges to roles such as edit,
 * delete, etc." True for every role allowed to grant or revoke privileges.
 */
export function isPrivilegeGrantorRole(role: string | undefined | null): boolean {
  return canGrantPrivileges(toBackendRole(role))
}

/**
 * AMENDED v3 — "Individual Personnel: Includes Engineers, Technicians,
 * Certifying Staff, and QA Personnel." They create nobody.
 */
export function isIndividualPersonnelRole(role: string | undefined | null): boolean {
  return isIndividualPersonnel(toBackendRole(role))
}

/**
 * True when the role's data scope is the whole shop, i.e. several holders share
 * information and responsibilities and a Shop Manager views them as one group.
 */
export function isShopGroupRole(role: string | undefined | null): boolean {
  return sharesShopScope(toBackendRole(role))
}

/** True when the role supervises a shop (sees all of its Shop Team Leaders). */
export function isShopOversightRole(role: string | undefined | null): boolean {
  const normalized = normalizeRole(role)
  return (
    normalized === 'shop_manager' ||
    normalized === 'manager' ||
    normalized === 'director' ||
    normalized === 'admin'
  )
}

/** Canonical PascalCase role, or null when the value is unknown. */
export function toCanonicalRole(role: string | undefined | null): string | null {
  return normalizeCanonicalRole(role ?? undefined)
}