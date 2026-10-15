/**
 * =====================================================================================
 * AMENDED v24 — DELEGATION / WORKLOAD MANAGEMENT CLIENT
 * File: CMT.Frontend/src/lib/self-evaluation/delegation-api.ts
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * `DelegationManagementPanel.tsx` and `DocumentWorkspace.tsx` both imported from
 * '@/lib/self-evaluation/delegation-api', but the module was never created — hence
 * the Webpack "Module not found: Can't resolve '@/lib/self-evaluation/delegation-api'"
 * build failure. This file is that missing module.
 *
 * REQUIREMENT IT SERVES
 * ---------------------
 *   "When a Shop Team Leader has a high workload, they can delegate the
 *    role/permission to another authorized user to create a New ATA Record."
 *
 * WHAT IT OWNS
 *   (1) The responsibility keys that identify an ATA-record grant. AMENDED v24: the
 *       backend (ATAWorkflowResponsibilities in ATARecordCommands.cs) recognises THREE
 *       action-granting responsibilities — creation, approval and the full workflow
 *       level — and this client mirrors them exactly so the UI can grant and display
 *       the same levels the server enforces.
 *   (2) The typed client against ResponsibilityDelegationController
 *       (/api/self-evaluation/ResponsibilityDelegation), forwarded by the existing
 *       proxy, so NO new route file is required.
 *   (3) `isActiveDelegation()` — the single truth for "is this grant live RIGHT NOW",
 *       because a row may still be persisted as Active while its expiration date has
 *       already passed. Status alone is NOT sufficient.
 *   (4) `useAtaCreationPermission()` — the hook the UI uses to decide whether to show
 *       "Create New ATA Record". It answers from the caller's OWN role first (no
 *       network round-trip needed) and falls back to an active delegation.
 *   (5) v24 AMENDMENT — `useDelegatedATAAuthority()`: whether the signed-in user holds
 *       a LIVE delegation granting ATA workflow authority AT ANY LEVEL (creation,
 *       approval or full workflow). While active, the user may view the Table of
 *       Contents and take workflow actions matching their delegated role level
 *       (edit, submit, approve, reject, return) — the server re-checks every action,
 *       so the UI can trust this flag for RENDERING only.
 *
 * ACCOUNTABILITY NOTE
 *   A delegation grants the ABILITY to act, never a change of identity. The record
 *   still carries the delegatee's own name in `createdBy`/`updatedBy`, so the
 *   accountability watermark stays truthful and audit attribution names the actual
 *   acting user.
 * =====================================================================================
 */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { DelegationStatus } from './types'
import { normalizeRole } from '@/lib/role-utils'

// =====================================================================================
// 1. RESPONSIBILITY KEYS  (mirrors ATAWorkflowResponsibilities on the server)
// =====================================================================================

/**
 * Delegated permission to CREATE ATA records on a leader's behalf. Kept stable — it is
 * persisted data, not a display label.
 */
export const DELEGATION_RESPONSIBILITY_ATA_CREATION = 'ata_record_creation'

/**
 * v24: delegated permission to APPROVE / CONFIRM / REJECT / RETURN records.
 */
export const DELEGATION_RESPONSIBILITY_ATA_APPROVAL = 'ata_record_approval'

/**
 * v24: delegated permission to exercise the FULL ATA workflow at the grantor's level —
 * Table of Contents visibility plus every workflow action.
 */
export const DELEGATION_RESPONSIBILITY_ATA_WORKFLOW = 'ata_record_workflow'

/**
 * Every responsibility that grants workflow ACTION authority. Order matters only for
 * display; the membership test is what the permission hooks rely on. Mirrors
 * `ATAWorkflowResponsibilities.ActionGranting` server-side.
 */
export const ATA_ACTION_GRANTING_RESPONSIBILITIES: readonly string[] = [
  DELEGATION_RESPONSIBILITY_ATA_WORKFLOW,
  DELEGATION_RESPONSIBILITY_ATA_APPROVAL,
  DELEGATION_RESPONSIBILITY_ATA_CREATION,
]

/** True when the responsibility string grants workflow action authority. */
export function isActionGrantingResponsibility(responsibility: string | null | undefined): boolean {
  if (!responsibility) return false
  return ATA_ACTION_GRANTING_RESPONSIBILITIES.includes(responsibility.trim().toLowerCase())
}

/** Human-readable label for the responsibility select / audit display. */
export function delegationResponsibilityLabel(responsibility: string): string {
  switch (responsibility.trim().toLowerCase()) {
    case DELEGATION_RESPONSIBILITY_ATA_WORKFLOW: return 'Full ATA workflow (create, approve, reject, return)'
    case DELEGATION_RESPONSIBILITY_ATA_APPROVAL: return 'ATA record approval (approve, reject, return)'
    case DELEGATION_RESPONSIBILITY_ATA_CREATION: return 'ATA record creation'
    default: return responsibility || 'Unspecified responsibility'
  }
}

// =====================================================================================
// 2. ROUTES
// =====================================================================================

const API_BASE_URL = '/api'
const DELEGATION_PREFIX = `${API_BASE_URL}/self-evaluation/ResponsibilityDelegation`

// =====================================================================================
// 3. TYPES
// =====================================================================================

/**
 * One delegation grant as the UI consumes it. This is a superset of
 * `ResponsibilityDelegationDto`: the panel also renders `reason`, and the permission
 * hook needs `delegatedToUserId` to match the grant against the signed-in user.
 */
export interface DelegationRow {
  id: string
  /** Display name of the user who GRANTED the permission. */
  delegatedBy: string
  /** Numeric backend id of the grantor, when the server supplies it. */
  delegatedByUserId: number | null
  /** Display name of the user who RECEIVED the permission. */
  delegatedTo: string
  /** Numeric backend id of the grantee — used to match the signed-in user. */
  delegatedToUserId: number | null
  /** e.g. DELEGATION_RESPONSIBILITY_ATA_WORKFLOW */
  responsibility: string
  scope: string
  status: DelegationStatus
  effectiveDate: string
  expirationDate: string | null
  /** Free-text justification, e.g. "High workload this week". */
  reason: string
  shopId: string | null
}

/** Payload accepted by `createDelegation`. */
export interface CreateDelegationRequest {
  responsibility: string
  /** Numeric backend id of the grantee. */
  delegatedToUserId: number
  /** Display name of the grantee, stored for audit readability. */
  delegatedTo: string
  scope?: string
  /** ISO date (yyyy-MM-dd). Omit for an open-ended grant. */
  expirationDate?: string
  reason?: string
  shopId?: string
}

// =====================================================================================
// 4. TRANSPORT
// =====================================================================================

/** Typed error carrying the HTTP status and any structured denial `code`. */
export class DelegationApiError extends Error {
  status: number
  code: string | null
  constructor(message: string, status = 0, code: string | null = null) {
    super(message)
    this.name = 'DelegationApiError'
    this.status = status
    this.code = code
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    },
    // The app authenticates with an HttpOnly access_token cookie forwarded by the
    // route handler, so credentials MUST be included or every call answers 401.
    credentials: 'include',
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    let code: string | null = null
    let message = body || `HTTP ${response.status}`
    if (body) {
      try {
        const parsed = JSON.parse(body) as { code?: string; message?: string }
        if (parsed && typeof parsed === 'object') {
          if (parsed.code) code = parsed.code
          if (parsed.message) message = parsed.message
        }
      } catch {
        /* not JSON — keep the raw text */
      }
    }
    throw new DelegationApiError(message, response.status, code)
  }

  if (response.status === 204) return undefined as unknown as T
  return response.json() as Promise<T>
}

/** Unwraps the several envelope shapes the backend controllers use. */
function extractArray(payload: unknown): Array<Record<string, unknown>> {
  if (!payload) return []
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>
  if (typeof payload === 'object') {
    const obj = payload as Record<string, unknown>
    if (Array.isArray(obj.data)) return obj.data as Array<Record<string, unknown>>
    if (Array.isArray(obj.payload)) return obj.payload as Array<Record<string, unknown>>
    if (Array.isArray(obj.items)) return obj.items as Array<Record<string, unknown>>
  }
  return []
}

function readString(raw: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'string' && value.length > 0) return value
    if (typeof value === 'number') return String(value)
  }
  return ''
}

function readNumberOrNull(raw: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = raw[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

/** Coerces the status, which may arrive as a number or as a name ("Active"). */
function readStatus(raw: Record<string, unknown>): DelegationStatus {
  const value = raw.status ?? raw.Status
  if (typeof value === 'number') {
    return value as DelegationStatus
  }
  if (typeof value === 'string') {
    switch (value.trim().toLowerCase()) {
      case 'revoked':
        return DelegationStatus.Revoked
      case 'expired':
        return DelegationStatus.Expired
      case 'active':
        return DelegationStatus.Active
      default: {
        const parsed = Number(value)
        if (Number.isFinite(parsed)) return parsed as DelegationStatus
      }
    }
  }
  return DelegationStatus.Active
}

/** PascalCase (server) and camelCase (some DTOs) are both tolerated. */
function normalizeDelegation(raw: Record<string, unknown>): DelegationRow {
  return {
    id: readString(raw, 'id', 'Id', 'delegationId', 'DelegationId'),
    delegatedBy: readString(raw, 'delegatedBy', 'DelegatedBy'),
    delegatedByUserId: readNumberOrNull(raw, 'delegatedByUserId', 'DelegatedByUserId'),
    delegatedTo: readString(raw, 'delegatedTo', 'DelegatedTo'),
    delegatedToUserId: readNumberOrNull(raw, 'delegatedToUserId', 'DelegatedToUserId'),
    responsibility: readString(raw, 'responsibility', 'Responsibility'),
    scope: readString(raw, 'scope', 'Scope'),
    status: readStatus(raw),
    effectiveDate: readString(raw, 'effectiveDate', 'EffectiveDate'),
    expirationDate: readString(raw, 'expirationDate', 'ExpirationDate') || null,
    reason: readString(raw, 'reason', 'Reason', 'notes', 'Notes'),
    shopId: readString(raw, 'shopId', 'ShopId') || null,
  }
}

// =====================================================================================
// 5. TYPED CLIENT
// =====================================================================================

/**
 * GET the delegations visible to the caller.
 * @param includeInactive when true, Revoked and Expired rows are returned too, so the
 *        panel can show the full audit trail rather than only live grants.
 */
export async function listDelegations(includeInactive = false): Promise<DelegationRow[]> {
  const query = new URLSearchParams()
  query.set('includeInactive', String(includeInactive))
  const payload = await request<unknown>(`${DELEGATION_PREFIX}?${query.toString()}`)
  return extractArray(payload).map(normalizeDelegation)
}

/** GET only the grants RECEIVED by the signed-in user (delegatee view). */
export async function listMyDelegations(): Promise<DelegationRow[]> {
  const payload = await request<unknown>(`${DELEGATION_PREFIX}/my-delegations`)
  return extractArray(payload).map(normalizeDelegation)
}

/** POST a new grant. The server stamps `delegatedBy` from the authenticated caller. */
export async function createDelegation(
  payload: CreateDelegationRequest,
): Promise<DelegationRow> {
  const body = {
    responsibility: payload.responsibility,
    delegatedToUserId: payload.delegatedToUserId,
    delegatedTo: payload.delegatedTo,
    scope: payload.scope ?? '',
    expirationDate: payload.expirationDate || null,
    reason: payload.reason ?? '',
    shopId: payload.shopId || null,
  }
  const created = await request<unknown>(DELEGATION_PREFIX, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  return normalizeDelegation((created ?? {}) as Record<string, unknown>)
}

/** POST a revocation. Takes effect immediately for every subsequent permission read. */
export async function revokeDelegation(
  delegationId: string,
  reason?: string,
): Promise<DelegationRow> {
  const revoked = await request<unknown>(
    `${DELEGATION_PREFIX}/${encodeURIComponent(delegationId)}/revoke`,
    { method: 'POST', body: JSON.stringify({ reason: reason ?? '' }) },
  )
  return normalizeDelegation((revoked ?? {}) as Record<string, unknown>)
}

// =====================================================================================
// 6. POLICY — "IS THIS GRANT LIVE RIGHT NOW?"
// =====================================================================================

/**
 * A grant counts as live ONLY when it is both Active AND still inside its window.
 * Status alone is not enough: a row can remain persisted as Active after its
 * expiration date has passed (the server sweeps it lazily), which would otherwise
 * hand out a permission that should already be gone.
 */
export function isActiveDelegation(row: DelegationRow | null | undefined): boolean {
  if (!row) return false
  if (row.status !== DelegationStatus.Active) return false

  const now = Date.now()

  if (row.expirationDate) {
    const expires = new Date(row.expirationDate).getTime()
    // An expiration DATE is inclusive: the grant stays valid through that whole day.
    if (Number.isFinite(expires) && now > expires + 24 * 60 * 60 * 1000 - 1) return false
  }

  if (row.effectiveDate) {
    const effective = new Date(row.effectiveDate).getTime()
    if (Number.isFinite(effective) && now < effective) return false
  }

  return true
}

/**
 * Live grants for one responsibility, optionally narrowed to a single user.
 * AMENDED v24: pass '*' (or omit the responsibility) to match ANY action-granting
 * responsibility, which is what the workflow-authority hooks need.
 */
export function activeDelegationsFor(
  rows: DelegationRow[],
  responsibility: string,
  userId?: number | null,
): DelegationRow[] {
  return (rows ?? []).filter(row => {
    if (responsibility !== '*' && row.responsibility !== responsibility) return false
    if (responsibility === '*' && !isActionGrantingResponsibility(row.responsibility)) return false
    if (!isActiveDelegation(row)) return false
    if (userId === undefined || userId === null) return true
    return row.delegatedToUserId === userId
  })
}

// =====================================================================================
// 7. ROLE MATRIX — WHO MAY CREATE / DELEGATE WITHOUT ANY GRANT
// =====================================================================================

/**
 * Roles that can create an ATA record purely from their own position. Mirrors the
 * server-side rule; a delegation only ever ADDS to this set, never subtracts.
 */
export const ATA_CREATION_ROLES: string[] = [
  'team_leader',
  'shop_tl',
  'engineer',
]

/**
 * Roles allowed to GRANT the creation permission away. A delegatee cannot re-delegate:
 * only a user who owns the permission by role may pass it on, which keeps the audit
 * chain one level deep and unambiguous.
 */
export const ATA_DELEGATION_GRANTOR_ROLES: string[] = [
  'admin',
  'team_leader',
  'shop_tl',
]

/** True when the role alone permits creating ATA records. */
export function roleCanCreateATARecord(role: string | null | undefined): boolean {
  if (!role) return false
  return ATA_CREATION_ROLES.includes(normalizeRole(role))
}

/** True when the role alone permits delegating ATA-record creation to someone else. */
export function roleCanDelegateATACreation(role: string | null | undefined): boolean {
  if (!role) return false
  return ATA_DELEGATION_GRANTOR_ROLES.includes(normalizeRole(role))
}

// =====================================================================================
// 8. THE HOOK THE UI CONSUMES  (creation permission)
// =====================================================================================

/** The minimal shape this module needs from the auth user; kept loose on purpose. */
interface DelegationAwareUser {
  userId?: number | string | null
  id?: number | string | null
  role?: string | null
}

export interface AtaCreationPermission {
  /** Show "Create New ATA Record" when true. */
  canCreate: boolean
  /** Where the permission came from — drives the explanatory tooltip. */
  source: 'role' | 'delegation' | 'none'
  /** Show the "Delegate" button when true. */
  canDelegate: boolean
  /** The live grant backing a 'delegation' source, for messaging. */
  delegation: DelegationRow | null
  /** True while the delegation lookup is still in flight. */
  loading: boolean
  /** Re-reads the grants, e.g. right after one is revoked. */
  refresh: () => void
}

function resolveUserId(user: DelegationAwareUser | null | undefined): number | null {
  if (!user) return null
  const raw = user.userId ?? user.id
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

/**
 * Resolves whether the signed-in user may create a New ATA Record.
 *
 * Order of evaluation, and why:
 *   1. The user's OWN role. Answered synchronously, so a Shop Team Leader never waits
 *      on a network call to see their primary action button.
 *   2. An active delegation. v24: the full-workflow responsibility ALSO grants
 *      creation (it is the highest level), so both keys are accepted. Only queried
 *      when the role alone is not sufficient, which keeps the request off the hot
 *      path for the majority of users.
 *
 * A failed lookup is treated as "no delegation" rather than an error: the worst case is
 * a hidden button, never a false grant.
 */
export function useAtaCreationPermission(
  role: string | null | undefined,
  user?: DelegationAwareUser | null,
): AtaCreationPermission {
  const roleAllows = roleCanCreateATARecord(role)
  const canDelegate = roleCanDelegateATACreation(role)
  const userId = resolveUserId(user)

  const [delegation, setDelegation] = useState<DelegationRow | null>(null)
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  const refresh = useCallback(() => setReloadToken(token => token + 1), [])

  useEffect(() => {
    // The role already grants it — no need to ask the server anything.
    if (roleAllows || !role) {
      setDelegation(null)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    listMyDelegations()
      .then(rows => {
        if (cancelled) return
        // Creation is granted by the creation responsibility OR the full workflow level.
        const creation = activeDelegationsFor(
          rows,
          DELEGATION_RESPONSIBILITY_ATA_CREATION,
          userId ?? undefined,
        )
        const workflow = activeDelegationsFor(
          rows,
          DELEGATION_RESPONSIBILITY_ATA_WORKFLOW,
          userId ?? undefined,
        )
        setDelegation(creation[0] ?? workflow[0] ?? null)
      })
      .catch(() => {
        // Fail CLOSED: no delegation, no button.
        if (!cancelled) setDelegation(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [role, roleAllows, userId, reloadToken])

  return useMemo<AtaCreationPermission>(() => {
    if (roleAllows) {
      return { canCreate: true, source: 'role', canDelegate, delegation: null, loading: false, refresh }
    }
    if (delegation) {
      return { canCreate: true, source: 'delegation', canDelegate, delegation, loading, refresh }
    }
    return { canCreate: false, source: 'none', canDelegate, delegation: null, loading, refresh }
  }, [roleAllows, canDelegate, delegation, loading, refresh])
}

// =====================================================================================
// 9. DELEGATED AUTHORITY HOOK  (AMENDMENT v24 — ToC visibility + delegated-level actions)
// =====================================================================================

export interface DelegatedATAAuthority {
  /**
   * True while the signed-in user holds a LIVE delegation granting ATA workflow
   * authority at ANY level (creation, approval or full workflow). While active, the
   * user may see the Table of Contents for records in the delegated scope and take
   * workflow actions matching their delegated role level (edit, submit, approve,
   * reject, return). The server re-checks every action against the delegation table,
   * so this flag must be used for RENDERING decisions only.
   */
  active: boolean
  /**
   * The live grant backing the authority, for disclosure/audit display. When several
   * grants are live the HIGHEST level wins (workflow > approval > creation).
   */
  delegation: DelegationRow | null
  /**
   * v24: every action-granting responsibility the user currently holds, resolved from
   * the live grants. Empty when `active` is false.
   */
  responsibilities: string[]
  /** True while the delegation lookup is still in flight. */
  loading: boolean
  /** Re-reads the grants, e.g. right after one is revoked. */
  refresh: () => void
}

/** Display order from the highest to the lowest delegated level. */
const RESPONSIBILITY_PRECEDENCE: readonly string[] = [
  DELEGATION_RESPONSIBILITY_ATA_WORKFLOW,
  DELEGATION_RESPONSIBILITY_ATA_APPROVAL,
  DELEGATION_RESPONSIBILITY_ATA_CREATION,
]

/**
 * Resolves whether the signed-in user holds a live delegation granting ATA workflow
 * authority. Role-holders answer synchronously with active=false — they already own
 * their authority and must never wait on the network. A failed lookup fails CLOSED
 * (no delegation), exactly like `useAtaCreationPermission`: the worst case is a hidden
 * capability, never a false one.
 */
export function useDelegatedATAAuthority(
  role: string | null | undefined,
  user?: DelegationAwareUser | null,
): DelegatedATAAuthority {
  const roleAllows = roleCanCreateATARecord(role)
  const userId = resolveUserId(user)

  const [delegations, setDelegations] = useState<DelegationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  const refresh = useCallback(() => setReloadToken(token => token + 1), [])

  useEffect(() => {
    if (roleAllows || !role) {
      setDelegations([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    listMyDelegations()
      .then(rows => {
        if (cancelled) return
        // ANY action-granting responsibility counts — creation, approval or the full
        // workflow level (mirrors ATAWorkflowResponsibilities.ActionGranting).
        const live = activeDelegationsFor(rows, '*', userId ?? undefined)
        setDelegations(live)
      })
      .catch(() => {
        // Fail CLOSED: no delegation, no elevated capability.
        if (!cancelled) setDelegations([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [role, roleAllows, userId, reloadToken])

  return useMemo<DelegatedATAAuthority>(() => {
    if (roleAllows) {
      return { active: false, delegation: null, responsibilities: [], loading: false, refresh }
    }

    const responsibilities = RESPONSIBILITY_PRECEDENCE.filter(level =>
      delegations.some(d => d.responsibility.trim().toLowerCase() === level),
    )
    const primary =
      delegations.find(d => d.responsibility.trim().toLowerCase() === responsibilities[0]) ?? null

    return {
      active: delegations.length > 0,
      delegation: primary,
      responsibilities,
      loading,
      refresh,
    }
  }, [roleAllows, delegations, loading, refresh])
}
