/**
 * DocumentWorkspace Component — AMENDED v16 (revised Table of Contents)
 *
 * WHAT CHANGED IN v16
 * -------------------
 * 1. REMOVED the two local copies of the Self Evaluation tree that used to live
 *    in this file (`FORM_TREE_STRUCTURE` and `TABLE_OF_CONTENTS_CATEGORIES`).
 *    They were two of the three independent definitions that kept drifting
 *    apart, which is exactly why sub-forms rendered under the wrong parent.
 *    The right panel and the header sub-form navigation now render from the
 *    single source of truth:
 *
 *        @/lib/self-evaluation/toc-structure
 *
 * 2. FIXED two corrupted template literals. The previous file had KaTeX markup
 *    accidentally pasted over two `${...}` expressions:
 *      - the numbered-badge className inside the direct-form list
 *      - the `subGroupKey` string built from category.id + subGroup.id
 *    Both are now plain, valid template literals again.
 *
 * 3. The right panel now renders the revised structure:
 *      - Five PROMOTED top-level items first (MNT-1325, LETTER OF CONFIRMATION,
 *        AMENDMENT REQUEST, 918, 918 A).
 *      - Then the five categories, each with arbitrarily deep nested children.
 *      - DOCUMENTATION keeps an OTHERS sub-group holding SB (MNT-1420A) and
 *        AD (MNT-1420B).
 *      - Controlled document numbers (MNT-1325, ENG-751, FAA, CAA, ...) render
 *        as a badge next to the label.
 *
 * 4. `getFormComponent` now resolves the seven new child form types by passing a
 *    `variant` into the existing form components, so no feature was dropped and
 *    no stored submission became unreachable.
 *
 * EVERYTHING ELSE FROM v15 IS PRESERVED
 * -------------------------------------
 * - "Capability & Workshop: Summary Matrix" clickable filter cards.
 * - Full ATA records table with all columns and status/authority badges.
 * - ATA detail view, form view with Form/Workflow/Audit History tabs.
 * - Role-driven permissions, shop scoping, create-ATA dialog, file uploads.
 */
'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  FileText, FolderTree, Shield, History, Plus, Pencil,
  ChevronLeft, Search, RefreshCw,
  Building2, X, UserPlus,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useAuth } from '@/lib/auth-context'
import { normalizeRole } from '@/lib/role-utils'
import type { FormNodeType, UserRole, ATARecordDto, ShopDto } from '@/lib/self-evaluation/types'
import { ApprovalStatus, getApprovalStatusLabel, getApprovalStatusColor, getRolePermissions } from '@/lib/self-evaluation/types'
import {
  getFormByType,
  getFormsByATARecord,
  getAuditLogsByEntity,
  getShops,
  getATARecordsByShop,
  getATARecordById,
  getFormSubmissionById,
} from '@/lib/self-evaluation/api'
import type { FormSubmissionResponse } from '@/lib/self-evaluation/api'
import {
  getFormLabel,
  findTocForm,
  findTocParent,
} from '@/lib/self-evaluation/toc-structure'
import ApprovalWorkflowActions from './ApprovalWorkflowActions'
import CreateATARecordDialog from './CreateATARecordDialog'
import AmendATARecordDialog, { isRecordAmendable } from './AmendATARecordDialog'
import DelegationManagementPanel from './DelegationManagementPanel'
import ApprovalActionSidebar from './ApprovalActionSidebar'
import RecordAccountabilityStamp from './RecordAccountabilityStamp'
import FileUploadPanel from './FileUploadPanel'
import { FormUploadStatusProvider } from './FormUploadStatusContext'
import { useAtaCreationPermission, useDelegatedATAAuthority } from '@/lib/self-evaluation/delegation-api'
import FolderToCSection from '@/components/workflow/FolderToCSection'
import WorkflowStepActions from '@/components/workflow/WorkflowStepActions'
import { useFormWorkflowInstance } from '@/lib/workflow/useFormWorkflowInstance'
import { useWorkflowActor } from '@/lib/workflow/useWorkflow'

// Form components
import CapabilitySelfEvaluationForm from './forms/CapabilitySelfEvaluationForm'
import TaskCardFetcher from './forms/TaskCardFetcher'
import PeriodicSelfAuditForm from './forms/PeriodicSelfAuditForm'
import RequestLetterForm from './forms/RequestLetterForm'
import TableOfContentForm from './forms/TableOfContentForm'
import Form918FAA from './forms/Form918FAA'
import Form918ACAA from './forms/Form918ACAA'
import SBForm from './forms/SBForm'
import ADForm from './forms/ADForm'
import ToolNeedAnalysisReportForm from './forms/ToolNeedAnalysisReportForm'
import SimilarTechnologyForm from './forms/SimilarTechnologyForm'
import AlternateToolsEquivalencyForm from './forms/AlternateToolsEquivalencyForm'
import InhouseManufacturedToolsForm from './forms/InhouseManufacturedToolsForm'
import RepairFacilityEvaluationForm from './forms/RepairFacilityEvaluationForm'
import CleaningFacilityEvaluationForm from './forms/CleaningFacilityEvaluationForm'
import EnvironmentalFacilityEvaluationForm from './forms/EnvironmentalFacilityEvaluationForm'
import ConsumablesListForm from './forms/ConsumablesListForm'
import AlternateConsumableForm from './forms/AlternateConsumableForm'
import ConfirmationLetterForm from './forms/ConfirmationLetterForm'

/**
 * AMENDED v17 — TRAINING DOCUMENT integration.
 *
 * The five TRAINING DOCUMENT nodes used to be routed to `GenericTrainingForm`,
 * which printed an invented 7-column employee table (Employee Name / ID /
 * Qualification / Training Date / Expiry Date / Certificate Ref / Remarks).
 * That table does not exist on any of the supplied hard copies, so the forms
 * "did not match the originals" and the dedicated replica components below were
 * never mounted at all.
 *
 * They are now wired to the hard-copy replicas:
 *   - TrainingVerificationForm   → scan "traning vervication creenshot"
 *   - InspectionProficiencyForm  → scan "inspaction profecence"  (MNT-1378)
 *   - CompetenceAssessmentForm   → scan "tech compltence assment" (MNT 3.14-020)
 *
 * All three read the identity block from `useATAAutoFill`, so Description, P/N,
 * Manufacturer, ATA, A/C, Self-Evaluation Date, CMM Rev Date, Rev. No,
 * Letter Ref. No, Shop Capability, Responsible Workshop and the approver details
 * are populated simultaneously across every required form the moment the ATA
 * Record is created.
 */
import TrainingVerificationForm from './forms/TrainingVerificationForm'
import InspectionProficiencyForm from './forms/InspectionProficiencyForm'
import CompetenceAssessmentForm from './forms/CompetenceAssessmentForm'
import SimilarTaskEvaluationForm from './forms/SimilarTaskEvaluationForm'
import SimpleTaskEvaluationForm from './forms/SimpleTaskEvaluationForm'

/**
 * Resolve a form type to its editor component.
 *
 * AMENDED v16: the seven new child form types of the revised tree are wired to
 * the existing components through a `variant` prop, so every node in
 * `toc-structure` is reachable and nothing was dropped.
 */
function getFormComponent(formType: FormNodeType): React.ReactNode {
  switch (formType) {
    // ---- Promoted top-level items -----------------------------------------
    case 'periodic_self_audit': return <PeriodicSelfAuditForm />
    case 'confirmation_letter': return <ConfirmationLetterForm />
    case 'request_letter': return <RequestLetterForm variant="request" />
    case '918_faa': return <Form918FAA />
    case '918a_caa': return <Form918ACAA />

    // ---- DOCUMENTATION ----------------------------------------------------
    case 'capability_self_evaluation': return <CapabilitySelfEvaluationForm />
    case 'task_card': return <TaskCardFetcher />
    case 'sb': return <SBForm />
    case 'ad': return <ADForm />

    // ---- TRAINING DOCUMENT ------------------------------------------------
    // MAINTENANCE AND GENERIC COURSES and its two TRAINING VERIFICATION
    // children are the same printed sheet with a different employee and a
    // different attached Authorization Certificate (none / MNT-922B / MNT-922C).
    case 'component_maintenance_training': return <TrainingVerificationForm variant="maintenance_generic" />
    case 'training_verification_inspection': return <TrainingVerificationForm variant="inspection" />
    case 'training_verification_technician': return <TrainingVerificationForm variant="technician" />
    // INSPECTION PROFICIENCY (FOR INSPECTION) — FORM MNT-1378, Rev. No 00.
    case 'inspector_proficiency': return <InspectionProficiencyForm />
    // COMPETENCY ASSESSMENT (FOR TECHNICIAN) — Form MNT 3.14-020, Rev. 5.
    case 'competency_assessment': return <CompetenceAssessmentForm />
    case 'similar_technology': return <SimilarTechnologyForm />
    case 'similar_task': return <SimilarTaskEvaluationForm />
    case 'simple_task': return <SimpleTaskEvaluationForm />

    // ---- TOOLS AND EQUIPMENT ---------------------------------------------
    case 'tna': return <ToolNeedAnalysisReportForm variant="tna" />
    case 'tool_need_analysis_report': return <ToolNeedAnalysisReportForm variant="full_report" />
    case 'alternate_tools_equivalency': return <AlternateToolsEquivalencyForm />
    case 'inhouse_manufactured_tools': return <InhouseManufacturedToolsForm variant="inhouse_manufactured_tools" />
    case 'tool_mfg_jic': return <InhouseManufacturedToolsForm variant="tool_mfg_jic" />
    case 'tool_risk_assessment': return <InhouseManufacturedToolsForm variant="tool_risk_assessment" />
    case 'tool_mfg_form_1554': return <InhouseManufacturedToolsForm variant="tool_mfg_form_1554" />

    // ---- FACILITY REQUIREMENT EVALUATION ---------------------------------
    case 'repair_facility_evaluation': return <RepairFacilityEvaluationForm />
    case 'cleaning_facility_evaluation': return <CleaningFacilityEvaluationForm />
    case 'environmental_facility_evaluation': return <EnvironmentalFacilityEvaluationForm />

    // ---- CONSUMABLES ------------------------------------------------------
    case 'list_of_consumables': return <ConsumablesListForm />
    case 'alternate_consumable_declaration': return <AlternateConsumableForm />

    // ---- Legacy: still reachable for previously stored submissions --------
    case 'table_of_content': return <TableOfContentForm />

    default: return null
  }
}

interface AuditLogEntry {
  id: string
  action: string
  performedBy: string
  details: string
  timestamp: string
}

/**
 * Read-only label/value pair used by the ATA Record Details grid.
 *
 * Layout contract:
 * - `min-w-0` / `max-w-full`: allows the field to shrink below its intrinsic
 *   content width, so a single unbroken string can never widen its grid track
 *   and push into the neighbouring columns (P/N, Self-Evaluation Date, ...).
 * - `break-words` + `[overflow-wrap:anywhere]`: forces long unbroken strings to
 *   wrap vertically onto multiple lines instead of expanding horizontally.
 * - No truncation: the complete original value always stays visible.
 */
function InfoField({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0 max-w-full space-y-0.5">
      <p className="min-w-0 break-words text-[10px] font-semibold uppercase tracking-wide text-gray-500 [overflow-wrap:anywhere]">{label}</p>
      <p title={value || undefined} className="min-w-0 max-w-full whitespace-pre-line break-words text-sm leading-relaxed text-gray-800 [overflow-wrap:anywhere]">{value || '\u2014'}</p>
    </div>
  )
}

// ===== Navigation State Type =====
type ViewState =
  | { view: 'dashboard' }
  | { view: 'ata_detail'; record: ATARecordDto }
  | { view: 'form'; record: ATARecordDto; formType: FormNodeType; readOnly?: boolean }

// ===== Summary Matrix Filter Type =====
type MatrixFilter =
  | { type: 'none' }
  | { type: 'capability'; value: string }
  | { type: 'workshop'; value: string }

const ASSIGNMENT_ROUTED_FORM_TYPES: ReadonlySet<FormNodeType> = new Set([
  'sb',
  'training_verification_inspection',
  'training_verification_technician',
  'inspector_proficiency',
  'competency_assessment',
])

const TNA_FORM_TYPES: ReadonlySet<FormNodeType> = new Set([
  'tna',
  'tool_need_analysis_report',
])

const AUTO_SKIPPED_TOOL_TYPES: ReadonlySet<FormNodeType> = new Set([
  'alternate_tools_equivalency',
  'inhouse_manufactured_tools',
  'tool_mfg_jic',
  'tool_mfg_form_1554',
])

function acquisitionCodeFromTnaJson(json?: string | null): number {
  if (!json) return 0
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>
    const items = Object.entries(parsed).find(([key, value]) =>
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

function isAcquisitionSkipped(formType: FormNodeType, acquisitionCode: number): boolean {
  if (!AUTO_SKIPPED_TOOL_TYPES.has(formType)) return false
  return acquisitionCode === 1 || (acquisitionCode === 2 && formType !== 'alternate_tools_equivalency')
}

function isTrainingBypassed(formType: FormNodeType, formDataJson?: string | null): boolean {
  if (formType !== 'simple_task' && formType !== 'similar_task') return false
  if (!formDataJson) return false
  try {
    const data = JSON.parse(formDataJson) as { trainingRequired?: boolean | string }
    return data.trainingRequired === false || data.trainingRequired === 'false'
  } catch {
    return false
  }
}

export default function DocumentWorkspace() {
  const {
    setSelectedShop, setSelectedComponent,
    setSelectedATARecord, setActiveFormType, refreshKey, triggerRefresh, requestFormEdit,
    revisionDraftKey,
    selectedATARecord,
  } = useSelfEvaluation()

  const { user } = useAuth()
  const workflowActor = useWorkflowActor(
    user
      ? {
          userId: user.userId,
          id: user.id,
          role: user.role,
          shopId: user.shopId == null ? null : String(user.shopId),
        }
      : null,
  )
  const userRole = normalizeRole(user?.role) as UserRole
  const permissions = getRolePermissions(userRole)
  const isUnrestrictedRole = userRole === 'admin' || userRole === 'director' || userRole === 'manager'

  // v20 Feature 1: record-creation permission = the caller's own role OR an active
  // delegation granted by a Shop Team Leader under high workload.
  const ataCreation = useAtaCreationPermission(user?.role ?? null, user)

  // v22 amendment: a LIVE delegation held by the signed-in user. While active it
  // extends the delegatee's permissions — Table of Contents visibility and
  // delegated-level workflow actions (edit + submit as the acting originator).
  // Stage confirmation/finalization is NOT delegated — that stays with the Shop TL.
  const delegatedAuthority = useDelegatedATAAuthority(user?.role ?? null, user)

  // v22: authorized editing = role permission OR an active delegation. The table and
  // detail Edit buttons are gated on this instead of the bare role check.
  const canAmendRecords = permissions.canEdit || delegatedAuthority.active

  // ===== Local State =====
  const [viewState, setViewState] = useState<ViewState>({ view: 'dashboard' })
  const isTnaForm = viewState.view === 'form' && TNA_FORM_TYPES.has(viewState.formType)
  const [shops, setShops] = useState<ShopDto[]>([])
  const [selectedShopId, setSelectedShopId] = useState<string>('')
  const [ataRecords, setAtaRecords] = useState<ATARecordDto[]>([])
  const [loadingShops, setLoadingShops] = useState(true)
  const [loadingRecords, setLoadingRecords] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Summary Matrix filter (single active filter at a time)
  const [matrixFilter, setMatrixFilter] = useState<MatrixFilter>({ type: 'none' })

  // Form-level state
  const [formSubmission, setFormSubmission] = useState<FormSubmissionResponse | null>(null)
  const [formApprovalStatus, setFormApprovalStatus] = useState<ApprovalStatus>(ApprovalStatus.Draft)
  const [formSubmissionLoading, setFormSubmissionLoading] = useState(true)
  const [acquisitionCode, setAcquisitionCode] = useState(0)
  const [ataDetailRefreshing, setAtaDetailRefreshing] = useState(false)
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [activeTab, setActiveTab] = useState<string>('form')
  const [isEditMode, setIsEditMode] = useState(false)
  const [uploadedFilesByForm, setUploadedFilesByForm] = useState<Record<string, boolean>>({})

  const assignmentWorkflowActive =
    viewState.view === 'form' && ASSIGNMENT_ROUTED_FORM_TYPES.has(viewState.formType)
  const assignmentWorkflow = useFormWorkflowInstance({
    formSubmissionId: formSubmission?.id,
    folderId: selectedATARecord?.evaluationFolderId,
  })

  // Dialog state
  const [showCreateATADialog, setShowCreateATADialog] = useState(false)
  const [showDelegationDialog, setShowDelegationDialog] = useState(false)
  const [amendRecord, setAmendRecord] = useState<ATARecordDto | null>(null)

  // Currently active/viewing form in the right panel
  const [activeRightPanelForm, setActiveRightPanelForm] = useState<FormNodeType | null>(null)

  useEffect(() => {
    const ataRecordId = selectedATARecord?.id
    if (!ataRecordId) {
      setAcquisitionCode(0)
      return
    }

    let cancelled = false
    void getFormsByATARecord(ataRecordId).then(forms => {
      if (cancelled) return
      const tnaWithRouting = forms
        .filter(form => TNA_FORM_TYPES.has(form.formType.trim().toLowerCase() as FormNodeType))
        .map(form => ({ form, code: acquisitionCodeFromTnaJson(form.formDataJson) }))
        .filter(entry => entry.code > 0)
        .sort((left, right) => right.form.updatedAt.localeCompare(left.form.updatedAt))[0]
      setAcquisitionCode(tnaWithRouting?.code ?? 0)
    }).catch(() => {
      if (!cancelled) setAcquisitionCode(0)
    })

    return () => { cancelled = true }
  }, [refreshKey, selectedATARecord?.id])

  const routingReadOnly =
    viewState.view === 'form' && isAcquisitionSkipped(viewState.formType, acquisitionCode)
  const trainingNotApplicable = viewState.view === 'form'
    && isTrainingBypassed(viewState.formType, formSubmission?.formDataJson)
  const trainingReadOnly = trainingNotApplicable
  const effectiveReadOnly = viewState.view === 'form'
    && (viewState.readOnly === true || routingReadOnly || trainingReadOnly)
  const activeFormUploadKey = viewState.view === 'form'
    ? `${viewState.record.id}:${viewState.formType}`
    : ''
  const hasUploadedFiles = !!uploadedFilesByForm[activeFormUploadKey]

  // ===== Computed Counts for Summary Matrix =====
  const matrixCounts = useMemo(() => {
    const counts = { ECAA: 0, FAA: 0, EASA: 0, Galley: 0, Electric: 0 }
    ataRecords.forEach(record => {
      const auth = (record.authority || '').toUpperCase()
      if (auth.includes('ECAA')) counts.ECAA++
      if (auth.includes('FAA')) counts.FAA++
      if (auth.includes('EASA')) counts.EASA++
      const ws = (record.responsibleWorkshop || '').toLowerCase()
      if (ws.includes('galley')) counts.Galley++
      if (ws.includes('electric')) counts.Electric++
    })
    return counts
  }, [ataRecords])

  // ===== Handle Matrix Filter Click =====
  const handleMatrixFilterClick = (type: 'capability' | 'workshop', value: string) => {
    setMatrixFilter(prev => {
      if (prev.type === type && prev.value === value) {
        return { type: 'none' }
      }
      return { type, value }
    })
  }

  // ===== Fetch Shops =====
  useEffect(() => {
    async function fetchShops() {
      setLoadingShops(true)
      try {
        const data = await getShops()

        if (!isUnrestrictedRole && user?.shopId) {
          const userShopId = String(user.shopId)
          const userShop = data.find(s => String(s.id) === userShopId)
          if (userShop) {
            setShops([userShop])
            setSelectedShopId(userShop.id)
          } else {
            const userShopName = user?.shopName || user?.shop_name || ''
            if (userShopName) {
              const matchedByName = data.find(s =>
                s.name.toLowerCase() === userShopName.toLowerCase()
              )
              if (matchedByName) {
                setShops([matchedByName])
                setSelectedShopId(matchedByName.id)
              } else {
                setShops(data)
              }
            } else {
              setShops(data)
            }
          }
        } else if (isUnrestrictedRole) {
          setShops(data)
          if (user?.shopId) {
            const userShopId = String(user.shopId)
            const matched = data.find(s => String(s.id) === userShopId)
            if (matched) {
              setSelectedShopId(matched.id)
            }
          } else if (data.length === 1) {
            setSelectedShopId(data[0].id)
          }
        } else {
          setShops(data)
          if (data.length === 1) {
            setSelectedShopId(data[0].id)
          }
        }
      } catch (err) {
        console.error('Failed to fetch shops:', err)
      } finally {
        setLoadingShops(false)
      }
    }
    fetchShops()
  }, [user, isUnrestrictedRole])

  // ===== Fetch ATA Records when shop changes =====
  useEffect(() => {
    if (!selectedShopId) {
      setAtaRecords([])
      return
    }
    async function fetchRecords() {
      setLoadingRecords(true)
      try {
        const records = await getATARecordsByShop(selectedShopId)
        setAtaRecords(records)
      } catch (err) {
        console.error('Failed to fetch ATA records:', err)
      } finally {
        setLoadingRecords(false)
      }
    }
    fetchRecords()
  }, [selectedShopId, refreshKey])

  const loadFormSubmission = useCallback(async (ataRecordId: string, formType: FormNodeType) => {
    setFormSubmissionLoading(true)
    try {
      const form = await getFormByType(ataRecordId, formType)
      if (form) {
        setFormSubmission(form)
        const localRevisionDraft = revisionDraftKey === `${ataRecordId}:${formType}`
        setFormApprovalStatus(localRevisionDraft ? ApprovalStatus.Draft : form.approvalStatus as ApprovalStatus)
      } else {
        setFormSubmission(null)
        setFormApprovalStatus(ApprovalStatus.Draft)
      }
    } catch {
      setFormSubmission(null)
      setFormApprovalStatus(ApprovalStatus.Draft)
    } finally {
      setFormSubmissionLoading(false)
    }
  }, [revisionDraftKey])

  // ===== Load form submission when viewing a form =====
  useEffect(() => {
    if (viewState.view === 'form') {
      setFormSubmission(null)
      loadFormSubmission(viewState.record.id, viewState.formType)
      setIsEditMode(false)
    } else {
      setFormSubmission(null)
      setFormApprovalStatus(ApprovalStatus.Draft)
      setFormSubmissionLoading(false)
      setIsEditMode(false)
    }
  }, [viewState, loadFormSubmission, refreshKey])

  const loadAuditLogs = async () => {
    if (!formSubmission?.id) return
    try {
      const logs = await getAuditLogsByEntity('FormSubmission', formSubmission.id)
      setAuditLogs(logs.map(l => ({
        id: l.id, action: l.action, performedBy: l.performedBy,
        details: l.details, timestamp: l.timestamp,
      })))
    } catch { setAuditLogs([]) }
  }

  const handleStatusChange = async (newStatus: ApprovalStatus) => {
    setFormApprovalStatus(newStatus)
    if (formSubmission) {
      setFormSubmission({ ...formSubmission, approvalStatus: newStatus as number })
    }

    triggerRefresh()

    if (viewState.view === 'form') {
      try {
        const refreshedRecord = await getATARecordById(viewState.record.id)
        if (refreshedRecord) {
          setSelectedATARecord(refreshedRecord)
          setViewState(current =>
            current.view === 'form'
              ? { ...current, record: refreshedRecord }
              : current,
          )
        }
      } catch {
        // The local form status remains visible if the record refresh is unavailable.
      }
    }
  }

  const handleWorkflowActionCompleted = async (response: {
    status: ApprovalStatus
  }) => {
    setFormApprovalStatus(response.status)
    await assignmentWorkflow.reload()
    if (viewState.view === 'form') {
      await loadFormSubmission(currentRecordIdForWorkflow(), viewState.formType)
    }
    triggerRefresh()
  }

  const currentRecordIdForWorkflow = () =>
    viewState.view === 'form' ? viewState.record.id : selectedATARecord?.id ?? ''

  const formRevisionDraft = viewState.view === 'form' &&
    revisionDraftKey === `${viewState.record.id}:${viewState.formType}`

  const handleEdit = useCallback(() => {
    setIsEditMode(true)
    setActiveTab('form')
    if (viewState.view === 'form') {
      setActiveFormType(viewState.formType)
    }
    requestFormEdit()
  }, [requestFormEdit, setActiveFormType, viewState])

  // ===== Navigation Handlers =====
  const navigateToATADetail = async (record: ATARecordDto) => {
    setAtaDetailRefreshing(true)
    let detailRecord = record
    try {
      detailRecord = await getATARecordById(record.id)
    } catch {
    }
    setViewState({ view: 'ata_detail', record: detailRecord })
    const shop = shops.find(s => s.id === selectedShopId)
    if (shop) setSelectedShop(shop)
    setSelectedATARecord({
      ...detailRecord,
      componentId: detailRecord.componentId || detailRecord.id,
    })
    setSelectedComponent({
      id: detailRecord.id,
      partNumber: detailRecord.partNumber,
      description: detailRecord.description,
      manufacturer: detailRecord.manufacturer,
      modelSeries: '',
      ataChapterId: detailRecord.ataChapterId || '',
      ataChapterNumber: detailRecord.ataChapterNumber || detailRecord.ataChapter || '',
      ataChapterTitle: detailRecord.ataChapterTitle || '',
      shopId: detailRecord.shopId || selectedShopId,
      isActive: true,
      createdAt: detailRecord.createdAt,
      updatedAt: detailRecord.updatedAt,
    })
    setActiveFormType(null)
    setActiveRightPanelForm(null)
  }

  const navigateToForm = (record: ATARecordDto, formType: FormNodeType, readOnly = false) => {
    setViewState({ view: 'form', record, formType, readOnly })
    setActiveFormType(formType)
    setActiveRightPanelForm(formType)
    // Ensure selectedATARecord is set so child form components can read ATA/P/N
    setSelectedATARecord({
      ...record,
      componentId: record.componentId || record.id,
    })
  }

  const openApprovalAction = async (row: {
    ataRecordId?: string | null
    formSubmissionId?: string | null
    formType: string
  }) => {
    try {
      let ataRecordId = row.ataRecordId ?? null
      if (!ataRecordId && row.formSubmissionId) {
        const submission = await getFormSubmissionById(row.formSubmissionId)
        ataRecordId = submission?.ataRecordId ?? null
      }
      if (!ataRecordId) {
        console.warn('Approval action has no ATA record or form submission link.', row)
        return
      }

      const record = await getATARecordById(ataRecordId)
      navigateToForm(record, row.formType as FormNodeType)
    } catch (error) {
      console.error('Failed to open approval action:', error)
    }
  }

  const navigateBack = () => {
    if (viewState.view === 'form') {
      void navigateToATADetail(viewState.record)
      setActiveFormType(null)
    } else {
      setViewState({ view: 'dashboard' })
      setSelectedComponent(null)
      setSelectedATARecord(null)
      setActiveFormType(null)
      setActiveRightPanelForm(null)
    }
  }

  // ===== Filtered Records =====
  const filteredRecords = ataRecords.filter(record => {
    const matchesSearch = searchQuery === '' ||
      record.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.partNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.manufacturer?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.ataChapter?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = statusFilter === 'all' ||
      String(record.approvalStatus) === statusFilter

    let matchesMatrix = true
    if (matrixFilter.type === 'capability') {
      matchesMatrix = (record.authority || '').toUpperCase().includes(matrixFilter.value.toUpperCase())
    } else if (matrixFilter.type === 'workshop') {
      matchesMatrix = (record.responsibleWorkshop || '').toLowerCase().includes(matrixFilter.value.toLowerCase())
    }

    return matchesSearch && matchesStatus && matchesMatrix
  })

  // ===== RENDER: Dashboard View (ATA Records Table) =====
  if (viewState.view === 'dashboard') {
    return (
      <div className="flex flex-1 overflow-hidden bg-gray-50/50">
        <ApprovalActionSidebar refreshKey={refreshKey} onOpen={openApprovalAction} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-white border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Self Evaluation Dashboard</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {!isUnrestrictedRole && user?.shopName
                  ? `Showing ATA Records for: ${user.shopName}`
                  : 'Manage ATA Records and their associated forms'
                }
              </p>
              {/* v22: delegated users are told their extended permissions are live —
                  Table of Contents visibility and delegated-level record actions. */}
              {delegatedAuthority.active && delegatedAuthority.delegation && (
                <p className="mt-1.5 inline-flex items-center rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                  Delegated authority from {delegatedAuthority.delegation.delegatedBy}
                  {' '}— Table of Contents and delegated record actions are enabled
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {permissions.canCreateATA && selectedShopId && (
                <Button
                  variant="outline"
                  onClick={() => setShowDelegationDialog(true)}
                  className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 shadow-md"
                  title="High workload? Delegate record creation to another authorized user"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Delegate
                </Button>
              )}
              {ataCreation.canCreate && selectedShopId && (
                <Button
                  onClick={() => setShowCreateATADialog(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                  title={
                    ataCreation.source === 'delegation'
                      ? 'You may create records through an active delegation from your Shop Team Leader'
                      : undefined
                  }
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create New ATA Record
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="px-6 py-3 bg-white border-b flex-shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Shop Selector */}
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              {isUnrestrictedRole ? (
                <Select value={selectedShopId} onValueChange={setSelectedShopId}>
                  <SelectTrigger className="w-[220px] h-9">
                    <SelectValue placeholder="Select Shop..." />
                  </SelectTrigger>
                  <SelectContent>
                    {shops.map(shop => (
                      <SelectItem key={shop.id} value={shop.id}>
                        {shop.name}
                        {user?.shopId && String(user.shopId) === String(shop.id) && ' (My Shop)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="flex items-center h-9 px-3 border rounded-md bg-gray-50 text-sm font-medium text-gray-700 min-w-[200px]">
                  <span>{shops.find(s => s.id === selectedShopId)?.name || user?.shopName || 'My Shop'}</span>
                </div>
              )}
            </div>

            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search P/N, description, manufacturer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>

            {/* Status Filter */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="0">Draft</SelectItem>
                <SelectItem value="1">Pending TL Review</SelectItem>
                <SelectItem value="2">Pending Manager</SelectItem>
                <SelectItem value="3">Pending Director</SelectItem>
                <SelectItem value="4">Pending QA</SelectItem>
                <SelectItem value="5">Approved</SelectItem>
                <SelectItem value="6">Rejected</SelectItem>
                <SelectItem value="7">Returned</SelectItem>
              </SelectContent>
            </Select>

            {/* Refresh */}
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={triggerRefresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>

            {/* Count */}
            <Badge variant="secondary" className="ml-auto">
              {filteredRecords.length} record{filteredRecords.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>

        {/* Capability AND Workshop: Summary Matrix */}
        <div className="px-6 py-3 bg-white border-b flex-shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide mr-2">
              Capability &amp; Workshop: Summary Matrix
            </h4>
            {/* Capability Cards */}
            {(['ECAA', 'FAA', 'EASA'] as const).map(cap => {
              const isActive = matrixFilter.type === 'capability' && matrixFilter.value === cap
              return (
                <button
                  key={cap}
                  onClick={() => handleMatrixFilterClick('capability', cap)}
                  className={cn(
                    "flex flex-col items-center px-4 py-2 rounded-lg border transition-all duration-150 min-w-[100px]",
                    isActive
                      ? "bg-emerald-50 border-emerald-400 shadow-md ring-2 ring-emerald-200"
                      : "bg-white border-gray-200 hover:bg-emerald-50/50 hover:border-emerald-300 hover:shadow-sm"
                  )}
                >
                  <span className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide",
                    isActive ? "text-emerald-800" : "text-gray-500"
                  )}>
                    {cap} Capability
                  </span>
                  <span className={cn(
                    "text-lg font-bold mt-0.5",
                    isActive ? "text-emerald-700" : "text-gray-800"
                  )}>
                    {matrixCounts[cap]}
                  </span>
                </button>
              )
            })}

            {/* Divider */}
            <div className="h-10 w-px bg-gray-200 mx-1" />

            {/* Workshop Cards */}
            {(['Galley', 'Electric'] as const).map(ws => {
              const isActive = matrixFilter.type === 'workshop' && matrixFilter.value === ws
              return (
                <button
                  key={ws}
                  onClick={() => handleMatrixFilterClick('workshop', ws)}
                  className={cn(
                    "flex flex-col items-center px-4 py-2 rounded-lg border transition-all duration-150 min-w-[100px]",
                    isActive
                      ? "bg-blue-50 border-blue-400 shadow-md ring-2 ring-blue-200"
                      : "bg-white border-gray-200 hover:bg-blue-50/50 hover:border-blue-300 hover:shadow-sm"
                  )}
                >
                  <span className={cn(
                    "text-[10px] font-semibold uppercase tracking-wide",
                    isActive ? "text-blue-800" : "text-gray-500"
                  )}>
                    {ws} Workshop
                  </span>
                  <span className={cn(
                    "text-lg font-bold mt-0.5",
                    isActive ? "text-blue-700" : "text-gray-800"
                  )}>
                    {matrixCounts[ws]}
                  </span>
                </button>
              )
            })}

            {/* Clear filter button */}
            {matrixFilter.type !== 'none' && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs text-gray-500 hover:text-red-500 ml-2"
                onClick={() => setMatrixFilter({ type: 'none' })}
              >
                <X className="h-3 w-3 mr-1" />
                Clear Filter
              </Button>
            )}
          </div>
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loadingShops || loadingRecords ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map(i => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !selectedShopId ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Select a Shop to view ATA Records</p>
                <p className="text-sm text-gray-400 mt-1">Choose your shop from the dropdown above</p>
              </div>
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <FolderTree className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No ATA Records Found</p>
                <p className="text-sm text-gray-400 mt-1">
                  {searchQuery || statusFilter !== 'all' || matrixFilter.type !== 'none'
                    ? 'Try adjusting your search or filters'
                    : 'Create your first ATA record to get started'}
                </p>
                {ataCreation.canCreate && !searchQuery && statusFilter === 'all' && matrixFilter.type === 'none' && (
                  <Button
                    onClick={() => setShowCreateATADialog(true)}
                    className="mt-4 bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create First ATA Record
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="font-semibold text-[10px] uppercase tracking-wider min-w-[50px]">Item</TableHead>
                      <TableHead className="font-semibold text-[10px] uppercase tracking-wider min-w-[180px]">DESCRIPTION</TableHead>
                      <TableHead className="font-semibold text-[10px] uppercase tracking-wider min-w-[110px]">P/N</TableHead>
                      <TableHead className="font-semibold text-[10px] uppercase tracking-wider min-w-[60px]">ATA</TableHead>
                      <TableHead className="font-semibold text-[10px] uppercase tracking-wider min-w-[80px]">CMM REV. No</TableHead>
                      <TableHead className="font-semibold text-[10px] uppercase tracking-wider min-w-[100px]">CMM REV DATE</TableHead>
                      <TableHead className="font-semibold text-[10px] uppercase tracking-wider min-w-[120px]">MANUFACTURER</TableHead>
                      <TableHead className="font-semibold text-[10px] uppercase tracking-wider min-w-[80px]">A/C</TableHead>
                      <TableHead className="font-semibold text-[10px] uppercase tracking-wider min-w-[120px]">Shop Capability</TableHead>
                      <TableHead className="font-semibold text-[10px] uppercase tracking-wider min-w-[130px]">SELF EVALUATION DATE</TableHead>
                      <TableHead className="font-semibold text-[10px] uppercase tracking-wider min-w-[130px]">Responsible Workshop</TableHead>
                      <TableHead className="font-semibold text-[10px] uppercase tracking-wider min-w-[100px]">STATUS</TableHead>
                      <TableHead className="font-semibold text-[10px] uppercase tracking-wider min-w-[120px] text-right">ACTIONS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords.map((record, index) => (
                      <TableRow
                        key={record.id}
                        className="cursor-pointer hover:bg-emerald-50/50 transition-colors"
                        onClick={() => navigateToATADetail(record)}
                      >
                        <TableCell className="text-xs font-medium text-gray-500">
                          {index + 1}
                        </TableCell>
                        <TableCell
                          title={record.description}
                          className="min-w-[180px] max-w-[240px] align-top break-words text-xs font-medium text-gray-800 [overflow-wrap:anywhere]"
                        >
                          {record.description}
                        </TableCell>
                        <TableCell className="min-w-[110px] max-w-[160px] align-top break-words font-mono text-xs font-medium text-emerald-700 [overflow-wrap:anywhere]">
                          {record.partNumber}
                        </TableCell>
                        <TableCell className="text-xs text-gray-700 font-medium">
                          {record.ataChapter || record.ataChapterNumber || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600">
                          {record.revNo || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600">
                          {record.cmmRevDate || '—'}
                        </TableCell>
                        <TableCell className="min-w-[120px] max-w-[160px] align-top break-words text-xs text-gray-600 [overflow-wrap:anywhere]">
                          {record.manufacturer || '—'}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600">
                          {record.aircraft || '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {record.authority ? (
                            <div className="flex flex-wrap gap-1">
                              {record.authority.split(',').map((auth, i) => (
                                <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-50 border-emerald-200 text-emerald-700">
                                  {auth.trim()}
                                </Badge>
                              ))}
                            </div>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-gray-600">
                          {record.selfEvaluationDate
                            ? new Date(record.selfEvaluationDate).toLocaleDateString()
                            : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {record.responsibleWorkshop ? (
                            <div className="flex flex-wrap gap-1">
                              {record.responsibleWorkshop.split(',').map((ws, i) => (
                                <Badge key={i} variant="outline" className="text-[9px] px-1.5 py-0 bg-blue-50 border-blue-200 text-blue-700">
                                  {ws.trim()}
                                </Badge>
                              ))}
                            </div>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-[10px] ${getApprovalStatusColor(record.approvalStatus)}`}>
                            {getApprovalStatusLabel(record.approvalStatus)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                            {/* v22: the ATA View button was removed — the row itself opens
                                the detail view. Edit remains, also enabled for delegated
                                users and validated against the amendment window. */}
                            {canAmendRecords && isRecordAmendable(record.approvalStatus) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-blue-600 hover:text-blue-700"
                                title="Amend record fields prior to final submission"
                                onClick={(e) => { e.stopPropagation(); setAmendRecord(record) }}
                              >
                                <Pencil className="h-3 w-3 mr-1" />
                                Edit
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        {/* Role Info Footer */}
        <div className="px-6 py-2 bg-white border-t flex-shrink-0">
          <p className="text-xs text-gray-500">
            <strong>Role:</strong> {user?.roleDisplayName || userRole.replace(/_/g, ' ')}
            {user?.shopName && ` | Shop: ${user.shopName}`}
            {permissions.canCreateATA && ' • Can create ATA records'}
            {permissions.canApprove && ' • Can approve'}
            {permissions.canEdit && ' • Can edit'}
          </p>
        </div>

        {/* Create ATA Dialog */}
        {showCreateATADialog && selectedShopId && (
          <CreateATARecordDialog
            open={showCreateATADialog}
            onClose={() => setShowCreateATADialog(false)}
            shopId={selectedShopId}
          />
        )}

        {/* v20 Feature 1: workload delegation dialog */}
        {showDelegationDialog && (
          <DelegationManagementPanel
            open={showDelegationDialog}
            onClose={() => setShowDelegationDialog(false)}
            shopId={selectedShopId}
          />
        )}

        {/* v20 Feature 3: amend record fields prior to final submission */}
        {amendRecord && (
          <AmendATARecordDialog
            open={!!amendRecord}
            record={amendRecord}
            onClose={() => setAmendRecord(null)}
            onSaved={() => {
              setAmendRecord(null)
              triggerRefresh()
            }}
          />
        )}
        </div>
      </div>
    )
  }

  // ===== RENDER: ATA Record Detail View OR Form View with PERSISTENT Right Panel =====
  const currentRecord = viewState.record
  if (!currentRecord) return null

  const shop = shops.find(s => s.id === selectedShopId)

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header with Back Button */}
      <div className="px-5 py-3 bg-white border-b flex-shrink-0">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={navigateBack}
            className="text-gray-600 hover:text-gray-900"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {viewState.view === 'form' ? `Back to ${currentRecord.partNumber}` : 'Back to ATA Records'}
          </Button>
          <div className="h-4 w-px bg-gray-300" />
          <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
            <span className="font-medium text-emerald-700">{shop?.name}</span>
            <span className="text-gray-300">/</span>
            <span className="font-medium text-purple-700">P/N: {currentRecord.partNumber}</span>
            {viewState.view === 'form' && (
              <>
                <span className="text-gray-300">/</span>
                <span className="font-medium text-blue-700">{getFormLabel(viewState.formType)}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-2">
          <h2 className="text-lg font-bold text-gray-900">
            {viewState.view === 'form' ? getFormLabel(viewState.formType) : currentRecord.description}
          </h2>
          <div className="flex items-center gap-2">
            {viewState.view === 'form' && isEditMode && (
              <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                <Pencil className="h-3 w-3 mr-1" />Editing
              </Badge>
            )}
            <Badge className={getApprovalStatusColor(
                viewState.view === 'form' && formSubmissionLoading
                ? ApprovalStatus.Draft
                : viewState.view === 'form' ? formApprovalStatus : currentRecord.approvalStatus
            )}>
                {viewState.view === 'form' && formSubmissionLoading
                ? 'Loading workflow status...'
                  : viewState.view === 'ata_detail'
                    && ataDetailRefreshing
                    && currentRecord.approvalStatus !== ApprovalStatus.Approved
                    ? 'Loading workflow status...'
                : getApprovalStatusLabel(
                    viewState.view === 'form' ? formApprovalStatus : currentRecord.approvalStatus
                  )}
            </Badge>
          </div>
        </div>

        {/* Sub-form navigation, driven by toc-structure */}
        {viewState.view === 'form' && (() => {
          const currentFormNode = findTocForm(viewState.formType)
          const parentFormNode = findTocParent(viewState.formType)

          return (
            <>
              {currentFormNode?.children && (
                <div className="flex items-center gap-2 mt-3 pt-2 border-t flex-wrap">
                  <span className="text-xs text-gray-500 font-medium">Sub-forms:</span>
                  {currentFormNode.children.map(child => {
                    const ChildIcon = child.Icon
                    return (
                      <Button
                        key={child.id}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => navigateToForm(currentRecord, child.formType)}
                      >
                        <ChildIcon className={cn('h-3.5 w-3.5', child.iconClass)} />
                        <span className="ml-1.5">{child.label}</span>
                        {child.formNo && (
                          <Badge variant="outline" className="ml-1.5 text-[8px] px-1 py-0">
                            {child.formNo}
                          </Badge>
                        )}
                      </Button>
                    )
                  })}
                </div>
              )}
              {parentFormNode && (
                <div className="flex items-center gap-2 mt-3 pt-2 border-t flex-wrap">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-gray-500"
                    onClick={() => navigateToForm(currentRecord, parentFormNode.formType)}
                  >
                    <ChevronLeft className="h-3 w-3 mr-1" />
                    Back to {parentFormNode.label}
                  </Button>
                  {parentFormNode.children?.filter(c => c.formType !== viewState.formType).map(sibling => {
                    const SiblingIcon = sibling.Icon
                    return (
                      <Button
                        key={sibling.id}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => navigateToForm(currentRecord, sibling.formType)}
                      >
                        <SiblingIcon className={cn('h-3.5 w-3.5', sibling.iconClass)} />
                        <span className="ml-1.5">{sibling.label}</span>
                      </Button>
                    )
                  })}
                </div>
              )}
            </>
          )
        })()}
      </div>

      {/* Content Area - Split Layout with ALWAYS VISIBLE Right Panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Main Content */}
        <div className="flex-1 min-w-0 overflow-y-auto bg-gray-50/30 w-full">
          {viewState.view === 'ata_detail' ? (
            /* ===== ATA Detail Content ===== */
            <div className="p-5">
              <div className="space-y-5">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-600" />
                    ATA Record Details
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-4 items-start">
                    <InfoField label="DESCRIPTION" value={currentRecord.description} />
                    <InfoField label="P/N" value={currentRecord.partNumber} />
                    <InfoField label="SELF-EVALUATION DATE" value={currentRecord.selfEvaluationDate ? new Date(currentRecord.selfEvaluationDate).toLocaleDateString() : undefined} />
                    <InfoField label="MANUFACTURER" value={currentRecord.manufacturer} />
                    <InfoField label="ATA" value={currentRecord.ataChapter || currentRecord.ataChapterNumber} />
                    <InfoField label="CMM REV DATE" value={currentRecord.cmmRevDate} />
                    <InfoField label="CMM REV. No" value={currentRecord.revNo} />
                    <InfoField label="A/C" value={currentRecord.aircraft} />
                    <InfoField label="SHOP CAPABILITY" value={currentRecord.authority} />
                    <InfoField label="RESPONSIBLE WORKSHOP" value={currentRecord.responsibleWorkshop} />
                    <InfoField label="Letter Ref: No" value={currentRecord.letterRefNo} />
                    <InfoField label="SHOP" value={currentRecord.shop || shop?.name} />
                  </div>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                  <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-blue-600" />
                    ATA Record Workflow
                  </h3>
                  <ApprovalWorkflowActions
                    entityType="ata_record"
                    entityId={currentRecord.id}
                    currentStatus={currentRecord.approvalStatus}
                    statusLoading={ataDetailRefreshing}
                    onStatusChange={(newStatus) => {
                      const updatedRecord = { ...currentRecord, approvalStatus: newStatus }
                      setViewState({ view: 'ata_detail', record: updatedRecord })
                      setAtaDetailRefreshing(false)
                    }}
                    rejectionReason={currentRecord.rejectionReason}
                    onEdit={() => setAmendRecord(currentRecord)}
                    onRevisionStarted={(refreshedRecord) => {
                      setViewState({ view: 'ata_detail', record: refreshedRecord })
                      setAmendRecord(refreshedRecord)
                    }}
                  />
                </div>

                {/* v22: the purple Table of Contents informational banner was removed.
                    The live ToC panel on the right stays the single navigation surface. */}

                {/* v26 REMOVED: the Attachments / Upload panel and its
                    "No files attached yet. Click Upload to add files."
                    empty-state box are completely gone from the ATA Record
                    Workflow view. File uploads remain available in the form tab. */}

                {/* v20 Features 2 & 3: permanent accountability watermark + amendment/approval log */}
                <RecordAccountabilityStamp record={currentRecord} />
              </div>
            </div>
          ) : (
            /* ===== Form View Content ===== */
            <div className="h-full flex flex-col">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
                <div className="px-5 pt-2 border-b bg-white flex-shrink-0">
                  <TabsList className="h-9">
                    <TabsTrigger value="form" className="text-xs gap-1.5 px-4">
                      <FileText className="h-3.5 w-3.5" />Form
                    </TabsTrigger>
                    <TabsTrigger value="workflow" className="text-xs gap-1.5 px-4">
                      <Shield className="h-3.5 w-3.5" />Workflow
                    </TabsTrigger>
                    <TabsTrigger value="history" className="text-xs gap-1.5 px-4" onClick={loadAuditLogs}>
                      <History className="h-3.5 w-3.5" />Audit History
                    </TabsTrigger>
                  </TabsList>
                </div>

                {/* Form Tab */}
                <TabsContent value="form" className="flex-1 overflow-y-auto p-4 mt-0">
                  <div className="space-y-4">
                    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 w-full">
                      {effectiveReadOnly ? (
                        <div className="rounded-md border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                          {trainingNotApplicable
                            ? 'N/A — Training is not required for this task.'
                            : 'This form was skipped by the current routing decision. No data or workflow actions are available.'}
                        </div>
                      ) : (
                        <FormUploadStatusProvider
                          value={hasFiles => setUploadedFilesByForm(previous => ({
                            ...previous,
                            [activeFormUploadKey]: hasFiles,
                          }))}
                        >
                          {hasUploadedFiles ? (
                            <FileUploadPanel
                              ataRecordId={viewState.record.id}
                              formSubmissionId={formSubmission?.id}
                              formNodeType={viewState.formType}
                              canUpload={canAmendRecords}
                              canApproveFiles={false}
                            />
                          ) : getFormComponent(viewState.formType)}
                        </FormUploadStatusProvider>
                      )}
                    </div>

                      {effectiveReadOnly ? null : formSubmissionLoading ? (
                      <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
                        Loading workflow status...
                      </div>
                    ) : assignmentWorkflowActive ? (
                      <WorkflowStepActions
                        instance={assignmentWorkflow.instance}
                        actor={workflowActor.actor}
                        onActionCompleted={handleWorkflowActionCompleted}
                        onEdit={handleEdit}
                      />
                    ) : formSubmission && !isTnaForm ? (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                        <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Approval Actions</h4>
                        <ApprovalWorkflowActions
                          entityType="form"
                          entityId={formSubmission.id}
                          currentStatus={formApprovalStatus}
                          onStatusChange={handleStatusChange}
                          rejectionReason={formSubmission.rejectionReason}
                          reviewComments={formSubmission.reviewComments}
                          formRevisionDraft={formRevisionDraft}
                          onEdit={handleEdit}
                        />
                      </div>
                    ) : isTnaForm ? null : (
                      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 mb-3">
                          <p className="text-xs text-amber-700">
                            This form has not been saved yet. Save the form above to create its workflow submission.
                          </p>
                        </div>
                      </div>
                    )}

                  </div>
                </TabsContent>

                {/* Workflow Tab */}
                <TabsContent value="workflow" className="flex-1 overflow-y-auto p-5 mt-0">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <Shield className="h-4 w-4 text-blue-600" />
                      Form Approval Workflow
                    </h3>
                    <p className="text-xs text-gray-500 mb-4">
                      Manage the approval workflow for <strong>{getFormLabel(viewState.formType)}</strong>.
                    </p>
                    {effectiveReadOnly ? (
                      <div className="rounded-md border border-gray-200 bg-gray-50 p-6 text-sm text-gray-500">
                        {trainingNotApplicable
                          ? 'N/A — Training is not required for this task.'
                          : 'This form was skipped by the current routing decision. No workflow actions are available.'}
                      </div>
                    ) : formSubmissionLoading ? (
                      <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
                        Loading workflow status...
                      </div>
                    ) : assignmentWorkflowActive ? (
                      <WorkflowStepActions
                        instance={assignmentWorkflow.instance}
                        actor={workflowActor.actor}
                        onActionCompleted={handleWorkflowActionCompleted}
                        onEdit={handleEdit}
                      />
                    ) : formSubmission && !isTnaForm ? (
                      <ApprovalWorkflowActions
                        entityType="form"
                        entityId={formSubmission.id}
                        currentStatus={formApprovalStatus}
                        onStatusChange={handleStatusChange}
                        rejectionReason={formSubmission.rejectionReason}
                        reviewComments={formSubmission.reviewComments}
                        formRevisionDraft={formRevisionDraft}
                        onEdit={handleEdit}
                      />
                    ) : isTnaForm ? null : (
                      <div className="space-y-4">
                        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                          <p className="text-xs text-amber-700">
                            <strong>No submission yet.</strong> Please fill in the form first, then submit it for approval.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* Audit History Tab */}
                <TabsContent value="history" className="flex-1 overflow-y-auto p-5 mt-0">
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                      <History className="h-4 w-4 text-blue-600" />
                      Workflow Audit History
                    </h3>
                    {auditLogs.length === 0 ? (
                      <div className="text-center py-8">
                        <History className="h-8 w-8 text-gray-200 mx-auto mb-2" />
                        <p className="text-xs text-gray-400">No audit history available.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {auditLogs.map(log => (
                          <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100 text-xs">
                            <Shield className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-gray-800">{log.action}</span>
                                <span className="text-gray-400 flex-shrink-0">{new Date(log.timestamp).toLocaleString()}</span>
                              </div>
                              <p className="text-gray-600 mt-0.5">By: {log.performedBy}</p>
                              {log.details && <p className="text-gray-500 mt-0.5">{log.details}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>

        {/* ===== RIGHT PANEL: the single live Table of Contents ===== */}
        {/* v18: the outer "Table of Contents / Self Evaluation" header was removed. The live
            panel below already owns that title, its counters and its "Not provisioned" badge,
            so the section used to be rendered twice. One title, one list, no duplication. */}
        <div className="w-[340px] bg-white border-l border-gray-200 flex flex-col flex-shrink-0 overflow-hidden shadow-sm">
          {/* Panel Content */}
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-3">
              {/* Currently viewing indicator */}
              {activeRightPanelForm && (
                <div className="p-2.5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200/60">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-blue-500 animate-pulse flex-shrink-0" />
                    <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Currently Viewing</p>
                  </div>
                  <p className="text-[11px] font-medium text-blue-800 mt-0.5 ml-4">{getFormLabel(activeRightPanelForm)}</p>
                </div>
              )}

              {/* ===== v18 §2.4: the SINGLE live Table of Contents ===== */}
              {/* The static duplicate tree was removed after one iteration confirmed the
                  printed order identical. FolderToCSection (folder progress + live ToC with
                  per-section counters, search, "only what is waiting for me", printed
                  signature-line captions and the server-gated Start button) is now the only
                  implementation in this panel. */}
              <FolderToCSection
                record={selectedATARecord}
                activeFormType={activeRightPanelForm}
                onOpenForm={(formType, instanceId, readOnly) => {
                  // v18 fix: open the form in the MAIN content area, exactly like the
                  // removed static tree did. navigateToForm switches viewState to
                  // 'form', sets activeFormType/activeRightPanelForm and guarantees
                  // selectedATARecord is populated for the child form components.
                  navigateToForm(currentRecord, formType as FormNodeType, readOnly)
                  // instanceId is null for a form that has not been started yet.
                  void instanceId
                }}
              />
            </div>
          </ScrollArea>

          {/* Panel Footer */}
          <div className="px-3 py-2 border-t border-gray-100 flex-shrink-0 bg-gray-50/50">
            <p className="text-[9px] text-gray-400 text-center font-medium">
              Click any form to open • Active form highlighted in blue
            </p>
          </div>
        </div>
      </div>

      {/* v22: the detail view hosts the amendment dialog too, so the workflow bar's
          Edit action (role- or delegation-gated) opens the authorized amend flow.
          After a save the record is re-fetched so the creator/editor watermark on the
          Record stamp reflects the amendment IMMEDIATELY — no navigation needed. */}
      {amendRecord && (
        <AmendATARecordDialog
          open={!!amendRecord}
          record={amendRecord}
          onClose={() => setAmendRecord(null)}
          onSaved={async () => {
            const amendedId = amendRecord?.id
            setAmendRecord(null)
            triggerRefresh()
            if (!amendedId) return
            try {
              const fresh = await getATARecordById(amendedId)
              if (fresh) {
                setViewState({ view: 'ata_detail', record: fresh })
                setSelectedATARecord({
                  ...fresh,
                  componentId: fresh.componentId || fresh.id,
                })
              }
            } catch {
              /* keep the current snapshot; the list refresh still ran */
            }
          }}
        />
      )}
    </div>
  )
}
