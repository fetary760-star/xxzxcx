/**
 * =====================================================================================
 * AMENDED v14 - PHASE 1 (FRONTEND), FEATURE 2: THE OVERALL PROGRESS BAR
 * CMT.Frontend/src/components/self-evaluation/TocProgressBar.tsx               (NEW FILE)
 * Copy to: CMT.Frontend/src/components/self-evaluation/TocProgressBar.tsx
 *
 * WHAT IT IS
 * ----------
 * The "clean, corporate" progress header the requirement asks for under the Table of
 * Contents:
 *   - a visual progress bar for the overall completion percentage;
 *   - text stating the NUMBER OF REMAINING APPROVALS required;
 *   - the headline answer to "which role is causing an approval hold-up" (the primary
 *     blocking role, how many forms it holds, and the longest wait).
 *
 * It renders a FolderProgressViewDto - the server tree when the ToCProgressCalculator
 * build is deployed, or the offline twin from buildFolderProgressView() otherwise. The
 * component does NOT recompute anything; it only presents the numbers, exactly as the
 * domain layer intends.
 * =====================================================================================
 */
'use client'

import { Progress } from '@/components/ui/progress'
import { StatusBadgeTone, type FolderProgressViewDto } from '@/lib/workflow/workflow-types'
import { AlertTriangle, CheckCircle2, Users } from 'lucide-react'

interface TocProgressBarProps {
  progress: FolderProgressViewDto | null | undefined
  /** Optional heading, e.g. the ATA chapter code. */
  title?: string | null
  className?: string
}

function barColor(tone: StatusBadgeTone): string {
  switch (tone) {
    case StatusBadgeTone.Success:
      return '[&>div]:bg-emerald-500'
    case StatusBadgeTone.InProgress:
      return '[&>div]:bg-amber-500'
    case StatusBadgeTone.Danger:
      return '[&>div]:bg-red-500'
    case StatusBadgeTone.Expired:
      return '[&>div]:bg-orange-500'
    case StatusBadgeTone.Muted:
      return '[&>div]:bg-sky-400'
    case StatusBadgeTone.Neutral:
    default:
      return '[&>div]:bg-slate-400'
  }
}

export default function TocProgressBar({ progress, title, className }: TocProgressBarProps) {
  if (!progress) {
    return null
  }

  const pct = Math.max(0, Math.min(100, progress.completionPercent ?? 0))
  const allDone = progress.remainingForms === 0 && progress.remainingApprovalSteps === 0

  return (
    <div
      className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${className ?? ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {title ? (
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          ) : null}
          <p className="text-sm font-medium text-slate-800">{progress.remainingApprovalsText}</p>
        </div>
        <div className="flex items-center gap-1 text-right">
          {allDone ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
          )}
          <span className="text-lg font-semibold tabular-nums text-slate-900">{pct}%</span>
        </div>
      </div>

      <Progress
        value={pct}
        className={`mt-3 h-2 bg-slate-100 ${barColor(progress.worstTone)}`}
        aria-label={`Overall completion ${pct} percent`}
      />

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
        <span>
          <span className="font-semibold tabular-nums text-slate-900">{progress.remainingApprovalSteps}</span>{' '}
          approvals remaining
        </span>
        <span>
          <span className="font-semibold tabular-nums text-slate-900">{progress.completedForms}</span>
          {' / '}
          <span className="tabular-nums text-slate-900">{progress.totalForms}</span> forms closed
        </span>
        {progress.primaryBlockingRole ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">
            <Users className="h-3 w-3" aria-hidden="true" />
            Held by {progress.primaryBlockingRoleLabel}
            {progress.primaryBlockingRoleFormCount > 0
              ? ` (${progress.primaryBlockingRoleFormCount} form${progress.primaryBlockingRoleFormCount === 1 ? '' : 's'})`
              : ''}
          </span>
        ) : null}
        {progress.longestWaitDays > 0 ? (
          <span className="text-slate-500">longest wait {progress.longestWaitDays}d</span>
        ) : null}
      </div>
    </div>
  )
}