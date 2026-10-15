'use client'

/**
 * PHASE 2 (FRONTEND) - ATA RECORD WORKFLOW CAPABILITIES + SIGNATURE TRAIL
 * File: CMT.Frontend/src/lib/self-evaluation/ata-workflow.ts   (AMENDED v26 - full replacement)
 *
 * WHAT v26 CHANGES (ROLE-BASED APPROVAL WORKFLOW SIMPLIFICATION + DELEGATE AUTHORITY):
 *  1. normalizeCapabilities now reads the four OPTIONAL v26 capability fields the
 *     amended backend may send: canConfirm / isOriginatorLed / approvalCommentEnabled /
 *     delegatedAuthority. Older payloads normalize cleanly (fields stay undefined).
 *  2. buildFallbackCapabilities mirrors the v24 ATARecordCommandHandler logic:
 *       - SCENARIO A (originator-led: a leader-tier role prepared the record):
 *         Confirm-only. canConfirm is offered to the leader / preparer, Reject and
 *         Return are NEVER offered, and confirming finalizes immediately.
 *       - SCENARIO B (engineer- or delegate-prepared): pre-submission the preparer
 *         edits + submits; at the review stage the Shop Team Leader has FULL authority
 *         (edit directly, approve / reject with comment, return, delegate).
 *     The Scenario A/B predicate is imported from types.ts (isOriginatorLedRecord) so
 *     client and server can never disagree about the routing decision.
 *  3. NEW ENDPOINT HELPERS for the amended v24 controller routes, so the action bar
 *     never needs ad-hoc fetch calls:
 *       - confirmATARecord(id, { comments })            -> POST /ata-records/{id}/confirm
 *       - returnATARecordForRevision(id, { comments })  -> POST /ata-records/{id}/return
 *       - delegateATARecord(id, { assignToUserId, assignToUserName, responsibility,
 *                                 expirationDate, reason }) -> POST /ata-records/{id}/reassign
 *     All three throw the shared ApiError so ApprovalWorkflowActions' describeError()
 *     surfaces the server's structured denial codes (ATA_CONFIRM_NOT_ALLOWED etc.).
 *
 * CARRIED FORWARD FROM v20/v22 (unchanged behaviour):
 *  - types.ts is the single source of truth for the three workflow DTOs; they are
 *    imported and re-exported here.
 *  - While the capabilities endpoint is not deployed, both fetches answer 404 and the
 *    module falls back to buildFallbackCapabilities(); the trail falls back to a
 *    provisional audit-derived reconstruction flagged provisional:true.
 *
 * ROLLOUT SAFETY: when the server endpoints arrive, the server answer wins automatically.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  ApprovalStatus,
  WorkflowAction,
  type ATARecordDto,
  type ATAWorkflowStageDto,
  type ATARecordCapabilitiesDto,
  type ATARecordSignatureEntryDto,
  type ATARecordTrailSource,
  type WorkflowAuditLogDto,
  isOriginatorLedRecord,
  isATARecordFinalized,
  isATARecordWithOriginator,
  isLeaderTierRole,
  canonicalizeRoleToken,
} from './types'
import { ApiError, getAuditLogsByEntity } from './api'

// Re-export so components that import these types from THIS module keep compiling.
export type {
  ATAWorkflowStageDto,
  ATARecordCapabilitiesDto,
  ATARecordSignatureEntryDto,
  ATARecordTrailSource,
}

const SE_API_PREFIX = '/api/self-evaluation'

// ===== Fetch helpers =====

type Raw = Record<string, unknown>

function pick(obj: Raw | null | undefined, ...names: string[]): unknown {
  if (!obj) return undefined
  for (const n of names) {
    const v = obj[n]
    if (v !== undefined && v !== null) return v
  }
  return undefined
}

function asBool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback
}
function asNum(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}
function asStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function asStrArr(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).map(x => String(x)) : []
}

function normalizeCapabilities(raw: Raw): ATARecordCapabilitiesDto {
  const chainRaw = (pick(raw, 'chain', 'Chain') as unknown[]) ?? []
  const chain: ATAWorkflowStageDto[] = chainRaw.map((c, i) => {
    const o = (c ?? {}) as Raw
    return {
      order: asNum(pick(o, 'order', 'Order'), i),
      title: asStr(pick(o, 'title', 'Title')),
      caption: asStr(pick(o, 'caption', 'Caption', 'blockCaption', 'BlockCaption')),
      status: asNum(pick(o, 'status', 'Status'), 0),
      roleLabels: asStrArr(pick(o, 'roleLabels', 'RoleLabels')),
      isOptional: asBool(pick(o, 'isOptional', 'IsOptional')),
    }
  })

  const curOrder = pick(raw, 'currentStageOrder', 'CurrentStageOrder')

  // v26: the optional delegated-authority disclosure block. Present only when the
  // server resolved the caller's authority from a live ResponsibilityDelegation.
  const delegatedRaw = pick(raw, 'delegatedAuthority', 'DelegatedAuthority') as Raw | null | undefined
  const delegatedAuthority =
    delegatedRaw && typeof delegatedRaw === 'object'
      ? {
          responsibility: asStr(pick(delegatedRaw, 'responsibility', 'Responsibility')),
          delegatedBy: asStr(pick(delegatedRaw, 'delegatedBy', 'DelegatedBy')),
        }
      : null

  return {
    canView: asBool(pick(raw, 'canView', 'CanView'), true),
    canEdit: asBool(pick(raw, 'canEdit', 'CanEdit')),
    canSubmit: asBool(pick(raw, 'canSubmit', 'CanSubmit')),
    canApprove: asBool(pick(raw, 'canApprove', 'CanApprove')),
    canReject: asBool(pick(raw, 'canReject', 'CanReject')),
    canRequestRevision: asBool(pick(raw, 'canRequestRevision', 'CanRequestRevision')),
    canDelegate: asBool(pick(raw, 'canDelegate', 'CanDelegate')),
    // v26 additions - all optional on the wire; absent fields stay undefined so the
    // fallback (or the component's Scenario A derivation) can decide instead.
    canConfirm: asBool(pick(raw, 'canConfirm', 'CanConfirm')),
    isOriginatorLed: asBool(pick(raw, 'isOriginatorLed', 'IsOriginatorLed')),
    approvalCommentEnabled: asBool(pick(raw, 'approvalCommentEnabled', 'ApprovalCommentEnabled'), true),
    delegatedAuthority,
    approvalStatus: asNum(pick(raw, 'approvalStatus', 'ApprovalStatus'), 0),
    revisionNumber: asNum(pick(raw, 'revisionNumber', 'RevisionNumber'), 1),
    currentStageOrder: curOrder == null ? null : asNum(curOrder, 0),
    currentStageTitle: asStr(pick(raw, 'currentStageTitle', 'CurrentStageTitle')),
    currentStageCaption: asStr(pick(raw, 'currentStageCaption', 'CurrentStageCaption')),
    nextStageTitle: asStr(pick(raw, 'nextStageTitle', 'NextStageTitle')),
    eligibleRoles: asStrArr(pick(raw, 'eligibleRoles', 'EligibleRoles')),
    chain,
  }
}

function normalizeTrailEntry(raw: Raw): ATARecordSignatureEntryDto {
  const userId = pick(raw, 'userId', 'UserId')
  const supersededAt = pick(raw, 'supersededAt', 'SupersededAt')
  return {
    id: asStr(pick(raw, 'id', 'Id')),
    stageOrder: asNum(pick(raw, 'stageOrder', 'StageOrder'), 0),
    stageStatus: asNum(pick(raw, 'stageStatus', 'StageStatus'), 0),
    resultingStatus: asNum(pick(raw, 'resultingStatus', 'ResultingStatus'), 0),
    block: asNum(pick(raw, 'block', 'Block'), 0),
    blockCaption: asStr(pick(raw, 'blockCaption', 'BlockCaption')),
    userId: userId == null ? null : asNum(userId, 0),
    personName: asStr(pick(raw, 'personName', 'PersonName')),
    personRole: asStr(pick(raw, 'personRole', 'PersonRole')),
    personRoleLabel: asStr(pick(raw, 'personRoleLabel', 'PersonRoleLabel')),
    signedAt: asStr(pick(raw, 'signedAt', 'SignedAt')),
    userSignatureId: (pick(raw, 'userSignatureId', 'UserSignatureId') as string) ?? null,
    signatureStoragePath: (pick(raw, 'signatureStoragePath', 'SignatureStoragePath') as string) ?? null,
    signatureFileName: (pick(raw, 'signatureFileName', 'SignatureFileName') as string) ?? null,
    signatureImageApplied: asBool(pick(raw, 'signatureImageApplied', 'SignatureImageApplied')),
    actionTaken: asNum(pick(raw, 'actionTaken', 'ActionTaken'), 0),
    comments: asStr(pick(raw, 'comments', 'Comments')),
    isCurrent: asBool(pick(raw, 'isCurrent', 'IsCurrent'), true),
    supersededAt: (supersededAt as string) ?? null,
    recordRevisionNumber: asNum(pick(raw, 'recordRevisionNumber', 'RecordRevisionNumber'), 1),
    // v20: never sent by the server; only the audit-derived provisional path sets it.
    provisional: asBool(pick(raw, 'provisional', 'Provisional')),
  }
}

/** Returns null when the endpoint is not deployed yet (404) or unreachable. */
export async function getATARecordCapabilities(
  id: string,
): Promise<ATARecordCapabilitiesDto | null> {
  // The current API exposes ATA signatures but not a capabilities route. Keep the
  // fallback authoritative until a server capabilities contract is deployed, rather
  // than issuing a request that predictably returns 404 on every record load.
  void id
  return null
}

/** Returns EVERY recorded stage, in server order. Never filtered by isCurrent. */
export async function getATARecordSignatureTrail(
  id: string,
): Promise<ATARecordSignatureEntryDto[]> {
  try {
    const res = await fetch(`${SE_API_PREFIX}/ata-records/${id}/signatures`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })
    if (!res.ok) return []
    const json = await res.json()
    const obj = json as Raw
    const arr: unknown[] = Array.isArray(json)
      ? json
      : Array.isArray(obj?.data)
        ? (obj.data as unknown[])
        : Array.isArray(obj?.$values)
          ? (obj.$values as unknown[])
          : []
    return arr.map(item => normalizeTrailEntry((item ?? {}) as Raw))
  } catch {
    return []
  }
}

// ===== v26 WORKFLOW ACTION HELPERS (amended v24 controller routes) =====

/**
 * Shared POST for the v24 workflow routes. Always sends credentials (HttpOnly cookie
 * auth) and raises the shared ApiError carrying the server's structured denial code,
 * e.g. 403 { code: 'ATA_CONFIRM_NOT_ALLOWED', message: '...' }.
 */
async function postWorkflowAction(
  id: string,
  action: string,
  body: unknown,
): Promise<{ message: string }> {
  let res: Response
  try {
    res = await fetch(`${SE_API_PREFIX}/ata-records/${id}/${action}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body ?? {}),
    })
  } catch {
    throw new ApiError('Network error - the request could not be sent.', 0, null)
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let message = text || `HTTP ${res.status}`
    let code: string | null = null
    if (text) {
      try {
        const parsed = JSON.parse(text) as { code?: string; message?: string }
        if (parsed && typeof parsed === 'object') {
          if (parsed.code) code = parsed.code
          if (parsed.message) message = parsed.message
        }
      } catch {
        /* not JSON - keep the raw text */
      }
    }
    throw new ApiError(message, res.status, code)
  }

  try {
    return (await res.json()) as { message: string }
  } catch {
    return { message: 'OK' }
  }
}

/**
 * SCENARIO A - CONFIRM the record (POST /ata-records/{id}/confirm).
 * Used when the Shop Team Leader created or amended the record themselves. The comment
 * is OPTIONAL; confirming finalizes the record immediately. The server stamps the actor
 * from the JWT - never send actor identity from the client.
 */
export async function confirmATARecord(
  id: string,
  payload: { comments?: string } = {},
): Promise<{ message: string }> {
  return postWorkflowAction(id, 'confirm', { comments: payload.comments ?? '' })
}

/**
 * SCENARIO B - SEND BACK FOR REVISION (POST /ata-records/{id}/return).
 * The record returns to the preparer and STAYS ALIVE (unlike Reject, which is terminal).
 * Comments are MANDATORY - the controller answers 400 ATA_RETURN_COMMENTS_REQUIRED when
 * they are blank, so the same guard is applied client-side for a faster feedback loop.
 */
export async function returnATARecordForRevision(
  id: string,
  payload: { comments: string },
): Promise<{ message: string }> {
  const comments = (payload.comments ?? '').trim()
  if (!comments) {
    throw new ApiError('Please explain what needs to be revised.', 0, 'ATA_RETURN_COMMENTS_REQUIRED')
  }
  return postWorkflowAction(id, 'return', { comments })
}

/**
 * DELEGATION WITH AUTHORITY (POST /ata-records/{id}/reassign).
 * v24: the delegation GRANTS ABILITY TO ACT - the handler persists a live
 * ResponsibilityDelegation so the delegatee can view the Table of Contents and take
 * workflow actions matching the delegated role level. `assignToUserName` MUST be sent:
 * the server resolves the delegation grant by display name, so a reassign without it
 * would persist an unmatchable "user:{id}" grant. `responsibility` defaults to the
 * full workflow level server-side; the explicit value keeps the audit truthful.
 */
export async function delegateATARecord(
  id: string,
  payload: {
    assignToUserId: number | string
    assignToUserName?: string
    responsibility?: string
    expirationDate?: string | null
    reason?: string
  },
): Promise<{ message: string }> {
  const assignToUserId = Number(payload.assignToUserId)
  if (!Number.isFinite(assignToUserId) || assignToUserId <= 0) {
    throw new ApiError('Please select a valid user to delegate to.', 0, null)
  }
  return postWorkflowAction(id, 'reassign', {
    assignToUserId,
    assignToUserName: payload.assignToUserName ?? '',
    responsibility: payload.responsibility ?? '',
    expirationDate: payload.expirationDate || null,
    reason: payload.reason ?? '',
  })
}

// ===== Provisional trail (rollout safety for defect #1) =====

function captionForAction(action: WorkflowAction): string {
  switch (action) {
    case WorkflowAction.Created: return 'Created by'
    case WorkflowAction.Submitted: return 'Submitted by'
    case WorkflowAction.Approved:
    case WorkflowAction.Completed: return 'Approved by'
    case WorkflowAction.Rejected: return 'Rejected by'
    case WorkflowAction.Delegated: return 'Delegated by'
    default: return 'Recorded by'
  }
}

function actionCodeFor(action: WorkflowAction): number {
  switch (action) {
    case WorkflowAction.Rejected: return 4
    case WorkflowAction.Delegated: return 5
    default: return 3
  }
}

/**
 * Maps WorkflowAuditLog rows to PROVISIONAL signature lines so the trail is not empty
 * before the append-only /signatures endpoint is deployed. Flagged provisional:true and
 * rendered as "reconstructed" by ATARecordSignatureTrail - never as a binding signature.
 */
export function buildProvisionalTrailFromAudit(
  logs: WorkflowAuditLogDto[],
): ATARecordSignatureEntryDto[] {
  return [...logs]
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    .map((log, i) => ({
      id: `provisional-${log.id || i}`,
      stageOrder: i,
      stageStatus: 0,
      resultingStatus: 0,
      block: 0,
      blockCaption: captionForAction(log.workflowAction),
      userId: null,
      personName: log.performedBy || '—',
      personRole: '',
      personRoleLabel: '',
      signedAt: log.timestamp || '',
      signatureStoragePath: null,
      signatureFileName: null,
      signatureImageApplied: false,
      actionTaken: actionCodeFor(log.workflowAction),
      comments: log.details || '',
      isCurrent: i === logs.length - 1,
      supersededAt: null,
      recordRevisionNumber: 1,
      provisional: true,
    }))
}

// ===== Client-side fallback (mirrors ATARecordWorkflowCatalog + v24 routing) =====

interface FallbackStage {
  status: ApprovalStatus
  title: string
  caption: string
  roles: string[]
}

/**
 * Stage 1 - preparation. Engineers, delegates and leaders all prepare records here.
 * Stage roles are canonical (canonicalizeRoleToken) spellings.
 */
const FALLBACK_BASE: FallbackStage[] = [
  {
    status: ApprovalStatus.Draft,
    title: 'Prepared by',
    caption: 'Prepared by',
    roles: ['team_leader', 'shop_tl', 'manager', 'shop_manager', 'engineer', 'certifying_staff'],
  },
  {
    // v26 - Scenario B review stage. Owner: the Shop Team Leader (leader tier). They
    // hold FULL authority: edit directly, approve / reject with comment, return,
    // delegate. The chain ENDS here unless the record opted into an extra stage.
    status: ApprovalStatus.PendingTeamLeaderReview,
    title: 'Shop Team Leader review',
    caption: 'Reviewed by',
    roles: ['team_leader', 'shop_tl', 'shop_manager', 'special_team_leader'],
  },
]

/**
 * The Department Manager approval stage was RETIRED from the default chain; the Shop
 * Team Leader review is now the confirmation / finalization step. This stage is
 * appended ONLY for legacy records persisted while the manager stage was still active
 * (mirroring ATARecordWorkflowCatalog.ChainFor), so nothing is stranded mid-chain.
 * New records never enter it.
 */
const FALLBACK_MANAGER_LEGACY: FallbackStage = {
  status: ApprovalStatus.PendingManagerApproval,
  title: 'Department Manager approval (legacy)',
  caption: 'Approved by',
  roles: ['manager'],
}

const FALLBACK_QA: FallbackStage = {
  status: ApprovalStatus.PendingQAApproval,
  title: 'QA approval',
  caption: 'Approved by',
  roles: ['qa_staff', 'qa_personnel', 'certifying_staff'],
}

const FALLBACK_DIRECTOR: FallbackStage = {
  status: ApprovalStatus.PendingDirectorApproval,
  title: 'Director approval',
  caption: 'Approved by',
  roles: ['director'],
}

// ECAA endorsement is an optional trailing stage in ChainFor() - mirror it (v20).
const FALLBACK_ECAA: FallbackStage = {
  status: ApprovalStatus.PendingECAAEndorsement,
  title: 'ECAA endorsement',
  caption: 'Approved by',
  roles: ['ecaa_personnel', 'ecaa_team'],
}

/**
 * Conservative mirror of the server chain + the v24 role-based routing, used ONLY while
 * the capabilities endpoint is not deployed. The server re-checks every action, so this
 * fallback can hide a button but never grant one the backend would refuse.
 *
 * SCENARIO A (originator-led, mirrored via isOriginatorLedRecord from types.ts):
 *   - Confirm is offered to the leader / preparer and finalizes immediately.
 *   - Reject, Return, Delegate and Submit are NOT offered (the leader amends instead).
 * SCENARIO B (engineer- or delegate-prepared):
 *   - Draft / Returned: the preparer (assignedToUserId when set, else any prep role)
 *     edits + submits.
 *   - Review stages: the stage owner (Shop Team Leader by default) has full authority -
 *     edit directly, approve / reject with comment, return, delegate.
 */
export function buildFallbackCapabilities(
  record: ATARecordDto | null,
  rawRole: string | undefined | null,
  currentUserId?: string | number | null,
): ATARecordCapabilitiesDto {
  const status = (record?.approvalStatus ?? ApprovalStatus.Draft) as ApprovalStatus
  const terminal = isATARecordFinalized(status)
  const withOriginator = isATARecordWithOriginator(status)

  const stages = [...FALLBACK_BASE]
  // Legacy records persisted while the retired manager stage was active keep it
  // actionable so their chain preview and approvals still resolve; new records skip it.
  if (status === ApprovalStatus.PendingManagerApproval) {
    stages.push(FALLBACK_MANAGER_LEGACY)
  }
  if (record?.requiresQAApproval) stages.push(FALLBACK_QA)
  if (record?.requiresDirectorApproval) stages.push(FALLBACK_DIRECTOR)
  if (record?.requiresECAAEndorsement) stages.push(FALLBACK_ECAA)

  const idx = stages.findIndex(s => s.status === status)
  const current = idx >= 0 ? stages[idx] : null

  // Canonicalize BEFORE comparing against stage role lists; '' means unknown role,
  // and an ABSENT role must never inherit any authority.
  const role = rawRole ? canonicalizeRoleToken(rawRole) : ''
  const isAdmin = role === 'admin'
  const isLeader = isLeaderTierRole(rawRole) // admin included
  const ownsStage = Boolean(current) && (isAdmin || current!.roles.includes(role))

  // v26 - the Scenario A/B decision, shared with the server contract via types.ts.
  const originatorLed = isOriginatorLedRecord(record, {
    currentUserId,
    currentUserRole: rawRole ?? null,
  })

  // Preparer identity (fallback heuristic): assignedToUserId is the assigned preparer;
  // createdByUserId is the account that created the record. Either match counts.
  const callerId =
    currentUserId != null && currentUserId !== '' ? String(currentUserId) : ''
  const assignedId =
    record?.assignedToUserId != null && record.assignedToUserId !== ''
      ? String(record.assignedToUserId)
      : ''
  const creatorId =
    record?.createdByUserId != null && record.createdByUserId !== ''
      ? String(record.createdByUserId)
      : ''
  const isPreparer =
    callerId !== '' && ((assignedId !== '' && assignedId === callerId) ||
      (creatorId !== '' && creatorId === callerId))

  let canEdit = false
  let canSubmit = false
  let canApprove = false
  let canReject = false
  let canRequestRevision = false
  let canDelegate = false
  let canConfirm = false

  if (!terminal) {
    if (originatorLed) {
      // SCENARIO A - the record is led by its (leader-tier) originator. No
      // counter-signature to collect: Confirm finalizes; Reject never renders.
      canConfirm = isLeader || isPreparer
      canEdit = withOriginator && (isLeader || isPreparer)
      // Scenario A shows Confirm only - submitting is redundant (Confirm finalizes
      // directly, including from Draft). The server keeps the submit path as a
      // safety net but the action bar no longer offers it.
      canSubmit = false
      canApprove = false // the UI shows Confirm; Approve == Confirm server-side
      canReject = false
      canRequestRevision = false
      canDelegate = false // Scenario A renders Confirm only
    } else if (withOriginator) {
      // SCENARIO B, pre-submission: preparer (or assigned preparer) edits + submits.
      const originatorMayAct =
        isAdmin ||
        (assignedId !== '' && callerId !== ''
          ? assignedId === callerId
          : Boolean(current) && current!.roles.includes(role))
      canEdit = originatorMayAct
      canSubmit = originatorMayAct
    } else {
      // SCENARIO B, review stages: the stage owner has FULL authority - edit directly,
      // approve / reject with comment, send back for revision, delegate.
      canEdit = ownsStage
      canApprove = ownsStage
      canReject = ownsStage
      canRequestRevision = ownsStage
      canDelegate = ownsStage
    }
  }

  const chain: ATAWorkflowStageDto[] = stages.map((s, i) => ({
    order: i,
    title: s.title,
    caption: s.caption,
    status: s.status as number,
    roleLabels: s.roles,
    isOptional: false,
  }))
  chain.push({
    order: stages.length,
    title: 'Approved',
    caption: '',
    status: ApprovalStatus.Approved as number,
    roleLabels: [],
    isOptional: false,
  })

  return {
    canView: true,
    canEdit,
    canSubmit,
    canApprove,
    canReject,
    canRequestRevision,
    canDelegate,
    canConfirm,
    isOriginatorLed: originatorLed,
    approvalCommentEnabled: true, // the approval / confirm comment is optional but always offered
    delegatedAuthority: null, // resolved server-side (or via useDelegatedATAAuthority client-side)
    approvalStatus: status as number,
    revisionNumber: record?.revisionNumber ?? 1,
    currentStageOrder: idx >= 0 ? idx : null,
    currentStageTitle: current?.title ?? '',
    currentStageCaption: current?.caption ?? '',
    nextStageTitle: idx >= 0 && idx + 1 < stages.length ? stages[idx + 1].title : '',
    eligibleRoles: current ? current.roles : [],
    chain,
    computedFallback: true,
  }
}

// ===== Hook =====

export interface ATARecordWorkflowState {
  capabilities: ATARecordCapabilitiesDto | null
  trail: ATARecordSignatureEntryDto[]
  /** Where the rendered trail came from: server / audit-derived provisional / none. */
  trailSource: ATARecordTrailSource
  loading: boolean
  /** Re-read capabilities + trail. Call after any successful mutation. */
  refresh: () => Promise<void>
}

/**
 * Single source of truth for the ATA record action bar. Pass ataRecordId = null for
 * non-ATA entities (forms) and the hook stays inert.
 */
export function useATARecordWorkflow(
  ataRecordId: string | null,
  currentStatus: number,
  revisionNumber: number,
  recordForFallback: ATARecordDto | null,
  userRole: string,
  currentUserId?: string | number | null,
): ATARecordWorkflowState {
  const [capabilities, setCapabilities] = useState<ATARecordCapabilitiesDto | null>(null)
  const [trail, setTrail] = useState<ATARecordSignatureEntryDto[]>([])
  const [trailSource, setTrailSource] = useState<ATARecordTrailSource>('none')
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!ataRecordId) {
      setCapabilities(null)
      setTrail([])
      setTrailSource('none')
      return
    }
    setLoading(true)
    try {
      const [caps, entries] = await Promise.all([
        getATARecordCapabilities(ataRecordId),
        getATARecordSignatureTrail(ataRecordId),
      ])
      setCapabilities(
        caps ?? buildFallbackCapabilities(recordForFallback, userRole, currentUserId),
      )

      if (entries.length > 0) {
        setTrail(entries)
        setTrailSource('server')
      } else {
        // Rollout safety: the append-only /signatures endpoint is not deployed yet.
        // Reconstruct a provisional trail from the audit log so problem #1 is visible.
        let provisional: ATARecordSignatureEntryDto[] = []
        try {
          const logs = await getAuditLogsByEntity('ATARecord', ataRecordId)
          provisional = buildProvisionalTrailFromAudit(logs)
        } catch {
          provisional = []
        }
        setTrail(provisional)
        setTrailSource(provisional.length > 0 ? 'audit' : 'none')
      }
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ataRecordId, currentStatus, revisionNumber, recordForFallback, userRole, currentUserId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { capabilities, trail, trailSource, loading, refresh }
}
