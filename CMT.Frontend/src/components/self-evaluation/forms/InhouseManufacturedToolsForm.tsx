/**
 * =====================================================================================
 * AMENDED v31 — IN-HOUSE MANUFACTURED TOOLS PACKAGE (variant-aware hard-copy replicas)
 * Copy to: CMT.Frontend/src/components/self-evaluation/forms/InhouseManufacturedToolsForm.tsx
 *          (REPLACES the whole file)
 *
 * SOURCE HARD COPIES (authoritative, supplied 2026-09-11)
 * ------------------------------------------------------
 *  inhoustool.pdf    -> FORM MNT – 1563, Issue Date 15-Jul-2021, Rev. No. 00
 *                       "IN HOUSE MANUFACTURED TOOL COVER PAGE AND SUMMERY SHEET"
 *  inhoussttol2.pdf  -> MNT-1269 "Ethiopian Tool Manufacturing Task Card"  Page 1 of 2
 *  inhousstool3.pdf  -> MNT-1269 "Ethiopian Tool Manufacturing Task Card"  Page 2 of 2
 *
 * WHAT WAS WRONG
 * --------------
 * The card ignored its `variant` prop entirely. All four TOC nodes
 * (inhouse_manufactured_tools, tool_mfg_jic, tool_risk_assessment, tool_mfg_form_1554)
 * rendered the SAME invented six-field web form (Tool Name / Drawing Reference / Material
 * Specification / Manufacturing Steps / Quality Checks) and shared ONE FormSubmission
 * because `FORM_TYPE` was hard-coded to 'inhouse_manufactured_tools'. None of the printed
 * sections existed: no Tool/Component information, no four YES/NO reverse-engineering
 * questions, no Attached Documents table, no Verification test conformation, no task-card
 * header block, no Tools / Parts On-Off tables, no Job Card Steps, no Measurements, no
 * Actions Taken, no Skill/Hours performed-by log.
 *
 * WHAT v31 DOES (one component, three renderings)
 * ------------------------------------------------
 *  variant inhouse_manufactured_tools / tool_mfg_jic
 *      -> MNT-1563 cover page + summary sheet replica (COVER_SLOTS signatures:
 *         Engineer | Engineering T/L | User section T/L).
 *  variant tool_risk_assessment
 *      -> MNT-1269 two-sheet task card replica (TASKCARD_SLOTS signatures:
 *         Verified By | Validated By | Approved By). The TOC label was corrected to
 *         "TOOL MANUFACTURING TASK CARD" because the MNT-1269 paper IS the task card;
 *         the cover sheet lists "Risk assessment" as a SEPARATE attached document.
 *  variant tool_mfg_form_1554
 *      -> unchanged generic MNT-1554 card (no hard copy supplied for it yet); it now
 *         persists under its OWN formType instead of sharing the parent submission.
 *
 * VERBATIM CONTROLLED TYPOGRAPHY (do NOT "fix"):
 *  "SUMMERY SHEET", "revese", "ATTCHED", "DRAWINGRECORD", "ATACHED", "LABLE", "DRWAING",
 *  "ARCHIEVING", "Reccuring", "Warr anty", "TSE(TOOLS AND SERVICE", "Mgr. Componenet Shop".
 *
 * The filled values of the scanned reference instance (SOLENOID VALVES TEST BOX,
 * 8304-01-0000-01-ETH, 25-37-42, names, dates, WO numbers) are EDITABLE DEFAULTS, exactly
 * like every other replica in this module; ATA Record auto-fill overrides the component
 * identity whenever a record is selected.
 * =====================================================================================
 */
'use client'

import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Plus, Trash2 } from 'lucide-react'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useFormData } from '@/lib/self-evaluation/useFormData'
import { useATAAutoFill, useATAAutoFillSync } from '@/lib/self-evaluation/useATAAutoFill'
import { getFormsByATARecord } from '@/lib/self-evaluation/api'
import type { FormNodeType } from '@/lib/self-evaluation/types'
import { PRINTED_ROLE_CAPTIONS } from '@/lib/workflow/signature-matrix'
import AutoFormSignatureBlock, { useSignatureReloadSignal } from './AutoFormSignatureBlock'
import {
  CheckCell,
  DocumentHeader,
  FormToolbar,
  FormWorkflowFooter,
  type DocumentMetaLine,
} from './FormDocumentChrome'

// =====================================================================================
// Variant configuration
// =====================================================================================

type Variant =
  | 'inhouse_manufactured_tools'
  | 'tool_mfg_jic'
  | 'tool_risk_assessment'
  | 'tool_mfg_form_1554'

type Kind = 'cover' | 'taskcard' | 'generic'

const VARIANT_CONFIG: Record<Variant, { kind: Kind; formNo: string; revNo: string; revDate: string }> = {
  inhouse_manufactured_tools: { kind: 'cover', formNo: 'MNT-1563', revNo: '00', revDate: '15-Jul-2021' },
  tool_mfg_jic: { kind: 'cover', formNo: 'MNT-1563', revNo: '00', revDate: '15-Jul-2021' },
  tool_risk_assessment: { kind: 'taskcard', formNo: 'MNT-1269', revNo: '', revDate: '' },
  tool_mfg_form_1554: { kind: 'generic', formNo: 'MNT-1554', revNo: '', revDate: '' },
}

function acquisitionCodeFromTna(json?: string | null): number {
  if (!json) return 0
  try {
    const root = JSON.parse(json) as Record<string, unknown>
    const items = Object.entries(root).find(([key, value]) =>
      key.toLowerCase() === 'items' && Array.isArray(value),
    )?.[1] as Array<Record<string, unknown>> | undefined
    return (items ?? [])
      .map(item => {
        const entry = Object.entries(item).find(([key]) => key.toLowerCase() === 'acquisitioncode')
        const value = String(entry?.[1] ?? '').trim()
        const match = value.match(/^([1-3])(?:\.|\s|$)/)
        return match ? Number(match[1]) : Number(value)
      })
      .filter(code => code === 1 || code === 2 || code === 3)
      .reduce((highest, code) => Math.max(highest, code), 0)
  } catch {
    return 0
  }
}

// =====================================================================================
// Row shapes of the printed tables
// =====================================================================================

type YesNoValue = { value: string }

type AttachedDocRow = {
  document: string
  attached: boolean
  notRequired: boolean
  pageNumber: string
}

type StepRow = {
  description: string
  resultAction: string
  tech: string
  inspect: string
}

type ToolRow = {
  description: string
  partNo: string
  serialNo: string
  checkedOutTo: string
}

type PartOnOffRow = {
  description: string
  position: string
  removalQty: string
  removalPartNo: string
  removalCondition: string
  installWarranty: string
  installQty: string
  installPartNo: string
  requestId: string
  requestPriority: string
  requestStatus: string
}

type MeasurementRow = {
  parameter: string
  value: string
}

type SkillRow = {
  skill: string
  hours: string
  performedBy: string
  date: string
}

interface FormData extends Record<string, unknown> {
  // ---- MNT-1563 cover page ----
  coverDate: string
  toolDescription: string
  toolPartNumber: string
  originalToolPartNumber: string
  toolFunction: string
  componentDescription: string
  componentAta: string
  componentPartNumber: string
  qCmmAlternateTool: YesNoValue['value']
  qOemDrawings: YesNoValue['value']
  qRiskBased: YesNoValue['value']
  qVerificationTest: YesNoValue['value']
  attachedDocs: AttachedDocRow[]
  totalPages: string
  verificationUnitPn: string
  verificationUnitSn: string
  verificationWorkOrder: string
  engineerName: string
  engineerDate: string
  engineeringTlName: string
  engineeringTlDate: string
  userTlName: string
  userTlDate: string

  // ---- MNT-1269 task card ----
  datePrinted: string
  taskName: string
  priority: string
  originator: string
  aircraft: string
  afh: string
  cycles: string
  tsn: string
  tso: string
  csn: string
  cso: string
  parentInventory: string
  inventory: string
  workOrderNo: string
  reccuring: string
  applicabilityRange: string
  references: string
  system: string
  taskDescription: string
  block: string
  criticalTaskRii: string
  awl: string
  zone: string
  panel: string
  taskInstructions: string
  scheduling: string
  tools: ToolRow[]
  partsOnOff: PartOnOffRow[]
  steps: StepRow[]
  measurements: MeasurementRow[]
  actionsTaken: string
  skillLog: SkillRow[]
  verifiedByName: string
  verifiedByDate: string
  validatedByName: string
  validatedByDate: string
  approvedByName: string
  approvedByDate: string

  // ---- MNT-1554 generic card (legacy fields, kept for stored submissions) ----
  toolName: string
  drawingReference: string
  materialSpecification: string
  manufacturingSteps: string
  qualityChecks: string
  preparedBy: string
  preparedDate: string
  approvedBy: string
  approvedDate: string
  approvedBySpecialTL: string
  approvedBySpecialTLDate: string
}

// =====================================================================================
// Printed defaults — verbatim from the scanned reference instance
// =====================================================================================

const COVER_DEFAULT_DOCS: AttachedDocRow[] = [
  { document: 'Equivalency certificate', attached: true, notRequired: false, pageNumber: '1' },
  { document: 'Tool manufacturing task card', attached: true, notRequired: false, pageNumber: '2' },
  { document: 'Tool drawing', attached: true, notRequired: true, pageNumber: '3' },
  { document: 'Risk assessment', attached: false, notRequired: true, pageNumber: '' },
]

const TASKCARD_DEFAULT_STEPS: StepRow[] = [
  {
    description:
      'TESTTOOL: MANUFACTURE SOLENOID VALVES TEST BOX (P/N:8304-01-0000-01-ETH) AS PER BELOW STEPS. RECORD THE ACTION TAKEN ON THE GIVEN ACTION TAKEN FIELD.',
    resultAction: 'Done',
    tech: '16426 /b',
    inspect: 'XXXXX',
  },
  {
    description:
      'TESTTOOL: AVAIL ALL THE REQUIRED MATERIALS WHICH ARE LISTED ON THE DRAWING (CONNECTOR, SWITCH, SHEET METAL, WIRE, SCREW AND BANANA PLUG. RECORD THE ACTION TAKEN ON THE GIVEN ACTION TAKEN FIELD.',
    resultAction: 'Done',
    tech: '16416 /b',
    inspect: 'XXXXX',
  },
  {
    description:
      'TESTTOOL: [REFER ATTCHED DRAWING]: CONNECT ALL LISTED REQUIRED MATERIALS AS SEEN ON THE ATTACHED DRAWINGRECORD THE ACTION TAKEN ON THE GIVEN ACTION TAKEN FIELD',
    resultAction: 'Done',
    tech: '6416 Qe.',
    inspect: 'XXXXX',
  },
  {
    description:
      'ENG/TESTTOOL: CHECK THAT THE MANUFACTURED TESTER FOR MEETING THE REQUIREMENT INDICATED ON THE DRAWING AND MANUFACTURING INSTRUCTION.RECORD THE ACTION TAKEN ON THE GIVEN ACTION TAKEN FIELD.',
    resultAction: 'CHECKED / CHECKED',
    tech: '8042',
    inspect: 'XXXXX',
  },
  {
    description:
      'TESTTOOL:[REFER ATACHED DRAWING]: ENGRAVE THE TESTER DESCRIPTION SOLENOID VALVE TEST BOX AND PART NUMBER OF THE TESTER P/N: 8304-01-0000-01-ETH) ON THE FRONT FACE OF SOLENOID VALVES TEST BOX AND LABLE EACH WIRES AS PER ATTACHED DRWAING. RECORD THE ACTION TAKEN ON THE GIVEN ACTION TAKEN FIELD.',
    resultAction: 'Done',
    tech: '6426',
    inspect: 'XXXXX',
  },
  {
    description:
      'ENG/GALTECH: PERFORM FUNCTIONAL CHECK AS PER THE COMPONENT MAINTENANCE MANUAL AND CONFIRM ITS FUNCTIONALITY.RECORD THE ACTION TAKEN ON THE GIVEN ACTION TAKEN FIELD.',
    resultAction: 'CHECKED',
    tech: '8042 / XXXXX / 1980',
    inspect: '',
  },
  {
    description:
      'FORE-SHP: CHECK COMPLETENESS OF THE DOCUMENT AND RECEIVE THE SOLENOID VALVES TEST BOX SEND THE DOCUMENT TO COMPONENT MAINTENANCE ENGINEERING FOR ARCHIEVING.RECORD THE ACTION TAKEN ON THE GIVEN ACTION',
    resultAction: 'DONE',
    tech: '19900',
    inspect: 'XXXXX',
  },
]

const TASKCARD_DEFAULT_SKILLS: SkillRow[] = [
  { skill: 'GALTECH', hours: '', performedBy: 'HANNA M', date: '18-APR-24' },
  { skill: 'FORE SHP', hours: '1', performedBy: 'Kious A.', date: '18-APR-24' },
  { skill: 'TESTTOOL', hours: '08.00', performedBy: 'Dereje Yirgu', date: '18-APR-24' },
  { skill: 'ENG', hours: '1', performedBy: 'Selomie A.', date: '18 Apr 2024' },
]

const DEFAULT_DATA: FormData = {
  coverDate: '18 - APR - 2024',
  toolDescription: 'SOLENOID VALVES TEST BOX',
  toolPartNumber: '8304-01-0000-01-ETH',
  originalToolPartNumber: '—',
  toolFunction: 'FOR SOLENOID VALVES TEST',
  componentDescription: 'EXTENDED OVEN',
  componentAta: '25-37-42',
  componentPartNumber: '88031415(6/7)8-SERIES',
  qCmmAlternateTool: 'YES',
  qOemDrawings: 'YES',
  qRiskBased: 'NO',
  qVerificationTest: 'YES',
  attachedDocs: COVER_DEFAULT_DOCS,
  totalPages: '6',
  verificationUnitPn: '8304 - 01 - 0000 - 01',
  verificationUnitSn: '19 - D1 - 0270',
  verificationWorkOrder: 'PO - 64739320',
  engineerName: 'SELOMBE AYALEW',
  engineerDate: '18-APR-2024',
  engineeringTlName: 'Gimeskel G',
  engineeringTlDate: '18-Apr-2024',
  userTlName: 'Kious A',
  userTlDate: '18-APR-2024',

  datePrinted: '16-Apr-2024',
  taskName: 'EO(MFR) 8304-01-0000-01-ETH-JIC (SOLENOID VALVES TEST BOX)',
  priority: 'MAND',
  originator: '',
  aircraft: 'ADMINISTRATIVE - ET-ADMIN',
  afh: '',
  cycles: '',
  tsn: '0',
  tso: '0',
  csn: '0',
  cso: '0',
  parentInventory: 'ADMINISTRATIVE - ET-ADMIN',
  inventory: 'ADMINISTRATIVE - ET-ADMIN',
  workOrderNo: 'WO - 65825096',
  reccuring: 'NO',
  applicabilityRange: '',
  references: '',
  system: 'TSE(TOOLS AND SERVICE',
  taskDescription: 'SOLENOID VALVES TEST BOX',
  block: '',
  criticalTaskRii: '',
  awl: 'NO',
  zone: '',
  panel: '',
  taskInstructions: '',
  scheduling: '',
  tools: [{ description: '', partNo: '', serialNo: '', checkedOutTo: '' }],
  partsOnOff: [
    {
      description: '',
      position: '',
      removalQty: '',
      removalPartNo: '',
      removalCondition: '',
      installWarranty: '',
      installQty: '',
      installPartNo: '',
      requestId: '',
      requestPriority: '',
      requestStatus: '',
    },
  ],
  steps: TASKCARD_DEFAULT_STEPS,
  measurements: [{ parameter: '', value: '' }],
  actionsTaken: '',
  skillLog: TASKCARD_DEFAULT_SKILLS,
  verifiedByName: '',
  verifiedByDate: '',
  validatedByName: 'Kious A',
  validatedByDate: '18-APR-2024',
  approvedByName: 'Selomie A.',
  approvedByDate: '18-APR-2024',

  toolName: '',
  drawingReference: '',
  materialSpecification: '',
  manufacturingSteps: '',
  qualityChecks: '',
  preparedBy: '',
  preparedDate: '',
  approvedBy: '',
  approvedDate: '',
  approvedBySpecialTL: '',
  approvedBySpecialTLDate: '',
}

const COVER_STATEMENT =
  'The above filled data correctness is confirmed by engineering and user section as signed below'

// =====================================================================================
// Small paper primitives (labelled rule / editable cell)
// =====================================================================================

function PaperField({
  label,
  value,
  onChange,
  disabled,
  wide = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  wide?: boolean
}) {
  return (
    <div className={wide ? 'sm:col-span-2 lg:col-span-4' : undefined}>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-600">{label}</p>
      {disabled ? (
        <p className="min-h-[20px] break-words border-b border-gray-500 text-xs font-medium text-gray-900">
          {value || '\u00A0'}
        </p>
      ) : (
        <Input value={value} onChange={event => onChange(event.target.value)} className="h-8 text-xs" />
      )}
    </div>
  )
}

function Cell({
  value,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  disabled: boolean
  ariaLabel: string
}) {
  if (disabled) {
    return (
      <td className="border border-gray-400 px-1.5 py-1 align-top text-[11px] text-gray-900">
        <span className="whitespace-pre-wrap break-words">{value || '\u00A0'}</span>
      </td>
    )
  }
  if (value.length > 60) {
    return (
      <td className="border border-gray-400 p-0 align-top">
        <Textarea
          aria-label={ariaLabel}
          value={value}
          onChange={event => onChange(event.target.value)}
          rows={3}
          className="min-h-0 rounded-none border-0 text-[11px] focus-visible:ring-1"
        />
      </td>
    )
  }
  return (
    <td className="border border-gray-400 p-0 align-top">
      <Input
        aria-label={ariaLabel}
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-7 rounded-none border-0 text-[11px] focus-visible:ring-1"
      />
    </td>
  )
}

function YesNo({
  answer,
  onAnswer,
  disabled,
  question,
}: {
  answer: string
  onAnswer: (value: string) => void
  disabled: boolean
  question: string
}) {
  return (
    <span className="inline-flex items-center gap-4">
      <span className="inline-flex items-center gap-1">
        <CheckCell
          checked={answer === 'YES'}
          disabled={disabled}
          mark="√"
          ariaLabel={`${question} YES`}
          onChange={() => onAnswer(answer === 'YES' ? '' : 'YES')}
        />
        <span className="text-[11px] font-semibold text-gray-900">YES</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <CheckCell
          checked={answer === 'NO'}
          disabled={disabled}
          mark="√"
          ariaLabel={`${question} NO`}
          onChange={() => onAnswer(answer === 'NO' ? '' : 'NO')}
        />
        <span className="text-[11px] font-semibold text-gray-900">NO</span>
      </span>
    </span>
  )
}

function RowTools({
  onAdd,
  onRemove,
  addLabel,
}: {
  onAdd: () => void
  onRemove?: () => void
  addLabel: string
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]" onClick={onAdd}>
        <Plus className="h-3 w-3 mr-0.5" />
        {addLabel}
      </Button>
      {onRemove && (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-1.5 text-[10px] text-red-600 hover:text-red-700"
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      )}
    </span>
  )
}

// =====================================================================================
// The component
// =====================================================================================

interface InhouseManufacturedToolsFormProps {
  variant?: Variant
}

export default function InhouseManufacturedToolsForm({
  variant = 'inhouse_manufactured_tools',
}: InhouseManufacturedToolsFormProps) {
  const config = VARIANT_CONFIG[variant] ?? VARIANT_CONFIG.inhouse_manufactured_tools
  const { selectedATARecord, refreshKey } = useSelfEvaluation()
  const auto = useATAAutoFill()
  const [routingReadOnly, setRoutingReadOnly] = useState(false)
  const [routingResolved, setRoutingResolved] = useState(false)

  useEffect(() => {
    const ataRecordId = selectedATARecord?.id
    if (!ataRecordId) {
      setRoutingReadOnly(false)
      setRoutingResolved(true)
      return
    }

    let cancelled = false
    setRoutingResolved(false)
    void getFormsByATARecord(ataRecordId).then(forms => {
      if (cancelled) return
      const tna = forms
        .filter(form => {
          const type = form.formType.trim().toLowerCase()
          return type === 'tna' || type === 'tool_need_analysis_report'
        })
        .map(form => ({ form, code: acquisitionCodeFromTna(form.formDataJson) }))
        .filter(entry => entry.code > 0)
        .sort((left, right) => right.form.updatedAt.localeCompare(left.form.updatedAt))[0]
      const code = tna?.code ?? 0
      const autoSkipped = code === 1 || code === 2
      setRoutingReadOnly(autoSkipped)
      setRoutingResolved(true)
    }).catch(() => {
      if (!cancelled) {
        setRoutingReadOnly(false)
        setRoutingResolved(true)
      }
    })

    return () => { cancelled = true }
  }, [selectedATARecord?.id, refreshKey, variant])

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
  } = useFormData<FormData>(DEFAULT_DATA, {
    formType: variant,
    formNo: config.formNo,
    revNo: config.revNo,
    revDate: config.revDate,
  })

  const [signatureSignal, refreshSignatures] = useSignatureReloadSignal()

  const disabled = !isEditing

  const handleChange = (field: keyof FormData, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }))

  // ATA Record wins over the scanned defaults whenever a record is selected.
  // The hook itself is called UNCONDITIONALLY (rules of hooks); only the patch varies.
  const autoFillPatch: Partial<FormData> =
    config.kind === 'cover'
      ? {
          componentAta: auto.ata || DEFAULT_DATA.componentAta,
          componentDescription: auto.description || DEFAULT_DATA.componentDescription,
          componentPartNumber: auto.partNumber || DEFAULT_DATA.componentPartNumber,
        }
      : config.kind === 'taskcard'
        ? { aircraft: auto.aircraft || DEFAULT_DATA.aircraft }
        : {}
  useATAAutoFillSync(setFormData, autoFillPatch, [
    auto.ata,
    auto.description,
    auto.partNumber,
    auto.aircraft,
    loading,
  ])

  if (!routingResolved) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
        Checking the TNA acquisition routing…
      </div>
    )
  }

  if (routingReadOnly) {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
        This form was skipped by the TNA acquisition decision. No data or workflow actions are available.
      </div>
    )
  }

  const patchRow = <T extends Record<string, unknown>>(
    field: keyof FormData,
    index: number,
    patch: Partial<T>,
  ) =>
    setFormData(prev => {
      const rows = [...((prev[field] as unknown as T[]) ?? [])]
      if (!rows[index]) return prev
      rows[index] = { ...rows[index], ...patch }
      return { ...prev, [field]: rows } as FormData
    })

  const appendRow = (field: keyof FormData, row: Record<string, unknown>) =>
    setFormData(prev => ({
      ...prev,
      [field]: [...((prev[field] as unknown as Record<string, unknown>[]) ?? []), row],
    }) as FormData)

  const removeRow = (field: keyof FormData, index: number) =>
    setFormData(prev => {
      const rows = [...((prev[field] as unknown as Record<string, unknown>[]) ?? [])]
      rows.splice(index, 1)
      return { ...prev, [field]: rows } as FormData
    })

  if (loading) {
    return (
      <div className="w-full space-y-4">
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  const toolbar = (
    <FormToolbar
      title={
        config.kind === 'taskcard'
          ? 'ETHIOPIAN TOOL MANUFACTURING TASK CARD (MNT-1269)'
          : config.kind === 'cover'
            ? 'IN HOUSE MANUFACTURED TOOL COVER PAGE AND SUMMERY SHEET (MNT-1563)'
            : 'IN-HOUSE MANUFACTURED TOOLS JOB INSTRUCTION CARD (MNT-1554)'
      }
      meta={`Form ${config.formNo}${config.revNo ? ` · Rev. ${config.revNo}` : ''}${
        config.revDate ? ` · ${config.revDate}` : ''
      }`}
      approvalStatus={approvalStatus}
      canEdit={canEdit}
      isEditing={isEditing}
      saving={saving}
      onEdit={() => setIsEditing(true)}
      onCancel={() => setIsEditing(false)}
      onSave={() => void handleSave()}
    />
  )

  const footer = (
    <FormWorkflowFooter
      formSubmissionId={formSubmissionId ?? null}
      approvalStatus={approvalStatus}
      ataRecordId={selectedATARecord?.id ?? ''}
      formNodeType={variant as FormNodeType}
      canEdit={canEdit}
      canSubmit={canSubmit}
      saving={saving}
      onSubmit={() => void handleSubmitForApproval()}
      onStatusChange={() => {
        void loadFromBackend()
        refreshSignatures()
      }}
    />
  )

  // =========================================================================
  // MNT-1563 — cover page and summary sheet
  // =========================================================================

  if (config.kind === 'cover') {
    const coverMeta: DocumentMetaLine[] = [
      { label: 'FORM', value: 'MNT – 1563' },
      { label: 'Issue Date:', value: '15-Jul-2021' },
      { label: 'Rev. No.:', value: '00' },
      { label: 'Rev. Date:', value: '' },
    ]
    const questions: Array<{ text: string; starred: boolean; field: keyof FormData }> = [
      { text: '1. Does the CMM allow to use alternate tool ?', starred: true, field: 'qCmmAlternateTool' },
      { text: '2. Did you use OEM drawings to manufacture the tools locally?', starred: false, field: 'qOemDrawings' },
      { text: '3. Did you use risk based approaches for the revese engineered tool? *', starred: true, field: 'qRiskBased' },
      { text: '4. Is verification test performed on the tool?', starred: true, field: 'qVerificationTest' },
    ]

    return (
      <div className="w-full space-y-4">
        {toolbar}
        <div className="border border-gray-500 bg-white p-3 space-y-3">
          <DocumentHeader title="IN HOUSE MANUFACTURED TOOL COVER PAGE AND SUMMERY SHEET" meta={coverMeta} />

          <div className="max-w-[16rem]">
            <PaperField
              label="Date:"
              value={formData.coverDate}
              onChange={value => handleChange('coverDate', value)}
              disabled={disabled}
            />
          </div>

          {/* Tool information (left) / Component information (right) */}
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 border border-gray-400 p-2 sm:grid-cols-2">
            <div className="space-y-3">
              <PaperField
                label="Tool description"
                value={formData.toolDescription}
                onChange={value => handleChange('toolDescription', value)}
                disabled={disabled}
              />
              <PaperField
                label="Tool P/N"
                value={formData.toolPartNumber}
                onChange={value => handleChange('toolPartNumber', value)}
                disabled={disabled}
              />
              <PaperField
                label="Original tool P/N"
                value={formData.originalToolPartNumber}
                onChange={value => handleChange('originalToolPartNumber', value)}
                disabled={disabled}
              />
              <PaperField
                label="Function of the tool"
                value={formData.toolFunction}
                onChange={value => handleChange('toolFunction', value)}
                disabled={disabled}
              />
            </div>
            <div className="space-y-3 sm:border-l sm:border-gray-300 sm:pl-6">
              <PaperField
                label="Component Description"
                value={formData.componentDescription}
                onChange={value => handleChange('componentDescription', value)}
                disabled={disabled}
              />
              <PaperField
                label="Component ATA"
                value={formData.componentAta}
                onChange={value => handleChange('componentAta', value)}
                disabled={disabled}
              />
              <PaperField
                label="Component PN"
                value={formData.componentPartNumber}
                onChange={value => handleChange('componentPartNumber', value)}
                disabled={disabled}
              />
            </div>
          </div>

          {/* YES / NO reverse-engineering questions */}
          <div className="border border-gray-400 p-2 space-y-1.5">
            {questions.map(question => (
              <div
                key={question.field}
                className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-gray-900"
              >
                <span>{question.text}</span>
                <YesNo
                  question={question.text}
                  answer={formData[question.field] as string}
                  disabled={disabled}
                  onAnswer={value => handleChange(question.field, value)}
                />
              </div>
            ))}
            <p className="pt-1 text-[10px] italic text-gray-700">
              * - Tool manufacturing with reverse engineering will be acceptable if and only if
              "YES" is checked for all conditions with star.
            </p>
          </div>

          {/* Attached documents */}
          <div className="border border-gray-400 p-2 space-y-2">
            <p className="text-center text-[11px] font-semibold text-gray-900">
              Under this cover page, the below listed documents are attached
            </p>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-50 text-gray-700">
                  <th className="border border-gray-400 px-1.5 py-1 text-left font-semibold">Document</th>
                  <th className="border border-gray-400 px-1.5 py-1 font-semibold">Attached</th>
                  <th className="border border-gray-400 px-1.5 py-1 font-semibold">Not Required</th>
                  <th className="border border-gray-400 px-1.5 py-1 font-semibold">Page number</th>
                  {isEditing && <th className="border border-gray-400 px-1 py-1" />}
                </tr>
              </thead>
              <tbody>
                {formData.attachedDocs.map((row, index) => (
                  <tr key={index}>
                    <td className="border border-gray-400 p-0">
                      {disabled ? (
                        <span className="block px-1.5 py-1">{row.document || '\u00A0'}</span>
                      ) : (
                        <Input
                          aria-label={`Attached document ${index + 1}`}
                          value={row.document}
                          onChange={event => patchRow<AttachedDocRow>('attachedDocs', index, { document: event.target.value })}
                          className="h-7 rounded-none border-0 text-[11px] focus-visible:ring-1"
                        />
                      )}
                    </td>
                    <td className="border border-gray-400 px-1.5 py-1 text-center">
                      <CheckCell
                        checked={row.attached}
                        disabled={disabled}
                        mark="√"
                        ariaLabel={`${row.document || index + 1} attached`}
                        onChange={checked => patchRow<AttachedDocRow>('attachedDocs', index, { attached: checked })}
                      />
                    </td>
                    <td className="border border-gray-400 px-1.5 py-1 text-center">
                      <CheckCell
                        checked={row.notRequired}
                        disabled={disabled}
                        mark="√"
                        ariaLabel={`${row.document || index + 1} not required`}
                        onChange={checked => patchRow<AttachedDocRow>('attachedDocs', index, { notRequired: checked })}
                      />
                    </td>
                    <td className="border border-gray-400 p-0">
                      {disabled ? (
                        <span className="block px-1.5 py-1 text-center">{row.pageNumber || '\u00A0'}</span>
                      ) : (
                        <Input
                          aria-label={`${row.document || index + 1} page number`}
                          value={row.pageNumber}
                          onChange={event => patchRow<AttachedDocRow>('attachedDocs', index, { pageNumber: event.target.value })}
                          className="h-7 rounded-none border-0 text-center text-[11px] focus-visible:ring-1"
                        />
                      )}
                    </td>
                    {isEditing && (
                      <td className="border border-gray-400 px-1 py-1 text-center">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-1 text-red-600 hover:text-red-700"
                          onClick={() => removeRow('attachedDocs', index)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {isEditing && (
              <RowTools
                addLabel="Add document"
                onAdd={() =>
                  appendRow('attachedDocs', { document: '', attached: false, notRequired: false, pageNumber: '' })
                }
              />
            )}
            <div className="max-w-[22rem]">
              <PaperField
                label="Total page including cover page:"
                value={formData.totalPages}
                onChange={value => handleChange('totalPages', value)}
                disabled={disabled}
              />
            </div>
          </div>

          {/* Verification test conformation */}
          <div className="border border-gray-400 p-2 space-y-3">
            <p className="text-center text-[11px] font-semibold text-gray-900">
              Verification test conformation
            </p>
            <PaperField
              label="Unit P/N used for verification:"
              value={formData.verificationUnitPn}
              onChange={value => handleChange('verificationUnitPn', value)}
              disabled={disabled}
            />
            <PaperField
              label="Unit S/N used for verification:"
              value={formData.verificationUnitSn}
              onChange={value => handleChange('verificationUnitSn', value)}
              disabled={disabled}
            />
            <PaperField
              label="Component Work order used for verification:"
              value={formData.verificationWorkOrder}
              onChange={value => handleChange('verificationWorkOrder', value)}
              disabled={disabled}
            />
          </div>

          {/* Confirmation signatures — COVER_SLOTS */}
          <AutoFormSignatureBlock
            editable={isEditing}
            formType={variant}
            formSubmissionId={formSubmissionId ?? null}
            folderId={selectedATARecord?.evaluationFolderId}
            reloadSignal={signatureSignal}
            statement={COVER_STATEMENT}
            rows={[
              {
                slotIndex: 0,
                label: 'Engineer',
                role: PRINTED_ROLE_CAPTIONS.coverEngineer,
                name: formData.engineerName,
                date: formData.engineerDate,
                onNameChange: value => handleChange('engineerName', value),
                onDateChange: value => handleChange('engineerDate', value),
              },
              {
                slotIndex: 1,
                label: 'Engineering T/L',
                role: PRINTED_ROLE_CAPTIONS.coverEngineeringTL,
                name: formData.engineeringTlName,
                date: formData.engineeringTlDate,
                onNameChange: value => handleChange('engineeringTlName', value),
                onDateChange: value => handleChange('engineeringTlDate', value),
              },
              {
                slotIndex: 2,
                label: 'User section T/L',
                role: PRINTED_ROLE_CAPTIONS.coverUserSectionTL,
                name: formData.userTlName,
                date: formData.userTlDate,
                onNameChange: value => handleChange('userTlName', value),
                onDateChange: value => handleChange('userTlDate', value),
              },
            ]}
          />
        </div>
        {footer}
      </div>
    )
  }

  // =========================================================================
  // MNT-1269 — Ethiopian Tool Manufacturing Task Card (two sheets)
  // =========================================================================

  if (config.kind === 'taskcard') {
    const sheetMeta = (page: string): DocumentMetaLine[] => [
      { label: 'Form No:', value: 'MNT-1269' },
      { label: 'Page:', value: page },
      { label: 'Line No.:', value: '1' },
    ]

    const stepColumns = (
      <>
        <th className="border border-gray-400 px-1.5 py-1 font-semibold w-12">Order</th>
        <th className="border border-gray-400 px-1.5 py-1 text-left font-semibold">Description</th>
        <th className="border border-gray-400 px-1.5 py-1 font-semibold w-28">Result/Action</th>
        <th className="border border-gray-400 px-1.5 py-1 font-semibold w-28">Tech.</th>
        <th className="border border-gray-400 px-1.5 py-1 font-semibold w-24">Inspect.</th>
        {isEditing && <th className="border border-gray-400 px-1 py-1 w-8" />}
      </>
    )

    const renderStepRow = (row: StepRow, index: number) => (
      <tr key={index}>
        <td className="border border-gray-400 px-1.5 py-1 text-center text-[11px]">{index + 1}</td>
        <Cell
          value={row.description}
          ariaLabel={`Step ${index + 1} description`}
          disabled={disabled}
          onChange={value => patchRow<StepRow>('steps', index, { description: value })}
        />
        <Cell
          value={row.resultAction}
          ariaLabel={`Step ${index + 1} result`}
          disabled={disabled}
          onChange={value => patchRow<StepRow>('steps', index, { resultAction: value })}
        />
        <Cell
          value={row.tech}
          ariaLabel={`Step ${index + 1} technician`}
          disabled={disabled}
          onChange={value => patchRow<StepRow>('steps', index, { tech: value })}
        />
        <Cell
          value={row.inspect}
          ariaLabel={`Step ${index + 1} inspector`}
          disabled={disabled}
          onChange={value => patchRow<StepRow>('steps', index, { inspect: value })}
        />
        {isEditing && index >= 3 && (
          <td className="border border-gray-400 px-1 py-1 text-center">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1 text-red-600 hover:text-red-700"
              onClick={() => removeRow('steps', index)}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </td>
        )}
      </tr>
    )

    return (
      <div className="w-full space-y-4">
        {toolbar}

        {/* ------------------------------ SHEET 1 ------------------------------ */}
        <div className="border border-gray-500 bg-white p-3 space-y-3">
          <DocumentHeader organisation="Ethiopian" title="Ethiopian Tool Manufacturing Task Card" meta={sheetMeta('Page 1 of 2')} />

          <div className="grid grid-cols-1 gap-x-6 gap-y-3 border border-gray-400 p-2 sm:grid-cols-2 lg:grid-cols-4">
            <PaperField label="Date Printed:" value={formData.datePrinted} onChange={v => handleChange('datePrinted', v)} disabled={disabled} />
            <PaperField label="Task Name:" value={formData.taskName} onChange={v => handleChange('taskName', v)} disabled={disabled} wide />
            <PaperField label="Priority:" value={formData.priority} onChange={v => handleChange('priority', v)} disabled={disabled} />
            <PaperField label="Originator:" value={formData.originator} onChange={v => handleChange('originator', v)} disabled={disabled} />
            <PaperField label="Aircraft" value={formData.aircraft} onChange={v => handleChange('aircraft', v)} disabled={disabled} />
            <PaperField label="AFH:" value={formData.afh} onChange={v => handleChange('afh', v)} disabled={disabled} />
            <PaperField label="Cycles:" value={formData.cycles} onChange={v => handleChange('cycles', v)} disabled={disabled} />
            <div className="grid grid-cols-4 gap-2">
              <PaperField label="TSN:" value={formData.tsn} onChange={v => handleChange('tsn', v)} disabled={disabled} />
              <PaperField label="TSO:" value={formData.tso} onChange={v => handleChange('tso', v)} disabled={disabled} />
              <PaperField label="CSN:" value={formData.csn} onChange={v => handleChange('csn', v)} disabled={disabled} />
              <PaperField label="CSO" value={formData.cso} onChange={v => handleChange('cso', v)} disabled={disabled} />
            </div>
            <PaperField label="Parent Inventory:" value={formData.parentInventory} onChange={v => handleChange('parentInventory', v)} disabled={disabled} />
            <PaperField label="Inventory:" value={formData.inventory} onChange={v => handleChange('inventory', v)} disabled={disabled} />
            <PaperField label="Work Order No:" value={formData.workOrderNo} onChange={v => handleChange('workOrderNo', v)} disabled={disabled} />
            <PaperField label="Reccuring:" value={formData.reccuring} onChange={v => handleChange('reccuring', v)} disabled={disabled} />
            <PaperField label="Applicability Range:" value={formData.applicabilityRange} onChange={v => handleChange('applicabilityRange', v)} disabled={disabled} />
            <PaperField label="References:" value={formData.references} onChange={v => handleChange('references', v)} disabled={disabled} />
            <PaperField label="System" value={formData.system} onChange={v => handleChange('system', v)} disabled={disabled} />
            <PaperField label="Task Description:" value={formData.taskDescription} onChange={v => handleChange('taskDescription', v)} disabled={disabled} />
            <PaperField label="Block:" value={formData.block} onChange={v => handleChange('block', v)} disabled={disabled} />
            <PaperField label="Critical Task / RII :" value={formData.criticalTaskRii} onChange={v => handleChange('criticalTaskRii', v)} disabled={disabled} />
            <PaperField label="AWL:" value={formData.awl} onChange={v => handleChange('awl', v)} disabled={disabled} />
            <PaperField label="ZONE" value={formData.zone} onChange={v => handleChange('zone', v)} disabled={disabled} />
            <PaperField label="PANEL" value={formData.panel} onChange={v => handleChange('panel', v)} disabled={disabled} />
            <PaperField label="Task Instructions:" value={formData.taskInstructions} onChange={v => handleChange('taskInstructions', v)} disabled={disabled} />
            <PaperField label="Scheduling:" value={formData.scheduling} onChange={v => handleChange('scheduling', v)} disabled={disabled} />
          </div>

          {/* Tools */}
          <div className="border border-gray-400 p-2 space-y-1">
            <p className="text-[11px] font-semibold text-gray-900">Tools:</p>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-50 text-gray-700">
                  <th className="border border-gray-400 px-1.5 py-1 text-left font-semibold">Tool Description</th>
                  <th className="border border-gray-400 px-1.5 py-1 font-semibold">Part No.</th>
                  <th className="border border-gray-400 px-1.5 py-1 font-semibold">Serial No.</th>
                  <th className="border border-gray-400 px-1.5 py-1 font-semibold">Checked Out To</th>
                  {isEditing && <th className="border border-gray-400 px-1 py-1 w-8" />}
                </tr>
              </thead>
              <tbody>
                {formData.tools.map((row, index) => (
                  <tr key={index}>
                    <Cell value={row.description} ariaLabel={`Tool ${index + 1} description`} disabled={disabled} onChange={v => patchRow<ToolRow>('tools', index, { description: v })} />
                    <Cell value={row.partNo} ariaLabel={`Tool ${index + 1} part no`} disabled={disabled} onChange={v => patchRow<ToolRow>('tools', index, { partNo: v })} />
                    <Cell value={row.serialNo} ariaLabel={`Tool ${index + 1} serial no`} disabled={disabled} onChange={v => patchRow<ToolRow>('tools', index, { serialNo: v })} />
                    <Cell value={row.checkedOutTo} ariaLabel={`Tool ${index + 1} checked out to`} disabled={disabled} onChange={v => patchRow<ToolRow>('tools', index, { checkedOutTo: v })} />
                    {isEditing && (
                      <td className="border border-gray-400 px-1 py-1 text-center">
                        <Button size="sm" variant="ghost" className="h-6 px-1 text-red-600 hover:text-red-700" onClick={() => removeRow('tools', index)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {isEditing && (
              <RowTools addLabel="Add tool" onAdd={() => appendRow('tools', { description: '', partNo: '', serialNo: '', checkedOutTo: '' })} />
            )}
          </div>

          {/* Parts On/Off */}
          <div className="border border-gray-400 p-2 space-y-1">
            <p className="text-[11px] font-semibold text-gray-900">Parts On/Off:</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-[10px]">
                <thead>
                  <tr className="bg-gray-50 text-gray-700">
                    <th rowSpan={2} className="border border-gray-400 px-1 py-1 text-left font-semibold">Description</th>
                    <th rowSpan={2} className="border border-gray-400 px-1 py-1 font-semibold">Position</th>
                    <th colSpan={3} className="border border-gray-400 px-1 py-1 font-semibold">Removal</th>
                    <th colSpan={3} className="border border-gray-400 px-1 py-1 font-semibold">Install</th>
                    <th colSpan={3} className="border border-gray-400 px-1 py-1 font-semibold">Request</th>
                  </tr>
                  <tr className="bg-gray-50 text-gray-700">
                    <th className="border border-gray-400 px-1 py-1 font-semibold">Qty</th>
                    <th className="border border-gray-400 px-1 py-1 font-semibold">Part No / Serial No</th>
                    <th className="border border-gray-400 px-1 py-1 font-semibold">Condition / Reason</th>
                    <th className="border border-gray-400 px-1 py-1 font-semibold">Warr anty</th>
                    <th className="border border-gray-400 px-1 py-1 font-semibold">Qty</th>
                    <th className="border border-gray-400 px-1 py-1 font-semibold">Part No / Serial No</th>
                    <th className="border border-gray-400 px-1 py-1 font-semibold">ID</th>
                    <th className="border border-gray-400 px-1 py-1 font-semibold">Priority</th>
                    <th className="border border-gray-400 px-1 py-1 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.partsOnOff.map((row, index) => (
                    <tr key={index}>
                      <Cell value={row.description} ariaLabel={`Part ${index + 1} description`} disabled={disabled} onChange={v => patchRow<PartOnOffRow>('partsOnOff', index, { description: v })} />
                      <Cell value={row.position} ariaLabel={`Part ${index + 1} position`} disabled={disabled} onChange={v => patchRow<PartOnOffRow>('partsOnOff', index, { position: v })} />
                      <Cell value={row.removalQty} ariaLabel={`Part ${index + 1} removal qty`} disabled={disabled} onChange={v => patchRow<PartOnOffRow>('partsOnOff', index, { removalQty: v })} />
                      <Cell value={row.removalPartNo} ariaLabel={`Part ${index + 1} removal pn`} disabled={disabled} onChange={v => patchRow<PartOnOffRow>('partsOnOff', index, { removalPartNo: v })} />
                      <Cell value={row.removalCondition} ariaLabel={`Part ${index + 1} removal condition`} disabled={disabled} onChange={v => patchRow<PartOnOffRow>('partsOnOff', index, { removalCondition: v })} />
                      <Cell value={row.installWarranty} ariaLabel={`Part ${index + 1} install warranty`} disabled={disabled} onChange={v => patchRow<PartOnOffRow>('partsOnOff', index, { installWarranty: v })} />
                      <Cell value={row.installQty} ariaLabel={`Part ${index + 1} install qty`} disabled={disabled} onChange={v => patchRow<PartOnOffRow>('partsOnOff', index, { installQty: v })} />
                      <Cell value={row.installPartNo} ariaLabel={`Part ${index + 1} install pn`} disabled={disabled} onChange={v => patchRow<PartOnOffRow>('partsOnOff', index, { installPartNo: v })} />
                      <Cell value={row.requestId} ariaLabel={`Part ${index + 1} request id`} disabled={disabled} onChange={v => patchRow<PartOnOffRow>('partsOnOff', index, { requestId: v })} />
                      <Cell value={row.requestPriority} ariaLabel={`Part ${index + 1} request priority`} disabled={disabled} onChange={v => patchRow<PartOnOffRow>('partsOnOff', index, { requestPriority: v })} />
                      <Cell value={row.requestStatus} ariaLabel={`Part ${index + 1} request status`} disabled={disabled} onChange={v => patchRow<PartOnOffRow>('partsOnOff', index, { requestStatus: v })} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {isEditing && (
              <RowTools
                addLabel="Add part"
                onAdd={() =>
                  appendRow('partsOnOff', {
                    description: '',
                    position: '',
                    removalQty: '',
                    removalPartNo: '',
                    removalCondition: '',
                    installWarranty: '',
                    installQty: '',
                    installPartNo: '',
                    requestId: '',
                    requestPriority: '',
                    requestStatus: '',
                  })
                }
              />
            )}
          </div>

          {/* Job Card Steps — sheet 1 prints steps 1..3 */}
          <div className="border border-gray-400 p-2 space-y-1">
            <p className="text-[11px] font-semibold text-gray-900">Job Card Steps:</p>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-50 text-gray-700">{stepColumns}</tr>
              </thead>
              <tbody>{formData.steps.slice(0, 3).map((row, index) => renderStepRow(row, index))}</tbody>
            </table>
          </div>
        </div>

        {/* ------------------------------ SHEET 2 ------------------------------ */}
        <div className="border border-gray-500 bg-white p-3 space-y-3">
          <DocumentHeader organisation="Ethiopian" title="Ethiopian Tool Manufacturing Task Card" meta={sheetMeta('Page 2 of 2')} />

          <div className="border border-gray-400 p-2 space-y-1">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-50 text-gray-700">{stepColumns}</tr>
              </thead>
              <tbody>{formData.steps.slice(3).map((row, offset) => renderStepRow(row, offset + 3))}</tbody>
            </table>
            {isEditing && (
              <RowTools
                addLabel="Add step"
                onAdd={() => appendRow('steps', { description: '', resultAction: '', tech: '', inspect: '' })}
              />
            )}
          </div>

          {/* Measurements */}
          <div className="border border-gray-400 p-2 space-y-1">
            <p className="text-[11px] font-semibold text-gray-900">MEASUREMENTS:</p>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-50 text-gray-700">
                  <th className="border border-gray-400 px-1.5 py-1 text-left font-semibold">PARAMETER</th>
                  <th className="border border-gray-400 px-1.5 py-1 text-left font-semibold">VALUE</th>
                  {isEditing && <th className="border border-gray-400 px-1 py-1 w-8" />}
                </tr>
              </thead>
              <tbody>
                {formData.measurements.map((row, index) => (
                  <tr key={index}>
                    <Cell value={row.parameter} ariaLabel={`Measurement ${index + 1} parameter`} disabled={disabled} onChange={v => patchRow<MeasurementRow>('measurements', index, { parameter: v })} />
                    <Cell value={row.value} ariaLabel={`Measurement ${index + 1} value`} disabled={disabled} onChange={v => patchRow<MeasurementRow>('measurements', index, { value: v })} />
                    {isEditing && (
                      <td className="border border-gray-400 px-1 py-1 text-center">
                        <Button size="sm" variant="ghost" className="h-6 px-1 text-red-600 hover:text-red-700" onClick={() => removeRow('measurements', index)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {isEditing && <RowTools addLabel="Add measurement" onAdd={() => appendRow('measurements', { parameter: '', value: '' })} />}
          </div>

          {/* Actions Taken */}
          <div className="border border-gray-400 p-2 space-y-1">
            <p className="text-[11px] font-semibold text-gray-900">Actions Taken:</p>
            {disabled ? (
              <p className="min-h-[4.5rem] whitespace-pre-wrap break-words text-[11px] text-gray-900">
                {formData.actionsTaken || '\u00A0'}
              </p>
            ) : (
              <Textarea
                aria-label="Actions Taken"
                value={formData.actionsTaken}
                onChange={event => handleChange('actionsTaken', event.target.value)}
                rows={4}
                className="text-[11px]"
              />
            )}
          </div>

          {/* Performed-by skill log */}
          <div className="border border-gray-400 p-2 space-y-1">
            <p className="text-[11px] font-semibold text-gray-900">Signatures:</p>
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-50 text-gray-700">
                  <th className="border border-gray-400 px-1.5 py-1 text-left font-semibold">Skill</th>
                  <th className="border border-gray-400 px-1.5 py-1 font-semibold">Hours</th>
                  <th className="border border-gray-400 px-1.5 py-1 text-left font-semibold">Performed By (Print)</th>
                  <th className="border border-gray-400 px-1.5 py-1 font-semibold">Signature</th>
                  <th className="border border-gray-400 px-1.5 py-1 font-semibold">Date</th>
                  {isEditing && <th className="border border-gray-400 px-1 py-1 w-8" />}
                </tr>
              </thead>
              <tbody>
                {formData.skillLog.map((row, index) => (
                  <tr key={index}>
                    <Cell value={row.skill} ariaLabel={`Skill row ${index + 1}`} disabled={disabled} onChange={v => patchRow<SkillRow>('skillLog', index, { skill: v })} />
                    <Cell value={row.hours} ariaLabel={`Skill ${row.skill} hours`} disabled={disabled} onChange={v => patchRow<SkillRow>('skillLog', index, { hours: v })} />
                    <Cell value={row.performedBy} ariaLabel={`Skill ${row.skill} performed by`} disabled={disabled} onChange={v => patchRow<SkillRow>('skillLog', index, { performedBy: v })} />
                    <td className="border border-gray-400 px-1.5 py-1 text-center text-[10px] text-gray-500">
                      {row.performedBy ? 'signed' : '\u00A0'}
                    </td>
                    <Cell value={row.date} ariaLabel={`Skill ${row.skill} date`} disabled={disabled} onChange={v => patchRow<SkillRow>('skillLog', index, { date: v })} />
                    {isEditing && (
                      <td className="border border-gray-400 px-1 py-1 text-center">
                        <Button size="sm" variant="ghost" className="h-6 px-1 text-red-600 hover:text-red-700" onClick={() => removeRow('skillLog', index)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {isEditing && <RowTools addLabel="Add entry" onAdd={() => appendRow('skillLog', { skill: '', hours: '', performedBy: '', date: '' })} />}
          </div>

          {/* Verified / Validated / Approved — TASKCARD_SLOTS */}
          <AutoFormSignatureBlock
            editable={isEditing}
            formType={variant}
            formSubmissionId={formSubmissionId ?? null}
            folderId={selectedATARecord?.evaluationFolderId}
            reloadSignal={signatureSignal}
            rows={[
              {
                slotIndex: 0,
                label: 'Verified By:',
                role: PRINTED_ROLE_CAPTIONS.taskCardVerifiedBy,
                name: formData.verifiedByName,
                date: formData.verifiedByDate,
                onNameChange: value => handleChange('verifiedByName', value),
                onDateChange: value => handleChange('verifiedByDate', value),
              },
              {
                slotIndex: 1,
                label: 'Validated By:',
                role: PRINTED_ROLE_CAPTIONS.taskCardValidatedBy,
                name: formData.validatedByName,
                date: formData.validatedByDate,
                onNameChange: value => handleChange('validatedByName', value),
                onDateChange: value => handleChange('validatedByDate', value),
              },
              {
                slotIndex: 2,
                label: 'Approved By:',
                role: PRINTED_ROLE_CAPTIONS.taskCardApprovedBy,
                name: formData.approvedByName,
                date: formData.approvedByDate,
                onNameChange: value => handleChange('approvedByName', value),
                onDateChange: value => handleChange('approvedByDate', value),
              },
            ]}
          />
        </div>
        {footer}
      </div>
    )
  }

  // =========================================================================
  // MNT-1554 — generic card (no hard copy supplied yet; legacy fields kept)
  // =========================================================================

  return (
    <div className="w-full space-y-4">
      {toolbar}
      <div className="border border-gray-500 bg-white p-3 space-y-3">
        <DocumentHeader
          title="IN-HOUSE MANUFACTURED TOOLS JOB INSTRUCTION CARD"
          meta={[{ label: 'Form No:', value: 'MNT-1554' }]}
        />
        <div className="grid grid-cols-1 gap-x-6 gap-y-3 border border-gray-400 p-2 sm:grid-cols-2">
          <PaperField label="Tool Name" value={formData.toolName} onChange={v => handleChange('toolName', v)} disabled={disabled} />
          <PaperField label="Tool Part Number" value={formData.toolPartNumber} onChange={v => handleChange('toolPartNumber', v)} disabled={disabled} />
          <PaperField label="Drawing Reference" value={formData.drawingReference} onChange={v => handleChange('drawingReference', v)} disabled={disabled} />
          <PaperField label="Material Specification" value={formData.materialSpecification} onChange={v => handleChange('materialSpecification', v)} disabled={disabled} />
        </div>
        <div className="border border-gray-400 p-2 space-y-1">
          <p className="text-[11px] font-semibold text-gray-900">Manufacturing Steps</p>
          {disabled ? (
            <p className="min-h-[3rem] whitespace-pre-wrap break-words text-[11px]">{formData.manufacturingSteps || '\u00A0'}</p>
          ) : (
            <Textarea
              aria-label="Manufacturing Steps"
              value={formData.manufacturingSteps}
              onChange={event => handleChange('manufacturingSteps', event.target.value)}
              rows={4}
              className="text-[11px]"
            />
          )}
        </div>
        <div className="border border-gray-400 p-2 space-y-1">
          <p className="text-[11px] font-semibold text-gray-900">Quality Checks</p>
          {disabled ? (
            <p className="min-h-[2.5rem] whitespace-pre-wrap break-words text-[11px]">{formData.qualityChecks || '\u00A0'}</p>
          ) : (
            <Textarea
              aria-label="Quality Checks"
              value={formData.qualityChecks}
              onChange={event => handleChange('qualityChecks', event.target.value)}
              rows={3}
              className="text-[11px]"
            />
          )}
        </div>
        <AutoFormSignatureBlock
          editable={isEditing}
          formType={variant}
          formSubmissionId={formSubmissionId ?? null}
          folderId={selectedATARecord?.evaluationFolderId}
          reloadSignal={signatureSignal}
          rows={[
            {
              slotIndex: 0,
              label: 'Prepared By:',
              role: PRINTED_ROLE_CAPTIONS.toolsPreparedBy,
              name: formData.preparedBy,
              date: formData.preparedDate,
              onNameChange: value => handleChange('preparedBy', value),
              onDateChange: value => handleChange('preparedDate', value),
            },
            {
              slotIndex: 1,
              label: 'Approved By:',
              role: PRINTED_ROLE_CAPTIONS.toolsApprovedByManager,
              name: formData.approvedBy,
              date: formData.approvedDate,
              onNameChange: value => handleChange('approvedBy', value),
              onDateChange: value => handleChange('approvedDate', value),
            },
            {
              slotIndex: 2,
              label: 'Approved By:',
              role: PRINTED_ROLE_CAPTIONS.toolsApprovedBySpecialTL,
              name: formData.approvedBySpecialTL,
              date: formData.approvedBySpecialTLDate,
              onNameChange: value => handleChange('approvedBySpecialTL', value),
              onDateChange: value => handleChange('approvedBySpecialTLDate', value),
            },
          ]}
        />
      </div>
      {footer}
    </div>
  )
}
