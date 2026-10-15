/**
 * =====================================================================================
 * AMENDED v14 - PHASE 1 (FRONTEND), FEATURE 2: THE STATUS BADGE
 * CMT.Frontend/src/components/self-evaluation/StatusBadge.tsx                  (NEW FILE)
 * Copy to: CMT.Frontend/src/components/self-evaluation/StatusBadge.tsx
 *
 * WHAT IT IS
 * ----------
 * The single badge the Table Of Contents renders for every form, mirroring the
 * StatusBadge produced by ToCProgressCalculator (CMT.Domain/Models/Workflow/
 * ToCProgressContracts.cs). It renders the SHORT label the requirement names
 * ("Pending / Approved / Revoked"), the tone colour, and - when the form is in
 * ApprovalStatus.PendingDelegatedReview (31) - the delegated-review indicator that
 * tells the user to chase the REVIEWER, not the approver.
 *
 * It takes the pre-built StatusBadgeDto when available, or a bare ApprovalStatus so a
 * legacy call site can still render a correct badge without the progress tree.
 * =====================================================================================
 */
'use client'

import { Badge } from '@/components/ui/badge'
import {
  ApprovalStatus,
  StatusBadgeTone,
  type StatusBadgeDto,
} from '@/lib/workflow/workflow-types'
import { badgeClasses, buildBadge } from '@/lib/workflow/toc-progress'
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  MinusCircle,
  UserCheck,
} from 'lucide-react'

interface StatusBadgeProps {
  /** Pre-built badge from the progress tree. Wins over `status` when supplied. */
  badge?: StatusBadgeDto | null
  /** Bare status fallback for legacy call sites. */
  status?: ApprovalStatus | null
  /** Who is reviewing under a v12 delegation (shown only for status 31). */
  reviewerName?: string | null
  /** Who the step belonged to before the borrow (shown only for status 31). */
  originalApproverName?: string | null
  /** Force the delegated-review styling even if the status is the underlying pending one. */
  isDelegatedReview?: boolean
  showIcon?: boolean
  className?: string
}

function toneIcon(tone: StatusBadgeTone, delegated: boolean) {
  if (delegated) return <UserCheck className="h-3 w-3" aria-hidden="true" />
  switch (tone) {
    case StatusBadgeTone.Success:
      return <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
    case StatusBadgeTone.InProgress:
      return <Clock className="h-3 w-3" aria-hidden="true" />
    case StatusBadgeTone.Danger:
      return <AlertTriangle className="h-3 w-3" aria-hidden="true" />
    case StatusBadgeTone.Expired:
      return <AlertTriangle className="h-3 w-3" aria-hidden="true" />
    case StatusBadgeTone.Muted:
      return <MinusCircle className="h-3 w-3" aria-hidden="true" />
    case StatusBadgeTone.Neutral:
    default:
      return <Circle className="h-3 w-3" aria-hidden="true" />
  }
}

export default function StatusBadge({
  badge,
  status,
  reviewerName,
  originalApproverName,
  isDelegatedReview,
  showIcon = true,
  className,
}: StatusBadgeProps) {
  const resolved: StatusBadgeDto =
    badge ?? buildBadge(status ?? ApprovalStatus.Draft)

  const delegated =
    !!isDelegatedReview ||
    resolved.status === ApprovalStatus.PendingDelegatedReview

  const classes = badgeClasses(resolved.tone)

  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1 border font-medium ${classes} ${className ?? ''}`}
      title={resolved.label}
    >
      {showIcon ? toneIcon(resolved.tone, delegated) : null}
      <span>{delegated ? 'In review' : resolved.shortLabel}</span>
      {delegated ? (
        <span className="ml-1 font-normal opacity-80">
          {reviewerName ? `by ${reviewerName}` : '(delegated)'}
          {originalApproverName ? ` for ${originalApproverName}` : ''}
        </span>
      ) : null}
    </Badge>
  )
}