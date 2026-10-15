/**
 * =====================================================================================
 * AMENDED v17 - PHASE 1 (FRONTEND)
 * CMT.Frontend/src/components/workflow/FolderCompletionPanel.tsx        (NEW FILE)
 *
 * WHAT THIS FILE IS
 * -----------------
 * Requirements #11, #12 and #14 in one panel:
 *
 *   #11  "Progress dashboard showing remaining tasks per folder; when the final approver
 *         approves the last task the process is officially marked Complete, then all
 *         approved data is consolidated into a downloadable PDF report including final
 *         records and approval signatures."
 *   #12  "Standard two-year revision cycle for evaluation folders with automatic revision
 *         triggers when linked documentation (CMM, Component Maintenance Task, Task Cards)
 *         is revised."
 *   #14  "Sequential sign-off following the role hierarchy until the folder is fully
 *         approved and locked."
 *
 * WHY IT IS NEEDED
 * ----------------
 * `workflow-api.ts` (v13) already exposes `signOffFolder`, `generateFolderReport`,
 * `completeFolderAndGenerateReport` and `raiseFolderRevision`, and `useWorkflow.ts` (v15)
 * exposes `useFolderProgress` / `useFolderRevisions`. Nothing in the repository calls any of
 * them, so a folder whose eleven sections are all approved simply stays "in progress"
 * forever and the consolidated PDF is unreachable.
 *
 * BEHAVIOURAL CONTRACT HONOURED HERE
 *   - The sign-off button is offered whenever the folder is not yet complete. The server is
 *     the gate: while any mandatory form is still open it answers MANDATORY_FORMS_PENDING,
 *     and that message is surfaced verbatim next to the list of remaining items.
 *   - ALREADY_COMPLETED is not an error for the report: `completeFolderAndGenerateReport`
 *     swallows it and still consolidates the PDF.
 *   - The download always uses the `downloadUrl` returned by the API (or the canonical
 *     report route). A file path is never constructed on the client.
 * =====================================================================================
 */

'use client'

import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  History,
  Loader2,
  Lock,
  RefreshCw,
  Signature,
} from 'lucide-react'

import { useToast } from '@/hooks/use-toast'

import {
  completeFolderAndGenerateReport,
  folderReportDownloadUrl,
  generateFolderReport,
  raiseFolderRevision,
  signOffFolder,
} from '@/lib/workflow/workflow-api'

import {
  RevisionTrigger,
  lifecycleStateClasses,
  revisionTriggerLabel,
} from '@/lib/workflow/workflow-types'

import {
  useFolderProgress,
  useFolderRevisions,
  useWorkflowAction,
} from '@/lib/workflow/useWorkflow'

import { formatSignatureTimestamp } from '@/lib/workflow/signature-render'

interface Props {
  /** C# Guid of the evaluation folder. */
  folderId: string
  /** Notified after sign-off / report / revision, so the parent can refresh the ToC. */
  onChanged?: () => void
  className?: string
}

const REVISION_TRIGGER_OPTIONS: RevisionTrigger[] = [
  RevisionTrigger.TwoYearCycle,
  RevisionTrigger.CmmRevised,
  RevisionTrigger.ComponentMaintenanceTaskRevised,
  RevisionTrigger.TaskCardRevised,
  RevisionTrigger.Manual,
]

export default function FolderCompletionPanel({ folderId, onChanged, className = '' }: Props) {
  const { toast } = useToast()

  const progressState = useFolderProgress(folderId)
  const revisionsState = useFolderRevisions(folderId)
  const { run, running } = useWorkflowAction()

  const [showRevision, setShowRevision] = useState(false)
  const [trigger, setTrigger] = useState<string>(String(RevisionTrigger.TwoYearCycle))
  const [triggerReference, setTriggerReference] = useState('')
  const [newRevision, setNewRevision] = useState('')
  const [notes, setNotes] = useState('')
  const [reportUrl, setReportUrl] = useState<string>('')

  const progress = progressState.data
  const percent = Math.max(0, Math.min(100, Math.round(progress?.completionPercent ?? 0)))

  const remaining = useMemo(() => progress?.remainingItems ?? [], [progress])

  const refreshAll = async () => {
    await Promise.all([progressState.reload(), revisionsState.reload()])
    onChanged?.()
  }

  const handleSignOff = async () => {
    const result = await run(() => signOffFolder(folderId, { comments: '' }), {
      onError: message =>
        toast({ title: 'Sign-off refused', description: message, variant: 'destructive' }),
    })
    if (!result) return
    toast({
      title: result.statusLabel || 'Signed off',
      description: [
        result.message,
        result.folderCompleted ? 'The folder is now marked complete.' : '',
        result.isLocked ? 'It has been locked.' : '',
      ]
        .filter(Boolean)
        .join(' '),
    })
    await refreshAll()
  }

  const handleGenerateReport = async () => {
    const report = await run(() => generateFolderReport(folderId), {
      onError: message =>
        toast({ title: 'Report refused', description: message, variant: 'destructive' }),
    })
    if (!report) return
    setReportUrl(report.downloadUrl || folderReportDownloadUrl(folderId))
    toast({
      title: 'Report generated',
      description: `${report.fileName} — ${report.includedForms} forms and ${report.includedSignatures} signatures consolidated.`,
    })
    await refreshAll()
  }

  const handleCompleteAndReport = async () => {
    const outcome = await run(() => completeFolderAndGenerateReport(folderId, ''), {
      onError: message =>
        toast({ title: 'Completion refused', description: message, variant: 'destructive' }),
    })
    if (!outcome) return
    setReportUrl(outcome.report.downloadUrl || folderReportDownloadUrl(folderId))
    toast({
      title: 'Folder completed',
      description: `${outcome.report.fileName} is ready to download.`,
    })
    await refreshAll()
  }

  const handleRaiseRevision = async () => {
    const parsed = Number.parseInt(trigger, 10)
    const result = await run(
      () =>
        raiseFolderRevision(folderId, {
          trigger: (Number.isFinite(parsed) ? parsed : RevisionTrigger.Manual) as RevisionTrigger,
          triggerReference,
          newRevision,
          notes,
        }),
      {
        onError: message =>
          toast({ title: 'Revision refused', description: message, variant: 'destructive' }),
      },
    )
    if (!result) return
    toast({
      title: `Revision ${result.revisionNumber} raised`,
      description: result.triggerLabel || revisionTriggerLabel(result.trigger),
    })
    setShowRevision(false)
    setTriggerReference('')
    setNewRevision('')
    setNotes('')
    await refreshAll()
  }

  if (progressState.loading) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-4 ${className}`}>
        <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
        <span className="text-sm text-slate-700">Loading the completion state…</span>
      </div>
    )
  }

  if (progressState.error || !progress) {
    return (
      <div className={`rounded-lg border border-red-200 bg-red-50 p-4 ${className}`}>
        <p className="flex items-start gap-2 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {progressState.error || 'The folder progress could not be loaded.'}
        </p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => void progressState.reload()}>
          Retry
        </Button>
      </div>
    )
  }

  const downloadHref = reportUrl || (progress.reportAvailable ? folderReportDownloadUrl(folderId) : '')

  return (
    <div className={`space-y-3 ${className}`}>
      {/* ---------------- progress ---------------- */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">
            Completion tracking
          </h3>
          <div className="flex items-center gap-2">
            {progress.isComplete && (
              <Badge className="border border-emerald-300 bg-emerald-100 text-emerald-900">
                <CheckCircle2 className="mr-1 inline h-3 w-3" />
                Complete
              </Badge>
            )}
            {progress.isLocked && (
              <Badge className="border border-slate-400 bg-slate-100 text-slate-900">
                <Lock className="mr-1 inline h-3 w-3" />
                Locked
              </Badge>
            )}
            <Button size="sm" variant="outline" onClick={() => void refreshAll()}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Refresh
            </Button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div
            className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-emerald-600 transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-xs font-medium text-slate-700">{percent}%</span>
        </div>

        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          <Badge className="border border-emerald-300 bg-emerald-100 text-emerald-900">
            {progress.approvedItems} approved
          </Badge>
          <Badge className="border border-amber-300 bg-amber-100 text-amber-900">
            {progress.pendingItems} pending
          </Badge>
          {progress.skippedItems > 0 && (
            <Badge className="border border-sky-300 bg-sky-100 text-sky-900">
              {progress.skippedItems} skipped
            </Badge>
          )}
          {progress.expiredItems > 0 && (
            <Badge className="border border-orange-300 bg-orange-100 text-orange-900">
              {progress.expiredItems} expired
            </Badge>
          )}
          <span className="text-slate-600">of {progress.totalItems} items</span>
        </div>

        {/* ---------------- remaining tasks ---------------- */}
        {remaining.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2">
            <p className="text-xs font-semibold text-amber-900">
              Still blocking completion ({remaining.length})
            </p>
            <ul className="mt-1 space-y-1">
              {remaining.slice(0, 8).map(item => (
                <li key={item.id} className="flex flex-wrap items-center gap-2 text-xs text-amber-900">
                  <span className="font-medium">{item.formNo || item.formTitle}</span>
                  <Badge className={`border ${lifecycleStateClasses(item.lifecycleState)}`}>
                    {item.lifecycleStateLabel || item.statusLabel}
                  </Badge>
                  {item.currentAssigneeName && <span>· {item.currentAssigneeName}</span>}
                </li>
              ))}
              {remaining.length > 8 && (
                <li className="text-xs text-amber-800">…and {remaining.length - 8} more.</li>
              )}
            </ul>
          </div>
        )}

        {/* ---------------- actions ---------------- */}
        <div className="mt-3 flex flex-wrap gap-2">
          {!progress.isComplete && (
            <Button
              size="sm"
              className="bg-emerald-600 text-white hover:bg-emerald-700"
              disabled={running}
              onClick={() => void handleSignOff()}
            >
              {running ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Signature className="mr-1 h-3.5 w-3.5" />
              )}
              Final sign-off
            </Button>
          )}

          {!progress.isComplete && remaining.length === 0 && (
            <Button
              size="sm"
              className="bg-blue-600 text-white hover:bg-blue-700"
              disabled={running}
              onClick={() => void handleCompleteAndReport()}
            >
              {running ? (
                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="mr-1 h-3.5 w-3.5" />
              )}
              Complete and generate PDF
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            disabled={running}
            onClick={() => void handleGenerateReport()}
          >
            {running ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="mr-1 h-3.5 w-3.5" />
            )}
            Generate PDF report
          </Button>

          {downloadHref && (
            <Button size="sm" variant="outline" asChild>
              <a href={downloadHref} target="_blank" rel="noreferrer">
                <Download className="mr-1 h-3.5 w-3.5" />
                Download report
              </a>
            </Button>
          )}

          <Button
            size="sm"
            variant="outline"
            className="border-slate-300 text-slate-800 hover:bg-slate-50"
            onClick={() => setShowRevision(true)}
          >
            <History className="mr-1 h-3.5 w-3.5" />
            Raise revision
          </Button>
        </div>

        {progress.reportGeneratedAt && (
          <p className="mt-2 text-[11px] text-slate-600">
            Last report generated: {formatSignatureTimestamp(progress.reportGeneratedAt)}
          </p>
        )}
      </div>

      {/* ---------------- revision history ---------------- */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-800">
          Revision cycle
        </h3>

        {revisionsState.loading ? (
          <p className="mt-2 text-xs text-slate-600">Loading revisions…</p>
        ) : revisionsState.data.length === 0 ? (
          <p className="mt-2 text-xs text-slate-600">
            No revision has been raised yet. The standard two-year cycle and the CMM / Component
            Maintenance Task / Task Card triggers create one automatically.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100">
            {revisionsState.data.map(rev => (
              <li key={rev.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    Revision {rev.revisionNumber}
                    {rev.previousRevision || rev.newRevision
                      ? ` · ${rev.previousRevision || '—'} → ${rev.newRevision || '—'}`
                      : ''}
                  </p>
                  <p className="text-xs text-slate-600">
                    {rev.triggerLabel || revisionTriggerLabel(rev.trigger)}
                    {rev.triggerReference ? ` · ${rev.triggerReference}` : ''}
                    {rev.raisedAt ? ` · ${formatSignatureTimestamp(rev.raisedAt)}` : ''}
                  </p>
                  {rev.notes && <p className="mt-0.5 text-xs text-slate-700">{rev.notes}</p>}
                </div>
                <Badge className="border border-slate-300 bg-slate-100 text-slate-900">
                  {rev.statusLabel || `Status ${rev.status}`}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ---------------- raise revision ---------------- */}
      <Dialog open={showRevision} onOpenChange={open => setShowRevision(open)}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-slate-700" />
              Raise a revision cycle
            </DialogTitle>
            <DialogDescription>
              The approval of a revision is coordinated by the Department Director, Manager, Shop
              Team Leader or Shop Manager as per the role hierarchy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Trigger *</Label>
              <Select value={trigger} onValueChange={setTrigger}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {REVISION_TRIGGER_OPTIONS.map(option => (
                    <SelectItem key={option} value={String(option)}>
                      {revisionTriggerLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Trigger reference (CMM number, task card number …)
              </Label>
              <input
                className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-500"
                value={triggerReference}
                onChange={e => setTriggerReference(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">New revision</Label>
              <input
                className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-slate-500"
                value={newRevision}
                onChange={e => setNewRevision(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Notes</Label>
              <Textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRevision(false)}>
              Cancel
            </Button>
            <Button disabled={running} onClick={() => void handleRaiseRevision()}>
              {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Raise revision
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}