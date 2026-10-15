/**
 * =====================================================================================
 * AMENDED v25 — ITEM 5: SB / SL / SIL — FORM MNT-1420A
 * Copy to: CMT.Frontend/src/components/self-evaluation/forms/SBForm.tsx
 *
 * MAINTENANCE DATA VERIFICATION FOR SB AND SL/SILs
 * FORM No.: MNT-1420A · Rev. No.: 01 · Rev. Date: 11-Mar-2021
 *
 * v25 ADDS ONE THING ONLY: EXCEL MULTI-ROW PASTE INTO THE DYNAMIC SB / SL / SIL TABLE.
 * ----------------------------------------------------------------------------------
 * WHAT WAS WRONG
 *   Each cell of the six-column table is an <Input>. Pasting a VERTICAL column of SB numbers
 *   copied out of Excel dropped the whole clipboard string into the ONE focused cell, so the
 *   clerk had to press "+ Add SB / SL / SIL Entry" n times and re-type every row by hand.
 *
 * WHAT THIS VERSION DOES
 *   (P1) INTERCEPT   — `onPaste` on every editable cell calls `event.preventDefault()` the
 *                      moment the clipboard carries more than one value.
 *   (P2) SPLIT       — the payload is parsed as Excel TSV (TAB between cells, newline between
 *                      rows, RFC-4180 quoting honoured so a multi-line "Title" or "Remark"
 *                      survives intact).
 *   (P3) AUTO-ADD    — missing rows are created through the SAME factory the
 *                      "+ Add SB / SL / SIL Entry" button uses, and the printed "NO" column
 *                      is re-sequenced 1..n.
 *   (P4) DISTRIBUTE  — the block fills DOWNWARDS from the pasted cell; a multi-column Excel
 *                      range additionally spills RIGHTWARDS across SB_COLUMNS.
 *
 *   Because the hard copy prints three EMPTY rows when nothing is recorded, those rows are now
 *   real paste / type targets while the document is in edit mode: typing or pasting into blank
 *   row n materialises rows 1..n on demand, so the very first paste needs no clicking at all.
 *   A single-value clipboard keeps the browser's native caret-aware paste.
 *
 * EVERYTHING ELSE IS UNCHANGED from v24 — the automatic signature wiring (1)..(5), the locked
 * controlled-document meta, the identity band, Note-1 and the verification statement.
 *
 * -------------------------------------------------------------------------------------
 * v24 NOTES (kept verbatim, still in force)
 *   (1) resolves the workflow instance of this form;
 *   (2) passes `formType='sb'` + `instance`, so "Prepared By:" auto-fills with the name, the
 *       frozen UTC date and the specimen of whoever actually prepared it;
 *   (3) pins the printed line to `slotIndex: 0` of SB_SLOTS;
 *   (4) leaves `includeWorkflowSteps` at its default (true), so the executed
 *       Processed By (Documentation Clerk), Signed Off By (Team Leader ET-MRO Documentation)
 *       and Issued By (SHOP TEAM LEADER) steps print underneath IN THE SAME PAPER GEOMETRY;
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
// Controlled document constants — verbatim from the MNT-1420A hard copy
// ===========================================================================

const FORM_NO = 'MNT-1420A'
const FORM_TITLE = 'MAINTENANCE DATA VERIFICATION FOR SB AND SL/SILs'
const FORM_SUBTITLE = 'COMPONENT CAPABILITY DEVELOPMENT'
const FORM_REV_NO = '01'
const FORM_REV_DATE = '11-Mar-2021'

/** The persisted FormSubmission.FormType — the key of SB_SLOTS in the matrix. */
const FORM_TYPE = 'sb' as const

/** How many empty rows the hard copy prints when nothing has been recorded yet. */
const BLANK_PRINTED_ROWS = 3

const NOTE_1 =
  'Note-1: List only Service Bulletins/SILs that are not incorporated into the current CMM.'

const VERIFICATION_STATEMENT =
  'I have verified that no Service Letter and Service Bulletin are released after the revision date of the current CMM.'

interface SBItem {
  id: string
  no: number
  /** "Service Bulletins,SL/SILs (Note-1)" column. */
  sbNumber: string
  title: string
  revisionNumber: string
  issueDate: string
  remark: string
}

/**
 * (P4) THE PRINTED COLUMN ORDER — the single source of truth for the horizontal spill of a
 * multi-column Excel paste. Must match the <td> order of the table body; "NO" is excluded
 * because it is a computed sequence number.
 */
const SB_COLUMNS = ['sbNumber', 'title', 'revisionNumber', 'issueDate', 'remark'] as const

type SBColumn = (typeof SB_COLUMNS)[number]

interface FormData extends Record<string, unknown> {
  /** Auto-filled identity block (mirrored so it persists with the submission). */
  compDesc: string
  mfgPN: string
  ataChapter: string
  cmmRevNo: string
  cmmRevDate: string

  items: SBItem[]

  preparedBy: string
  preparedDate: string
}

/**
 * The one and only row factory. Shared by the "+ Add SB / SL / SIL Entry" button, the paste
 * engine and the on-demand materialisation of the blank printed rows.
 *
 * `createRowId()` replaces the previous `Date.now()` id: a multi-row paste creates every row
 * inside the same millisecond, which would otherwise yield duplicate ids and make
 * `updateItem()` edit several rows at once.
 */
const createItem = (no: number): SBItem => ({
  id: createRowId('sb'),
  no,
  sbNumber: '',
  title: '',
  revisionNumber: '',
  issueDate: '',
  remark: '',
})

export default function SBForm() {
  const { selectedATARecord } = useSelfEvaluation()
  const auto = useATAAutoFill()

  const defaultData: FormData = {
    compDesc: auto.description,
    mfgPN: auto.partNumber,
    ataChapter: auto.ata,
    cmmRevNo: auto.revNo,
    cmmRevDate: auto.cmmRevDateLabel,
    items: [],
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

  // (1) The executed routing of this form: Documentation Team -> clerk -> DL sign-off.
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
      items: prev.items
        .filter(item => item.id !== id)
        .map((item, index) => ({ ...item, no: index + 1 })),
    }))
  }

  const updateItem = (id: string, field: SBColumn, value: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => (item.id === id ? { ...item, [field]: value } : item)),
    }))
  }

  /**
   * Write a cell by POSITION, creating every missing row on the way.
   * Used by the blank printed rows so the operator can start typing in row 1 (or row 3)
   * without clicking "+ Add SB / SL / SIL Entry" first.
   */
  const setCellAt = (rowIndex: number, field: SBColumn, value: string) => {
    setFormData(prev => {
      const items = [...prev.items]
      while (items.length <= rowIndex) {
        items.push(createItem(items.length + 1))
      }
      items[rowIndex] = { ...items[rowIndex], [field]: value }
      return { ...prev, items: items.map((item, index) => ({ ...item, no: index + 1 })) }
    })
  }

  /** (P3) The row factory handed to the paste engine — the "+ Add ..." behaviour, zero-based. */
  const createPastedRow = useCallback((index: number) => createItem(index + 1), [])

  /** Commit as an updater so a paste always builds on the freshest rows, never on stale state. */
  const commitRows = useCallback(
    (updater: (rows: SBItem[]) => SBItem[]) => {
      setFormData(prev => ({ ...prev, items: updater(prev.items) }))
    },
    [setFormData],
  )

  /** Keep the printed "NO" sequence at 1..n, exactly as `removeItem()` already does. */
  const renumberRows = useCallback(
    (item: SBItem, index: number) => (item.no === index + 1 ? item : { ...item, no: index + 1 }),
    [],
  )

  /** (P1)..(P4) THE PASTE HANDLER — wired to every editable cell; inert while read-only. */
  const handleCellPaste = useGridPasteHandler<SBItem>({
    columns: SB_COLUMNS,
    createRow: createPastedRow,
    commit: commitRows,
    renumber: renumberRows,
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

  /** How many blank hard-copy rows still have to be printed underneath the real ones. */
  const blankRowCount = Math.max(0, BLANK_PRINTED_ROWS - formData.items.length)

  return (
    <div className="space-y-4">
      <FormToolbar
        title="SB — MAINTENANCE DATA VERIFICATION FOR SB AND SL/SILs"
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

          {/* ---- Service Bulletin / SL / SIL table -------------------------- */}
          <div className="overflow-x-auto border border-gray-400 border-t-0">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-100">
                  <th className="w-10 border border-gray-300 px-1 py-1 text-center font-semibold">
                    NO
                  </th>
                  <th className="border border-gray-300 px-2 py-1 text-left font-semibold">
                    Service Bulletins,SL/SILs (Note-1)
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
                {formData.items.map((item, rowIndex) => (
                  <tr key={item.id}>
                    <td className="border border-gray-300 px-1 py-1 text-center align-top">
                      {item.no}
                    </td>
                    {SB_COLUMNS.map(field => (
                      <td key={field} className="border border-gray-300 px-1 py-1 align-top">
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

                {/*
                  The blank printed rows of the hard copy. While the document is READ-ONLY they
                  stay exactly as before (pure empty paper cells). While EDITING they become real
                  paste / type targets, so the very first Excel paste needs no "+ Add" click:
                  `setCellAt()` and the paste engine both materialise the missing rows on demand.
                */}
                {Array.from({ length: blankRowCount }).map((_, blankIndex) => {
                  const rowIndex = formData.items.length + blankIndex
                  return (
                    <tr key={`blank-${rowIndex}`}>
                      <td className="h-6 border border-gray-300 px-1 py-1 text-center align-top text-gray-400">
                        {isEditing ? rowIndex + 1 : ''}
                      </td>
                      {SB_COLUMNS.map(field => (
                        <td key={field} className="border border-gray-300 px-1 py-1 align-top">
                          {isEditing ? (
                            <Input
                              value=""
                              onChange={event => setCellAt(rowIndex, field, event.target.value)}
                              onPaste={event => handleCellPaste(event, rowIndex, field)}
                              className="h-7 border-0 text-[11px] shadow-none focus-visible:ring-0"
                            />
                          ) : null}
                        </td>
                      ))}
                      {isEditing && <td className="border border-gray-300 px-1 py-1" />}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {isEditing && (
            <div className="border border-gray-400 border-t-0 px-2 py-2 flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="mr-1 h-3.5 w-3.5" />
                Add SB / SL / SIL Entry
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
            (2) + (3) + (4) The printed "Prepared by:" line auto-fills from the executed step,
            and the rest of the SB routing (clerk entry -> DL final sign-off -> STL issue) is
            appended as workflow records in the SAME paper geometry, ONLY once reached.
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
                role: APPROVER_TITLES.sbPreparedBy,
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
        // (5) An approval / assignment must repaint the printed signatures immediately.
        onStatusChange={() => {
          void loadFromBackend()
          void reloadInstance()
        }}
      />
    </div>
  )
}