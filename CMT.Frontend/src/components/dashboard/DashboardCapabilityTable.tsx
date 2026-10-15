'use client'

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search, RefreshCw, Filter, ChevronLeft, ChevronRight,
  FileText, Download
} from 'lucide-react'
import {
  getATARecordsByShop,
  getShops,
} from '@/lib/self-evaluation/api'
import type { ATARecordDto, ShopDto } from '@/lib/self-evaluation/types'
import { ApprovalStatus, getApprovalStatusLabel } from '@/lib/self-evaluation/types'

interface DashboardCapabilityTableProps {
  userShopId: string
  userRole: string
}

/**
 * Calculate remaining days until expiration.
 * Expiration Rule: Capability, SD, and AD approvals expire 2 years (730 days) from their approval date.
 * Remaining Days = 730 - (TODAY() - Approval_Date)
 */
function calculateRemainingDays(approvalDate: string | null | undefined): number | null {
  if (!approvalDate) return null
  const approval = new Date(approvalDate)
  if (isNaN(approval.getTime())) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  approval.setHours(0, 0, 0, 0)
  const daysSinceApproval = Math.floor((today.getTime() - approval.getTime()) / (1000 * 60 * 60 * 24))
  return 730 - daysSinceApproval
}

/**
 * Get the expiration date (approval date + 730 days)
 */
function getExpirationDate(approvalDate: string | null | undefined): string | null {
  if (!approvalDate) return null
  const approval = new Date(approvalDate)
  if (isNaN(approval.getTime())) return null
  const expiration = new Date(approval.getTime() + 730 * 24 * 60 * 60 * 1000)
  return expiration.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Get color coding class based on remaining days
 * 🟢 Green: > 90 days remaining
 * 🟡 Yellow: ≤ 90 days remaining (Warning: Expiring Soon)
 * 🔴 Red: Expired (Below 0 days)
 */
function getDueDateColorClass(remainingDays: number | null): string {
  if (remainingDays === null) return 'bg-gray-100 text-gray-600'
  if (remainingDays <= 0) return 'bg-red-100 text-red-800 border-red-300'
  if (remainingDays <= 90) return 'bg-yellow-100 text-yellow-800 border-yellow-300'
  return 'bg-green-100 text-green-800 border-green-300'
}

function getDueDateDotColor(remainingDays: number | null): string {
  if (remainingDays === null) return 'bg-gray-400'
  if (remainingDays <= 0) return 'bg-red-500'
  if (remainingDays <= 90) return 'bg-yellow-500'
  return 'bg-green-500'
}

function getDueDateLabel(remainingDays: number | null): string {
  if (remainingDays === null) return 'N/A'
  if (remainingDays <= 0) return `Expired (${Math.abs(remainingDays)} days overdue)`
  if (remainingDays <= 90) return `${remainingDays} days left (Expiring Soon)`
  return `${remainingDays} days left`
}

/**
 * Get Capability Status label based on approval status and remaining days.
 * Maps to Excel values: ACTIVE, SUSPENDED, UNDER DEV'T, DELETED
 */
function getCapabilityStatusLabel(record: ATARecordDto): string {
  // If the record has explicit capability status info in description or other field
  // We derive from approval status
  switch (record.approvalStatus) {
    case ApprovalStatus.Approved:
      return 'ACTIVE'
    case ApprovalStatus.Rejected:
      return 'DELETED'
    case ApprovalStatus.Returned:
      return 'SUSPENDED'
    case ApprovalStatus.Draft:
    case ApprovalStatus.PendingTeamLeaderReview:
    case ApprovalStatus.PendingManagerApproval:
    case ApprovalStatus.PendingDirectorApproval:
    case ApprovalStatus.PendingQAApproval:
      return "UNDER DEV'T"
    default:
      return 'ACTIVE'
  }
}

function getCapabilityStatusBadgeClass(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-green-50 text-green-700 border-green-200'
    case 'SUSPENDED':
      return 'bg-yellow-50 text-yellow-700 border-yellow-200'
    case "UNDER DEV'T":
      return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'DELETED':
      return 'bg-red-50 text-red-700 border-red-200'
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200'
  }
}

/**
 * Get Self Evaluation Status label.
 * Maps to Excel values: COMPLETED, ON PROCESS, NOT STARTED
 */
function getSelfEvalStatusLabel(record: ATARecordDto): string {
  switch (record.approvalStatus) {
    case ApprovalStatus.Approved:
      return 'COMPLETED'
    case ApprovalStatus.Draft:
      return 'NOT STARTED'
    case ApprovalStatus.PendingTeamLeaderReview:
    case ApprovalStatus.PendingManagerApproval:
    case ApprovalStatus.PendingDirectorApproval:
    case ApprovalStatus.PendingQAApproval:
    case ApprovalStatus.Returned:
      return 'ON PROCESS'
    case ApprovalStatus.Rejected:
      return 'NOT STARTED'
    default:
      return 'NOT STARTED'
  }
}

function getSelfEvalStatusBadgeClass(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'bg-green-50 text-green-700 border-green-200'
    case 'ON PROCESS':
      return 'bg-yellow-50 text-yellow-700 border-yellow-200'
    case 'NOT STARTED':
      return 'bg-gray-50 text-gray-700 border-gray-200'
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200'
  }
}

type DueDateFilter = 'all' | 'green' | 'yellow' | 'red'

export default function DashboardCapabilityTable({ userShopId, userRole }: DashboardCapabilityTableProps) {
  const [ataRecords, setAtaRecords] = useState<ATARecordDto[]>([])
  const [shops, setShops] = useState<ShopDto[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [shopFilter, setShopFilter] = useState<string>('all')
  const [dueDateFilter, setDueDateFilter] = useState<DueDateFilter>('all')

  // Pagination
  const [page, setPage] = useState(1)
  const pageSize = 15

  const canViewAllShops = useMemo(() => {
    return ['admin', 'director', 'manager', 'qa_staff'].includes(userRole)
  }, [userRole])

  // Load shops
  const loadShops = useCallback(async () => {
    try {
      const data = await getShops()
      setShops(data)
    } catch (err) {
      console.error('Failed to load shops:', err)
    }
  }, [])

  // Load ATA records - filtered by user's shop
  const loadRecords = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      let records: ATARecordDto[] = []

      if (canViewAllShops) {
        const targetShopId = shopFilter !== 'all' ? shopFilter : ''
        if (targetShopId) {
          records = await getATARecordsByShop(targetShopId)
        } else {
          // Load from all shops
          for (const shop of shops) {
            try {
              const shopRecords = await getATARecordsByShop(shop.id)
              records.push(...shopRecords)
            } catch {
              // Skip shops that fail
            }
          }
        }
      } else if (userShopId) {
        // Shop-Based Filtering: Only load records for the logged-in user's shop
        records = await getATARecordsByShop(userShopId)
      }

      setAtaRecords(records)
    } catch (err: any) {
      const isNetworkError =
        err?.message?.toLowerCase?.().includes('failed to fetch') ||
        err instanceof TypeError
      setError(
        isNetworkError
          ? 'Cannot reach the server. Please try again later.'
          : 'Failed to load capability records.'
      )
    } finally {
      setLoading(false)
    }
  }, [canViewAllShops, shopFilter, userShopId, shops])

  useEffect(() => {
    loadShops()
  }, [loadShops])

  useEffect(() => {
    if (shops.length > 0 || !canViewAllShops) {
      loadRecords()
    }
  }, [shops, loadRecords, canViewAllShops])

  // Filtered records
  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return ataRecords.filter(r => {
      // Text search
      if (q) {
        const matchesSearch =
          (r.description || '').toLowerCase().includes(q) ||
          (r.partNumber || '').toLowerCase().includes(q) ||
          (r.manufacturer || '').toLowerCase().includes(q) ||
          (r.ataChapter || r.ataChapterCode || '').toLowerCase().includes(q) ||
          (r.revNo || '').toLowerCase().includes(q) ||
          (r.letterRefNo || '').toLowerCase().includes(q) ||
          (r.aircraft || '').toLowerCase().includes(q)
        if (!matchesSearch) return false
      }

      // Due date filter
      if (dueDateFilter !== 'all') {
        const remaining = calculateRemainingDays(r.selfEvaluationDate)
        if (dueDateFilter === 'green' && (remaining === null || remaining <= 90)) return false
        if (dueDateFilter === 'yellow' && (remaining === null || remaining <= 0 || remaining > 90)) return false
        if (dueDateFilter === 'red' && (remaining === null || remaining > 0)) return false
      }

      return true
    })
  }, [ataRecords, searchQuery, dueDateFilter])

  // Pagination
  const total = filteredRecords.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const pageItems = filteredRecords.slice((page - 1) * pageSize, page * pageSize)

  useEffect(() => {
    if (page > totalPages) setPage(1)
  }, [totalPages, page])

  // Export to CSV - aligned with Excel columns
  const handleExport = () => {
    const headers = [
      'Item', 'DESCRIPTION', 'P/N', 'ATA', 'CMM REV. No.',
      'CMM REV DATE', 'MFR', 'A/C',
      'CAPABILITY STATUS', 'SELF EVALUATION DATE', 'SELF EVAL. STATUS',
      'DUE DATE', 'Remaining Days'
    ]
    const rows = filteredRecords.map((r, idx) => {
      const remaining = calculateRemainingDays(r.selfEvaluationDate)
      const expDate = getExpirationDate(r.selfEvaluationDate)
      const capabilityStatus = getCapabilityStatusLabel(r)
      const selfEvalStatus = getSelfEvalStatusLabel(r)
      return [
        idx + 1,
        r.description,
        r.partNumber,
        r.ataChapter || r.ataChapterCode || '',
        r.revNo || '',
        r.cmmRevDate || '',
        r.manufacturer,
        r.aircraft,
        capabilityStatus,
        r.selfEvaluationDate ? new Date(r.selfEvaluationDate).toLocaleDateString() : '',
        selfEvalStatus,
        expDate || 'N/A',
        remaining ?? 'N/A',
      ]
    })

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `capability_dashboard_${new Date().toISOString().split('T')[0]}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">
          Capability Records & Expiration Tracking
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            className="flex items-center gap-1.5"
            disabled={filteredRecords.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadRecords}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex items-center gap-3 flex-wrap bg-white p-3 rounded-lg border border-gray-200">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by Description, P/N, ATA, MFR, Letter Ref..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1) }}
            className="pl-9 h-9 text-sm"
          />
        </div>

        <Select value={dueDateFilter} onValueChange={(v) => { setDueDateFilter(v as DueDateFilter); setPage(1) }}>
          <SelectTrigger className="w-[180px] h-9 text-sm">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
            <SelectValue placeholder="Due Date Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Records</SelectItem>
            <SelectItem value="green">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                Up to Date (&gt;90 days)
              </span>
            </SelectItem>
            <SelectItem value="yellow">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                Expiring Soon (≤90 days)
              </span>
            </SelectItem>
            <SelectItem value="red">
              <span className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                Expired
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {canViewAllShops && (
          <Select value={shopFilter} onValueChange={(v) => { setShopFilter(v); setPage(1) }}>
            <SelectTrigger className="w-[200px] h-9 text-sm">
              <SelectValue placeholder="All Shops" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shops</SelectItem>
              {shops.map(shop => (
                <SelectItem key={shop.id} value={shop.id}>{shop.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Color Legend */}
      <div className="flex items-center gap-6 px-3 py-2 bg-gray-50 rounded-lg border border-gray-200">
        <span className="text-xs font-semibold text-gray-600 uppercase">Due Date Legend:</span>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500"></span>
          <span className="text-xs text-gray-600">&gt; 90 days (Up to Date)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
          <span className="text-xs text-gray-600">≤ 90 days (Expiring Soon)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-red-500"></span>
          <span className="text-xs text-gray-600">Expired (Past Due)</span>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && !error && (
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600 mx-auto mb-3"></div>
            <p className="text-gray-500 text-sm">Loading capability records...</p>
          </div>
        </div>
      )}

      {/* Table - Letter Ref: No is intentionally omitted from the dashboard view. */}
      {!loading && !error && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50/80">
                  <TableHead className="font-semibold text-xs text-gray-600 uppercase tracking-wider w-[50px] text-center">Item</TableHead>
                  <TableHead className="font-semibold text-xs text-gray-600 uppercase tracking-wider min-w-[180px]">DESCRIPTION</TableHead>
                  <TableHead className="font-semibold text-xs text-gray-600 uppercase tracking-wider min-w-[160px]">P/N</TableHead>
                  <TableHead className="font-semibold text-xs text-gray-600 uppercase tracking-wider w-[90px]">ATA</TableHead>
                  <TableHead className="font-semibold text-xs text-gray-600 uppercase tracking-wider w-[100px] text-center">CMM REV. No.</TableHead>
                  <TableHead className="font-semibold text-xs text-gray-600 uppercase tracking-wider w-[110px]">CMM REV DATE</TableHead>
                  <TableHead className="font-semibold text-xs text-gray-600 uppercase tracking-wider w-[100px]">MFR</TableHead>
                  <TableHead className="font-semibold text-xs text-gray-600 uppercase tracking-wider w-[70px] text-center">A/C</TableHead>
                  <TableHead className="font-semibold text-xs text-gray-600 uppercase tracking-wider w-[130px] text-center">CAPABILITY STATUS</TableHead>
                  <TableHead className="font-semibold text-xs text-gray-600 uppercase tracking-wider w-[140px] text-center">SELF EVALUATION DATE</TableHead>
                  <TableHead className="font-semibold text-xs text-gray-600 uppercase tracking-wider w-[130px] text-center">SELF EVAL. STATUS</TableHead>
                  <TableHead className="font-semibold text-xs text-gray-600 uppercase tracking-wider w-[160px] text-center">DUE DATE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="h-10 w-10 text-gray-300" />
                        <p className="text-sm text-gray-500">No capability records found.</p>
                        <p className="text-xs text-gray-400">
                          {userShopId
                            ? 'No ATA records exist for your shop yet.'
                            : 'Please ensure you are assigned to a shop.'}
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  pageItems.map((record, index) => {
                    const remainingDays = calculateRemainingDays(record.selfEvaluationDate)
                    const expirationDate = getExpirationDate(record.selfEvaluationDate)
                    const dueDateColor = getDueDateColorClass(remainingDays)
                    const dotColor = getDueDateDotColor(remainingDays)
                    const dueDateLabel = getDueDateLabel(remainingDays)
                    const capabilityStatus = getCapabilityStatusLabel(record)
                    const selfEvalStatus = getSelfEvalStatusLabel(record)

                    return (
                      <TableRow
                        key={record.id}
                        className="hover:bg-gray-50/50 transition-colors"
                      >
                        {/* Item (row number) */}
                        <TableCell className="text-xs text-gray-600 font-mono text-center">
                          {(page - 1) * pageSize + index + 1}
                        </TableCell>

                        {/* DESCRIPTION */}
                        <TableCell>
                          <span className="text-sm text-gray-700 line-clamp-2 max-w-[220px]">
                            {record.description || 'N/A'}
                          </span>
                        </TableCell>

                        {/* P/N */}
                        <TableCell>
                          <span className="text-sm font-medium text-gray-900 line-clamp-2 max-w-[200px]">
                            {record.partNumber || 'N/A'}
                          </span>
                        </TableCell>

                        {/* ATA */}
                        <TableCell>
                          <span className="text-sm font-mono text-gray-700">
                            {record.ataChapter || record.ataChapterCode || 'N/A'}
                          </span>
                        </TableCell>

                        {/* CMM REV. No. */}
                        <TableCell className="text-center">
                          <span className="text-sm text-gray-600">
                            {record.revNo || '—'}
                          </span>
                        </TableCell>

                        {/* CMM REV DATE */}
                        <TableCell>
                          <span className="text-xs text-gray-500">
                            {record.cmmRevDate
                              ? (typeof record.cmmRevDate === 'string' && record.cmmRevDate.includes('T')
                                ? new Date(record.cmmRevDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                                : record.cmmRevDate)
                              : '—'}
                          </span>
                        </TableCell>

                        {/* MFR (Manufacturer) */}
                        <TableCell>
                          <span className="text-sm text-gray-600">
                            {record.manufacturer || '—'}
                          </span>
                        </TableCell>

                        {/* A/C (Aircraft) */}
                        <TableCell className="text-center">
                          <span className="text-sm text-gray-600">
                            {record.aircraft || '—'}
                          </span>
                        </TableCell>

                        {/* CAPABILITY STATUS */}
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold ${getCapabilityStatusBadgeClass(capabilityStatus)}`}
                          >
                            {capabilityStatus}
                          </Badge>
                        </TableCell>

                        {/* SELF EVALUATION DATE */}
                        <TableCell className="text-center">
                          <span className="text-xs text-gray-500">
                            {record.selfEvaluationDate
                              ? new Date(record.selfEvaluationDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                              : 'NIL'}
                          </span>
                        </TableCell>

                        {/* SELF EVAL. STATUS */}
                        <TableCell className="text-center">
                          <Badge
                            variant="outline"
                            className={`text-[10px] font-semibold ${getSelfEvalStatusBadgeClass(selfEvalStatus)}`}
                          >
                            {selfEvalStatus}
                          </Badge>
                        </TableCell>

                        {/* DUE DATE - Color Coded */}
                        <TableCell className="text-center">
                          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs font-semibold ${dueDateColor}`}>
                            <span className={`w-2 h-2 rounded-full ${dotColor}`}></span>
                            <div className="flex flex-col items-start">
                              <span>{expirationDate || 'N/A'}</span>
                              <span className="text-[10px] font-normal opacity-80">
                                {dueDateLabel}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50/50">
              <div className="text-xs text-gray-500">
                Showing {Math.min((page - 1) * pageSize + 1, total)}–{Math.min(page * pageSize, total)} of {total} records
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="h-8 px-3 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                  Prev
                </Button>
                <span className="text-xs text-gray-600 font-medium">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="h-8 px-3 text-xs"
                >
                  Next
                  <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}