/**
 * CreateATARecordDialog - ATA Record Creation Dialog (AMENDED v11)
 * 
 * CHANGES (v11):
 * - REMOVED "ALL" option from Shop Capability (Authority) multi-select.
 * - REMOVED "ALL" option from Responsible Workshop multi-select.
 * - All other functionality remains unchanged.
 */
'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, Plus, Check, Building2 } from 'lucide-react'
import { createATARecord, getShops } from '@/lib/self-evaluation/api'
import { routeATARecord } from '@/lib/workflow/shop-routing'
// v21: creating the evaluation folder for a new record IS the Table-of-Contents
// generation — the server composes the applicable sections from the caller's
// role and the request type (shop capability + responsible workshops).
import { createEvaluationFolder } from '@/lib/workflow/workflow-api'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useAuth } from '@/lib/auth-context'
import { useToast } from '@/hooks/use-toast'
import type { ShopDto } from '@/lib/self-evaluation/types'

interface ATAChapterOption {
  id: string
  chapterNumber: string
  title: string
}

interface Props {
  open: boolean
  onClose: () => void
  shopId: string
  ataChapterId?: string
  ataChapterNumber?: string
  /** Optional: provide available ATA chapters for selection when ataChapterId is not set */
  availableATAChapters?: ATAChapterOption[]
}

// Authority options for multi-select (AMENDED: removed 'ALL')
const AUTHORITY_OPTIONS = ['ECAA', 'FAA', 'EASA'] as const

export default function CreateATARecordDialog({ 
  open, 
  onClose, 
  shopId, 
  ataChapterId, 
  ataChapterNumber,
  availableATAChapters = []
}: Props) {
  const { triggerRefresh } = useSelfEvaluation()
  const { user } = useAuth()
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  // Auto-populate shop name from user's assigned shop (display only, not editable)
  const defaultShopName = user?.shopName || user?.shop_name || ''

  // State for ATA chapter selection when not provided via props
  const [selectedATAChapterId, setSelectedATAChapterId] = useState<string>(ataChapterId || '')
  const [selectedATAChapterNum, setSelectedATAChapterNum] = useState<string>(ataChapterNumber || '')

  // Multi-select state for Authority
  const [selectedAuthorities, setSelectedAuthorities] = useState<string[]>([])

  // Multi-select state for Responsible Workshop (shop names from admin's Shop Management)
  const [allShops, setAllShops] = useState<ShopDto[]>([])
  const [selectedWorkshops, setSelectedWorkshops] = useState<string[]>([])
  const [loadingShops, setLoadingShops] = useState(false)

  const [formData, setFormData] = useState({
    description: '',
    partNumber: '',
    selfEvaluationDate: new Date().toISOString().split('T')[0],
    manufacturer: '',
    ata: '', // Direct ATA chapter code text input
    cmmRevDate: '', // Date picker (type="date")
    revNo: '',
    aircraft: '',
    letterRefNo: '',
  })

  // Fetch all shops for the Responsible Workshop multi-select
  useEffect(() => {
    if (open) {
      fetchAllShops()
    }
  }, [open])

  const fetchAllShops = async () => {
    setLoadingShops(true)
    try {
      const shops = await getShops()
      setAllShops(shops)
    } catch (err) {
      console.error('Failed to fetch shops for workshop selection:', err)
    } finally {
      setLoadingShops(false)
    }
  }

  // Sync ATA chapter from props when they change
  useEffect(() => {
    if (ataChapterId) {
      setSelectedATAChapterId(ataChapterId)
    }
    if (ataChapterNumber) {
      setSelectedATAChapterNum(ataChapterNumber)
      setFormData(prev => ({ ...prev, ata: ataChapterNumber || prev.ata }))
    }
  }, [ataChapterId, ataChapterNumber])

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleATAChapterSelect = (chapterId: string) => {
    setSelectedATAChapterId(chapterId)
    const chapter = availableATAChapters.find(c => c.id === chapterId)
    if (chapter) {
      setSelectedATAChapterNum(chapter.chapterNumber)
      setFormData(prev => ({ ...prev, ata: chapter.chapterNumber }))
    }
  }

  // Toggle authority selection (multi-select) - AMENDED: no ALL logic
  const toggleAuthority = (authority: string) => {
    setSelectedAuthorities(prev => {
      if (prev.includes(authority)) {
        return prev.filter(a => a !== authority)
      }
      return [...prev, authority]
    })
  }

  // Toggle workshop selection (multi-select with shop names) - AMENDED: no ALL logic
  const toggleWorkshop = (shopName: string) => {
    setSelectedWorkshops(prev => {
      if (prev.includes(shopName)) {
        return prev.filter(s => s !== shopName)
      }
      return [...prev, shopName]
    })
  }

  const resetForm = () => {
    setFormData({
      description: '',
      partNumber: '',
      selfEvaluationDate: new Date().toISOString().split('T')[0],
      manufacturer: '',
      ata: '',
      cmmRevDate: '',
      revNo: '',
      aircraft: '',
      letterRefNo: '',
    })
    setSelectedAuthorities([])
    setSelectedWorkshops([])
    if (!ataChapterId) {
      setSelectedATAChapterId('')
      setSelectedATAChapterNum('')
    }
  }

  const handleSubmit = async () => {
    if (!formData.description.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Description is required.',
        variant: 'destructive',
      })
      return
    }

    if (!formData.partNumber.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Part Number (P/N) is required.',
        variant: 'destructive',
      })
      return
    }

    const requiredFields: Array<[string, string]> = [
      [formData.manufacturer, 'Manufacturer'],
      [formData.ata.trim() || selectedATAChapterNum, 'ATA'],
      [formData.selfEvaluationDate, 'Self-Evaluation Date'],
      [formData.cmmRevDate, 'CMM Rev Date'],
      [formData.revNo, 'Rev. No'],
      [selectedAuthorities.join(','), 'Shop Capability'],
      [selectedWorkshops.join(','), 'Responsible Workshop'],
    ]
    const missingField = requiredFields.find(([value]) => !value.trim())
    if (missingField) {
      toast({
        title: 'Validation Error',
        description: `${missingField[1]} is required.`,
        variant: 'destructive',
      })
      return
    }

    setSaving(true)
    try {
      const ataCode = formData.ata.trim() || selectedATAChapterNum || ''

      // Build authority string (comma-separated)
      const authorityValue = selectedAuthorities.join(',')

      // Build responsible workshop string (comma-separated shop names)
      const responsibleWorkshopValue = selectedWorkshops.join(',')

      const created = await createATARecord({
        description: formData.description.trim(),
        partNumber: formData.partNumber.trim(),
        selfEvaluationDate: formData.selfEvaluationDate || undefined,
        manufacturer: formData.manufacturer.trim(),
        ataChapterCode: ataCode,
        cmmRevDate: formData.cmmRevDate || undefined,
        revNo: formData.revNo.trim() || undefined,
        aircraft: formData.aircraft.trim() || undefined,
        authority: authorityValue || undefined,
        responsibleWorkshop: responsibleWorkshopValue || undefined,
        ecaaShop: undefined,
        faaShop: undefined,
        letterRefNo: formData.letterRefNo.trim() || undefined,
        shopId,
        ataChapterId: selectedATAChapterId || null,
        componentId: null,
      })

      // AMENDED v14 FEATURE 1: when the record spans multiple shops/teams (the
      // Responsible Workshop multi-select), the system routes it STRICTLY to the
      // designated Shop Team Leader's page of EACH shop — one routing row per shop,
      // resolved server-side; a shop without an active STL comes back as a warning,
      // never a silent drop. Routing failure is non-fatal: the record is created.
      let routedCount = 0
      let routingFailed = false
      const spannedShopIds = allShops
        .filter(s => selectedWorkshops.includes(s.name))
        .map(s => s.id)
      if (spannedShopIds.length > 0 && created?.id) {
        try {
          const result = await routeATARecord(created.id, {
            targets: spannedShopIds.map(id => ({ shopId: id, isPrimary: id === shopId })),
            notes: 'Auto-routed on creation: the record spans multiple shops/teams.',
          })
          routedCount = (result.routings ?? []).length
          for (const w of result.warnings ?? []) {
            toast({ title: 'Routing warning', description: w })
          }
        } catch {
          routingFailed = true
        }
      }

      // v21: generate the Table of Contents for the new record. Non-fatal — the
      // record is kept even if ToC generation fails, same rule as routing.
      let tocItems = 0
      let tocFailed = false
      if (created?.id) {
        try {
          const folder = await createEvaluationFolder({
            ataRecordId: created.id,
            shopId,
            title: `${formData.description.trim()} — P/N ${formData.partNumber.trim()}`,
          })
          tocItems =
            folder.tableOfContents?.sections?.reduce(
              (sum, s) => sum + (s.totalItems ?? 0),
              0,
            ) ?? 0
        } catch {
          tocFailed = true
        }
      }

      toast({
        title: 'ATA Record Created',
        description:
          (routingFailed
            ? `ATA record for P/N ${formData.partNumber} was created, but automatic shop routing failed. Open Shop Routing to send it to the designated Shop Team Leaders.`
            : routedCount > 0
              ? `Created for P/N: ${formData.partNumber} and routed to ${routedCount} shop(s) — each row awaits the designated Shop Team Leader.`
              : `Successfully created ATA record for P/N: ${formData.partNumber}. You can now expand it in the tree to access all child forms.`) +
          (tocFailed
            ? ' Table of Contents generation failed — open the record to retry.'
            : ` Table of Contents generated with ${tocItems} item(s), routed per the applicable roles and request type.`),
      })

      triggerRefresh()
      resetForm()
      onClose()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to create ATA record',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDialogClose = (isOpen: boolean) => {
    if (!isOpen) {
      resetForm()
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto z-[100] p-6">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Plus className="h-4.5 w-4.5 text-emerald-600" />
            </div>
            Create New ATA Record
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            Fill in the details below to create a new ATA Record.
            {selectedATAChapterNum && ` Under ATA Chapter ${selectedATAChapterNum}.`}
            {' '}Fields marked with <span className="text-red-500">*</span> are required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-4">
          {/* Auto-assigned Shop - Compact inline badge */}
          {defaultShopName && (
            <div className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-full px-3 py-1">
              <Check className="h-3.5 w-3.5 text-blue-600" />
              <span className="text-xs text-blue-800 font-medium">
                Shop: {defaultShopName}
              </span>
              <span className="text-[10px] text-blue-500">(auto-assigned)</span>
            </div>
          )}

          {/* ATA Chapter Selection - shown when not provided via props */}
          {!ataChapterId && availableATAChapters.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                ATA Chapter (from list)
                <span className="text-muted-foreground/60 font-normal ml-1">— Optional</span>
              </Label>
              <Select value={selectedATAChapterId} onValueChange={handleATAChapterSelect}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select an ATA Chapter..." />
                </SelectTrigger>
                <SelectContent className="z-[110]">
                  {availableATAChapters.map(ch => (
                    <SelectItem key={ch.id} value={ch.id}>
                      ATA {ch.chapterNumber} — {ch.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Primary Fields - 3 column grid for efficient space usage */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-3">
            {/* Description - full width */}
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
              <Label htmlFor="ata-description" className="text-xs font-medium">
                Description <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ata-description"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="e.g., AIR DATA COMPUTER, FLIGHT CONTROL MODULE"
                className="h-9"
              />
            </div>

            {/* P/N */}
            <div className="space-y-1.5">
              <Label htmlFor="ata-partNumber" className="text-xs font-medium">
                P/N (Part Number) <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ata-partNumber"
                value={formData.partNumber}
                onChange={(e) => handleChange('partNumber', e.target.value)}
                placeholder="e.g., 65-73906-37"
                className="h-9"
              />
            </div>

            {/* Manufacturer */}
            <div className="space-y-1.5">
              <Label htmlFor="ata-manufacturer" className="text-xs font-medium">
                Manufacturer <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ata-manufacturer"
                value={formData.manufacturer}
                onChange={(e) => handleChange('manufacturer', e.target.value)}
                placeholder="e.g., HONEYWELL, COLLINS"
                className="h-9"
              />
            </div>

            {/* ATA Code */}
            <div className="space-y-1.5">
              <Label htmlFor="ata-ata-code" className="text-xs font-medium">
                ATA <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ata-ata-code"
                value={formData.ata}
                onChange={(e) => handleChange('ata', e.target.value)}
                placeholder="e.g., 34, 21-50"
                className="h-9"
              />
            </div>

            {/* Aircraft */}
            <div className="space-y-1.5">
              <Label htmlFor="ata-aircraft" className="text-xs font-medium">
                A/C (Aircraft)
              </Label>
              <Input
                id="ata-aircraft"
                value={formData.aircraft}
                onChange={(e) => handleChange('aircraft', e.target.value)}
                placeholder="e.g., B737/B777/B787"
                className="h-9"
              />
            </div>

            {/* Self-Evaluation Date */}
            <div className="space-y-1.5">
              <Label htmlFor="ata-selfEvalDate" className="text-xs font-medium">
                Self-Evaluation Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ata-selfEvalDate"
                type="date"
                value={formData.selfEvaluationDate}
                onChange={(e) => handleChange('selfEvaluationDate', e.target.value)}
                className="h-9 cursor-pointer"
              />
            </div>

            {/* CMM Rev Date */}
            <div className="space-y-1.5">
              <Label htmlFor="ata-cmmRevDate" className="text-xs font-medium">
                CMM Rev Date <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ata-cmmRevDate"
                type="date"
                value={formData.cmmRevDate}
                onChange={(e) => handleChange('cmmRevDate', e.target.value)}
                className="h-9 cursor-pointer"
              />
            </div>

            {/* Rev No */}
            <div className="space-y-1.5">
              <Label htmlFor="ata-revNo" className="text-xs font-medium">
                Rev. No <span className="text-red-500">*</span>
              </Label>
              <Input
                id="ata-revNo"
                value={formData.revNo}
                onChange={(e) => handleChange('revNo', e.target.value)}
                placeholder="e.g., 72"
                className="h-9"
              />
            </div>

            {/* Letter Ref No */}
            <div className="space-y-1.5">
              <Label htmlFor="ata-letterRefNo" className="text-xs font-medium">
                Letter Ref. No
              </Label>
              <Input
                id="ata-letterRefNo"
                value={formData.letterRefNo}
                onChange={(e) => handleChange('letterRefNo', e.target.value)}
                placeholder="Reference number"
                className="h-9"
              />
            </div>
          </div>

          {/* Authority & Workshop - Side by side on larger screens */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t">
            {/* Authority Multi-Select (AMENDED: no ALL option) */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Shop Capability <span className="text-red-500">*</span></Label>
              <div className="flex flex-wrap gap-1.5">
                {AUTHORITY_OPTIONS.map(option => {
                  const isSelected = selectedAuthorities.includes(option)
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleAuthority(option)}
                      className={`
                        px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-150
                        ${isSelected 
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-sm' 
                          : 'bg-background border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                        }
                      `}
                    >
                      {isSelected && <Check className="h-3 w-3 inline mr-1" />}
                      {option}
                    </button>
                  )
                })}
              </div>
              {selectedAuthorities.length > 0 && (
                <div className="px-2.5 py-1.5 bg-emerald-50/70 border border-emerald-100 rounded-md text-[11px] text-emerald-700">
                  <span className="font-medium">Selected ({selectedAuthorities.length}):</span>{' '}
                  {selectedAuthorities.join(', ')}
                </div>
              )}
            </div>

            {/* Responsible Workshop Multi-Select (AMENDED: no ALL option) */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Responsible Workshop <span className="text-red-500">*</span></Label>
              {loadingShops ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Loading shops...
                </div>
              ) : allShops.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No shops available.</p>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {allShops.map(shop => {
                      const isSelected = selectedWorkshops.includes(shop.name)
                      return (
                        <button
                          key={shop.id}
                          type="button"
                          onClick={() => toggleWorkshop(shop.name)}
                          className={`
                            px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-150
                            ${isSelected 
                              ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-sm' 
                              : 'bg-background border-input text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                            }
                          `}
                        >
                          {isSelected && <Check className="h-3 w-3 inline mr-1" />}
                          <Building2 className="h-3 w-3 inline mr-1" />
                          {shop.name}
                        </button>
                      )
                    })}
                  </div>
                  {selectedWorkshops.length > 0 && (
                    <div className="px-2.5 py-1.5 bg-blue-50/70 border border-blue-100 rounded-md text-[11px] text-blue-700">
                      <span className="font-medium">Selected ({selectedWorkshops.length}):</span>{' '}
                      {selectedWorkshops.join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3 pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => handleDialogClose(false)}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700 text-white w-full sm:w-auto"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                Create ATA Record
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
