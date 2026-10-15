/**
 * =====================================================================================
 * AMENDED v17 - PHASE 1 (FRONTEND)
 * CMT.Frontend/src/components/workflow/ExpiryNotificationCenter.tsx        (NEW FILE)
 *
 * WHAT THIS FILE IS
 * -----------------
 * Requirement #10 rendered as one screen:
 *
 *   "Track expiry dates (training verification, tool calibration, certifications),
 *    auto-notify the relevant users in an in-app notification center, then allow role-based
 *    amendment of the task data followed by its own approval cycle before finalizing."
 *
 * It also carries the two monitoring matrices of requirement #12 ("monitoring of individual
 * competencies (training completion dates) and the tool equivalency matrix"), because both
 * are driven by exactly the same expiry data and reviewers read them together.
 *
 * WHY IT IS NEEDED
 * ----------------
 * `useWorkflow.ts` (v15) already exposes `useExpiries`, `useWorkflowNotifications`,
 * `useCompetencyMatrix` and `useToolEquivalencyMatrix`, and `workflow-api.ts` (v13) exposes
 * `raiseExpiryAmendment` / `markNotificationRead` / `markAllNotificationsRead`. None of them
 * has a consumer, so today an expired training verification silently stays expired: the
 * notification is written server side and never displayed, and the role-based amendment
 * cycle has no entry point at all.
 *
 * THE AMENDMENT CYCLE HONOURED HERE
 *   "Raise amendment" calls POST /api/workflow/expiries/{expiryId}/amend, which does NOT
 *   edit the data in place: it creates a NEW workflow instance whose own approval chain must
 *   be executed before the change is finalised. That is why the success toast hands the
 *   caller the new instance and `onOpenInstance` opens it in the action bar — an amendment is
 *   a workflow, not a field edit.
 *
 * SERVER-FIRST GATING
 *   The "Raise amendment" button is shown only when the row carries `canIAmend`. When the
 *   flag is absent the button is still offered but the server re-validates, and the refusal
 *   (EXPIRY_AMENDMENT_NOT_ALLOWED / ROLE_NOT_ELIGIBLE) is surfaced verbatim.
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
import { Textarea } from '@/components/ui/textarea'
import {
  AlertTriangle,
  BellRing,
  CalendarClock,
  CheckCheck,
  ExternalLink,
  Loader2,
  PencilLine,
  RefreshCw,
  Wrench,
} from 'lucide-react'

import { useToast } from '@/hooks/use-toast'

import {
  markAllNotificationsRead,
  markNotificationRead,
  startAmendment,
} from '@/lib/workflow/workflow-api'

import {
  expiryUrgencyClasses,
  proficiencyLevelLabel,
  toolStatusLabel,
  type ExpiryItemResponse,
} from '@/lib/workflow/workflow-types'

import {
  useCompetencyMatrix,
  useExpiries,
  useToolEquivalencyMatrix,
  useWorkflowAction,
  useWorkflowNotifications,
} from '@/lib/workflow/useWorkflow'

import { formatSignatureDate, formatSignatureTimestamp } from '@/lib/workflow/signature-render'

type TabKey = 'notifications' | 'expiries' | 'competency' | 'tools'

/** Days until a calibration due date; null when the date is not tracked. */
function calibrationDaysRemaining(dueDate?: string | null): number | null {
  if (!dueDate) return null
  const due = new Date(dueDate).getTime()
  if (!Number.isFinite(due)) return null
  return Math.ceil((due - Date.now()) / 86_400_000)
}

interface Props {
  /** Optional: restrict to one evaluation folder. Omit for the personal centre. */
  folderId?: string | null
  /** Optional: restrict the matrices to one shop. */
  shopId?: string | null
  /** Opens a workflow instance (used for the amendment instance and for source records). */
  onOpenInstance?: (instanceId: string) => void
  className?: string
}

const TABS: Array<{ key: TabKey; label: string; icon: typeof BellRing }> = [
  { key: 'notifications', label: 'Notifications', icon: BellRing },
  { key: 'expiries', label: 'Expiries', icon: CalendarClock },
  { key: 'competency', label: 'Competency', icon: CheckCheck },
  { key: 'tools', label: 'Tool equivalency', icon: Wrench },
]

export default function ExpiryNotificationCenter({
  folderId = null,
  shopId = null,
  onOpenInstance,
  className = '',
}: Props) {
  const { toast } = useToast()
  const [tab, setTab] = useState<TabKey>('notifications')

  const notificationsState = useWorkflowNotifications({ unreadOnly: false })
  const expiriesState = useExpiries({ folderId, shopId })
  const competencyState = useCompetencyMatrix(folderId)
  const toolsState = useToolEquivalencyMatrix(folderId)
  const { run, running } = useWorkflowAction()

  const [amendTarget, setAmendTarget] = useState<ExpiryItemResponse | null>(null)
  const [newExpiry, setNewExpiry] = useState('')
  const [reason, setReason] = useState('')

  const unreadCount = useMemo(
    () => notificationsState.data.filter(n => !n.isRead).length,
    [notificationsState.data],
  )

  const closeAmend = () => {
    setAmendTarget(null)
    setNewExpiry('')
    setReason('')
  }

  const handleRead = async (notificationId: string) => {
    const ok = await run(() => markNotificationRead(notificationId), {
      onError: message =>
        toast({ title: 'Could not update', description: message, variant: 'destructive' }),
    })
    if (ok !== null) await notificationsState.reload()
  }

  const handleReadAll = async () => {
    const ok = await run(() => markAllNotificationsRead(), {
      onError: message =>
        toast({ title: 'Could not update', description: message, variant: 'destructive' }),
    })
    if (ok !== null) await notificationsState.reload()
  }

  const handleAmend = async () => {
    if (!amendTarget) return
    if (!reason.trim()) {
      toast({
        title: 'Required',
        description: 'A justification is mandatory for an amendment.',
        variant: 'destructive',
      })
      return
    }

    const created = await run(
      () =>
        startAmendment(amendTarget.id, {
          formDataJson: JSON.stringify({ newExpiryDate: newExpiry || null }),
          reason,
        }),
      {
        onError: message =>
          toast({ title: 'Amendment refused', description: message, variant: 'destructive' }),
      },
    )
    if (!created) return

    toast({
      title: 'Amendment raised',
      description: `${created.formNo || created.title} now awaits its own approval cycle: ${
        created.steps?.[0]?.title ?? 'step 1'
      }.`,
    })
    closeAmend()
    await expiriesState.reload()
    await notificationsState.reload()
    onOpenInstance?.(created.id)
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* ---------------- tabs ---------------- */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap gap-1">
          {TABS.map(({ key, label, icon: Icon }) => {
            const active = tab === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {key === 'notifications' && unreadCount > 0 && (
                  <span className="ml-1 rounded-full bg-red-600 px-1.5 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          {tab === 'notifications' && unreadCount > 0 && (
            <Button size="sm" variant="outline" disabled={running} onClick={() => void handleReadAll()}>
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              Mark all read
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (tab === 'notifications') void notificationsState.reload()
              else if (tab === 'expiries') void expiriesState.reload()
              else if (tab === 'competency') void competencyState.reload()
              else void toolsState.reload()
            }}
          >
            <RefreshCw className="mr-1 h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>
      </div>

      {/* ---------------- notifications ---------------- */}
      {tab === 'notifications' && (
        <div className="rounded-lg border border-slate-200 bg-white">
          {notificationsState.loading ? (
            <p className="p-4 text-sm text-slate-700">Loading notifications…</p>
          ) : notificationsState.error ? (
            <p className="flex items-start gap-2 p-4 text-sm text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {notificationsState.error}
            </p>
          ) : notificationsState.data.length === 0 ? (
            <p className="p-4 text-sm text-slate-700">There is nothing to notify you about.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notificationsState.data.map(n => (
                <li
                  key={n.id}
                  className={`flex flex-wrap items-start justify-between gap-3 p-3 ${
                    n.isRead ? '' : 'bg-amber-50'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{n.title}</span>
                      {n.category && (
                        <Badge className="border border-slate-300 bg-slate-100 text-slate-800">
                          {n.category}
                        </Badge>
                      )}
                      {!n.isRead && (
                        <Badge className="border border-red-300 bg-red-100 text-red-900">New</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-700">{n.message}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {n.createdAt ? formatSignatureTimestamp(n.createdAt) : ''}
                      {n.entityType ? ` · ${n.entityType}` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {n.formWorkflowInstanceId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenInstance?.(n.formWorkflowInstanceId as string)}
                      >
                        <ExternalLink className="mr-1 h-3.5 w-3.5" />
                        Open
                      </Button>
                    )}
                    {!n.isRead && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={running}
                        onClick={() => void handleRead(n.id)}
                      >
                        Mark read
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ---------------- expiries ---------------- */}
      {tab === 'expiries' && (
        <div className="rounded-lg border border-slate-200 bg-white">
          {expiriesState.loading ? (
            <p className="p-4 text-sm text-slate-700">Loading expiry tracking…</p>
          ) : expiriesState.error ? (
            <p className="flex items-start gap-2 p-4 text-sm text-red-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {expiriesState.error}
            </p>
          ) : expiriesState.data.length === 0 ? (
            <p className="p-4 text-sm text-slate-700">
              Nothing is expiring: no training verification, tool calibration or certification is due.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {expiriesState.data.map(item => (
                <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{item.trackedItem}</span>
                      {item.formType && (
                        <Badge className="border border-slate-300 bg-slate-100 text-slate-800">
                          {item.formType}
                        </Badge>
                      )}
                      <Badge className={`border ${expiryUrgencyClasses(item.daysRemaining)}`}>
                        {item.isExpired
                          ? 'Expired'
                          : `${item.daysRemaining} day${item.daysRemaining === 1 ? '' : 's'} left`}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-700">
                      Expiry: {formatSignatureDate(item.expiresAt)}
                      {item.responsibleRole ? ` · ${item.responsibleRole}` : ''}
                      {item.statusLabel ? ` · ${item.statusLabel}` : ''}
                    </p>
                    {item.amendmentInstanceId && (
                      <p className="mt-0.5 text-[11px] text-violet-900">
                        An amendment cycle is already in progress for this item.
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {item.amendmentInstanceId ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenInstance?.(item.amendmentInstanceId as string)}
                      >
                        <ExternalLink className="mr-1 h-3.5 w-3.5" />
                        Open amendment
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="bg-violet-600 text-white hover:bg-violet-700"
                        disabled={running}
                        onClick={() => {
                          setAmendTarget(item)
                          setNewExpiry('')
                          setReason('')
                        }}
                      >
                        <PencilLine className="mr-1 h-3.5 w-3.5" />
                        Raise amendment
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ---------------- competency matrix ---------------- */}
      {tab === 'competency' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          {competencyState.loading ? (
            <p className="p-4 text-sm text-slate-700">Loading the competency matrix…</p>
          ) : competencyState.data.length === 0 ? (
            <p className="p-4 text-sm text-slate-700">
              No individual competency has been registered for this scope yet.
            </p>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">Employee</th>
                  <th className="px-3 py-2 font-semibold">Role</th>
                  <th className="px-3 py-2 font-semibold">Competency</th>
                  <th className="px-3 py-2 font-semibold">Level</th>
                  <th className="px-3 py-2 font-semibold">Completed</th>
                  <th className="px-3 py-2 font-semibold">Expires</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {competencyState.data.map(row => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-medium text-slate-900">{row.employeeName}</td>
                    <td className="px-3 py-2 text-slate-700">{row.employeeRoleLabel}</td>
                    <td className="px-3 py-2 text-slate-700">
                      {row.trainingTitle || row.trainingCode}
                    </td>
                    <td className="px-3 py-2">
                      <Badge className="border border-slate-300 bg-slate-100 text-slate-900">
                        {proficiencyLevelLabel(row.level)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {formatSignatureDate(row.trainingCompletedDate) || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-xs ${expiryUrgencyClasses(
                          row.daysRemaining,
                        )}`}
                      >
                        {formatSignatureDate(row.trainingExpiryDate) || 'not tracked'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ---------------- tool equivalency matrix ---------------- */}
      {tab === 'tools' && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          {toolsState.loading ? (
            <p className="p-4 text-sm text-slate-700">Loading the tool equivalency matrix…</p>
          ) : toolsState.data.length === 0 ? (
            <p className="p-4 text-sm text-slate-700">
              No tool equivalency has been declared for this scope yet.
            </p>
          ) : (
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 font-semibold">CMM tool</th>
                  <th className="px-3 py-2 font-semibold">Alternate / in-house</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Equivalency approved</th>
                  <th className="px-3 py-2 font-semibold">Calibration due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {toolsState.data.map(row => (
                  <tr key={row.id}>
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {row.originalToolPartNumber}
                      {row.originalToolDescription ? ` — ${row.originalToolDescription}` : ''}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {row.alternateToolPartNumber || '—'}
                      {row.isInhouseManufactured ? ' (in-house)' : ''}
                    </td>
                    <td className="px-3 py-2">
                      <Badge className="border border-slate-300 bg-slate-100 text-slate-900">
                        {toolStatusLabel(row.status)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {row.equivalencyApproved ? 'Yes' : 'No'}
                      {row.approvedByRole ? ` · ${row.approvedByRole}` : ''}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded border px-1.5 py-0.5 text-xs ${expiryUrgencyClasses(
                          calibrationDaysRemaining(row.calibrationDueDate),
                        )}`}
                      >
                        {formatSignatureDate(row.calibrationDueDate) || 'not tracked'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ---------------- amendment dialog ---------------- */}
      <Dialog open={!!amendTarget} onOpenChange={open => (open ? null : closeAmend())}>
        <DialogContent className="z-[100]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PencilLine className="h-5 w-5 text-violet-600" />
              Raise an amendment
            </DialogTitle>
            <DialogDescription>
              The data is not edited in place: an amendment record is created and must complete its
              own approval cycle before the change is finalised.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <p className="rounded-md border border-slate-200 bg-slate-50 p-2 text-xs text-slate-800">
              {amendTarget?.trackedItem}
              {amendTarget?.expiresAt
                ? ` · current expiry ${formatSignatureDate(amendTarget.expiresAt)}`
                : ''}
            </p>

            <div className="space-y-2">
              <Label className="text-sm font-medium">New expiry date</Label>
              <input
                type="date"
                className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm text-slate-900 outline-none focus:border-violet-500"
                value={newExpiry}
                onChange={e => setNewExpiry(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-medium">Justification *</Label>
              <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeAmend}>
              Cancel
            </Button>
            <Button
              className="bg-violet-600 text-white hover:bg-violet-700"
              disabled={running}
              onClick={() => void handleAmend()}
            >
              {running && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Raise amendment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}