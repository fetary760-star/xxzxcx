/**
 * TECHNICIAN / MECHANIC COMPETENCE ASSESSEMENT FORM — Form MNT 3.14-020, Rev. 5
 * (AMENDED v19 — gap-analysis corrections self-evaluation-form-gap-analysis.md)
 *
 * WHAT THIS AMENDMENT FIXES
 * -----------------------------------------------------------------------------
 * - P2 §E8: the paper prints FIVE INDEPENDENT tick boxes for the scope of
 *   individual authorization (Qualified Mechanic I/II, Qualified Technician
 *   I/II/III). The previous version forced a SINGLE selection (radio-like),
 *   which cannot represent a technician who holds more than one level.
 *   `scope: ScopeValue` is therefore replaced by `scopes: ScopeValue[]` with
 *   toggle behaviour. Default remains ['qt3'] (the ticked box on the scan).
 * - P3 §S-4: the ATA identity strip and attached authorization certificate are
 *   excluded because they are not part of this controlled paper form.
 *
 * THE ORIGINAL HARD COPY (scan: "tech compltence assment")
 * --------------------------------------------------------
 *   TECHNICIAN/ MECHANIC COMPETENCE ASSESSEMENT FORM
 *   1. EMPLOYEE'S NAME, DEPARTMENT, REG. NO. & POSITION
 *        Name of assessed employee: FANTAHUN DAMESSA   Registration No.: 27070
 *        Department: 577   Position: A/C AVIONICS COMPONENT TECHNICIAN III
 *   2. PURPOSE OF THE REVIEW      Initial [ ] Extension [ ] Renewal [x]
 *        Intended/held scope of individual authorization | Aircraft Type/
 *        engine Model/ Component P/N
 *        Qualified Mechanic I / II, Qualified Technician I / II / III [x]
 *        "All components on authorization certificate attached herewith."
 *   3. ASSESSMENT RESULT
 *        "The under signed, I.A.W competence assessment procedure consider that
 *         the above mentioned person"
 *        [x] Is competent. If the assessment result is <100, please indicate
 *            gaps identified and action taken on section 4.
 *        [ ] Needs to improve. Please fill in section 4 the remarks and
 *            improvement actions.
 *        Name: WAKUMA NEGASSA  Position: Manager Avionics Component Shops
 *        Date: 03-NOV-24
 *   4. REMARKS AND IMPROVEMENT ACTIONS  (open box)
 *        Signature of assessed employee: ____   Date: 03-NOV-24
 *   Footer: COMPETENCE ASSESSMENT SUMMARY REPORT · Form MNT 3.14-020, Rev. 5
 *           Date: 25 Sep 2023 · Name: FANTAHUN DAMESSA  ID: 27070
 */
'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
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
// Controlled document constants — verbatim from the MNT 3.14-020 hard copy
// ===========================================================================

const FORM_NO = 'MNT 3.14-020'
const FORM_REV_NO = '5'
const FORM_REV_DATE = '25 Sep 2023'
const FORM_TITLE = 'TECHNICIAN/ MECHANIC COMPETENCE ASSESSEMENT FORM'

const SECTION_1 = "1. EMPLOYEE'S NAME, DEPARTMENT, REG. NO. & POSITION"
const SECTION_2 = '2. PURPOSE OF THE REVIEW'
const SECTION_3 = '3. ASSESSMENT RESULT'
const SECTION_4 = '4. REMARKS AND IMPROVEMENT ACTIONS'

const ASSESSMENT_STATEMENT =
  'The under signed, I.A.W competence assessment procedure consider that the above mentioned person'

const RESULT_COMPETENT =
  'Is competent. If the assessment result is <100, please indicate gaps identified and action taken on section 4.'
const RESULT_NEEDS_IMPROVEMENT =
  'Needs to improve. Please fill in section 4 the remarks and improvement actions.'

const FOOTER_TITLE = 'COMPETENCE ASSESSMENT SUMMARY REPORT'

const PURPOSE_OPTIONS = [
  { value: 'initial', label: 'Initial' },
  { value: 'extension', label: 'Extension' },
  { value: 'renewal', label: 'Renewal' },
] as const

const SCOPE_OPTIONS = [
  { value: 'qm1', label: 'Qualified Mechanic I' },
  { value: 'qm2', label: 'Qualified Mechanic II' },
  { value: 'qt1', label: 'Qualified Technician I' },
  { value: 'qt2', label: 'Qualified Technician II' },
  { value: 'qt3', label: 'Qualified Technician III' },
] as const

type PurposeValue = (typeof PURPOSE_OPTIONS)[number]['value']
type ScopeValue = (typeof SCOPE_OPTIONS)[number]['value']
type ResultValue = 'competent' | 'needs_improvement'

/** Values printed on the reference hard copy — defaults only, always editable. */
const PRINTED_DEFAULTS = {
  employeeName: 'FANTAHUN DAMESSA',
  registrationNo: '27070',
  department: '577',
  position: 'A/C AVIONICS COMPONENT TECHNICIAN III',
  scopeAircraft: 'All components on authorization certificate attached herewith.',
  assessorName: 'WAKUMA NEGASSA',
  assessorPosition: 'Manager Avionics Component Shops',
  assessmentDate: '03-NOV-24',
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

  /** Section 1. */
  employeeName: string
  registrationNo: string
  department: string
  position: string
  assignedEmployeeId: string
  assignedEmployeeName: string
  assignedEmployeeRole: string

  /** Section 2. */
  purpose: PurposeValue
  /**
   * AMENDED v19 (E8): the paper prints independent tick boxes — a technician
   * may hold several authorization levels at once, so this is an ARRAY.
   */
  scopes: ScopeValue[]
  scopeAircraft: string

  /** Section 3. */
  result: ResultValue
  assessorName: string
  assessorPosition: string
  assessmentDate: string

  /** Section 4. */
  remarks: string
  employeeSignatureDate: string

}

export default function CompetenceAssessmentForm() {
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

    employeeName: PRINTED_DEFAULTS.employeeName,
    registrationNo: PRINTED_DEFAULTS.registrationNo,
    department: PRINTED_DEFAULTS.department,
    position: PRINTED_DEFAULTS.position,
    assignedEmployeeId: '',
    assignedEmployeeName: '',
    assignedEmployeeRole: '',

    purpose: 'renewal',
    scopes: ['qt3'],
    scopeAircraft: PRINTED_DEFAULTS.scopeAircraft,

    result: 'competent',
    assessorName: PRINTED_DEFAULTS.assessorName,
    assessorPosition: PRINTED_DEFAULTS.assessorPosition,
    assessmentDate: PRINTED_DEFAULTS.assessmentDate,

    remarks: '',
    employeeSignatureDate: PRINTED_DEFAULTS.assessmentDate,

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
    handleSaveAndSubmit,
    handleSubmitForApproval,
    userRole,
    loadFromBackend,
  } = useFormData<FormData>(defaultData, {
    formType: 'competency_assessment',
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

  /** AMENDED v19 (E8): toggle one of the independent scope tick boxes. */
  const toggleScope = (value: ScopeValue) => {
    setFormData(prev => {
      const current: ScopeValue[] = prev.scopes?.length ? prev.scopes : ['qt3']
      return {
        ...prev,
        scopes: current.includes(value)
          ? current.filter(item => item !== value)
          : [...current, value],
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

  const textField = (
    key: 'employeeName' | 'registrationNo' | 'department' | 'position',
    label: string,
  ) => (
    <div className="px-2 py-1.5 border-r border-b border-gray-300 last:border-r-0">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">{label}</p>
      {isEditing ? (
        <Input
          value={formData[key]}
          onChange={event => setFormData(prev => ({ ...prev, [key]: event.target.value }))}
          className="h-7 text-[11px]"
        />
      ) : (
        <p className="text-[11px] font-semibold uppercase text-gray-900 border-b border-dotted border-gray-400 min-h-[18px]">
          {formData[key] || ''}
        </p>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <FormToolbar
        title="COMPETENCY ASSESSMENT (FOR TECHNICIAN)"
        meta={`Form ${FORM_NO} · Rev. ${FORM_REV_NO} · Date ${FORM_REV_DATE}`}
        approvalStatus={approvalStatus}
        canEdit={canEdit}
        isEditing={isEditing}
        saving={saving}
        onEdit={() => setIsEditing(true)}
        onCancel={() => {
          setIsEditing(false)
          void loadFromBackend()
        }}
        onSave={() => void (userRole === 'team_leader' ? handleSaveAndSubmit() : handleSave())}
      />

      <TrainingEmployeeAssignment
        shopId={selectedATARecord?.shopId}
        ataRecordId={selectedATARecord?.id}
        formType="competency_assessment"
        role="Technician"
        employeeId={formData.assignedEmployeeId}
        employeeName={formData.assignedEmployeeName}
        employeeRole={formData.assignedEmployeeRole}
        canEdit={canEdit && isEditing}
        onChange={employee => setFormData(prev => ({
          ...prev,
          assignedEmployeeId: employee.id,
          assignedEmployeeName: employee.name,
          assignedEmployeeRole: employee.role,
          employeeName: employee.name,
          registrationNo: employee.id,
        }))}
        onIncluded={() => void loadFromBackend()}
      />

      <Card>
        <CardContent className="p-3 space-y-0">
          <DocumentHeader
            organisation="ETHIOPIAN MRO"
            title={FORM_TITLE}
            meta={[
              { label: 'Form', value: FORM_NO },
              { label: 'Rev.', value: FORM_REV_NO },
              { label: 'Date:', value: FORM_REV_DATE },
            ]}
          />

          {/* ---- Section 1 --------------------------------------------------- */}
          <div className="border border-gray-400 border-t-0 bg-gray-100 px-2 py-1">
            <p className="text-[11px] font-bold uppercase text-gray-900">{SECTION_1}</p>
          </div>
          <div className="border border-gray-400 border-t-0">
            <div className="grid grid-cols-1 sm:grid-cols-2">
              {textField('employeeName', 'Name of assessed employee')}
              {textField('registrationNo', 'Registration No.')}
              {textField('department', 'Department')}
              {textField('position', 'Position')}
            </div>
          </div>

          {/* ---- Section 2 --------------------------------------------------- */}
          <div className="border border-gray-400 border-t-0 bg-gray-100 px-2 py-1">
            <p className="text-[11px] font-bold uppercase text-gray-900">{SECTION_2}</p>
          </div>
          <div className="border border-gray-400 border-t-0 px-2 py-2">
            <div className="flex flex-wrap items-center gap-6">
              {PURPOSE_OPTIONS.map(option => (
                <div key={option.value} className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-gray-900">{option.label}</span>
                  <CheckCell
                    mark="x"
                    ariaLabel={option.label}
                    checked={formData.purpose === option.value}
                    disabled={!isEditing}
                    onChange={() => setFormData(prev => ({ ...prev, purpose: option.value }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="border border-gray-400 border-t-0">
            <div className="grid grid-cols-1 md:grid-cols-2">
              <div className="border-b md:border-b-0 md:border-r border-gray-300">
                <p className="bg-gray-50 px-2 py-1 text-[10px] font-semibold text-gray-800 border-b border-gray-300">
                  Intended/held scope of individual authorization
                </p>
                <div className="px-2 py-1.5 space-y-1">
                  {SCOPE_OPTIONS.map(option => (
                    <div key={option.value} className="flex items-center gap-2">
                      <span className="flex-1 text-[11px] text-gray-900">{option.label}</span>
                      {/* AMENDED v19 (E8): independent tick boxes, multi-select. */}
                      <CheckCell
                        mark="x"
                        ariaLabel={option.label}
                        checked={(formData.scopes ?? ['qt3']).includes(option.value)}
                        disabled={!isEditing}
                        onChange={() => toggleScope(option.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <p className="bg-gray-50 px-2 py-1 text-[10px] font-semibold text-gray-800 border-b border-gray-300">
                  Aircraft Type/ engine Model/ Component P/N
                </p>
                <div className="px-2 py-1.5">
                  {isEditing ? (
                    <Input
                      value={formData.scopeAircraft}
                      onChange={event =>
                        setFormData(prev => ({ ...prev, scopeAircraft: event.target.value }))
                      }
                      className="h-8 text-[11px]"
                    />
                  ) : (
                    <p className="text-[11px] leading-relaxed text-gray-900">
                      {formData.scopeAircraft}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* ---- Section 3 --------------------------------------------------- */}
          <div className="border border-gray-400 border-t-0 bg-gray-100 px-2 py-1">
            <p className="text-[11px] font-bold uppercase text-gray-900">{SECTION_3}</p>
          </div>
          <div className="border border-gray-400 border-t-0 px-2 py-2 space-y-2">
            <p className="text-[11px] leading-relaxed text-gray-800">{ASSESSMENT_STATEMENT}</p>

            {
              (
                [
                  { value: 'competent', label: RESULT_COMPETENT },
                  { value: 'needs_improvement', label: RESULT_NEEDS_IMPROVEMENT },
                ] as const
              ).map(option => (
                <div key={option.value} className="flex items-start gap-2">
                  <span className="mt-0.5">
                    <CheckCell
                      mark="x"
                      ariaLabel={option.value}
                      checked={formData.result === option.value}
                      disabled={!isEditing}
                      onChange={() => setFormData(prev => ({ ...prev, result: option.value }))}
                    />
                  </span>
                  <span className="text-[11px] font-semibold leading-relaxed text-gray-900">
                    {option.label}
                  </span>
                </div>
              ))
            }

            <div className="mt-2 grid grid-cols-1 md:grid-cols-4 gap-2">
              <div>
                <p className="text-[9px] uppercase text-gray-500">Name</p>
                {isEditing ? (
                  <Input
                    value={formData.assessorName}
                    onChange={event =>
                      setFormData(prev => ({ ...prev, assessorName: event.target.value }))
                    }
                    className="h-7 text-[11px]"
                  />
                ) : (
                  <p className="text-[11px] font-semibold uppercase text-gray-900 border-b border-dotted border-gray-400 min-h-[18px]">
                    {formData.assessorName || ''}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[9px] uppercase text-gray-500">Position</p>
                {isEditing ? (
                  <Input
                    value={formData.assessorPosition}
                    onChange={event =>
                      setFormData(prev => ({ ...prev, assessorPosition: event.target.value }))
                    }
                    className="h-7 text-[11px]"
                  />
                ) : (
                  <p className="text-[11px] font-semibold text-gray-900 border-b border-dotted border-gray-400 min-h-[18px]">
                    {formData.assessorPosition || ''}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[9px] uppercase text-gray-500">Signature</p>
                <p className="text-[11px] border-b border-dotted border-gray-400 min-h-[18px]" />
              </div>
              <div>
                <p className="text-[9px] uppercase text-gray-500">Date</p>
                {isEditing ? (
                  <Input
                    value={formData.assessmentDate}
                    onChange={event =>
                      setFormData(prev => ({ ...prev, assessmentDate: event.target.value }))
                    }
                    className="h-7 text-[11px]"
                    placeholder="e.g. 03-NOV-24"
                  />
                ) : (
                  <p className="text-[11px] font-semibold text-gray-900 border-b border-dotted border-gray-400 min-h-[18px]">
                    {formData.assessmentDate || ''}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ---- Section 4 --------------------------------------------------- */}
          <div className="border border-gray-400 border-t-0 bg-gray-100 px-2 py-1">
            <p className="text-[11px] font-bold uppercase text-gray-900">{SECTION_4}</p>
          </div>
          <div className="border border-gray-400 border-t-0 px-2 py-2">
            {isEditing ? (
              <textarea
                value={formData.remarks}
                onChange={event => setFormData(prev => ({ ...prev, remarks: event.target.value }))}
                rows={6}
                className="w-full rounded border border-gray-300 px-2 py-1 text-[11px] leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            ) : (
              <p className="min-h-[96px] whitespace-pre-line text-[11px] leading-relaxed text-gray-900">
                {formData.remarks}
              </p>
            )}

            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
              <div className="md:col-span-2">
                <p className="text-[9px] uppercase text-gray-500">
                  Signature of assessed employee
                </p>
                <p className="text-[11px] border-b border-dotted border-gray-400 min-h-[18px]" />
              </div>
              <div>
                <p className="text-[9px] uppercase text-gray-500">Date</p>
                {isEditing ? (
                  <Input
                    value={formData.employeeSignatureDate}
                    onChange={event =>
                      setFormData(prev => ({ ...prev, employeeSignatureDate: event.target.value }))
                    }
                    className="h-7 text-[11px]"
                    placeholder="e.g. 03-NOV-24"
                  />
                ) : (
                  <p className="text-[11px] font-semibold text-gray-900 border-b border-dotted border-gray-400 min-h-[18px]">
                    {formData.employeeSignatureDate || ''}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ---- Printed page footer ---------------------------------------- */}
          <div className="border border-gray-400 border-t-0 px-2 py-1.5">
            <p className="text-[10px] font-bold uppercase text-gray-800">{FOOTER_TITLE}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-4 text-[10px] text-gray-600">
              <span>{`Form ${FORM_NO}, Rev. ${FORM_REV_NO}`}</span>
              <span>{`Date: ${FORM_REV_DATE}`}</span>
              <span>{`Name: ${formData.employeeName}`}</span>
              <span>{`ID: ${formData.registrationNo}`}</span>
            </div>
          </div>

        </CardContent>
      </Card>

      <FormWorkflowFooter
        formSubmissionId={formSubmissionId}
        approvalStatus={approvalStatus}
        ataRecordId={selectedATARecord?.id || ''}
        formNodeType="competency_assessment"
        canEdit={canEdit}
        canSubmit={canSubmit}
        hideSubmitButton
        saving={saving}
        onSubmit={() => void handleSubmitForApproval()}
        onStatusChange={() => void loadFromBackend()}
      />
    </div>
  )
}
