'use client'

import { useEffect, useMemo, useState } from 'react'
import { BarChart3, Loader2, RefreshCw } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useAuth } from '@/lib/auth-context'
import { getATARecordsByShop, getShops } from '@/lib/self-evaluation/api'
import type { ATARecordDto, ShopDto } from '@/lib/self-evaluation/types'
import { ApprovalStatus } from '@/lib/self-evaluation/types'
import { OVERSIGHT_ROLES, toCanonicalRole } from '@/lib/nav-access'

const REPORT_FILTERS = ['All', 'Pending', 'In-Progress', 'Completed', 'Rejected', 'Under Development'] as const
type ReportFilter = (typeof REPORT_FILTERS)[number]

type ReportStatus = Exclude<ReportFilter, 'All'>

function reportStatusOf(status: ApprovalStatus): ReportStatus {
  if (status === ApprovalStatus.Draft) return 'Under Development'
  if (status === ApprovalStatus.Rejected || status === ApprovalStatus.Returned || status === ApprovalStatus.Revoked) return 'Rejected'
  if (status === ApprovalStatus.PendingAssignment) return 'In-Progress'
  if (status === ApprovalStatus.Approved || status === ApprovalStatus.Completed || status === ApprovalStatus.Locked || status === ApprovalStatus.Skipped) return 'Completed'
  return 'Pending'
}

function statusClasses(status: ReportStatus): string {
  switch (status) {
    case 'Completed': return 'border-emerald-200 bg-emerald-50 text-emerald-800'
    case 'Rejected': return 'border-red-200 bg-red-50 text-red-800'
    case 'In-Progress': return 'border-sky-200 bg-sky-50 text-sky-800'
    case 'Under Development': return 'border-slate-200 bg-slate-50 text-slate-700'
    default: return 'border-amber-200 bg-amber-50 text-amber-800'
  }
}

function dateLabel(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

export default function CapabilityReports() {
  const { user } = useAuth()
  const [records, setRecords] = useState<ATARecordDto[]>([])
  const [shops, setShops] = useState<ShopDto[]>([])
  const [filter, setFilter] = useState<ReportFilter>('All')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const availableShops = await getShops()
      setShops(availableShops)
      const role = toCanonicalRole(user?.role)
      const canSeeAllShops = !!role && OVERSIGHT_ROLES.includes(role)
      const userShopId = user?.shopId ? String(user.shopId) : ''
      const targetShops = canSeeAllShops
        ? availableShops
        : availableShops.filter(shop => String(shop.id) === userShopId)
      const grouped = await Promise.all(targetShops.map(shop => getATARecordsByShop(String(shop.id))))
      const unique = new Map<string, ATARecordDto>()
      grouped.flat().forEach(record => unique.set(record.id, record))
      setRecords(Array.from(unique.values()))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Capability reports are unavailable.')
      setRecords([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [user?.role, user?.shopId])

  const visibleRecords = useMemo(
    () => filter === 'All' ? records : records.filter(record => reportStatusOf(record.approvalStatus) === filter),
    [filter, records],
  )

  return (
    <section className="flex h-full min-h-0 flex-col bg-slate-50">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-md bg-emerald-100 p-2 text-emerald-700">
            <BarChart3 className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900">ATA Capability Reports</h1>
            <p className="text-xs text-slate-500">Track capability evaluation status by ATA record.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={value => setFilter(value as ReportFilter)}>
            <SelectTrigger className="h-9 w-[190px] bg-white text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORT_FILTERS.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => void load()} disabled={loading} aria-label="Refresh capability reports">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        <div className="overflow-hidden rounded-lg border bg-white shadow-sm">
          {loading ? (
            <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading capability reports...</div>
          ) : error ? (
            <div className="p-10 text-center text-sm text-red-700">{error}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead>P/N</TableHead>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>ATA</TableHead>
                  <TableHead>A/C</TableHead>
                  <TableHead>Self-Evaluation Date</TableHead>
                  <TableHead>CMM Rev Date</TableHead>
                  <TableHead>Rev. No</TableHead>
                  <TableHead>Shop Capability</TableHead>
                  <TableHead>Responsible Workshop</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRecords.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="p-10 text-center text-sm text-slate-500">No capability evaluations match this status.</TableCell></TableRow>
                ) : visibleRecords.map(record => {
                  const status = reportStatusOf(record.approvalStatus)
                  return (
                    <TableRow key={record.id}>
                      <TableCell className="max-w-[240px] whitespace-normal font-medium">{record.description || '—'}</TableCell>
                      <TableCell>{record.partNumber || '—'}</TableCell>
                      <TableCell>{record.manufacturer || '—'}</TableCell>
                      <TableCell>{record.ataChapter || record.ataChapterNumber || '—'}</TableCell>
                      <TableCell>{record.aircraft || '—'}</TableCell>
                      <TableCell>{dateLabel(record.selfEvaluationDate)}</TableCell>
                      <TableCell>{dateLabel(record.cmmRevDate)}</TableCell>
                      <TableCell>{record.revNo || '—'}</TableCell>
                      <TableCell>{record.authority || '—'}</TableCell>
                      <TableCell>{record.responsibleWorkshop || '—'}</TableCell>
                      <TableCell><Badge variant="outline" className={`whitespace-nowrap ${statusClasses(status)}`}>{status}</Badge></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">Showing {visibleRecords.length} of {records.length} ATA evaluations.</p>
      </div>
    </section>
  )
}
