/**
 * =====================================================================================
 * REDESIGN v21 - THE MINI-KANBAN APPROVER TRACKER (MULTI-APPROVER AWARE)
 * CMT.Frontend/src/components/workflow/ToCStepTracker.tsx                    (AMENDED)
 * Copy to: CMT.Frontend/src/components/workflow/ToCStepTracker.tsx
 *
 * WHAT THIS FILE IS
 * -----------------
 * The compact horizontal "Progress Tracker / Mini-Kanban bar" a Table-of-Contents row
 * reveals DIRECTLY BELOW ITS TITLE when the row is expanded. Every approver /
 * action-taker is ONE circular avatar pill, laid out left to right in routing order.
 *
 * WHAT v21 CHANGES (the requirement of this amendment)
 * ---------------------------------------------------
 * A single form very often has TWO OR MORE approvers, and the previous version rendered
 * ONE pill per step with no notion of a shared stage, so "either of these two acts on
 * this stage" was impossible to read: the approval already given by one approver was
 * visually indistinguishable from the rejection raised by the other.
 *
 * The tracker now consumes `ToCTrackerStage[]` from `toc-view-model.buildToCTrackerStages`
 * and renders:
 *
 *   SEQUENTIAL STAGE   ->  one pill, exactly as before.
 *   MULTI-APPROVER     ->  ONE grouped stage capsule holding SEVERAL pills side by side,
 *   STAGE                  with a "1/2" counter on the capsule, so the reader instantly
 *                          sees that this single stage needs more than one person and
 *                          how many of them already acted. If ONE approver approved and
 *                          the OTHER requested a revision, BOTH states stay visible and
 *                          the capsule itself is tinted with the worst state
 *                          (rejected > revision > pending > approved).
 *
 * PILL STATES (unified colour system, identical to the row badges)
 *   approved            -> green circle with a check mark
 *   pending (current)   -> amber circle with the initials + pulsing ring
 *   revision requested  -> amber warning triangle outline
 *   rejected            -> red circle with a cross
 *   skipped             -> muted sky circle with the skip glyph
 *   not started         -> dashed hollow circle with the initials
 *
 * Hovering ANY pill opens a tooltip with the stage title, the person's NAME, ROLE, the
 * standardized state, the EXACT UTC action timestamp ("2026-08-27 09:14 UTC") and the
 * comment left with the action. Hovering the capsule counter of a multi-approver stage
 * summarises the whole stage ("1 of 2 approved · waiting on Nour Adel").
 *
 * BINDING RULES CARRIED OVER
 *   (1) The pills consume the PURE projection of `lib/workflow/toc-view-model.ts` -
 *       no fetch, no hooks, server labels win.
 *   (2) Purely presentational: the component never mutates anything.
 *   (3) It carries its OWN TooltipProvider, so the panel works whether or not the app
 *       root already provides one.
 *   (4) BACKWARD COMPATIBILITY: the legacy `steps: ToCTrackerStep[]` prop is still
 *       accepted and is grouped into single-approver stages internally, so any existing
 *       caller keeps compiling.
 * =====================================================================================
 */

'use client'

import { useMemo } from 'react'

import {
  AlertTriangle,
  Check,
  Clock,
  Minus,
  SkipForward,
  Users,
  X,
} from 'lucide-react'

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

import {
  TRACKER_STATE_LABELS,
  TRACKER_TONES,
  initialsOfName,
  trackerCountersOf,
  type ToCTrackerApprover,
  type ToCTrackerStage,
  type ToCTrackerStep,
  type ToCTrackerStepState,
} from '@/lib/workflow/toc-view-model'

import { cn } from '@/lib/utils'

// =====================================================================================
// 1. LEGACY BRIDGE - a flat ToCTrackerStep[] becomes one single-approver stage each
// =====================================================================================

function stagesFromLegacySteps(steps: ToCTrackerStep[]): ToCTrackerStage[] {
  return steps.map((step, index) => {
    const approver: ToCTrackerApprover = {
      stepNo: step.stepNo,
      title: step.title,
      actionVerb: step.actionVerb,
      caption: '',
      state: step.state,
      stateLabel: step.stateLabel,
      trackerLabel: TRACKER_STATE_LABELS[step.state],
      isCurrent: step.isCurrent,
      name: step.name,
      roleLabel: step.roleLabel,
      initials: initialsOfName(step.name),
      expectedRoleLabels: step.expectedRoleLabels,
      timestamp: step.timestamp,
      comments: step.comments,
      needsAssignment: false,
    }

    return {
      key: `${step.stepNo}-${index + 1}`,
      order: index + 1,
      title: step.title,
      actionVerb: step.actionVerb,
      caption: '',
      approvers: [approver],
      isMultiApprover: false,
      approverCount: 1,
      approvedCount: step.state === 'approved' || step.state === 'skipped' ? 1 : 0,
      state: step.state,
      stateLabel: TRACKER_STATE_LABELS[step.state],
      isCurrent: step.isCurrent && step.state === 'pending',
      summaryLabel: step.name ? `${step.name} — ${TRACKER_STATE_LABELS[step.state]}` : TRACKER_STATE_LABELS[step.state],
      waitingOn: step.state === 'pending' && step.name ? [step.name] : [],
      flaggedBy:
        (step.state === 'rejected' || step.state === 'revision_requested') && step.name
          ? [step.name]
          : [],
    }
  })
}

// =====================================================================================
// 2. ONE APPROVER PILL
// =====================================================================================

function PillGlyph({ approver }: { approver: ToCTrackerApprover }) {
  const tone = TRACKER_TONES[approver.state]
  const shell = 'relative flex h-6 w-6 items-center justify-center rounded-full border-2 shadow-sm'

  switch (approver.state) {
    case 'approved':
      return (
        <span className={cn(shell, tone.solid)}>
          <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
        </span>
      )
    case 'pending':
      return (
        <span
          className={cn(
            shell,
            tone.soft,
            'text-[8px] font-bold',
            approver.isCurrent && 'animate-pulse',
          )}
        >
          {approver.initials || <Clock className="h-3 w-3" aria-hidden="true" />}
        </span>
      )
    case 'revision_requested':
      return (
        <span className={cn(shell, tone.soft)}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      )
    case 'rejected':
      return (
        <span className={cn(shell, tone.solid)}>
          <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
        </span>
      )
    case 'skipped':
      return (
        <span className={cn(shell, tone.solid)}>
          <SkipForward className="h-3 w-3" aria-hidden="true" />
        </span>
      )
    default:
      return (
        <span className={cn(shell, tone.soft, 'text-[8px] font-semibold')}>
          {approver.initials || <Minus className="h-3 w-3" aria-hidden="true" />}
        </span>
      )
  }
}

function ApproverPill({
  approver,
  stage,
}: {
  approver: ToCTrackerApprover
  stage: ToCTrackerStage
}) {
  const tone = TRACKER_TONES[approver.state]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${stage.title} — ${approver.trackerLabel}${
            approver.name ? ` — ${approver.name}` : ''
          }`}
          className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full outline-none ring-ring transition-transform hover:scale-110 focus-visible:ring-2"
        >
          {/* the CURRENT pending action-taker carries a pulsing amber ring */}
          {approver.isCurrent && approver.state === 'pending' && (
            <span
              className="absolute inset-0 animate-ping rounded-full bg-amber-400 opacity-60"
              aria-hidden="true"
            />
          )}
          <PillGlyph approver={approver} />
        </button>
      </TooltipTrigger>

      <TooltipContent side="bottom" align="center" className="max-w-72 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Stage {stage.order} · {approver.actionVerb}
          {stage.isMultiApprover ? ` · approver ${approver.stepNo}` : ''}
        </p>
        <p className="mt-0.5 text-sm font-semibold text-foreground">{approver.title}</p>

        {approver.caption && (
          <p className="text-[11px] text-muted-foreground">{approver.caption}</p>
        )}

        {approver.name ? (
          <p className="mt-1 text-xs font-medium text-foreground">
            {approver.name}
            {approver.roleLabel ? (
              <span className="font-normal text-muted-foreground"> — {approver.roleLabel}</span>
            ) : null}
          </p>
        ) : approver.expectedRoleLabels.length > 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Eligible: {approver.expectedRoleLabels.join(' / ')}
          </p>
        ) : null}

        <p className="mt-1 text-xs font-medium">
          <span className={tone.text}>{approver.trackerLabel}</span>
          {approver.stateLabel && approver.stateLabel !== approver.trackerLabel && (
            <span className="font-normal text-muted-foreground"> · {approver.stateLabel}</span>
          )}
        </p>

        <p className="text-xs tabular-nums text-muted-foreground">
          {approver.timestamp ||
            (approver.needsAssignment ? 'Not assigned yet' : 'No action yet')}
        </p>

        {stage.isMultiApprover && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Shared stage · {stage.summaryLabel}
          </p>
        )}

        {approver.comments && (
          <p className="mt-1.5 border-t border-border pt-1.5 text-xs italic leading-snug text-muted-foreground">
            “{approver.comments}”
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  )
}

// =====================================================================================
// 3. ONE STAGE  -  a bare pill, or a grouped capsule when 2+ people share the stage
// =====================================================================================

/** Capsule tint of a multi-approver stage: the worst state of its approvers. */
const CAPSULE_CLASSES: Record<ToCTrackerStepState, string> = {
  approved: 'border-emerald-300 bg-emerald-50/80',
  pending: 'border-amber-300 bg-amber-50/80',
  revision_requested: 'border-amber-400 bg-amber-50',
  rejected: 'border-red-300 bg-red-50/80',
  skipped: 'border-sky-200 bg-sky-50/70',
  not_started: 'border-dashed border-gray-300 bg-white',
}

function StageGroup({ stage }: { stage: ToCTrackerStage }) {
  const stageLabel = stage.approvers
    .map(approver => approver.name || approver.expectedRoleLabels.join(' / '))
    .filter(Boolean)
    .join(' / ') || stage.title

  if (!stage.isMultiApprover) {
    const approver = stage.approvers[0]
    if (!approver) return null
    return (
      <span className="flex min-w-0 max-w-28 flex-col items-center gap-0.5">
        <ApproverPill approver={approver} stage={stage} />
        <span
          className="max-w-full truncate text-[9px] font-medium text-gray-600"
          title={stageLabel}
        >
          {stageLabel}
        </span>
      </span>
    )
  }

  const tone = TRACKER_TONES[stage.state]

  return (
    <span className="flex min-w-0 max-w-40 flex-col items-center gap-0.5">
      <span
        className={cn(
          'flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5',
          CAPSULE_CLASSES[stage.state],
        )}
      >
        {stage.approvers.map(approver => (
          <ApproverPill
            key={`${stage.key}-${approver.stepNo}`}
            approver={approver}
            stage={stage}
          />
        ))}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={`${stage.title} — ${stage.summaryLabel}`}
              className="flex shrink-0 items-center gap-0.5 rounded-full px-0.5 outline-none ring-ring focus-visible:ring-2"
            >
              <Users className={cn('h-3 w-3', tone.text)} aria-hidden="true" />
              <span className={cn('text-[9px] font-bold tabular-nums', tone.text)}>
                {stage.approvedCount}/{stage.approverCount}
              </span>
            </button>
          </TooltipTrigger>

          <TooltipContent side="bottom" align="center" className="max-w-72 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Stage {stage.order} · {stage.approverCount} approvers
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{stage.title}</p>
            <p className={cn('mt-1 text-xs font-medium', tone.text)}>{stage.stateLabel}</p>
            <p className="text-xs text-muted-foreground">{stage.summaryLabel}</p>

            <ul className="mt-1.5 space-y-1 border-t border-border pt-1.5">
              {stage.approvers.map(approver => (
                <li key={`${stage.key}-sum-${approver.stepNo}`} className="text-xs">
                  <span className="font-medium text-foreground">
                    {approver.name || approver.expectedRoleLabels.join(' / ') || `Step ${approver.stepNo}`}
                  </span>
                  {approver.roleLabel && (
                    <span className="text-muted-foreground"> — {approver.roleLabel}</span>
                  )}
                  <span className={cn(' · ', TRACKER_TONES[approver.state].text)}>
                    {approver.trackerLabel}
                  </span>
                  {approver.timestamp && (
                    <span className="block tabular-nums text-muted-foreground">
                      {approver.timestamp}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      </span>
      <span
        className="max-w-full truncate text-[9px] font-medium text-gray-600"
        title={stageLabel}
      >
        {stageLabel}
      </span>
    </span>
  )
}

/** The thin connector between two stages; green once the flow has passed it. */
function Connector({ active }: { active: boolean }) {
  return (
    <span
      className={cn('h-0.5 w-3 shrink-0 rounded-full', active ? 'bg-emerald-400' : 'bg-gray-200')}
      aria-hidden="true"
    />
  )
}

// =====================================================================================
// 4. THE CHAIN
// =====================================================================================

export interface ToCStepTrackerProps {
  /** v21 - the grouped, multi-approver-aware chain. Preferred. */
  stages?: ToCTrackerStage[]
  /** Legacy flat chain (one pill per step). Used only when `stages` is not supplied. */
  steps?: ToCTrackerStep[]
  /** Renders the "n of N stages approved · waiting on ..." caption above the pills. */
  showSummary?: boolean
  className?: string
}

export default function ToCStepTracker({
  stages,
  steps,
  showSummary = true,
  className = '',
}: ToCStepTrackerProps) {
  const chain = useMemo<ToCTrackerStage[]>(
    () => (stages && stages.length > 0 ? stages : stagesFromLegacySteps(steps ?? [])),
    [stages, steps],
  )

  const counters = useMemo(() => trackerCountersOf(chain), [chain])

  if (chain.length === 0) {
    return (
      <p className={cn('text-[11px] text-gray-500', className)}>
        The routing steps of this form were not materialised yet.
      </p>
    )
  }

  const lastDoneIndex = chain.reduce(
    (last, stage, index) =>
      stage.state === 'approved' || stage.state === 'skipped' ? index : last,
    -1,
  )

  return (
    <TooltipProvider delayDuration={100}>
      <div className={cn('space-y-1.5', className)}>
        <div className="flex flex-wrap items-center gap-1">
          {chain.map((stage, index) => (
            <span key={stage.key} className="flex items-center gap-1">
              {index > 0 && <Connector active={index <= lastDoneIndex} />}
              <StageGroup stage={stage} />
            </span>
          ))}

          <span className="ml-1.5 text-[10px] font-semibold tabular-nums text-gray-500">
            {counters.doneStages}/{counters.totalStages}
          </span>
        </div>

        {showSummary && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] leading-snug">
            <span
              className={cn(
                'font-medium',
                counters.hasAttention
                  ? 'text-red-700'
                  : counters.waitingOn.length > 0
                    ? 'text-amber-800'
                    : 'text-emerald-700',
              )}
            >
              {counters.label}
            </span>

            {counters.hasConcurrentStage && (
              <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0 text-[9px] font-medium text-gray-600">
                <Users className="h-2.5 w-2.5" aria-hidden="true" />
                Multi-approver stage
              </span>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
