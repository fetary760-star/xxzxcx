/**
 * ApprovalRequestTracker — v21 (NEW FILE)
 *
 * The dashboard view behind /dashboard?view=approval-requests. The full request
 * table of the role-based tracker:
 *
 *   - a per-role overview matrix: for EACH tracked role (Director, Manager,
 *     Shop Team Leader, CAA Officer, QA Manager, Documentation) the Assigned /
 *     Pending / Completed / Reviewed / Rejected counts;
 *   - the signed-in role's request table: every request linked to its ETA reference
 *     (ATA chapter code) and Part Number for easy identification, with the current
 *     workflow step, the standardized bucket badge, and a bucket filter driven by
 *     the ?bucket= query param the sidebar counters link to.
 */
'use client'

import { useMemo } from 'react'
import { AlertTriangle, Inbox, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  REQUEST_BUCKET_CLASSES,
  REQUEST_BUCKET_LABELS,
  REQUEST_BUCKET_ORDER,
  ROLE_REQUEST_ROLE_KEYS,
  ROLE_REQUEST_ROLE_LABELS,
  classifyRequestStatus,
  requestRoleForCanonical,
  type RequestBucket,
} from '@/lib/workflow/role-request-model'
import { useRoleRequestSummary } from '@/lib/workflow/role-request-api'
import type { RoleRequestRow } from '@/lib/workflow/role-request-api'

interface Props {
  /** Canonical PascalCase role of the signed-in user; null = view hidden. */
  canonicalRole: string | null
  /** ?bucket= query param from the sidebar counters ("" = all buckets). */
  bucketFilter?: string
}

function fmtDate(value?: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

export default function ApprovalRequestTracker({ canonicalRole, bucketFilter }: Props) {
  // The canonical role must map onto a tracked profile; the hook stays disabled
  // (null) for roles outside the tracker scope.
  const trackerRole = requestRoleForCanonical(canonicalRole)
  const { summary, loading, error, refresh } = useRoleRequestSummary(trackerRole)

  /**
   * The per-role overview matrix is computed CLIENT-SIDE from the same rows, because
   * classifyRequestStatus is a pure function of (status, role) — every role's counts
   * stay consistent with every other view by construction.
   */
  const roleMatrix = useMemo(() => {
    if (!summary) return null
    const matrix: Record<string, Record<RequestBucket, number>> = {}
    for (const roleKey of ROLE_REQUEST_ROLE_KEYS) {
      matrix[roleKey] = {
        assigned: 0, pending: 0, reviewed: 0, completed: 0, rejected: 0,
      }
    }
    for (const row of summary.rows) {
      for (const roleKey of ROLE_REQUEST_ROLE_KEYS) {
        matrix[roleKey][classifyRequestStatus(row.status, roleKey)] += 1
      }
    }
    return matrix
  }, [summary])

  const filteredRows = useMemo(() => {
    const rows = summary?.rows ?? []
    if (!bucketFilter) return rows
    return rows.filter(r => r.bucket === bucketFilter)
  }, [summary, bucketFilter])

  if (!trackerRole) {
    return (
      <div className="rounded-lg border bg-white p-6 text-sm text-gray-500">
        Your role does not participate in the approval request tracker.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ===== Per-role overview matrix ===== */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Approval requests by role</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Assigned / Pending / Reviewed / Completed / Rejected counts for every tracked role
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5 mr-1.5', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Role</TableHead>
              {REQUEST_BUCKET_ORDER.map(bucket => (
                <TableHead key={bucket} className="text-xs text-center">
                  {REQUEST_BUCKET_LABELS[bucket]}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {roleMatrix
              ? ROLE_REQUEST_ROLE_KEYS.map(roleKey => (
                  <TableRow key={roleKey}>
                    <TableCell className="text-xs font-medium text-gray-800">
                      {ROLE_REQUEST_ROLE_LABELS[roleKey]}
                      {roleKey === trackerRole && (
                        <span className="ml-2 text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                          you
                        </span>
                      )}
                    </TableCell>
                    {REQUEST_BUCKET_ORDER.map(bucket => {
                      const count = roleMatrix[roleKey][bucket]
                      return (
                        <TableCell key={bucket} className="text-center">
                          <span
                            className={cn(
                              'inline-block min-w-[2rem] rounded border px-1.5 py-0.5 text-xs font-semibold tabular-nums',
                              count > 0
                                ? REQUEST_BUCKET_CLASSES[bucket]
                                : 'bg-slate-50 text-slate-400 border-slate-200',
                            )}
                          >
                            {count}
                          </span>
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))
              : Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={6}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>

      {/* ===== My requests table ===== */}
      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="text-sm font-semibold text-gray-900">
            {REQUEST_BUCKET_LABELS[bucketFilter as RequestBucket] ?? 'All'} requests —{' '}
            {ROLE_REQUEST_ROLE_LABELS[trackerRole]}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Each request links to its ETA reference (ATA chapter) and Part Number
          </p>
        </div>

        {error ? (
          <div className="flex items-center justify-center h-40 text-center">
            <div>
              <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600">{error}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={refresh}>
                Try again
              </Button>
            </div>
          </div>
        ) : loading && !summary ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <div className="text-center">
              <Inbox className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No requests in this bucket</p>
            </div>
          </div>
        ) : (
          <ScrollArea className="max-h-[480px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Request</TableHead>
                  <TableHead className="text-xs">ETA</TableHead>
                  <TableHead className="text-xs">Part No.</TableHead>
                  <TableHead className="text-xs">Current step</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Originator</TableHead>
                  <TableHead className="text-xs">Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map(row => (
                  <RequestRow key={row.instanceId} row={row} />
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}

function RequestRow({ row }: { row: RoleRequestRow }) {
  return (
    <TableRow className="hover:bg-gray-50">
      <TableCell className="py-2">
        <p className="text-xs font-medium text-gray-900 truncate max-w-[240px]" title={row.title}>
          {row.title}
        </p>
        <p className="text-[10px] text-gray-400">{row.formNo || row.formType}</p>
      </TableCell>
      <TableCell className="py-2">
        <span className="text-xs font-semibold text-gray-700 tabular-nums">{row.etaRef}</span>
      </TableCell>
      <TableCell className="py-2">
        <span className="text-xs text-gray-700 font-mono">{row.partNumber}</span>
      </TableCell>
      <TableCell className="py-2">
        <p className="text-xs text-gray-600 truncate max-w-[180px]" title={row.stepTitle}>
          {row.stepTitle || '—'}
        </p>
        {row.assigneeName && (
          <p className="text-[10px] text-gray-400">{row.assigneeName}</p>
        )}
      </TableCell>
      <TableCell className="py-2">
        <span
          className={cn(
            'inline-block rounded border px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap',
            REQUEST_BUCKET_CLASSES[row.bucket],
          )}
        >
          {REQUEST_BUCKET_LABELS[row.bucket]}
        </span>
        {row.isOverdue && (
          <span className="ml-1 inline-block rounded border px-1 py-0.5 text-[10px] font-semibold bg-orange-100 text-orange-900 border-orange-300">
            overdue
          </span>
        )}
      </TableCell>
      <TableCell className="py-2">
        <span className="text-xs text-gray-600">{row.originatorName || '—'}</span>
      </TableCell>
      <TableCell className="py-2">
        <span className="text-xs text-gray-500">{fmtDate(row.submittedAt)}</span>
      </TableCell>
    </TableRow>
  )
}