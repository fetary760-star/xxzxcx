/**
 * =====================================================================================
 * AMENDED v25 — ITEM 14 (1 of 4): 918 FAA — FORM MNT 918, CAPABILITY LIST AMENDMENT
 * Copy to: CMT.Frontend/src/components/self-evaluation/forms/Form918FAA.tsx
 *          (REPLACES the whole existing file)
 *
 * WHAT THIS AMENDMENT CHANGES — AND WHAT IT DOES NOT
 * -------------------------------------------------
 * NOT CHANGED (byte-for-byte identical to the hard copy you approved):
 *   - the locked controlled-document meta  FORM MNT 918 / Revision No. 01 / 15-May-2023,
 *   - the printed row order: PART NUMBER, DESCRIPTION, MANUFACTURER, the four
 *     OVERHAUL / REPAIR / INSPECTION / TEST tick cells, ETHIOPIAN MRO CAPABILITY
 *     LIMITATION, ATA CODE, the five AVAILABLE rows, REMARK, ADDITION / DELETION,
 *     RESPONSIBLE WORKSHOP,
 *   - the two SEPARATE signature bands ("RESPONSIBLE DIRECTOR:" above the QA band,
 *     "Manager Quality Assurance:" inside the QA-office band),
 *   - the 12 numbered "Directors must provide copy of the following information:" items,
 *   - every default of the signed copy (REPAIR / INSPECTION / TEST ticked, ADDITION ticked,
 *     the five rows "AVAILABLE", RESPONSIBLE DIRECTOR pre-filled).
 *
 * CHANGED — THE FOUR WIRING EDITS OF THE AUTOMATIC SIGNATURE LAYER, marked (1)..(4):
 *   (1) `useFormWorkflowInstance({ formSubmissionId, folderId })` resolves the
 *       FormWorkflowInstance of THIS form. `formSubmissionId` is NOT the instance id, which
 *       is exactly why every band printed empty rules before.
 *   (2) both `<SignatureBlock>` calls now receive `formType` + `instance`, which is what
 *       turns Name / Date / Signature automatic (DEFECT A of signature-print v24).
 *   (3) every declared row carries `slotIndex`, its PRINTED POSITION inside
 *       `FORM_SIGNATURE_MATRIX['918_faa']`:
 *            slotIndex 0 -> "RESPONSIBLE DIRECTOR:"      (ApprovedBy,  Director)
 *            slotIndex 1 -> "Manager Quality Assurance:" (SignedOffBy, QA Personnel)
 *       Without it a ONE-ROW band can never resolve its matrix slot (DEFECT B), and the
 *       Director stamp could print on the QA line.
 *   (4) `onStatusChange` reloads BOTH the form data and the instance, so an approval
 *       repaints the signature immediately instead of on the next remount.
 *
 * ONE EXTRA RULE THAT IS SPECIFIC TO A MULTI-BAND FORM
 * ---------------------------------------------------
 * `includeWorkflowSteps` (default true) appends the matrix lines NO declared row claimed.
 * On a form that renders ONE band with ALL its lines that is exactly what you want. Here the
 * form renders TWO bands of ONE row each, so the default would append the QA line under the
 * Director band and the Director line under the QA band — the same signature printed twice.
 * Both bands therefore pass `includeWorkflowSteps={false}`, and each band prints exactly the
 * one line the paper prints there.
 *
 * `showProgress={false}` for the same reason: the hard copy has no footer counter, and a
 * per-band counter would read "0 of 1" next to a signed line of the other band.
 *
 * PRINT STYLE
 * -----------
 * '918_faa' is the ONLY family declared as `SignaturePrintStyle.Columns` in the matrix,
 * because this original really does print an explicit NAME / SIGNATURE / DATE band. The
 * chrome renders that automatically from `formType`; nothing to do here.
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
// Controlled document constants — verbatim from the MNT 918 hard copy
// ===========================================================================

/** The PERSISTED FormSubmission.FormType. It is also the matrix key — never rename it. */
const FORM_TYPE: FormNodeType = '918_faa'

const FORM_NO = 'FORM MNT 918'
const ORGANISATION = 'ETHIOPIAN MRO'
const FORM_TITLE = 'CAPABILITY LIST AMENDMENT'
const FORM_REV_NO = '01'
const FORM_REV_DATE = '15-May-2023'

/**
 * PRINTED POSITIONS inside FORM_SIGNATURE_MATRIX['918_faa'] (signature-matrix.ts v22).
 * Declared as named constants so the two bands can never drift apart again.
 */
const SLOT_RESPONSIBLE_DIRECTOR = 0
const SLOT_MANAGER_QUALITY_ASSURANCE = 1

const QA_HEADING = 'For Quality Assurance Office use only'
const QA_DECISION_LABEL =
  'ACCEPTED / REJECTED (write either “ACCEPTED or REJECTED” in the space provided):'
const QA_REJECTION_LABEL = 'If rejected, please specify reason for rejection:'

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

/** The four maintenance scopes printed with a tick column on the left. */
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

  capabilityLimitation: string
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
   * The signature fields are KEPT so a form whose workflow has not been started still
   * behaves exactly as before. The moment a step is executed the printed value comes from
   * the WORKFLOW and the layer LOCKS these inputs, because a recorded approval must never
   * stay editable.
   */
  responsibleDirector: string
  directorDate: string

  qaDecision: string
  qaRejectionReason: string
  qaManagerName: string
  qaManagerDate: string
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

export default function Form918FAA() {
  const { selectedATARecord } = useSelfEvaluation()
  const auto = useATAAutoFill()

  /**
   * The hard copy prints the FAA workshop (ELECTRIC SHOP) on MNT 918, so the
   * legacy `faaShop` field of the ATA Record wins over the combined
   * `responsibleWorkshop` value.
   */
  const faaWorkshop =
    selectedATARecord?.faaShop || auto.responsibleWorkshop || auto.shopName || ''

  const defaultData: FormData = {
    partNumber: auto.partNumber,
    description: auto.description,
    manufacturer: auto.manufacturer,
    ataCode: auto.ata,
    responsibleWorkshop: faaWorkshop,

    capabilityLimitation: '',
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

  /**
   * (1) THE WORKFLOW INSTANCE OF THIS FORM.
   *
   * Never throws. When nothing resolves (no draft started through the workflow yet)
   * `instance` is null and both bands print the blank hard-copy rules, which is the correct
   * rendering of an unsigned original.
   */
  const { instance, reload: reloadInstance } = useFormWorkflowInstance({
    formSubmissionId,
    folderId: selectedATARecord?.evaluationFolderId,
  })

  // The ATA Record is the only writer of the identity block.
  useATAAutoFillSync<FormData>(
    setFormData,
    {
      partNumber: auto.partNumber,
      description: auto.description,
      manufacturer: auto.manufacturer,
      ataCode: auto.ata,
      responsibleWorkshop: faaWorkshop,
    },
    [loading, auto.ataRecordId, faaWorkshop],
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

  /** Availability rows keep the printed wording and stay editable. */
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
        title="918 (FAA) — CAPABILITY LIST AMENDMENT"
        meta={`${FORM_NO} · Revision No.: ${FORM_REV_NO} · Revision D. ${FORM_REV_DATE}`}
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
              { label: 'Revision D.', value: FORM_REV_DATE },
            ]}
          />

          {/* ---- Identity rows (auto-populated) ----------------------------- */}
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

          {/* ---- Capability limitation / ATA / availability / remark -------- */}
          <div className="border border-gray-400 border-t-0">
            <DocumentRow label="ETHIOPIAN MRO CAPABILITY LIMITATION:">
              {isEditing ? (
                <Textarea
                  value={formData.capabilityLimitation}
                  onChange={event =>
                    setFormData(prev => ({ ...prev, capabilityLimitation: event.target.value }))
                  }
                  rows={2}
                  className="text-[11px]"
                />
              ) : (
                <span className="whitespace-pre-line text-xs text-gray-900">
                  {formData.capabilityLimitation || ''}
                </span>
              )}
            </DocumentRow>

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

          {/* ---- Responsible workshop ------------------------------------- */}
          <div className="border border-gray-400 border-t-0">
            <DocumentRow label="RESPONSIBLE WORKSHOP:">
              <span className="text-xs font-semibold text-gray-900">
                {formData.responsibleWorkshop || '—'}
              </span>
            </DocumentRow>
          </div>

          <div className="flex items-center gap-1.5 border border-gray-400 border-t-0 bg-gray-50 px-2 py-1 text-[10px] text-gray-500">
            PART NUMBER, DESCRIPTION, MANUFACTURER, ATA CODE and RESPONSIBLE WORKSHOP are
            auto-populated from the ATA Record.
          </div>

          {/*
            ---- BAND 1: RESPONSIBLE DIRECTOR ------------------------------------------
            (2) `formType` + `instance` make the band automatic.
            (3) `slotIndex` pins it to matrix slot 0 (ApprovedBy / Director), so a QA
                sign-off can NEVER print on the Director line even though this band renders
                a single row.
            `includeWorkflowSteps={false}` — the QA line belongs to the band further down;
            without this flag it would be appended here as well.
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
            ---- BAND 2: MANAGER QUALITY ASSURANCE -------------------------------------
            Pinned to matrix slot 1 (SignedOffBy / QA Personnel). The joint approval path is
            DIR -> QA (MNT-918), so this line fills ONLY after the Director line above.
          */}
          <SignatureBlock
            editable={isEditing}
            formType={FORM_TYPE}
            instance={instance}
            includeWorkflowSteps={false}
            showProgress={false}
            rows={[
              {
                slotIndex: SLOT_MANAGER_QUALITY_ASSURANCE,
                label: 'Manager Quality Assurance:',
                role: APPROVER_TITLES.form918QAManager,
                name: formData.qaManagerName,
                date: formData.qaManagerDate,
                onNameChange: value => setFormData(prev => ({ ...prev, qaManagerName: value })),
                onDateChange: value => setFormData(prev => ({ ...prev, qaManagerDate: value })),
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
        /**
         * (4) `loadFromBackend()` refreshes the FORM DATA; `reloadInstance()` refreshes the
         * EXECUTED STEPS, which is where the printed name, date and specimen come from.
         * Omitting the second call is why an approval used to require a remount to appear.
         */
        onStatusChange={() => {
          void loadFromBackend()
          void reloadInstance()
        }}
      />
    </div>
  )
}