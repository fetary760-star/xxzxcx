/**
 * RoleRequestSidebarCounters — v21 (NEW FILE)
 *
 * The sidebar section of the role-based approval request tracker:
 *   "For each role, including Director, Manager, Shop Team Leader, CAA Officer,
 *    QA Manager, and Documentation, the sidebar displays the count of Assigned,
 *    Pending, Completed, Reviewed, and Rejected requests."
 *
 * Renders ONLY for the six tracked roles (see requestRoleForCanonical). Shows the
 * signed-in role's five standardized bucket counts, live from GET /api/workflow/inbox,
 * each linking to /dashboard?view=approval-requests&bucket=<bucket> for the full
 * request table with ETA and Part Number columns.
 */
'use client'

import Link from 'next/link'
import { Inbox, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  REQUEST_BUCKET_DOT_CLASSES,
  REQUEST_BUCKET_LABELS,
  REQUEST_BUCKET_ORDER,
  requestRoleForCanonical,
  type RequestBucket,
} from '@/lib/workflow/role-request-model'
import { useRoleRequestSummary } from '@/lib/workflow/role-request-api'

interface Props {
  /** Canonical PascalCase role from nav-access.toCanonicalRole(). */
  canonicalRole: string | null
  /** True when the sidebar is collapsed — render nothing, the panel needs width. */
  collapsed: boolean
}

/** Buckets that get a highlighted counter chip (action-required first). */
const ALERT_BUCKETS: ReadonlySet<RequestBucket> = new Set(['assigned', 'rejected'])

export default function RoleRequestSidebarCounters({ canonicalRole, collapsed }: Props) {
  // Only tracked roles (Director, Manager, Shop Team Leader, CAA Officer, QA
  // Manager, Documentation) get counters; the hook stays disabled otherwise.
  const trackerRole = requestRoleForCanonical(canonicalRole)
  const { summary, loading, error, refresh } = useRoleRequestSummary(trackerRole)

  // Not a tracked role -> the tracker stays completely hidden.
  if (!trackerRole) return null

  if (collapsed) return null

  const counts = summary?.counts

  return (
    <div className="px-3 py-3 border-t border-white/10 flex-shrink-0">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/50 flex items-center gap-1.5">
          <Inbox className="h-3 w-3" />
          My Requests
        </p>
        <button
          type="button"
          onClick={refresh}
          title="Refresh request counts"
          aria-label="Refresh request counts"
          className="text-white/40 hover:text-white transition-colors"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
        </button>
      </div>

      {error ? (
        <p className="text-[10px] text-red-300 leading-snug">
          Request counts unavailable — check the workflow service.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {REQUEST_BUCKET_ORDER.map(bucket => {
            const count = counts?.[bucket] ?? 0
            return (
              <Link
                key={bucket}
                href={`/dashboard?view=approval-requests&bucket=${bucket}`}
                title={`${count} ${REQUEST_BUCKET_LABELS[bucket]} request(s)`}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2 py-1 bg-white/5 hover:bg-white/10 transition-colors',
                  bucket === 'completed' && 'col-span-2',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full flex-shrink-0',
                    REQUEST_BUCKET_DOT_CLASSES[bucket],
                  )}
                />
                <span className="text-[10px] text-white/60 truncate flex-1">
                  {REQUEST_BUCKET_LABELS[bucket]}
                </span>
                <span
                  className={cn(
                    'text-[11px] font-semibold tabular-nums px-1.5 rounded',
                    ALERT_BUCKETS.has(bucket) && count > 0
                      ? 'text-white bg-white/20'
                      : 'text-white/80',
                  )}
                >
                  {count}
                </span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}