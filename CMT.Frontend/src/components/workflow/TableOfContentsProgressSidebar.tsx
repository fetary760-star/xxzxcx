'use client'

import { AlertTriangle, CheckCircle2, Clock3, ListChecks } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { highLevelStatusOf } from '@/lib/workflow/toc-view-model'
import { isExternalSourceFormType } from '@/lib/workflow/status-badge'
import type { TableOfContentsItemResponse, TableOfContentsResponse } from '@/lib/workflow/workflow-types'

interface TableOfContentsProgressSidebarProps {
  toc: TableOfContentsResponse | null
}

const STATUS_ORDER = [
  'action_required',
  'revision_needed',
  'rejected',
  'in_progress',
  'draft',
  'not_started',
  'approved',
  'skipped',
  'expired',
] as const

export default function TableOfContentsProgressSidebar({
  toc,
}: TableOfContentsProgressSidebarProps) {
  if (!toc) return null

  const rows = toc.sections
    .flatMap(section => section.items ?? [])
    .filter(row => !isExternalSourceFormType(row.formType))
  const counts = new Map<string, number>()

  for (const row of rows) {
    const key = highLevelStatusOf(row).key
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  const complete = rows.filter(row => {
    const key = highLevelStatusOf(row).key
    return key === 'approved' || key === 'skipped'
  }).length
  const actionRequired = rows.filter(row => highLevelStatusOf(row).isAttention).slice(0, 3)
  const completionPercent = rows.length
    ? Math.round((complete / rows.length) * 100)
    : Math.max(0, Math.min(100, toc.completionPercent ?? 0))

  return (
    <aside className="space-y-2 rounded-md border border-slate-200 bg-slate-50/70 p-2.5">
      <div className="flex items-center gap-1.5">
        <ListChecks className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-[10px] font-bold uppercase tracking-wider text-slate-600">
          Approval progress
        </p>
        <span className="text-[11px] font-semibold tabular-nums text-slate-700">
          {complete}/{rows.length}
        </span>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-emerald-500 transition-all"
          style={{ width: `${completionPercent}%` }}
        />
      </div>

      <div className="flex flex-wrap gap-1">
        {STATUS_ORDER.map(key => {
          const count = counts.get(key) ?? 0
          if (count === 0) return null
          const style = highLevelStatusOf(
            rows.find(row => highLevelStatusOf(row).key === key) ?? null,
          )
          return (
            <Badge
              key={key}
              variant="outline"
              className={`px-1.5 py-0 text-[9px] font-medium ${style.classes}`}
            >
              {count} {style.label}
            </Badge>
          )
        })}
      </div>

      {actionRequired.length > 0 ? (
        <div className="border-t border-slate-200 pt-2">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-amber-900">
            <AlertTriangle className="h-3 w-3 text-amber-600" aria-hidden="true" />
            Needs attention
          </div>
          <ul className="space-y-0.5">
            {actionRequired.map(row => (
              <li key={row.id} className="truncate text-[10px] text-slate-700">
                {row.formTitle || row.formType}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[10px] text-slate-500">
          {complete === rows.length ? (
            <CheckCircle2 className="h-3 w-3 text-emerald-600" aria-hidden="true" />
          ) : (
            <Clock3 className="h-3 w-3 text-slate-400" aria-hidden="true" />
          )}
          {complete === rows.length ? 'All forms closed' : 'No action waiting for you'}
        </div>
      )}
    </aside>
  )
}
