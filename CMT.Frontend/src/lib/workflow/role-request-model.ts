/**
 * =====================================================================================
 * ROLE-BASED APPROVAL REQUEST MODEL — v21
 * CMT.Frontend/src/lib/workflow/role-request-model.ts      (NEW FILE)
 *
 * WHAT THIS FILE IS
 * -----------------
 * The single source of truth for the role-based request tracker:
 *
 *   "For each role — Director, Manager, Shop Team Leader, CAA Officer, QA Manager,
 *    and Documentation — the sidebar displays the count of Assigned, Pending,
 *    Completed, Reviewed, and Rejected requests."
 *
 * ONE request (a workflow instance row) is classified into exactly ONE of FIVE
 * standardized buckets, from the perspective of the signed-in role:
 *
 *   Assigned   -> the request is waiting on THIS role right now (its action step)
 *   Pending    -> the request is in flight but sitting at ANOTHER role's step
 *   Reviewed   -> THIS role's review action already happened; the request moved
 *                 downstream and is still in flight
 *   Completed  -> the request reached a terminal success state
 *   Rejected   -> the request was rejected / returned / revoked / expired
 *
 * The classification is a pure function of the raw ApprovalStatus, so the sidebar,
 * the dashboard view and any future consumer can never disagree.
 *
 * NO JSX, NO fetch — safe to import from any component and unit-testable.
 * =====================================================================================
 */

import { ApprovalStatus } from '@/lib/workflow/workflow-types'

// =====================================================================================
// 1. THE FIVE STANDARDIZED BUCKETS
// =====================================================================================

export type RequestBucket = 'assigned' | 'pending' | 'reviewed' | 'completed' | 'rejected'

/** Chase order: what needs my action first, then travelling, then history. */
export const REQUEST_BUCKET_ORDER: RequestBucket[] = [
  'assigned',
  'pending',
  'reviewed',
  'rejected',
  'completed',
]

export const REQUEST_BUCKET_LABELS: Record<RequestBucket, string> = {
  assigned: 'Assigned',
  pending: 'Pending',
  reviewed: 'Reviewed',
  completed: 'Completed',
  rejected: 'Rejected',
}

/**
 * Bucket palette — dark text on a light background, never text-x-600 on bg-x-600
 * (same contrast rule as LIFECYCLE_STATE_CLASSES of workflow-types.ts).
 */
export const REQUEST_BUCKET_CLASSES: Record<RequestBucket, string> = {
  assigned: 'bg-sky-100 text-sky-900 border-sky-300',
  pending: 'bg-amber-100 text-amber-900 border-amber-300',
  reviewed: 'bg-violet-100 text-violet-900 border-violet-300',
  completed: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  rejected: 'bg-red-100 text-red-900 border-red-300',
}

/** Dot colour of the compact sidebar counters (bg-only variant of the same palette). */
export const REQUEST_BUCKET_DOT_CLASSES: Record<RequestBucket, string> = {
  assigned: 'bg-sky-500',
  pending: 'bg-amber-500',
  reviewed: 'bg-violet-500',
  completed: 'bg-emerald-500',
  rejected: 'bg-red-500',
}

/** Sort weight of each bucket inside the request table. */
export const REQUEST_BUCKET_SORT_WEIGHT: Record<RequestBucket, number> = {
  assigned: 0,
  pending: 1,
  reviewed: 2,
  rejected: 3,
  completed: 4,
}

// =====================================================================================
// 2. THE SIX TRACKED ROLES
// =====================================================================================

/**
 * The roles the request tracker is built for. "CAA Officer" is the ECAA Personnel
 * role (Ethiopian Civil Aviation Authority endorsement), "QA Manager" is the QA
 * Personnel role, and "Documentation" covers BOTH the Documentation Team Leader and
 * the Documentation Clerk (they share one queue view).
 */
export type RoleRequestRoleKey =
  | 'Director'
  | 'Manager'
  | 'TeamLeader'
  | 'QAPersonnel'
  | 'ECAAPersonnel'
  | 'Documentation'

export const ROLE_REQUEST_ROLE_LABELS: Record<RoleRequestRoleKey, string> = {
  Director: 'Director',
  Manager: 'Manager',
  TeamLeader: 'Shop Team Leader',
  QAPersonnel: 'QA Manager',
  ECAAPersonnel: 'CAA Officer',
  Documentation: 'Documentation',
}

export const ROLE_REQUEST_ROLE_KEYS: RoleRequestRoleKey[] = [
  'Director',
  'Manager',
  'TeamLeader',
  'QAPersonnel',
  'ECAAPersonnel',
  'Documentation',
]

/**
 * Maps a canonical PascalCase role (the `ORG_ROLES` value of role-hierarchy.ts, which
 * `nav-access.toCanonicalRole()` produces) to its tracker profile. Documentation Team
 * Leader and Documentation Clerk share the Documentation profile. Returns null for
 * every role outside the tracker scope.
 */
export function requestRoleForCanonical(role?: string | null): RoleRequestRoleKey | null {
  switch ((role ?? '').trim()) {
    case 'Director':
      return 'Director'
    case 'Manager':
      return 'Manager'
    case 'TeamLeader':
      return 'TeamLeader'
    case 'QAPersonnel':
      return 'QAPersonnel'
    case 'ECAAPersonnel':
      return 'ECAAPersonnel'
    case 'DocumentationTeamLeader':
    case 'DocumentationClerk':
      return 'Documentation'
    default:
      return null
  }
}

/** True when the signed-in role sees the request tracker (sidebar + dashboard view). */
export function canViewApprovalRequests(canonicalRole?: string | null): boolean {
  return requestRoleForCanonical(canonicalRole) !== null
}

// =====================================================================================
// 3. PER-ROLE STATUS PROFILES
// =====================================================================================

export interface RoleRequestProfile {
  key: RoleRequestRoleKey
  /** Statuses waiting on THIS role right now -> bucket "assigned". */
  actionStatuses: ApprovalStatus[]
  /** Statuses downstream of this role's action, still in flight -> bucket "reviewed". */
  reviewedStatuses: ApprovalStatus[]
}

const PROFILES: Record<RoleRequestRoleKey, RoleRequestProfile> = {
  Director: {
    key: 'Director',
    actionStatuses: [
      ApprovalStatus.PendingDirectorApproval,
      ApprovalStatus.PendingFinalSignOff,
      ApprovalStatus.PendingAmendmentApproval,
    ],
    // Joint-approval path: DIR -> QA (MNT-918) -> ECAA (MNT-918A).
    reviewedStatuses: [
      ApprovalStatus.PendingQAApproval,
      ApprovalStatus.PendingECAAEndorsement,
    ],
  },
  Manager: {
    key: 'Manager',
    actionStatuses: [ApprovalStatus.PendingManagerApproval],
    reviewedStatuses: [
      ApprovalStatus.PendingQAApproval,
      ApprovalStatus.PendingDirectorApproval,
      ApprovalStatus.PendingECAAEndorsement,
    ],
  },
  TeamLeader: {
    key: 'TeamLeader',
    actionStatuses: [
      ApprovalStatus.PendingTeamLeaderReview,
      ApprovalStatus.PendingShopTeamLeaderIssue,
      ApprovalStatus.PendingCertifyingStaffAction,
      ApprovalStatus.PendingRequesterVerification,
    ],
    reviewedStatuses: [
      ApprovalStatus.PendingManagerApproval,
      ApprovalStatus.PendingQAApproval,
      ApprovalStatus.PendingDirectorApproval,
      ApprovalStatus.PendingDocumentationTeam,
    ],
  },
  QAPersonnel: {
    key: 'QAPersonnel',
    actionStatuses: [
      ApprovalStatus.PendingQAApproval,
      ApprovalStatus.PendingSelfAuditCheck,
    ],
    reviewedStatuses: [ApprovalStatus.PendingECAAEndorsement],
  },
  ECAAPersonnel: {
    key: 'ECAAPersonnel',
    actionStatuses: [ApprovalStatus.PendingECAAEndorsement],
    // The regulatory endorsement is the last chain link — nothing downstream.
    reviewedStatuses: [],
  },
  Documentation: {
    key: 'Documentation',
    actionStatuses: [
      ApprovalStatus.PendingDocumentationTeam,
      ApprovalStatus.PendingDocumentationClerk,
      ApprovalStatus.PendingDocumentationLeaderSignOff,
    ],
    reviewedStatuses: [ApprovalStatus.PendingFinalSignOff],
  },
}

/** Terminal SUCCESS statuses — bucket "completed" for every role. */
const COMPLETED_STATUSES: ReadonlySet<ApprovalStatus> = new Set([
  ApprovalStatus.Approved,
  ApprovalStatus.Completed,
  ApprovalStatus.Locked,
  ApprovalStatus.Skipped,
])

/** Terminal FAILURE / attention statuses — bucket "rejected" for every role. */
const REJECTED_STATUSES: ReadonlySet<ApprovalStatus> = new Set([
  ApprovalStatus.Rejected,
  ApprovalStatus.Returned,
  ApprovalStatus.Revoked,
  ApprovalStatus.Expired,
])

/**
 * Classifies ONE raw ApprovalStatus into the standardized bucket, from the perspective
 * of the given role. Pure — the sidebar and the dashboard never disagree.
 */
export function classifyRequestStatus(
  status: ApprovalStatus,
  roleKey: RoleRequestRoleKey,
): RequestBucket {
  if (COMPLETED_STATUSES.has(status)) return 'completed'
  if (REJECTED_STATUSES.has(status)) return 'rejected'

  const profile = PROFILES[roleKey]
  if (profile.actionStatuses.includes(status)) return 'assigned'
  if (profile.reviewedStatuses.includes(status)) return 'reviewed'
  return 'pending'
}