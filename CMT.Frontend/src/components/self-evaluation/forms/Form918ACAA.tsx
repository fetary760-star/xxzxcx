/**
 * =====================================================================================
 * AMENDED v25 — ITEM 14 (2 of 4): 918 A (CAA/ECAA) — FORM MNT 918A
 * Copy to: CMT.Frontend/src/components/self-evaluation/forms/Form918ACAA.tsx
 *          (REPLACES the whole existing file)
 *
 * NOT CHANGED (the hard copy is reproduced exactly as before)
 * ---------------------------------------------------------
 *   - FORM MNT 918A / Revision No. 02 / Revision Date 20-OCT-2022,
 *   - PART NUMBER, DESCRIPTION, MANUFACTURER, "ETHIOPIAN MRO CAPABILITY:" with its ruled
 *     line, the four tick cells, ATA CODE, the five AVAILABLE rows, REMARK,
 *     ADDITION / DELETION, RESPONSIBLE WORKSHOP (ECAA workshop preferred),
 *   - the three printed signature bands, IN THIS ORDER and WITH THESE CAPTIONS:
 *         "RESPONSIBLE DIRECTOR:"        (above the QA-office band)
 *         "Manager Quality Assurance:"   (inside the QA-office band)
 *         "ECAA ACCEPTANCE:"             (the ECAA line of this original only)
 *   - the 12 numbered instructions.
 *
 * CHANGED — THE AUTOMATIC NAME / DATE / SIGNATURE WIRING, marked (1)..(4)
 * ---------------------------------------------------------------------
 *   (1) `useFormWorkflowInstance` resolves the FormWorkflowInstance of this form.
 *   (2) every `<SignatureBlock>` receives `formType` + `instance`.
 *   (3) each declared row is PINNED, and this form needs TWO DIFFERENT pinning styles —
 *       read this, it is the whole subtlety of MNT-918A:
 *
 *         "RESPONSIBLE DIRECTOR:"  -> `slotIndex: 0`.
 *              Matrix slot 0 of '918a_caa' is ApprovedBy / Director and its verbatim caption
 *              is IDENTICAL to the printed one, so pinning by index is exact and also
 *              supplies the WIDE_CAPTION geometry of this family.
 *
 *         "Manager Quality Assurance:" and "ECAA ACCEPTANCE:"  -> pinned by
 *              `block` + `expectedRoles`, NOT by `slotIndex`.
 *              WHY: FORM_SIGNATURE_MATRIX['918a_caa'] declares only TWO slots
 *              (0 = RESPONSIBLE DIRECTOR, 1 = "Endorsed By:" / ECAA Team). It has no QA slot,
 *              and its ECAA caption ("Endorsed By:") is NOT the caption this original prints
 *              ("ECAA ACCEPTANCE:"). Because the matrix caption always wins over the typed
 *              label, `slotIndex: 1` would silently RE-LABEL the printed line — a layout
 *              change, which is forbidden. Pinning by `block` + `expectedRoles` gives the
 *              automatic layer everything it needs to place the executed step (set
 *              membership, never a substring match) while the PRINTED caption and the
 *              PRINTED role title stay exactly as the paper has them.
 *              => layout untouched, values automatic.
 *
 *   (4) `onStatusChange` reloads the form data AND the instance.
 *
 * `includeWorkflowSteps={false}` on all three bands: this form renders three SEPARATE
 * one-row bands, so the default "append the unclaimed matrix lines" behaviour would print
 * the Director line under the QA band and vice versa. `showProgress={false}` for the same
 * reason — the paper has no footer counter.
 *
 * IF YOUR SHOP'S 918A REALLY PRINTS "Endorsed By:" INSTEAD OF "ECAA ACCEPTANCE:"
 * ----------------------------------------------------------------------------
 * then it is a ONE-LINE change: replace the ECAA row's
 * `block` / `expectedRoles` pair with `slotIndex: 1`. Nothing else moves.
 * =====================================================================================
 */
'use client'

import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useFormData } from '@/lib/self-evaluation/useFormData'
import {
  APPROVER_TITLES,
  DEFAULT_APPROVER_NAMES,
  useATAAutoFill,
  useATAAutoFillSync,
} from '@/lib/self-evaluation/useATAAutoFill'
import type { FormNodeType } from '@/lib/self-evaluation/types'
import { ORG_ROLES } from '@/lib/role-hierarchy'
import { SignatureBlockType } from '@/lib/workflow/workflow-types'
// (1) THE MISSING WIRING LINK — resolves the FormWorkflowInstance of this form.
import { useFormWorkflowInstance } from '@/lib/workflow/useFormWorkflowInstance'
import {
  CheckCell,
  DocumentHeader,
  FormToolbar,
  FormWorkflowFooter,
  InstructionList,
  SignatureBlock,
} from './FormDocumentChrome'

// ===========================================================================
// Controlled document constants — verbatim from the MNT 918A hard copy
// ===========================================================================

/** The PERSISTED FormSubmission.FormType and the matrix key. Never rename. */
const FORM_TYPE: FormNodeType = '918a_caa'

const FORM_NO = 'FORM MNT 918A'
const ORGANISATION = 'ETHIOPIAN MRO'
const FORM_TITLE = 'CAPABILITY LIST AMENDMENT'
const FORM_REV_NO = '02'
const FORM_REV_DATE = '20-OCT-2022'

/** Printed position of the Director line inside FORM_SIGNATURE_MATRIX['918a_caa']. */
const SLOT_RESPONSIBLE_DIRECTOR = 0

const QA_HEADING = 'For Quality Assurance Office use only'
const QA_DECISION_LABEL =
  'ACCEPTED / REJECTED (write either “ACCEPTED or REJECTED” in the space provided):'
const QA_REJECTION_LABEL = 'If rejected, please specify reason for rejection:'

/** The printed role title of the ECAA line of this original. */
const ECAA_ROLE_CAPTION = 'Ethiopian Civil Aviation Authority'

const INSTRUCTION_INTRO = 'Directors must provide copy of the following information:'
const INSTRUCTIONS = [
  'Current CMM revision number and date.',
  'All applicable task cards.',
  'Qualified personnel and applicable training record.',
  'Competence assessment for qualified personnel.',
  'Inspection proficiency.',
  'Tooling for all maintenance tasks.',
  'Proof of equivalent tools and their assessment.',
  'Confirmation for the availability of required facility.',
  'Available list of consumables.',
  'Applicable Quality Manual section and Supplemental Procedures',
  'Applicable Forms,',
  'Proof of similarity technology for products.',
]

const SCOPES = [
  { key: 'overhaul', label: 'OVERHAUL' },
  { key: 'repair', label: 'REPAIR' },
  { key: 'inspection', label: 'INSPECTION' },
  { key: 'test', label: 'TEST' },
] as const

type ScopeKey = (typeof SCOPES)[number]['key']

interface FormData extends Record<string, unknown> {
  /** Auto-filled identity block. */
  partNumber: string
  description: string
  manufacturer: string
  ataCode: string
  responsibleWorkshop: string

  /** "ETHIOPIAN MRO CAPABILITY:" free text of the hard copy. */
  ethiopianMroCapability: string
  overhaul: boolean
  repair: boolean
  inspection: boolean
  test: boolean

  adequateFacility: string
  requiredSpecialTools: string
  approvedTestEquipment: string
  approvedTechnicalData: string
  qualifiedPersonnel: string
  remark: string

  addition: boolean
  deletion: boolean

  /**
   * Kept so an un-started form behaves exactly as before. Once a step executes, the printed
   * value comes from the workflow and the layer locks the input.
   */
  responsibleDirector: string
  directorDate: string

  qaDecision: string
  qaRejectionReason: string
  qaManagerName: string
  qaManagerDate: string

  /** ECAA acceptance line, printed only on MNT 918A. */
  ecaaAcceptanceName: string
  ecaaAcceptanceDate: string
}

/** One bordered "LABEL: value" row of the printed form. */
function DocumentRow({
  label,
  children,
  labelWidth = 'sm:w-72',
}: {
  label: string
  children: ReactNode
  labelWidth?: string
}) {
  return (
    <div className="flex flex-col border-b border-gray-300 last:border-b-0 sm:flex-row">
      <div className={`${labelWidth} flex-shrink-0 border-b border-gray-300 px-2 py-1.5 sm:border-b-0 sm:border-r`}>
        <span className="text-[11px] font-semibold uppercase text-gray-800">{label}</span>
      </div>
      <div className="flex-1 px-2 py-1.5">{children}</div>
    </div>
  )
}

export default function Form918ACAA() {
  const { selectedATARecord } = useSelfEvaluation()
  const auto = useATAAutoFill()

  /**
   * MNT 918A is the ECAA copy, so the ECAA workshop of the ATA Record wins
   * (the hard copy prints GALLEY SHOP).
   */
  const ecaaWorkshop =
    selectedATARecord?.ecaaShop || auto.responsibleWorkshop || auto.shopName || ''

  const defaultData: FormData = {
    partNumber: auto.partNumber,
    description: auto.description,
    manufacturer: auto.manufacturer,
    ataCode: auto.ata,
    responsibleWorkshop: ecaaWorkshop,

    ethiopianMroCapability: '',
    overhaul: false,
    repair: true,
    inspection: true,
    test: true,

    adequateFacility: 'AVAILABLE',
    requiredSpecialTools: 'AVAILABLE',
    approvedTestEquipment: 'AVAILABLE',
    approvedTechnicalData: 'AVAILABLE',
    qualifiedPersonnel: 'AVAILABLE',
    remark: '',

    addition: true,
    deletion: false,

    responsibleDirector: DEFAULT_APPROVER_NAMES.responsibleDirector,
    directorDate: '',

    qaDecision: '',
    qaRejectionReason: '',
    qaManagerName: '',
    qaManagerDate: '',

    ecaaAcceptanceName: '',
    ecaaAcceptanceDate: '',
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

  /** (1) The executed steps of THIS form. Never throws; null = unsigned original. */
  const { instance, reload: reloadInstance } = useFormWorkflowInstance({
    formSubmissionId,
    folderId: selectedATARecord?.evaluationFolderId,
  })

  useATAAutoFillSync<FormData>(
    setFormData,
    {
      partNumber: auto.partNumber,
      description: auto.description,
      manufacturer: auto.manufacturer,
      ataCode: auto.ata,
      responsibleWorkshop: ecaaWorkshop,
    },
    [loading, auto.ataRecordId, ecaaWorkshop],
  )

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  const availabilityRows: Array<{ label: string; field: keyof FormData }> = [
    { label: 'ADEQUATE FACILITY:', field: 'adequateFacility' },
    { label: 'REQUIRED SPECIAL TOOLS/EQUIPMENT:', field: 'requiredSpecialTools' },
    { label: 'APPROVED TEST EQUIPMENT:', field: 'approvedTestEquipment' },
    { label: 'APPROVED TECHNICAL DATA:', field: 'approvedTechnicalData' },
    { label: 'QUALIFIED PERSONNEL:', field: 'qualifiedPersonnel' },
  ]

  return (
    <div className="space-y-4">
      <FormToolbar
        title="918 A (CAA) — CAPABILITY LIST AMENDMENT"
        meta={`${FORM_NO} · Revision No.: ${FORM_REV_NO} · Revision Date: ${FORM_REV_DATE}`}
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
            organisation={ORGANISATION}
            title={FORM_TITLE}
            meta={[
              { label: 'Form', value: FORM_NO },
              { label: 'Revision No.:', value: FORM_REV_NO },
              { label: 'Revision Date:', value: FORM_REV_DATE },
            ]}
          />

          <div className="border border-gray-400 border-t-0">
            <DocumentRow label="PART NUMBER:">
              <span className="text-xs font-semibold text-gray-900">
                {formData.partNumber || '—'}
              </span>
            </DocumentRow>
            <DocumentRow label="DESCRIPTION:">
              <span className="text-xs font-semibold text-gray-900">
                {formData.description || '—'}
              </span>
            </DocumentRow>
            <DocumentRow label="MANUFACTURER:">
              <span className="text-xs font-semibold text-gray-900">
                {formData.manufacturer || '—'}
              </span>
            </DocumentRow>
            <DocumentRow label="ETHIOPIAN MRO CAPABILITY:">
              {isEditing ? (
                <Textarea
                  value={formData.ethiopianMroCapability}
                  onChange={event =>
                    setFormData(prev => ({ ...prev, ethiopianMroCapability: event.target.value }))
                  }
                  rows={2}
                  className="text-[11px]"
                />
              ) : (
                <span className="block min-h-[18px] whitespace-pre-line border-b border-dotted border-gray-400 text-xs text-gray-900">
                  {formData.ethiopianMroCapability || ''}
                </span>
              )}
            </DocumentRow>
          </div>

          {/* ---- Maintenance scope tick column ------------------------------ */}
          <div className="border border-gray-400 border-t-0 divide-y divide-gray-300">
            {SCOPES.map(scope => (
              <div key={scope.key} className="flex items-center gap-3 px-2 py-1.5">
                <CheckCell
                  mark="x"
                  ariaLabel={scope.label}
                  checked={formData[scope.key as ScopeKey]}
                  disabled={!isEditing}
                  onChange={value =>
                    setFormData(prev => ({ ...prev, [scope.key]: value }) as FormData)
                  }
                />
                <span className="text-[11px] font-semibold uppercase text-gray-800">
                  {scope.label}
                </span>
              </div>
            ))}
          </div>

          <div className="border border-gray-400 border-t-0">
            <DocumentRow label="ATA CODE:">
              <span className="text-xs font-semibold text-gray-900">{formData.ataCode || '—'}</span>
            </DocumentRow>

            {availabilityRows.map(row => (
              <DocumentRow key={row.label} label={row.label}>
                {isEditing ? (
                  <Input
                    value={String(formData[row.field] ?? '')}
                    onChange={event =>
                      setFormData(prev => ({ ...prev, [row.field]: event.target.value }) as FormData)
                    }
                    className="h-7 max-w-xs text-[11px]"
                  />
                ) : (
                  <span className="text-xs font-semibold text-gray-900">
                    {String(formData[row.field] ?? '') || '—'}
                  </span>
                )}
              </DocumentRow>
            ))}

            <DocumentRow label="REMARK:">
              {isEditing ? (
                <Textarea
                  value={formData.remark}
                  onChange={event => setFormData(prev => ({ ...prev, remark: event.target.value }))}
                  rows={2}
                  className="text-[11px]"
                />
              ) : (
                <span className="whitespace-pre-line text-xs text-gray-900">
                  {formData.remark || ''}
                </span>
              )}
            </DocumentRow>
          </div>

          {/* ---- ADDITION / DELETION --------------------------------------- */}
          <div className="flex flex-wrap items-center gap-8 border border-gray-400 border-t-0 px-2 py-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase text-gray-800">ADDITION</span>
              <CheckCell
                mark="x"
                ariaLabel="Addition"
                checked={formData.addition}
                disabled={!isEditing}
                onChange={value =>
                  setFormData(prev => ({ ...prev, addition: value, deletion: value ? false : prev.deletion }))
                }
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase text-gray-800">DELETION</span>
              <CheckCell
                mark="x"
                ariaLabel="Deletion"
                checked={formData.deletion}
                disabled={!isEditing}
                onChange={value =>
                  setFormData(prev => ({ ...prev, deletion: value, addition: value ? false : prev.addition }))
                }
              />
            </div>
          </div>

          <div className="border border-gray-400 border-t-0">
            <DocumentRow label="RESPONSIBLE WORKSHOP:">
              <span className="text-xs font-semibold text-gray-900">
                {formData.responsibleWorkshop || '—'}
              </span>
            </DocumentRow>
          </div>

          <div className="border border-gray-400 border-t-0 bg-gray-50 px-2 py-1 text-[10px] text-gray-500">
            PART NUMBER, DESCRIPTION, MANUFACTURER, ATA CODE and RESPONSIBLE WORKSHOP are
            auto-populated from the ATA Record.
          </div>

          {/*
            ---- BAND 1: RESPONSIBLE DIRECTOR -----------------------------------------
            (2)+(3) pinned to matrix slot 0 (ApprovedBy / Director). The printed caption of
            the matrix is identical to the caption of this original, so pinning by index is
            exact AND supplies the wide-caption geometry of the MNT-918 family.
          */}
          <SignatureBlock
            editable={isEditing}
            formType={FORM_TYPE}
            instance={instance}
            includeWorkflowSteps={false}
            showProgress={false}
            rows={[
              {
                slotIndex: SLOT_RESPONSIBLE_DIRECTOR,
                label: 'RESPONSIBLE DIRECTOR:',
                role: APPROVER_TITLES.form918Director,
                name: formData.responsibleDirector,
                date: formData.directorDate,
                onNameChange: value =>
                  setFormData(prev => ({ ...prev, responsibleDirector: value })),
                onDateChange: value => setFormData(prev => ({ ...prev, directorDate: value })),
              },
            ]}
          />

          {/* ---- Quality Assurance office band ---------------------------- */}
          <div className="border border-gray-400 border-t-0">
            <div className="border-b border-gray-300 bg-gray-100 px-2 py-1.5">
              <span className="text-[11px] font-bold uppercase text-gray-800">{QA_HEADING}</span>
            </div>
            <DocumentRow label={QA_DECISION_LABEL} labelWidth="sm:w-96">
              {isEditing ? (
                <Input
                  value={formData.qaDecision}
                  onChange={event =>
                    setFormData(prev => ({ ...prev, qaDecision: event.target.value }))
                  }
                  placeholder="ACCEPTED or REJECTED"
                  className="h-7 max-w-xs text-[11px]"
                />
              ) : (
                <span className="text-xs font-semibold text-gray-900">
                  {formData.qaDecision || ''}
                </span>
              )}
            </DocumentRow>
            <DocumentRow label={QA_REJECTION_LABEL} labelWidth="sm:w-96">
              {isEditing ? (
                <Textarea
                  value={formData.qaRejectionReason}
                  onChange={event =>
                    setFormData(prev => ({ ...prev, qaRejectionReason: event.target.value }))
                  }
                  rows={2}
                  className="text-[11px]"
                />
              ) : (
                <span className="whitespace-pre-line text-xs text-gray-900">
                  {formData.qaRejectionReason || ''}
                </span>
              )}
            </DocumentRow>
          </div>

          {/*
            ---- BAND 2: MANAGER QUALITY ASSURANCE ------------------------------------
            Pinned by `block` + `expectedRoles` INSTEAD of `slotIndex`, because the
            '918a_caa' matrix declares no QA slot. This keeps the PRINTED caption and the
            PRINTED role title exactly as the paper has them, while still giving the
            automatic layer a deterministic, set-membership target for the executed step.
          */}
          <SignatureBlock
            editable={isEditing}
            formType={FORM_TYPE}
            instance={instance}
            includeWorkflowSteps={false}
            showProgress={false}
            rows={[
              {
                label: 'Manager Quality Assurance:',
                role: APPROVER_TITLES.form918QAManager,
                block: SignatureBlockType.SignedOffBy,
                expectedRoles: [ORG_ROLES.QAPersonnel],
                name: formData.qaManagerName,
                date: formData.qaManagerDate,
                onNameChange: value => setFormData(prev => ({ ...prev, qaManagerName: value })),
                onDateChange: value => setFormData(prev => ({ ...prev, qaManagerDate: value })),
              },
            ]}
          />

          {/*
            ---- BAND 3: ECAA ACCEPTANCE ---------------------------------------------
            Also pinned by `block` + `expectedRoles`. Matrix slot 1 of '918a_caa' carries the
            caption "Endorsed By:", and the matrix caption always wins over the typed label —
            using `slotIndex: 1` here would RE-LABEL this printed line, which is a layout
            change and therefore not allowed. EndorsedBy + ECAA Team places the endorsement
            on this line with no ambiguity and no relabelling.
          */}
          <SignatureBlock
            editable={isEditing}
            formType={FORM_TYPE}
            instance={instance}
            includeWorkflowSteps={false}
            showProgress={false}
            rows={[
              {
                label: 'ECAA ACCEPTANCE:',
                role: ECAA_ROLE_CAPTION,
                block: SignatureBlockType.EndorsedBy,
                expectedRoles: [ORG_ROLES.ECAAPersonnel],
                name: formData.ecaaAcceptanceName,
                date: formData.ecaaAcceptanceDate,
                onNameChange: value =>
                  setFormData(prev => ({ ...prev, ecaaAcceptanceName: value })),
                onDateChange: value =>
                  setFormData(prev => ({ ...prev, ecaaAcceptanceDate: value })),
              },
            ]}
          />

          <InstructionList heading="Instructions:" intro={INSTRUCTION_INTRO} items={INSTRUCTIONS} />
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
        /** (4) the instance MUST be reloaded, otherwise an endorsement repaints too late. */
        onStatusChange={() => {
          void loadFromBackend()
          void reloadInstance()
        }}
      />
    </div>
  )
}