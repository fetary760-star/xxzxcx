/**
 * SIMILAR TECHNOLOGY EVALUATION CRITERIA — Form No. MNT-1276
 * Table of Contents node: TRAINING DOCUMENT → SIMILAR TECHNICAL OR SIMPLE TASKS → SIMILAR TASK
 * (NEW — gap-analysis §S-1/§F: complete hard-copy replica replacing the invented form)
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The `similar_task` node used to render `SimilarTechnologyForm`, which printed
 * five INVENTED textareas ("Evaluation Criteria", "Existing Capability",
 * "Proposed Capability", "Similarity Justification", "Evaluated/Approved By").
 * None of those labels exist on MNT-1276. This component reproduces the two
 * paper pages verbatim: the header block (Trained / Evaluated component), the
 * 7-column evaluation table, the Accepted/Rejected verdict and the
 * three-line signature block.
 *
 * THE ORIGINAL HARD COPY (scans "simlar1" p.1 + "simlar2" p.2 — one table,
 * paginated in print CSS only)
 * ---------------------------------------------------------------------------
 *   SIMILAR TECHNOLOGY EVALUATION CRITERIA
 *   Form No. MNT-1276 · Issue 01 Mar 2018 · Rev Date 23 Dec 2018
 *   Trained Component: BEVERAGE MAKER · Part Number: 4650-2000-02
 *   Vendor: B/E AEROSPACE · C/C: 374/500
 *   Evaluated Component: BEVERAGE MAKER · Part Number / Vendor (transcribe)
 *   Table columns (verbatim):
 *     L/N | CMM SECTION | SIMILAR TECHNOLOGY EVALUATION CRITERIA |
 *     EVALUATION WEIGHT | TRAINED COMPONENT EVALUATION |
 *     EVALUATED COMPONENT EVALUATION | EVALUATION RESULT (SIMILAR / DISSIMILAR)
 *   Evaluation verdict:  Accepted [x] / Rejected [ ]
 *   Prepared by: ————  Shop Team Leader
 *   Approved by: Ayele G.       Shops Manager                  17/03/20
 *   Approved by: Alemayehu C.   CMT Eng'g Support Team Leader  17/03/20
 *
 * GAP-ANALYSIS ITEMS STILL OPEN (§9)
 * ----------------------------------
 * - F6: the EVALUATION WEIGHT and the two evaluation cells of the row
 *   "Similarity of skill required to use test tools" were not legible in the
 *   scan; they ship as blanks to be transcribed from the paper sheet.
 * - The Evaluated component's Part Number / Vendor were cut off in the scan.
 *
 * P3 §S-4: the ATA identity strip is omitted because it is not part of the
 * controlled paper form.
 */
'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Trash2 } from 'lucide-react'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useFormData } from '@/lib/self-evaluation/useFormData'
import { useATAAutoFill, useATAAutoFillSync } from '@/lib/self-evaluation/useATAAutoFill'
import { ApprovalStatus } from '@/lib/workflow/workflow-types'
import {
  CheckCell,
  DocumentHeader,
  FormToolbar,
  FormWorkflowFooter,
} from './FormDocumentChrome'

// ===========================================================================
// Controlled document constants — verbatim from the MNT-1276 hard copy
// ===========================================================================

const FORM_NO = 'MNT-1276'
const FORM_TITLE = 'SIMILAR TECHNOLOGY EVALUATION CRITERIA'
const ISSUE_DATE = '01 Mar 2018'
const REV_DATE = '23 Dec 2018'

/** Constrained option sets of the paper table (gap §F3). */
type EvaluationWeight = 'MANDATORY' | 'IMPORTANT' | ''
type EvaluationResult = 'SIMILAR' | 'DISSIMILAR' | ''

const WEIGHT_OPTIONS: EvaluationWeight[] = ['MANDATORY', 'IMPORTANT']
const RESULT_OPTIONS: EvaluationResult[] = ['SIMILAR', 'DISSIMILAR']

interface EvaluationRow {
  id: string
  /** Printed line number; continuation rows repeat the parent number. */
  ln: string
  cmmSection: string
  criteria: string
  weight: EvaluationWeight
  trainedEvaluation: string
  evaluatedEvaluation: string
  result: EvaluationResult
}

/**
 * The 13 rows of the reference hard copy, verbatim (gap §F2).
 * Row "Similarity of skill required to use test tools" ships blank — its
 * weight and cells were not legible in the scan (gap §9 F6).
 */
const DEFAULT_ROWS: EvaluationRow[] = [
  {
    id: 'st-1',
    ln: '',
    cmmSection: '',
    criteria: 'Components application on an Aircraft system',
    weight: 'MANDATORY',
    trainedEvaluation: 'BEVERAGE MAKER — CHAPTER 25-55',
    evaluatedEvaluation: 'BEVERAGE MAKER — CHAPTER 25-13-50',
    result: 'SIMILAR',
  },
  {
    id: 'st-2',
    ln: '1',
    cmmSection: 'DESCRIPTION AND OPERATION',
    criteria: 'Components Principle of operation',
    weight: 'IMPORTANT',
    trainedEvaluation:
      'THE BEVERAGE MAKER OPERATES WITH 115VAC, HZ THREE PHASE POWER. ITS FUNCTION IS TO MAKE COFFEE OR TEA WHEN THE PRESET TEMPERATURE IS REACHED AND APPROPRIATE BUTTON IS SELECTED.',
    evaluatedEvaluation:
      'THE BEVERAGE MAKER OPERATES WITH 115VAC, 400 HZ THREE PHASE POWER. ITS FUNCTION IS TO MAKE COFFEE OR TEA WHEN THE PRESET TEMPERATURE IS REACHED AND APPROPRIATE BUTTON IS SELECTED.',
    result: 'SIMILAR',
  },
  {
    id: 'st-3',
    ln: '1',
    cmmSection: '',
    criteria: 'Test set-up and condition similarity',
    weight: 'IMPORTANT',
    trainedEvaluation:
      'PRESSURE TEST, PAV VERIFICATION, VENT VALVE TEST, MINERAL PIT, LOW WATER CHECK, WATER SUPPLY TEMPERATURE CHECK, WATER SUPPLY PRESSURE CHECK, HEATER BLAST TEST, WIRE TEMPERATURE CHECK, HEATER CURRENT CHECK, HOT WATER CHECK, SERVER RETENTION, INITIAL BREW, WATER CHECK SERVER RETENTION, INITIAL BREW, BREW/RECOVERY, BREW OR BREW TEST, BACK-UP BREW/RECOVERY, BREW ON BREW TEST, BACK-UP WITH TEA FUNCTION ONLY, SUBSEQUENT TEA CHECK, PLATEN HEATER CHECK, DRAIN OR WATER TEST, BREW HANDLE CHECK',
    evaluatedEvaluation:
      'PRESSURE TEST, PAV VERIFICATION, VENT VALVE TEST, MINERAL PIT, LOW WATER CHECK, WATER SUPPLY TEMPERATURE CHECK, WATER SUPPLY PRESSURE CHECK, HEATER BLAST TEST, WIRE TEMPERATURE CHECK, HEATER CURRENT CHECK, HOT WATER ATTACHMENT, HEATER CURRENT CHECK, HOT CONNECTION ENGAGEMENT AND PANEL CHECKS SUBSEQUENT BREW, INITIAL TEA BREW (FOR MODELS WITH TEA FUNCTION ONLY), SUBSEQUENT TEA BACK-UP PROBES TEST, CUP/SERVER/BREW-HANDLE SENSOR CHECK, PLATEN HEATER CHECK, DRAIN OR WATER TEST, BREW HANDLE CHECK',
    result: 'SIMILAR',
  },
  {
    id: 'st-4',
    ln: '2',
    cmmSection: 'TEST AND FAULT ISOLATION',
    criteria: 'Test logic or process similarity',
    weight: 'MANDATORY',
    trainedEvaluation:
      'The function of the test procedures is for Tests and Fault Isolation procedures for the 4650-2000-02 Beverage Maker. Beverage Maker must be tested and fault-isolated before they can be returned to service on the aircraft. If the Beverage Maker fails return-to-service testing, it must be replaced or repaired.',
    evaluatedEvaluation:
      'The function of the test procedures is for Tests and Fault Isolation procedures for the 4650-2000-XX. Beverage Maker must be tested and fault-isolated and Return-to-Service using Test Procedures and Fault Isolation before they can be returned to service on the aircraft. If the Beverage Maker fails return-to-service testing, it must be replaced or repaired.',
    result: 'SIMILAR',
  },
  {
    id: 'st-5',
    ln: '2',
    cmmSection: '',
    criteria: 'Similarity of skill required to use test tools',
    // GAP §9 F6 — weight and both evaluation cells not legible in the scan;
    // transcribe from the original paper sheet.
    weight: '',
    trainedEvaluation: '',
    evaluatedEvaluation: '',
    result: 'SIMILAR',
  },
  {
    id: 'st-6',
    ln: '3',
    cmmSection: 'DISASSEMBLY / ASSEMBLY',
    criteria:
      'a. Component construction similarity: Evaluate this component construction based on information available on the CMM Illustrative Part List (IPL)',
    weight: 'IMPORTANT',
    trainedEvaluation:
      'TANK ASSEMBLY/FAUCET ASSEMBLY/BREW HEAD ASSEMBLY/MANIFOLD ASSEMBLY/ELECTRO VALVE',
    evaluatedEvaluation:
      'TANK ASSEMBLY/FAUCET ASSEMBLY/BREW HEAD ASSEMBLY/MANIFOLD ASSEMBLY/ELECTRO VALVE',
    result: 'SIMILAR',
  },
  {
    id: 'st-7',
    ln: '3',
    cmmSection: '',
    criteria:
      'b. Skill required to use the tool required to perform assembly and disassembly on the said evaluated component',
    weight: 'MANDATORY',
    trainedEvaluation: 'Basic Technician Tools',
    evaluatedEvaluation: 'Basic Technician Tools',
    result: 'SIMILAR',
  },
  {
    id: 'st-8',
    ln: '3',
    cmmSection: '',
    criteria: 'Scope of maintenance performed on the component',
    weight: 'MANDATORY',
    trainedEvaluation:
      'Test, Disassembly, Cleaning, Inspection/Check, Repair and Assembly',
    evaluatedEvaluation:
      'Test, Disassembly, Cleaning, Inspection/Check, Repair and Assembly',
    result: 'SIMILAR',
  },
  {
    id: 'st-9',
    ln: '3',
    cmmSection: '',
    criteria: 'Special Methods required to perform assembly and disassembly operation',
    weight: 'IMPORTANT',
    trainedEvaluation: 'NO SPECIAL METHOD REQUIRED.',
    evaluatedEvaluation: 'NO SPECIAL METHOD REQUIRED.',
    result: 'SIMILAR',
  },
  {
    id: 'st-10',
    ln: '4',
    cmmSection: 'CLEANING',
    criteria: 'Methodology required to perform special cleaning procedure',
    weight: 'IMPORTANT',
    trainedEvaluation:
      'WEAR EYE PROTECTION, WATER PROOF PROTECTION GLOVES WHILE PERFORMING FLUSHING AND DE-SCALING OF THE MILK ASSEMBLY',
    evaluatedEvaluation:
      'WEAR EYE PROTECTION, WATER PROOF PROTECTION GLOVES WHILE PERFORMING FLUSHING AND DE-SCALING OF THE MILK ASSEMBLY',
    result: 'SIMILAR',
  },
  {
    id: 'st-11',
    ln: '5',
    cmmSection: 'INSPECTION',
    criteria: 'Methodology required to perform the inspection procedure',
    weight: 'MANDATORY',
    trainedEvaluation: 'General visual inspection/Check Procedure AS per Industry practice',
    evaluatedEvaluation: 'General visual inspection/Check Procedure AS per Industry practice',
    result: 'SIMILAR',
  },
  {
    id: 'st-12',
    ln: '6',
    cmmSection: 'REPAIR',
    criteria:
      'a. Component construction similarity: Evaluate the component construction based on information available on the CMM Illustrative Part List (IPL)',
    weight: 'IMPORTANT',
    trainedEvaluation:
      'TANK ASSEMBLY/FAUCET ASSEMBLY/BREW HEAD ASSEMBLY/MANIFOLD ASSEMBLY/ELECTRO VALVE',
    evaluatedEvaluation:
      'TANK ASSEMBLY/FAUCET ASSEMBLY/BREW HEAD ASSEMBLY/MANIFOLD ASSEMBLY/ELECTRO VALVE',
    result: 'SIMILAR',
  },
  {
    id: 'st-13',
    ln: '6',
    cmmSection: '',
    criteria: 'Special Repair Tasks Similarity Evaluation',
    weight: 'IMPORTANT',
    trainedEvaluation:
      'Use special tools and equipment like: ESD Connector Mat, ESD Grounding Wrist Band, remove tool, Tweezers & extraction, crimp tool, soldering, Lacing using pin, DRILL, Bench Work, Sub-solenoid, PIPING PLIER',
    evaluatedEvaluation:
      'Use special tools and equipment like: ESD Connector Mat, ESD Grounding Wrist Band, remove tool, Tweezers & extraction, crimp tool, soldering, Lacing using pin, DRILL, Bench Work, Sub-solenoid, PIPING PLIER',
    result: 'SIMILAR',
  },
]

/** Values printed on the reference hard copy — defaults only, always editable. */
const PRINTED_DEFAULTS = {
  trainedComponent: 'BEVERAGE MAKER',
  trainedPartNumber: '4650-2000-02',
  trainedVendor: 'B/E AEROSPACE',
  trainedCC: '374/500',
  evaluatedComponent: 'BEVERAGE MAKER',
  // Cut off in the scan — transcribe from the paper sheet (gap §9).
  evaluatedPartNumber: '',
  evaluatedVendor: '',
  managerName: 'Ayele G.',
  managerDate: '17/03/20',
  engineeringTLName: 'Alemayehu C.',
  engineeringTLDate: '17/03/20',
} as const

/** Signature captions printed on the hard copy (gap §F4) — verbatim. */
const SIGNATURE_ROLES = {
  preparedBy: 'Shop Team Leader',
  approvedByManager: 'Shops Manager',
  approvedByEngineering: "CMT Eng'g Support Team Leader",
} as const

type FormData = {
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

  /** Printed header block. */
  trainedComponent: string
  trainedPartNumber: string
  trainedVendor: string
  trainedCC: string
  evaluatedComponent: string
  evaluatedPartNumber: string
  evaluatedVendor: string
  /** Explicit routing decision consumed by the catalog's conditional HR step. */
  trainingRequired: boolean

  rows: EvaluationRow[]

  /** Evaluation verdict, mutually exclusive. */
  accepted: boolean
  rejected: boolean

  /** Signature block. */
  preparedByName: string
  preparedByDate: string
  managerName: string
  managerDate: string
  engineeringTLName: string
  engineeringTLDate: string
}

/**
 * P3 §S-4 — label that separates a SYSTEM extension (not printed on the paper
 * controlled form) from the replica body.
 */
/** Small bordered select used for the two constrained columns (gap §F3). */
function ReplicaSelect<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: T[]
  onChange: (next: T) => void
  ariaLabel: string
}) {
  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={event => onChange(event.target.value as T)}
      className="h-7 w-full rounded border border-gray-300 bg-white px-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400"
    >
      <option value="">—</option>
      {options.map(option => (
        <option key={option || 'blank'} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}

export default function SimilarTaskEvaluationForm() {
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

    trainedComponent: PRINTED_DEFAULTS.trainedComponent,
    trainedPartNumber: PRINTED_DEFAULTS.trainedPartNumber,
    trainedVendor: PRINTED_DEFAULTS.trainedVendor,
    trainedCC: PRINTED_DEFAULTS.trainedCC,
    evaluatedComponent: PRINTED_DEFAULTS.evaluatedComponent,
    evaluatedPartNumber: PRINTED_DEFAULTS.evaluatedPartNumber,
    evaluatedVendor: PRINTED_DEFAULTS.evaluatedVendor,
    trainingRequired: true,

    rows: DEFAULT_ROWS,

    accepted: true,
    rejected: false,

    preparedByName: '',
    preparedByDate: '',
    managerName: PRINTED_DEFAULTS.managerName,
    managerDate: PRINTED_DEFAULTS.managerDate,
    engineeringTLName: PRINTED_DEFAULTS.engineeringTLName,
    engineeringTLDate: PRINTED_DEFAULTS.engineeringTLDate,
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
    formType: 'similar_task',
    formNo: FORM_NO,
    revNo: '',
    revDate: REV_DATE,
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

  const saveTrainingDecision = async (trainingRequired: boolean) => {
    const next = { ...formData, trainingRequired }
    setFormData(next)
    setApprovalStatus(trainingRequired ? ApprovalStatus.Draft : ApprovalStatus.Skipped)
    if (await handleSave(next)) await loadFromBackend()
  }

  const isSkipped =
    formData.trainingRequired === false ||
    (approvalStatus === ApprovalStatus.Skipped && formData.trainingRequired !== true)

  if (isSkipped) {
    return (
      <div className="space-y-4">
        <div className="border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          This form was skipped by the current routing decision. No data or workflow actions are available.
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => void saveTrainingDecision(true)}
        >
          Include
        </Button>
      </div>
    )
  }

  const rows = formData.rows?.length ? formData.rows : DEFAULT_ROWS

  const updateRow = (id: string, patch: Partial<EvaluationRow>) => {
    setFormData(prev => ({
      ...prev,
      rows: (prev.rows?.length ? prev.rows : DEFAULT_ROWS).map(row =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }))
  }

  const addRow = () => {
    setFormData(prev => {
      const current = prev.rows?.length ? prev.rows : DEFAULT_ROWS
      return {
        ...prev,
        rows: [
          ...current,
          {
            id: `st-${Date.now()}`,
            ln: '',
            cmmSection: '',
            criteria: '',
            weight: '',
            trainedEvaluation: '',
            evaluatedEvaluation: '',
            result: '',
          },
        ],
      }
    })
  }

  const removeRow = (id: string) => {
    setFormData(prev => {
      const current = prev.rows?.length ? prev.rows : DEFAULT_ROWS
      return { ...prev, rows: current.filter(row => row.id !== id) }
    })
  }

  const setVerdict = (verdict: 'accepted' | 'rejected') => {
    setFormData(prev => ({
      ...prev,
      accepted: verdict === 'accepted',
      rejected: verdict === 'rejected',
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

  const headerField = (
    key:
      | 'trainedComponent'
      | 'trainedPartNumber'
      | 'trainedVendor'
      | 'trainedCC'
      | 'evaluatedComponent'
      | 'evaluatedPartNumber'
      | 'evaluatedVendor',
    label: string,
  ) => (
    <div className="min-w-0 px-2 py-1.5 border-b border-r border-gray-300">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      {isEditing ? (
        <Input
          value={formData[key]}
          onChange={event => setFormData(prev => ({ ...prev, [key]: event.target.value }))}
          className="h-7 text-[11px]"
        />
      ) : (
        <p className="min-h-[18px] break-words border-b border-dotted border-gray-400 text-[11px] font-semibold uppercase text-gray-900 [overflow-wrap:anywhere]">
          {formData[key] || ''}
        </p>
      )}
    </div>
  )

  const signatureCell = (
    caption: string,
    nameKey: 'preparedByName' | 'managerName' | 'engineeringTLName',
    dateKey: 'preparedByDate' | 'managerDate' | 'engineeringTLDate',
  ) => (
    <div className="border-b border-gray-300 px-2 py-2">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
        <div className="md:col-span-3">
          <p className="text-[11px] font-bold text-gray-900">{caption}</p>
          <p className="text-[9px] uppercase text-gray-600">
            {caption === 'Prepared by:' ? SIGNATURE_ROLES.preparedBy : ''}
          </p>
        </div>
        <div className="md:col-span-4 min-w-0">
          <p className="text-[9px] uppercase text-gray-500">Name</p>
          {isEditing ? (
            <Input
              value={formData[nameKey]}
              onChange={event =>
                setFormData(prev => ({ ...prev, [nameKey]: event.target.value }))
              }
              className="h-7 text-[11px]"
            />
          ) : (
            <p className="min-h-[18px] break-words border-b border-dotted border-gray-400 text-[11px] font-semibold uppercase text-gray-900 [overflow-wrap:anywhere]">
              {formData[nameKey] || ''}
            </p>
          )}
        </div>
        <div className="md:col-span-2">
          <p className="text-[9px] uppercase text-gray-500">Signature</p>
          <p className="min-h-[18px] border-b border-dotted border-gray-400 text-[11px]" />
        </div>
        <div className="md:col-span-3">
          <p className="text-[9px] uppercase text-gray-500">Date</p>
          {isEditing ? (
            <Input
              value={formData[dateKey]}
              placeholder="e.g. 17/03/20"
              onChange={event =>
                setFormData(prev => ({ ...prev, [dateKey]: event.target.value }))
              }
              className="h-7 text-[11px]"
            />
          ) : (
            <p className="min-h-[18px] border-b border-dotted border-gray-400 text-[11px] font-semibold text-gray-900">
              {formData[dateKey] || ''}
            </p>
          )}
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <FormToolbar
        title="SIMILAR TASK (MNT-1276)"
        meta={`Form No. ${FORM_NO} · Issue ${ISSUE_DATE} · Rev Date ${REV_DATE}`}
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
            meta={[
              { label: 'Form No.', value: FORM_NO },
              { label: 'Issue', value: ISSUE_DATE },
              { label: 'Rev Date', value: REV_DATE },
            ]}
          />

          {/* ---- Printed header block: Trained / Evaluated component --------- */}
          <div className="border border-gray-400 border-t-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {headerField('trainedComponent', 'Trained Component')}
              {headerField('trainedPartNumber', 'Part Number (Trained)')}
              {headerField('trainedVendor', 'Vendor (Trained)')}
              {headerField('trainedCC', 'C/C')}
              {headerField('evaluatedComponent', 'Evaluated Component')}
              {headerField('evaluatedPartNumber', 'Part Number (Evaluated)')}
              {headerField('evaluatedVendor', 'Vendor (Evaluated)')}
            </div>
          </div>

          {/* ---- The 7-column evaluation table (one logical table; the paper
                 paginates it over two pages — handle page breaks in print CSS) */}
          <div className="overflow-x-auto border border-gray-400 border-t-0">
            <table className="w-full border-collapse text-[11px]">
              <caption className="sr-only">
                Similar technology evaluation criteria, weights, component evaluations and results
              </caption>
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-1 py-1 w-10 text-center font-semibold">
                    L/N
                  </th>
                  <th className="border border-gray-300 px-2 py-1 w-32 text-left font-semibold">
                    CMM SECTION
                  </th>
                  <th className="border border-gray-300 px-2 py-1 text-left font-semibold">
                    SIMILAR TECHNOLOGY EVALUATION CRITERIA
                  </th>
                  <th className="border border-gray-300 px-2 py-1 w-28 text-center font-semibold">
                    EVALUATION WEIGHT
                  </th>
                  <th className="border border-gray-300 px-2 py-1 text-left font-semibold">
                    TRAINED COMPONENT EVALUATION
                  </th>
                  <th className="border border-gray-300 px-2 py-1 text-left font-semibold">
                    EVALUATED COMPONENT EVALUATION
                  </th>
                  <th className="border border-gray-300 px-2 py-1 w-28 text-center font-semibold">
                    EVALUATION RESULT (SIMILAR / DISSIMILAR)
                  </th>
                  {isEditing && <th className="border border-gray-300 px-1 py-1 w-10" />}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id}>
                    <td className="border border-gray-300 px-1 py-1 text-center align-top font-medium">
                      {isEditing ? (
                        <Input
                          value={row.ln}
                          onChange={event => updateRow(row.id, { ln: event.target.value })}
                          className="h-7 text-[11px]"
                        />
                      ) : (
                        row.ln
                      )}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 align-top">
                      {isEditing ? (
                        <Input
                          value={row.cmmSection}
                          onChange={event =>
                            updateRow(row.id, { cmmSection: event.target.value })
                          }
                          className="h-7 text-[11px]"
                        />
                      ) : (
                        <span className="break-words uppercase [overflow-wrap:anywhere]">
                          {row.cmmSection}
                        </span>
                      )}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 align-top">
                      {isEditing ? (
                        <textarea
                          value={row.criteria}
                          onChange={event => updateRow(row.id, { criteria: event.target.value })}
                          rows={3}
                          className="w-full rounded border border-gray-300 px-1 py-1 text-[11px] leading-snug focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : (
                        <span className="break-words [overflow-wrap:anywhere]">{row.criteria}</span>
                      )}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 text-center align-top">
                      {isEditing ? (
                        <ReplicaSelect<EvaluationWeight>
                          value={row.weight}
                          options={WEIGHT_OPTIONS}
                          onChange={next => updateRow(row.id, { weight: next })}
                          ariaLabel={`Evaluation weight for ${row.criteria || 'row'}`}
                        />
                      ) : (
                        <span className="font-semibold">{row.weight}</span>
                      )}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 align-top">
                      {isEditing ? (
                        <textarea
                          value={row.trainedEvaluation}
                          onChange={event =>
                            updateRow(row.id, { trainedEvaluation: event.target.value })
                          }
                          rows={3}
                          className="w-full rounded border border-gray-300 px-1 py-1 text-[11px] leading-snug focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : (
                        <span className="break-words uppercase [overflow-wrap:anywhere]">
                          {row.trainedEvaluation}
                        </span>
                      )}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 align-top">
                      {isEditing ? (
                        <textarea
                          value={row.evaluatedEvaluation}
                          onChange={event =>
                            updateRow(row.id, { evaluatedEvaluation: event.target.value })
                          }
                          rows={3}
                          className="w-full rounded border border-gray-300 px-1 py-1 text-[11px] leading-snug focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : (
                        <span className="break-words uppercase [overflow-wrap:anywhere]">
                          {row.evaluatedEvaluation}
                        </span>
                      )}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 text-center align-top">
                      {isEditing ? (
                        <ReplicaSelect<EvaluationResult>
                          value={row.result}
                          options={RESULT_OPTIONS}
                          onChange={next => updateRow(row.id, { result: next })}
                          ariaLabel={`Evaluation result for ${row.criteria || 'row'}`}
                        />
                      ) : (
                        <span className="font-semibold">{row.result}</span>
                      )}
                    </td>
                    {isEditing && (
                      <td className="border border-gray-300 px-1 py-1 text-center align-middle">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-red-500"
                          onClick={() => removeRow(row.id)}
                          aria-label={`Remove row ${row.ln || row.id}`}
                        >

                        <div className="border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
                          <label className="flex items-center justify-between gap-3">
                            <span className="font-medium">Formal training required?</span>
                            {isEditing ? (
                              <select
                                value={formData.trainingRequired ? 'yes' : 'no'}
                                onChange={event => void saveTrainingDecision(event.target.value === 'yes')}
                                className="h-7 rounded border border-blue-300 bg-white px-2 text-xs"
                              >
                                <option value="yes">Yes - include training evaluation</option>
                                <option value="no">No - bypass training evaluation</option>
                              </select>
                            ) : (
                              <span>{formData.trainingRequired ? 'Required' : 'Bypassed by evaluator'}</span>
                            )}
                          </label>
                        </div>
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
            <div className="border border-gray-400 border-t-0 px-2 py-2">
              <Button size="sm" variant="outline" onClick={addRow}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Evaluation Row
              </Button>
            </div>
          )}

          {/* ---- Evaluation verdict ------------------------------------------ */}
          <div className="border border-gray-400 border-t-0 px-2 py-2">
            <p className="text-[11px] font-bold text-gray-900">Evaluation verdict:</p>
            <div className="mt-1 flex items-center gap-10">
              {(
                [
                  { key: 'accepted', label: 'Accepted' },
                  { key: 'rejected', label: 'Rejected' },
                ] as const
              ).map(option => (
                <div key={option.key} className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-gray-900">{option.label}</span>
                  <CheckCell
                    mark="x"
                    ariaLabel={option.label}
                    checked={formData[option.key]}
                    disabled={!isEditing}
                    onChange={() => setVerdict(option.key)}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ---- Signature block — captions verbatim (gap §F4) --------------- */}
          <div className="border border-gray-400 border-t-0">
            <div className="bg-gray-100 px-2 py-1">
              <p className="text-[11px] font-bold uppercase text-gray-900">Signatures</p>
            </div>
            {signatureCell('Prepared by:', 'preparedByName', 'preparedByDate')}
            <div className="border-b border-gray-300 px-2 py-2">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                <div className="md:col-span-3">
                  <p className="text-[11px] font-bold text-gray-900">Approved by:</p>
                  <p className="text-[9px] uppercase text-gray-600">
                    {SIGNATURE_ROLES.approvedByManager}
                  </p>
                </div>
                <div className="md:col-span-4 min-w-0">
                  <p className="text-[9px] uppercase text-gray-500">Name</p>
                  {isEditing ? (
                    <Input
                      value={formData.managerName}
                      onChange={event =>
                        setFormData(prev => ({ ...prev, managerName: event.target.value }))
                      }
                      className="h-7 text-[11px]"
                    />
                  ) : (
                    <p className="min-h-[18px] break-words border-b border-dotted border-gray-400 text-[11px] font-semibold uppercase text-gray-900 [overflow-wrap:anywhere]">
                      {formData.managerName || ''}
                    </p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <p className="text-[9px] uppercase text-gray-500">Signature</p>
                  <p className="min-h-[18px] border-b border-dotted border-gray-400 text-[11px]" />
                </div>
                <div className="md:col-span-3">
                  <p className="text-[9px] uppercase text-gray-500">Date</p>
                  {isEditing ? (
                    <Input
                      value={formData.managerDate}
                      placeholder="e.g. 17/03/20"
                      onChange={event =>
                        setFormData(prev => ({ ...prev, managerDate: event.target.value }))
                      }
                      className="h-7 text-[11px]"
                    />
                  ) : (
                    <p className="min-h-[18px] border-b border-dotted border-gray-400 text-[11px] font-semibold text-gray-900">
                      {formData.managerDate || ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="px-2 py-2">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                <div className="md:col-span-3">
                  <p className="text-[11px] font-bold text-gray-900">Approved by:</p>
                  <p className="text-[9px] uppercase text-gray-600">
                    {SIGNATURE_ROLES.approvedByEngineering}
                  </p>
                </div>
                <div className="md:col-span-4 min-w-0">
                  <p className="text-[9px] uppercase text-gray-500">Name</p>
                  {isEditing ? (
                    <Input
                      value={formData.engineeringTLName}
                      onChange={event =>
                        setFormData(prev => ({ ...prev, engineeringTLName: event.target.value }))
                      }
                      className="h-7 text-[11px]"
                    />
                  ) : (
                    <p className="min-h-[18px] break-words border-b border-dotted border-gray-400 text-[11px] font-semibold uppercase text-gray-900 [overflow-wrap:anywhere]">
                      {formData.engineeringTLName || ''}
                    </p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <p className="text-[9px] uppercase text-gray-500">Signature</p>
                  <p className="min-h-[18px] border-b border-dotted border-gray-400 text-[11px]" />
                </div>
                <div className="md:col-span-3">
                  <p className="text-[9px] uppercase text-gray-500">Date</p>
                  {isEditing ? (
                    <Input
                      value={formData.engineeringTLDate}
                      placeholder="e.g. 17/03/20"
                      onChange={event =>
                        setFormData(prev => ({ ...prev, engineeringTLDate: event.target.value }))
                      }
                      className="h-7 text-[11px]"
                    />
                  ) : (
                    <p className="min-h-[18px] border-b border-dotted border-gray-400 text-[11px] font-semibold text-gray-900">
                      {formData.engineeringTLDate || ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <FormWorkflowFooter
        formSubmissionId={formSubmissionId}
        approvalStatus={approvalStatus}
        ataRecordId={selectedATARecord?.id || ''}
        formNodeType="similar_task"
        canEdit={canEdit}
        canSubmit={canSubmit}
        saving={saving}
        onSubmit={() => void handleSubmitForApproval()}
        onStatusChange={() => void loadFromBackend()}
      />
    </div>
  )
}
