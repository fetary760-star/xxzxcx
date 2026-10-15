/**
 * =====================================================================================
 * FORM ENG 751 — ALTERNATIVE TOOLING EQUIVALENCE STATEMENT (two-sheet hard copy)
 * Copy to: CMT.Frontend/src/components/self-evaluation/forms/AlternateToolsEquivalencyForm.tsx
 *          (REPLACES the whole v26 file)
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The v26 file rendered a generic web form ("Original Tool / Alternate Tool" label grids)
 * and THREE invented signature lines ("Prepared By / Approved By / Approved By") copied
 * from the TNA chain. The reference hard copies prove the document is different:
 *
 *   Sheet 1 ("alernartool1.pdf") — ALTERNATIVE TOOLING COMPARISON DATA
 *     ORM ENG 751 · Revision No.:002 · Date: 09 January 2023
 *     A two-column OEM TOOLING / ALTERNATE TOOLING comparison table whose rows are the
 *     equipment sections, the MFG P/N / SERIAL NO / DESCRIPTION / REFERENCE / REASON
 *     fields, and the signature pair ENGINEER: / TEAM LEADER:.
 *
 *   Sheet 2 ("alettoll2.pdf" + "altertool3.pdf") — ALTERNATIVE TOOLING EQUIVALENCE STATEMENT
 *     The confirmation sheet: CONFIRMED OVEN TEST BENCH P/N, ATA, the MFG P/N list,
 *     "OEM CONFIRMED — OVEN TEST BENCH CONTAINS THE FOLLOWING", the PROPOSED EQUIPMENT
 *     DATA sub-table, the equivalence declaration, the test-phase checkbox list, the
 *     CMM reference line and the SAME signature pair.
 *
 * THE SIGNATURE MATRIX
 * --------------------
 * Both sheets print EXACTLY two lines — "ENGINEER:" and "TEAM LEADER:" — never the TNA
 * trio. That is declared once in `signature-matrix.ts` (ENG751_SLOTS) and rendered here
 * through `AutoFormSignatureBlock`, pinned by slotIndex, on BOTH sheets, because the
 * paper signs both.
 *
 * LEGACY DATA
 * -----------
 * Pre-v29 submissions stored `certifiedBy` / `certifiedDate` (the old "Certified By"
 * pair) and the two manager/TL approval fields. They are kept in the model and the
 * "ENGINEER:" draft line falls back to `certifiedBy`, so no existing record loses data.
 *
 * GAP §9 — VERIFY ITEMS (low-res scans, transcribed, kept editable)
 * ------------------------------------------------------------------
 * - The OEM vs ALTERNATE bullet bodies of the Sheet-1 comparison rows could not be
 *   attributed to a column with certainty in the interleaved scan; the section TITLES
 *   are verbatim, the bodies ship blank to be transcribed from the paper sheet.
 * - The long MFG P/N list of Sheet 2 is transcribed as printed; verify digit groups.
 * - "MILLIAMPERE" is reproduced verbatim (the paper's cut-off of MILLIAMPERES).
 */
'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useFormData } from '@/lib/self-evaluation/useFormData'
import { useATAAutoFill, useATAAutoFillSync } from '@/lib/self-evaluation/useATAAutoFill'
import { FormToolbar, FormWorkflowFooter } from './FormDocumentChrome'
import AutoFormSignatureBlock, { useSignatureReloadSignal } from './AutoFormSignatureBlock'

// ===========================================================================
// Controlled document constants — verbatim from the ENG 751 hard copies
// ===========================================================================

const FORM_TYPE = 'alternate_tools_equivalency' as const

const DOC_FORM_NO = 'ORM ENG 751'
const DOC_REVISION = 'Revision No.:002'
const DOC_DATE = 'Date: 09 January 2023'

const SHEET1_TITLE = 'ALTERNATIVE TOOLING COMPARISON DATA'
const SHEET2_TITLE = 'ALTERNATIVE TOOLING EQUIVALENCE STATEMENT'

/** Printed positions inside FORM_SIGNATURE_MATRIX['alternate_tools_equivalency']. */
const SLOT_ENGINEER = 0
const SLOT_TEAM_LEADER = 1

/** The eight equipment sections the comparison table prints, verbatim and in order. */
interface ComparisonRow {
  id: string
  section: string
  oem: string
  alternate: string
}

const DEFAULT_COMPARISON_ROWS: ComparisonRow[] = [
  { id: 'cmp-1', section: 'General Tool Description', oem: '', alternate: '' },
  { id: 'cmp-2', section: 'Power supply', oem: '', alternate: '' },
  { id: 'cmp-3', section: 'Ammeter', oem: '', alternate: '' },
  { id: 'cmp-4', section: 'Voltmeter', oem: '', alternate: '' },
  { id: 'cmp-5', section: 'HIGH VOLTAGE TEST DEVICE', oem: '', alternate: '' },
  { id: 'cmp-6', section: 'INSULATION RESISTANCE TEST DEVICE', oem: '', alternate: '' },
  { id: 'cmp-7', section: 'TEMPERATURE MEASURING DEVICE', oem: '', alternate: '' },
  { id: 'cmp-8', section: 'Water pressure', oem: '', alternate: '' },
]

/** The test phases the checklist prints, verbatim, in paper order. */
const TEST_PHASES = [
  'REMOVAL',
  'DISASSEMBLY',
  'CLEANING',
  'INSPECTION/CHECK',
  'REPAIR',
  'ASSEMBLY',
  'INSTALLATION',
] as const

/** The reference sheet's checklist is ticked on INSPECTION/CHECK. */
const DEFAULT_TEST_PHASES: string[] = ['INSPECTION/CHECK']

/**
 * "OEM CONFIRMED — OVEN TEST BENCH CONTAINS THE FOLLOWING", transcribed from the scan.
 * Each entry is one printed bullet; kept editable.
 */
const DEFAULT_OEM_CONTENTS: string[] = [
  'Power supply 115/400Hz, 3-phase protected by circuit breaker',
  'Ammeter — Analog, 0-30 amp, phase A, B, C',
  'Voltmeter — Analog, 0-300V, phase A, B, C',
  'HIGH VOLTAGE TEST DEVICE — TEST VOLTAGE: 0 - 5000 V AC · ACCURACY: +/- 1% · METERING RANGE: 0 - 100 MILLIAMPERE · REFERENCE: ZODIAC CMM, CHAPTER 25-37-42 · REASON: Test required Voltage is not available in the shop',
  'INSULATION RESISTANCE TEST DEVICE — TEST VOLTAGE: 500 VOLT DC · METERING RANGE: 0 TO 200 MEGOHM · ACCURACY: +/- 2 %',
  'TEMPERATURE MEASURING DEVICE — digital (210-400°C)',
  'Water pressure — Analog (0-10 bar)',
]

/** The PROPOSED EQUIPMENT DATA sub-table: two printed columns, three printed fields. */
interface ProposedTool {
  etPn: string
  mfgPn: string
  technicalData: string
}

const DEFAULT_PROPOSED: Record<'manufactured' | 'equivalent', ProposedTool> = {
  manufactured: { etPn: '', mfgPn: '', technicalData: '' },
  equivalent: {
    etPn: '',
    mfgPn: '',
    technicalData: 'RANGE: 0 TO 200 MILLIOHM\nACCURACY: +/- 0.04 %',
  },
}

const DEFAULT_MFG_PN_LIST =
  '8303-01-0000-01, 8303-04-0000-01, 8303-06-0000-01,-02, 8303-51-0000-01, 8303-54-0000-01, ' +
  '8303-56-0000-01,-02, 8304-51-0000-01,-02, 8307-01-0000-01, 8307-06-0000-01,-02, ' +
  '8307-51-0000-01,-02, 8307-56-0000-01,-02, 8308-01-0000-01, 8308-51-0000-01'

const DEFAULT_EQUIVALENCE_DECLARATION =
  'WE HEREBY CONFIRM THE EQUIVALENCE OF THE TEST EQUIPMENT TO PERFORM ALL REQUIRED TESTS.'

const DEFAULT_CMM_REFERENCE = 'ZODIAC CMM, CHAPTER 25-37-42, REV No.02, DATED APR 15/16'

interface FormData extends Record<string, unknown> {
  /** Sheet 1 — comparison table and its full-width fields. */
  comparisonRows: ComparisonRow[]
  originalToolPN: string
  originalToolDesc: string
  originalManufacturer: string
  alternateToolPN: string
  alternateToolDesc: string
  alternateManufacturer: string
  equivalencyJustification: string

  /** Sheet 2 — identity, contents, proposed data, declaration, checklist, reference. */
  benchPN: string
  ata: string
  mfgPnList: string
  oemContents: string[]
  proposedManufactured: ProposedTool
  proposedEquivalent: ProposedTool
  equivalenceDeclaration: string
  testPhases: string[]
  cmmReference: string

  /** Draft values of the two printed lines until the workflow stamps them. */
  engineerName: string
  engineerDate: string
  teamLeaderName: string
  teamLeaderDate: string

  /** Legacy v26 fields — kept so old submissions lose nothing. */
  certifiedBy: string
  certifiedDate: string
  approvedByManager: string
  approvedByManagerDate: string
  approvedBySpecialTL: string
  approvedBySpecialTLDate: string
}

export default function AlternateToolsEquivalencyForm() {
  const { selectedATARecord } = useSelfEvaluation()
  const auto = useATAAutoFill()

  const defaultData: FormData = {
    comparisonRows: DEFAULT_COMPARISON_ROWS,
    originalToolPN: '',
    originalToolDesc: '',
    originalManufacturer: '',
    alternateToolPN: '',
    alternateToolDesc: '',
    alternateManufacturer: '',
    equivalencyJustification: '',

    benchPN: '210-000-000-02',
    ata: auto.ata || '25-37-42',
    mfgPnList: DEFAULT_MFG_PN_LIST,
    oemContents: DEFAULT_OEM_CONTENTS,
    proposedManufactured: DEFAULT_PROPOSED.manufactured,
    proposedEquivalent: DEFAULT_PROPOSED.equivalent,
    equivalenceDeclaration: DEFAULT_EQUIVALENCE_DECLARATION,
    testPhases: DEFAULT_TEST_PHASES,
    cmmReference: DEFAULT_CMM_REFERENCE,

    engineerName: '',
    engineerDate: '',
    teamLeaderName: '',
    teamLeaderDate: '',

    certifiedBy: '',
    certifiedDate: '',
    approvedByManager: '',
    approvedByManagerDate: '',
    approvedBySpecialTL: '',
    approvedBySpecialTLDate: '',
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
    formNo: 'ENG 751',
    revNo: '002',
  })

  /** One signal, bumped by every status change, re-fetches the executed steps. */
  const [signatureSignal, refreshSignatures] = useSignatureReloadSignal()

  // The ATA Record owns the chapter code of the sheet; the paper value stays as fallback.
  useATAAutoFillSync<FormData>(
    setFormData,
    { ata: auto.ata || '25-37-42' },
    [loading, auto.ataRecordId],
  )

  const handleChange = (field: keyof FormData, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }))

  const handleComparisonChange = (id: string, side: 'oem' | 'alternate', value: string) =>
    setFormData(prev => ({
      ...prev,
      comparisonRows: prev.comparisonRows.map(row =>
        row.id === id ? { ...row, [side]: value } : row,
      ),
    }))

  const handleProposedChange = (
    tool: 'proposedManufactured' | 'proposedEquivalent',
    field: keyof ProposedTool,
    value: string,
  ) =>
    setFormData(prev => ({ ...prev, [tool]: { ...prev[tool], [field]: value } }))

  const handleContentChange = (index: number, value: string) =>
    setFormData(prev => ({
      ...prev,
      oemContents: prev.oemContents.map((line, i) => (i === index ? value : line)),
    }))

  const togglePhase = (phase: string) =>
    setFormData(prev => ({
      ...prev,
      testPhases: prev.testPhases.includes(phase)
        ? prev.testPhases.filter(item => item !== phase)
        : [...prev.testPhases, phase],
    }))

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    )
  }

  /** The two printed lines of ENG 751, rendered identically on both sheets. */
  const signatureRows = [
    {
      slotIndex: SLOT_ENGINEER,
      label: 'ENGINEER:',
      role: 'Engineer',
      name: formData.engineerName || formData.certifiedBy,
      date: formData.engineerDate || formData.certifiedDate,
      onNameChange: (value: string) => handleChange('engineerName', value),
      onDateChange: (value: string) => handleChange('engineerDate', value),
    },
    {
      slotIndex: SLOT_TEAM_LEADER,
      label: 'TEAM LEADER:',
      role: 'Team Leader',
      name: formData.teamLeaderName || formData.approvedBySpecialTL,
      date: formData.teamLeaderDate || formData.approvedBySpecialTLDate,
      onNameChange: (value: string) => handleChange('teamLeaderName', value),
      onDateChange: (value: string) => handleChange('teamLeaderDate', value),
    },
  ]

  const sheetField = (label: string, field: keyof FormData, placeholder = '') => (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-bold uppercase text-gray-900">{label}</span>
      {isEditing ? (
        <Input
          value={String(formData[field] ?? '')}
          onChange={event => handleChange(field, event.target.value)}
          placeholder={placeholder}
          className="h-7 max-w-xs flex-1 text-[11px]"
          aria-label={label}
        />
      ) : (
        <span className="flex-1 border-b border-gray-500 text-[11px] text-gray-900">
          {String(formData[field] ?? '') || ' '}
        </span>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <FormToolbar
        title="FORM ENG 751 — ALTERNATIVE TOOLING EQUIVALENCE STATEMENT"
        meta={`${DOC_FORM_NO} · ${DOC_REVISION} · ${DOC_DATE}`}
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

      {/* ======================================================================
          SHEET 1 — ALTERNATIVE TOOLING COMPARISON DATA
          ==================================================================== */}
      <Card>
        <CardContent className="p-3">
          <div className="border border-gray-400 p-4 text-gray-900">
            {/* Document header strip, verbatim */}
            <div className="flex items-start justify-between text-[10px] font-semibold uppercase">
              <span>{DOC_FORM_NO}</span>
              <span className="text-right">
                {DOC_REVISION}
                <br />
                {DOC_DATE}
              </span>
            </div>
            <p className="mx-auto mt-2 w-fit border border-gray-500 px-4 py-1 text-center text-[13px] font-bold uppercase tracking-wide">
              {SHEET1_TITLE}
            </p>

            {/* The two-column comparison table */}
            <table className="mt-3 w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="w-1/2 border border-gray-500 bg-gray-100 px-2 py-1 text-center font-bold uppercase">
                    OEM TOOLING
                  </th>
                  <th className="w-1/2 border border-gray-500 bg-gray-100 px-2 py-1 text-center font-bold uppercase">
                    ALTERNATE TOOLING
                  </th>
                </tr>
              </thead>
              <tbody>
                {formData.comparisonRows.map(row => (
                  <tr key={row.id}>
                    <td className="border border-gray-500 px-2 py-1 align-top">
                      <p className="font-bold underline">{row.section}</p>
                      {isEditing ? (
                        <Textarea
                          value={row.oem}
                          onChange={event =>
                            handleComparisonChange(row.id, 'oem', event.target.value)
                          }
                          rows={2}
                          className="mt-1 text-[11px]"
                          aria-label={`OEM tooling — ${row.section}`}
                        />
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap">{row.oem || ' '}</p>
                      )}
                    </td>
                    <td className="border border-gray-500 px-2 py-1 align-top">
                      <p className="font-bold underline">{row.section}</p>
                      {isEditing ? (
                        <Textarea
                          value={row.alternate}
                          onChange={event =>
                            handleComparisonChange(row.id, 'alternate', event.target.value)
                          }
                          rows={2}
                          className="mt-1 text-[11px]"
                          aria-label={`Alternate tooling — ${row.section}`}
                        />
                      ) : (
                        <p className="mt-1 whitespace-pre-wrap">{row.alternate || ' '}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Full-width fields below the table, verbatim labels */}
            <div className="mt-3 space-y-2">
              {sheetField('MFG P/N:', 'originalToolPN')}
              {sheetField('Serial No:', 'alternateToolPN')}
              {sheetField('Description:', 'originalToolDesc')}
              {sheetField('Reference:', 'originalManufacturer')}
              <div>
                <span className="text-[11px] font-bold uppercase text-gray-900">
                  Reason for using alternate tooling:
                </span>
                {isEditing ? (
                  <Textarea
                    value={formData.equivalencyJustification}
                    onChange={event =>
                      handleChange('equivalencyJustification', event.target.value)
                    }
                    rows={3}
                    className="mt-1 text-[11px]"
                    aria-label="Reason for using alternate tooling"
                  />
                ) : (
                  <p className="mt-1 whitespace-pre-wrap border-b border-gray-500 text-[11px]">
                    {formData.equivalencyJustification || ' '}
                  </p>
                )}
              </div>
            </div>

            {/* The printed signature pair of sheet 1 */}
            <AutoFormSignatureBlock
              editable={isEditing}
              formType={FORM_TYPE}
              formSubmissionId={formSubmissionId}
              folderId={selectedATARecord?.evaluationFolderId}
              reloadSignal={signatureSignal}
              rows={signatureRows}
            />
          </div>
        </CardContent>
      </Card>

      {/* ======================================================================
          SHEET 2 — ALTERNATIVE TOOLING EQUIVALENCE STATEMENT
          ==================================================================== */}
      <Card>
        <CardContent className="p-3">
          <div className="border border-gray-400 p-4 text-gray-900">
            <div className="flex items-start justify-between text-[10px] font-semibold uppercase">
              <span>Ethiopian Airlines — Maintenance, Repairs & Overhaul</span>
              <span className="text-right">
                {DOC_FORM_NO} · {DOC_REVISION}
              </span>
            </div>
            <p className="mx-auto mt-2 w-fit border border-gray-500 px-4 py-1 text-center text-[13px] font-bold uppercase tracking-wide">
              {SHEET2_TITLE}
            </p>

            <div className="mt-3 space-y-2">
              {sheetField('Confirmed Oven Test Bench P/N:', 'benchPN')}
              {sheetField('ATA:', 'ata')}
              <div>
                <span className="text-[11px] font-bold uppercase text-gray-900">MFG P/N:</span>
                {isEditing ? (
                  <Textarea
                    value={formData.mfgPnList}
                    onChange={event => handleChange('mfgPnList', event.target.value)}
                    rows={3}
                    className="mt-1 text-[11px]"
                    aria-label="Manufacturer part numbers"
                  />
                ) : (
                  <p className="mt-1 whitespace-pre-wrap border-b border-gray-500 text-[11px]">
                    {formData.mfgPnList || ' '}
                  </p>
                )}
              </div>
            </div>

            {/* OEM CONFIRMED contents */}
            <p className="mt-4 text-[11px] font-bold uppercase underline">
              OEM Confirmed — Oven Test Bench contains the following:
            </p>
            <ul className="mt-1 space-y-1">
              {formData.oemContents.map((line, index) => (
                <li key={index} className="flex gap-2 text-[11px]">
                  <span aria-hidden>➤</span>
                  {isEditing ? (
                    <Textarea
                      value={line}
                      onChange={event => handleContentChange(index, event.target.value)}
                      rows={2}
                      className="flex-1 text-[11px]"
                      aria-label={`OEM confirmed item ${index + 1}`}
                    />
                  ) : (
                    <span className="flex-1 whitespace-pre-wrap">{line}</span>
                  )}
                </li>
              ))}
            </ul>

            {/* PROPOSED EQUIPMENT DATA */}
            <p className="mt-4 text-center text-[11px] font-bold uppercase underline">
              Proposed Equipment Data
            </p>
            <table className="mt-1 w-full border-collapse text-[11px]">
              <thead>
                <tr>
                  <th className="w-1/2 border border-gray-500 bg-gray-100 px-2 py-1 text-center font-bold uppercase">
                    Proposed Manufactured Tool
                  </th>
                  <th className="w-1/2 border border-gray-500 bg-gray-100 px-2 py-1 text-center font-bold uppercase">
                    Proposed Equivalent Tool
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ['ET-P/N:', 'etPn'],
                    ['MFG P/N:', 'mfgPn'],
                    ['Technical Data:', 'technicalData'],
                  ] as const
                ).map(([label, key]) => (
                  <tr key={key}>
                    <td className="border border-gray-500 px-2 py-1 align-top">
                      <span className="font-bold">{label}</span>
                      {isEditing ? (
                        <Textarea
                          value={formData.proposedManufactured[key]}
                          onChange={event =>
                            handleProposedChange('proposedManufactured', key, event.target.value)
                          }
                          rows={key === 'technicalData' ? 2 : 1}
                          className="mt-1 text-[11px]"
                          aria-label={`Proposed manufactured tool ${label}`}
                        />
                      ) : (
                        <p className="mt-0.5 whitespace-pre-wrap">
                          {formData.proposedManufactured[key] || ' '}
                        </p>
                      )}
                    </td>
                    <td className="border border-gray-500 px-2 py-1 align-top">
                      <span className="font-bold">{label}</span>
                      {isEditing ? (
                        <Textarea
                          value={formData.proposedEquivalent[key]}
                          onChange={event =>
                            handleProposedChange('proposedEquivalent', key, event.target.value)
                          }
                          rows={key === 'technicalData' ? 2 : 1}
                          className="mt-1 text-[11px]"
                          aria-label={`Proposed equivalent tool ${label}`}
                        />
                      ) : (
                        <p className="mt-0.5 whitespace-pre-wrap">
                          {formData.proposedEquivalent[key] || ' '}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Equivalence declaration */}
            <p className="mt-4 text-[11px] font-semibold uppercase">
              {isEditing ? (
                <Textarea
                  value={formData.equivalenceDeclaration}
                  onChange={event => handleChange('equivalenceDeclaration', event.target.value)}
                  rows={2}
                  className="text-[11px]"
                  aria-label="Equivalence declaration"
                />
              ) : (
                formData.equivalenceDeclaration
              )}
            </p>

            {/* Test-phase checklist, verbatim paper order */}
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
              {TEST_PHASES.map(phase => {
                const checked = formData.testPhases.includes(phase)
                return (
                  <label
                    key={phase}
                    className={`flex items-center gap-2 text-[11px] ${
                      isEditing ? 'cursor-pointer' : 'cursor-default'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!isEditing}
                      onChange={() => togglePhase(phase)}
                      className="h-3.5 w-3.5 accent-gray-900"
                      aria-label={`Test phase ${phase}`}
                    />
                    <span className={checked ? 'font-semibold' : ''}>{phase}</span>
                  </label>
                )
              })}
            </div>

            {/* CMM reference line */}
            <div className="mt-3">
              <span className="text-[11px] font-bold uppercase text-gray-900">Reference:</span>{' '}
              {isEditing ? (
                <Input
                  value={formData.cmmReference}
                  onChange={event => handleChange('cmmReference', event.target.value)}
                  className="mt-1 h-7 text-[11px]"
                  aria-label="CMM reference"
                />
              ) : (
                <span className="text-[11px]">{formData.cmmReference}</span>
              )}
            </div>

            {/* The printed signature pair of sheet 2 */}
            <AutoFormSignatureBlock
              editable={isEditing}
              formType={FORM_TYPE}
              formSubmissionId={formSubmissionId}
              folderId={selectedATARecord?.evaluationFolderId}
              reloadSignal={signatureSignal}
              includeWorkflowSteps={false}
              rows={signatureRows}
            />
          </div>

          <p className="mt-1 px-1 text-[10px] text-gray-500">
            The names, dates and signature specimens on the "ENGINEER:" and "TEAM LEADER:"
            lines are captured automatically from the approval workflow. Comparison-table
            bodies and the MFG P/N list were transcribed from a low-resolution scan —
            verify them against the paper sheet (gap §9).
          </p>
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
        onStatusChange={() => {
          void loadFromBackend()
          refreshSignatures()
        }}
      />
    </div>
  )
}
