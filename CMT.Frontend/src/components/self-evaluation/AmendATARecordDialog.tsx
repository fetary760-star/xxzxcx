/**
 * =====================================================================================
 * NEW v20 — AMEND ATA RECORD DIALOG (Feature 3: Editing & Approval Rights)
 * File: CMT.Frontend/src/components/self-evaluation/AmendATARecordDialog.tsx
 *
 * REQUIREMENT:
 *   "If an error occurs during entry, the record must allow editing/amendment of the
 *    fields/option prior to final submission."
 *
 * RULE ENCODED IN `isRecordAmendable()`:
 *   A record stays amendable while it has NOT reached a final state. Draft, Returned
 *   for correction, Rejected and every Pending* review stage are amendable (fix the
 *   entry error and let the approval continue). Approved, Completed, Locked, Revoked,
 *   Expired and Skipped are NOT — after approval the record is only ever LOGGED, never
 *   silently rewritten (see RecordAccountabilityStamp).
 *
 * Every amendment goes through `updateATARecord` (PUT /api/self-evaluation/ata-records/{id})
 * with an `amendmentReason`, so the server-side audit trail records WHO amended WHAT and
 * WHEN — which is exactly what the permanent bottom-section log renders.
 * =====================================================================================
 */

'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Check, Building2, Pencil } from 'lucide-react'
import { updateATARecord, getShops } from '@/lib/self-evaluation/api'
import { ApprovalStatus } from '@/lib/self-evaluation/types'
import type { ATARecordDto, ShopDto } from '@/lib/self-evaluation/types'
import { useToast } from '@/hooks/use-toast'

const AUTHORITY_OPTIONS = ['ECAA', 'FAA', 'EASA'] as const

/**
 * Statuses that close the amendment window. Everything else (Draft, Returned,
 * Rejected, and every Pending* stage of the approval chain) stays editable
 * "prior to final submission".
 */
const NON_AMENDABLE_STATUSES = new Set<number>([
  ApprovalStatus.Approved,
  ApprovalStatus.Skipped,
  ApprovalStatus.Expired,
  ApprovalStatus.Completed,
  ApprovalStatus.Locked,
  ApprovalStatus.Revoked,
])

export function isRecordAmendable(status: number | ApprovalStatus | null | undefined): boolean {
  if (status === null || status === undefined) return false
  return !NON_AMENDABLE_STATUSES.has(Number(status))
}

/** Date-only value for <input type="date">. */
function toDateInput(value?: string | null): string {
  if (!value) return ''
  return value.slice(0, 10)
}

function splitList(value?: string | null): string[] {
  return (value ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
}

interface Props {
  open: boolean
  record: ATARecordDto
  onClose: () => void
  /** Called after a successful amendment (caller refreshes the record list). */
  onSaved?: () => void
}

export default function AmendATARecordDialog({ open, record, onClose, onSaved }: Props) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [amendable, setAmendable] = useState(true)

  const [allShops, setAllShops] = useState<ShopDto[]>([])
  const [selectedAuthorities, setSelectedAuthorities] = useState<string[]>([])
  const [selectedWorkshops, setSelectedWorkshops] = useState<string[]>([])
  const [amendmentReason, setAmendmentReason] = useState('')

  const [formData, setFormData] = useState({
    description: '',
    partNumber: '',
    selfEvaluationDate: '',
    manufacturer: '',
    ata: '',
    cmmRevDate: '',
    revNo: '',
    aircraft: '',
    letterRefNo: '',
  })

  // Hydrate from the record every time the dialog opens for a record.
  useEffect(() => {
    if (!open) return
    setAmendable(isRecordAmendable(record.approvalStatus))
    setFormData({
      description: record.description ?? '',
      partNumber: record.partNumber ?? '',
      selfEvaluationDate: toDateInput(record.selfEvaluationDate),
      manufacturer: record.manufacturer ?? '',
      ata: record.ataChapter || record.ataChapterCode || record.ataChapterNumber || '',
      cmmRevDate: toDateInput(record.cmmRevDate),
      revNo: record.revNo ?? '',
      aircraft: record.aircraft ?? '',
      letterRefNo: record.letterRefNo ?? '',
    })
    setSelectedAuthorities(splitList(record.authority))
    setSelectedWorkshops(splitList(record.responsibleWorkshop))
    setAmendmentReason('')

    let cancelled = false
    getShops()
      .then(shops => {
        if (!cancelled) setAllShops(shops)
      })
      .catch(() => {
        if (!cancelled) setAllShops([])
      })
    return () => {
      cancelled = true
    }
  }, [open, record])

  const handleChange = (field: string, value: string) => {
    setFormData(previous => ({ ...previous, [field]: value }))
  }

  const toggleAuthority = (authority: string) => {
    setSelectedAuthorities(previous =>
      previous.includes(authority)
        ? previous.filter(item => item !== authority)
        : [...previous, authority],
    )
  }

  const toggleWorkshop = (shopName: string) => {
    setSelectedWorkshops(previous =>
      previous.includes(shopName)
        ? previous.filter(item => item !== shopName)
        : [...previous, shopName],
    )
  }

  const handleSubmit = async () => {
    if (!amendable) {
      toast({
        title: 'Record locked',
        description: 'This record has been approved/completed and can no longer be amended.',
        variant: 'destructive',
      })
      return
    }
    if (!formData.description.trim()) {
      toast({ title: 'Validation Error', description: 'Description is required.', variant: 'destructive' })
      return
    }
    if (!formData.partNumber.trim()) {
      toast({ title: 'Validation Error', description: 'Part Number (P/N) is required.', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      await updateATARecord(record.id, {
        description: formData.description.trim(),
        partNumber: formData.partNumber.trim(),
        selfEvaluationDate: formData.selfEvaluationDate || null,
        manufacturer: formData.manufacturer.trim(),
        ataChapterCode: formData.ata.trim(),
        cmmRevDate: formData.cmmRevDate || '',
        revNo: formData.revNo.trim(),
        aircraft: formData.aircraft.trim(),
        authority: selectedAuthorities.join(','),
        responsibleWorkshop: selectedWorkshops.join(','),
        ecaaShop: record.ecaaShop || '',
        faaShop: record.faaShop || '',
        letterRefNo: formData.letterRefNo.trim(),
        shopId: record.shopId,
        ataChapterId: record.ataChapterId ?? null,
        componentId: record.componentId || null,
        amendmentReason:
          amendmentReason.trim() || 'Field amendment prior to final submission',
      })

      toast({
        title: 'Record amended',
        description:
          'The fields were updated and the amendment was logged with your name and the date.',
      })
      onSaved?.()
      onClose()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to amend the record',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}>
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-3xl overflow-y-auto p-6 z-[100]">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
            <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
              <Pencil className="h-4 w-4 text-blue-600" />
            </div>
            Amend ATA Record
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            Correct any entry error before final submission. The amendment is recorded
            with your name, the date and your signature in the permanent log at the
            bottom of the record.
          </DialogDescription>
        </DialogHeader>

        {!amendable ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            This record is <strong>{record.approvalStatus === ApprovalStatus.Approved ? 'approved' : 'finalised'}</strong>.
            Editing is locked; the accountable names, dates and signatures stay in the
            permanent log at the bottom of the record.
          </div>
        ) : (
          <div className="space-y-5 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <Label htmlFor="amend-description" className="text-xs font-medium">
                  Description <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="amend-description"
                  value={formData.description}
                  onChange={(e) => handleChange('description', e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="amend-partNumber" className="text-xs font-medium">
                  P/N (Part Number) <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="amend-partNumber"
                  value={formData.partNumber}
                  onChange={(e) => handleChange('partNumber', e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="amend-manufacturer" className="text-xs font-medium">Manufacturer</Label>
                <Input
                  id="amend-manufacturer"
                  value={formData.manufacturer}
                  onChange={(e) => handleChange('manufacturer', e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="amend-ata" className="text-xs font-medium">ATA</Label>
                <Input
                  id="amend-ata"
                  value={formData.ata}
                  onChange={(e) => handleChange('ata', e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="amend-aircraft" className="text-xs font-medium">A/C (Aircraft)</Label>
                <Input
                  id="amend-aircraft"
                  value={formData.aircraft}
                  onChange={(e) => handleChange('aircraft', e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="amend-selfEvalDate" className="text-xs font-medium">Self-Evaluation Date</Label>
                <Input
                  id="amend-selfEvalDate"
                  type="date"
                  value={formData.selfEvaluationDate}
                  onChange={(e) => handleChange('selfEvaluationDate', e.target.value)}
                  className="h-9 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="amend-cmmRevDate" className="text-xs font-medium">CMM Rev Date</Label>
                <Input
                  id="amend-cmmRevDate"
                  type="date"
                  value={formData.cmmRevDate}
                  onChange={(e) => handleChange('cmmRevDate', e.target.value)}
                  className="h-9 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="amend-revNo" className="text-xs font-medium">Rev. No</Label>
                <Input
                  id="amend-revNo"
                  value={formData.revNo}
                  onChange={(e) => handleChange('revNo', e.target.value)}
                  className="h-9"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="amend-letterRefNo" className="text-xs font-medium">Letter Ref. No</Label>
                <Input
                  id="amend-letterRefNo"
                  value={formData.letterRefNo}
                  onChange={(e) => handleChange('letterRefNo', e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t">
              <div className="space-y-2">
                <Label className="text-xs font-medium">Shop Capability</Label>
                <div className="flex flex-wrap gap-1.5">
                  {AUTHORITY_OPTIONS.map(option => {
                    const isSelected = selectedAuthorities.includes(option)
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => toggleAuthority(option)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-150 ${
                          isSelected
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm'
                            : 'bg-background border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3 inline mr-1" />}
                        {option}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">Responsible Workshop</Label>
                {allShops.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">No shops available.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {allShops.map(shopItem => {
                      const isSelected = selectedWorkshops.includes(shopItem.name)
                      return (
                        <button
                          key={shopItem.id}
                          type="button"
                          onClick={() => toggleWorkshop(shopItem.name)}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-150 ${
                            isSelected
                              ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm'
                              : 'bg-background border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                          }`}
                        >
                          {isSelected && <Check className="h-3 w-3 inline mr-1" />}
                          <Building2 className="h-3 w-3 inline mr-1" />
                          {shopItem.name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t">
              <Label htmlFor="amend-reason" className="text-xs font-medium">
                Amendment reason
              </Label>
              <Input
                id="amend-reason"
                value={amendmentReason}
                onChange={(e) => setAmendmentReason(e.target.value)}
                placeholder="e.g., Corrected P/N typo from entry error"
                className="h-9"
              />
              <p className="text-[10px] text-gray-500">
                Stored with the audit trail so the permanent log shows who amended the record and why.
              </p>
            </div>

            {record.createdBy && (
              <p className="text-[11px] text-gray-500">
                <Badge variant="outline" className="mr-2 text-[10px]">Created by</Badge>
                {record.createdBy}
                {record.createdAt ? ` on ${new Date(record.createdAt).toLocaleDateString()}` : ''}
                <span className="ml-2 text-gray-400">— the creation stamp can never be removed</span>
              </p>
            )}
          </div>
        )}

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">
            Cancel
          </Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
            onClick={handleSubmit}
            disabled={saving || !amendable}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Save Amendment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}