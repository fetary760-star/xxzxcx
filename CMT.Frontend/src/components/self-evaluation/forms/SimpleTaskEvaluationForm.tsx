/**
 * SIMPLE TASK COMPONENT EVALUATION FORM — Form No. MNT-1341A
 * Table of Contents node: TRAINING DOCUMENT → SIMILAR TECHNICAL OR SIMPLE TASKS → SIMPLE TASK
 * (NEW — gap-analysis §S-1/§G: complete hard-copy replica replacing the invented form)
 *
 * THE ORIGINAL HARD COPY (scan "simple.pdf")
 * -------------------------------------------
 *   SIMPLE TASK COMPONENT EVALUATION FORM
 *   (Avionics Aircraft Components)
 *   Form No. MNT-1341A · Date 27-Dec-2016 · Rev No. 02 · Rev. date 28-Jul-2021
 *   Cost Center: 577/050
 *   Component Description: ____  MFG P/N: ____  ATA: ____
 *
 *   Table columns (verbatim): CMM SECTION | CRITERIA | YES | NO | N/A
 *   1 Component Operation
 *   2 Testing/Fault Isolation (a)
 *   3 Testing/Fault Isolation (b)
 *   4 Assembly / Disassembly
 *   5 Repair
 *   6 Cleaning
 *   7 Inspection
 *
 *   Brief description of maintenance to be performed on the component:
 *   Note: For an Aircraft component to be categorized as "Simple Task Component"
 *         all evaluation criteria above should have a value "YES or N/A"
 *   Accepted [ ] / Rejected [ ]
 *   Confirmation Statement:
 *   "I confirm that the component indicate above are Simple Task Component and
 *    it can be maintained in the concerned shop with Basic Technical School
 *    Knowledge"          ("indicate" is the paper's own wording — replicate)
 *   Evaluated By: ———— Team Leader
 *   Approved by: ————  Mgr. Avionics Component Shops
 *   Approved by: ————  TL Component Engineering support
 *
 * RULES ENFORCED HERE (gap §G)
 * ----------------------------
 * - G2: the 7 criteria rows are CONTROLLED content — shipped verbatim, no
 *   add/remove affordances; only the YES/NO/N/A selection is per-submission.
 * - G3: the categorization Note and the Confirmation Statement print verbatim.
 * - G5: a validation warning (EDIT MODE ONLY — never on the print replica)
 *   mirrors the paper's Note when any criterion is NO while Accepted is ticked.
 * - P3 §S-4: the ATA identity strip is omitted because it is not part of the
 *   controlled paper form.
 */
'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertTriangle } from 'lucide-react'
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
// Controlled document constants — verbatim from the MNT-1341A hard copy
// ===========================================================================

const FORM_NO = 'MNT-1341A'
const FORM_TITLE = 'SIMPLE TASK COMPONENT EVALUATION FORM'
const FORM_SUBTITLE = '(Avionics Aircraft Components)'
const FORM_DATE = '27-Dec-2016'
const FORM_REV_NO = '02'
const FORM_REV_DATE = '28-Jul-2021'

const CATEGORIZATION_NOTE =
  'Note: For an Aircraft component to be categorized as "Simple Task Component" all evaluation criteria above should have a value "YES or N/A"'

/** The paper's own grammar ("indicate") is replicated verbatim. */
const CONFIRMATION_STATEMENT =
  'I confirm that the component indicate above are Simple Task Component and it can be maintained in the concerned shop with Basic Technical School Knowledge'

/** Signature captions printed on the hard copy (gap §G4) — verbatim. */
const SIGNATURE_ROLES = {
  evaluatedBy: 'Team Leader',
  approvedByManager: 'Mgr. Avionics Component Shops',
  approvedByTL: 'TL Component Engineering support',
} as const

type CriterionAnswer = 'YES' | 'NO' | 'N/A' | ''
const ANSWER_OPTIONS: Exclude<CriterionAnswer, ''>[] = ['YES', 'NO', 'N/A']

interface CriterionRow {
  id: string
  /** Printed CMM section caption. */
  cmmSection: string
  /** Controlled criteria text, verbatim from the paper. */
  criteria: string
  answer: CriterionAnswer
}

/**
 * The 7 controlled criteria rows (gap §G2). The final tick selections of the
 * reference sheet were not legible in the scan, so every row defaults to YES —
 * the only value consistent with a "Simple Task Component" categorization —
 * and MUST be confirmed against the paper sheet (gap §9).
 */
const DEFAULT_CRITERIA: CriterionRow[] = [
  {
    id: 'sp-1',
    cmmSection: 'Component Operation',
    criteria:
      'Component has a simple operation (requires only DC, AC power supply and pressure to be operated).',
    answer: 'YES',
  },
  {
    id: 'sp-2',
    cmmSection: 'Testing/Fault Isolation',
    criteria:
      'Unit test requires only voltage, resistance, current, continuity, pressure measurement and or light / pointer indication.',
    answer: 'YES',
  },
  {
    id: 'sp-3',
    cmmSection: 'Testing/Fault Isolation',
    criteria:
      'Unit test does not require programmable/software based test and test equipment.',
    answer: 'YES',
  },
  {
    id: 'sp-4',
    cmmSection: 'Assembly / Disassembly',
    criteria:
      'Requires standard tools such as screw driver, Torque wrench, crimping tool, and others, and some OEM specified tools including removal and installation tools, insertion/extraction tools, and related tools that do not require a specific training to operate.',
    answer: 'YES',
  },
  {
    id: 'sp-5',
    cmmSection: 'Repair',
    criteria:
      'Repair does not require special facility & Skill. only requires a standard tools as per standard repair practices procedure such as soldering / de-soldering tool, and OEM specified special tools which do not need a training such as crimping, insertion, arbor tool and etc… and should able to be performed with the available facility and man power.',
    answer: 'YES',
  },
  {
    id: 'sp-6',
    cmmSection: 'Cleaning',
    criteria:
      'Requires only standard cleaning materials as per standard repair practices and OEM specified materials. Task should be able to performed with the available cleaning facility and man power.',
    answer: 'YES',
  },
  {
    id: 'sp-7',
    cmmSection: 'Inspection',
    criteria:
      'Requires only Simple visual inspections (such as Crack, Dent, Scratch, notch, physical damage, overheat mark, and pit) and dimensional check using Verner caliper, Micrometer, depth gauge and Filler/thread gauge. Crack Inspection using approved NDT practice (Fluorescent Penetrant, Magnetic Particle, Eddy Current, Ultrasonic, and other approved inspection methods).',
    answer: 'YES',
  },
]

/** Values printed on the reference hard copy — defaults only, always editable. */
const PRINTED_DEFAULTS = {
  costCenter: '577/050',
  componentDescription: '',
  mfgPartNumber: '',
  ata: '',
  maintenanceDescription: 'TEST, CHECK, CLEAN AND REPAIR AS PER CHAPTER CMM 25-35-18.',
} as const

type FormData = {
  /** Auto-filled identity block, mirrored so it persists with the submission. */
  description: string
  partNumber: string
  manufacturer: string
  ataField: string
  aircraft: string
  selfEvaluationDate: string
  cmmRevDate: string
  revNo: string
  letterRefNo: string
  shopCapability: string
  responsibleWorkshop: string

  /** Printed header fields. */
  costCenter: string
  componentDescription: string
  mfgPartNumber: string
  /** The form's own ATA field — kept separate from the ATA-Record identity. */
  formAta: string

  criteria: CriterionRow[]

  maintenanceDescription: string
  /** Explicit routing decision consumed by the catalog's conditional HR step. */
  trainingRequired: boolean

  accepted: boolean
  rejected: boolean

  /** Signature block. */
  evaluatedByName: string
  evaluatedByDate: string
  managerName: string
  managerDate: string
  supportTLName: string
  supportTLDate: string
}

/**
 * P3 §S-4 — label that separates a SYSTEM extension (not printed on the paper
 * controlled form) from the replica body.
 */
export default function SimpleTaskEvaluationForm() {
  const { selectedATARecord } = useSelfEvaluation()
  const auto = useATAAutoFill()

  const defaultData: FormData = {
    description: auto.description,
    partNumber: auto.partNumber,
    manufacturer: auto.manufacturer,
    ataField: auto.ata,
    aircraft: auto.aircraft,
    selfEvaluationDate: auto.selfEvaluationDate,
    cmmRevDate: auto.cmmRevDate,
    revNo: auto.revNo,
    letterRefNo: auto.letterRefNo,
    shopCapability: auto.shopCapability,
    responsibleWorkshop: auto.responsibleWorkshop,

    costCenter: PRINTED_DEFAULTS.costCenter,
    componentDescription: PRINTED_DEFAULTS.componentDescription,
    mfgPartNumber: PRINTED_DEFAULTS.mfgPartNumber,
    formAta: PRINTED_DEFAULTS.ata,

    criteria: DEFAULT_CRITERIA,

    maintenanceDescription: PRINTED_DEFAULTS.maintenanceDescription,
    trainingRequired: true,

    // The final tick of the reference sheet was not legible in the scan —
    // both start unticked and must be recorded by the evaluator (gap §9).
    accepted: false,
    rejected: false,

    evaluatedByName: '',
    evaluatedByDate: '',
    managerName: '',
    managerDate: '',
    supportTLName: '',
    supportTLDate: '',
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
    formType: 'simple_task',
    formNo: FORM_NO,
    revNo: FORM_REV_NO,
    revDate: FORM_REV_DATE,
  })

  // The ATA Record is the only writer of the identity block.
  useATAAutoFillSync<FormData>(
    setFormData,
    {
      description: auto.description,
      partNumber: auto.partNumber,
      manufacturer: auto.manufacturer,
      ataField: auto.ata,
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

  const criteria = formData.criteria?.length ? formData.criteria : DEFAULT_CRITERIA

  const setAnswer = (id: string, answer: CriterionAnswer) => {
    setFormData(prev => ({
      ...prev,
      criteria: (prev.criteria?.length ? prev.criteria : DEFAULT_CRITERIA).map(row =>
        row.id === id ? { ...row, answer } : row,
      ),
    }))
  }

  const setVerdict = (verdict: 'accepted' | 'rejected') => {
    setFormData(prev => ({
      ...prev,
      accepted: verdict === 'accepted',
      rejected: verdict === 'rejected',
    }))
  }

  /** G5 — edit-mode-only mirror of the paper's categorization Note. */
  const noCount = criteria.filter(row => row.answer === 'NO').length
  const showCategorizationWarning = isEditing && noCount > 0 && formData.accepted

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
    key: 'costCenter' | 'componentDescription' | 'mfgPartNumber' | 'formAta',
    label: string,
  ) => (
    <div className="min-w-0 px-2 py-1.5 border-b border-r border-gray-300 last:border-r-0">
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
    role: string,
    nameKey: 'evaluatedByName' | 'managerName' | 'supportTLName',
    dateKey: 'evaluatedByDate' | 'managerDate' | 'supportTLDate',
    last = false,
  ) => (
    <div className={`border-b border-gray-300 px-2 py-2 ${last ? 'border-b-0' : ''}`}>
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
        <div className="md:col-span-3">
          <p className="text-[11px] font-bold text-gray-900">{caption}</p>
          <p className="text-[9px] uppercase text-gray-600">{role}</p>
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
        title="SIMPLE TASK (MNT-1341A)"
        meta={`Form No. ${FORM_NO} · Rev No. ${FORM_REV_NO} · Rev. date ${FORM_REV_DATE}`}
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
              { label: 'Form No.', value: FORM_NO },
              { label: 'Date', value: FORM_DATE },
              { label: 'Rev No.', value: FORM_REV_NO },
              { label: 'Rev. date', value: FORM_REV_DATE },
            ]}
          />

          <div className="border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
            <label className="flex items-center justify-between gap-3">
              <span className="font-medium">Formal training required?</span>
              {isEditing ? (
                <select
                  value={formData.trainingRequired ? 'yes' : 'no'}
                  onChange={event =>
                    void saveTrainingDecision(event.target.value === 'yes')
                  }
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

          {/* ---- Printed header fields --------------------------------------- */}
          <div className="border border-gray-400 border-t-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {headerField('costCenter', 'Cost Center')}
              {headerField('componentDescription', 'Component Description')}
              {headerField('mfgPartNumber', 'MFG P/N')}
              {headerField('formAta', 'ATA')}
            </div>
          </div>

          {/* ---- The controlled criteria table (gap §G2) --------------------- */}
          <div className="overflow-x-auto border border-gray-400 border-t-0">
            <table className="w-full border-collapse text-[11px]">
              <caption className="sr-only">
                Simple task evaluation criteria with a single YES, NO or N/A selection per row
              </caption>
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-2 py-1 w-40 text-left font-semibold">
                    CMM SECTION
                  </th>
                  <th className="border border-gray-300 px-2 py-1 text-left font-semibold">
                    CRITERIA
                  </th>
                  {ANSWER_OPTIONS.map(option => (
                    <th
                      key={option}
                      className="border border-gray-300 px-2 py-1 w-14 text-center font-semibold"
                    >
                      {option}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {criteria.map(row => (
                  <tr key={row.id}>
                    <td className="border border-gray-300 px-2 py-1 align-top font-semibold">
                      <span className="break-words uppercase [overflow-wrap:anywhere]">
                        {row.cmmSection}
                      </span>
                    </td>
                    <td className="border border-gray-300 px-2 py-1 align-top">
                      <span className="break-words [overflow-wrap:anywhere]">{row.criteria}</span>
                    </td>
                    {ANSWER_OPTIONS.map(option => (
                      <td
                        key={option}
                        className="border border-gray-300 px-2 py-1 text-center align-middle"
                      >
                        <CheckCell
                          mark="x"
                          ariaLabel={`${row.cmmSection} — ${option}`}
                          checked={row.answer === option}
                          disabled={!isEditing}
                          onChange={() => setAnswer(row.id, option)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ---- Brief description of maintenance ---------------------------- */}
          <div className="border border-gray-400 border-t-0 px-2 py-2">
            <p className="text-[11px] font-bold text-gray-900">
              Brief description of maintenance to be performed on the component:
            </p>
            {isEditing ? (
              <textarea
                value={formData.maintenanceDescription}
                onChange={event =>
                  setFormData(prev => ({
                    ...prev,
                    maintenanceDescription: event.target.value,
                  }))
                }
                rows={2}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-[11px] leading-snug focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            ) : (
              <p className="mt-0.5 text-[11px] leading-relaxed text-gray-900">
                {formData.maintenanceDescription || ''}
              </p>
            )}
          </div>

          {/* ---- Categorization note (verbatim) ------------------------------ */}
          <div className="border border-gray-400 border-t-0 px-2 py-2">
            <p className="text-[11px] font-semibold italic leading-relaxed text-gray-800">
              {CATEGORIZATION_NOTE}
            </p>
          </div>

          {/* G5 — edit-mode-only mirror of the note; never part of the replica */}
          {showCategorizationWarning && (
            <div className="border border-gray-400 border-t-0 px-2 py-1.5">
              <p className="flex items-start gap-1.5 text-[10px] font-semibold text-amber-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {`${noCount} criterion is marked NO — per the note above, a "Simple Task Component" requires every criterion to be YES or N/A. (Edit-mode warning only; not printed.)`}
              </p>
            </div>
          )}

          {/* ---- Accepted / Rejected ------------------------------------------ */}
          <div className="border border-gray-400 border-t-0 px-2 py-2">
            <div className="flex items-center gap-10">
              {(
                [
                  { key: 'accepted', label: 'Accepted' },
                  { key: 'rejected', label: 'Rejected' },
                ] as const
              ).map(option => (
                <div key={option.key} className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-gray-900">{option.label}</span>
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

          {/* ---- Confirmation statement (verbatim, incl. paper grammar) ------ */}
          <div className="border border-gray-400 border-t-0 px-2 py-2">
            <p className="text-[11px] font-bold text-gray-900">Confirmation Statement:</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-gray-800">
              {CONFIRMATION_STATEMENT}
            </p>
          </div>

          {/* ---- Signature block — captions verbatim (gap §G4) --------------- */}
          <div className="border border-gray-400 border-t-0">
            {signatureCell(
              'Evaluated By:',
              SIGNATURE_ROLES.evaluatedBy,
              'evaluatedByName',
              'evaluatedByDate',
            )}
            {signatureCell(
              'Approved by:',
              SIGNATURE_ROLES.approvedByManager,
              'managerName',
              'managerDate',
            )}
            {signatureCell(
              'Approved by:',
              SIGNATURE_ROLES.approvedByTL,
              'supportTLName',
              'supportTLDate',
              true,
            )}
          </div>
        </CardContent>
      </Card>

      <FormWorkflowFooter
        formSubmissionId={formSubmissionId}
        approvalStatus={approvalStatus}
        ataRecordId={selectedATARecord?.id || ''}
        formNodeType="simple_task"
        canEdit={canEdit}
        canSubmit={canSubmit}
        saving={saving}
        onSubmit={() => void handleSubmitForApproval()}
        onStatusChange={() => void loadFromBackend()}
      />
    </div>
  )
}
