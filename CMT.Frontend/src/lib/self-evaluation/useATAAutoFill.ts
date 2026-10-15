/**
 * useATAAutoFill — SINGLE SOURCE OF TRUTH for cross-form auto-population.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * Every controlled document under the Table of Contents (MNT-1325, MNT-1229B,
 * REQUEST LETTER, MNT 918, MNT 918A, MNT-1420A/B, MNT-1378, MNT 3.14-020,
 * Training Verification ...) repeats the SAME identity block that the shop
 * types once when the ATA Record is created:
 *
 *   Description, P/N, Manufacturer, ATA, A/C, Self-Evaluation Date,
 *   CMM Rev Date, Rev. No, Letter Ref. No, Shop Capability,
 *   Responsible Workshop, and the approver titles/names.
 *
 * Before this hook each form kept its own copy of those fields and only
 * back-filled them from `selectedComponent`, so the values drifted between
 * forms and did not appear at all when the record was created without a
 * linked Component entity.
 *
 * Now the ATA Record is the ONLY writer of the identity block:
 *   - `useATAAutoFill()`      → derives the canonical, formatted values.
 *   - `useATAAutoFillSync()`  → mirrors those values into the form payload so
 *                               they are persisted with the submission.
 * Forms RENDER the values from the hook (never from their own state), which is
 * what makes the population simultaneous across every required form.
 */
'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useSelfEvaluation } from './context'
import { parseMultiSelectField } from './types'

// ===========================================================================
// Date helpers — the hard copies use "28-Jan-2025", inputs use "2025-01-28"
// ===========================================================================

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

/** Normalize any backend date (ISO, ISO+time, "2025-01-28 00:00:00") to yyyy-MM-dd. */
export function toDateInputValue(value?: string | null): string {
  if (!value) return ''
  const raw = String(value).trim()
  if (!raw) return ''

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return ''
  const month = `${parsed.getMonth() + 1}`.padStart(2, '0')
  const day = `${parsed.getDate()}`.padStart(2, '0')
  return `${parsed.getFullYear()}-${month}-${day}`
}

/** Render a date the way the hard copy prints it, e.g. "28-Jan-2025". */
export function toDocumentDate(value?: string | null): string {
  const normalized = toDateInputValue(value)
  if (!normalized) return ''
  const [year, month, day] = normalized.split('-')
  const monthLabel = MONTH_LABELS[Number(month) - 1] ?? month
  return `${day}-${monthLabel}-${year}`
}

/** Today, as a yyyy-MM-dd input value. */
export function todayInputValue(): string {
  return toDateInputValue(new Date().toISOString())
}

// ===========================================================================
// Approver titles — copied verbatim from the signed hard copies
// ===========================================================================

export const APPROVER_TITLES = {
  tnaPreparedBy: 'Shop Team Leader/Engineer',
  tnaApprovedByManager: 'Mgr. Avionics Component Shops',
  tnaApprovedByEngineering: 'TL Componenet Engineering  Support',
  // Tool forms (Alternate Tools Equivalency / In-house Manufactured Tools) follow the
  // same three-signature chain as the Tool Needs Analysis hard copies.
  toolsPreparedBy: 'Shop Team Leader/Engineer',
  toolsApprovedByManager: 'Mgr. Avionics Component Shops',
  toolsApprovedBySpecialTL: 'TL Componenet Engineering  Support',
  auditSelfAuditedBy: 'Team Leader',
  auditApprovedBy: 'Manager',
  letterTo: 'Mgr. QA and Safety, ET-MRO',
  letterFrom: 'Dir. CMT',
  form918Director: 'RESPONSIBLE DIRECTOR',
  form918QAManager: 'Manager Quality Assurance',
  sbPreparedBy: 'Team Leader ET-MRO Documentation',
  adPreparedBy: 'SHOP TEAM LEADER',
} as const

/**
 * Names printed on the reference hard copies. They are used as the default
 * value only — every signature field stays editable so a different signatory
 * can be recorded without touching code.
 */
export const DEFAULT_APPROVER_NAMES = {
  responsibleDirector: 'AYELE GETU',
  letterSignatory: 'AYELE G.',
} as const

// ===========================================================================
// The derived identity block
// ===========================================================================

export interface ATAAutoFillValues {
  /** True when an ATA Record is selected and the block is populated. */
  hasRecord: boolean
  ataRecordId: string

  description: string
  partNumber: string
  manufacturer: string
  /** ATA chapter code, e.g. "25-39-44". */
  ata: string
  aircraft: string

  /** yyyy-MM-dd, for <Input type="date"> */
  selfEvaluationDate: string
  cmmRevDate: string
  /** dd-MMM-yyyy, for printed document cells */
  selfEvaluationDateLabel: string
  cmmRevDateLabel: string

  revNo: string
  letterRefNo: string

  /** Raw comma-separated authority value, e.g. "ECAA,FAA". */
  shopCapability: string
  shopCapabilityList: string[]
  /** Raw comma-separated workshop value, e.g. "GALLEY SHOP,ELECTRIC SHOP". */
  responsibleWorkshop: string
  responsibleWorkshopList: string[]

  /** Owning shop of the record (falls back to the tree selection). */
  shopName: string
  /** Model / series when a Component entity is linked. */
  model: string
  /** ET stock number when a Component entity is linked. */
  etPartNumber: string

  responsibleDirector: string
  letterSignatory: string
}

/**
 * Derive the canonical identity block for the currently selected ATA Record.
 * The ATA Record always wins; `selectedComponent` / `selectedShop` are only
 * consulted for values the record does not carry.
 */
export function useATAAutoFill(): ATAAutoFillValues {
  const { selectedATARecord, selectedComponent, selectedATAChapter, selectedShop } = useSelfEvaluation()

  return useMemo<ATAAutoFillValues>(() => {
    const record = selectedATARecord

    const ata =
      record?.ataChapter ||
      record?.ataChapterCode ||
      record?.ataChapterNumber ||
      selectedComponent?.ataChapterNumber ||
      selectedATAChapter?.chapterNumber ||
      ''

    const shopCapability = record?.authority || ''
    const responsibleWorkshop = record?.responsibleWorkshop || ''

    return {
      hasRecord: Boolean(record?.id),
      ataRecordId: record?.id || '',

      description: record?.description || selectedComponent?.description || '',
      partNumber: record?.partNumber || selectedComponent?.partNumber || '',
      manufacturer: record?.manufacturer || selectedComponent?.manufacturer || '',
      ata,
      aircraft: record?.aircraft || '',

      selfEvaluationDate: toDateInputValue(record?.selfEvaluationDate),
      cmmRevDate: toDateInputValue(record?.cmmRevDate),
      selfEvaluationDateLabel: toDocumentDate(record?.selfEvaluationDate),
      cmmRevDateLabel: toDocumentDate(record?.cmmRevDate),

      revNo: record?.revNo || '',
      letterRefNo: record?.letterRefNo || '',

      shopCapability,
      shopCapabilityList: parseMultiSelectField(shopCapability),
      responsibleWorkshop,
      responsibleWorkshopList: parseMultiSelectField(responsibleWorkshop),

      shopName: record?.shop || selectedShop?.name || '',
      model: selectedComponent?.modelSeries || '',
      etPartNumber: '',

      responsibleDirector: DEFAULT_APPROVER_NAMES.responsibleDirector,
      letterSignatory: DEFAULT_APPROVER_NAMES.letterSignatory,
    }
  }, [selectedATARecord, selectedComponent, selectedATAChapter, selectedShop])
}

/**
 * Mirror auto-filled values into the form payload so they are stored with the
 * submission and exported exactly as displayed.
 *
 * @param setFormData state setter returned by `useFormData`
 * @param patch       the auto-filled slice of the form payload
 * @param resyncOn    extra values that must force a re-sync, typically the
 *                    `loading` flag so a freshly loaded submission is refreshed
 */
export function useATAAutoFillSync<T extends Record<string, unknown>>(
  setFormData: React.Dispatch<React.SetStateAction<T>>,
  patch: Partial<T>,
  resyncOn: ReadonlyArray<unknown> = [],
): void {
  const serializedPatch = JSON.stringify(patch)
  const serializedDeps = JSON.stringify(resyncOn)

  const setFormDataRef = useRef(setFormData)
  setFormDataRef.current = setFormData

  useEffect(() => {
    const next = JSON.parse(serializedPatch) as Record<string, unknown>

    setFormDataRef.current(prev => {
      const current = prev as unknown as Record<string, unknown>
      const changedKeys = Object.keys(next).filter(key => current[key] !== next[key])
      if (changedKeys.length === 0) return prev
      return { ...prev, ...(next as Partial<T>) }
    })
  }, [serializedPatch, serializedDeps])
}