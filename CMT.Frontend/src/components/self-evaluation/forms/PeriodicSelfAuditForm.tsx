/**
 * =====================================================================================
 * AMENDED v25 — ITEM 14 (3 of 4): PERIODIC CAPABILITY SELF-AUDIT — Form MNT-1325
 * Copy to: CMT.Frontend/src/components/self-evaluation/forms/PeriodicSelfAuditForm.tsx
 *          (REPLACES the whole existing file)
 *
 * NOT CHANGED (the hard copy is reproduced exactly as before)
 * ---------------------------------------------------------
 *   - Form MNT-1325 / Date: 30,- May.- 2016 / Rev. No. 02 / Rev. date: 24-April-2023,
 *   - the identity band (Component Description / MFG P/N / OEM-Vendor / ATA Chapter) and the
 *     manually captured ET-P/N,
 *   - the pre-amble row ("component released within 2 years ...") above section I,
 *   - the four sections with their ORIGINAL numbering and wording
 *     (I: 1 + a..e, 2 + a..h, 3 + a..c, 4 + a,b · II: a..k · III: a..e · IV: 1..3),
 *   - every default mark and comment of the signed copy ("NO LOST TOOLS.",
 *     "NO NOISE DESTRUCTION.", "MNT-918 is mandatory for capablity developed after 24-Apr-23"),
 *   - the declaration text and the two printed signature captions, in this order:
 *         "Self-audited By:"   role line "Team Leader"
 *         "Approved By:"       role line "Manager"
 *
 * CHANGED — THE AUTOMATIC NAME / DATE / SIGNATURE WIRING, marked (1)..(4)
 * ---------------------------------------------------------------------
 *   (1) `useFormWorkflowInstance({ formSubmissionId, folderId })` resolves the executed
 *       steps of THIS form. Without it `row.signature` stayed undefined and the block could
 *       only ever print what somebody had TYPED — the manual process being automated here.
 *   (2) `<SignatureBlock>` receives `formType` + `instance`.
 *   (3) both rows carry `slotIndex`, their printed position inside
 *       FORM_SIGNATURE_MATRIX['periodic_self_audit']:
 *           slotIndex 0 -> "Self-audited By:"  (PreparedBy,  Shop Team Leader)
 *           slotIndex 1 -> "Approved By:"      (ApprovedBy,  Manager / Shop Manager)
 *       This also stops a pending HR-Manager style step from ever landing on the Manager
 *       line, because matching is now set membership on the pinned expectedRoles instead of
 *       a caption substring.
 *   (4) `onStatusChange` reloads the form data AND the instance, so the audit approval
 *       repaints the signature immediately.
 *
 * WHY `includeWorkflowSteps` IS LEFT AT ITS DEFAULT (true) HERE
 * -----------------------------------------------------------
 * Unlike MNT-918/918A, this form renders ONE band that declares EVERY line of its matrix
 * (2 slots, 2 rows). Nothing can be appended twice, and if the folder's step-by-step check
 * ever routes an extra executed step through MNT-1325, it will be RECORDED underneath in the
 * same paper geometry instead of disappearing.
 *
 * A REACT CORRECTNESS FIX THAT CAME WITH THIS PASS
 * ----------------------------------------------
 * The checklist body mapped the sections to a bare `<>...</>` fragment carrying no key while
 * the `key` sat on the inner `<tr>`. React therefore warned on every render and could reuse
 * the wrong row when a section list changed. The fragment is now `<Fragment key={...}>`,
 * which is required for correctness and changes nothing visually.
 * =====================================================================================
 */
'use client'

import { Fragment } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useFormData } from '@/lib/self-evaluation/useFormData'
import { useEtPartNumber } from '@/lib/maintainx/useEtPartNumber'
import {
  APPROVER_TITLES,
  useATAAutoFill,
  useATAAutoFillSync,
} from '@/lib/self-evaluation/useATAAutoFill'
import type { FormNodeType } from '@/lib/self-evaluation/types'
// (1) THE MISSING WIRING LINK — resolves the FormWorkflowInstance of this form.
import { useFormWorkflowInstance } from '@/lib/workflow/useFormWorkflowInstance'
import { useFormEditAuthority } from '@/lib/workflow/useFormEditAuthority'
import {
  CheckCell,
  DocumentFieldGrid,
  DocumentHeader,
  FormToolbar,
  FormWorkflowFooter,
  SignatureBlock,
} from './FormDocumentChrome'

// ===========================================================================
// Controlled document constants — verbatim from the MNT-1325 hard copy
// ===========================================================================

/** The PERSISTED FormSubmission.FormType and the matrix key. Never rename. */
const FORM_TYPE: FormNodeType = 'periodic_self_audit'

const FORM_NO = 'MNT-1325'
const FORM_TITLE = 'COMPONENT MAINTENANCE PERIODIC  CAPABILITY SELF- AUDIT'
const FORM_RELEASE_DATE = '30,- May.- 2016'
const FORM_REV_NO = '02'
const FORM_REV_DATE = '24-April-2023'

/** Printed positions inside FORM_SIGNATURE_MATRIX['periodic_self_audit']. */
const SLOT_SELF_AUDITED_BY = 0
const SLOT_APPROVED_BY = 1

const DECLARATION =
  'I acknowledge that I have assessed all the required criteria to my responsibility regarding periodic capability "self-assessment" per the aformentioned requirement checklist.'

const PREAMBLE_QUESTION =
  'Is there any component released with this capability within 2 years or is there any customer request ( letter of Intent from customer ) ?'
const PREAMBLE_COMMENT = 'If "NO" Request for deletion from the capability list'

type Mark = 'na' | 'yes' | 'no'

interface AuditItem {
  /** Printed item number, e.g. "1", "a,", "II". */
  itemNumber: string
  question: string
  mark: Mark
  correctiveAction: string
}

interface AuditSection {
  /** Roman numeral printed in the item column. */
  numeral: string
  title: string
  items: AuditItem[]
}

interface FormData extends Record<string, unknown> {
  /** Auto-filled identity block (mirrored so it persists with the submission). */
  componentDescription: string
  mfgPN: string
  oemVendor: string
  ata: string
  /** Stock number — manually captured, not part of the ATA Record. */
  etPN: string

  preambleMark: Mark
  preambleComment: string
  sections: AuditSection[]

  /**
   * Kept so a form whose workflow has not started still behaves exactly as before. Once the
   * step executes the printed value comes from the WORKFLOW and the layer locks the input.
   */
  selfAuditedBy: string
  selfAuditDate: string
  approvedBy: string
  approvedDate: string
}

/** Section I — Required Special Tools / Equipment. */
const SECTION_I: AuditSection = {
  numeral: 'I',
  title: 'Required Special Tools / Equipment',
  items: [
    {
      itemNumber: '1',
      question:
        'Are Special Tools & equipment actual/original manufacturer equipment available? (For actual tools/equipment complete item a to e)',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'a,',
      question: 'Is the Condition of tools/equipment in good condition / Serviceable. ?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'b,',
      question:
        'Are all tools/equipment that need calibration are calibrated , properly registered & followup using ET-MRO software " Maintenex " ?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'c,',
      question:
        'Does Tools & equipment have the required certification / calibration certification & validity evidence for any applicable certificate?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'd,',
      question:
        'Are all required Cables, Connectors, Hoses, are available, in good condition, plugged, secured from dust & stored in protected cabinet?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'e,',
      question: 'Are any loss of tools / equipment reported / observed and action taken?',
      mark: 'no',
      correctiveAction: 'NO LOST TOOLS.',
    },
    {
      itemNumber: '2,',
      question:
        'Are Alternate /Equivalent Special Tools available? (For alternate tool/equipment t complete item a-f)',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'a,',
      question: 'Does the CMM authorize / allow for using alternate tooling / equipment?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'b,',
      question: 'Are Equivalent Special Tools obtained  local manufactured?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'c,',
      question: 'Are all alternate Tools/ equipment have approved equivalency certificate?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'd,',
      question: 'Is the Test Equipment procured from Original Equipment Manufacturer (OEM)?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'e,',
      question:
        'Are all alternate Tools/ equipment equivalency certificate verified, ensured for correctness and documented?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'f,',
      question:
        'Are all alternate Tools/ equipment checked serviceability, calibration status and calibration certificate and documented?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'g,',
      question: 'Are Alternate /Equivalent Special Tools obtained through locally manufactured?',
      mark: 'na',
      correctiveAction: '',
    },
    {
      itemNumber: 'h,',
      question:
        'Are Alternate /Equivalent Special Tools obtained through locally manufactured identified for tooling P/N, S/N ,description, Classification (on condition/ service/ calibration) and location.',
      mark: 'na',
      correctiveAction: '',
    },
    { itemNumber: '3,', question: 'Is the Test Equipment procured?', mark: 'yes', correctiveAction: '' },
    {
      itemNumber: 'a,',
      question: 'Is the Test Equipment procured from Original Equipment Manufacturer (OEM)?',
      mark: 'yes',
      correctiveAction: '',
    },
    { itemNumber: 'b,', question: 'If no does it require OEM licensing?', mark: 'na', correctiveAction: '' },
    {
      itemNumber: 'c,',
      question:
        'Does the Test Equipment require indicator for input power and frequency indication before applying to the Test equipment system?',
      mark: 'yes',
      correctiveAction: '',
    },
    { itemNumber: '4', question: 'Is the Test Equipment fabricated in house?', mark: 'yes', correctiveAction: '' },
    {
      itemNumber: 'a,',
      question: 'Are all document, Specification, drawing, references  available.',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'b,',
      question:
        'Does the Test Equipment require "Approved Job Method" ? (If the test procedure deviate from CMM)',
      mark: 'na',
      correctiveAction: '',
    },
  ],
}

/** Section II — Adequate Facility. */
const SECTION_II: AuditSection = {
  numeral: 'II',
  title: 'Adequate Facility',
  items: [
    {
      itemNumber: 'a,',
      question:
        'Adequate area available and appropriate  maintenance working  environment for the task intended to be carried out?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'b,',
      question: 'Does dust any other airborne contamination are kept to a minimum?',
      mark: 'yes',
      correctiveAction: '',
    },
    { itemNumber: 'c,', question: 'Is Temperature monitored? where applicable.', mark: 'yes', correctiveAction: '' },
    {
      itemNumber: 'd,',
      question:
        'Does the lighting adequate for inspection & maintenance task can be carried out in an effective manner?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'e,',
      question: 'Does noise destruct personnel from carrying tasks?',
      mark: 'no',
      correctiveAction: 'NO NOISE DESTRUCTION.',
    },
    {
      itemNumber: 'f,',
      question: 'Are personnel provided with noise protection (individual or common) ?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'g,',
      question:
        'Are electrical / mechanical safety, plugs, cords & receptacles in good condition (no electrical tape, cracks bare wire)?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'h,',
      question:
        'Are Fire / life safety exit / aisles free from obstruction? And Emerging guide posted? Fire extinguisher available and annual service date indicated?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'I,',
      question:
        'Are chemicals separated by hazard classes (Bases, Acid, Oxidizers, Flammables)? And containers labeled / good condition / closed when not in use / no visible contamination and appropriate location?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'j,',
      question:
        'Are safety equipment available? (Gloves, Face shield, Splash goggles, water sprinkler) in good condition & used?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'k,',
      question:
        'Are components require special handling Electrostatic discharge (ESD) equipment available? & periodic check emplimented properly & documented?',
      mark: 'yes',
      correctiveAction: '',
    },
  ],
}

/** Section III — Approved Technical Data. */
const SECTION_III: AuditSection = {
  numeral: 'III',
  title: 'Approved Technical Data',
  items: [
    {
      itemNumber: 'a,',
      question:
        'Are all applicable technical data (Airworthiness directives, instructions for continued airworthiness, Maintenance manuals, Overhaul manuals, Standard practice manuals, Service bulletins, and Other applicable data acceptable to or approved by the regulatory body) current and accessable to all maintenance personnel?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'b,',
      question:
        'Are working document /Task card and relevant format used available? With no ambiguity on completing required data filling and work package develop?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'c,',
      question:
        'Does ET-soft ware / Mainetix track maintenance activity which includes different kind of Task card with work instruction, skill, man-hour, tools used, historical data and reference data required?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'd,',
      question:
        'Is the archived historical component maintenance record retrieved from maintenix system and ?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: 'e,',
      question: 'Does the shop have signed copy of form MNT-918 of the component',
      mark: 'na',
      correctiveAction: 'MNT-918 is mandatory for capablity developed after 24-Apr-23',
    },
  ],
}

/** Section IV — Qualified Personnel. */
const SECTION_IV: AuditSection = {
  numeral: 'IV',
  title: 'Qualified Personnel',
  items: [
    {
      itemNumber: '1,',
      question: 'Are qualified technicians available authorized to perform and sign off maintenance task?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: '2,',
      question:
        'Are qualified / Authorized Certifying Staff available & authorized to perform / release to service (CRS) for maintenance task carried out?',
      mark: 'yes',
      correctiveAction: '',
    },
    {
      itemNumber: '3,',
      question:
        'Do all technicians/Inspectors/Certifying staffs have current theoretical and Practical training per the approved training program manual?',
      mark: 'yes',
      correctiveAction: '',
    },
  ],
}

const DEFAULT_SECTIONS: AuditSection[] = [SECTION_I, SECTION_II, SECTION_III, SECTION_IV]

export default function PeriodicSelfAuditForm() {
  const { selectedATARecord } = useSelfEvaluation()
  const auto = useATAAutoFill()
  // MNT-1325 prints a dedicated "ET-P/N:" row, so it is one of the two sheets
  // wired to the MaintainX ET P/N resolver (the other being MNT-1229B / TNA).
  const etpn = useEtPartNumber()

  const defaultData: FormData = {
    componentDescription: auto.description,
    mfgPN: auto.partNumber,
    oemVendor: auto.manufacturer,
    ata: auto.ata,
    etPN: '',
    preambleMark: 'yes',
    preambleComment: PREAMBLE_COMMENT,
    sections: DEFAULT_SECTIONS,
    selfAuditedBy: '',
    selfAuditDate: auto.selfEvaluationDate,
    approvedBy: '',
    approvedDate: '',
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
   * (1) THE WORKFLOW INSTANCE OF THIS FORM. Never throws; when nothing resolves the block
   * prints the blank hard-copy rules, exactly like the unsigned original.
   */
  const { instance, reload: reloadInstance } = useFormWorkflowInstance({
    formSubmissionId,
    folderId: selectedATARecord?.evaluationFolderId,
  })

  /**
   * (5) ROLE-BASED EDIT AUTHORITY — the ownership gate `useFormData()` cannot know.
   * `canEdit` alone is "role capability + Draft/Returned stage", so EVERY Shop Team
   * Leader saw the Edit button on every draft, including one that belongs to another
   * preparer. This hook narrows it to: the form is mine (pending step is mine, or on
   * an unstarted form I own the preparing line), and my own line is not already
   * signed. It can only ever make the button stricter.
   */
  const authority = useFormEditAuthority({
    formType: FORM_TYPE,
    instance,
    stageAllowsEdit: canEdit,
  })

  // The ATA Record is the only writer of the identity block.
  useATAAutoFillSync<FormData>(
    setFormData,
    {
      componentDescription: auto.description,
      mfgPN: auto.partNumber,
      oemVendor: auto.manufacturer,
      ata: auto.ata,
    },
    [loading, auto.ataRecordId],
  )

  /**
   * Fetch the ET P/N from MaintainX for THIS ATA Record: Task Definition (ATA) ->
   * Applicability tab (component P/N) -> Details tab. Only the bare stock number is
   * applied — the parenthesised description is stripped by the connector client and
   * never enters the field. A disabled or unreachable connector leaves the row
   * manually editable, exactly as before.
   */
  const runEtPartNumberFetch = async () => {
    const resolved = await etpn.fetchEtPartNumber({
      ataCode: auto.ata,
      partNumber: auto.partNumber || formData.mfgPN,
      formNo: FORM_NO,
      ataRecordId: auto.ataRecordId,
    })
    if (resolved?.found) {
      setFormData(prev => ({ ...prev, etPN: resolved.etPartNumber }))
    }
  }

  const updateItem = (sectionIndex: number, itemIndex: number, patch: Partial<AuditItem>) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.map((section, sIdx) =>
        sIdx !== sectionIndex
          ? section
          : {
              ...section,
              items: section.items.map((item, iIdx) => (iIdx !== itemIndex ? item : { ...item, ...patch })),
            },
      ),
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

  const sections = formData.sections?.length ? formData.sections : DEFAULT_SECTIONS

  return (
    <div className="space-y-4">
      <FormToolbar
        title="PERIODIC CAPABILITY SELF-AUDIT"
        meta={`Form ${FORM_NO} · Rev. No. ${FORM_REV_NO} · Rev. date ${FORM_REV_DATE}`}
        approvalStatus={approvalStatus}
        canEdit={authority.canEdit}
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
            title={FORM_TITLE}
            meta={[
              { label: 'Form', value: FORM_NO },
              { label: 'Date:', value: FORM_RELEASE_DATE },
              { label: 'Rev. No.', value: FORM_REV_NO },
              { label: 'Rev. date:', value: FORM_REV_DATE },
            ]}
          />

          <DocumentFieldGrid
            columns={4}
            autoFilled
            fields={[
              { label: 'Component Description:', value: formData.componentDescription },
              { label: 'MFG P/N:', value: formData.mfgPN },
              { label: 'OEM /  Vendor:', value: formData.oemVendor },
              { label: 'ATA Chapter:', value: formData.ata },
            ]}
          />

          {/* ET-P/N: stock number, manually captured or fetched from MaintainX. */}
          <div className="border border-gray-400 border-t-0 px-2 py-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-gray-800 whitespace-nowrap">ET-P/N:</span>
              {isEditing ? (
                <>
                  <Input
                    value={formData.etPN}
                    onChange={event => {
                      // A hand-typed value invalidates the previous fetch outcome.
                      etpn.clearHint()
                      setFormData(prev => ({ ...prev, etPN: event.target.value }))
                    }}
                    className="h-7 w-48 text-xs"
                    placeholder="e.g. 25H0026"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[10px]"
                    disabled={etpn.fetching || !auto.ata || !(auto.partNumber || formData.mfgPN)}
                    title={
                      etpn.canFetch
                        ? 'Read the stock number from the MaintainX Details tab (description stripped)'
                        : 'MaintainX lookup is not configured on this server — type the stock number manually'
                    }
                    onClick={() => void runEtPartNumberFetch()}
                  >
                    <RefreshCw className={`h-3 w-3 mr-1 ${etpn.fetching ? 'animate-spin' : ''}`} />
                    Fetch
                  </Button>
                </>
              ) : (
                <span className="text-xs font-semibold text-gray-900">{formData.etPN || '—'}</span>
              )}
            </div>
            {isEditing && etpn.hint && (
              <p
                className={`mt-0.5 text-[10px] leading-tight ${
                  etpn.tone === 'success'
                    ? 'text-green-700'
                    : etpn.tone === 'error'
                      ? 'text-red-700'
                      : 'text-amber-700'
                }`}
              >
                {etpn.hint}
              </p>
            )}
          </div>

          {/* ---- Checklist -------------------------------------------------- */}
          <div className="overflow-x-auto border border-gray-400 border-t-0">
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-1 py-1 w-10 text-center font-semibold">#</th>
                  <th className="border border-gray-300 px-2 py-1 text-left font-semibold">
                    SELF AUDIT DESCRIPTION
                  </th>
                  <th className="border border-gray-300 px-1 py-1 w-14 text-center font-semibold leading-tight">
                    Not
                    <br />
                    Applicable
                    <br />
                    NA
                  </th>
                  <th className="border border-gray-300 px-1 py-1 w-12 text-center font-semibold leading-tight">
                    OK ?
                    <br />
                    YES
                  </th>
                  <th className="border border-gray-300 px-1 py-1 w-12 text-center font-semibold leading-tight">
                    OK ?
                    <br />
                    NO
                  </th>
                  <th className="border border-gray-300 px-2 py-1 w-64 text-left font-semibold">
                    If marked &quot;NO&quot; , please indicate the corrective action taken or to be taken.
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Pre-amble row (printed above section I in the hard copy). */}
                <tr>
                  <td className="border border-gray-300 px-1 py-1" />
                  <td className="border border-gray-300 px-2 py-1 align-top">{PREAMBLE_QUESTION}</td>
                  <td className="border border-gray-300 px-1 py-1 text-center align-middle">
                    <CheckCell
                      mark="√"
                      ariaLabel="Not applicable"
                      checked={formData.preambleMark === 'na'}
                      disabled={!isEditing}
                      onChange={() => setFormData(prev => ({ ...prev, preambleMark: 'na' }))}
                    />
                  </td>
                  <td className="border border-gray-300 px-1 py-1 text-center align-middle">
                    <CheckCell
                      mark="√"
                      ariaLabel="Yes"
                      checked={formData.preambleMark === 'yes'}
                      disabled={!isEditing}
                      onChange={() => setFormData(prev => ({ ...prev, preambleMark: 'yes' }))}
                    />
                  </td>
                  <td className="border border-gray-300 px-1 py-1 text-center align-middle">
                    <CheckCell
                      mark="√"
                      ariaLabel="No"
                      checked={formData.preambleMark === 'no'}
                      disabled={!isEditing}
                      onChange={() => setFormData(prev => ({ ...prev, preambleMark: 'no' }))}
                    />
                  </td>
                  <td className="border border-gray-300 px-1 py-1 align-top">
                    {isEditing ? (
                      <Input
                        value={formData.preambleComment}
                        onChange={event =>
                          setFormData(prev => ({ ...prev, preambleComment: event.target.value }))
                        }
                        className="h-7 text-[11px]"
                      />
                    ) : (
                      formData.preambleComment
                    )}
                  </td>
                </tr>

                {sections.map((section, sectionIndex) => (
                  <Fragment key={`${section.numeral}-${section.title}`}>
                    <tr className="bg-gray-50">
                      <td className="border border-gray-300 px-1 py-1 text-center font-bold align-top">
                        {section.numeral}
                      </td>
                      <td className="border border-gray-300 px-2 py-1 font-bold">{section.title}</td>
                      <td className="border border-gray-300 px-1 py-1 text-center font-semibold">NA</td>
                      <td className="border border-gray-300 px-1 py-1 text-center font-semibold">YES</td>
                      <td className="border border-gray-300 px-1 py-1 text-center font-semibold">NO</td>
                      <td className="border border-gray-300 px-2 py-1 font-semibold">Comments</td>
                    </tr>

                    {section.items.map((item, itemIndex) => (
                      <tr key={`${section.numeral}-${itemIndex}-${item.itemNumber}`}>
                        <td className="border border-gray-300 px-1 py-1 text-center align-top font-medium">
                          {item.itemNumber}
                        </td>
                        <td className="border border-gray-300 px-2 py-1 align-top">{item.question}</td>
                        {(['na', 'yes', 'no'] as Mark[]).map(mark => (
                          <td
                            key={mark}
                            className="border border-gray-300 px-1 py-1 text-center align-middle"
                          >
                            <CheckCell
                              mark="√"
                              ariaLabel={mark.toUpperCase()}
                              checked={item.mark === mark}
                              disabled={!isEditing}
                              onChange={() => updateItem(sectionIndex, itemIndex, { mark })}
                            />
                          </td>
                        ))}
                        <td className="border border-gray-300 px-1 py-1 align-top">
                          {isEditing ? (
                            <Input
                              value={item.correctiveAction}
                              onChange={event =>
                                updateItem(sectionIndex, itemIndex, { correctiveAction: event.target.value })
                              }
                              className="h-7 text-[11px]"
                            />
                          ) : (
                            item.correctiveAction
                          )}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {/*
            (2) + (3) THE AUTOMATIC SIGNATURE BLOCK.
                `formType`  -> the verbatim captions ("Self-audited By:" / "Approved By:") and
                               the fixed role titles ("Team Leader" / "Manager") of the matrix;
                `instance`  -> the automatic name, the frozen UTC date and the specimen of
                               each executed step;
                `slotIndex` -> pins each printed line to its matrix slot, so the Manager
                               approval can never print on the self-audit line.
            The layout is UNCHANGED: same declaration, same two captions, same order.
          */}
          <SignatureBlock
            editable={isEditing}
            formType={FORM_TYPE}
            instance={instance}
            statement={DECLARATION}
            rows={[
              {
                slotIndex: SLOT_SELF_AUDITED_BY,
                label: 'Self-audited By:',
                role: APPROVER_TITLES.auditSelfAuditedBy,
                name: formData.selfAuditedBy,
                date: formData.selfAuditDate,
                onNameChange: value => setFormData(prev => ({ ...prev, selfAuditedBy: value })),
                onDateChange: value => setFormData(prev => ({ ...prev, selfAuditDate: value })),
              },
              {
                slotIndex: SLOT_APPROVED_BY,
                label: 'Approved By:',
                role: APPROVER_TITLES.auditApprovedBy,
                name: formData.approvedBy,
                date: formData.approvedDate,
                onNameChange: value => setFormData(prev => ({ ...prev, approvedBy: value })),
                onDateChange: value => setFormData(prev => ({ ...prev, approvedDate: value })),
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
        canEdit={authority.canEdit}
        canSubmit={canSubmit && authority.canEdit}
        saving={saving}
        onSubmit={() => void handleSubmitForApproval()}
        /**
         * MNT-1325 action visibility: the SERVER's canIAct / canIDelegate flags of the
         * CURRENT step decide who sees Approve / Reject / Request Revision / Delegate.
         * Without this prop the buttons fell back to a role-shaped guess, so a Director
         * could see them while the form still sat with the Team Leader or the Manager.
         */
        workflowInstance={instance}
        /**
         * (4) `loadFromBackend()` refreshes the FORM DATA; `reloadInstance()` refreshes the
         * EXECUTED STEPS, which is where the printed name, date and specimen come from.
         */
        onStatusChange={() => {
          void loadFromBackend()
          void reloadInstance()
        }}
      />
    </div>
  )
}