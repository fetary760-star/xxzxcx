/**
 * =====================================================================================
 * WORKFLOW INBOX CONTRACT TYPES — AMENDED (NEW FILE)
 * CMT.Frontend/src/lib/workflow/workflow-inbox-types.ts
 * Copy to: CMT.Frontend/src/lib/workflow/workflow-inbox-types.ts
 *
 * WHAT THIS FILE IS
 * -----------------
 * The TypeScript mirror of `CMT.Application/Contracts/Workflow/WorkflowInboxContracts.cs`
 * (the file you already updated on the backend). It types the answers of:
 *
 *     GET /api/workflow/inbox          -> WorkflowInboxItemResponse[]   (superset of
 *                                         InboxItemResponse — every existing field keeps
 *                                         its name; the sidebar additions are OPTIONAL, so
 *                                         an older backend build still type-checks)
 *     GET /api/workflow/inbox/counts   -> WorkflowInboxCountsResponse   (everything the role
 *                                         sidebar needs in ONE call)
 *
 * CASING NOTE
 * -----------
 * `camelizeDeep()` of workflow-transport.ts converts the PascalCase C# payload, e.g.
 *   StatusBucket      -> statusBucket
 *   ATAChapterCode    -> ataChapterCode
 *   ETAReference      -> etaReference
 *   OwnerRoleLabel    -> ownerRoleLabel
 * so the fields below are the exact post-normalisation names.
 * =====================================================================================
 */

/** The five workflow buckets rendered by the role sidebar (mirror of WorkflowStatusBuckets). */
export const WORKFLOW_STATUS_BUCKETS = {
  Assigned: 'Assigned',
  Pending: 'Pending',
  Completed: 'Completed',
  Reviewed: 'Reviewed',
  Rejected: 'Rejected',
} as const

export type WorkflowStatusBucket =
  (typeof WORKFLOW_STATUS_BUCKETS)[keyof typeof WORKFLOW_STATUS_BUCKETS]

export const WORKFLOW_STATUS_BUCKET_LIST: WorkflowStatusBucket[] = [
  WORKFLOW_STATUS_BUCKETS.Assigned,
  WORKFLOW_STATUS_BUCKETS.Pending,
  WORKFLOW_STATUS_BUCKETS.Completed,
  WORKFLOW_STATUS_BUCKETS.Reviewed,
  WORKFLOW_STATUS_BUCKETS.Rejected,
]

/** Accepted values of the `scope` query parameter (mirror of WorkflowInboxScopes). */
export type WorkflowInboxScope = 'mine' | 'all' | 'shop'

/**
 * One row of GET /api/workflow/inbox. Every field of InboxItemResponse first (identical
 * name + type), then the sidebar additions — all OPTIONAL so the type stays compatible
 * with a backend that has not been rebuilt yet.
 */
export interface WorkflowInboxItemResponse {
  // ----- Identity (same names as InboxItemResponse) -----
  instanceId: string
  formSubmissionId?: string | null
  evaluationFolderId?: string | null

  formType: string
  formNo: string
  title: string
  sectionTitle: string

  status: number
  statusLabel: string

  stepNo: number
  stepTitle: string

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

  // ----- Sidebar additions (optional -> tolerant of an older backend) -----
  /** One of WORKFLOW_STATUS_BUCKETS, computed by the server for the CALLING user. */
  statusBucket?: WorkflowStatusBucket | string | null

  lifecycleState?: number | string | null
  lifecycleStateLabel?: string | null

  /** Canonical role currently responsible for the row (may be empty). */
  ownerRole?: string | null
  ownerRoleLabel?: string | null

  eligibleRoles?: string[] | null
  eligibleRoleLabels?: string[] | null

  currentAssigneeUserId?: number | null
  currentAssigneeName?: string | null

  originatorUserId?: number | null

  // ----- Identification: ATA (ETA) + Part Number -----
  ataRecordId?: string | null
  shopId?: string | null

  /** ATA chapter code of the owning folder, e.g. "32-41". */
  ataChapterCode?: string | null
  /** Server-side alias of ataChapterCode (the dashboard labels this column "ETA"). */
  etaReference?: string | null

  partNumber?: string | null
  folderCode?: string | null
  folderTitle?: string | null

  /** Deep link the sidebar uses when the row is clicked. */
  actionUrl?: string | null

  updatedAt?: string | null
}

/** The five counters of one sidebar row (mirror of WorkflowStatusCounts). */
export interface WorkflowStatusCounts {
  assigned: number
  pending: number
  completed: number
  reviewed: number
  rejected: number
  total: number
}

/** One role block of the sidebar, e.g. "Shop Team Leader" with its five counts. */
export interface WorkflowRoleCounts {
  role: string
  roleLabel: string
  /** True for the role of the calling user, so the UI can highlight it. */
  isMyRole: boolean
  counts: WorkflowStatusCounts
  /** The instance ids behind the counters, for filtering without a second round trip. */
  instanceIds: string[]
}

/**
 * GET /api/workflow/inbox/counts — everything the role sidebar needs in ONE call:
 * Totals over every visible role, Mine ("My Requests"), and one block per sidebar role
 * (Director, Manager, Shop Team Leader, CAA Officer, QA Manager, Documentation).
 */
export interface WorkflowInboxCountsResponse {
  userId: number
  role: string
  roleLabel: string
  shopId?: string | null
  scope: WorkflowInboxScope | string
  totals: WorkflowStatusCounts
  mine: WorkflowStatusCounts
  roles: WorkflowRoleCounts[]
  itemCount: number
  generatedAt: string
}

/** Maps a server bucket string to the lowercase RequestBucket of role-request-model.ts. */
export function toRequestBucket(
  bucket: string | null | undefined,
): 'assigned' | 'pending' | 'reviewed' | 'completed' | 'rejected' | null {
  switch ((bucket ?? '').trim().toLowerCase()) {
    case 'assigned': return 'assigned'
    case 'pending': return 'pending'
    case 'reviewed': return 'reviewed'
    case 'completed': return 'completed'
    case 'rejected': return 'rejected'
    default: return null
  }
}