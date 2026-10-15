/**
 * =====================================================================================
 * PHASE 1 — AMENDED (NEW FILE)
 * Copy to: CMT.Frontend/src/lib/signature/signature-access.ts
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Requirement #13 says the specimen library is an ADMIN-ONLY capability:
 *   "On the Admin Role Dashboard, provide a dedicated upload option for signature
 *    files (image or PDF). ... Ensure signatures are securely linked per user after
 *    being uploaded by the admin."
 *
 * That single rule is consumed in four different places (the sidebar entry, the
 * `/admin` tab, the `/admin/signatures` page guard and the panel itself). Putting
 * the predicate here keeps ONE definition, so the UI can never disagree with the
 * server guard `SIGNATURE_ADMIN_ONLY`.
 *
 * It also declares WHICH ROLES ACTUALLY SIGN a form, which is what turns a missing
 * specimen from a cosmetic gap into a real compliance gap. The list is the union of
 * every approver role appearing in the workflow catalogue of the Table of Contents
 * forms (MNT-1325, Letter of Confirmation, MNT-918 / 918A, MNT-1420A/B, MNT-1229B,
 * MNT-1378, MNT 3.14-020 / MNT-922C, Facility, Consumables).
 *
 * NOTE: this file deliberately does NOT edit `role-hierarchy.ts`. It only consumes
 * `normalizeRole`, so the canonical hierarchy stays the single source of truth.
 * =====================================================================================
 */

import { normalizeRole } from '@/lib/role-hierarchy'

/** Only these roles may upload, view or revoke a specimen. */
export const SIGNATURE_MANAGER_ROLES = ['Admin'] as const

/**
 * Roles that put a name / date / signature block on at least one Table of Contents
 * form. A user in one of these roles WITHOUT a specimen is a real gap, and the
 * coverage table lists it first.
 *
 * Canonical spellings follow `normalizeRole`, so both `TeamLeader` and
 * `shop_team_leader` resolve to the same entry.
 */
export const SIGNATURE_APPROVER_ROLES = [
  'Director',
  'Manager',
  'SpecialTeamLeader',
  'ShopManager',
  'TeamLeader',
  'Engineer',
  'CertifyingStaff',
  'Inspector',
  'Technician',
  'DocumentationTeamLeader',
  'DocumentationClerk',
  'HRSpecialist',
  'HRManager',
  'QAPersonnel',
  'ECAATeam',
] as const

function canonical(role: string | null | undefined): string {
  return (normalizeRole(role) ?? String(role ?? '')).trim()
}

/** True when the signed-in role owns the specimen library. */
export function canManageSignatures(role: string | null | undefined): boolean {
  const value = canonical(role).toLowerCase()
  return SIGNATURE_MANAGER_ROLES.some(allowed => allowed.toLowerCase() === value)
}

/**
 * True when the role signs at least one form, so a missing specimen must be
 * reported as a gap. Unknown roles are treated as approvers on purpose — an
 * unexpected role is more dangerous when it is silently hidden.
 */
export function isSignatureApproverRole(role: string | null | undefined): boolean {
  const value = canonical(role).toLowerCase()
  if (!value) return false
  if (canManageSignatures(value)) return false
  return (
    SIGNATURE_APPROVER_ROLES.some(allowed => allowed.toLowerCase() === value) ||
    !SIGNATURE_MANAGER_ROLES.some(allowed => allowed.toLowerCase() === value)
  )
}

/** Copy shown to a non-admin who reaches the page by URL. */
export const SIGNATURE_ACCESS_DENIED_MESSAGE =
  'Signature specimens are the tamper-evidence basis of every approval stamp, so only the Admin role may upload, ' +
  'view or revoke them. Ask an Administrator to register your specimen; once it is on file your approvals are ' +
  'stamped automatically with your name, role and the UTC date.'