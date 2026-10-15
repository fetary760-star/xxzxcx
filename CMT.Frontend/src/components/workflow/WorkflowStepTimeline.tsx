/**
 * =====================================================================================
 * AMENDED v16 - PHASE 1 (FRONTEND)
 * Copy to: CMT.Frontend/src/components/workflow/WorkflowStepTimeline.tsx     (NEW FILE)
 *
 * WHAT THIS FILE IS
 * -----------------
 * The read-only rendering of requirement #3:
 *
 *   "Reusable approval-chain engine storing each form's step sequence (role, assignee,
 *    action, decision, comments, signature, date), supporting sequential routing, manual
 *    assignment, delegation to lower-tier staff, skip logic, rejection/return-for-rework,
 *    and a full audit log."
 *
 * It renders the MATERIALISED chain of ONE `WorkflowInstanceResponse`: every step with its
 * number, title, kind, execution state, eligible roles, assignment (person or UNIT QUEUE),
 * who acted and when, comments, delegation reason, skip reason, checklist progress and the
 * signature caption the step will print.
 *
 * WHY IT IS NEEDED
 * ----------------
 * The only progress indicator in the current client is the six-dot strip inside
 * `ApprovalWorkflowActions.tsx`, driven by `currentStatus >= step`. That comparison is
 * meaningless after v8 (documented in types-workflow-bridge.ts): PendingDocumentationClerk
 * (14) is not "further along" than PendingManagerApproval (2) — they belong to entirely
 * different chains. So for every Documentation / AD / TNA / Training / 918 / Amendment
 * record the user sees either all dots green or all dots grey, and never learns which role
 * currently owns the record.
 *
 * This component replaces that strip with the REAL chain of THAT form, whatever its routing
 * is, and works unchanged for all 31 statuses because it never inspects the status number:
 * it reads `steps[].state` and `steps[].pendingStatusLabel`.
 *
 * BINDING RULES
 *   (1) NOTHING is computed locally that the server already sent. State labels, status
 *       labels, role labels, skip modes and capability flags all come off the payload.
 *   (2) user ids are NUMBERS; instance ids are STRINGS.
 *   (3) purely presentational — it triggers no mutation. All actions live in
 *       `WorkflowActionBar.tsx`.
 * =====================================================================================
 */

'use client'

import {
  ArrowRightLeft,
  CheckCircle2,
  CircleDashed,
  ClipboardList,
  Clock,
  FileSignature,
  RotateCcw,
  SkipForward,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'

import {
  SkipMode,
  WorkflowStepKind,
  WorkflowStepState,
  isManuallySkippable,
  skipModeLabel,
  stepActionLabel,
  stepKindLabel,
  stepStateClasses,
  stepStateLabel,
  type WorkflowInstanceResponse,
  type WorkflowStepResponse,
} from '@/lib/workflow/workflow-types'

import { functionalUnitLabel, roleLabelWithCode } from '@/lib/role-hierarchy'
import { formatSignatureTimestamp } from '@/lib/workflow/signature-render'

// =====================================================================================
// 1. PER-STATE ICON  (driven by WorkflowStepState, never by the status number)
// =====================================================================================

function StateIcon({ state }: { state: WorkflowStepState }) {
  const shared = 'h-4 w-4'
  switch (state) {
    case WorkflowStepState.Completed:
      return <CheckCircle2 className={`${shared} text-emerald-600`} aria-hidden="true" />
    case WorkflowStepState.Active:
      return <Clock className={`${shared} text-amber-600`} aria-hidden="true" />
    case WorkflowStepState.AwaitingAssignment:
      return <Users className={`${shared} text-violet-600`} aria-hidden="true" />
    case WorkflowStepState.Skipped:
      return <SkipForward className={`${shared} text-sky-600`} aria-hidden="true" />
    case WorkflowStepState.Rejected:
      return <XCircle className={`${shared} text-red-600`} aria-hidden="true" />
    case WorkflowStepState.Returned:
      return <RotateCcw className={`${shared} text-orange-600`} aria-hidden="true" />
    default:
      return <CircleDashed className={`${shared} text-gray-400`} aria-hidden="true" />
  }
}

/** Vertical connector colour: completed / skipped behind, grey ahead. */
function connectorClass(state: WorkflowStepState): string {
  if (state === WorkflowStepState.Completed) return 'bg-emerald-300'
  if (state === WorkflowStepState.Skipped) return 'bg-sky-300'
  if (state === WorkflowStepState.Rejected) return 'bg-red-300'
  if (state === WorkflowStepState.Returned) return 'bg-orange-300'
  if (state === WorkflowStepState.Active) return 'bg-amber-300'
  return 'bg-gray-200'
}

// =====================================================================================
// 2. ONE STEP ROW
// =====================================================================================

function StepRow({
  step,
  isLast,
  isCurrent,
}: {
  step: WorkflowStepResponse
  isLast: boolean
  isCurrent: boolean
}) {
  const assignedTo = step.assignedToName?.trim()
  const actedBy = step.actedByName?.trim()

  return (
    <li className="relative flex gap-3 pb-4 last:pb-0">
      {/* rail */}
      <div className="flex flex-col items-center">
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-white ${
            isCurrent ? 'border-amber-400 ring-2 ring-amber-100' : 'border-gray-300'
          }`}
        >
          <StateIcon state={step.state} />
        </span>
        {!isLast && <span className={`mt-1 w-px flex-1 ${connectorClass(step.state)}`} />}
      </div>

      {/* body */}
      <div
        className={`min-w-0 flex-1 rounded-md border px-3 py-2 ${
          isCurrent ? 'border-amber-300 bg-amber-50/60' : 'border-gray-200 bg-white'
        }`}
      >
        {/* ---- title line ------------------------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-500">
            Step {step.stepNo}
          </span>
          <span className="min-w-0 break-words text-sm font-semibold text-gray-900 [overflow-wrap:anywhere]">
            {step.title}
          </span>
          <Badge className={`border text-[10px] ${stepStateClasses(step.state)}`}>
            {step.stateLabel || stepStateLabel(step.state)}
          </Badge>
          <Badge variant="outline" className="border-gray-300 bg-white text-[10px] text-gray-700">
            {step.kindLabel || stepKindLabel(step.kind)}
          </Badge>
          {isCurrent && (
            <Badge className="border border-amber-300 bg-amber-100 text-[10px] text-amber-900">
              {step.pendingStatusLabel}
            </Badge>
          )}
        </div>

        {/* ---- who may act ------------------------------------------------------------ */}
        <div className="mt-1.5 grid gap-1 text-[11px] text-gray-700 sm:grid-cols-2">
          <p className="min-w-0 break-words [overflow-wrap:anywhere]">
            <span className="font-semibold text-gray-500">Eligible: </span>
            {(step.eligibleRoleLabels?.length
              ? step.eligibleRoleLabels
              : (step.eligibleRoles ?? []).map(roleLabelWithCode)
            ).join(' / ') || '—'}
          </p>

          {step.assignmentUnit && (
            <p className="min-w-0 break-words [overflow-wrap:anywhere]">
              <span className="font-semibold text-gray-500">Queue: </span>
              {functionalUnitLabel(step.assignmentUnit)}
            </p>
          )}

          {step.requiresManualAssignment && (
            <p className="min-w-0 break-words [overflow-wrap:anywhere]">
              <span className="font-semibold text-gray-500">Assigned by: </span>
              {(step.assignerRoles ?? []).map(roleLabelWithCode).join(' / ') || '—'}
            </p>
          )}

          {step.restrictToOriginatorShop && (
            <p className="text-gray-600">
              <span className="font-semibold text-gray-500">Scope: </span>
              Originating shop only
            </p>
          )}

          {isManuallySkippable(step.skipMode) && (
            <p className="min-w-0 break-words text-gray-600 [overflow-wrap:anywhere]">
              <span className="font-semibold text-gray-500">Skip: </span>
              {skipModeLabel(step.skipMode)}
              {step.skipConditionField ? ` · field "${step.skipConditionField}"` : ''}
            </p>
          )}

          {step.skipMode === SkipMode.Auto && (
            <p className="min-w-0 break-words text-gray-600 [overflow-wrap:anywhere]">
              <span className="font-semibold text-gray-500">Skip: </span>
              {skipModeLabel(step.skipMode)}
              {step.skipConditionField ? ` · field "${step.skipConditionField}"` : ''}
            </p>
          )}
        </div>

        {/* ---- assignment / execution ------------------------------------------------- */}
        {(assignedTo || actedBy) && (
          <div className="mt-1.5 space-y-1 border-t border-dashed border-gray-200 pt-1.5 text-[11px]">
            {assignedTo && (
              <p className="flex flex-wrap items-center gap-1 text-gray-700">
                <UserCheck className="h-3.5 w-3.5 text-violet-600" aria-hidden="true" />
                <span className="font-semibold">{assignedTo}</span>
                {step.assignedToRole && (
                  <span className="text-gray-500">({roleLabelWithCode(step.assignedToRole)})</span>
                )}
                {step.assignedAt && (
                  <span className="text-gray-500">
                    · assigned {formatSignatureTimestamp(step.assignedAt)}
                  </span>
                )}
              </p>
            )}

            {actedBy && (
              <p className="flex flex-wrap items-center gap-1 text-gray-700">
                <FileSignature className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                <span className="font-semibold">{stepActionLabel(step.actionTaken)}</span>
                <span>by {actedBy}</span>
                {step.actedByRole && (
                  <span className="text-gray-500">({roleLabelWithCode(step.actedByRole)})</span>
                )}
                {step.actedAt && (
                  <span className="text-gray-500">· {formatSignatureTimestamp(step.actedAt)}</span>
                )}
                {step.signatureCaption && (
                  <span className="text-gray-500">· prints “{step.signatureCaption}”</span>
                )}
              </p>
            )}

            {step.wasDelegated && (
              <p className="flex flex-wrap items-start gap-1 text-gray-700">
                <ArrowRightLeft
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600"
                  aria-hidden="true"
                />
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                  <span className="font-semibold">Delegated: </span>
                  {step.delegationReason || 'Workload reassignment.'}
                </span>
              </p>
            )}

            {step.isSkipped && (
              <p className="flex flex-wrap items-start gap-1 text-sky-800">
                <SkipForward
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600"
                  aria-hidden="true"
                />
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                  <span className="font-semibold">
                    {step.skippedAutomatically ? 'Auto-skipped: ' : 'Skipped: '}
                  </span>
                  {step.skipReason || 'No reason recorded.'}
                </span>
              </p>
            )}

            {step.comments && (
              <p className="min-w-0 break-words rounded bg-gray-50 px-2 py-1 text-gray-700 [overflow-wrap:anywhere]">
                <span className="font-semibold text-gray-500">Comments: </span>
                {step.comments}
              </p>
            )}
          </div>
        )}

        {/* ---- MNT-1325 step-by-step gate --------------------------------------------- */}
        {(step.isStepByStepChecklist || step.kind === WorkflowStepKind.Gate) &&
          step.checklistTotalItems > 0 && (
            <div className="mt-1.5 flex items-center gap-2 border-t border-dashed border-gray-200 pt-1.5">
              <ClipboardList className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
              <span className="text-[11px] font-semibold text-gray-700">
                Checklist {step.checklistVerifiedItems}/{step.checklistTotalItems} verified
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-200">
                <span
                  className="block h-full rounded-full bg-blue-500"
                  style={{
                    width: `${Math.round(
                      (step.checklistVerifiedItems / Math.max(1, step.checklistTotalItems)) * 100,
                    )}%`,
                  }}
                />
              </span>
            </div>
          )}
      </div>
    </li>
  )
}

// =====================================================================================
// 3. THE TIMELINE
// =====================================================================================

export interface WorkflowStepTimelineProps {
  instance?: WorkflowInstanceResponse | null
  loading?: boolean
  error?: string | null
  /** Hide the header when the parent card already prints the form number and status. */
  showHeader?: boolean
  className?: string
}

export default function WorkflowStepTimeline({
  instance,
  loading = false,
  error = null,
  showHeader = true,
  className = '',
}: WorkflowStepTimelineProps) {
  if (loading) {
    return (
      <div className={`space-y-2 ${className}`} aria-busy="true">
        {[0, 1, 2].map(index => (
          <div key={`skeleton-${index}`} className="flex gap-3">
            <span className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-gray-200" />
            <span className="h-16 flex-1 animate-pulse rounded-md bg-gray-100" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className={`rounded-md border border-red-200 bg-red-50 px-3 py-2 ${className}`}>
        <p className="text-xs font-semibold text-red-800">
          The approval chain could not be loaded.
        </p>
        <p className="mt-0.5 break-words text-xs text-red-700 [overflow-wrap:anywhere]">{error}</p>
      </div>
    )
  }

  if (!instance || !instance.steps || instance.steps.length === 0) {
    return (
      <div className={`rounded-md border border-gray-200 bg-gray-50 px-3 py-2 ${className}`}>
        <p className="text-xs text-gray-600">
          No approval chain has been created for this form yet. Create the draft to materialise its
          routing steps.
        </p>
      </div>
    )
  }

  const steps = [...instance.steps].sort((a, b) => a.stepNo - b.stepNo)

  return (
    <div className={className}>
      {showHeader && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
            Approval chain
          </span>
          {instance.formNo && (
            <Badge variant="outline" className="border-gray-300 bg-white text-[10px] text-gray-700">
              {instance.formNo}
            </Badge>
          )}
          <span className="text-xs text-gray-600">
            {instance.completedSteps}/{instance.totalSteps} steps · {instance.progressPercent}%
          </span>
          {instance.revisionNumber > 0 && (
            <Badge variant="outline" className="border-gray-300 bg-white text-[10px] text-gray-700">
              Rev {instance.revisionNumber}
            </Badge>
          )}
          {instance.isLocked && (
            <Badge className="border border-slate-300 bg-slate-100 text-[10px] text-slate-800">
              Locked
            </Badge>
          )}
        </div>
      )}

      <ol className="m-0 list-none p-0">
        {steps.map((step, index) => (
          <StepRow
            key={step.id || `step-${step.stepNo}`}
            step={step}
            isLast={index === steps.length - 1}
            isCurrent={step.stepNo === instance.currentStepNo && !instance.isComplete}
          />
        ))}
      </ol>
    </div>
  )
}