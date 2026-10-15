/**
 * Shared TL Scope filtering utility for API proxy routes.
 *
 * When a Team Leader has a restricted scope (set by a Director via tl-scopes.json),
 * API proxy routes must filter backend responses to only include data belonging
 * to users within the TL's allowedUserIds.
 *
 * This module provides helpers that:
 *   1. Identify the requesting user (via /auth/me)
 *   2. Check if they are a scope-restricted TL
 *   3. Build a set of allowed user IDs + names for filtering
 *   4. Filter arrays of workload-adjustment requests, hold requests, etc.
 */

import { getTLAllowedUserIds } from '@/lib/tl-scope-store'

const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
).replace(/\/+$/, '')

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeRole(raw: any): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'number') return String(raw)
  return String(raw).toLowerCase().trim().replace(/[\s\-\_]+/g, '_')
}

function isTLRole(role: string): boolean {
  return role === 'team_leader' || role === 'teamleader' || role === '0'
}

// ─── Fetch current user ─────────────────────────────────────────────────────

async function fetchCurrentUser(authHeader: string): Promise<any | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
    })
    if (!res.ok) return null
    const body = await res.json().catch(() => null)
    return body?.user ?? body
  } catch {
    return null
  }
}

// ─── Resolve allowed user names from IDs ────────────────────────────────────

async function resolveUserNames(
  allowedUserIds: Set<number>,
  authHeader: string
): Promise<Set<string>> {
  const names = new Set<string>()
  try {
    const res = await fetch(`${API_BASE}/users`, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
    })
    if (!res.ok) return names
    const body = await res.json().catch(() => null)
    const usersList = Array.isArray(body)
      ? body
      : body?.users ?? body?.data ?? []
    if (Array.isArray(usersList)) {
      usersList.forEach((u: any) => {
        const uid = Number(u.userId ?? u.user_id ?? u.id ?? NaN)
        if (allowedUserIds.has(uid)) {
          const name = String(
            u.fullName ?? u.full_name ?? u.name ?? ''
          )
            .toLowerCase()
            .trim()
          if (name) names.add(name)
        }
      })
    }
  } catch {
    // silently handle
  }
  return names
}

// ─── Public: TL Scope context ───────────────────────────────────────────────

export interface TLScopeContext {
  isRestricted: boolean
  allowedUserIds: Set<number>
  allowedUserNames: Set<string>
}

/**
 * Build a TL scope context for the current request.
 * Returns { isRestricted: false } if the user is not a scope-restricted TL,
 * meaning no filtering should be applied.
 */
export async function buildTLScopeContext(
  authHeader: string
): Promise<TLScopeContext> {
  const noRestriction: TLScopeContext = {
    isRestricted: false,
    allowedUserIds: new Set(),
    allowedUserNames: new Set(),
  }

  const user = await fetchCurrentUser(authHeader)
  if (!user) return noRestriction

  const role = normalizeRole(
    user?.role ?? user?.role_name ?? user?.roleName ?? user?.roleDisplayName ?? ''
  )

  if (!isTLRole(role)) return noRestriction

  const tlUserId = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
  if (!isFinite(tlUserId)) return noRestriction

  const allowedIds = getTLAllowedUserIds(tlUserId)
  if (allowedIds.length === 0) return noRestriction // unrestricted TL

  const allowedUserIdSet = new Set(allowedIds)
  const allowedUserNameSet = await resolveUserNames(allowedUserIdSet, authHeader)

  return {
    isRestricted: true,
    allowedUserIds: allowedUserIdSet,
    allowedUserNames: allowedUserNameSet,
  }
}

// ─── Public: filter helpers ─────────────────────────────────────────────────

/**
 * Check if a given user ID or user name belongs to the TL's scope.
 */
export function isInScope(
  ctx: TLScopeContext,
  userId?: number | null,
  userName?: string | null
): boolean {
  if (!ctx.isRestricted) return true

  if (userId && isFinite(userId) && ctx.allowedUserIds.has(userId)) return true

  if (userName) {
    const nameLower = userName.toLowerCase().trim()
    if (!nameLower) return false
    for (const scopeName of ctx.allowedUserNames) {
      if (!scopeName) continue
      if (
        nameLower === scopeName ||
        nameLower.includes(scopeName) ||
        scopeName.includes(nameLower)
      ) {
        return true
      }
    }
  }

  return false
}

/**
 * Filter an array of workload-adjustment requests by TL scope.
 *
 * Checks requesterId / requesterName and assignedEngineer fields.
 */
export function filterWorkloadAdjustments(
  items: any[],
  ctx: TLScopeContext
): any[] {
  if (!ctx.isRestricted) return items

  return items.filter((item) => {
    const requesterId = Number(
      item.requesterId ??
        item.RequesterId ??
        item.requester_id ??
        item.engineerId ??
        item.EngineerId ??
        NaN
    )
    const requesterName = String(
      item.requesterName ??
        item.RequesterName ??
        item.requester_name ??
        item.engineerName ??
        item.EngineerName ??
        ''
    ).trim()
    const assignedEngineer = String(
      item.assignedEngineer ??
        item.AssignedEngineer ??
        item.assigned_engineer ??
        ''
    ).trim()

    return (
      isInScope(ctx, requesterId, requesterName) ||
      isInScope(ctx, undefined, assignedEngineer)
    )
  })
}

/**
 * Filter an array of hold requests by TL scope.
 *
 * Checks requestedByEngineerId / requestedByEngineerName fields.
 */
export function filterHoldRequests(
  items: any[],
  ctx: TLScopeContext
): any[] {
  if (!ctx.isRestricted) return items

  return items.filter((item) => {
    const engineerId = Number(
      item.requestedByEngineerId ??
        item.RequestedByEngineerId ??
        item.requested_by_engineer_id ??
        item.requestedBy ??
        item.RequestedBy ??
        item.requested_by ??
        NaN
    )
    const engineerName = String(
      item.requestedByEngineerName ??
        item.RequestedByEngineerName ??
        item.requested_by_engineer_name ??
        item.requestedByName ??
        item.RequestedByName ??
        item.requested_by_name ??
        ''
    ).trim()

    return isInScope(ctx, engineerId, engineerName)
  })
}

/**
 * Filter an array of pending TL approval tasks by TL scope.
 *
 * Checks createdBy and assignedEngineer fields.
 */
export function filterPendingTasks(
  items: any[],
  ctx: TLScopeContext
): any[] {
  if (!ctx.isRestricted) return items

  return items.filter((item) => {
    const createdBy = Number(
      item.createdBy ??
        item.CreatedBy ??
        item.created_by ??
        item.creator_id ??
        item.creatorId ??
        NaN
    )
    const assignedEngineer = String(
      item.assignedEngineer ??
        item.AssignedEngineer ??
        item.assigned_engineer ??
        item.Assigned ??
        item.assigned ??
        ''
    ).trim()
    const creatorName = String(
      item.creatorName ??
        item.CreatorName ??
        item.creator_name ??
        item.created_by_name ??
        ''
    ).trim()

    return (
      isInScope(ctx, createdBy, creatorName) ||
      isInScope(ctx, undefined, assignedEngineer)
    )
  })
}