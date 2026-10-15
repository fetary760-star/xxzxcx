/**
 * =====================================================================================
 * AMENDED v14 - PHASE 1 (FRONTEND), FEATURE 3: THE SHOP ROUTING PANEL
 * CMT.Frontend/src/components/self-evaluation/RoutingPanel.tsx                 (NEW FILE)
 * Copy to: CMT.Frontend/src/components/self-evaluation/RoutingPanel.tsx
 *
 * WHAT IT IS
 * ----------
 * The UI for EngineerRoutingPolicy.cs (CMT.Domain/Models/SelfEvaluation/):
 *   LEFT  - "Route to shops": an Engineer/TL picks the target shops for an ATA record.
 *           canRoute() pre-flights the SAME denial codes the server returns, and a shop
 *           with no active Shop Team Leader surfaces as a WARNING, never a silent drop.
 *   RIGHT - "My routing queue": a Shop Team Leader sees ONLY the rows resolved to them
 *           (the word STRICTLY - canTeamLeaderSee), and may acknowledge or complete each.
 *           The "x of y shops complete" line is shopProgress(), the client twin of the
 *           server guard that blocks the final approval until every active row is done.
 *
 * AMENDED v14.1 (defect fixes, no behaviour change):
 *   - the three array states were destructured from a bare `[]` literal instead of
 *     calling useState(), which crashed the panel on mount and broke the type check;
 *   - queue rows read fields that do not exist on ATARecordShopRoutingResponse
 *     (isAcknowledged / ataRecordTitle / ataChapterCode / createdAt) - they now use the
 *     real contract fields (acknowledgedAt / ataRecordId / routedAt);
 *   - the queue-visibility check now compares CANONICAL roles (normalizeRole output)
 *     against ORG_ROLES, so legacy snake_case session roles resolve correctly.
 *
 * It calls the typed client in shop-routing.ts, which rides the existing
 * /api/self-evaluation catch-all proxy - no new Next.js route file is required.
 * =====================================================================================
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Inbox,
  Loader2,
  MapPin,
  Send,
  Users,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import { apiUrl } from '@/lib/workflow/workflow-config'
import { getJson } from '@/lib/workflow/workflow-transport'
import { ORG_ROLES, normalizeRole } from '@/lib/role-hierarchy'
import {
  type ATARecordShopRoutingResponse,
  type ShopProgressDto,
  type ShopRoutingTargetDto,
} from '@/lib/workflow/workflow-types'
import {
  allShopsComplete,
  canActOnRouting,
  canRoute,
  canTeamLeaderSee,
  completeRouting,
  acknowledgeRouting,
  getMyRoutingQueue,
  getShopProgress,
  listATARecordRoutings,
  routeATARecord,
  shopProgress,
} from '@/lib/workflow/shop-routing'

/** Minimal shape of a shop row from GET /api/self-evaluation/shops. */
interface ShopRow {
  id: string
  name?: string | null
  shopName?: string | null
  teamLeaderUserId?: number | null
  teamLeaderName?: string | null
  isTeamLeaderActive?: boolean | null
}

function shopDisplayName(s: ShopRow): string {
  return s.name || s.shopName || s.id
}

/** Short, human-readable record label for queue rows (the row DTO carries only ids). */
function recordLabel(r: ATARecordShopRoutingResponse): string {
  const id = r.ataRecordId || r.id
  return id.length > 12 ? `${id.slice(0, 12)}…` : id
}

interface RoutingPanelProps {
  /** When present, the "Route to shops" tab is enabled for this record. */
  ataRecordId?: string | null
  recordTitle?: string | null
  className?: string
}

export default function RoutingPanel({ ataRecordId, recordTitle, className }: RoutingPanelProps) {
  const { user } = useAuth()
  const { toast } = useToast()

  const userId = Number(user?.userId ?? 0)
  // normalizeRole resolves every legacy spelling to the canonical PascalCase role, so
  // comparisons below are safe for snake_case / display-name session roles.
  const role = normalizeRole(user?.role ?? null)
  /** Roles allowed to OPEN the queue tab; the server still filters rows STRICTLY. */
  const canSeeQueue =
    role === ORG_ROLES.TeamLeader || role === ORG_ROLES.ShopManager || role === ORG_ROLES.Admin
  const canRouteTab = !!ataRecordId

  // ---- route tab state ---------------------------------------------------------------
  const [shops, setShops] = useState([] as ShopRow[])
  const [selected, setSelected] = useState({} as { [shopId: string]: boolean })
  const [notes, setNotes] = useState('')
  const [routings, setRoutings] = useState([] as ATARecordShopRoutingResponse[])
  const [progress, setProgress] = useState(null as ShopProgressDto | null)
  const [routingBusy, setRoutingBusy] = useState(false)
  const [listBusy, setListBusy] = useState(false)

  // ---- queue tab state ---------------------------------------------------------------
  const [queue, setQueue] = useState([] as ATARecordShopRoutingResponse[])
  const [queueBusy, setQueueBusy] = useState(false)
  const [actingId, setActingId] = useState('')

  const loadShops = useCallback(async () => {
    try {
      const rows = await getJson(apiUrl('/api/self-evaluation/shops'))
      setShops(Array.isArray(rows) ? (rows as ShopRow[]) : [])
    } catch {
      // A missing shops endpoint must not break the panel; routing stays disabled.
      setShops([])
    }
  }, [])

  const loadRoutings = useCallback(async () => {
    if (!ataRecordId) return
    setListBusy(true)
    try {
      const rows = await listATARecordRoutings(ataRecordId)
      setRoutings(rows)
      try {
        setProgress(await getShopProgress(ataRecordId))
      } catch {
        setProgress(shopProgress(rows))
      }
    } catch {
      setRoutings([])
      setProgress(null)
    } finally {
      setListBusy(false)
    }
  }, [ataRecordId])

  const loadQueue = useCallback(async () => {
    if (!canSeeQueue) return
    setQueueBusy(true)
    try {
      setQueue(await getMyRoutingQueue())
    } catch {
      setQueue([])
    } finally {
      setQueueBusy(false)
    }
  }, [canSeeQueue])

  useEffect(() => {
    loadShops().catch(() => {})
    loadRoutings().catch(() => {})
    loadQueue().catch(() => {})
  }, [loadShops, loadRoutings, loadQueue])

  const toggleShop = (shopId: string) => {
    setSelected(prev => ({ ...prev, [shopId]: !prev[shopId] }))
  }

  const handleRoute = async () => {
    if (!ataRecordId) return
    const targets: ShopRoutingTargetDto[] = shops
      .filter(s => selected[s.id])
      .map(s => ({
        shopId: s.id,
        isPrimary: false,
        shopName: shopDisplayName(s),
        teamLeaderUserId: s.teamLeaderUserId ?? null,
        teamLeaderName: s.teamLeaderName ?? '',
        isTeamLeaderActive: !!s.isTeamLeaderActive,
      }))

    const decision = canRoute(
      user?.role ?? null,
      (user as { additionalPermissions?: string | null })?.additionalPermissions ?? null,
      (user as { revokedPermissions?: string | null })?.revokedPermissions ?? null,
      targets,
    )
    if (!decision.allowed) {
      toast({ title: 'Routing blocked', description: decision.message, variant: 'destructive' })
      return
    }
    for (const w of decision.warnings) {
      toast({ title: 'Routing warning', description: w, variant: 'default' })
    }

    setRoutingBusy(true)
    try {
      const result = await routeATARecord(ataRecordId, { targets, notes })
      toast({
        title: 'Routed',
        description: `${(result.routings ?? []).length} routing rows created. Each row is visible STRICTLY to its designated Shop Team Leader.`,
      })
      setSelected({})
      setNotes('')
      await loadRoutings()
    } catch (error) {
      toast({
        title: 'Routing failed',
        description: error instanceof Error ? error.message : 'The record could not be routed.',
        variant: 'destructive',
      })
    } finally {
      setRoutingBusy(false)
    }
  }

  const handleAction = async (row: ATARecordShopRoutingResponse, action: 'ack' | 'complete') => {
    const decision = canActOnRouting(row, userId, user?.role ?? null)
    if (!decision.allowed) {
      toast({ title: 'Action blocked', description: decision.message, variant: 'destructive' })
      return
    }
    setActingId(row.id)
    try {
      if (action === 'ack') await acknowledgeRouting(row.id)
      else await completeRouting(row.id)
      toast({
        title: action === 'ack' ? 'Acknowledged' : 'Completed',
        description: `${row.targetShopName}: ${action === 'ack' ? 'marked as seen.' : 'shop work is done.'}`,
      })
      await Promise.all([loadQueue(), loadRoutings()])
    } catch (error) {
      toast({
        title: 'Action failed',
        description: error instanceof Error ? error.message : 'The routing row could not be updated.',
        variant: 'destructive',
      })
    } finally {
      setActingId('')
    }
  }

  const selectedCount = Object.values(selected).filter(Boolean).length

  return (
    <div className={`space-y-4 ${className ?? ''}`}>
      {/* ============================ ROUTE TAB ============================ */}
      {canRouteTab ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <Send className="h-4 w-4 text-blue-600" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-800">
              Route {recordTitle ? `“${recordTitle}”` : 'this record'} to shops
            </h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Each shop gets ONE row, assigned STRICTLY to its designated Shop Team Leader. A shop
            without an active STL is flagged, never silently dropped.
          </p>

          <div className="mt-3 grid max-h-56 gap-1 overflow-y-auto rounded-md border border-slate-200 p-2">
            {shops.length === 0 ? (
              <p className="p-2 text-xs text-slate-500">No shops available.</p>
            ) : (
              shops.map(s => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-start gap-2 rounded px-2 py-1 hover:bg-slate-50"
                >
                  <Checkbox
                    checked={!!selected[s.id]}
                    onCheckedChange={() => toggleShop(s.id)}
                    aria-label={`Route to ${shopDisplayName(s)}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-slate-800">
                      {shopDisplayName(s)}
                    </span>
                    <span className="block text-[10px] text-slate-500">
                      {s.teamLeaderName
                        ? `STL: ${s.teamLeaderName}${s.isTeamLeaderActive === false ? ' (inactive)' : ''}`
                        : 'No Shop Team Leader assigned'}
                    </span>
                  </span>
                  {!s.teamLeaderName || s.isTeamLeaderActive === false ? (
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                      <AlertTriangle className="mr-1 h-2.5 w-2.5" aria-hidden="true" />
                      no active STL
                    </Badge>
                  ) : null}
                </label>
              ))
            )}
          </div>

          <div className="mt-3 space-y-2">
            <Label className="text-xs font-medium">Routing notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Why these shops? Any coordination instructions..."
              rows={2}
            />
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-slate-500">{selectedCount} shop(s) selected</span>
            <Button size="sm" onClick={handleRoute} disabled={routingBusy || selectedCount === 0}>
              {routingBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Route to {selectedCount} shop(s)
            </Button>
          </div>

          {/* existing rows + progress */}
          {listBusy ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Loading routings...
            </div>
          ) : routings.length > 0 ? (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {progress ? progress.text : shopProgress(routings).text}
                {allShopsComplete(routings) ? (
                  <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
                    <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
                    all shops complete
                  </Badge>
                ) : null}
              </div>
              <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
                {routings.map(r => (
                  <li key={r.id} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                    <span className="min-w-0">
                      <span className="font-medium text-slate-800">{r.targetShopName}</span>
                      <span className="ml-2 text-slate-500">
                        {r.resolvedTeamLeaderName || 'unassigned STL'}
                      </span>
                    </span>
                    <span className="flex items-center gap-1">
                      {r.isComplete ? (
                        <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
                          complete
                        </Badge>
                      ) : r.acknowledgedAt ? (
                        <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-800">
                          acknowledged
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">
                          pending
                        </Badge>
                      )}
                      {!r.hasActiveTeamLeader ? (
                        <Badge variant="outline" className="border-red-300 bg-red-50 text-red-800">
                          no STL
                        </Badge>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ============================ QUEUE TAB ============================ */}
      {canSeeQueue ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-blue-600" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-800">My routing queue</h3>
              <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                {queue.length}
              </Badge>
            </div>
            <Button size="sm" variant="outline" onClick={loadQueue} disabled={queueBusy}>
              {queueBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
              Refresh
            </Button>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Records routed STRICTLY to you as the designated Shop Team Leader.
          </p>

          {queueBusy && queue.length === 0 ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              Loading your queue...
            </div>
          ) : queue.length === 0 ? (
            <div className="mt-3 rounded-md border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
              Nothing is routed to you right now.
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100 rounded-md border border-slate-200">
              {queue.map(r => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-slate-800">
                      {r.targetShopName} — record {recordLabel(r)}
                    </span>
                    <span className="block text-[10px] text-slate-500">
                      {r.routedAt ? `Routed ${new Date(r.routedAt).toLocaleDateString()}` : ''}
                      {r.resolvedTeamLeaderName ? ` · STL: ${r.resolvedTeamLeaderName}` : ''}
                      {!canTeamLeaderSee(r, userId) && role !== ORG_ROLES.Admin
                        ? ' · not yours'
                        : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {r.isComplete ? (
                      <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
                        <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden="true" />
                        complete
                      </Badge>
                    ) : (
                      <>
                        {!r.acknowledgedAt ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actingId === r.id}
                            onClick={() => handleAction(r, 'ack')}
                          >
                            <Clock className="mr-1 h-3 w-3" aria-hidden="true" />
                            Acknowledge
                          </Button>
                        ) : (
                          <Badge variant="outline" className="border-sky-300 bg-sky-50 text-sky-800">
                            acknowledged
                          </Badge>
                        )}
                        <Button
                          size="sm"
                          className="bg-emerald-600 text-white hover:bg-emerald-700"
                          disabled={actingId === r.id}
                          onClick={() => handleAction(r, 'complete')}
                        >
                          {actingId === r.id ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                          ) : (
                            <Users className="mr-1 h-3 w-3" aria-hidden="true" />
                          )}
                          Complete
                        </Button>
                      </>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  )
}