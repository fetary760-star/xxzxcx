/**
 * =====================================================================================
 * AMENDED v25 — ITEM 6: AD — FORM MNT-1420B
 * Copy to: CMT.Frontend/src/components/self-evaluation/forms/ADForm.tsx
 *
 * MAINTENANCE DATA VERIFICATION FOR AIRWORTHINESS DIRECTIVES (AD)
 * FORM No.: MNT-1420B · Rev. No.: 01 · Rev. Date: MAR 11 2021
 *
 * v25 ADDS ONE THING ONLY: EXCEL MULTI-ROW PASTE INTO THE DYNAMIC AD TABLE.
 * ------------------------------------------------------------------------
 * MNT-1420B belongs to the same DOCUMENTATION group as MNT-1420A (SB) and shares its
 * six-column dynamic table, so it receives the identical treatment:
 *   (P1) INTERCEPT   — `onPaste` on every editable cell calls `event.preventDefault()` the
 *                      moment the clipboard carries more than one value.
 *   (P2) SPLIT       — the payload is parsed as Excel TSV (TAB between cells, newline between
 *                      rows, RFC-4180 quoting honoured for multi-line Title / Remark cells).
 *   (P3) AUTO-ADD    — missing rows are created through the SAME factory the "+ Add AD Entry"
 *                      button uses, so a 25-row paste produces 25 rows.
 *   (P4) DISTRIBUTE  — the block fills DOWNWARDS from the pasted cell; a multi-column Excel
 *                      range additionally spills RIGHTWARDS across AD_COLUMNS.
 *
 * Note the AD-specific detail: "NO" is a MANUALLY captured text column here (the signed hard
 * copy prints "N/A"), so it participates in the paste as a normal first column and is NEVER
 * auto-renumbered — matching the existing remove-row behaviour, which also leaves it alone.
 *
 * A single-value clipboard is left to the browser so caret-aware paste still works.
 *
 * EVERYTHING ELSE IS UNCHANGED from v24, including the signed hard copy's default N/A line
 * and the automatic signature wiring (1)..(5).
 *
 * -------------------------------------------------------------------------------------
 * v24 NOTES (kept verbatim, still in force)
 * THE ROUTING THIS FORM MUST PRINT
 *     slotIndex 0  Prepared By:  ->  SHOP TEAM LEADER
 *     slotIndex 1  Approved By:  ->  Mgr. Componenet Shop
 *   (1) resolves the workflow instance;
 *   (2) passes `formType='ad'` + `instance` — "Prepared by:" now auto-fills with the STL
 *       name, the frozen UTC date and his specimen;
 *   (3) pins the printed line to `slotIndex: 0`;
 *   (4) the executed "Approved By:" step is appended as a workflow record in the same paper
 *       geometry once it is reached (default `includeWorkflowSteps`);
 *   (5) reloads the instance on any status change.
 * =====================================================================================
 */
'use client'

import { useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Trash2 } from 'lucide-react'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useFormData } from '@/lib/self-evaluation/useFormData'
import {
  APPROVER_TITLES,
  useATAAutoFill,
  useATAAutoFillSync,
} from '@/lib/self-evaluation/useATAAutoFill'
// (P1)..(P4) Excel multi-row paste support shared by every dynamic-row controlled document.
import { createRowId, useGridPasteHandler } from '@/lib/self-evaluation/useGridPaste'
import { useFormWorkflowInstance } from '@/lib/workflow/useFormWorkflowInstance'
import {
  DocumentFieldGrid,
  DocumentHeader,
  FormToolbar,
  FormWorkflowFooter,
  SignatureBlock,
} from './FormDocumentChrome'

// ===========================================================================
// Controlled document constants — verbatim from the MNT-1420B hard copy
// ===========================================================================

const FORM_NO = 'MNT-1420B'
const FORM_TITLE = 'MAINTENANCE DATA VERIFICATION  FOR AIRWORTHINESS DIRECTIVES (AD)'
const FORM_SUBTITLE = 'COMPONENT CAPABILITY DEVELOPMENT'
const FORM_REV_NO = '01'
const FORM_REV_DATE = 'MAR 11 2021'

/** The persisted FormSubmission.FormType — the key of AD_SLOTS in the matrix. */
const FORM_TYPE = 'ad' as const

const NOTE_1 =
  'Note-1: List only Airworthiness Directives (AD) that is not incorporated into the CMM.'

const VERIFICATION_STATEMENT =
  'I have verified that all applicable non incorporated Airworthiness Directives (AD) is included in the list above. The above documents are current and made accessible to maintenance personnel on company portal or through hard copy.'

interface ADItem {
  id: string
  no: string
  /** "Airworthiness Directives (AD) (Note-1)" column. */
  adNumber: string
  title: string
  revisionNumber: string
  issueDate: string
  remark: string
}

/**
 * (P4) THE PRINTED COLUMN ORDER — the single source of truth for the horizontal spill of a
 * multi-column Excel paste. Must match the <td> order of the table body. Unlike MNT-1420A,
 * "no" IS a data column here (the hard copy prints "N/A"), so it is included.
 */
const AD_COLUMNS = [
  'no',
  'adNumber',
  'title',
  'revisionNumber',
  'issueDate',
  'remark',
] as const

type ADColumn = (typeof AD_COLUMNS)[number]

interface FormData extends Record<string, unknown> {
  /** Auto-filled identity block (mirrored so it persists with the submission). */
  compDesc: string
  mfgPN: string
  ataChapter: string
  cmmRevNo: string
  cmmRevDate: string

  items: ADItem[]

  preparedBy: string
  preparedDate: string
}

/**
 * The one and only row factory. Shared by the "+ Add AD Entry" button and the paste engine.
 *
 * `createRowId()` replaces the previous `Date.now()` id: a multi-row paste creates every row
 * inside the same millisecond, which would otherwise yield duplicate ids and make
 * `updateItem()` edit several rows at once.
 */
const createItem = (no: number): ADItem => ({
  id: createRowId('ad'),
  no: String(no),
  adNumber: '',
  title: '',
  revisionNumber: '',
  issueDate: '',
  remark: '',
})

/** The signed hard copy carries a single "N/A" line. */
const DEFAULT_ITEMS: ADItem[] = [
  {
    id: 'ad-default',
    no: 'N/A',
    adNumber: 'N/A',
    title: 'N/A',
    revisionNumber: 'N/A',
    issueDate: 'N/A',
    remark: 'N/A',
  },
]

export default function ADForm() {
  const { selectedATARecord } = useSelfEvaluation()
  const auto = useATAAutoFill()

  const defaultData: FormData = {
    compDesc: auto.description,
    mfgPN: auto.partNumber,
    ataChapter: auto.ata,
    cmmRevNo: auto.revNo,
    cmmRevDate: auto.cmmRevDateLabel,
    items: DEFAULT_ITEMS,
    preparedBy: '',
    preparedDate: '',
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
    formType: FORM_TYPE,
    formNo: FORM_NO,
    revNo: FORM_REV_NO,
    revDate: FORM_REV_DATE,
  })

  // (1) The executed STL draft -> process -> approval chain of this AD record.
  const { instance, reload: reloadInstance } = useFormWorkflowInstance({
    formSubmissionId,
    folderId: selectedATARecord?.evaluationFolderId,
  })

  // The ATA Record is the only writer of the identity block.
  useATAAutoFillSync<FormData>(
    setFormData,
    {
      compDesc: auto.description,
      mfgPN: auto.partNumber,
      ataChapter: auto.ata,
      cmmRevNo: auto.revNo,
      cmmRevDate: auto.cmmRevDateLabel,
    },
    [loading, auto.ataRecordId],
  )

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, createItem(prev.items.length + 1)],
    }))
  }

  const removeItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id),
    }))
  }

  const updateItem = (id: string, field: ADColumn, value: string) => {
    setFormData(prev => ({
      ...prev,
      items: (prev.items?.length ? prev.items : DEFAULT_ITEMS).map(item =>
        item.id === id ? { ...item, [field]: value } : item,
      ),
    }))
  }

  /** (P3) The row factory handed to the paste engine — the "+ Add AD Entry" behaviour. */
  const createPastedRow = useCallback((index: number) => createItem(index + 1), [])

  /**
   * Commit as an updater so a paste always builds on the freshest rows.
   * The `DEFAULT_ITEMS` fallback mirrors what the table actually RENDERS, so pasting onto the
   * printed "N/A" line overwrites that line instead of silently appending below an empty array.
   */
  const commitRows = useCallback(
    (updater: (rows: ADItem[]) => ADItem[]) => {
      setFormData(prev => ({
        ...prev,
        items: updater(prev.items?.length ? prev.items : DEFAULT_ITEMS),
      }))
    },
    [setFormData],
  )

  /** (P1)..(P4) THE PASTE HANDLER — wired to every editable cell; inert while read-only. */
  const handleCellPaste = useGridPasteHandler<ADItem>({
    columns: AD_COLUMNS,
    createRow: createPastedRow,
    commit: commitRows,
    // No `renumber`: "NO" is operator-controlled text on MNT-1420B (the hard copy prints N/A).
    enabled: isEditing,
  })

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  const items = formData.items?.length ? formData.items : DEFAULT_ITEMS

  return (
    <div className="space-y-4">
      <FormToolbar
        title="AD — MAINTENANCE DATA VERIFICATION FOR AIRWORTHINESS DIRECTIVES"
        meta={`FORM No.: ${FORM_NO} · Rev. No.: ${FORM_REV_NO} · Rev. Date: ${FORM_REV_DATE}`}
        approvalStatus={approvalStatus}
        canEdit={canEdit}
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
              { label: 'Rev. No.:', value: FORM_REV_NO },
              { label: 'Rev. Date:', value: FORM_REV_DATE },
            ]}
          />

          {/* ---- Identity block (auto-populated from the ATA Record) -------- */}
          <DocumentFieldGrid
            columns={4}
            autoFilled
            fields={[
              { label: 'COMP. DESC:', value: formData.compDesc, span: 2 },
              { label: 'MFG P/N:', value: formData.mfgPN, span: 2 },
              { label: 'ATA CHAPTER:', value: formData.ataChapter },
              { label: 'REV.NO.', value: formData.cmmRevNo },
              { label: 'REV. DATE:', value: formData.cmmRevDate, span: 2 },
            ]}
          />

          {/* ---- Airworthiness Directives table ---------------------------- */}
          <div className="overflow-x-auto border border-gray-400 border-t-0">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-100">
                  <th className="w-12 border border-gray-300 px-1 py-1 text-center font-semibold">
                    NO
                  </th>
                  <th className="border border-gray-300 px-2 py-1 text-left font-semibold">
                    Airworthiness Directives (AD) (Note-1)
                  </th>
                  <th className="border border-gray-300 px-2 py-1 text-left font-semibold">Title</th>
                  <th className="w-24 border border-gray-300 px-1 py-1 text-center font-semibold">
                    Revision Number
                  </th>
                  <th className="w-24 border border-gray-300 px-1 py-1 text-center font-semibold">
                    Issue Date
                  </th>
                  <th className="w-40 border border-gray-300 px-2 py-1 text-left font-semibold">
                    Remark
                  </th>
                  {isEditing && <th className="w-10 border border-gray-300 px-1 py-1" />}
                </tr>
              </thead>
              <tbody>
                {items.map((item, rowIndex) => (
                  <tr key={item.id}>
                    {AD_COLUMNS.map(field => (
                      <td
                        key={field}
                        className={`border border-gray-300 px-1 py-1 align-top ${
                          field === 'no' ? 'text-center' : ''
                        }`}
                      >
                        {isEditing ? (
                          <Input
                            value={String(item[field] ?? '')}
                            onChange={event => updateItem(item.id, field, event.target.value)}
                            /* (P1) Take over any multi-cell Excel paste. */
                            onPaste={event => handleCellPaste(event, rowIndex, field)}
                            className="h-7 border-0 text-[11px] shadow-none focus-visible:ring-0"
                          />
                        ) : (
                          <span className="break-words text-[11px] text-gray-900">
                            {String(item[field] ?? '')}
                          </span>
                        )}
                      </td>
                    ))}
                    {isEditing && (
                      <td className="border border-gray-300 px-1 py-1 text-center align-middle">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-red-500"
                          onClick={() => removeItem(item.id)}
                          aria-label="Remove entry"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isEditing && (
            <div className="border border-gray-400 border-t-0 px-2 py-2 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add AD Entry
              </Button>
              {/* (P3) Discoverability: the rows no longer have to be created by hand first. */}
              <span className="text-[10px] text-gray-500">
                Tip: copy a column (or a rectangular range) in Excel and paste it into any cell —
                the missing rows are added automatically and the values fill downwards.
              </span>
            </div>
          )}

          {/* ---- Note-1 ---------------------------------------------------- */}
          <div className="border border-gray-400 border-t-0 px-2 py-1.5">
            <p className="text-[11px] text-gray-800">{NOTE_1}</p>
          </div>

          {/*
            (2) + (3) + (4) "Prepared by:" auto-fills from the executed STL draft step; the
            executed "Approved By: / Mgr. Componenet Shop" step is appended underneath as a
            workflow record once reached, in the identical printed geometry.
          */}
          <SignatureBlock
            editable={isEditing}
            formType={FORM_TYPE}
            instance={instance}
            statement={VERIFICATION_STATEMENT}
            rows={[
              {
                slotIndex: 0,
                label: 'Prepared by:',
                role: APPROVER_TITLES.adPreparedBy,
                name: formData.preparedBy,
                date: formData.preparedDate,
                onNameChange: value => setFormData(prev => ({ ...prev, preparedBy: value })),
                onDateChange: value => setFormData(prev => ({ ...prev, preparedDate: value })),
              },
            ]}
          />
        </CardContent>
      </Card>

      <FormWorkflowFooter
        formSubmissionId={formSubmissionId}
        approvalStatus={approvalStatus}
        ataRecordId={selectedATARecord?.id || ''}
        formNodeType={FORM_TYPE}
        canEdit={canEdit}
        canSubmit={canSubmit}
        saving={saving}
        onSubmit={() => void handleSubmitForApproval()}
        onEdit={() => setIsEditing(true)}
        // (5) Repaint the printed signatures as soon as the STL approves.
        onStatusChange={() => {
          void loadFromBackend()
          void reloadInstance()
        }}
        workflowInstance={instance}
      />
    </div>
  )
}