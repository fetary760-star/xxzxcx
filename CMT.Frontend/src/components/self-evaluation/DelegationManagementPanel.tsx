/**
 * =====================================================================================
 * NEW v20 — WORKLOAD DELEGATION PANEL (Feature 1: Delegation / Workload Management)
 * File: CMT.Frontend/src/components/self-evaluation/DelegationManagementPanel.tsx
 *
 * REQUIREMENT:
 *   "When a Shop Team Leader has a high workload, they can delegate the role/permission
 *    to another authorized user to create a New ATA Record."
 *
 * WHO OPENS THIS: a user who can already create ATA records (Shop Team Leader, Special
 * Team Leader, Shop Manager, Admin) — the DELEGATOR. They grant
 * `ata_record_creation` to another user for a bounded period.
 *
 * WHO BENEFITS: the DELEGATEE. `useAtaCreationPermission()` (delegation-api.ts) consults
 * the active grants, so the delegatee automatically sees the "Create New ATA Record"
 * button without any role change. The record they create still carries THEIR name in
 * `createdBy`, so the accountability watermark stays truthful.
 *
 * The list shows every grant ever issued (including Revoked) for transparency; only
 * Active grants can be revoked, and revoking takes effect immediately because
 * `useAtaCreationPermission` re-reads on the next mount/navigation.
 * =====================================================================================
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import { CalendarClock, Loader2, UserPlus, Users } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import {
  DELEGATION_RESPONSIBILITY_ATA_CREATION,
  createDelegation,
  isActiveDelegation,
  listDelegations,
  revokeDelegation,
  type DelegationRow,
} from '@/lib/self-evaluation/delegation-api'
import { getUsers, type UserDto } from '@/lib/self-evaluation/api'
import { DelegationStatus } from '@/lib/self-evaluation/types'

const RESPONSIBILITY_LABEL: Record<string, string> = {
  [DELEGATION_RESPONSIBILITY_ATA_CREATION]: 'Create New ATA Record',
}

function statusBadge(status: DelegationStatus, row: DelegationRow) {
  if (status === DelegationStatus.Active && !isActiveDelegation(row)) {
    return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">Expired</Badge>
  }
  switch (status) {
    case DelegationStatus.Active:
      return <Badge className="bg-emerald-100 text-[10px] text-emerald-700">Active</Badge>
    case DelegationStatus.Revoked:
      return <Badge variant="outline" className="border-red-200 bg-red-50 text-[10px] text-red-600">Revoked</Badge>
    case DelegationStatus.Expired:
      return <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">Expired</Badge>
    default:
      return <Badge variant="outline" className="text-[10px] text-gray-500">Unknown</Badge>
  }
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

interface Props {
  open: boolean
  onClose: () => void
  /** Delegator's shop — new grants are scoped to it when known. */
  shopId?: string
}

export default function DelegationManagementPanel({ open, onClose, shopId }: Props) {
  const { toast } = useToast()

  const [rows, setRows] = useState<DelegationRow[]>([])
  const [loading, setLoading] = useState(false)
  const [users, setUsers] = useState<UserDto[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)

  const [delegateToUserId, setDelegateToUserId] = useState('')
  const [expirationDate, setExpirationDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listDelegations(true)
      setRows(data)
    } catch (err) {
      toast({
        title: 'Could not load delegations',
        description: err instanceof Error ? err.message : 'Please retry.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (!open) return
    void load()
    let cancelled = false
    setLoadingUsers(true)
    getUsers({ role: 'CertifyingStaff', shopId, isActive: true })
      .then(list => {
        if (!cancelled) setUsers(list)
      })
      .catch(() => {
        if (!cancelled) setUsers([])
      })
      .finally(() => {
        if (!cancelled) setLoadingUsers(false)
      })
    return () => {
      cancelled = true
    }
  }, [open, load])

  const resetForm = () => {
    setDelegateToUserId('')
    setExpirationDate('')
    setReason('')
  }

  const handleGrant = async () => {
    if (!delegateToUserId) {
      toast({ title: 'Required', description: 'Select the user who will receive the permission.', variant: 'destructive' })
      return
    }
    const target = users.find(u => String(u.userId) === delegateToUserId || u.id === delegateToUserId)
    if (!target) {
      toast({ title: 'Required', description: 'The selected user could not be resolved. Pick them again.', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      await createDelegation({
        responsibility: DELEGATION_RESPONSIBILITY_ATA_CREATION,
        delegatedToUserId: Number(target.userId),
        delegatedTo: target.fullName || target.username,
        scope: 'Create New ATA Record on behalf of the delegator',
        expirationDate: expirationDate || undefined,
        reason: reason.trim() || 'High workload — record creation delegated',
        shopId: shopId || undefined,
      })
      toast({
        title: 'Permission delegated',
        description: `${target.fullName || target.username} can now create New ATA Records${expirationDate ? ` until ${formatDate(expirationDate)}` : ''}.`,
      })
      resetForm()
      await load()
    } catch (err) {
      toast({
        title: 'Could not delegate',
        description: err instanceof Error ? err.message : 'Please retry.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleRevoke = async (row: DelegationRow) => {
    setRevokingId(row.id)
    try {
      await revokeDelegation(row.id, 'Revoked by delegator')
      toast({ title: 'Delegation revoked', description: `${row.delegatedTo} can no longer create records on your behalf.` })
      await load()
    } catch (err) {
      toast({
        title: 'Could not revoke',
        description: err instanceof Error ? err.message : 'Please retry.',
        variant: 'destructive',
      })
    } finally {
      setRevokingId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto p-6 z-[100]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <Users className="h-5 w-5 text-emerald-600" />
            Delegate Record Creation
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            When your workload is high, assign a designated Certifying Staff member to
            create or update ATA record entries on your behalf. The grant is time-boxed and can be
            revoked at any moment; every record they create still carries their own name
            in the accountability stamp.
          </DialogDescription>
        </DialogHeader>

        {/* New grant */}
        <div className="space-y-3 rounded-lg border bg-gray-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">New delegation</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Assign Certifying Staff <span className="text-red-500">*</span></Label>
              <Select value={delegateToUserId} onValueChange={setDelegateToUserId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={loadingUsers ? 'Loading users…' : 'Select a user…'} />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {users.map(u => (
                    <SelectItem key={u.id} value={String(u.userId)}>
                      {u.fullName || u.username} — {u.roleDisplayName || u.role}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Valid until</Label>
              <div className="relative">
                <CalendarClock className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <Input
                  type="date"
                  value={expirationDate}
                  onChange={e => setExpirationDate(e.target.value)}
                  className="h-9 pl-8"
                />
              </div>
              <p className="text-[10px] text-gray-500">Leave empty for an open-ended grant.</p>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Reason / context</Label>
            <Input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g., High workload this week"
              className="h-9"
            />
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleGrant}
              disabled={saving || loadingUsers}
              className="bg-emerald-600 text-white hover:bg-emerald-700"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
              Grant permission
            </Button>
          </div>
        </div>

        {/* Existing grants */}
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">
              Delegations issued ({rows.length})
            </p>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
          </div>

          {!loading && rows.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-gray-500">
              No delegations yet. Grant one above when your workload is high.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {rows.map(row => (
                <li key={row.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {row.delegatedTo || '—'}
                      <span className="ml-2 text-[11px] font-normal text-gray-500">
                        {RESPONSIBILITY_LABEL[row.responsibility] ?? row.responsibility}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      {formatDate(row.effectiveDate)} → {row.expirationDate ? formatDate(row.expirationDate) : 'Open-ended'}
                      {row.reason ? ` • ${row.reason}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    {statusBadge(row.status, row)}
                    {row.status === DelegationStatus.Active && isActiveDelegation(row) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-[11px] text-red-600 hover:bg-red-50 hover:text-red-700"
                        disabled={revokingId === row.id}
                        onClick={() => void handleRevoke(row)}
                      >
                        {revokingId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Revoke'}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter className="border-t pt-3">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}