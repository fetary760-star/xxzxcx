'use client'

/**
 * =====================================================================================
 * QUICK FOLLOW-UP PANELS — "My pending actions" + "Needs attention"
 * CMT.Frontend/src/components/workflow/ToCFollowUpPanels.tsx                  (NEW FILE)
 *
 * WHAT THIS FILE IS
 * -----------------
 * The two collapsible quick-follow-up lists of the Table of Contents, so a user can act
 * immediately instead of scanning every section:
 *
 *   MY PENDING ACTIONS — forms whose current step is owned by the calling user
 *   (the server flag `canIAct === true`; never re-derived locally). Each entry shows the
 *   standardized badge, the pending step label ("Pending Manager approval — Nour Adel")
 *   and the step progress ("3 / 7 steps"), and one click opens the form.
 *
 *   NEEDS ATTENTION — rejected / returned / revoked / expired forms the originator must
 *   act on (standardized `isAttention` badge). One click opens the form.
 *
 * Both panels hide automatically when their list is empty, and both collapse/expand.
 * They read EXACTLY the same TableOfContentsResponse the ToC panel already holds — no
 * extra network calls.
 * =====================================================================================
 */

import { useState } from 'react'

import { AlertTriangle, ChevronDown, ChevronRight, UserCheck } from 'lucide-react'

import { Badge } from '@/components/ui/badge'

import {
  standardStatusBadgeOf,
  pendingStepLabelOf,
  stepProgressLabelOf,
  stepProgressPercentOf,
  stepProgressToneKeyOf,
  type StandardStatusKey,
} from '@/lib/workflow/status-badge'

import type { TableOfContentsItemResponse } from '@/lib/workflow/workflow-types'

// =====================================================================================
// SHARED PIECES
// =====================================================================================

interface FollowUpPanelProps {
  title: string
  icon: React.ReactNode
  /** Amber for "mine", red for "attention". */
  accent: 'amber' | 'red'
  rows: TableOfContentsItemResponse[]
  defaultOpen?: boolean
  onOpenForm: (formType: string, instanceId: string | null) => void
}

const ACCENT = {
  amber: {
    border: 'border-amber-200',
    headerBg: 'bg-amber-50',
    title: 'text-amber-900',
    sub: 'text-amber-800',
    icon: 'text-amber-600',
    rowHover: 'hover:bg-amber-50/60',
  },
  red: {
    border: 'border-red-200',
    headerBg: 'bg-red-50',
    title: 'text-red-900',
    sub: 'text-red-800',
    icon: 'text-red-600',
    rowHover: 'hover:bg-red-50/60',
  },
} as const

/** Progress fill of the mini bar on a pending entry, per standardized tone. */
function miniBarClass(key: StandardStatusKey): string {
  switch (key) {
    case 'pending':
      return 'bg-amber-500'
    case 'rejected':
    case 'returned':
    case 'revoked':
      return 'bg-red-500'
    case 'expired':
      return 'bg-orange-500'
    case 'approved':
    case 'completed_locked':
      return 'bg-emerald-500'
    case 'skipped':
      return 'bg-sky-400'
    default:
      return 'bg-slate-400'
  }
}

function FollowUpPanel({
  title,
  icon,
  accent,
  rows,
  defaultOpen = true,
  onOpenForm,
}: FollowUpPanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  const tone = ACCENT[accent]

  if (rows.length === 0) return null

  return (
    <div className={`rounded-md border ${tone.border}`}>
      <button
        type="button"
        className={`flex w-full items-center gap-1.5 rounded-t-md px-2 py-1.5 text-left ${tone.headerBg}`}
        aria-label={open ? 'Collapse' : 'Expand'}
        onClick={() => setOpen(prev => !prev)}
      >
        {open ? (
          <ChevronDown className={`h-3.5 w-3.5 shrink-0 ${tone.icon}`} aria-hidden="true" />
        ) : (
          <ChevronRight className={`h-3.5 w-3.5 shrink-0 ${tone.icon}`} aria-hidden="true" />
        )}
        <span className={`shrink-0 ${tone.icon}`}>{icon}</span>
        <span
          className={`min-w-0 flex-1 text-[11px] font-bold uppercase tracking-wider ${tone.title}`}
        >
          {title}
        </span>
        <Badge
          variant="outline"
          className="shrink-0 border-white/60 bg-white px-1 py-0 text-[9px] font-semibold text-gray-700"
        >
          {rows.length}
        </Badge>
      </button>

      {open && (
        <ul className="divide-y divide-gray-100">
          {rows.map(row => {
            const badge = standardStatusBadgeOf(row)
            const progress = stepProgressLabelOf(row)
            const percent = stepProgressPercentOf(row)
            return (
              <li key={row.id || row.formType}>
                <button
                  type="button"
                  className={`flex w-full items-start gap-2 px-2 py-1.5 text-left transition-colors ${tone.rowHover}`}
                  onClick={() =>
                    onOpenForm(row.formType, row.formWorkflowInstanceId ?? null)
                  }
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="min-w-0 break-words text-[12px] font-medium text-gray-900 [overflow-wrap:anywhere]">
                        {row.formTitle || row.formType}
                      </span>
                      {row.formNo && (
                        <Badge
                          variant="outline"
                          className="border-gray-300 bg-white px-1 py-0 text-[9px] text-gray-600"
                        >
                          {row.formNo}
                        </Badge>
                      )}
                      <Badge className={`border px-1 py-0 text-[9px] ${badge.classes}`}>
                        {badge.label}
                      </Badge>
                    </span>
                    <span className={`mt-0.5 block text-[10px] ${tone.sub}`}>
                      {pendingStepLabelOf(row)}
                    </span>
                    {progress && (
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span className="h-1 w-16 overflow-hidden rounded-full bg-gray-200">
                          <span
                            className={`block h-full rounded-full ${miniBarClass(
                              stepProgressToneKeyOf(row),
                            )}`}
                            style={{ width: `${percent}%` }}
                          />
                        </span>
                        <span className="text-[10px] text-gray-500">{progress}</span>
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// =====================================================================================
// THE PAIR, MOUNTED TOGETHER
// =====================================================================================

export interface ToCFollowUpPanelsProps {
  /** Every live row of the folder (all sections flattened). */
  rows: TableOfContentsItemResponse[]
  /** Opens a form in the workspace. */
  onOpenForm: (formType: string, instanceId: string | null) => void
  className?: string
}

export default function ToCFollowUpPanels({
  rows,
  onOpenForm,
  className = '',
}: ToCFollowUpPanelsProps) {
  // Server flag only — `canIAct === true`. Absent flag means no.
  const mine = rows.filter(row => row.canIAct === true)
  const attention = rows.filter(row => standardStatusBadgeOf(row).isAttention)

  return (
    <div className={`space-y-2 ${className}`}>
      <FollowUpPanel
        title="My pending actions"
        icon={<UserCheck className="h-3.5 w-3.5" aria-hidden="true" />}
        accent="amber"
        rows={mine}
        onOpenForm={onOpenForm}
      />
      <FollowUpPanel
        title="Needs attention"
        icon={<AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
        accent="red"
        rows={attention}
        onOpenForm={onOpenForm}
      />
    </div>
  )
}