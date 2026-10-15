/**
 * TRAINING DOCUMENTS VERIFICATION — hard-copy replica
 * (AMENDED v18 — field-by-field correction against the two paper sheets)
 *
 * WHAT THIS AMENDMENT FIXES (gap analysis self-evaluation-form-gap-analysis.md)
 * -----------------------------------------------------------------------------
 * - P0 §B2: the TECHNICIAN sheet (scan "treng doctech") prints its OWN
 *   A/C Component Maintenance Courses list — rows 19..27 — which is completely
 *   different from the INSPECTION sheet's rows 19..34. Previously every variant
 *   shared one course list. Each variant now carries its own default.
 * - P1 §A4/§B3: general-training row 14 printed "EIDS"; both paper sheets
 *   print "ESDS" (Electrostatic Discharge Sensitivity). Corrected.
 * - P3 §S-4: the ATA identity strip is a SYSTEM extension — it does not exist
 *   on the paper. It is wrapped in a clearly labelled band so the replica
 *   body stays 100% faithful to the controlled document.
 *
 * THE ORIGINAL HARD COPY — INSPECTION sheet (scan "trang docinsp")
 * -----------------------------------------------------------------
 *   Subject: Training Documents verification        Date: 27-Apr-26
 *   Name: HANNA MITIKU            Id No.: 19893
 *   TABLE 1 — No | Type of training | Initial Training Taken on Date (M/D/Y)
 *             | Refresher Training Taken on Date (M/D/Y) | Remark   (1..18)
 *   TABLE 2 — A/C Component Maintenance Courses
 *             No | A/C Component Maintenance Courses
 *                | Initial Date Taken (Classroom) | Refresher Date Taken (Classroom) (19..34)
 *   Verification initiated by:  Name / Position / Signature  (Manager Avionics Component Shops)
 *   ***************************************************************************
 *   For Mgr. MRO HR & Admin use only:
 *   I hereby certify that the employee has taken the above listed trainings.
 *   Name / Signature (MRO HR Office) / Date
 *   ***************************************************************************
 *
 * THE ORIGINAL HARD COPY — TECHNICIAN sheet (scan "treng doctech")
 * -----------------------------------------------------------------
 *   Same geometry, employee FANTAHUN DAMESSA / 27070, and TABLE 2 rows 19..27
 *   exactly as printed on that sheet (see DEFAULT_COURSES_TECHNICIAN).
 *
 * AUTO-POPULATION (cross-form requirement)
 * ----------------------------------------
 * The identity block (Description, P/N, Manufacturer, ATA, A/C,
 * Self-Evaluation Date, CMM Rev Date, Rev. No, Letter Ref. No, Shop Capability,
 * Responsible Workshop) is READ from `useATAAutoFill` and mirrored into the
 * payload by `useATAAutoFillSync`, so it is identical on every required form.
 */
'use client'

import { useEffect } from 'react'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useFormData } from '@/lib/self-evaluation/useFormData'
import { useATAAutoFill, useATAAutoFillSync } from '@/lib/self-evaluation/useATAAutoFill'
import { useAuth } from '@/lib/auth-context'
import { normalizeRole } from '@/lib/role-hierarchy'
import { ApprovalStatus, type FormNodeType } from '@/lib/self-evaluation/types'
import {
  DocumentHeader,
  FormToolbar,
  FormWorkflowFooter,
  SignatureBlock,
} from './FormDocumentChrome'
import { useFormWorkflowInstance } from '@/lib/workflow/useFormWorkflowInstance'
import { useSignatureImage } from '@/lib/workflow/signature-render'
import TrainingEmployeeAssignment from './TrainingEmployeeAssignment'

// ===========================================================================
// Controlled document constants — verbatim from the hard copies
// ===========================================================================

const DOCUMENT_TITLE = 'TRAINING DOCUMENTS VERIFICATION'
const SUBJECT_LINE = 'Training Documents verification'
const VERIFICATION_DATE = '27-Apr-26'

const HR_STATEMENT = 'I hereby certify that the employee has taken the above listed trainings.'
const HR_HEADING = 'For Mgr. MRO HR & Admin use only:'
const ASTERISK_RULE = '*'.repeat(96)

/** Titles printed on the hard copy. */
const PRINTED_ROLES = {
  initiatedBy: 'Manager Avionics Component Shops',
  hrOffice: 'MRO HR Office',
} as const

/** Names printed on the reference hard copy — defaults only, always editable. */
const PRINTED_NAMES = {
  initiatedBy: 'WAKUMA NEGASSA',
  initiatedByPosition: 'Manager',
  hrName: 'Tamrat Abera',
} as const

function formatPaperDate(value = new Date()): string {
  return value
    .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
    .replace(/\//g, '-')
}

export type TrainingVerificationVariant =
  | 'maintenance_generic'
  | 'inspection'
  | 'technician'

interface VariantConfig {
  formType: FormNodeType
  /** Toolbar title, identical to the Table of Contents label. */
  toolbarTitle: string
  employeeName: string
  employeeId: string
  /** TABLE 2 default printed on THIS variant's sheet. */
  courses: CourseRow[]
}

// ===========================================================================
// Row models
// ===========================================================================

interface GeneralTrainingRow {
  id: string
  no: string
  typeOfTraining: string
  initialDate: string
  refresherDate: string
  remark: string
}

interface CourseRow {
  id: string
  no: string
  course: string
  initialDate: string
  refresherDate: string
}

/** TABLE 1 of both hard copies — 18 general trainings, verbatim. */
const DEFAULT_GENERAL_TRAINING: GeneralTrainingRow[] = [
  ['HF', '12/31/2015', 'CURRENT'],
  ['AL', '9/6/2023', '7/17/2025'],
  ['FAA Regulation', '6/25/24', '12/30/2024'],
  ['FTS', '6/24/2024', '4/15/2026'],
  ['MPM', '10/29/2018', '4/16/2026'],
  ['MOE', '9/7/2023', '7/17/2025'],
  ['RSM/QCM', '10/19/2016', '4/16/2026'],
  ['EWIS', '6/21/2024', '4/15/2026'],
  ['MEL', 'N/A', 'N/A'],
  ['Inspection Procedure', '11/16/2018', '4/16/2026'],
  ['ECARAS', '12/26/2016', '4/16/2026'],
  ['ETOPS', 'N/A', 'N/A'],
  ['Aircraft fuel handling and servicing', 'N/A', 'N/A'],
  // P1 §A4: both paper sheets print "ESDS" (was wrongly "EIDS").
  ['ESDS', '10/13/2020', 'N/A'],
  ['SMS', '8/22/25', 'CURRENT'],
  ['MCM', '10/22/20', '03/31/2026'],
  ['Dangerous Goods', '9/5/2025', 'CURRENT'],
  ['PL Level III (Applicable for new authorization issuance', '9/18/2017', 'N/A'],
].map(([typeOfTraining, initialDate, refresherDate], index) => ({
  id: `gt-${index + 1}`,
  no: String(index + 1),
  typeOfTraining,
  initialDate,
  refresherDate,
  remark: '',
}))

/**
 * TABLE 2 of the INSPECTION sheet (and of the MAINTENANCE AND GENERIC COURSES
 * sheet until its own reference is supplied) — A/C Component Maintenance
 * Courses 19..34, verbatim from scan "trang docinsp".
 */
const DEFAULT_COURSES_INSPECTION: CourseRow[] = [
  [
    'B787 BATTERY UNIT,P/N:B787 BATTERY,P/N:B3856-901,B3856-902 & B3856-904',
    '11/24/2021',
    'N/A',
  ],
  ['B787 TRASH COMPACTOR(P/N: HFWF2007-01/-0101)', '11/18/2021', 'N/A'],
  [
    'B767/777/787 AIR CHILLER(P/N:2675V,267-100/-500,338-3/-503)REFRIGERATOR/FREEZER(P/N:218-1 THRU 228-9,228-11/-505/-508)CHILLER/REFRIGERATOR/FREEZER(P/N: 600-1 THRU 600-4,600-21/-41/-1E1& 600-3E1)',
    '11/18/2020',
    'N/A',
  ],
  ['D53500 STEAM OVEN, P/N: 4323500/4323501 SERIES', '1/17/2020', 'N/A'],
  ['B777 BATTERY,P/N: 263BA101-2 & B787 BATTERY,P/N: B3856 SERIES', '11/24/21', 'N/A'],
  ['B787 EBA MOTOR', '5/26/2019', 'N/A'],
  [
    'B777 BEVERAGE MAKER,P/N: 4510 SERIES & WATER BOILER, P/N: 4520 SERIES,B787 BEVERAGE MAKER,P/N: 4610 SERIES & WATER BOILER P/N: 4620 SERIES ,A350 BEVERAGE MAKER,P/N: 4650 SERIES & WATER BOILER, P/N: 4660 SERIES',
    '3/29/2019',
    'N/A',
  ],
  ['B737 NG CONTROL MODULES', '7/5/2018', 'N/A'],
  [
    'ZODIAC COMMERCIAL AIRCRAFT INSERTS (ZCAI) OVEN (P/N: 830X-XX-XXXX-XX), BEVERAGE MAKER (P/N: 920X-01-0000-01) & WATER BOILER (P/N:940X-0000-01)',
    '6/1/2018',
    'N/A',
  ],
  [
    'OCM3000 SERIES (P/N: 4383100-00-66-00,4383100-01-6600,4383100-02-6600 & 4383200-91-6600)',
    '6/22/2017',
    'N/A',
  ],
  [
    'B767/787 CABIN ZONE TEMPERATURE CONTROL UNIT (P/N: 624958-4 SERIES 1&2) LEVEL III',
    '6/17/2016',
    'N/A',
  ],
  ['B757/767 WINDOW HEAT CONTROL UNIT (LEVEL III)', '9/4/2015', 'N/A'],
  [
    'B767/757 Antiskid/Autobreak Control Unit (P/N: 42-629 SERIES) LEVEL II',
    '4/3/2015',
    'N/A',
  ],
  ['B737 NG Window Heat Control Unit (P/N:B3000 Series)', '3/9/2015', 'N/A'],
  [
    'B777 Espresso maker(P/N HFE2005-01),3000/3075 Oven Series,P/N[4313100-01-6600/431301-01-6600/4323100-01-6622/4323101-01-6622/4323070-01-6626/4323071-01-6626/4333100-01-6600/4333101-01-6600][MRO322]',
    '10/24/2013',
    'N/A',
  ],
  [
    'B737 MAX GALLEY INSERTS: (OVEN, P/N: 8303-01-0000-01, 830304-0000-01, 8303-06-0000-01, 8303-05-0000-02, 8303-51-0000-01, 8303-54-0000-01, 8303-56-0000-01, 8303-560000-02, 8304-01-0000-01, 8304-51-0000-01, 8307-01-0000-01, 8307-06-0000-01, 8307-05-0000-02, 8307-510000-01, 8307-56-0000-01, 8307-56-0000-02, 8308-01-0000-01, 8308-51-0000-01) {COFFEE/BEVARAGE MAKER, P/N: 9001-01-0000-01, 9002-01-0000-01, 9201-01-0000-01, 9202-01-0000-01} {WATER BOILER, P/N: 9401-01-0000-01, -02, -03; 9401-51-0000-01; 9402-01-0000-01, -02, -03; 9402-51-0000-01} (DCM, P/N: 7113-020000-01, 7113-03-0000-01, 7113-06-0000-01)',
    '5/10/2024',
    'N/A',
  ],
].map(([course, initialDate, refresherDate], index) => ({
  id: `mc-${index + 19}`,
  no: String(index + 19),
  course,
  initialDate,
  refresherDate,
}))

/**
 * TABLE 2 of the TECHNICIAN sheet (scan "treng doctech") — rows 19..27 exactly
 * as printed on THAT sheet. The classroom dates were not legible in the scan;
 * they are seeded as "N/A" and MUST be transcribed from the paper sheet
 * (gap-analysis §9). The course texts are verbatim.
 */
const DEFAULT_COURSES_TECHNICIAN: CourseRow[] = [
  'B737 MAX GALLEY INSERTS: (OVEN, P/N: 8303-01-0000-01, 832004-0000-01, 8303-06-0000-01, 8303-08-0000-02, 8303-51-0000-01, 8303-54-0000-01, 8303-58-0000-01, 8303-580000-02, 8304-01-0000-01, 8304-51-0000-01, 8307-01-0000-01, 8307-06-0000-01, 8307-06-0000-02, 8307-510000-01, 8307-58-0000-01, 8307-58-0000-02, 8309-01-0000-01, 8309-51-0000-01) (COFFEE/BEVERAGE MAKER, P/N: 9001-01-0000-01, 9002-01-0000-01, 9201-01-0000-01, 9202-01-0000-01) (WATER BOILER, P/N: 9401-01-0000-01, -02, -03; 9401-51-0000-01; 9402-01-0000-01, -02, -03; 8402-51-0000-01) (OCM, P/N: 7113-020000-01, 7113-53-0000-01, 7113-08-0000-01)',
  'DS3530 STEAM OVEN, P/N: 4322500/4323501 SERIES',
  'B787 TRASH COMPACTOR (P/N: HFWF2007-01/-0101/-0102/-0103/-0104)',
  'B767/777/787 AIR CHILLER (P/N: 2675V, 267-100/-500, 338-3A-503) REFRIGERATOR/FREEZER (P/N: 228-1 THRU 228-9, 228-11/-505/-508) CHILLER/REFRIGERATOR/FREEZER (P/N: 600-1 THRU 600-4, 600-21/-41/-1E1& 600-3E1)',
  'B777 Espresso maker (P/N HFE2005-01), 3000/3075 Oven Series, P/N (4313100-01-6600/431301-01-6800/4323100-01-6622/4323101-01-6622/4323070-01-6626/4323071-01-6626/4333100-01-6600/4333101-01-6600) MRO322)',
  'B787 COFFEE MAKER (PN: HFA2007-01) ESPRESSO MAKER (PN: HFE2007-01) & WATER HEATER (PN: HFAW/2007-01) MRO2602)',
  'B777 BEVERAGE MAKER, P/N: 4510 SERIES & WATER BOILER, P/N: 4520 SERIES, B787 BEVERAGE MAKER, P/N: 4610 SERIES & WATER BOILER P/N: 4620 SERIES, A350 BEVERAGE MAKER, P/N: 4650 SERIES & WATER BOILER, P/N: 4660 SERIES',
  'OCM3000 SERIES (P/N: 4383100-00-66-00, 4383100-01-6600, 4383100-02-6600 & 4383200-91-6600)',
  'MRO74 (B757/767 STANDBY ALTIMETER (P/N LX-35-X) AND STANDBY AIRSPEED INDICATOR (P/N A36167310967) LEVEL III MAINTENANCE',
].map((course, index) => ({
  id: `mc-t-${index + 19}`,
  no: String(index + 19),
  course,
  initialDate: 'N/A',
  refresherDate: 'N/A',
}))

const VARIANTS: Record<TrainingVerificationVariant, VariantConfig> = {
  maintenance_generic: {
    formType: 'component_maintenance_training',
    toolbarTitle: 'MAINTENANCE AND GENERIC COURSES',
    employeeName: 'HANNA MITIKU',
    employeeId: '19893',
    // Gap-analysis §C1: no dedicated paper reference supplied for this node yet.
    // It keeps the 19..34 list until its own sheet is confirmed.
    courses: DEFAULT_COURSES_INSPECTION,
  },
  inspection: {
    formType: 'training_verification_inspection',
    toolbarTitle: 'TRAINING VERIFICATION (INSPECTION)',
    employeeName: 'HANNA MITIKU',
    employeeId: '19893',
    courses: DEFAULT_COURSES_INSPECTION,
  },
  technician: {
    formType: 'training_verification_technician',
    toolbarTitle: 'TRAINING VERIFICATION (TECHNICIAN)',
    employeeName: 'FANTAHUN DAMESSA',
    employeeId: '27070',
    // P0 §B2: the technician sheet prints its OWN 19..27 course list.
    courses: DEFAULT_COURSES_TECHNICIAN,
  },
}

// ===========================================================================
// Payload
// ===========================================================================

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

  /** Printed header of the verification sheet. */
  subject: string
  verificationDate: string
  employeeName: string
  employeeId: string

  generalTraining: GeneralTrainingRow[]
  courses: CourseRow[]

  assignedEmployeeId: string
  assignedEmployeeName: string
  assignedEmployeeRole: string

  initiatedByName: string
  initiatedByPosition: string
  initiatedByRole: string
  initiatedByDate: string
  initiatedBySignatureId: string
  initiatedBySignatureHash: string

  hrStatement: string
  hrName: string
  hrPosition: string
  hrDate: string
  hrSignatureId: string
  hrSignatureHash: string

}

interface Props {
  variant: TrainingVerificationVariant
}

export default function TrainingVerificationForm({ variant }: Props) {
  const config = VARIANTS[variant]
  const { selectedATARecord } = useSelfEvaluation()
  const { user } = useAuth()
  const auto = useATAAutoFill()
  const currentUserName = user?.fullName || user?.name || user?.username || ''
  const currentUserRole = normalizeRole(user?.role)

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

    subject: SUBJECT_LINE,
    verificationDate: VERIFICATION_DATE,
    employeeName: config.employeeName,
    employeeId: config.employeeId,
    assignedEmployeeId: '',
    assignedEmployeeName: '',
    assignedEmployeeRole: '',

    generalTraining: DEFAULT_GENERAL_TRAINING,
    courses: config.courses,

    initiatedByName: PRINTED_NAMES.initiatedBy,
    initiatedByPosition: PRINTED_NAMES.initiatedByPosition,
    initiatedByRole: PRINTED_ROLES.initiatedBy,
    initiatedByDate: '',
    initiatedBySignatureId: '',
    initiatedBySignatureHash: '',

    hrStatement: HR_STATEMENT,
    hrName: PRINTED_NAMES.hrName,
    hrPosition: PRINTED_ROLES.hrOffice,
    hrDate: VERIFICATION_DATE,
    hrSignatureId: '',
    hrSignatureHash: '',

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
    submissionGateMessage,
    handleSave,
    handleSaveAndSubmit,
    handleSubmitForApproval,
    userRole,
    loadFromBackend,
  } = useFormData<FormData>(defaultData, {
    formType: config.formType,
    formNo: '',
    revNo: '',
  })

  const { instance, reload: reloadInstance } = useFormWorkflowInstance({
    formSubmissionId,
    folderId: selectedATARecord?.evaluationFolderId,
  })
  const managerSignature = instance?.signatures?.find(signature => signature.stepNo === 2)
  const { signature: managerSignatureImage, loading: managerSignatureLoading } = useSignatureImage(
    managerSignature?.userId ?? null,
    !!managerSignature,
  )

  useEffect(() => {
    if (managerSignature?.signedAt) void loadFromBackend()
  }, [loadFromBackend, managerSignature?.signedAt])

  useEffect(() => {
    const nextDefaults: Partial<FormData> = {}

    if (!formData.initiatedByName && currentUserName) {
      nextDefaults.initiatedByName = currentUserName
    }
    if (!formData.initiatedByPosition) {
      nextDefaults.initiatedByPosition =
        currentUserRole === 'Manager'
          ? 'Manager'
          : currentUserRole === 'HRSpecialist'
            ? 'HR Specialist'
            : currentUserRole === 'SpecialAdmin'
              ? 'Special Admin'
              : 'Manager'
    }
    if (!formData.initiatedByRole) {
      nextDefaults.initiatedByRole = PRINTED_ROLES.initiatedBy
    }
    if (!formData.initiatedByDate) {
      nextDefaults.initiatedByDate = formatPaperDate()
    }

    if (!formData.hrName && currentUserRole === 'HRSpecialist' && currentUserName) {
      nextDefaults.hrName = currentUserName
    }
    if (!formData.hrPosition) {
      nextDefaults.hrPosition = PRINTED_ROLES.hrOffice
    }
    if (!formData.hrDate) {
      nextDefaults.hrDate = formatPaperDate()
    }

    if (Object.keys(nextDefaults).length > 0) {
      setFormData(prev => ({ ...prev, ...nextDefaults }))
    }
  }, [currentUserName, currentUserRole, formData.initiatedByDate, formData.initiatedByName, formData.initiatedByPosition, formData.initiatedByRole, formData.hrDate, formData.hrName, formData.hrPosition, setFormData])

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

  const defaultCourses = config.courses

  const generalTraining = formData.generalTraining?.length
    ? formData.generalTraining
    : DEFAULT_GENERAL_TRAINING
  const courses = formData.courses?.length ? formData.courses : defaultCourses
  const assignmentRole = variant === 'inspection' ? 'Inspector' : 'Technician' as const
  const isShopTeamLeader = userRole === 'team_leader'
  const isFormEditing = isEditing && canEdit

  const updateGeneral = (id: string, patch: Partial<GeneralTrainingRow>) => {
    setFormData(prev => ({
      ...prev,
      generalTraining: (prev.generalTraining?.length
        ? prev.generalTraining
        : DEFAULT_GENERAL_TRAINING
      ).map(row => (row.id === id ? { ...row, ...patch } : row)),
    }))
  }

  const addGeneral = () => {
    setFormData(prev => {
      const current = prev.generalTraining?.length ? prev.generalTraining : DEFAULT_GENERAL_TRAINING
      return {
        ...prev,
        generalTraining: [
          ...current,
          {
            id: `gt-${Date.now()}`,
            no: String(current.length + 1),
            typeOfTraining: '',
            initialDate: '',
            refresherDate: '',
            remark: '',
          },
        ],
      }
    })
  }

  const removeGeneral = (id: string) => {
    setFormData(prev => {
      const current = prev.generalTraining?.length ? prev.generalTraining : DEFAULT_GENERAL_TRAINING
      return {
        ...prev,
        generalTraining: current
          .filter(row => row.id !== id)
          .map((row, index) => ({ ...row, no: String(index + 1) })),
      }
    })
  }

  const updateCourse = (id: string, patch: Partial<CourseRow>) => {
    setFormData(prev => ({
      ...prev,
      courses: (prev.courses?.length ? prev.courses : defaultCourses).map(row =>
        row.id === id ? { ...row, ...patch } : row,
      ),
    }))
  }

  const addCourse = () => {
    setFormData(prev => {
      const current = prev.courses?.length ? prev.courses : defaultCourses
      const firstNo = Number(current[0]?.no || 19)
      return {
        ...prev,
        courses: [
          ...current,
          {
            id: `mc-${Date.now()}`,
            no: String(firstNo + current.length),
            course: '',
            initialDate: '',
            refresherDate: '',
          },
        ],
      }
    })
  }

  const removeCourse = (id: string) => {
    setFormData(prev => {
      const current = prev.courses?.length ? prev.courses : defaultCourses
      const firstNo = Number(current[0]?.no || 19)
      return {
        ...prev,
        courses: current
          .filter(row => row.id !== id)
          .map((row, index) => ({ ...row, no: String(firstNo + index) })),
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

  if (
    isShopTeamLeader &&
    (variant === 'inspection' || variant === 'technician') &&
    approvalStatus !== ApprovalStatus.Approved
  ) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">{config.toolbarTitle}</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Select the {assignmentRole} for this training verification and submit it for review.
                </p>
              </div>
              <Badge variant="outline">{approvalStatus === ApprovalStatus.Draft ||
                approvalStatus === ApprovalStatus.Returned ||
                approvalStatus === ApprovalStatus.Rejected
                ? 'Ready for submission'
                : 'Approval in progress'}</Badge>
            </div>

            {canEdit ? (
              <>
                <TrainingEmployeeAssignment
                  shopId={selectedATARecord?.shopId}
                  formType={config.formType}
                  role={assignmentRole}
                  compact
                  employeeId={formData.assignedEmployeeId}
                  employeeName={formData.assignedEmployeeName}
                  employeeRole={formData.assignedEmployeeRole}
                  canEdit
                  onChange={employee => setFormData(prev => ({
                    ...prev,
                    assignedEmployeeId: employee.id,
                    assignedEmployeeName: employee.name,
                    assignedEmployeeRole: employee.role,
                    employeeName: employee.name,
                    employeeId: employee.id,
                  }))}
                />
                {submissionGateMessage && (
                  <p className="text-sm text-amber-800">{submissionGateMessage}</p>
                )}
                <Button
                  type="button"
                  onClick={() => void handleSaveAndSubmit()}
                  disabled={!canSubmit || !formData.assignedEmployeeId || saving}
                  className="w-full sm:w-auto"
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit for approval
                </Button>
              </>
            ) : (
              <p className="rounded-md bg-gray-50 p-3 text-sm text-gray-700">
                The completed form is hidden while this request is pending approval. It will be
                available to view after the HR Specialist grants final approval.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <FormToolbar
        title={config.toolbarTitle}
        meta={`Training Documents verification · ${formData.employeeName} · ID ${formData.employeeId}`}
        approvalStatus={approvalStatus}
        canEdit={canEdit}
        isEditing={isFormEditing}
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
        formType={config.formType}
        role={assignmentRole}
        employeeId={formData.assignedEmployeeId}
        employeeName={formData.assignedEmployeeName}
        employeeRole={formData.assignedEmployeeRole}
        canEdit={canEdit && isFormEditing}
        onChange={employee => setFormData(prev => ({
          ...prev,
          assignedEmployeeId: employee.id,
          assignedEmployeeName: employee.name,
          assignedEmployeeRole: employee.role,
          employeeName: employee.name,
          employeeId: employee.id,
        }))}
        onIncluded={() => void loadFromBackend()}
      />

      <Card>
        <CardContent className="p-3 space-y-0">
          <DocumentHeader
            organisation="ETHIOPIAN MRO"
            title={DOCUMENT_TITLE}
            meta={[
              { label: 'Subject:', value: formData.subject },
              { label: 'Date:', value: formData.verificationDate },
            ]}
          />

          {/* ---- Printed employee row: NAME / ID NO ------------------------- */}
          <div className="border border-gray-400 border-t-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y divide-gray-300 sm:divide-y-0">
              {(
                [
                  { key: 'employeeName', label: 'NAME' },
                  { key: 'employeeId', label: 'ID NO.' },
                ] as const
              ).map(field => (
                <div key={field.key} className="px-2 py-1.5 border-r border-gray-300 last:border-r-0">
                  <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-500">
                    {field.label}
                  </p>
                  {isFormEditing ? (
                    <Input
                      value={formData[field.key]}
                      onChange={event =>
                        setFormData(prev => ({ ...prev, [field.key]: event.target.value }))
                      }
                      className="h-7 text-[11px]"
                    />
                  ) : (
                    <p className="text-[11px] font-semibold uppercase text-gray-900 border-b border-dotted border-gray-400 min-h-[18px]">
                      {formData[field.key] || ''}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ---- TABLE 1 — General Training --------------------------------- */}
          <div className="overflow-x-auto border border-gray-400 border-t-0">
            <table className="w-full border-collapse text-[11px]">
              <caption className="sr-only">General training records, items 1 to 18</caption>
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-1 py-1 w-10 text-center font-semibold">No</th>
                  <th className="border border-gray-300 px-2 py-1 text-left font-semibold">
                    Type of training
                  </th>
                  <th className="border border-gray-300 px-2 py-1 w-32 text-center font-semibold">
                    Initial Training Taken on Date (M/D/Y)
                  </th>
                  <th className="border border-gray-300 px-2 py-1 w-32 text-center font-semibold">
                    Refresher Training Taken on Date (M/D/Y)
                  </th>
                  <th className="border border-gray-300 px-2 py-1 w-28 text-left font-semibold">
                    Remark
                  </th>
                  {isFormEditing && <th className="border border-gray-300 px-1 py-1 w-10" />}
                </tr>
              </thead>
              <tbody>
                {generalTraining.map(row => (
                  <tr key={row.id}>
                    <td className="border border-gray-300 px-1 py-1 text-center align-top font-medium">
                      {row.no}
                    </td>
                    {(
                      [
                        { key: 'typeOfTraining', align: 'text-left' },
                        { key: 'initialDate', align: 'text-center' },
                        { key: 'refresherDate', align: 'text-center' },
                        { key: 'remark', align: 'text-left' },
                      ] as const
                    ).map(cell => (
                      <td
                        key={cell.key}
                        className={`border border-gray-300 px-2 py-1 align-top ${cell.align}`}
                      >
                        {isFormEditing ? (
                          <Input
                            value={row[cell.key]}
                            onChange={event => updateGeneral(row.id, { [cell.key]: event.target.value })}
                            className="h-7 text-[11px]"
                          />
                        ) : (
                          <span className="break-words [overflow-wrap:anywhere]">{row[cell.key]}</span>
                        )}
                      </td>
                    ))}
                    {isFormEditing && (
                      <td className="border border-gray-300 px-1 py-1 text-center align-middle">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-red-500"
                          onClick={() => removeGeneral(row.id)}
                          aria-label={`Remove general training ${row.no}`}
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

          {isFormEditing && (
            <div className="border border-gray-400 border-t-0 px-2 py-2">
              <Button size="sm" variant="outline" onClick={addGeneral}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add General Training
              </Button>
            </div>
          )}

          {/* ---- TABLE 2 — A/C Component Maintenance Courses ---------------- */}
          <div className="overflow-x-auto border border-gray-400 border-t-0">
            <table className="w-full border-collapse text-[11px]">
              <caption className="sr-only">
                A/C Component Maintenance Courses — the list printed on this variant&apos;s sheet
              </caption>
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-1 py-1 w-10 text-center font-semibold">No</th>
                  <th className="border border-gray-300 px-2 py-1 text-left font-semibold">
                    A/C Component Maintenance Courses
                  </th>
                  <th className="border border-gray-300 px-2 py-1 w-28 text-center font-semibold">
                    Initial Date Taken (Classroom)
                  </th>
                  <th className="border border-gray-300 px-2 py-1 w-28 text-center font-semibold">
                    Refresher Date Taken (Classroom)
                  </th>
                  {isFormEditing && <th className="border border-gray-300 px-1 py-1 w-10" />}
                </tr>
              </thead>
              <tbody>
                {courses.map(row => (
                  <tr key={row.id}>
                    <td className="border border-gray-300 px-1 py-1 text-center align-top font-medium">
                      {row.no}
                    </td>
                    <td className="border border-gray-300 px-2 py-1 align-top">
                      {isFormEditing ? (
                        <textarea
                          value={row.course}
                          onChange={event => updateCourse(row.id, { course: event.target.value })}
                          rows={3}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-[11px] leading-snug focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      ) : (
                        <span className="break-words uppercase [overflow-wrap:anywhere]">
                          {row.course}
                        </span>
                      )}
                    </td>
                    {(['initialDate', 'refresherDate'] as const).map(key => (
                      <td key={key} className="border border-gray-300 px-2 py-1 text-center align-top">
                        {isFormEditing ? (
                          <Input
                            value={row[key]}
                            onChange={event => updateCourse(row.id, { [key]: event.target.value })}
                            className="h-7 text-[11px]"
                          />
                        ) : (
                          <span>{row[key]}</span>
                        )}
                      </td>
                    ))}
                    {isFormEditing && (
                      <td className="border border-gray-300 px-1 py-1 text-center align-middle">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-red-500"
                          onClick={() => removeCourse(row.id)}
                          aria-label={`Remove course ${row.no}`}
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

          {isFormEditing && (
            <div className="border border-gray-400 border-t-0 px-2 py-2">
              <Button size="sm" variant="outline" onClick={addCourse}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Maintenance Course
              </Button>
            </div>
          )}

          {/* ---- Verification initiated by ---------------------------------- */}
          <div className="border border-gray-400 border-t-0 px-2 py-2">
            <p className="text-[11px] font-bold text-gray-900">Verification initiated by:</p>
            <div className="mt-1 grid grid-cols-1 md:grid-cols-4 gap-2">
              <div>
                <p className="text-[9px] uppercase text-gray-500">Name</p>
                {isFormEditing ? (
                  <Input
                    value={formData.initiatedByName}
                    onChange={event =>
                      setFormData(prev => ({ ...prev, initiatedByName: event.target.value }))
                    }
                    className="h-7 text-[11px]"
                  />
                ) : (
                  <p className="text-[11px] font-semibold uppercase text-gray-900 border-b border-dotted border-gray-400 min-h-[18px]">
                    {formData.initiatedByName || ''}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[9px] uppercase text-gray-500">Position</p>
                {isFormEditing ? (
                  <Input
                    value={formData.initiatedByPosition}
                    onChange={event =>
                      setFormData(prev => ({ ...prev, initiatedByPosition: event.target.value }))
                    }
                    className="h-7 text-[11px]"
                  />
                ) : (
                  <p className="text-[11px] font-semibold text-gray-900 border-b border-dotted border-gray-400 min-h-[18px]">
                    {formData.initiatedByPosition || ''}
                  </p>
                )}
              </div>
              <div className="md:col-span-2">
                <p className="text-[9px] uppercase text-gray-500">Signature</p>
                <div className="flex min-h-[18px] items-center border-b border-dotted border-gray-400">
                  {managerSignatureLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                  ) : managerSignatureImage?.hasSpecimen && managerSignatureImage.imageUrl ? (
                    managerSignatureImage.isPdf ? (
                      <object
                        data={managerSignatureImage.imageUrl}
                        type={managerSignatureImage.contentType || 'application/pdf'}
                        aria-label={`Signature specimen of ${formData.initiatedByName}`}
                        className="h-10 w-full"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={managerSignatureImage.imageUrl}
                        alt={`Signature of ${formData.initiatedByName}`}
                        className="h-10 max-w-full object-contain object-left"
                      />
                    )
                  ) : formData.initiatedBySignatureId ? (
                    <span className="text-[10px] italic text-gray-500">Signed electronically</span>
                  ) : null}
                </div>
                <p className="text-[9px] italic text-gray-500 mt-0.5">{formData.initiatedByRole}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase text-gray-500">Date</p>
                <p className="text-[11px] font-semibold text-gray-900 border-b border-dotted border-gray-400 min-h-[18px]">
                  {formData.initiatedByDate || ''}
                </p>
              </div>
            </div>
          </div>

          {/* ---- Asterisk rule + HR certification --------------------------- */}
          <div className="border border-gray-400 border-t-0 px-2 py-1 overflow-hidden">
            <p className="whitespace-nowrap text-[10px] tracking-tighter text-gray-500">
              {ASTERISK_RULE}
            </p>
          </div>

          <div className="border border-gray-400 border-t-0 px-2 py-2">
            <p className="text-[11px] font-bold text-gray-900">{HR_HEADING}</p>
            {isFormEditing ? (
              <Input
                value={formData.hrStatement}
                onChange={event =>
                  setFormData(prev => ({ ...prev, hrStatement: event.target.value }))
                }
                className="mt-1 h-8 text-[11px]"
              />
            ) : (
              <p className="mt-0.5 text-[11px] leading-relaxed text-gray-800">
                {formData.hrStatement}
              </p>
            )}

            <div className="mt-2 grid grid-cols-1 md:grid-cols-3 gap-2">
              <div>
                <p className="text-[9px] uppercase text-gray-500">Name</p>
                {isFormEditing ? (
                  <Input
                    value={formData.hrName}
                    onChange={event => setFormData(prev => ({ ...prev, hrName: event.target.value }))}
                    className="h-7 text-[11px]"
                  />
                ) : (
                  <p className="text-[11px] font-semibold text-gray-900 border-b border-dotted border-gray-400 min-h-[18px]">
                    {formData.hrName || ''}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[9px] uppercase text-gray-500">Signature</p>
                <p className="text-[11px] border-b border-dotted border-gray-400 min-h-[18px]">
                  {formData.hrSignatureId ? 'Digital signature recorded' : ''}
                </p>
                <p className="text-[9px] italic text-gray-500 mt-0.5">{formData.hrPosition}</p>
              </div>
              <div>
                <p className="text-[9px] uppercase text-gray-500">Date</p>
                {isFormEditing ? (
                  <Input
                    value={formData.hrDate}
                    onChange={event => setFormData(prev => ({ ...prev, hrDate: event.target.value }))}
                    className="h-7 text-[11px]"
                    placeholder="e.g. 27-Apr-26"
                  />
                ) : (
                  <p className="text-[11px] font-semibold text-gray-900 border-b border-dotted border-gray-400 min-h-[18px]">
                    {formData.hrDate || ''}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="border border-gray-400 border-t-0 px-2 py-1 overflow-hidden">
            <p className="whitespace-nowrap text-[10px] tracking-tighter text-gray-500">
              {ASTERISK_RULE}
            </p>
          </div>

          <SignatureBlock
            editable={false}
            formType={config.formType}
            instance={instance}
            rows={[]}
            includeWorkflowSteps
            showState={false}
            autoFillFromSession={false}
          />

        </CardContent>
      </Card>

      <FormWorkflowFooter
        formSubmissionId={formSubmissionId}
        approvalStatus={approvalStatus}
        ataRecordId={selectedATARecord?.id || ''}
        formNodeType={config.formType}
        canEdit={canEdit}
        canSubmit={canSubmit}
        hideSubmitButton
        saving={saving}
        onSubmit={() => void handleSubmitForApproval()}
        onStatusChange={() => {
          void loadFromBackend()
          void reloadInstance()
        }}
      />
    </div>
  )
}
