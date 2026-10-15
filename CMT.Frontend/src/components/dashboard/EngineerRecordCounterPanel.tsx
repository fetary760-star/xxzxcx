/**
 * =====================================================================================
 * AMENDED v14 - PHASE 1 (FRONTEND), FEATURE 2: THE SPECIAL TEAM LEADER'S
 * ENGINEER RECORD-COUNTER TAB
 * CMT.Frontend/src/components/dashboard/EngineerRecordCounterPanel.tsx          (NEW FILE)
 *
 * WHAT IT IS
 * ----------
 * The dedicated counter tab on the Special Team Leader's dashboard. It gives the STL
 * full visibility into Engineer output by DYNAMICALLY calculating and displaying the
 * total count of New ATA Records created by each Engineer.
 *
 * HOW THE TALLY IS BUILT
 *   1. Engineers come from GET /api/users?role=Engineer (UserManagementController).
 *      If the role-filtered query answers empty (older builds), the panel falls back to
 *      listing every user and filtering role === "Engineer" client-side.
 *   2. ATA records are aggregated across ALL shops (the STL has central oversight):
 *      getShops() then getATARecordsByShop(shopId) per shop, in parallel.
 *   3. ATARecordDto.createdBy carries the creator's display name, so each record is
 *      matched to an Engineer by case-insensitive full-name / username key. Records
 *      whose creator is not an Engineer are ignored — the tab tracks ENGINEER output.
 *
 * Reached from the sidebar entry "Engineer Metrics" (/dashboard?view=engineer-metrics),
 * gated by canViewEngineerMetrics() in @/lib/nav-access — the same derived-permission
 * pattern every other sidebar entry uses, so menu and page can never disagree.
 * =====================================================================================
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, FilePlus2, RefreshCw, TrendingUp, Users } from 'lucide-react'
import { getATARecordsByShop, getShops, getUsers } from '@/lib/self-evaluation/api'
import type { UserDto } from '@/lib/self-evaluation/api'
import type { ATARecordDto, ShopDto } from '@/lib/self-evaluation/types'

/** One per-Engineer row of the counter tab. */
interface EngineerTally {
  userId: string
  fullName: string
  username: string
  shopName: string
  isActive: boolean
  totalRecords: number
  latestCreatedAt: string | null
}

/** Normalised lookup keys for matching ATARecordDto.createdBy to a user. */
function nameKeys(fullName?: string | null, username?: string | null): string[] {
  const keys: string[] = []
  const push = (v?: string | null) => {
    const k = (v ?? '').toLowerCase().replace(/\s+/g, ' ').trim()
    if (k) keys.push(k)
  }
  push(fullName)
  push(username)
  return keys
}

function latestOf(a: string | null, b: string | undefined): string | null {
  if (!b) return a
  return !a || b > a ? b : a
}

export default function EngineerRecordCounterPanel({ className }: { className?: string }) {
  const [tallies, setTallies] = useState([] as EngineerTally[])
  const [totalEngineerRecords, setTotalEngineerRecords] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loadedAt, setLoadedAt] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Engineers — role-filtered first, with a client-side fallback.
      let engineers: UserDto[] = []
      try {
        engineers = await getUsers({ role: 'Engineer' })
      } catch {
        engineers = []
      }
      if (engineers.length === 0) {
        const everyone = await getUsers()
        engineers = everyone.filter(u => (u.role ?? '').toLowerCase() === 'engineer')
      }

      // 2. All shops, then every shop's ATA records in parallel. A single shop failing
      //    must not sink the whole tally, so its records degrade to [].
      const shops: ShopDto[] = await getShops()
      const recordsByShop = await Promise.all(
        shops.map(async s => {
          try {
            return await getATARecordsByShop(s.id)
          } catch {
            return [] as ATARecordDto[]
          }
        }),
      )
      const allRecords: ATARecordDto[] = recordsByShop.flat()

      // 3. Per-engineer tallies, matched by the creator name the record carries.
      const shopNameOf = (shopId?: string | null) =>
        shops.find(s => s.id === shopId)?.name ?? '—'

      const byNameKey = new Map<string, string>()
      for (const e of engineers) {
        for (const k of nameKeys(e.fullName, e.username)) byNameKey.set(k, e.id)
      }

      const tallyById = new Map<string, EngineerTally>()
      for (const e of engineers) {
        tallyById.set(e.id, {
          userId: e.id,
          fullName: e.fullName || e.username,
          username: e.username,
          shopName: shopNameOf(e.shopId),
          isActive: e.isActive,
          totalRecords: 0,
          latestCreatedAt: null,
        })
      }

      let counted = 0
      for (const rec of allRecords) {
        const keys = nameKeys(rec.createdBy)
        const engineerId = keys.map(k => byNameKey.get(k)).find(id => !!id)
        if (!engineerId) continue
        const t = tallyById.get(engineerId)
        if (!t) continue
        t.totalRecords += 1
        t.latestCreatedAt = latestOf(t.latestCreatedAt, rec.createdAt)
        counted += 1
      }

      setTotalEngineerRecords(counted)
      setTallies(
        Array.from(tallyById.values()).sort(
          (a, b) => b.totalRecords - a.totalRecords || a.fullName.localeCompare(b.fullName),
        ),
      )
      setLoadedAt(new Date().toLocaleString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load engineer metrics.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  const topEngineer = totalEngineerRecords > 0 ? tallies[0] : null

  return (
    <div className={`space-y-4 ${className ?? ''}`}>
      {/* ========================= SUMMARY CARDS ========================= */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Users className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            Engineers tracked
          </div>
          <p className="mt-1 text-2xl font-bold text-slate-900">{tallies.length}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <FilePlus2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            New ATA Records by Engineers
          </div>
          <p className="mt-1 text-2xl font-bold text-slate-900">{totalEngineerRecords}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <TrendingUp className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            Most productive Engineer
          </div>
          <p className="mt-1 truncate text-lg font-bold text-slate-900">
            {topEngineer ? topEngineer.fullName : '—'}
          </p>
          {topEngineer ? (
            <p className="text-xs text-slate-500">{topEngineer.totalRecords} record(s) created</p>
          ) : null}
        </div>
      </div>

      {/* ========================= COUNTER TABLE ========================= */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <FilePlus2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
            <h3 className="text-sm font-semibold text-slate-800">
              New ATA Records created — per Engineer
            </h3>
          </div>
          <Button size="sm" variant="outline" onClick={() => load()} disabled={loading}>
            <RefreshCw
              className={`mr-2 h-3.5 w-3.5${loading ? ' animate-spin' : ''}`}
              aria-hidden="true"
            />
            Refresh
          </Button>
        </div>
        <p className="px-4 pt-2 text-xs text-slate-500">
          Dynamic tally of every New ATA Record each Engineer has created, across all shops.
          {loadedAt ? ` Last updated ${loadedAt}.` : ''}
        </p>

        {loading && tallies.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
            Calculating engineer tallies...
          </div>
        ) : error ? (
          <div className="m-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {error}
              <Button size="sm" variant="outline" className="ml-3" onClick={() => load()} disabled={loading}>
                Retry
              </Button>
            </span>
          </div>
        ) : tallies.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            No Engineer accounts found. Engineers are created and assigned by the Special Team
            Leader in User Management.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2 font-medium">Engineer</th>
                  <th className="px-4 py-2 font-medium">Username</th>
                  <th className="px-4 py-2 font-medium">Shop</th>
                  <th className="px-4 py-2 text-right font-medium">New ATA Records</th>
                  <th className="px-4 py-2 font-medium">Latest created</th>
                </tr>
              </thead>
              <tbody>
                {tallies.map(t => (
                  <tr key={t.userId} className="border-b border-slate-50 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-slate-800">{t.fullName}</span>
                      {!t.isActive ? (
                        <Badge
                          variant="outline"
                          className="ml-2 border-slate-300 bg-slate-50 text-slate-500"
                        >
                          inactive
                        </Badge>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{t.username || '—'}</td>
                    <td className="px-4 py-2.5 text-slate-600">{t.shopName}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span
                        className={`inline-block min-w-[2rem] rounded-full px-2 py-0.5 text-center text-xs font-semibold ${
                          t.totalRecords > 0
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-slate-50 text-slate-500'
                        }`}
                      >
                        {t.totalRecords}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {t.latestCreatedAt ? new Date(t.latestCreatedAt).toLocaleDateString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}