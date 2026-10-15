/**
 * LETTER OF CONFIRMATION — INTEROFFICE CORRESPONDENCE
 * Table of Contents node: confirmation_letter
 * (AMENDED — hard-copy replica of the reference sheet "leeter ofconferm.pdf")
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The `confirmation_letter` node used to render the AMENDMENT REQUEST template
 * (`RequestLetterForm variant="confirmation"`). The reference hard copy proves that
 * the Letter of Confirmation is a DIFFERENT letter: it has NO part number, NO
 * description, NO seven-requirement list. It carries two body paragraphs and TWO
 * printed signature positions — the originator "Mgr ACS:" and the approver
 * "Approved By:" (whose printed name carries the "DIR CMT:" prefix). This
 * component reproduces that sheet verbatim.
 *
 * THE ORIGINAL HARD COPY (verbatim, typos preserved)
 * --------------------------------------------------
 *   1946 · 2026 — 80 years
 *   Ethiopian — የኢትዮጵያ — THE NEW SPIRIT OF AFRICA — STAR ALLIANCE ✦✦
 *   INTEROFFICE CORRESPONDENCE
 *   To:    Mgr.QA and Safety-MRO        From:  Dir CMT
 *                                        Ref #: EAL-CMT/106/2026
 *                                        Date:  Mar 27, 2026
 *   Subject: Confirmation Letter            (underlined)
 *   "I hereby declare that there are appropriately trained, qualified maintenance
 *   personnel, adequate housing, full facilities, current technical data, recommended
 *   tools and equipment, and materials to perform all the maintenance as per the scope
 *   of approval as indicated in the capability list and OPeSepc."
 *   ("OPeSepc" is the paper's typo for OPeSpec — reproduced verbatim.)
 *   "Moreover, the section has identified the applicable RSM/QCM section and
 *   supplemental procedures and will abide by and use them on day-to-day maintenance
 *   activities. The section has also identified applicable maintenance forms in the
 *   supplemental procedures."
 *   Mgr ACS:  Wakuma Negassa        (stamp: Manager Avionics Component Shops)
 *   Approved By:  DIR CMT: Ayele Getu   Director Component Maintenance
 *
 * The two signature lines resolve through CONFIRMATION_LETTER_SLOTS in
 * `signature-matrix.ts`, so the executed workflow stamps the names, dates and specimens
 * onto the printed positions.
 */
'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useFormData } from '@/lib/self-evaluation/useFormData'
import { FormToolbar, FormWorkflowFooter } from './FormDocumentChrome'
import AutoFormSignatureBlock, { useSignatureReloadSignal } from './AutoFormSignatureBlock'

// ===========================================================================
// Controlled document constants — verbatim from the reference hard copy
// ===========================================================================

const FORM_TITLE = 'LETTER OF CONFIRMATION'
const DOCUMENT_TYPE = 'INTEROFFICE CORRESPONDENCE'
const DOCUMENT_REFERENCE = 'EAL-CMT/106/2026'
const DOCUMENT_DATE = 'Mar 27, 2026'

/** Printed routing of the letter, verbatim. */
const DEFAULT_TO = 'Mgr. QA and Safety-MRO'
const DEFAULT_FROM = 'Dir CMT'

const SUBJECT_LINE = 'Confirmation Letter'

/** Body paragraph 1 — "OPeSepc" is the paper's typo, preserved verbatim. */
const BODY_PARAGRAPH_1 =
  'I hereby declare that there are appropriately trained, qualified maintenance personnel, adequate housing, full facilities, current technical data, recommended tools and equipment, and materials to perform all the maintenance as per the scope of approval as indicated in the capability list and OPeSepc.'

/** Body paragraph 2 — verbatim. */
const BODY_PARAGRAPH_2 =
  'Moreover, the section has identified the applicable RSM/QCM section and supplemental procedures and will abide by and use them on day-to-day maintenance activities. The section has also identified applicable maintenance forms in the supplemental procedures.'

/** Printed positions inside CONFIRMATION_LETTER_SLOTS (signature-matrix.ts). */
const SLOT_ORIGINATOR_MGR_ACS = 0
const SLOT_APPROVER_DIR_CMT = 1

/** The names printed on the reference letter, verbatim. "DIR CMT:" is part of the
 *  printed approver line: "Approved By:  DIR CMT: Ayele Getu". */
const DEFAULT_ORIGINATOR_NAME = 'Wakuma Negassa'
const DEFAULT_APPROVER_NAME = 'DIR CMT: Ayele Getu'

interface FormData extends Record<string, unknown> {
  /** Printed letterhead identifiers. */
  refNo: string
  date: string
  to: string
  from: string
  subject: string
  /** Draft values of the two printed signature positions until the workflow stamps them. */
  originatorName: string
  originatorDate: string
  approverName: string
  approverDate: string
}

export default function ConfirmationLetterForm() {
  const { selectedATARecord } = useSelfEvaluation()

  const defaultData: FormData = {
    refNo: DOCUMENT_REFERENCE,
    date: DOCUMENT_DATE,
    to: DEFAULT_TO,
    from: DEFAULT_FROM,
    subject: SUBJECT_LINE,
    originatorName: DEFAULT_ORIGINATOR_NAME,
    originatorDate: '',
    approverName: DEFAULT_APPROVER_NAME,
    approverDate: '',
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
    formType: 'confirmation_letter',
    formNo: 'MNT-CFL',
    revNo: '01',
    normalizeData: data => ({
      ...data,
      refNo: DOCUMENT_REFERENCE,
      date: DOCUMENT_DATE,
      to: DEFAULT_TO,
      from: DEFAULT_FROM,
      subject: SUBJECT_LINE,
      originatorName: DEFAULT_ORIGINATOR_NAME,
      approverName: DEFAULT_APPROVER_NAME,
    }),
  })

  const [signatureSignal, refreshSignatures] = useSignatureReloadSignal()

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const handleChange = (field: keyof FormData, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }))

  return (
    <div className="space-y-4">
      <FormToolbar
        title={FORM_TITLE}
        meta={`Ref. ${formData.refNo || '—'} · ${formData.date || '—'}`}
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
        <CardContent className="p-3">
          {/* ---- The letter sheet, printed inside one bordered page ---- */}
          <div className="border border-gray-400 p-4 text-[12px] leading-relaxed text-gray-900">
            {/* Letterhead — the Ethiopian Airlines mark of the original: the 80-year
                anniversary logo text and the wordmark/tagline, printed verbatim. */}
            <div className="space-y-0.5 text-center">
              <p className="text-[10px] font-semibold tracking-wide text-gray-900">
                1946 · 2026 — 80 years
              </p>
              <p className="text-[10px] font-semibold tracking-wide text-gray-900">
                Ethiopian — የኢትዮጵያ — THE NEW SPIRIT OF AFRICA — STAR ALLIANCE ✦✦
              </p>
            </div>
            <p className="mt-2 text-center text-[13px] font-bold uppercase tracking-wide text-gray-900">
              {DOCUMENT_TYPE}
            </p>
            <div className="mx-auto mt-1 mb-4 h-px w-full bg-gray-400" />

            {/* ---- To / From / Ref / Date ---- */}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
              <div className="space-y-0.5">
                <div className="flex gap-2">
                  <span className="w-14 flex-shrink-0 font-semibold">To:</span>
                  {isEditing ? (
                    <Input
                      value={formData.to}
                      onChange={event => handleChange('to', event.target.value)}
                      className="h-7 w-64 text-xs"
                      aria-label="Letter addressee"
                    />
                  ) : (
                    <span>{formData.to}</span>
                  )}
                </div>
              </div>
              <div className="sm:w-80 space-y-0.5">
                <div className="flex gap-2">
                  <span className="w-14 flex-shrink-0 font-semibold">From:</span>
                  <span>{formData.from}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-14 flex-shrink-0 font-semibold">Ref #:</span>
                  <span className="font-semibold">{formData.refNo || '—'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="w-14 flex-shrink-0 font-semibold">Date:</span>
                  <span className="font-semibold">{formData.date || '—'}</span>
                </div>
              </div>
            </div>

            {/* ---- Subject (underlined on the paper) ---- */}
            <p className="mt-4 font-bold">
              Subject:{' '}
              <span className="underline">{formData.subject}</span>
            </p>

            {/* ---- Body paragraphs, verbatim ---- */}
            <p className="mt-4 text-justify">{BODY_PARAGRAPH_1}</p>
            <p className="mt-3 text-justify">{BODY_PARAGRAPH_2}</p>
            {/* ---- The two printed signature positions of the letter ---- */}
            <AutoFormSignatureBlock
              editable={isEditing}
              formType="confirmation_letter"
              formSubmissionId={formSubmissionId}
              folderId={selectedATARecord?.evaluationFolderId}
              reloadSignal={signatureSignal}
              includeWorkflowSteps={false}
              showProgress={false}
              rows={[
                {
                  slotIndex: SLOT_ORIGINATOR_MGR_ACS,
                  label: 'Mgr ACS:',
                  role: 'Manager Avionics Component Shops',
                  name: formData.originatorName,
                  date: formData.originatorDate,
                  onNameChange: value => handleChange('originatorName', value),
                  onDateChange: value => handleChange('originatorDate', value),
                },
                {
                  slotIndex: SLOT_APPROVER_DIR_CMT,
                  label: 'Approved By:',
                  role: 'Director Component Maintenance',
                  name: formData.approverName,
                  date: formData.approverDate,
                  onNameChange: value => handleChange('approverName', value),
                  onDateChange: value => handleChange('approverDate', value),
                },
              ]}
            />
          </div>
        </CardContent>
      </Card>

      <FormWorkflowFooter
        formSubmissionId={formSubmissionId}
        approvalStatus={approvalStatus}
        ataRecordId={selectedATARecord?.id || ''}
        formNodeType="confirmation_letter"
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
