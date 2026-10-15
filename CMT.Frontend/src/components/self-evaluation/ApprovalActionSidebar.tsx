'use client'

import { useEffect, useMemo } from 'react'
import { CheckCircle2, Clock3, ClipboardCheck, RefreshCw, UserPlus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useWorkflowInbox } from '@/lib/workflow/useWorkflow'
import type { InboxItemResponse } from '@/lib/workflow/workflow-types'

interface ApprovalActionSidebarProps {
  refreshKey: number
  onOpen: (row: InboxItemResponse) => void
}

function actionLabel(row: InboxItemResponse): string {
  if (row.needsAssignment && row.canIAssign) return 'Assign'
  if (row.canIAct) return 'Review'
  if (row.canISkip) return 'Skip'
  return 'Open'
}

function waitingDays(row: InboxItemResponse): number {
  const submittedAt = row.submittedAt ? new Date(row.submittedAt).getTime() : NaN
  if (!Number.isFinite(submittedAt)) return 0
  return Math.max(0, Math.floor((Date.now() - submittedAt) / 86_400_000))
}

function queuePriority(row: InboxItemResponse): number {
  if (row.isOverdue) return 0
  if (row.canIAct) return 1
  if (row.canIAssign) return 2
  return 3
}

function displayValue(value?: string | null): string {
  return value?.trim() || 'Not provided'
}

export default function ApprovalActionSidebar({
  refreshKey,
  onOpen,
}: ApprovalActionSidebarProps) {
  const { data, loading, error, reload } = useWorkflowInbox({
    scope: 'all',
    pageSize: 500,
  }, {
    // Refresh immediately after an action via refreshKey; use a low-frequency
    // background refresh so the sidebar does not poll aggressively.
    pollIntervalMs: 60 * 60 * 1000,
  })

  useEffect(() => {
    if (refreshKey > 0) void reload()
  }, [refreshKey, reload])

  const actionable = useMemo(
    () => (data ?? [])
      .filter(row => row.canIAct || row.canIAssign || row.canISkip)
      .sort((left, right) => {
        const priorityDelta = queuePriority(left) - queuePriority(right)
        if (priorityDelta !== 0) return priorityDelta

        const leftSubmitted = left.submittedAt ? new Date(left.submittedAt).getTime() : Number.MAX_SAFE_INTEGER
        const rightSubmitted = right.submittedAt ? new Date(right.submittedAt).getTime() : Number.MAX_SAFE_INTEGER
        return leftSubmitted - rightSubmitted
      }),
    [data],
  )

  return (
    <aside className="w-[280px] shrink-0 border-r border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <ClipboardCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-900">Approval actions</h3>
            <p className="text-[10px] text-slate-500">Assigned to your role or user</p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => reload()}
          aria-label="Refresh approval actions"
          title="Refresh approval actions"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        </Button>
      </div>

      <ScrollArea className="h-[calc(100vh-148px)]">
        <div className="space-y-2 p-2">
          {loading && (
            <div className="space-y-2 p-2 text-xs text-slate-500">Loading assigned actions...</div>
          )}
          {error && !loading && (
            <div className="space-y-2 p-2 text-xs text-red-600">
              <p>Approval actions are unavailable.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => reload()}>
                Retry
              </Button>
            </div>
          )}
          {!loading && !error && actionable.length === 0 && (
            <div className="p-3 text-center text-xs text-slate-500">
              <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500" aria-hidden />
              No pending approval actions.
            </div>
          )}
          {!loading && !error && actionable.map(row => (
            <button
              key={`${row.instanceId}:${row.stepNo}`}
              type="button"
              className="w-full rounded-md border border-slate-200 bg-slate-50 p-2.5 text-left transition-colors hover:border-emerald-300 hover:bg-emerald-50"
              onClick={() => onOpen(row)}
            >
              <div className="flex items-start gap-2">
                {row.needsAssignment ? (
                  <UserPlus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden />
                ) : (
                  <ClipboardCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-xs font-semibold text-slate-900">
                    {row.title || row.formType}
                  </span>
                  <span className="mt-2 grid grid-cols-2 gap-1.5 rounded border border-emerald-200 bg-white p-1.5">
                    <span className="min-w-0">
                      <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                        ATA Chapter
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-bold text-emerald-800" title={displayValue(row.ataChapterCode ?? row.etaReference)}>
                        {displayValue(row.ataChapterCode ?? row.etaReference)}
                      </span>
                    </span>
                    <span className="min-w-0 border-l border-slate-200 pl-1.5">
                      <span className="block text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                        Part Number
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] font-bold text-slate-900" title={displayValue(row.partNumber)}>
                        {displayValue(row.partNumber)}
                      </span>
                    </span>
                  </span>
                  <span className="mt-0.5 block break-words text-[11px] text-slate-600">
                    Step {row.stepNo}: {row.stepTitle || 'Current approval step'}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-1">
                    <Badge variant="outline" className="px-1 py-0 text-[9px]">
                      {actionLabel(row)}
                    </Badge>
                    {row.ownerRoleLabel && (
                      <Badge variant="outline" className="px-1 py-0 text-[9px] text-slate-600">
                        {row.ownerRoleLabel}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={row.isOverdue
                        ? 'border-red-300 bg-red-50 px-1 py-0 text-[9px] text-red-700'
                        : 'border-slate-200 px-1 py-0 text-[9px] text-slate-600'}
                    >
                      <Clock3 className="mr-0.5 h-2.5 w-2.5" aria-hidden />
                      {waitingDays(row)}d waiting
                    </Badge>
                  </span>
                </span>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}
