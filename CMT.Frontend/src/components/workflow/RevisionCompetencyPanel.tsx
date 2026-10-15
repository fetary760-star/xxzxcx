/**
 * =====================================================================================
 * AMENDED v17 — PHASE 1 (FRONTEND)
 * Copy to: CMT.Frontend/src/components/workflow/RevisionCompetencyPanel.tsx  (NEW FILE)
 *
 * WHAT THIS FILE IS
 * -----------------
 * Requirement #12 end to end:
 *
 *   "Standard two-year revision cycle for evaluation folders with automatic revision
 *    triggers when linked documentation (CMM, Component Maintenance Task, Task Cards) is
 *    revised, coordinated approval by Department Director / Manager / Shop Team Leader /
 *    Shop Manager, plus monitoring of individual competencies (training completion dates)
 *    and the tool equivalency matrix."
 *
 * ENDPOINTS CONSUMED  (all already declared in workflow-api.ts v13)
 *   GET  /api/evaluation-folders/{id}/revisions         -> useFolderRevisions (v15)
 *   POST /api/evaluation-folders/{id}/revisions         -> raiseFolderRevision
 *   GET  /api/evaluation-folders/{id}/competency-matrix -> useCompetencyMatrix (v15)
 *   GET  /api/evaluation-folders/{id}/tool-equivalency  -> useToolEquivalencyMatrix (v15)
 *
 * WHY IT IS NEEDED
 * ----------------
 * v13 and v15 expose every one of those calls, and `RevisionTrigger` /
 * `CompetencyMatrixRowResponse` / `ToolEquivalencyRowResponse` are fully mirrored in v11 —
 * but no screen consumes them, so requirement #12 currently has:
 *   - no visible two-year due date: `FolderSummaryResponse.revisionDueDate` is delivered and
 *     dropped, so nobody learns the cycle is overdue until an auditor asks;
 *   - no way to raise a CMM / Component Maintenance Task / Task Card triggered revision from
 *     the UI, even though `raiseFolderRevision()` exists and the approval chain is already
 *     catalogued server side;
 *   - no competency monitoring: training completion dates and the tool equivalency /
 *     calibration matrix are never shown, so an expired competency silently blocks the
 *     folder sign-off later (requirement #14) with no explanation.
 *
 * TWO BINDING RULES
 *   (1) `folderId` is a STRING (C# Guid); `employeeUserId` is a NUMBER (C# long).
 *   (2) The coordinated approval chain of a revision is owned by the SERVER catalog
 *       (`FORM_TYPES.FolderRevision`). This panel only RAISES the cycle and shows its
 *       status; it never invents an approval path.
 * =====================================================================================
 */
'use client'

import { useCallback, useMemo, useState } from 'react'
import { GitBranch, Loader2, RefreshCw, Wrench } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

import { raiseFolderRevision } from '@/lib/workflow/workflow-api'
import {
  useCompetencyMatrix,
  useFolderRevisions,
  useToolEquivalencyMatrix,
  useWorkflowAction,
} from '@/lib/workflow/useWorkflow'
import {
  CALIBRATION_STATE_CLASSES,
  CALIBRATION_STATE_LABELS,
  COMPETENCY_STATE_CLASSES,
  COMPETENCY_STATE_LABELS,
  REVISION_STATE_CLASSES,
  REVISION_STATE_LABELS,
  REVISION_TRIGGER_OPTIONS,
  calibrationState,
  competencyState,
  dueLabel,
  revisionState,
  sortRevisions,
  twoYearDueDate,
  utcDate,
} from '@/lib/workflow/completion-utils'
import { roleLabel } from '@/lib/role-hierarchy'
import {
  RevisionTrigger,
  approvalStatusClasses,
  approvalStatusLabel,
  revisionTriggerLabel,
  type FolderSummaryResponse,
} from '@/lib/workflow/workflow-types'

// =====================================================================================
// 1. RAISE-REVISION DIALOG
// =====================================================================================

interface RaiseRevisionDialogProps {
  open: boolean
  folderId: string
  onClose: () => void
  onRaised: () => void
}

function RaiseRevisionDialog({ open, folderId, onClose, onRaised }: RaiseRevisionDialogProps) {
  const [trigger, setTrigger] = useState<RevisionTrigger>(RevisionTrigger.TwoYearCycle)
  const [triggerReference, setTriggerReference] = useState('')
  const [newRevision, setNewRevision] = useState('')
  const [notes, setNotes] = useState('')
  const { running, lastError, run } = useWorkflowAction()

  const option = REVISION_TRIGGER_OPTIONS.find(o => o.value === trigger)

  const submit = useCallback(async () => {
    const created = await run(() =>
      raiseFolderRevision(folderId, {
        trigger,
        triggerReference,
        newRevision,
        notes,
      }),
    )
    if (created) {
      onRaised()
      onClose()
    }
  }, [folderId, newRevision, notes, onClose, onRaised, run, trigger, triggerReference])

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Raise a revision cycle</DialogTitle>
          <DialogDescription>
            The revision is routed through the coordinated approval chain defined on the server
            (Department Director / Manager / Shop Team Leader / Shop Manager).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Trigger</Label>
            <Select
              value={String(trigger)}
              onValueChange={value => setTrigger(Number(value) as RevisionTrigger)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVISION_TRIGGER_OPTIONS.map(item => (
                  <SelectItem key={item.value} value={String(item.value)}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="revision-reference" className="text-xs">
              Trigger reference
            </Label>
            <Input
              id="revision-reference"
              value={triggerReference}
              onChange={event => setTriggerReference(event.target.value)}
              placeholder={option?.referenceHint}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="revision-new" className="text-xs">
              New revision
            </Label>
            <Input
              id="revision-new"
              value={newRevision}
              onChange={event => setNewRevision(event.target.value)}
              placeholder="Rev 03"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="revision-notes" className="text-xs">
              Notes
            </Label>
            <Textarea
              id="revision-notes"
              rows={3}
              value={notes}
              onChange={event => setNotes(event.target.value)}
            />
          </div>

          {lastError && (
            <p className="rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-900">
              {lastError}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={running}>
            Cancel
          </Button>
          <Button
            className="bg-blue-600 text-white hover:bg-blue-700"
            onClick={submit}
            disabled={running}
          >
            {running ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitBranch className="mr-1 h-3.5 w-3.5" />
            )}
            Raise revision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// =====================================================================================
// 2. THE PANEL
// =====================================================================================

export interface RevisionCompetencyPanelProps {
  /** C# Guid. */
  folderId: string
  folder?: FolderSummaryResponse | null
  /** Server flag from GET /api/workflow/permissions/me (`revision.trigger`). */
  canRaiseRevision?: boolean
  className?: string
}

export default function RevisionCompetencyPanel({
  folderId,
  folder,
  canRaiseRevision = false,
  className = '',
}: RevisionCompetencyPanelProps) {
  const revisions = useFolderRevisions(folderId)
  const competencies = useCompetencyMatrix(folderId)
  const tools = useToolEquivalencyMatrix(folderId)
  const [dialogOpen, setDialogOpen] = useState(false)

  const history = useMemo(() => sortRevisions(revisions.data), [revisions.data])
  const cycleState = revisionState(folder)
  const dueDate = folder?.revisionDueDate || twoYearDueDate(folder?.completedAt)

  const reloadAll = useCallback(() => {
    void revisions.reload()
    void competencies.reload()
    void tools.reload()
  }, [competencies, revisions, tools])

  return (
    <div className={`space-y-4 ${className}`}>
      {/* ---------------- two-year revision cycle ---------------- */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="h-4 w-4 text-indigo-600" />
              Revision cycle
            </CardTitle>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge className={`border ${REVISION_STATE_CLASSES[cycleState]}`}>
                {REVISION_STATE_LABELS[cycleState]}
              </Badge>
              <span className="text-[11px] text-gray-600">
                Two-year cycle due {utcDate(dueDate) || '—'} · {dueLabel(dueDate)}
              </span>
              {typeof folder?.revisionNumber === 'number' && (
                <Badge className="border border-slate-300 bg-slate-100 text-slate-800">
                  Rev {folder.revisionNumber}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {canRaiseRevision && (
              <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                Raise revision
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={reloadAll}
              disabled={revisions.loading}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${revisions.loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="px-0 pb-2">
          {revisions.error && (
            <p className="px-3 py-2 text-xs text-red-900">{revisions.error}</p>
          )}

          {!revisions.loading && history.length === 0 && !revisions.error && (
            <p className="px-3 py-3 text-xs text-gray-600">
              No revision has been raised for this folder yet. A revision is raised
              automatically when the linked CMM, Component Maintenance Task or Task Card is
              revised, or manually when the two-year cycle falls due.
            </p>
          )}

          <div className="divide-y divide-gray-200">
            {history.map(item => (
              <div key={item.id} className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    Revision {item.revisionNumber}
                  </span>
                  <Badge className="border border-indigo-300 bg-indigo-100 text-indigo-900">
                    {item.triggerLabel || revisionTriggerLabel(item.trigger)}
                  </Badge>
                  <Badge className={`border ${approvalStatusClasses(item.status)}`}>
                    {item.statusLabel || approvalStatusLabel(item.status)}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-gray-700">
                  {item.previousRevision || '—'} → {item.newRevision || '—'}
                  {item.triggerReference ? ` · ${item.triggerReference}` : ''}
                </p>
                <p className="text-[11px] text-gray-500">
                  Raised {utcDate(item.raisedAt) || '—'}
                  {item.closedAt ? ` · closed ${utcDate(item.closedAt)}` : ''}
                </p>
                {item.notes && <p className="mt-0.5 text-[11px] text-gray-600">{item.notes}</p>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ---------------- individual competencies ---------------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            Individual competencies ({competencies.data.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {competencies.error && (
            <p className="px-3 py-2 text-xs text-red-900">{competencies.error}</p>
          )}

          {!competencies.loading && competencies.data.length === 0 && !competencies.error && (
            <p className="px-3 py-3 text-xs text-gray-600">
              No competency row is recorded for this folder yet. Rows are created by the training
              chain once HR verification is approved.
            </p>
          )}

          {competencies.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Employee</th>
                    <th className="px-3 py-1.5 font-medium">Training</th>
                    <th className="px-3 py-1.5 font-medium">Completed</th>
                    <th className="px-3 py-1.5 font-medium">Expires</th>
                    <th className="px-3 py-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {competencies.data.map(row => {
                    const state = competencyState(row)
                    return (
                      <tr key={row.id}>
                        <td className="px-3 py-1.5">
                          <span className="block font-medium text-gray-900">
                            {row.employeeName}
                          </span>
                          <span className="block text-[10px] text-gray-500">
                            {row.employeeNo}
                            {row.employeeRole ? ` · ${roleLabel(row.employeeRole)}` : ''}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="block text-gray-900">{row.trainingTitle}</span>
                          <span className="block text-[10px] text-gray-500">
                            {row.trainingCode}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-gray-800">
                          {utcDate(row.trainingCompletedDate) || '—'}
                        </td>
                        <td className="px-3 py-1.5 text-gray-800">
                          {utcDate(row.trainingExpiryDate) || '—'}
                          {row.trainingExpiryDate && (
                            <span className="block text-[10px] text-gray-500">
                              {dueLabel(row.trainingExpiryDate)}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <Badge className={`border ${COMPETENCY_STATE_CLASSES[state]}`}>
                            {COMPETENCY_STATE_LABELS[state]}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------------- tool equivalency matrix ---------------- */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Wrench className="h-4 w-4 text-slate-600" />
            Tool equivalency matrix ({tools.data.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-2">
          {tools.error && <p className="px-3 py-2 text-xs text-red-900">{tools.error}</p>}

          {!tools.loading && tools.data.length === 0 && !tools.error && (
            <p className="px-3 py-3 text-xs text-gray-600">
              No alternate or in-house manufactured tool has been recorded for this folder yet.
            </p>
          )}

          {tools.data.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-600">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Original tool</th>
                    <th className="px-3 py-1.5 font-medium">Alternate</th>
                    <th className="px-3 py-1.5 font-medium">Equivalency</th>
                    <th className="px-3 py-1.5 font-medium">Calibration due</th>
                    <th className="px-3 py-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {tools.data.map(row => {
                    const state = calibrationState(row)
                    return (
                      <tr key={row.id}>
                        <td className="px-3 py-1.5">
                          <span className="block font-medium text-gray-900">
                            {row.originalToolPartNumber}
                          </span>
                          <span className="block text-[10px] text-gray-500">
                            {row.originalToolDescription}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          <span className="block text-gray-900">
                            {row.alternateToolPartNumber || '—'}
                          </span>
                          <span className="block text-[10px] text-gray-500">
                            {row.isInhouseManufactured ? 'In-house manufactured' : ''}
                          </span>
                        </td>
                        <td className="px-3 py-1.5">
                          {row.equivalencyApproved ? (
                            <Badge className="border border-emerald-300 bg-emerald-100 text-emerald-900">
                              Approved
                              {row.approvedByRole ? ` · ${roleLabel(row.approvedByRole)}` : ''}
                            </Badge>
                          ) : (
                            <Badge className="border border-amber-300 bg-amber-100 text-amber-900">
                              Pending approval
                            </Badge>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-gray-800">
                          {utcDate(row.calibrationDueDate) || '—'}
                          {row.calibrationInterval && (
                            <span className="block text-[10px] text-gray-500">
                              Interval {row.calibrationInterval}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-1.5">
                          <Badge className={`border ${CALIBRATION_STATE_CLASSES[state]}`}>
                            {CALIBRATION_STATE_LABELS[state]}
                          </Badge>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <RaiseRevisionDialog
        open={dialogOpen}
        folderId={folderId}
        onClose={() => setDialogOpen(false)}
        onRaised={reloadAll}
      />
    </div>
  )
}