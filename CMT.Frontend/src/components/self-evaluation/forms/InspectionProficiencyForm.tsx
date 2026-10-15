/**
 * INSPECTION PROFICIENCY ASSESSEMENT FORM — FORM MNT-1378
 * Table of Contents node: TRAINING DOCUMENT → INSPECTION PROFICIENCY (FOR INSPECTION)
 * (AMENDED v19 — gap-analysis corrections self-evaluation-form-gap-analysis.md)
 *
 * WHAT THIS AMENDMENT FIXES
 * -----------------------------------------------------------------------------
 * - P1 §D8: the hard copy prints ONE single "SIGNATURE: ____________" rule and
 *   NOTHING else. The previous view mode rendered extra "Name" and "Date"
 *   caption cells that do not exist on the paper. In view/print mode the block
 *   now renders only the printed SIGNATURE rule; the Name/Date fields remain
 *   available in EDIT mode as data-entry aids and are hidden from the replica.
 * - P2 §D10: the paper carries a page number bottom-right; a "Page 1" print
 *   footer is added.
 * - P3 §S-4: the ATA identity strip and attached authorization certificate are
 *   excluded because they are not part of this controlled paper form.
 *
 * THE ORIGINAL HARD COPY (scan: "inspecprofc")
 * ---------------------------------------------
 *   FORM MNT-1378 · REV. DATE: August 31, 2018 · REV. NO 00
 *   INSPECTION PROFICIENCY ASSESSEMENT FORM   ("ASSESSEMENT" is on the paper)
 *   DATE: 11-Nov-2025 · NAME: HANNA MITIKU · ID NO 19893
 *   INSPECTION PERFORMED BY: KIDUS ABEBE
 *   PASS [x]  FAIL [ ]
 *   NOTE: - IT IS CONFIRMED THAT THE INSPECTOR IS PROFICIENT ON THE BELOW TOOLS LIST
 *   1 .. 28 plain numbered tool list, description + P/N in one printed line
 *   SIGNATURE: ______________   (handwritten only — no printed name/date)
 *   "If the inspector or certifying staff fails to demonstrate the proficiency,
 *    the inspector shall be assessed again using OJT within two weeks."
 *   Page 1 (bottom-right)
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
import {
  CheckCell,
  DocumentHeader,
  FormToolbar,
  FormWorkflowFooter,
} from './FormDocumentChrome'
import TrainingEmployeeAssignment from './TrainingEmployeeAssignment'

// ===========================================================================
// Controlled document constants — verbatim from the MNT-1378 hard copy
// ===========================================================================

const FORM_NO = 'MNT-1378'
const FORM_TITLE = 'INSPECTION PROFICIENCY ASSESSEMENT FORM'
const FORM_REV_NO = '00'
const FORM_REV_DATE = 'August 31, 2018'

const PROFICIENCY_NOTE =
  'NOTE: - IT IS CONFIRMED THAT THE INSPECTOR IS PROFICIENT ON THE BELOW TOOLS LIST'

const FOOTER_INSTRUCTION =
  'If the inspector or certifying staff fails to demonstrate the proficiency, the inspector shall be assessed again using OJT within two weeks.'

/** Values printed on the reference hard copy — defaults only, always editable. */
const PRINTED_DEFAULTS = {
  assessmentDate: '11-Nov-2025',
  inspectorName: 'HANNA MITIKU',
  inspectorId: '19893',
  inspectionPerformedBy: 'KIDUS ABEBE',
} as const

type ProficiencyResult = 'pass' | 'fail'

interface ToolRow {
  id: string
  /** Printed item number, "1" .. "28". */
  no: string
  /** Full printed line including the P/N, e.g. "OVEN TEST BENCH (P/N: ...)". */
  description: string
}

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

  /** Printed header fields of the proficiency form. */
  assessmentDate: string
  inspectorName: string
  inspectorId: string
  inspectionPerformedBy: string
  assignedEmployeeId: string
  assignedEmployeeName: string
  assignedEmployeeRole: string

  result: ProficiencyResult
  note: string
  tools: ToolRow[]

  /** SIGNATURE line — blank on the hard copy, filled only when recorded. */
  signatureName: string
  signatureDate: string

}

/**
 * The 28 tools of the hard copy, verbatim — description and P/N in one printed
 * line, exactly as the original prints them.
 * Gap-analysis §9 items still to confirm against paper: tool 10 "C5710-531"
 * (OCR read "CS710-531") and tool 17 "415 -Z" (OCR read "415 -2").
 */
const DEFAULT_TOOL_DESCRIPTIONS: string[] = [
  'OVEN TEST BENCH (P/N: 8999-05-0000-01)',
  'STEAM OVEN TESTER (P/N: 240536)',
  'DOUBLE STEAM OVEN TEST BENCH (P/N: CS-710-530)',
  'WATER BANK ELECTRO BOX/POWER SUPPLY (115V) (P/N: 8999-03-0000-01)',
  'BEVERAGE MAKER TEST BENCH (P/N: 997626-4)',
  'OCM LOADER (P/N: CS-711-03)',
  'ELECTRICAL SAFETY ANALYZER (P/N: 19032-P)',
  'DIELECTRIC AND INSULATION BREAK DOWN TESTER (P/N: GUARDIAN 6000)',
  'TEST BOX (P/N: TBOXE05, TBOXA08, TBOXT09 & TBOXE08)',
  'PRESSURE TEST PUMP (P/N: C5710-531 & RP50-S)',
  'DIGIMATIC CALIPER (P/N: CD-6"ASX)',
  'DIGITAL TORQUE WRENCH (P/N: JH4-250RB, TSD-400, TSD-50)',
  'THERMO-HYGRO (P/N: 700237101-00)',
  'THERMOMETER (P/N: FLUKE 54IIB)',
  'EVACUATION STATION (P/N: 4041347-001)',
  'CALORIMETER (P/N: 421-5)',
  'REFRIGERATOR TEST CENTER (P/N: 415 -Z)',
  'FLUSH SYSTEM (P/N: 4041040-002)',
  'ANALYZER, TEST RIG (P/N: 4041292-001)',
  'INSPECTION GLASS',
  'MULTIMETER (FLUKE 87V)',
  'CRIMPING TOOL',
  'INSERTION/EXREACTION TOOLS',
  'MANOMETER (P/N: 439005134)',
  'STOPWATCH (P/N: 94460-28)',
  'CRIMPING TOOL (P/N: M22520/2-01)',
  'DIGITAL MICRO OHMMETER (P/N:4300C)',
  'DIGITAL TACHOMETER(LASER) (P/N: DT-207LR)',
]

const DEFAULT_TOOLS: ToolRow[] = DEFAULT_TOOL_DESCRIPTIONS.map((description, index) => ({
  id: `tool-${index + 1}`,
  no: String(index + 1),
  description,
}))

export default function InspectionProficiencyForm() {
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

    // Printed on the hard copy as "11-Nov-2025" — NOT the ATA self-evaluation date.
    assessmentDate: PRINTED_DEFAULTS.assessmentDate,
    inspectorName: PRINTED_DEFAULTS.inspectorName,
    inspectorId: PRINTED_DEFAULTS.inspectorId,
    inspectionPerformedBy: PRINTED_DEFAULTS.inspectionPerformedBy,
    assignedEmployeeId: '',
    assignedEmployeeName: '',
    assignedEmployeeRole: '',

    result: 'pass',
    note: PROFICIENCY_NOTE,
    tools: DEFAULT_TOOLS,

    // The original leaves the SIGNATURE line blank for the wet signature.
    signatureName: '',
    signatureDate: '',

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
    formType: 'inspector_proficiency',
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

  const tools = formData.tools?.length ? formData.tools : DEFAULT_TOOLS

  const updateTool = (id: string, patch: Partial<ToolRow>) => {
    setFormData(prev => ({
      ...prev,
      tools: (prev.tools?.length ? prev.tools : DEFAULT_TOOLS).map(tool =>
        tool.id === id ? { ...tool, ...patch } : tool,
      ),
    }))
  }

  const addTool = () => {
    setFormData(prev => {
      const current = prev.tools?.length ? prev.tools : DEFAULT_TOOLS
      return {
        ...prev,
        tools: [
          ...current,
          { id: `tool-${Date.now()}`, no: String(current.length + 1), description: '' },
        ],
      }
    })
  }

  const removeTool = (id: string) => {
    setFormData(prev => {
      const current = prev.tools?.length ? prev.tools : DEFAULT_TOOLS
      return {
        ...prev,
        tools: current
          .filter(tool => tool.id !== id)
          .map((tool, index) => ({ ...tool, no: String(index + 1) })),
      }
    })
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

  return (
    <div className="space-y-4">
      <FormToolbar
        title="INSPECTION PROFICIENCY (FOR INSPECTION)"
        meta={`Form ${FORM_NO} · Rev. No ${FORM_REV_NO} · Rev. date ${FORM_REV_DATE}`}
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

      <TrainingEmployeeAssignment
        shopId={selectedATARecord?.shopId}
        ataRecordId={selectedATARecord?.id}
        formType="inspector_proficiency"
        role="Inspector"
        employeeId={formData.assignedEmployeeId}
        employeeName={formData.assignedEmployeeName}
        employeeRole={formData.assignedEmployeeRole}
        canEdit={canEdit && isEditing}
        onChange={employee => setFormData(prev => ({
          ...prev,
          assignedEmployeeId: employee.id,
          assignedEmployeeName: employee.name,
          assignedEmployeeRole: employee.role,
          inspectorName: employee.name,
          inspectorId: employee.id,
        }))}
        onIncluded={() => void loadFromBackend()}
      />

      <Card>
        <CardContent className="p-3 space-y-0">
          <DocumentHeader
            organisation="ETHIOPIAN MRO"
            title={FORM_TITLE}
            meta={[
              { label: 'FORM', value: FORM_NO },
              { label: 'REV. DATE:', value: FORM_REV_DATE },
              { label: 'REV. NO', value: FORM_REV_NO },
            ]}
          />

          {/* ---- Printed header fields: DATE / NAME / ID NO / PERFORMED BY --- */}
          <div className="border border-gray-400 border-t-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {
                (
                  [
                    { key: 'assessmentDate', label: 'DATE', placeholder: 'e.g. 11-Nov-2025' },
                    { key: 'inspectorName', label: 'NAME', placeholder: '' },
                    { key: 'inspectorId', label: 'ID NO', placeholder: '' },
                    {
                      key: 'inspectionPerformedBy',
                      label: 'INSPECTION PERFORMED BY',
                      placeholder: '',
                    },
                  ] as const
                ).map(field => (
                  <div
                    key={field.key}
                    className="min-w-0 border-b border-r border-gray-300 px-2 py-1.5"
                  >
                    <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                      {field.label}
                    </p>
                    {isEditing ? (
                      <Input
                        value={formData[field.key]}
                        placeholder={field.placeholder || undefined}
                        onChange={event =>
                          setFormData(prev => ({ ...prev, [field.key]: event.target.value }))
                        }
                        className="h-7 text-[11px]"
                      />
                    ) : (
                      <p className="min-h-[18px] break-words border-b border-dotted border-gray-400 text-[11px] font-semibold uppercase text-gray-900 [overflow-wrap:anywhere]">
                        {formData[field.key] || ''}
                      </p>
                    )}
                  </div>
                ))
              }
            </div>
          </div>

          {/* ---- PASS / FAIL row --------------------------------------------- */}
          <div className="border border-gray-400 border-t-0 px-2 py-2">
            <div className="flex items-center gap-10">
              {
                (
                  [
                    { value: 'pass', label: 'PASS' },
                    { value: 'fail', label: 'FAIL' },
                  ] as const
                ).map(option => (
                  <div key={option.value} className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-900">{option.label}</span>
                    <CheckCell
                      mark="x"
                      ariaLabel={option.label}
                      checked={formData.result === option.value}
                      disabled={!isEditing}
                      onChange={() => setFormData(prev => ({ ...prev, result: option.value }))}
                    />
                  </div>
                ))
              }
            </div>
          </div>

          {/* ---- Note ------------------------------------------------------- */}
          <div className="border border-gray-400 border-t-0 px-2 py-2">
            {isEditing ? (
              <Input
                value={formData.note}
                onChange={event => setFormData(prev => ({ ...prev, note: event.target.value }))}
                className="h-8 text-[11px]"
              />
            ) : (
              <p className="text-[11px] font-bold text-gray-900">{formData.note}</p>
            )}
          </div>

          {/*
            ---- Numbered tool list ------------------------------------------
            The hard copy prints a PLAIN numbered list with no column captions,
            so no <thead> is rendered here.
          */}
          <div className="border border-gray-400 border-t-0">
            <table className="w-full border-collapse text-[11px]">
              <tbody>
                {tools.map(tool => (
                  <tr key={tool.id}>
                    <td className="w-10 border-b border-r border-gray-300 px-1 py-1 text-center align-top font-medium">
                      {tool.no}
                    </td>
                    <td className="border-b border-gray-300 px-2 py-1 align-top">
                      {isEditing ? (
                        <Input
                          value={tool.description}
                          onChange={event => updateTool(tool.id, { description: event.target.value })}
                          className="h-7 text-[11px]"
                        />
                      ) : (
                        <span className="break-words uppercase [overflow-wrap:anywhere]">
                          {tool.description}
                        </span>
                      )}
                    </td>
                    {isEditing && (
                      <td className="w-10 border-b border-l border-gray-300 px-1 py-1 text-center align-middle">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-red-500"
                          onClick={() => removeTool(tool.id)}
                          aria-label={`Remove tool ${tool.no}`}
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
            <div className="border border-gray-400 border-t-0 px-2 py-2">
              <Button size="sm" variant="outline" onClick={addTool}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Tool
              </Button>
            </div>
          )}

          {/*
            ---- SIGNATURE (AMENDED v19, D8) ----------------------------------
            VIEW / PRINT mode: the hard copy prints ONLY a single
            "SIGNATURE: ____________" rule — nothing else.
            EDIT mode: Name and Date are offered as data-entry aids and are
            hidden from the replica view.
          */}
          <div className="border border-gray-400 border-t-0 px-2 py-2">
            {!isEditing ? (
              <div className="flex items-baseline gap-2">
                <p className="text-[11px] font-bold text-gray-900">SIGNATURE:</p>
                <p className="min-h-[20px] flex-1 border-b border-dotted border-gray-400 text-xs font-medium uppercase text-gray-900">
                  {formData.signatureName || ''}
                </p>
                {formData.signatureDate && (
                  <span className="text-[11px] text-gray-700">{formData.signatureDate}</span>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                <div className="md:col-span-3">
                  <p className="text-[11px] font-bold text-gray-900">SIGNATURE:</p>
                  <p className="text-[9px] italic text-gray-500">
                    (Name/Date below are data-entry aids — the paper prints only the rule)
                  </p>
                </div>
                <div className="md:col-span-4">
                  <p className="text-[9px] uppercase text-gray-500">Name</p>
                  <Input
                    value={formData.signatureName}
                    onChange={event =>
                      setFormData(prev => ({ ...prev, signatureName: event.target.value }))
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div className="md:col-span-2">
                  <p className="text-[9px] uppercase text-gray-500">Signature</p>
                  <p className="min-h-[20px] border-b border-dotted border-gray-400 text-xs" />
                </div>
                <div className="md:col-span-3">
                  <p className="text-[9px] uppercase text-gray-500">Date</p>
                  <Input
                    value={formData.signatureDate}
                    placeholder="e.g. 11-Nov-2025"
                    onChange={event =>
                      setFormData(prev => ({ ...prev, signatureDate: event.target.value }))
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ---- Footer instruction ----------------------------------------- */}
          <div className="border border-gray-400 border-t-0 px-2 py-2">
            <p className="text-[11px] italic leading-relaxed text-gray-800">{FOOTER_INSTRUCTION}</p>
          </div>

          {/* ---- Page number (AMENDED v19, D10) ------------------------------ */}
          <div className="border border-gray-400 border-t-0 px-2 py-1 text-right">
            <p className="text-[10px] text-gray-600">Page 1</p>
          </div>

        </CardContent>
      </Card>

      <FormWorkflowFooter
        formSubmissionId={formSubmissionId}
        approvalStatus={approvalStatus}
        ataRecordId={selectedATARecord?.id || ''}
        formNodeType="inspector_proficiency"
        canEdit={canEdit}
        canSubmit={canSubmit}
        saving={saving}
        onSubmit={() => void handleSubmitForApproval()}
        onStatusChange={() => void loadFromBackend()}
      />
    </div>
  )
}
