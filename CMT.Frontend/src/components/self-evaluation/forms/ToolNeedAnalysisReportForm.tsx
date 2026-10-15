/**
 * =====================================================================================
 * AMENDED v25 — ITEM 4: TOOL NEED ANALYSIS REPORT (MNT-1229B)
 * Copy to: CMT.Frontend/src/components/self-evaluation/forms/ToolNeedAnalysisReportForm.tsx
 *
 * v25 ADDS ONE THING ONLY: EXCEL MULTI-ROW PASTE INTO THE DYNAMIC TOOL TABLE.
 * -------------------------------------------------------------------------
 * WHAT WAS WRONG
 *   The 13-column REQUIRED / AVAILABLE table renders one <Input> per cell. A browser's
 *   DEFAULT paste behaviour is "drop the entire clipboard string into the focused text box",
 *   so when an engineer copied a VERTICAL column of part numbers out of Excel and pasted it
 *   into the first "Mfg P/N" (or "Model", "Description", ...) cell, all values were
 *   concatenated into that ONE cell. The operator then had to click "+ Add Tool" n times and
 *   re-type every single row by hand.
 *
 * WHAT THIS VERSION DOES — the four required behaviours
 *   (P1) INTERCEPT   — `onPaste` on every editable cell calls `event.preventDefault()` as
 *                      soon as the clipboard carries more than one value, so the browser
 *                      never performs its single-cell paste.
 *   (P2) SPLIT       — the clipboard is parsed as Excel TSV: TAB between cells, newline
 *                      between rows, with RFC-4180 quoting honoured so a multi-line
 *                      "Description" cell is not torn into bogus rows.
 *   (P3) AUTO-ADD    — the table is grown by calling the SAME `createItem()` factory that the
 *                      "+ Add Tool" button uses, as many times as the pasted block needs, so a
 *                      30-row paste onto an empty table produces 30 numbered rows.
 *   (P4) DISTRIBUTE  — pasted row 0 lands on the cell that received the paste, row 1 on the
 *                      next row, and so on DOWNWARDS. When the copied Excel range is also
 *                      several columns wide, the extra columns spill RIGHTWARDS across the
 *                      declared column order (TOOL_COLUMNS) exactly as in a spreadsheet.
 *
 *   A single-value clipboard is deliberately left to the browser, so pasting one value into
 *   the middle of an existing cell keeps its normal caret behaviour.
 *
 * EVERYTHING ELSE IS UNCHANGED from v24: the automatic name / date / signature wiring
 * ((1)..(5) below), the locked controlled-document meta (MNT-1229B / Rev. 17 /
 * 01-July-2024), the ENG.APU identity band, the ET P/N MaintainX fetch, the Usage /
 * Acqusition code legends, both instructions and the confirmation statement.
 *
 * -------------------------------------------------------------------------------------
 * v24 NOTES (kept verbatim, still in force)
 *   (1) resolve the workflow instance of THIS form   -> `useFormWorkflowInstance`
 *   (2) pass `formType` + `instance` to the block    -> unlocks captions + automatic values
 *   (3) add `slotIndex` to every declared row        -> pins each line to its matrix slot
 *   (4) reload the instance on any status change     -> an approval repaints immediately
 *   (5) the action bar is gated by the server's canIAct / canIDelegate flags
 * =====================================================================================
 */
'use client'

import { useCallback, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useFormData } from '@/lib/self-evaluation/useFormData'
import { useEtPartNumber } from '@/lib/maintainx/useEtPartNumber'
import {
  APPROVER_TITLES,
  useATAAutoFill,
  useATAAutoFillSync,
} from '@/lib/self-evaluation/useATAAutoFill'
// (P1)..(P4) Excel multi-row paste support shared by every dynamic-row controlled document.
import { createRowId, useGridPasteHandler } from '@/lib/self-evaluation/useGridPaste'
import type { FormNodeType } from '@/lib/self-evaluation/types'
// (1) THE MISSING WIRING LINK — resolves the FormWorkflowInstance of this form.
import { useFormWorkflowInstance } from '@/lib/workflow/useFormWorkflowInstance'
import { useFormEditAuthority } from '@/lib/workflow/useFormEditAuthority'
import {
  DocumentHeader,
  FormToolbar,
  FormWorkflowFooter,
  SignatureBlock,
} from './FormDocumentChrome'

const FORM_NO = 'MNT-1229B'
const FORM_REV_NO = '17'
const FORM_REV_DATE = '01-July-2024'
const FORM_TITLE = 'TOOL NEED ANALYSIS REPORT'
const FORM_SUBTITLE = 'ENGINE/APU/COMPONENT CAPABILITY DEVELOPMENT'

const USAGE_CODES = [
  '1. Test',
  '2. Repair',
  '3. Overhaul',
  '4. Other: Please specify  special procedure,disassembly,cleaning , aseembly or special procedures.',
]

const ACQUISITION_CODES = [
  '1. OEM specified',
  '2. Equivalent',
  '3. Inhouse manufactured',
  '4. Other:______; Please specify;___________',
]

const INSTRUCTIONS = [
  'If the available tools/equipment is identified by Kit P/N, cross-refer the  subassemblies to the kit P/N by listing subassembly P/Ns under Description column.',
  'The certificate of equivalency from engineering section must be attached to the CMM.',
]

const CONFIRMATION_STATEMENT =
  'I confirm that this evaluation is conducted using information available on the Component Maintenance Manual and other available technical documentation.'

interface ToolItem {
  id: string
  itemNo: number
  requiredModel: string
  requiredMfgPN: string
  requiredDescription: string
  requiredQty: string
  requiredManufacturer: string
  usageCode: string
  availableModel: string
  availableMfgPN: string
  availableDescription: string
  availableManufacturer: string
  acquisitionCode: string
  locationByShop: string
}

/**
 * (P4) THE PRINTED COLUMN ORDER — the single source of truth for the horizontal spill of a
 * multi-column Excel paste. It MUST stay in the same left-to-right order as the <td> cells
 * of the table body below; `Item` is excluded because it is a computed sequence number and
 * the trailing remove-button column is not a data cell.
 */
const TOOL_COLUMNS = [
  'requiredModel',
  'requiredMfgPN',
  'requiredDescription',
  'requiredQty',
  'requiredManufacturer',
  'usageCode',
  'availableModel',
  'availableMfgPN',
  'availableDescription',
  'availableManufacturer',
  'acquisitionCode',
  'locationByShop',
] as const

type ToolColumn = (typeof TOOL_COLUMNS)[number]

const TOOL_COLUMN_LABELS: Record<ToolColumn, string> = {
  requiredModel: 'Required Model',
  requiredMfgPN: 'Required Mfg P/N',
  requiredDescription: 'Required Description',
  requiredQty: 'Required Quantity',
  requiredManufacturer: 'Required Manufacturer',
  usageCode: 'Usage Code',
  availableModel: 'Available Model',
  availableMfgPN: 'Available Mfg P/N',
  availableDescription: 'Available Description',
  availableManufacturer: 'Available Manufacturer',
  acquisitionCode: 'Acquisition Code',
  locationByShop: 'Location by Shop',
}

interface FormData extends Record<string, unknown> {
  /** Auto-filled identity band. */
  compDesc: string
  model: string
  mfgPN: string
  manufacturer: string
  cmmAtaChapter: string
  cmmRevNo: string
  cmmRevDate: string
  /** Stock number — manually captured. */
  etPN: string

  items: ToolItem[]

  /**
   * The signature fields are kept so a form whose workflow has not started still behaves
   * exactly as before. Once a step is executed the printed value comes from the WORKFLOW and
   * these become read-only (the layer locks them).
   */
  preparedBy: string
  preparedByDate: string
  approvedByManager: string
  approvedByManagerDate: string
  approvedByEngineering: string
  approvedByEngineeringDate: string
}

interface Props {
  variant: 'tna' | 'full_report'
}

/**
 * The one and only row factory. Used by BOTH the "+ Add Tool" button and the paste handler,
 * so a pasted row is byte-identical to a hand-added one.
 *
 * `createRowId()` replaces the previous `Date.now()` id: a 40-row paste creates 40 rows in
 * the same millisecond, which would otherwise produce duplicate ids and make `updateItem()`
 * edit several rows at once.
 */
const createItem = (itemNo: number): ToolItem => ({
  id: createRowId('tool'),
  itemNo,
  requiredModel: '',
  requiredMfgPN: '',
  requiredDescription: '',
  requiredQty: '',
  requiredManufacturer: '',
  usageCode: '',
  availableModel: '',
  availableMfgPN: '',
  availableDescription: '',
  availableManufacturer: '',
  acquisitionCode: '',
  locationByShop: '',
})

function validateToolItems(items: ToolItem[]): string[] {
  if (items.length === 0) return ['Add at least one tool row before submitting.']

  const issues = new Set<string>()
  items.forEach((item, index) => {
    const expectedItemNo = index + 1
    if (item.itemNo !== expectedItemNo) {
      issues.add('Item numbers must start at 1 and continue sequentially without gaps.')
    }

    TOOL_COLUMNS.forEach(column => {
      const value = String(item[column] ?? '').trim()
      if (!value || value === '-' || value === '—') {
        issues.add(`Row ${expectedItemNo}: ${TOOL_COLUMN_LABELS[column]} needs a value or N/A.`)
      }
    })
  })

  return [...issues]
}

export default function ToolNeedAnalysisReportForm({ variant }: Props) {
  const [showSubmissionValidation, setShowSubmissionValidation] = useState(false)
  const { selectedATARecord } = useSelfEvaluation()
  const auto = useATAAutoFill()
  // ET P/N lookup through the MaintainX connector (MNT-1229B is one of the only
  // two sheets that print an ET P/N box — see ET_PN_FORMS in maintainx-connector).
  const etpn = useEtPartNumber()

  const formType: FormNodeType = variant === 'full_report' ? 'tool_need_analysis_report' : 'tna'

  const defaultData: FormData = {
    compDesc: auto.description,
    model: auto.model,
    mfgPN: auto.partNumber,
    manufacturer: auto.manufacturer,
    cmmAtaChapter: auto.ata,
    cmmRevNo: auto.revNo,
    cmmRevDate: auto.cmmRevDateLabel,
    etPN: '',
    items: [],
    preparedBy: '',
    preparedByDate: auto.selfEvaluationDate,
    approvedByManager: '',
    approvedByManagerDate: '',
    approvedByEngineering: '',
    approvedByEngineeringDate: '',
  }

  const {
    formData,
    setFormData,
    isEditing,
    setIsEditing,
    approvalStatus,
    formSubmissionId,
    loading,
    saving,
    canEdit,
    canSubmit,
    handleSave,
    handleSubmitForApproval,
    loadFromBackend,
  } = useFormData<FormData>(defaultData, {
    formType,
    formNo: FORM_NO,
    revNo: FORM_REV_NO,
    revDate: FORM_REV_DATE,
  })

  /**
   * (1) THE WORKFLOW INSTANCE OF THIS FORM.
   *
   * `formSubmissionId` (FormSubmission Guid) is NOT the FormWorkflowInstance id, which is why
   * no document could reach its executed steps before. This hook resolves it through the
   * documented four-step chain and never throws: when nothing resolves, `instance` is null
   * and the block prints the blank hard-copy rules.
   */
  const { instance, reload: reloadInstance } = useFormWorkflowInstance({
    formSubmissionId,
    folderId: selectedATARecord?.evaluationFolderId,
  })

  /**
   * ROLE-BASED EDIT AUTHORITY — the ownership gate `useFormData()` cannot know. Without
   * it every holder of a preparing role saw Edit / Submit on every draft, including one
   * that belongs to another preparer. The hook narrows `canEdit` to: the pending step is
   * mine (or, at draft stage, I am the originator), and my own printed line is not
   * already signed. It can only ever make the button stricter.
   */
  const authority = useFormEditAuthority({
    formType,
    instance,
    stageAllowsEdit: canEdit,
  })

  useATAAutoFillSync<FormData>(
    setFormData,
    {
      compDesc: auto.description,
      model: auto.model,
      mfgPN: auto.partNumber,
      manufacturer: auto.manufacturer,
      cmmAtaChapter: auto.ata,
      cmmRevNo: auto.revNo,
      cmmRevDate: auto.cmmRevDateLabel,
    },
    [loading, auto.ataRecordId],
  )

  /**
   * Fetch the ET P/N from MaintainX for THIS ATA Record: the resolver walks
   * Task Definition (ATA code) -> Applicability tab (component P/N) -> Details tab
   * and returns the bare stock number only — "25H0026 (SLIDE AY)" is applied as
   * "25H0026", never with the description. When the connector is disabled or
   * unreachable the field simply stays manually editable.
   */
  const runEtPartNumberFetch = async () => {
    const resolved = await etpn.fetchEtPartNumber({
      ataCode: auto.ata,
      partNumber: auto.partNumber || formData.mfgPN,
      formNo: FORM_NO,
      ataRecordId: auto.ataRecordId,
    })
    if (resolved?.found) {
      setFormData(prev => ({ ...prev, etPN: resolved.etPartNumber }))
    }
  }

  const updateItem = (id: string, patch: Partial<ToolItem>) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => (item.id === id ? { ...item, ...patch } : item)),
    }))
  }

  const addItem = () => {
    setFormData(prev => ({ ...prev, items: [...prev.items, createItem(prev.items.length + 1)] }))
  }

  const removeItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items
        .filter(item => item.id !== id)
        .map((item, index) => ({ ...item, itemNo: index + 1 })),
    }))
  }

  /**
   * (P3) The row factory handed to the paste engine — literally the "+ Add Tool" behaviour,
   * expressed for a zero-based target index.
   */
  const createPastedRow = useCallback((index: number) => createItem(index + 1), [])

  /** Commit as an updater so a paste always builds on the freshest rows, never on stale state. */
  const commitRows = useCallback(
    (updater: (rows: ToolItem[]) => ToolItem[]) => {
      setFormData(prev => ({ ...prev, items: updater(prev.items) }))
    },
    [setFormData],
  )

  /** Keep the printed "Item" sequence at 1..n, exactly as `removeItem()` already does. */
  const renumberRows = useCallback(
    (item: ToolItem, index: number) =>
      item.itemNo === index + 1 ? item : { ...item, itemNo: index + 1 },
    [],
  )

  /**
   * (P1)..(P4) THE PASTE HANDLER.
   * Wired to every editable cell of the table; inert while the document is read-only.
   */
  const handleCellPaste = useGridPasteHandler<ToolItem>({
    columns: TOOL_COLUMNS,
    createRow: createPastedRow,
    commit: commitRows,
    renumber: renumberRows,
    enabled: isEditing,
  })

  const submissionValidationIssues = validateToolItems(formData.items)
  const submitForApproval = async () => {
    setShowSubmissionValidation(true)
    if (submissionValidationIssues.length > 0) return
    await handleSubmitForApproval()
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  /**
   * Small helper so every editable cell keeps the same printed geometry — now also the single
   * place where the Excel paste interception is attached, so no cell can be forgotten.
   */
  const cell = (rowIndex: number, item: ToolItem, column: ToolColumn, className = '') =>
    isEditing ? (
      <Input
        value={String(item[column] ?? '')}
        onChange={event =>
          updateItem(item.id, { [column]: event.target.value } as Partial<ToolItem>)
        }
        onPaste={event => handleCellPaste(event, rowIndex, column)}
        className={`h-7 min-w-[70px] text-[11px] ${className}`}
      />
    ) : (
      <span className="text-[11px]">{String(item[column] ?? '')}</span>
    )

  return (
    <div className="space-y-4">
      <FormToolbar
        title={variant === 'full_report' ? 'TOOL NEED ANALYSIS REPORT' : 'TNA'}
        meta={`FORM No. ${FORM_NO} · Rev. No. ${FORM_REV_NO} · Rev. Date ${FORM_REV_DATE}`}
        approvalStatus={approvalStatus}
        canEdit={authority.canEdit}
        isEditing={isEditing}
        saving={saving}
        onEdit={() => setIsEditing(true)}
        onCancel={() => {
          setIsEditing(false)
          void loadFromBackend()
        }}
        onSave={() => void handleSave()}
      />

      <Card>
        <CardContent className="p-3 space-y-0">
          <DocumentHeader
            title={FORM_TITLE}
            subtitle={FORM_SUBTITLE}
            meta={[
              { label: 'FORM No.:', value: FORM_NO },
              { label: 'Rev. No.', value: FORM_REV_NO },
              { label: 'Rev. Date:', value: FORM_REV_DATE },
            ]}
          />

          {/* ---- ENG.APU OR COMP.DATA band ---------------------------------- */}
          <div className="border border-gray-400 border-t-0 text-[11px]">
            <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-gray-300">
              <div className="px-2 py-1.5">
                <p className="text-[9px] uppercase text-gray-500">ENG.APU OR COMP.DATA: DESC.:</p>
                <p className="font-semibold text-gray-900">{formData.compDesc || '—'}</p>
              </div>
              <div className="px-2 py-1.5">
                <p className="text-[9px] uppercase text-gray-500">MODEL:</p>
                <p className="font-semibold text-gray-900">{formData.model || '-'}</p>
              </div>
              <div className="px-2 py-1.5">
                <p className="text-[9px] uppercase text-gray-500">MFG P/N:</p>
                <p className="font-semibold text-gray-900">{formData.mfgPN || '—'}</p>
              </div>
              <div className="px-2 py-1.5">
                <p className="text-[9px] uppercase text-gray-500">Manufacturer:</p>
                <p className="font-semibold text-gray-900">{formData.manufacturer || '—'}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 border-t border-gray-300 divide-y sm:divide-y-0 sm:divide-x divide-gray-300">
              <div className="px-2 py-1.5">
                <p className="text-[9px] uppercase text-gray-500">CMM DATA.ATA CHAPTER:</p>
                <p className="font-semibold text-gray-900">{formData.cmmAtaChapter || '—'}</p>
              </div>
              <div className="px-2 py-1.5">
                <p className="text-[9px] uppercase text-gray-500">REV.NO:</p>
                <p className="font-semibold text-gray-900">{formData.cmmRevNo || '—'}</p>
              </div>
              <div className="px-2 py-1.5">
                <p className="text-[9px] uppercase text-gray-500">REV.DATE:</p>
                <p className="font-semibold text-gray-900">{formData.cmmRevDate || '—'}</p>
              </div>
              <div className="px-2 py-1.5">
                <p className="text-[9px] uppercase text-gray-500">ET P/N:</p>
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <Input
                      value={formData.etPN}
                      onChange={event => {
                        // A hand-typed value invalidates the previous fetch outcome.
                        etpn.clearHint()
                        setFormData(prev => ({ ...prev, etPN: event.target.value }))
                      }}
                      className="h-7 min-w-0 flex-1 text-[11px]"
                      placeholder="e.g. 25H0026"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 flex-shrink-0 px-2 text-[10px]"
                      disabled={etpn.fetching || !auto.ata || !(auto.partNumber || formData.mfgPN)}
                      title={
                        etpn.canFetch
                          ? 'Read the stock number from the MaintainX Details tab (description stripped)'
                          : 'MaintainX lookup is not configured on this server — type the stock number manually'
                      }
                      onClick={() => void runEtPartNumberFetch()}
                    >
                      <RefreshCw className={`h-3 w-3 mr-1 ${etpn.fetching ? 'animate-spin' : ''}`} />
                      Fetch
                    </Button>
                  </div>
                ) : (
                  <p className="font-semibold text-gray-900">{formData.etPN || '—'}</p>
                )}
                {isEditing && etpn.hint && (
                  <p
                    className={`mt-0.5 text-[9px] leading-tight ${
                      etpn.tone === 'success'
                        ? 'text-green-700'
                        : etpn.tone === 'error'
                          ? 'text-red-700'
                          : 'text-amber-700'
                    }`}
                  >
                    {etpn.hint}
                  </p>
                )}
              </div>
            </div>
            <p className="px-2 py-1 bg-gray-50 text-[10px] text-gray-500">
              DESC. / MODEL / MFG P/N / Manufacturer and the CMM band are auto-populated from the ATA Record.
            </p>
          </div>

          {/* ---- REQUIRED vs AVAILABLE table -------------------------------- */}
          <div className="overflow-x-auto border border-gray-400 border-t-0">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-100">
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 w-10 text-center font-semibold">
                    Item
                  </th>
                  <th colSpan={6} className="border border-gray-300 px-1 py-1 text-center font-semibold">
                    REQUIRED TOOLS EQUIPMENT
                  </th>
                  <th colSpan={5} className="border border-gray-300 px-1 py-1 text-center font-semibold">
                    AVAILABLE TOOLS / EQUIPMENT
                  </th>
                  <th rowSpan={2} className="border border-gray-300 px-1 py-1 text-center font-semibold">
                    Location by shop
                  </th>
                  {isEditing && (
                    <th rowSpan={2} className="border border-gray-300 px-1 py-1 w-10 text-center font-semibold">
                      —
                    </th>
                  )}
                </tr>
                <tr className="bg-gray-50">
                  <th className="border border-gray-300 px-1 py-1 font-medium">Model</th>
                  <th className="border border-gray-300 px-1 py-1 font-medium">Mfg P/N</th>
                  <th className="border border-gray-300 px-1 py-1 font-medium">Description</th>
                  <th className="border border-gray-300 px-1 py-1 font-medium">QTY</th>
                  <th className="border border-gray-300 px-1 py-1 font-medium">Manufacturer</th>
                  <th className="border border-gray-300 px-1 py-1 font-medium">Usage code</th>
                  <th className="border border-gray-300 px-1 py-1 font-medium">Model</th>
                  <th className="border border-gray-300 px-1 py-1 font-medium">Mfg P/N</th>
                  <th className="border border-gray-300 px-1 py-1 font-medium">Description</th>
                  <th className="border border-gray-300 px-1 py-1 font-medium">Manufacturer</th>
                  <th className="border border-gray-300 px-1 py-1 font-medium">Acquistion code</th>
                </tr>
              </thead>
              <tbody>
                {formData.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={isEditing ? 14 : 13}
                      className="border border-gray-300 px-2 py-6 text-center text-gray-400"
                    >
                      {isEditing
                        ? 'No tools recorded yet — click "+ Add Tool" and paste an Excel column into any cell.'
                        : 'No tools recorded yet.'}
                    </td>
                  </tr>
                )}
                {formData.items.map((item, rowIndex) => (
                  <tr key={item.id}>
                    <td className="border border-gray-300 px-1 py-1 text-center">{item.itemNo}</td>
                    <td className="border border-gray-300 px-1 py-1">
                      {cell(rowIndex, item, 'requiredModel')}
                    </td>
                    <td className="border border-gray-300 px-1 py-1">
                      {cell(rowIndex, item, 'requiredMfgPN')}
                    </td>
                    <td className="border border-gray-300 px-1 py-1">
                      {cell(rowIndex, item, 'requiredDescription')}
                    </td>
                    <td className="border border-gray-300 px-1 py-1 text-center">
                      {cell(rowIndex, item, 'requiredQty', 'w-14')}
                    </td>
                    <td className="border border-gray-300 px-1 py-1">
                      {cell(rowIndex, item, 'requiredManufacturer')}
                    </td>
                    <td className="border border-gray-300 px-1 py-1 text-center">
                      {cell(rowIndex, item, 'usageCode', 'w-14')}
                    </td>
                    <td className="border border-gray-300 px-1 py-1">
                      {cell(rowIndex, item, 'availableModel')}
                    </td>
                    <td className="border border-gray-300 px-1 py-1">
                      {cell(rowIndex, item, 'availableMfgPN')}
                    </td>
                    <td className="border border-gray-300 px-1 py-1">
                      {cell(rowIndex, item, 'availableDescription')}
                    </td>
                    <td className="border border-gray-300 px-1 py-1">
                      {cell(rowIndex, item, 'availableManufacturer')}
                    </td>
                    <td className="border border-gray-300 px-1 py-1 text-center">
                      {cell(rowIndex, item, 'acquisitionCode', 'w-14')}
                    </td>
                    <td className="border border-gray-300 px-1 py-1">
                      {cell(rowIndex, item, 'locationByShop')}
                    </td>
                    {isEditing && (
                      <td className="border border-gray-300 px-1 py-1 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                          onClick={() => removeItem(item.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showSubmissionValidation && submissionValidationIssues.length > 0 && (
            <div role="alert" className="border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <p className="font-semibold">Cannot submit: complete every tool row and cell, or enter N/A where data is unavailable.</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {submissionValidationIssues.slice(0, 6).map(issue => (
                  <li key={issue}>{issue}</li>
                ))}
                {submissionValidationIssues.length > 6 && (
                  <li>And {submissionValidationIssues.length - 6} more required entries.</li>
                )}
              </ul>
            </div>
          )}

          {isEditing && (
            <div className="border border-gray-400 border-t-0 px-2 py-1.5 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Tool
              </Button>
              {/* (P3) Discoverability: the rows no longer have to be created by hand first. */}
              <span className="text-[10px] text-gray-500">
                Tip: copy a column (or a rectangular range) in Excel and paste it into any cell —
                the missing rows are added automatically and the values fill downwards.
              </span>
            </div>
          )}

          {/* ---- Code legends ---------------------------------------------- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 border border-gray-400 border-t-0 divide-y sm:divide-y-0 sm:divide-x divide-gray-300 text-[11px]">
            <div className="px-2 py-1.5">
              <p className="font-semibold text-gray-800">Usage code:</p>
              <ul className="text-gray-700 space-y-0.5">
                {USAGE_CODES.map(code => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            </div>
            <div className="px-2 py-1.5">
              <p className="font-semibold text-gray-800">Acqusition code:</p>
              <ul className="text-gray-700 space-y-0.5">
                {ACQUISITION_CODES.map(code => (
                  <li key={code}>{code}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border border-gray-400 border-t-0 px-2 py-1.5 text-[11px]">
            <p className="font-semibold text-gray-800">Instruction:</p>
            <ol className="list-decimal pl-5 space-y-0.5 text-gray-700">
              {INSTRUCTIONS.map(instruction => (
                <li key={instruction}>{instruction}</li>
              ))}
            </ol>
          </div>

          {/*
            (2) + (3) THE AUTOMATIC SIGNATURE BLOCK.
                `formType`  -> verbatim captions ("prepared  By:"), fixed role titles
                               ("Mgr. Componenet Shop") and the printed geometry;
                `instance`  -> the automatic name / UTC date / specimen of each executed step;
                `slotIndex` -> pins each printed line to its matrix slot, so the Manager
                               approval can NEVER print on the TL. Component Engineering
                               Support line and vice versa.
            The layout below is UNCHANGED: same three captions, same order, same statement.
          */}
          <SignatureBlock
            editable={isEditing}
            formType={formType}
            instance={instance}
            statement={
              <>
                <span className="font-semibold">Confirmation Statement:</span>
                <br />
                {CONFIRMATION_STATEMENT}
              </>
            }
            rows={[
              {
                slotIndex: 0,
                label: 'prepared  By:',
                role: APPROVER_TITLES.tnaPreparedBy,
                name: formData.preparedBy,
                date: formData.preparedByDate,
                onNameChange: value => setFormData(prev => ({ ...prev, preparedBy: value })),
                onDateChange: value => setFormData(prev => ({ ...prev, preparedByDate: value })),
              },
              {
                slotIndex: 1,
                label: 'Approved by:',
                role: APPROVER_TITLES.tnaApprovedByManager,
                name: formData.approvedByManager,
                date: formData.approvedByManagerDate,
                onNameChange: value => setFormData(prev => ({ ...prev, approvedByManager: value })),
                onDateChange: value => setFormData(prev => ({ ...prev, approvedByManagerDate: value })),
              },
              {
                slotIndex: 2,
                label: 'Approved by:',
                role: APPROVER_TITLES.tnaApprovedByEngineering,
                name: formData.approvedByEngineering,
                date: formData.approvedByEngineeringDate,
                onNameChange: value => setFormData(prev => ({ ...prev, approvedByEngineering: value })),
                onDateChange: value =>
                  setFormData(prev => ({ ...prev, approvedByEngineeringDate: value })),
              },
            ]}
          />
        </CardContent>
      </Card>

      <FormWorkflowFooter
        formSubmissionId={formSubmissionId}
        approvalStatus={approvalStatus}
        ataRecordId={selectedATARecord?.id || ''}
        formNodeType={formType}
        canEdit={authority.canEdit}
        canUpload={true}
        canSubmit={canSubmit && authority.canEdit}
        saving={saving}
        onSubmit={() => void submitForApproval()}
        onEdit={() => setIsEditing(true)}
        /**
         * (4) An approval must repaint the signature block immediately. `loadFromBackend()`
         * refreshes the FORM DATA; `reloadInstance()` refreshes the EXECUTED STEPS, which is
         * where the name, the date and the specimen come from.
         */
        onStatusChange={() => {
          void loadFromBackend()
          void reloadInstance()
        }}
        /**
         * (5) MNT-1229B: the action bar is gated by the SERVER's canIAct / canIDelegate flags
         * of the current step, so Manager actions appear only while the record sits at
         * PendingManagerApproval, Special Team Leader actions only at
         * PendingSpecialTeamLeaderApproval, and every other viewer sees no action buttons —
         * while the signature block above keeps showing ALL completed approvals and
         * signatures historically.
         */
      />
    </div>
  )
}