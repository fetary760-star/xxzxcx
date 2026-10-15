/**
 * =====================================================================================
 * AMENDED v25 — ITEM 14 (4 of 4): TABLE OF CONTENT — the folder cover sheet
 * Copy to: CMT.Frontend/src/components/self-evaluation/forms/TableOfContentForm.tsx
 *          (REPLACES the whole existing file)
 *
 * NOT CHANGED
 * -----------
 *   - the whole tree is still rendered from `@/lib/self-evaluation/toc-structure`, so the
 *     printed Table of Contents can never drift from the navigation panel,
 *   - the five promoted top-level items, the five categories with their DERIVED counts, the
 *     controlled document numbers, the indentation and the tick cells,
 *   - the identity block auto-populated from the ATA Record and mirrored into the payload,
 *   - the tick state keyed by FORM TYPE (`included[formType]`),
 *   - the statement and the two printed signature captions ("Prepared By:" / "Approved By:").
 *
 * CHANGED — THE AUTOMATIC NAME / DATE / SIGNATURE WIRING, marked (1)..(4)
 * ---------------------------------------------------------------------
 *   (1) `useFormWorkflowInstance` resolves the executed steps of this cover sheet.
 *   (2) `<SignatureBlock>` receives `formType` + `instance`.
 *   (3) the rows are pinned by `block` + `expectedRoles`, NOT by `slotIndex` — and this is a
 *       deliberate, documented decision:
 *
 *         FORM_SIGNATURE_MATRIX['table_of_content'] maps to FOLDER_SIGNOFF_SLOTS, which
 *         declares THREE lines: "Prepared By:" (STL), "Reviewed By:" (Manager) and
 *         "Signed Off By:" (Responsible Director) — the FOLDER-LEVEL FINAL SIGN-OFF chain of
 *         requirement item 14. This cover sheet prints only TWO lines, and its second caption
 *         is "Approved By:", not "Reviewed By:".
 *
 *         Using `slotIndex: 1` would therefore RE-LABEL the printed second line to
 *         "Reviewed By:" (the matrix caption always wins over the typed label), which is a
 *         layout change and is not allowed. Pinning by `block` + `expectedRoles` keeps the
 *         printed captions exactly as they are while giving the automatic layer a
 *         deterministic set-membership target:
 *
 *             "Prepared By:"  -> PreparedBy  + [TeamLeader, Engineer]
 *             "Approved By:"  -> ApprovedBy  + [Manager, ShopManager]
 *
 *   (4) `onStatusChange` reloads the form data AND the instance.
 *
 * WHY `includeWorkflowSteps` IS LEFT AT ITS DEFAULT (true) HERE — this is the point of the
 * cover sheet
 * ------------------------------------------------------------------------------------------
 * The folder chain ends with the Director's "Signed Off By:" line, which this sheet does NOT
 * pre-print. With the default behaviour that executed step is appended UNDERNEATH in the same
 * paper geometry, marked as a workflow record, so the final sign-off of requirement item 14 is
 * visible and exportable on the cover sheet instead of vanishing. Nothing is appended before
 * the workflow actually reaches that step, so an unsigned sheet stays byte-identical to the
 * hard copy.
 * =====================================================================================
 */
'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useFormData } from '@/lib/self-evaluation/useFormData'
import {
  APPROVER_TITLES,
  useATAAutoFill,
  useATAAutoFillSync,
} from '@/lib/self-evaluation/useATAAutoFill'
import type { FormNodeType } from '@/lib/self-evaluation/types'
import { ORG_ROLES } from '@/lib/role-hierarchy'
import { SignatureBlockType } from '@/lib/workflow/workflow-types'
// (1) THE MISSING WIRING LINK — resolves the FormWorkflowInstance of this cover sheet.
import { useFormWorkflowInstance } from '@/lib/workflow/useFormWorkflowInstance'
import {
  TOC_ALL_FORMS,
  TOC_CATEGORIES,
  TOC_TOP_LEVEL_FORMS,
  getCategoryFormCount,
  type TocFormNode,
} from '@/lib/self-evaluation/toc-structure'
import {
  CheckCell,
  DocumentFieldGrid,
  DocumentHeader,
  FormToolbar,
  FormWorkflowFooter,
  SignatureBlock,
} from './FormDocumentChrome'

// ===========================================================================
// Controlled document constants
// ===========================================================================

/** The PERSISTED FormSubmission.FormType and the matrix key. Never rename. */
const FORM_TYPE: FormNodeType = 'table_of_content'

const FORM_NO = 'MNT-TOC'
const FORM_REV_NO = '01'
const FORM_TITLE = 'TABLE OF CONTENT'
const FORM_SUBTITLE = 'COMPONENT CAPABILITY SELF-EVALUATION'

const TOC_STATEMENT =
  'The forms ticked above are the controlled documents that constitute this Component Capability Self-Evaluation package.'

/** Every node starts ticked, exactly like the printed master sheet. */
const DEFAULT_INCLUDED: Record<string, boolean> = TOC_ALL_FORMS.reduce<Record<string, boolean>>(
  (accumulator, node) => {
    accumulator[node.formType] = true
    return accumulator
  },
  {},
)

interface FormData extends Record<string, unknown> {
  /** Auto-filled identity block, mirrored so it persists with the submission. */
  description: string
  partNumber: string
  manufacturer: string
  ata: string
  aircraft: string
  selfEvaluationDate: string
  cmmRevDate: string
  revNo: string
  letterRefNo: string
  shopCapability: string
  responsibleWorkshop: string

  /** Tick state, keyed by backend form type. */
  included: Record<string, boolean>

  /**
   * Kept so an un-started folder behaves exactly as before. Once a step executes the printed
   * value comes from the workflow and the layer locks the input.
   */
  preparedByName: string
  preparedByDate: string
  approvedByName: string
  approvedByDate: string
}

export default function TableOfContentForm() {
  const { selectedATARecord } = useSelfEvaluation()
  const auto = useATAAutoFill()

  const defaultData: FormData = {
    description: auto.description,
    partNumber: auto.partNumber,
    manufacturer: auto.manufacturer,
    ata: auto.ata,
    aircraft: auto.aircraft,
    selfEvaluationDate: auto.selfEvaluationDate,
    cmmRevDate: auto.cmmRevDate,
    revNo: auto.revNo,
    letterRefNo: auto.letterRefNo,
    shopCapability: auto.shopCapability,
    responsibleWorkshop: auto.responsibleWorkshop,

    included: DEFAULT_INCLUDED,

    preparedByName: '',
    preparedByDate: auto.selfEvaluationDate,
    approvedByName: '',
    approvedByDate: auto.selfEvaluationDate,
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
  })

  /**
   * (1) The executed steps of the cover sheet. Never throws; null = nothing signed yet, and
   * the block prints the blank hard-copy rules.
   */
  const { instance, reload: reloadInstance } = useFormWorkflowInstance({
    formSubmissionId,
    folderId: selectedATARecord?.evaluationFolderId,
  })

  // The ATA Record is the only writer of the identity block.
  useATAAutoFillSync<FormData>(
    setFormData,
    {
      description: auto.description,
      partNumber: auto.partNumber,
      manufacturer: auto.manufacturer,
      ata: auto.ata,
      aircraft: auto.aircraft,
      selfEvaluationDate: auto.selfEvaluationDate,
      cmmRevDate: auto.cmmRevDate,
      revNo: auto.revNo,
      letterRefNo: auto.letterRefNo,
      shopCapability: auto.shopCapability,
      responsibleWorkshop: auto.responsibleWorkshop,
    },
    [loading, auto.ataRecordId],
  )

  /** A node with no stored value defaults to ticked, like the master sheet. */
  const isIncluded = (formType: FormNodeType): boolean =>
    formData.included?.[formType] ?? true

  const toggle = (formType: FormNodeType, next: boolean) => {
    setFormData(prev => ({
      ...prev,
      included: { ...(prev.included ?? DEFAULT_INCLUDED), [formType]: next },
    }))
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  /**
   * One printed Table-of-Contents line. `depth` reproduces the indentation of
   * the original, so nested forms sit under their parent.
   */
  const renderNode = (node: TocFormNode, depth: number) => (
    <div key={node.formType}>
      <div
        className="flex items-start gap-2 border-b border-gray-200 px-2 py-1"
        style={{ paddingLeft: `${8 + depth * 20}px` }}
      >
        <span className="mt-[1px] shrink-0">
          <CheckCell
            mark="√"
            ariaLabel={node.label}
            checked={isIncluded(node.formType)}
            disabled={!isEditing}
            onChange={next => toggle(node.formType, next)}
          />
        </span>
        <node.Icon className={`mt-[1px] h-3.5 w-3.5 shrink-0 ${node.iconClass}`} />
        <span className="min-w-0 flex-1 break-words text-[11px] font-medium leading-snug text-gray-900 [overflow-wrap:anywhere]">
          {node.label}
        </span>
        {node.formNo && (
          <span className="shrink-0 rounded border border-gray-300 bg-gray-50 px-1 py-[1px] text-[9px] font-semibold text-gray-600">
            {node.formNo}
          </span>
        )}
        {node.role && (
          <span className="hidden shrink-0 text-[9px] italic text-gray-500 sm:inline">
            {node.role}
          </span>
        )}
      </div>
      {node.children?.map(child => renderNode(child, depth + 1))}
    </div>
  )

  return (
    <div className="space-y-4">
      <FormToolbar
        title={FORM_TITLE}
        meta={`Form ${FORM_NO} · Rev. ${FORM_REV_NO} · ${TOC_ALL_FORMS.length} controlled forms`}
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
            organisation="ETHIOPIAN MRO"
            title={FORM_TITLE}
            subtitle={FORM_SUBTITLE}
            meta={[
              { label: 'Form', value: FORM_NO },
              { label: 'Rev.', value: FORM_REV_NO },
              { label: 'ATA:', value: formData.ata },
            ]}
          />

          {/* Identity block — auto-populated from the ATA Record. */}
          <DocumentFieldGrid
            columns={4}
            autoFilled
            fields={[
              { label: 'Description:', value: formData.description },
              { label: 'P/N:', value: formData.partNumber },
              { label: 'Manufacturer:', value: formData.manufacturer },
              { label: 'ATA:', value: formData.ata },
              { label: 'A/C:', value: formData.aircraft },
              { label: 'Self-Evaluation Date:', value: auto.selfEvaluationDateLabel },
              { label: 'CMM Rev Date:', value: auto.cmmRevDateLabel },
              { label: 'Rev. No:', value: formData.revNo },
              { label: 'Letter Ref. No:', value: formData.letterRefNo },
              { label: 'Shop Capability:', value: formData.shopCapability },
              { label: 'Responsible Workshop:', value: formData.responsibleWorkshop, span: 2 },
            ]}
          />

          {/* ---- Promoted top-level items ----------------------------------- */}
          <div className="border border-gray-400 border-t-0">
            {TOC_TOP_LEVEL_FORMS.map(node => renderNode(node, 0))}
          </div>

          {/* ---- The five categories ---------------------------------------- */}
          {TOC_CATEGORIES.map(category => (
            <div key={category.id} className="border border-gray-400 border-t-0">
              <div className="flex items-center gap-2 border-b border-gray-300 bg-gray-100 px-2 py-1">
                <category.Icon className={`h-4 w-4 shrink-0 ${category.color}`} />
                <p className="flex-1 text-[11px] font-bold uppercase tracking-wide text-gray-900">
                  {category.title}
                </p>
                <span className="text-[9px] font-semibold text-gray-500">
                  {`${getCategoryFormCount(category)} forms`}
                </span>
              </div>

              {category.forms.map(node => renderNode(node, 0))}

              {category.subGroups?.map(group => (
                <div key={group.id}>
                  <div className="border-b border-gray-200 bg-gray-50 px-2 py-1 pl-4">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-gray-700">
                      {group.title}
                    </p>
                  </div>
                  {group.forms.map(node => renderNode(node, 1))}
                </div>
              ))}
            </div>
          ))}

          {/*
            ---- Prepared by / Approved by  (2)+(3) ------------------------------------
            `formType` + `instance` make the two lines automatic. The rows are pinned by
            `block` + `expectedRoles` rather than `slotIndex`, because the folder matrix
            declares a THIRD "Signed Off By:" line and its second caption is "Reviewed By:" —
            pinning positionally would re-label this printed sheet. See the header note.

            `includeWorkflowSteps` stays at its default: the Director's folder-level final
            sign-off, which this sheet does not pre-print, is then RECORDED underneath in the
            same paper geometry once it is actually executed.
          */}
          <SignatureBlock
            editable={isEditing}
            formType={FORM_TYPE}
            instance={instance}
            statement={TOC_STATEMENT}
            rows={[
              {
                label: 'Prepared By:',
                role: APPROVER_TITLES.tnaPreparedBy,
                block: SignatureBlockType.PreparedBy,
                expectedRoles: [ORG_ROLES.TeamLeader, ORG_ROLES.Engineer],
                name: formData.preparedByName,
                date: formData.preparedByDate,
                onNameChange: value =>
                  setFormData(prev => ({ ...prev, preparedByName: value })),
                onDateChange: value =>
                  setFormData(prev => ({ ...prev, preparedByDate: value })),
              },
              {
                label: 'Approved By:',
                role: APPROVER_TITLES.tnaApprovedByManager,
                block: SignatureBlockType.ApprovedBy,
                expectedRoles: [ORG_ROLES.Manager, ORG_ROLES.ShopManager],
                name: formData.approvedByName,
                date: formData.approvedByDate,
                onNameChange: value =>
                  setFormData(prev => ({ ...prev, approvedByName: value })),
                onDateChange: value =>
                  setFormData(prev => ({ ...prev, approvedByDate: value })),
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
        /** (4) the instance MUST be reloaded so a sign-off repaints the block at once. */
        onStatusChange={() => {
          void loadFromBackend()
          void reloadInstance()
        }}
      />
    </div>
  )
}