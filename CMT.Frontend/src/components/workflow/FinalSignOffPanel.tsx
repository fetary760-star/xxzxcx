/**
 * =====================================================================================
 * AMENDED v17 — PHASE 1 (FRONTEND)
 * Copy to: CMT.Frontend/src/components/workflow/FinalSignOffPanel.tsx        (NEW FILE)
 *
 * WHAT THIS FILE IS
 * -----------------
 * Requirement #14 end to end:
 *
 *   "Sequential sign-off following the role hierarchy until the folder is fully approved
 *    and locked, with the signature block persisted on every form."
 *
 * ENDPOINTS CONSUMED  (all already declared in workflow-api.ts v13)
 *   GET  /api/evaluation-folders/{folderId}            -> the folder + its sign-off instance
 *   POST /api/evaluation-folders/{folderId}/sign-off   -> signOffFolder
 *   GET  /api/workflow/forms/{instanceId}              -> useWorkflowInstance (v15)
 *   POST /api/workflow/forms/{instanceId}/approve      -> approveWorkflowStep
 *   POST /api/workflow/forms/{instanceId}/return       -> returnWorkflowStep
 *
 * WHY IT IS NEEDED
 * ----------------
 * `FolderDetailResponse.signOff` already delivers the whole folder-level chain as a normal
 * `WorkflowInstanceResponse` (form type `evaluation_folder_signoff`), and v13 exposes
 * `signOffFolder()` — yet nothing renders it. So requirement #14 currently has:
 *   - no visible role hierarchy: the user cannot see that the folder is waiting on the
 *     Manager and not on the Director, so the sequential order is invisible;
 *   - no per-tier action: the current tier has no Approve / Return control, so the chain
 *     cannot actually be advanced from the UI;
 *   - no lock feedback: once locked, every form must become read-only, but nothing tells the
 *     rest of the UI that the folder reached `ApprovalStatus.Locked` (29);
 *   - no persisted signature block: the whole point of #14 is that the block survives on the
 *     folder itself, which is exactly what `WorkflowSignatureBlock` renders below.
 *
 * THREE BINDING RULES
 *   (1) `folderId` / `instanceId` are STRINGS (C# Guid); user ids are NUMBERS (C# long).
 *   (2) THE SERVER IS THE AUTHORITY. The Approve / Return buttons are driven by
 *       `resolveCanAct()` (v14), which reads `step.canIAct` FIRST and only falls back to the
 *       local rule to supply the disabled tooltip. Nothing is re-derived to override it.
 *   (3) `signOffBlockers()` (v17) pre-flights the chain, so MANDATORY_FORMS_PENDING is
 *       explained BEFORE a request instead of arriving as a surprise toast.
 * =====================================================================================
 */
'use client'

import { useCallback, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, Lock, RefreshCw, Undo2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'

import WorkflowSignatureBlock from '@/components/workflow/WorkflowSignatureBlock'

import {
  approveWorkflowStep,
  returnWorkflowStep,
  signOffFolder,
} from '@/lib/workflow/workflow-api'
import {
  useFolderProgress,
  useWorkflowActor,
  useWorkflowAction,
  useWorkflowInstance,
} from '@/lib/workflow/useWorkflow'
import { resolveCanAct } from '@/lib/workflow/workflow-permissions'
import {
  FOLDER_LOCK_CLASSES,
  FOLDER_LOCK_LABELS,
  folderLockState,
  signOffBlockers,
  signOffChainOf,
  utcDate,
} from '@/lib/workflow/completion-utils'
import { roleLabel } from '@/lib/role-hierarchy'
import {
  WorkflowStepState,
  stepStateClasses,
  stepStateLabel,
  type FolderSummaryResponse,
  type WorkflowInstanceResponse,
} from '@/lib/workflow/workflow-types'

export interface FinalSignOffPanelProps {
  /** C# Guid. */
  folderId: string
  folder?: FolderSummaryResponse | null
  /**
   * `FolderDetailResponse.signOff`. When omitted the panel still works: it starts the chain
   * with POST /sign-off and then follows the returned instance id.
   */
  signOffInstance?: WorkflowInstanceResponse | null
  /** Called after any transition so the parent can refresh the folder detail. */
  onChanged?: () => void
  className?: string
}

export default function FinalSignOffPanel({
  folderId,
  folder,
  signOffInstance,
  onChanged,
  className = '',
}: FinalSignOffPanelProps) {
  const { actor } = useWorkflowActor()
  const progress = useFolderProgress(folderId)
  const { running, lastError, run } = useWorkflowAction()

  const [instanceId, setInstanceId] = useState<string | null>(signOffInstance?.id ?? null)
  const [comments, setComments] = useState('')
  const [notice, setNotice] = useState('')

  // The panel follows the live instance so the chain, the signatures and the capability
  // flags always come from the server after every transition.
  const live = useWorkflowInstance(instanceId ?? signOffInstance?.id ?? null)
  const instance = live.instance ?? signOffInstance ?? null

  const chain = useMemo(() => signOffChainOf(instance), [instance])
  const lockState = folderLockState(folder, progress.data)
  const blockers = signOffBlockers(progress.data)

  const currentStep = useMemo(
    () => (instance?.steps ?? []).find(step => step.stepNo === instance?.currentStepNo) ?? null,
    [instance],
  )

  /** Server-first capability of the tier the folder is waiting on (binding rule 2). */
  const canAct = useMemo(() => {
    if (!actor || !live.facts) {
      return { allowed: currentStep?.canIAct === true, reason: '', code: '', source: 'server' as const }
    }
    return resolveCanAct(actor, live.facts, currentStep)
  }, [actor, currentStep, live.facts])

  const refreshAll = useCallback(() => {
    void progress.reload()
    void live.reload()
    onChanged?.()
  }, [live, onChanged, progress])

  /** Starts (or advances) the folder-level chain. */
  const startChain = useCallback(async () => {
    setNotice('')
    const result = await run(() => signOffFolder(folderId, { comments }))
    if (!result) return
    if (result.instanceId) setInstanceId(result.instanceId)
    setComments('')
    setNotice(
      result.isLocked
        ? 'The folder is fully approved and now locked.'
        : `Sign-off routed to ${result.currentStepTitle || 'the next tier'}.`,
    )
    refreshAll()
  }, [comments, folderId, refreshAll, run])

  /** Approves the tier that the caller owns. */
  const approveTier = useCallback(async () => {
    if (!instance) return
    setNotice('')
    const result = await run(() =>
      approveWorkflowStep(instance.id, { stepNo: instance.currentStepNo, comments }),
    )
    if (!result) return
    setComments('')
    setNotice(
      result.isLocked
        ? 'The folder is fully approved and now locked.'
        : `Approved. Now with ${result.currentAssigneeName || result.currentStepTitle || 'the next tier'}.`,
    )
    refreshAll()
  }, [comments, instance, refreshAll, run])

  /** Returns the chain to the originator for rework. Comments are mandatory. */
  const returnTier = useCallback(async () => {
    if (!instance) return
    setNotice('')
    const result = await run(() =>
      returnWorkflowStep(instance.id, { stepNo: instance.currentStepNo, comments }),
    )
    if (!result) return
    setComments('')
    setNotice('Returned for rework.')
    refreshAll()
  }, [comments, instance, refreshAll, run])

  const isLocked = lockState === 'locked'

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            {isLocked ? (
              <Lock className="h-4 w-4 text-slate-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            Final sign-off
          </CardTitle>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge className={`border ${FOLDER_LOCK_CLASSES[lockState]}`}>
              {FOLDER_LOCK_LABELS[lockState]}
            </Badge>
            {instance?.currentStepNo != null && !isLocked && (
              <span className="text-[11px] text-gray-600">
                Waiting on step {instance.currentStepNo}
                {currentStep?.title ? ` — ${currentStep.title}` : ''}
              </span>
            )}
          </div>
        </div>

        <Button size="sm" variant="ghost" onClick={refreshAll} disabled={live.loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${live.loading ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ---------------- the sequential role hierarchy ---------------- */}
        {chain.length > 0 ? (
          <ol className="space-y-2">
            {chain.map(step => (
              <li
                key={step.stepNo}
                className={`flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1.5 ${
                  step.isCurrent ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
                }`}
              >
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-gray-900">
                    {step.stepNo}. {step.title || step.roleLabel || roleLabel(step.role)}
                  </span>
                  <span className="block text-[11px] text-gray-600">
                    {step.roleLabel || roleLabel(step.role)}
                    {step.personName ? ` · ${step.personName}` : ''}
                    {step.date ? ` · ${step.date}` : ''}
                  </span>
                </span>

                <span className="flex items-center gap-1.5">
                  {step.isCurrent && (
                    <Badge className="border border-amber-300 bg-amber-100 text-amber-900">
                      Current tier
                    </Badge>
                  )}
                  <Badge className={`border ${stepStateClasses(step.state)}`}>
                    {step.stateLabel || stepStateLabel(step.state)}
                  </Badge>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="rounded border border-gray-300 bg-gray-50 px-2 py-1.5 text-xs text-gray-700">
            The folder-level sign-off chain has not been started yet. It is created the moment the
            last mandatory form is approved.
          </p>
        )}

        {/* ---------------- blockers, notices, errors ---------------- */}
        {blockers.blocked && !isLocked && (
          <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
            {blockers.reason}
          </p>
        )}

        {!canAct.allowed && canAct.reason && !isLocked && chain.length > 0 && (
          <p className="text-[11px] text-gray-600">{canAct.reason}</p>
        )}

        {(lastError || live.error) && (
          <p className="rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-900">
            {lastError || live.error}
          </p>
        )}

        {notice && (
          <p className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
            {notice}
          </p>
        )}

        {/* ---------------- the tier actions ---------------- */}
        {!isLocked && (
          <div className="space-y-2 border-t border-gray-200 pt-3">
            <Textarea
              rows={2}
              value={comments}
              onChange={event => setComments(event.target.value)}
              placeholder="Sign-off remarks (mandatory when returning for rework)"
              className="text-xs"
            />

            <div className="flex flex-wrap gap-2">
              {chain.length === 0 ? (
                <Button
                  size="sm"
                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                  onClick={() => void startChain()}
                  disabled={running || blockers.blocked}
                  title={blockers.blocked ? blockers.reason : 'Start the final sign-off chain'}
                >
                  {running ? (
                    <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                  )}
                  Start final sign-off
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => void approveTier()}
                    disabled={running || !canAct.allowed}
                    title={canAct.allowed ? 'Sign off this tier' : canAct.reason}
                  >
                    {running ? (
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    )}
                    Sign off this tier
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void returnTier()}
                    disabled={running || !canAct.allowed || comments.trim() === ''}
                    title={
                      comments.trim() === ''
                        ? 'Remarks are mandatory when returning for rework.'
                        : 'Return the folder for rework'
                    }
                  >
                    <Undo2 className="mr-1 h-3.5 w-3.5" />
                    Return for rework
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        {/* ---------------- the persisted signature block (requirement #13 + #14) ---------------- */}
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
            Folder sign-off signatures
          </p>
          <div className="border-t border-gray-400">
            <WorkflowSignatureBlock
              instance={instance}
              emptyHint="The folder signature block is filled automatically as each tier of the role hierarchy signs off."
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}