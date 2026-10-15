/**
 * =====================================================================================
 * AMENDED v14 - PHASE 1 (FRONTEND), FEATURE 1: THE ARCHIVE SIDEBAR PANEL
 * CMT.Frontend/src/components/self-evaluation/ArchivePanel.tsx                 (NEW FILE)
 * Copy to: CMT.Frontend/src/components/self-evaluation/ArchivePanel.tsx
 *
 * WHAT IT IS
 * ----------
 * The "newly created Archive section" the requirement names. It renders the append-only
 * ArchiveEntry rows (CMT.Domain/Models/SelfEvaluation/ArchiveEntities.cs) and wires the
 * three authorized actions through archive-api.ts:
 *   - RESTORE  -> back to the main capability list at Draft, revision bumped (invariant A4);
 *   - EDIT     -> allowed while archived and recorded on the entry (invariant A5);
 *   - PURGE    -> a REQUEST flag only; nothing is ever deleted (invariant A1).
 *
 * Every action is pre-flighted with the LOCAL mirror of ArchivePolicy (canRestore /
 * canEditArchived) so the button shows the SAME denial message the server would return,
 * before a request is ever sent. The full audit history (including Restored rows) is one
 * toggle away - filtering history to Archived rows only is a defect the C# file warns
 * about, so the toggle exists and the default stays "Archived".
 * =====================================================================================
 */
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Archive as ArchiveIcon,
  ArchiveRestore,
  History,
  Loader2,
  Lock,
  Pencil,
  ShieldAlert,
  Trash2,
} from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { normalizeRole } from '@/lib/role-utils'
import { useToast } from '@/hooks/use-toast'
import {
  ARCHIVE_SIDEBAR_SECTION,
  archiveTriggerLabel,
  archivedItemKindLabel,
  workflowErrorCodeMessage,
  type ArchiveEntryResponse,
} from '@/lib/workflow/workflow-types'
import {
  canEditArchived,
  canRestore,
  editArchivedItem,
  getActiveArchiveEntries,
  getArchiveHistory,
  requestPurge,
  restoreArchivedItem,
} from '@/lib/workflow/archive-api'

/** The signed-in user, narrowed to the fields the archive policy reads. */
function actorFromUser(user: unknown) {
  const u = (user ?? {}) as {
    role?: string | null
    additionalPermissions?: string | null
    revokedPermissions?: string | null
  }
  return {
    role: u.role ?? null,
    additionalPermissions: u.additionalPermissions ?? null,
    revokedPermissions: u.revokedPermissions ?? null,
  }
}

function stateBadgeClasses(entry: ArchiveEntryResponse): string {
  if (entry.state === 2) return 'bg-red-100 text-red-900 border-red-300'
  if (entry.state === 1) return 'bg-emerald-100 text-emerald-900 border-emerald-300'
  return 'bg-slate-100 text-slate-800 border-slate-300'
}

function stateLabel(entry: ArchiveEntryResponse): string {
  if (entry.state === 2) return 'Purge requested'
  if (entry.state === 1) return 'Restored'
  return 'Archived'
}

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const t = Date.parse(value)
  if (Number.isNaN(t)) return value
  return new Date(t).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function ArchivePanel({ onRestored }: { onRestored?: () => void }) {
  const { user } = useAuth()
  const { toast } = useToast()
  const actor = actorFromUser(user)

  const [entries, setEntries] = useState([] as ArchiveEntryResponse[])
  const [loading, setLoading] = useState(false)
  const [historyMode, setHistoryMode] = useState(false)

  const [restoreTarget, setRestoreTarget] = useState(null as ArchiveEntryResponse | null)
  const [editTarget, setEditTarget] = useState(null as ArchiveEntryResponse | null)
  const [purgeTarget, setPurgeTarget] = useState(null as ArchiveEntryResponse | null)
  const [reason, setReason] = useState('')
  const [editJson, setEditJson] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = historyMode ? await getArchiveHistory() : await getActiveArchiveEntries()
      setEntries(rows)
    } catch (error) {
      toast({
        title: 'Archive unavailable',
        description: error instanceof Error ? error.message : 'The archive could not be loaded.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [historyMode, toast])

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  const closeDialogs = () => {
    setRestoreTarget(null)
    setEditTarget(null)
    setPurgeTarget(null)
    setReason('')
    setEditJson('')
  }

  const handleRestore = async () => {
    if (!restoreTarget) return
    const decision = canRestore(actor, restoreTarget, restoreTarget.itemId, reason)
    if (!decision.allowed) {
      toast({
        title: 'Restore blocked',
        description: decision.message || workflowErrorCodeMessage(decision.denialCode),
        variant: 'destructive',
      })
      return
    }
    setBusy(true)
    try {
      await restoreArchivedItem(restoreTarget.id, { reason: reason.trim() })
      toast({
        title: 'Restored',
        description: `${restoreTarget.itemTitle} is back in the main capability list at Draft, revision ${
          (restoreTarget.revisionNumberBeforeArchive ?? 1) + 1
        }.`,
      })
      closeDialogs()
      await load()
      onRestored?.()
    } catch (error) {
      toast({
        title: 'Restore failed',
        description: error instanceof Error ? error.message : 'The item could not be restored.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleEdit = async () => {
    if (!editTarget) return
    const decision = canEditArchived(actor, editTarget)
    if (!decision.allowed) {
      toast({
        title: 'Edit blocked',
        description: decision.message || workflowErrorCodeMessage(decision.denialCode),
        variant: 'destructive',
      })
      return
    }
    if (editJson.trim()) {
      try {
        JSON.parse(editJson)
      } catch {
        toast({ title: 'Invalid JSON', description: 'Form data must be valid JSON.', variant: 'destructive' })
        return
      }
    }
    setBusy(true)
    try {
      await editArchivedItem(editTarget.id, {
        formDataJson: editJson.trim() ? editJson.trim() : null,
        reason: reason.trim() || null,
      })
      toast({ title: 'Archived item updated', description: 'The edit was recorded on the archive entry.' })
      closeDialogs()
      await load()
    } catch (error) {
      toast({
        title: 'Edit failed',
        description: error instanceof Error ? error.message : 'The archived item could not be edited.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const handlePurgeRequest = async () => {
    if (!purgeTarget) return
    if (!reason.trim()) {
      toast({ title: 'Reason required', description: 'A purge request must state its reason.', variant: 'destructive' })
      return
    }
    setBusy(true)
    try {
      const decision = await requestPurge(purgeTarget.id, { reason: reason.trim() })
      toast({
        title: decision.allowed ? 'Purge requested' : 'Purge request blocked',
        description:
          decision.allowed
            ? 'Nothing was deleted. The request is recorded for review.'
            : decision.message,
        variant: decision.allowed ? 'default' : 'destructive',
      })
      closeDialogs()
      await load()
    } catch (error) {
      toast({
        title: 'Purge request failed',
        description: error instanceof Error ? error.message : 'The purge request could not be recorded.',
        variant: 'destructive',
      })
    } finally {
      setBusy(false)
    }
  }

  const canActOnArchive = ['team_leader', 'shop_tl', 'admin'].includes(normalizeRole(actor.role))

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ArchiveIcon className="h-4 w-4 text-slate-600" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-800">{ARCHIVE_SIDEBAR_SECTION.title}</h2>
          <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
            {entries.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={historyMode ? 'default' : 'outline'}
            onClick={() => setHistoryMode(v => !v)}
            disabled={loading}
          >
            <History className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {historyMode ? 'Audit history' : 'Archived only'}
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
            Refresh
          </Button>
        </div>
      </div>

      {!canActOnArchive ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          You can see archived items but not edit or restore them. Those actions are limited to
          the Shop Team Leader.
        </div>
      ) : null}

      {loading && entries.length === 0 ? (
        <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading the Archive...
        </div>
      ) : null}

      {!loading && entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
          {historyMode
            ? 'No archive events recorded yet.'
            : 'Nothing is archived. Revoked or deleted records appear here and are never permanently lost.'}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-3 py-2 font-medium">Item</th>
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 font-medium">Trigger</th>
              <th className="px-3 py-2 font-medium">Status before</th>
              <th className="px-3 py-2 font-medium">Archived by</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {entries.map(entry => (
              <tr key={entry.id} className="align-top">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-800">{entry.itemTitle || entry.itemReference}</div>
                  <div className="text-[10px] text-slate-500">
                    {entry.itemReference}
                    {entry.ataChapterCode ? ` · ATA ${entry.ataChapterCode}` : ''}
                    {entry.shopName ? ` · ${entry.shopName}` : ''}
                  </div>
                  {entry.reason ? (
                    <div className="mt-0.5 max-w-[280px] text-[10px] italic text-slate-500">
                      “{entry.reason}”
                    </div>
                  ) : null}
                  {entry.editedWhileArchived ? (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-amber-700">
                      <Pencil className="h-2.5 w-2.5" aria-hidden="true" />
                      edited while archived ({entry.editsWhileArchived})
                    </div>
                  ) : null}
                  {entry.wasApprovedBeforeArchive ? (
                    <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-red-700">
                      <ShieldAlert className="h-2.5 w-2.5" aria-hidden="true" />
                      an approval was undone
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-slate-600">{archivedItemKindLabel(entry.itemKind)}</td>
                <td className="px-3 py-2 text-slate-600">{archiveTriggerLabel(entry.trigger)}</td>
                <td className="px-3 py-2 text-slate-600">
                  {entry.statusBeforeArchiveLabel}
                  {entry.statusAfterRestore ? (
                    <div className="text-[10px] text-emerald-700">
                      restored to {entry.statusAfterRestore === 0 ? 'Draft' : String(entry.statusAfterRestore)}
                      {entry.revisionNumberAfterRestore ? ` · rev ${entry.revisionNumberAfterRestore}` : ''}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {entry.archivedByName || '—'}
                  {entry.archivedByRole ? (
                    <div className="text-[10px] text-slate-500">{entry.archivedByRole}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-slate-600">{formatDate(entry.archivedAt)}</td>
                <td className="px-3 py-2">
                  <Badge variant="outline" className={`border ${stateBadgeClasses(entry)}`}>
                    {entry.state === 2 ? <Lock className="mr-1 h-2.5 w-2.5" aria-hidden="true" /> : null}
                    {stateLabel(entry)}
                  </Badge>
                </td>
                <td className="px-3 py-2">
                  {entry.isRestorable && canActOnArchive ? (
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" onClick={() => { setRestoreTarget(entry); setReason('') }}>
                        <ArchiveRestore className="mr-1 h-3 w-3" aria-hidden="true" />
                        Restore
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditTarget(entry); setReason(''); setEditJson('') }}
                      >
                        <Pencil className="mr-1 h-3 w-3" aria-hidden="true" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700"
                        onClick={() => { setPurgeTarget(entry); setReason('') }}
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                      </Button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-slate-400">
                      {entry.state === 1 ? 'closed cycle (history)' : '—'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Restore dialog - reason mandatory (invariant A4 restarts the workflow) */}
      <Dialog open={!!restoreTarget} onOpenChange={open => { if (!open) closeDialogs() }}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArchiveRestore className="h-5 w-5 text-emerald-600" aria-hidden="true" />
              Restore to the main capability list
            </DialogTitle>
            <DialogDescription>
              {restoreTarget?.itemTitle ?? ''} returns to <strong>Draft</strong> with a bumped
              revision - the revoked approval does NOT come back to life, and the workflow
              restarts. A restore reason is mandatory for the audit trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm font-medium">Restore reason *</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain why this revoked capability is being reinstated..."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialogs}>Cancel</Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={handleRestore} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Confirm restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit-while-archived dialog (invariant A5) */}
      <Dialog open={!!editTarget} onOpenChange={open => { if (!open) closeDialogs() }}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" aria-hidden="true" />
              Edit archived item
            </DialogTitle>
            <DialogDescription>
              {editTarget?.itemTitle ?? ''} stays in the Archive while you correct it. The edit
              is recorded on the archive entry, and the item only returns to the active list
              when you restore it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm font-medium">Form data (JSON, optional)</Label>
            <Textarea
              value={editJson}
              onChange={e => setEditJson(e.target.value)}
              placeholder='{"field": "new value"}'
              rows={6}
              className="font-mono text-xs"
            />
            <Label className="text-sm font-medium">Edit note (optional)</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="What was corrected and why..."
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialogs}>Cancel</Button>
            <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={handleEdit} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Save edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Purge REQUEST dialog - never deletes (invariant A1) */}
      <Dialog open={!!purgeTarget} onOpenChange={open => { if (!open) closeDialogs() }}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" aria-hidden="true" />
              Request permanent purge
            </DialogTitle>
            <DialogDescription>
              This records a purge REQUEST for review. Nothing is deleted now - data is never
              permanently lost by default.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label className="text-sm font-medium">Purge reason *</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Why is a permanent deletion being requested?"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialogs}>Cancel</Button>
            <Button variant="destructive" onClick={handlePurgeRequest} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Record purge request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
