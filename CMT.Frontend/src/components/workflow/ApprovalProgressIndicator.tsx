'use client'

import { Check, ChevronDown, Clock3, X } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  ApprovalStatus,
  WorkflowStepState,
  type WorkflowInstanceResponse,
  type WorkflowStepResponse,
} from '@/lib/workflow/workflow-types'
import { roleLabelWithCode } from '@/lib/role-hierarchy'

interface Props {
  instance: WorkflowInstanceResponse
  className?: string
  defaultExpanded?: boolean
}

function statusOf(instance: WorkflowInstanceResponse): { label: string; classes: string } {
  switch (instance.status) {
    case ApprovalStatus.Draft:
      return { label: 'Draft', classes: 'border-slate-300 bg-slate-100 text-slate-700' }
    case ApprovalStatus.Approved:
      return { label: 'Approved', classes: 'border-emerald-300 bg-emerald-50 text-emerald-800' }
    case ApprovalStatus.Rejected:
    case ApprovalStatus.Returned:
      return { label: 'Rejected', classes: 'border-red-300 bg-red-50 text-red-800' }
    default:
      return {
        label: instance.statusLabel || 'Pending Approval',
        classes: 'border-amber-300 bg-amber-50 text-amber-900',
      }
  }
}

function stepClasses(step: WorkflowStepResponse): string {
  if (step.state === WorkflowStepState.Completed) return 'border-emerald-300 bg-emerald-50'
  if (step.state === WorkflowStepState.Skipped) return 'border-sky-300 bg-sky-50'
  if (step.state === WorkflowStepState.Rejected || step.state === WorkflowStepState.Returned) {
    return 'border-red-300 bg-red-50'
  }
  if (step.state === WorkflowStepState.Active || step.state === WorkflowStepState.AwaitingAssignment) {
    return 'border-amber-300 bg-amber-50'
  }
  return 'border-slate-200 bg-white'
}

function stepIcon(step: WorkflowStepResponse) {
  if (step.state === WorkflowStepState.Completed || step.state === WorkflowStepState.Skipped) {
    return <Check className="h-3.5 w-3.5" aria-hidden="true" />
  }
  if (step.state === WorkflowStepState.Rejected || step.state === WorkflowStepState.Returned) {
    return <X className="h-3.5 w-3.5" aria-hidden="true" />
  }
  return <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
}

function StepAvatar({ step }: { step: WorkflowStepResponse }) {
  const name = step.assignedToName || step.eligibleRoleLabels?.[0] || step.eligibleRoles?.[0] || 'Approver'
  const initials = name
    .split(/\s+/)
    .map(part => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-[10px] font-bold text-amber-900 ring-2 ring-amber-50">
          {initials}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-semibold">{step.assignedToName || 'Role queue'}</p>
        <p className="text-xs text-muted-foreground">
          {(step.eligibleRoleLabels?.length ? step.eligibleRoleLabels : step.eligibleRoles).map(roleLabelWithCode).join(', ') || 'Approver'}
        </p>
      </TooltipContent>
    </Tooltip>
  )
}

export default function ApprovalProgressIndicator({
  instance,
  className = '',
  defaultExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const steps = [...(instance.steps ?? [])].sort((left, right) => left.stepNo - right.stepNo)
  const status = statusOf(instance)
  const current = steps.find(step => step.stepNo === instance.currentStepNo && !instance.isComplete)
  const percent = Math.max(0, Math.min(100, instance.progressPercent ?? 0))
  const pendingLabel = current
    ? `Pending: ${current.eligibleRoleLabels?.join(', ') || current.eligibleRoles?.map(roleLabelWithCode).join(', ') || 'Approver'} Approval`
    : instance.isComplete
      ? 'All approvals complete'
      : 'Approval chain is being prepared'

  return (
    <TooltipProvider delayDuration={150}>
      <section className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${className}`}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-slate-900">{instance.title}</h3>
              <Badge className={`border text-[10px] ${status.classes}`}>{status.label}</Badge>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${percent}%` }} />
              </div>
              <span className="w-10 text-right text-xs font-bold tabular-nums text-slate-700">{percent}%</span>
            </div>
            <p className={`mt-1 text-xs font-medium ${current ? 'text-amber-800' : 'text-slate-500'}`}>{pendingLabel}</p>
          </div>
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide approval steps' : 'Show approval steps'}
            onClick={() => setExpanded(value => !value)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        </div>

        {expanded && (
          <ol className="mt-3 grid gap-2 border-t border-slate-100 pt-3">
            {steps.map(step => {
              const isPending = step.stepNo === instance.currentStepNo && !instance.isComplete
              return (
                <li key={step.id || step.stepNo} className={`flex items-center gap-2 rounded-md border px-2.5 py-2 ${stepClasses(step)}`}>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current/20 text-slate-600">{stepIcon(step)}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-900">{step.title}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {step.actedByName ? `${step.actedByName} completed` : step.eligibleRoleLabels?.join(', ') || step.eligibleRoles?.map(roleLabelWithCode).join(', ')}
                    </p>
                  </div>
                  {isPending && <StepAvatar step={step} />}
                </li>
              )
            })}
          </ol>
        )}
      </section>
    </TooltipProvider>
  )
}