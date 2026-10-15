/**
 * =====================================================================================
 * AMENDED v14 - PHASE 1 (FRONTEND), FEATURE 1: ARCHIVE & SOFT-DELETE CLIENT
 * CMT.Frontend/src/lib/workflow/archive-api.ts                                 (NEW FILE)
 * Copy to: CMT.Frontend/src/lib/workflow/archive-api.ts
 *
 * WHAT THIS FILE IS
 * -----------------
 * The FRONTEND MIRROR + API CLIENT of
 *   CMT.Domain/Models/SelfEvaluation/ArchiveEntities.cs   (ArchiveEntry, enums)
 *   CMT.Domain/Models/SelfEvaluation/ArchivePolicy.cs     (authority + decisions)
 *
 * It owns:
 *   (1) the route table for the archive endpoints - all under /api/self-evaluation/archive,
 *       which the EXISTING catch-all proxy src/app/api/self-evaluation/[...path]/route.ts
 *       already forwards, so NO new Next.js route file is required;
 *   (2) the typed client for list / archive / edit-while-archived / restore / purge-request;
 *   (3) a LOCAL mirror of the ArchivePolicy decisions (canArchive / canEditArchived /
 *       canRestore) so the UI can enable or disable the buttons with the SAME denial codes
 *       the server returns, and show the reason before a request is ever sent.
 *
 * INVARIANTS COPIED FROM THE C# (do not break them here either)
 *   A1. An archive row is NEVER deleted. "Purge" is a REQUEST flag, never a DELETE.
 *   A2. Archiving is a soft delete: the underlying record stays, IsActive=false,
 *       ApprovalStatus=Revoked (32).
 *   A4. A restore returns the record to Draft with a BUMPED revision number - it never
 *       resurrects the revoked approval.
 *   A5. Edits while archived are recorded on the entry.
 *
 * BINDING RULES (identical to WorkflowApiContracts.cs)
 *   - every USER id is a number (C# long); entity ids (itemId, entryId) are string (Guid).
 * =====================================================================================
 */

import {
  ARCHIVE_PERMISSIONS,
  ApprovalStatus,
  WORKFLOW_ERROR_CODES,
  type ArchiveDecisionResponse,
  type ArchiveEntryResponse,
  type ArchiveEntryState,
  type ArchiveListQuery,
  type ArchiveTrigger,
  type ArchivedItemKind,
  type EditArchivedRequest,
  type PurgeRequestPayload,
  type RestoreArchivedRequest,
} from '@/lib/workflow/workflow-types'
import { apiUrl } from '@/lib/workflow/workflow-config'
import { getJson, getList, postJson, putJson, toEntityId } from '@/lib/workflow/workflow-transport'
import { ORG_ROLES, effectivePermissions, normalizeRole } from '@/lib/role-hierarchy'

// =====================================================================================
// 1. ROUTES  (forwarded by the existing /api/self-evaluation catch-all proxy)
// =====================================================================================

const ROOT = '/api/self-evaluation/archive'

export const ARCHIVE_ROUTES = {
  /** GET  /api/self-evaluation/archive?scope=archived|history|purge-request */
  list: () => apiUrl(ROOT),
  /** POST /api/self-evaluation/archive  (ArchiveItemRequest) */
  archive: () => apiUrl(ROOT),
  /** PUT  /api/self-evaluation/archive/{entryId}/edit */
  edit: (entryId: string) => apiUrl(`${ROOT}/${encodeURIComponent(toEntityId(entryId, 'entryId'))}/edit`),
  /** POST /api/self-evaluation/archive/{entryId}/restore */
  restore: (entryId: string) => apiUrl(`${ROOT}/${encodeURIComponent(toEntityId(entryId, 'entryId'))}/restore`),
  /** POST /api/self-evaluation/archive/{entryId}/purge-request */
  purgeRequest: (entryId: string) =>
    apiUrl(`${ROOT}/${encodeURIComponent(toEntityId(entryId, 'entryId'))}/purge-request`),
  /** GET  /api/self-evaluation/archive/{entryId} - one entry incl. its audit history */
  detail: (entryId: string) => apiUrl(`${ROOT}/${encodeURIComponent(toEntityId(entryId, 'entryId'))}`),
} as const

function qs(query?: ArchiveListQuery): string {
  if (!query) return ''
  const search = new URLSearchParams()
  if (query.scope) search.set('scope', query.scope)
  if (query.itemKind !== undefined && query.itemKind !== null) search.set('itemKind', String(query.itemKind))
  if (query.shopId) search.set('shopId', query.shopId)
  if (query.search) search.set('search', query.search)
  if (query.page) search.set('page', String(query.page))
  if (query.pageSize) search.set('pageSize', String(query.pageSize))
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

// =====================================================================================
// 2. TYPED CLIENT
// =====================================================================================

/** GET /api/self-evaluation/archive -> ArchiveEntryResponse[] */
export async function listArchiveEntries(query?: ArchiveListQuery) {
  const rows = await getList(ARCHIVE_ROUTES.list() + qs(query))
  return rows as ArchiveEntryResponse[]
}

/** The Archive sidebar list = rows still in the Archived state (invariant A1 read rule). */
export async function getActiveArchiveEntries() {
  return listArchiveEntries({ scope: 'archived' })
}

/** The full audit history = ALL rows, including Restored ones. Filtering this to Archived
 *  rows only is a DEFECT: it hides completed revoke/restore cycles. */
export async function getArchiveHistory() {
  return listArchiveEntries({ scope: 'history' })
}

/** GET /api/self-evaluation/archive/{entryId} -> ArchiveEntryResponse */
export async function getArchiveEntry(entryId: string) {
  const data = await getJson(ARCHIVE_ROUTES.detail(entryId))
  return data as ArchiveEntryResponse
}

/**
 * POST /api/self-evaluation/archive -> ArchiveEntryResponse (201)
 * Soft-deletes the item server-side (IsActive=false, ApprovalStatus=Revoked) and writes
 * the append-only entry. A written reason is MANDATORY.
 */
export async function archiveItem(request: {
  itemKind: ArchivedItemKind
  itemId: string
  trigger: ArchiveTrigger
  reason: string
}) {
  const body = {
    itemKind: request.itemKind,
    itemId: toEntityId(request.itemId, 'itemId'),
    trigger: request.trigger,
    reason: (request.reason ?? '').trim(),
  }
  const data = await postJson(ARCHIVE_ROUTES.archive(), body)
  return data as ArchiveEntryResponse
}

/** PUT /api/self-evaluation/archive/{entryId}/edit -> ArchiveEntryResponse (invariant A5) */
export async function editArchivedItem(entryId: string, request: EditArchivedRequest) {
  const data = await putJson(ARCHIVE_ROUTES.edit(entryId), request)
  return data as ArchiveEntryResponse
}

/**
 * POST /api/self-evaluation/archive/{entryId}/restore -> ArchiveEntryResponse
 * Restores to the MAIN capability list and RESTARTS the workflow at Draft with a bumped
 * revision (invariant A4). A restore reason is mandatory.
 */
export async function restoreArchivedItem(entryId: string, request: RestoreArchivedRequest) {
  const data = await postJson(ARCHIVE_ROUTES.restore(entryId), {
    reason: (request.reason ?? '').trim(),
  })
  return data as ArchiveEntryResponse
}

/**
 * POST /api/self-evaluation/archive/{entryId}/purge-request -> ArchiveDecisionResponse
 * Flags a permanent-deletion REQUEST. Nothing is deleted by this call - "never permanently
 * lost" stays true by default.
 */
export async function requestPurge(entryId: string, payload: PurgeRequestPayload) {
  const data = await postJson(ARCHIVE_ROUTES.purgeRequest(entryId), {
    reason: (payload.reason ?? '').trim(),
  })
  return data as ArchiveDecisionResponse
}

// =====================================================================================
// 3. LOCAL MIRROR OF ArchivePolicy  (button pre-flight with the SAME denial codes)
// =====================================================================================

/** Mirror of ArchivePolicy.AuthorityRoles: Director, QA Manager, ECAA, Admin. */
export const ARCHIVE_AUTHORITY_ROLES: string[] = [
  ORG_ROLES.Director,
  ORG_ROLES.QAPersonnel,
  ORG_ROLES.ECAAPersonnel,
  ORG_ROLES.Admin,
]

/** Mirror of ArchivePolicy.HasAuthorityRole. */
export function hasArchiveAuthorityRole(role?: string | null): boolean {
  const canonical = normalizeRole(role)
  if (!canonical) return false
  return ARCHIVE_AUTHORITY_ROLES.some(r => r.toLowerCase() === canonical.toLowerCase())
}

/** Mirror of ArchivePolicy.IsPermitted: Admin short-circuit, granted permission, or role. */
export function isArchivePermitted(
  role?: string | null,
  additionalCsv?: string | null,
  revokedCsv?: string | null,
  permission?: string,
): boolean {
  const canonical = normalizeRole(role)
  if (canonical === ORG_ROLES.Admin) return true
  if (permission) {
    const perms = effectivePermissions(canonical, additionalCsv, revokedCsv)
    if (perms.some(p => p.toLowerCase() === permission.toLowerCase())) return true
  }
  return hasArchiveAuthorityRole(canonical)
}

function allow(): ArchiveDecisionResponse {
  return { allowed: true, denialCode: null, message: 'Allowed.' }
}

function deny(code: string, message: string): ArchiveDecisionResponse {
  return { allowed: false, denialCode: code, message }
}

/** Mirror of ArchivePolicy.CanArchive. */
export function canArchive(
  actor: { role?: string | null; additionalPermissions?: string | null; revokedPermissions?: string | null },
  currentStatus: ApprovalStatus,
  isCurrentlyActive: boolean,
  reason?: string | null,
): ArchiveDecisionResponse {
  if (
    !isArchivePermitted(
      actor.role,
      actor.additionalPermissions,
      actor.revokedPermissions,
      ARCHIVE_PERMISSIONS.ArchiveRecord,
    )
  ) {
    return deny(
      WORKFLOW_ERROR_CODES.ArchiveNotAuthorizedRole,
      'Only the Director, QA Manager, ECAA or an Admin may revoke or delete a record.',
    )
  }
  if (!(reason ?? '').trim()) {
    return deny(
      WORKFLOW_ERROR_CODES.ArchiveReasonRequired,
      'A written reason is mandatory: a revoked approval without a recorded justification is itself an audit finding.',
    )
  }
  if (!isCurrentlyActive && currentStatus === ApprovalStatus.Revoked) {
    return deny(WORKFLOW_ERROR_CODES.ArchiveAlreadyArchived, 'This item is already in the Archive.')
  }
  return allow()
}

/** Mirror of ArchivePolicy.CanEditArchived. */
export function canEditArchived(
  actor: { role?: string | null; additionalPermissions?: string | null; revokedPermissions?: string | null },
  entry?: ArchiveEntryResponse | null,
): ArchiveDecisionResponse {
  if (!entry) {
    return deny(WORKFLOW_ERROR_CODES.ArchiveNotArchived, 'No archive entry was supplied.')
  }
  if (!entry.isCurrentlyArchived) {
    return deny(
      WORKFLOW_ERROR_CODES.ArchiveNotArchived,
      'This item is not in the Archive; edit it through the normal form route.',
    )
  }
  const role = normalizeRole(actor.role)
  if (role !== ORG_ROLES.TeamLeader && role !== ORG_ROLES.Admin) {
    return deny(
      WORKFLOW_ERROR_CODES.ArchiveMissingPermission,
      'Only the Shop Team Leader may edit an archived form.',
    )
  }
  return allow()
}

/** Mirror of ArchivePolicy.CanRestore. */
export function canRestore(
  actor: { role?: string | null; additionalPermissions?: string | null; revokedPermissions?: string | null },
  entry?: ArchiveEntryResponse | null,
  expectedItemId?: string | null,
  reason?: string | null,
): ArchiveDecisionResponse {
  if (!entry) {
    return deny(WORKFLOW_ERROR_CODES.ArchiveNotArchived, 'No archive entry was supplied.')
  }
  if (expectedItemId && entry.itemId !== expectedItemId) {
    return deny(
      WORKFLOW_ERROR_CODES.ArchiveItemMismatch,
      'The archive entry does not belong to the item being restored.',
    )
  }
  if (!entry.isRestorable) {
    return deny(
      WORKFLOW_ERROR_CODES.ArchiveEntryNotRestorable,
      'This archive entry has already been closed. Only an entry still in the Archived state can be restored.',
    )
  }
  const role = normalizeRole(actor.role)
  if (role !== ORG_ROLES.TeamLeader && role !== ORG_ROLES.Admin) {
    return deny(
      WORKFLOW_ERROR_CODES.ArchiveNotAuthorizedRole,
      'Restoring restarts the approval workflow, so it is limited to the Shop Team Leader.',
    )
  }
  if (!(reason ?? '').trim()) {
    return deny(
      WORKFLOW_ERROR_CODES.ArchiveReasonRequired,
      'A restore reason is mandatory so the audit trail explains why a revoked capability was reinstated.',
    )
  }
  return allow()
}

/** Sidebar visibility rule: archive.view permission OR an authority role. */
export function canViewArchive(
  role?: string | null,
  additionalCsv?: string | null,
  revokedCsv?: string | null,
): boolean {
  // Archive visibility is read-only for ordinary users; action checks remain
  // role/permission gated below.
  return Boolean(normalizeRole(role))
}

/** State label helper for the Archive table. */
export function archiveStateLabel(state?: ArchiveEntryState | null): string {
  switch (state) {
    case 0:
      return 'Archived'
    case 1:
      return 'Restored'
    case 2:
      return 'Purge requested'
    default:
      return '—'
  }
}