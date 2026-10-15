/**
 * =====================================================================================
 * AMENDED v14 - PHASE 1 (FRONTEND), FEATURE 3: ENGINEER ROLE & SHOP TEAM ROUTING CLIENT
 * CMT.Frontend/src/lib/workflow/shop-routing.ts                                (NEW FILE)
 * Copy to: CMT.Frontend/src/lib/workflow/shop-routing.ts
 *
 * WHAT THIS FILE IS
 * -----------------
 * The FRONTEND MIRROR + API CLIENT of
 *   CMT.Domain/Models/SelfEvaluation/EngineerRoutingPolicy.cs
 *
 * It owns:
 *   (1) the route table for the routing endpoints - all under /api/self-evaluation, which
 *       the EXISTING catch-all proxy forwards, so NO new Next.js route file is required;
 *   (2) the typed client: route an ATA record to shops, list its routing rows, the STL's
 *       own queue, acknowledge, complete, and the "x of y shops complete" progress;
 *   (3) a LOCAL mirror of the policy decisions (canProvisionEngineer / canRoute /
 *       canTeamLeaderSee / canActOnRouting / allShopsComplete / shopProgress) so the UI
 *       enforces the "STRICTLY to the designated Shop Team Leader" rule with the SAME
 *       denial codes the server returns.
 *
 * THE WORD "STRICTLY" IS THE WHOLE FEATURE
 *   canTeamLeaderSee(routing, userId) is true ONLY for the STL the row was resolved to.
 *   An STL of shop B must NOT see shop A's row. Filtering by shop name or by the record's
 *   own ShopId is a defect: a record routed to three shops has ONE ShopId and THREE
 *   responsible STLs.
 *
 * A SHOP WITH NO ACTIVE STL IS A WARNING, NEVER A SILENT DROP
 *   canRoute returns warnings[] for such shops; the rows are still created and flagged.
 *
 * BINDING RULES
 *   - user ids are numbers (C# long); shop / record / routing ids are strings (Guid).
 * =====================================================================================
 */

import {
  ROUTE_ATA_RECORD_PERMISSION,
  WORKFLOW_ERROR_CODES,
  type ATARecordShopRoutingResponse,
  type EngineerRoutingDecisionResponse,
  type RouteATARecordRequest,
  type ShopProgressDto,
  type ShopRoutingTargetDto,
} from '@/lib/workflow/workflow-types'
import { apiUrl } from '@/lib/workflow/workflow-config'
import { getJson, getList, postJson, toEntityId, toUserId } from '@/lib/workflow/workflow-transport'
import { ORG_ROLES, effectivePermissions, normalizeRole } from '@/lib/role-hierarchy'

// =====================================================================================
// 1. ROUTES  (forwarded by the existing /api/self-evaluation catch-all proxy)
// =====================================================================================

export const SHOP_ROUTING_ROUTES = {
  /** POST /api/self-evaluation/ata-records/{id}/routing -> routing rows (201) */
  route: (ataRecordId: string) =>
    apiUrl(`/api/self-evaluation/ata-records/${encodeURIComponent(toEntityId(ataRecordId, 'ataRecordId'))}/routing`),
  /** GET /api/self-evaluation/ata-records/{id}/routing -> ATARecordShopRoutingResponse[] */
  list: (ataRecordId: string) =>
    apiUrl(`/api/self-evaluation/ata-records/${encodeURIComponent(toEntityId(ataRecordId, 'ataRecordId'))}/routing`),
  /** GET /api/self-evaluation/ata-records/{id}/routing/progress -> ShopProgressDto */
  progress: (ataRecordId: string) =>
    apiUrl(`/api/self-evaluation/ata-records/${encodeURIComponent(toEntityId(ataRecordId, 'ataRecordId'))}/routing/progress`),
  /** GET /api/self-evaluation/my-routings -> the CALLING STL's queue (RoutingsFor) */
  myQueue: () => apiUrl('/api/self-evaluation/my-routings'),
  /** POST /api/self-evaluation/routing/{routingId}/acknowledge */
  acknowledge: (routingId: string) =>
    apiUrl(`/api/self-evaluation/routing/${encodeURIComponent(toEntityId(routingId, 'routingId'))}/acknowledge`),
  /** POST /api/self-evaluation/routing/{routingId}/complete */
  complete: (routingId: string) =>
    apiUrl(`/api/self-evaluation/routing/${encodeURIComponent(toEntityId(routingId, 'routingId'))}/complete`),
} as const

// =====================================================================================
// 2. TYPED CLIENT
// =====================================================================================

/**
 * POST /api/self-evaluation/ata-records/{id}/routing
 * Builds one routing row per target shop server-side (EngineerRoutingPolicy.BuildRoutings).
 * Each shop appears EXACTLY once; duplicates are refused (ENG_DUPLICATE_TARGET_SHOP).
 */
export async function routeATARecord(ataRecordId: string, request: RouteATARecordRequest) {
  const body = {
    targets: (request.targets ?? []).map(t => ({
      shopId: toEntityId(t.shopId, 'shopId'),
      isPrimary: !!t.isPrimary,
    })),
    notes: request.notes ?? '',
  }
  const data = await postJson(SHOP_ROUTING_ROUTES.route(ataRecordId), body)
  return data as { routings: ATARecordShopRoutingResponse[]; warnings: string[] }
}

/** GET /api/self-evaluation/ata-records/{id}/routing -> rows for the Engineer's view. */
export async function listATARecordRoutings(ataRecordId: string) {
  const rows = await getList(SHOP_ROUTING_ROUTES.list(ataRecordId))
  return rows as ATARecordShopRoutingResponse[]
}

/** GET /api/self-evaluation/ata-records/{id}/routing/progress -> "2 of 3 shops complete". */
export async function getShopProgress(ataRecordId: string) {
  const data = await getJson(SHOP_ROUTING_ROUTES.progress(ataRecordId))
  return data as ShopProgressDto
}

/** GET /api/self-evaluation/my-routings -> ONLY the rows resolved to the calling STL. */
export async function getMyRoutingQueue() {
  const rows = await getList(SHOP_ROUTING_ROUTES.myQueue())
  return rows as ATARecordShopRoutingResponse[]
}

/** POST acknowledge - so a record that has been SEEN differs from one nobody opened. */
export async function acknowledgeRouting(routingId: string) {
  const data = await postJson(SHOP_ROUTING_ROUTES.acknowledge(routingId), {})
  return data as ATARecordShopRoutingResponse
}

/** POST complete - marks ONE shop's work done. The parent record may only be approved
 *  once every active row is complete (allShopsComplete). */
export async function completeRouting(routingId: string, notes?: string) {
  const data = await postJson(SHOP_ROUTING_ROUTES.complete(routingId), { notes: notes ?? '' })
  return data as ATARecordShopRoutingResponse
}

// =====================================================================================
// 3. LOCAL MIRROR OF THE POLICY  (same denial codes as the server)
// =====================================================================================

function allow(warnings?: string[]): EngineerRoutingDecisionResponse {
  return { allowed: true, denialCode: null, message: 'Allowed.', warnings: warnings ?? [] }
}

function deny(code: string, message: string): EngineerRoutingDecisionResponse {
  return { allowed: false, denialCode: code, message, warnings: [] }
}

/** Mirror of EngineerProvisioningPolicy.EngineerCreatorRoles: STL, Admin, Director. */
export const ENGINEER_CREATOR_ROLES: string[] = [
  ORG_ROLES.SpecialTeamLeader,
  ORG_ROLES.Admin,
  ORG_ROLES.Director,
]

/** Mirror of EngineerProvisioningPolicy.CanProvisionEngineer. */
export function canProvisionEngineer(
  actorRole?: string | null,
  targetRole?: string | null,
): EngineerRoutingDecisionResponse {
  const target = normalizeRole(targetRole)
  if (target !== ORG_ROLES.Engineer) {
    return deny(
      WORKFLOW_ERROR_CODES.EngTargetNotEngineer,
      'This rule governs the Engineer role only; use the standard user-creation matrix for any other role.',
    )
  }
  const actor = normalizeRole(actorRole)
  const ok = !!actor && ENGINEER_CREATOR_ROLES.some(r => r.toLowerCase() === actor.toLowerCase())
  if (!ok) {
    return deny(
      WORKFLOW_ERROR_CODES.EngNotSpecialTeamLeader,
      'The Engineer role is created and assigned by the Special Team Leader. Ask the Special Team Leader (or an Admin) to provision this account.',
    )
  }
  return allow()
}

/** Mirror of EngineerRoutingPolicy.RoutingRoles. */
export const ROUTING_ROLES: string[] = [
  ORG_ROLES.Engineer,
  ORG_ROLES.TeamLeader,
  ORG_ROLES.SpecialTeamLeader,
  ORG_ROLES.ShopManager,
  ORG_ROLES.Manager,
  ORG_ROLES.Admin,
]

/** Mirror of EngineerRoutingPolicy.CanRoute. */
export function canRoute(
  actorRole: string | null | undefined,
  additionalCsv: string | null | undefined,
  revokedCsv: string | null | undefined,
  targets?: ShopRoutingTargetDto[] | null,
): EngineerRoutingDecisionResponse {
  const actor = normalizeRole(actorRole)
  const isAdmin = actor === ORG_ROLES.Admin
  const hasPermission =
    isAdmin ||
    (actor ? effectivePermissions(actor, additionalCsv, revokedCsv).includes(ROUTE_ATA_RECORD_PERMISSION) : false) ||
    (!!actor && ROUTING_ROLES.some(r => r.toLowerCase() === actor.toLowerCase()))

  if (!hasPermission) {
    return deny(
      WORKFLOW_ERROR_CODES.EngMissingPermission,
      "Routing an ATA record to a shop requires the Engineer, Shop Team Leader, Special Team Leader, Shop Manager or Manager role, or the 'ata_record.route' permission.",
    )
  }

  const list = targets ?? []
  if (list.length === 0) {
    return deny(
      WORKFLOW_ERROR_CODES.EngNoTargetShops,
      'Select at least one target shop: an ATA record cannot be routed to nobody.',
    )
  }

  const seen: { [shopId: string]: number } = {}
  for (const t of list) seen[t.shopId] = (seen[t.shopId] ?? 0) + 1
  if (Object.values(seen).some(c => c > 1)) {
    return deny(
      WORKFLOW_ERROR_CODES.EngDuplicateTargetShop,
      'The same shop was selected more than once. Each shop must appear exactly once so its Shop Team Leader has a single, unambiguous routing row.',
    )
  }

  const warnings = list
    .filter(t => !(!!t.teamLeaderUserId && t.teamLeaderUserId > 0 && t.isTeamLeaderActive))
    .map(
      t =>
        `Shop '${t.shopName}' has no active Shop Team Leader. The routing row will be created and flagged, but nobody can action it until an STL is assigned.`,
    )

  return allow(warnings)
}

/** THE "STRICTLY" RULE - mirror of EngineerRoutingPolicy.CanTeamLeaderSee. */
export function canTeamLeaderSee(
  routing: ATARecordShopRoutingResponse | null | undefined,
  userId: number | null | undefined,
): boolean {
  if (!routing || !routing.isActive) return false
  return !!routing.resolvedTeamLeaderUserId && routing.resolvedTeamLeaderUserId === userId
}

/** Mirror of EngineerRoutingPolicy.RoutingsFor - the STL queue query, client-side twin. */
export function routingsFor(
  routings: ATARecordShopRoutingResponse[],
  teamLeaderUserId: number,
): ATARecordShopRoutingResponse[] {
  return (routings ?? []).filter(r => canTeamLeaderSee(r, teamLeaderUserId))
}

/** Mirror of EngineerRoutingPolicy.CanActOnRouting. */
export function canActOnRouting(
  routing: ATARecordShopRoutingResponse | null | undefined,
  actorUserId: number | null | undefined,
  actorRole?: string | null,
): EngineerRoutingDecisionResponse {
  if (!routing) {
    return deny(WORKFLOW_ERROR_CODES.EngNotOwningTeamLeader, 'No routing row was supplied.')
  }
  if (normalizeRole(actorRole) === ORG_ROLES.Admin) return allow()
  if (!routing.hasActiveTeamLeader) {
    return deny(
      WORKFLOW_ERROR_CODES.EngShopHasNoTeamLeader,
      `Shop '${routing.targetShopName}' has no active Shop Team Leader. Assign one before this routing can be actioned.`,
    )
  }
  if (!canTeamLeaderSee(routing, actorUserId ?? null)) {
    return deny(
      WORKFLOW_ERROR_CODES.EngNotOwningTeamLeader,
      `This record is routed to the designated Shop Team Leader of '${routing.targetShopName}'. Only that Shop Team Leader can action it.`,
    )
  }
  return allow()
}

/** Mirror of EngineerRoutingPolicy.AllShopsComplete. */
export function allShopsComplete(routings: ATARecordShopRoutingResponse[]): boolean {
  const active = (routings ?? []).filter(r => r.isActive)
  return active.length > 0 ? active.every(r => r.isComplete) : false
}

/** Mirror of EngineerRoutingPolicy.ShopProgress. */
export function shopProgress(routings: ATARecordShopRoutingResponse[]): ShopProgressDto {
  const active = (routings ?? []).filter(r => r.isActive)
  const done = active.filter(r => r.isComplete).length
  if (active.length === 0) {
    return { completed: 0, total: 0, text: 'Not routed to any shop yet.' }
  }
  const pending = active
    .filter(r => !r.isComplete)
    .map(r => r.targetShopName)
    .filter(n => !!n)
  const text =
    done === active.length
      ? `All ${active.length} shops complete.`
      : `${done} of ${active.length} shops complete - waiting on ${pending.join(', ')}.`
  return { completed: done, total: active.length, text }
}

/** Guard used by the client before sending a user id - re-exported for call sites. */
export function routingUserId(value: number | string | null | undefined): number {
  return toUserId(value)
}