/**
 * Self Evaluation API service layer - FULLY AMENDED v7
 * Complete API integration connecting forms to backend save/load
 * 
 * KEY FIXES:
 * v2: createATARecord now sends `null` instead of empty string ""
 *     for ataChapterId and componentId.
 * v3: getATARecordsByShop properly maps backend response fields
 *     (ATAChapterCode, ATAChapterNumber, ATAChapterTitle, ShopName)
 *     to frontend ATARecordDto fields so the HierarchyTree can group
 *     and display records correctly after creation.
 * v4: Added EASA, Authority, ResponsibleWorkshop fields to createATARecord
 *     and normalizeATARecord. Removed manual shop field from creation payload.
 *     ECAAShop and FAAShop kept for backward compatibility.
 * v5: Authority and ResponsibleWorkshop are now the PRIMARY fields.
 *     They are comma-separated strings supporting multiple selections.
 *     The backend model, command, and DTO all include these fields.
 *     ECAAShop/FAAShop are legacy and no longer used for display.
 * v6: Added CMM External System Integration.
 *     - fetchCMMRevision() calls /api/self-evaluation/cmm-proxy
 *     - Backend auto-logs into http://svhqmcweb02:1500/Login.aspx
 *     - Searches by ATA No or Mfg Part No
 *     - Navigates to Index Details page
 *     - Finds CMM entry in Manual Attachments table
 *     - Returns PDF link and revision number
 * v7: Added storeCMMData() function for persisting CMM data to ATARecord.
 *     - Calls POST /api/self-evaluation/ata-records/{id}/store-cmm
 *     - Stores revNo, cmmRevDate, cmmPdfUrl to the ATARecord
 *     - Data persists per part number until explicitly refreshed
 *     - Added cmmPdfUrl to normalizeATARecord mapping
 * 
 * Backend Controller Route Mapping:
 * - ShopController:                  api/self-evaluation/Shop
 * - ComponentController:             api/self-evaluation/Component
 * - ATARecordController:             api/self-evaluation/ata-records
 * - CapabilityAssessmentController:  api/self-evaluation/CapabilityAssessment
 * - TechnicalDataController:         api/self-evaluation/TechnicalData
 * - WorkflowController:              api/self-evaluation/Workflow
 * - SelfAuditController:             api/self-evaluation/SelfAudit
 * - EmployeeProficiencyController:   api/self-evaluation/EmployeeProficiency
 * - FormSubmissionController:        api/self-evaluation/forms
 * - FileAttachmentController:        api/self-evaluation/files
 * - CMMProxyController:              api/self-evaluation/cmm-proxy
 */

import type {
  ShopDto,
  ATAChapterDto,
  ComponentDto,
  CapabilityAssessmentDto,
  AirworthinessDirectiveDto,
  ServiceBulletinDto,
  ToolNeedsAnalysisDto,
  SelfAuditChecklistDto,
  WorkflowAuditLogDto,
  EmployeeProficiencyDto,
  ResponsibilityDelegationDto,
  ShopDashboardSummaryDto,
  ATARecordDto,
  FormNodeType,
} from './types'
import { ApprovalStatus, CapabilityStatus, AuditStatus, ComplianceStatus } from './types'
import { secureAuthStore } from '@/lib/secure-auth-store'
// AMENDED v8: role display names live in the shared role utility so the API
// layer, the sidebar and the admin panel all label roles identically.
import { getRoleDisplayName } from '@/lib/role-utils'

const API_BASE_URL = '/api'
const SE_API_PREFIX = `${API_BASE_URL}/self-evaluation`

/**
 * Typed API error for the self-evaluation endpoints. Carries the HTTP status
 * and, when the server sends a structured denial body, the `code` so callers
 * can branch on it. Exported because components import it for `instanceof`
 * checks (always guarded with `typeof ApiError === 'function'` for module-graph
 * safety).
 */
export class ApiError extends Error {
  code: string | null
  status: number
  constructor(message: string, status = 0, code: string | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

async function apiRequest<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }
  const token = secureAuthStore.getToken()
  if (
    token &&
    token !== 'cookie-session' &&
    token !== 'null' &&
    token !== 'undefined' &&
    !headers.Authorization &&
    !headers.authorization
  ) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  })

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '')
    // Surface a structured denial body ({ code, message }) when present;
    // otherwise fall back to the raw text or the HTTP status.
    let code: string | null = null
    let message = errorBody || `HTTP ${response.status}`
    if (errorBody) {
      try {
        const parsed = JSON.parse(errorBody) as { code?: string; message?: string }
        if (parsed && typeof parsed === 'object') {
          if (parsed.code) code = parsed.code
          if (parsed.message) message = parsed.message
        }
      } catch {
        /* not JSON — keep the raw text as the message */
      }
    }
    throw new ApiError(message, response.status, code)
  }

  if (response.status === 204) return undefined as unknown as T
  return response.json()
}

function extractArray<T>(response: unknown): T[] {
  if (!response) return []
  if (Array.isArray(response)) return response
  if (typeof response === 'object' && response !== null) {
    const obj = response as Record<string, unknown>
    if (Array.isArray(obj.data)) return obj.data as T[]
    if (Array.isArray(obj.payload)) return obj.payload as T[]
    if (Array.isArray(obj.$values)) return obj.$values as T[]
  }
  return []
}

// ===== Shop APIs =====
export async function getShops(_activeOnly?: boolean): Promise<ShopDto[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/shops`)
  return extractArray<ShopDto>(response)
}

export async function getShopById(id: string): Promise<ShopDto | null> {
  return apiRequest<ShopDto>(`${SE_API_PREFIX}/Shop/${id}`)
}

export async function getShopDashboard(shopId: string): Promise<ShopDashboardSummaryDto> {
  return apiRequest<ShopDashboardSummaryDto>(`${SE_API_PREFIX}/Shop/${shopId}/dashboard`)
}

export async function createShop(data: Partial<ShopDto>): Promise<ShopDto> {
  return apiRequest<ShopDto>(`${SE_API_PREFIX}/shops`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateShop(id: string, data: Partial<ShopDto>): Promise<ShopDto> {
  return apiRequest<ShopDto>(`${SE_API_PREFIX}/Shop/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteShop(id: string): Promise<void> {
  await apiRequest<void>(`${SE_API_PREFIX}/Shop/${id}`, {
    method: 'DELETE',
  })
}

// ===== Component APIs =====
export async function getComponentsByShop(shopId: string): Promise<ComponentDto[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/Component/shop/${shopId}`)
  return extractArray<ComponentDto>(response)
}

export async function getComponentsByATAChapter(ataChapterId: string): Promise<ComponentDto[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/Component/ata-chapter/${ataChapterId}`)
  return extractArray<ComponentDto>(response)
}

export async function getComponentById(id: string): Promise<ComponentDto | null> {
  return apiRequest<ComponentDto>(`${SE_API_PREFIX}/Component/${id}`)
}

export async function createComponent(data: {
  partNumber: string
  description: string
  manufacturer: string
  modelSeries: string
  ataChapterId: string
  shopId: string
}): Promise<ComponentDto> {
  return apiRequest<ComponentDto>(`${SE_API_PREFIX}/Component`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateComponent(id: string, data: Partial<ComponentDto>): Promise<ComponentDto> {
  return apiRequest<ComponentDto>(`${SE_API_PREFIX}/Component/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteComponent(id: string): Promise<void> {
  await apiRequest<void>(`${SE_API_PREFIX}/Component/${id}`, {
    method: 'DELETE',
  })
}

// ===== ATA Record APIs =====

/**
 * AMENDED v7: Normalizes backend response fields to match frontend ATARecordDto.
 * The backend returns PascalCase fields (ATAChapterCode, ATAChapterNumber, etc.)
 * which need to be mapped to the frontend's camelCase/flat structure.
 * Now includes Authority, ResponsibleWorkshop, and CMMPdfUrl as fields.
 */
function normalizeATARecord(raw: Record<string, any>): ATARecordDto {
  const rawFormSubmissions = raw.formSubmissions ?? raw.FormSubmissions ?? []

  return {
    id: raw.id || raw.Id || '',
    description: raw.description || raw.Description || '',
    partNumber: raw.partNumber || raw.PartNumber || '',
    selfEvaluationDate: raw.selfEvaluationDate || raw.SelfEvaluationDate || '',
    manufacturer: raw.manufacturer || raw.Manufacturer || '',
    // Map ATAChapterCode (backend) to ataChapter (frontend)
    ataChapter: raw.ataChapter || raw.ataChapterCode || raw.ATAChapterCode || raw.ATAChapter || '',
    ataChapterCode: raw.ataChapterCode || raw.ATAChapterCode || raw.ataChapter || '',
    cmmRevDate: raw.cmmRevDate || raw.CMMRevDate || raw.cmmRevdate || '',
    revNo: raw.revNo || raw.RevNo || '',
    // AMENDED v7: Map CMMPdfUrl from backend
    cmmPdfUrl: raw.cmmPdfUrl || raw.CMMPdfUrl || raw.cmmPdfurl || '',
    aircraft: raw.aircraft || raw.Aircraft || '',
    // PRIMARY fields (v5) - Shop Capability and Responsible Workshop
    authority: raw.authority || raw.Authority || '',
    responsibleWorkshop: raw.responsibleWorkshop || raw.ResponsibleWorkshop || '',
    // LEGACY fields (kept for backward compatibility with old data)
    ecaaShop: raw.ecaaShop || raw.ECAAShop || '',
    faaShop: raw.faaShop || raw.FAAShop || '',
    letterRefNo: raw.letterRefNo || raw.LetterRefNo || '',
    shop: raw.shop || raw.shopName || raw.ShopName || '',
    shopId: raw.shopId || raw.ShopId || '',
    componentId: raw.componentId || raw.ComponentId || '',
    // ATA Chapter relationship fields
    ataChapterId: raw.ataChapterId || raw.ATAChapterId || raw.ataChapterid || '',
    ataChapterNumber: raw.ataChapterNumber || raw.ATAChapterNumber || '',
    ataChapterTitle: raw.ataChapterTitle || raw.ATAChapterTitle || '',
    // Approval workflow
    approvalStatus: raw.approvalStatus ?? raw.ApprovalStatus ?? 0,
    assignedToUserId: raw.assignedToUserId || raw.AssignedToUserId || undefined,
    rejectionReason: raw.rejectionReason || raw.RejectionReason || undefined,
    revisionNumber: raw.revisionNumber ?? raw.RevisionNumber ?? 1,
    createdByUserId: raw.createdByUserId ?? raw.CreatedByUserId ?? undefined,
    approvedByUserId: raw.approvedByUserId ?? raw.ApprovedByUserId ?? undefined,
    approvalDate: raw.approvalDate ?? raw.ApprovalDate ?? null,
    // PHASE 2: optional-stage opt-ins (mirror of the ATARecord bools on the server)
    requiresQAApproval: raw.requiresQAApproval ?? raw.RequiresQAApproval ?? false,
    requiresDirectorApproval: raw.requiresDirectorApproval ?? raw.RequiresDirectorApproval ?? false,
    requiresECAAEndorsement: raw.requiresECAAEndorsement ?? raw.RequiresECAAEndorsement ?? false,
    // AMENDED v19: round-trip the owning EvaluationFolder guid (EvaluationFolder.ATARecordId).
    evaluationFolderId: raw.evaluationFolderId ?? raw.EvaluationFolderId ?? null,
    createdBy: raw.createdBy || raw.CreatedBy || '',
    updatedBy: raw.updatedBy || raw.UpdatedBy || '',
    createdByRole: raw.creatorRole || raw.CreatorRole || '',
    updatedByRole: raw.updatedByRole || raw.UpdatedByRole || '',
    createdAt: raw.createdAt || raw.CreatedAt || '',
    updatedAt: raw.updatedAt || raw.UpdatedAt || '',
    formSubmissions: Array.isArray(rawFormSubmissions)
      ? rawFormSubmissions.map((form: Record<string, any>) => ({
          id: form.id || form.Id || '',
          formType: form.formType || form.FormType || '',
          formNo: form.formNo || form.FormNo || '',
          approvalStatus: Number(form.approvalStatus ?? form.ApprovalStatus ?? 0),
          submittedDate: form.submittedDate ?? form.SubmittedDate ?? null,
          approvedDate: form.approvedDate ?? form.ApprovedDate ?? null,
          revisionNumber: form.revisionNumber ?? form.RevisionNumber,
        }))
      : [],
  }
}

export async function getATARecordsByShop(shopId: string): Promise<ATARecordDto[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/ata-records/shop/${shopId}`)
  const rawRecords = extractArray<Record<string, any>>(response)
  return rawRecords.map(normalizeATARecord)
}

export async function getATARecordById(id: string): Promise<ATARecordDto> {
  const raw = await apiRequest<Record<string, any>>(`${SE_API_PREFIX}/ata-records/${id}`)
  return normalizeATARecord(raw)
}

export async function getATARecordsByComponent(componentId: string): Promise<ATARecordDto[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/ata-records/component/${componentId}`)
  const rawRecords = extractArray<Record<string, any>>(response)
  return rawRecords.map(normalizeATARecord)
}

export async function getATARecordsByStatus(shopId: string, status: number): Promise<ATARecordDto[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/ata-records/shop/${shopId}/status/${status}`)
  const rawRecords = extractArray<Record<string, any>>(response)
  return rawRecords.map(normalizeATARecord)
}

export async function getATARecordsPendingApproval(): Promise<ATARecordDto[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/ata-records/pending-approval`)
  const rawRecords = extractArray<Record<string, any>>(response)
  return rawRecords.map(normalizeATARecord)
}

/**
 * Create a new ATA Record.
 * 
 * AMENDED v5:
 * - authority: comma-separated Shop Capability values (e.g., "ECAA,FAA,EASA")
 * - responsibleWorkshop: comma-separated workshop values (e.g., "Galley,Electric")
 * - These are the PRIMARY fields sent to the backend.
 * - ecaaShop and faaShop are deprecated but still sent for backward compatibility.
 * - ataChapterId and componentId are sent as `null` (not empty string "")
 *   when no value is selected.
 */
export async function createATARecord(data: {
  description: string
  partNumber: string
  selfEvaluationDate?: string
  manufacturer: string
  ataChapterCode: string
  cmmRevDate?: string
  revNo?: string
  aircraft?: string
  authority?: string
  responsibleWorkshop?: string
  ecaaShop?: string
  faaShop?: string
  letterRefNo?: string
  shopId: string
  ataChapterId?: string | null
  componentId?: string | null
}): Promise<{ id: string }> {
  // Convert empty strings to null for nullable Guid fields
  const payload = {
    description: data.description,
    partNumber: data.partNumber,
    selfEvaluationDate: data.selfEvaluationDate || null,
    manufacturer: data.manufacturer || '',
    ataChapterCode: data.ataChapterCode || '',
    cmmRevDate: data.cmmRevDate || '',
    revNo: data.revNo || '',
    aircraft: data.aircraft || '',
    // PRIMARY fields - Shop Capability and Responsible Workshop
    authority: data.authority || '',
    responsibleWorkshop: data.responsibleWorkshop || '',
    // LEGACY fields (backward compatibility)
    ecaaShop: data.ecaaShop || '',
    faaShop: data.faaShop || '',
    letterRefNo: data.letterRefNo || '',
    shopId: data.shopId,
    // CRITICAL FIX: Send null instead of "" for nullable Guid fields
    ataChapterId: (data.ataChapterId && data.ataChapterId.trim() !== '') ? data.ataChapterId : null,
    componentId: (data.componentId && data.componentId.trim() !== '') ? data.componentId : null,
  }

  return apiRequest<{ id: string }>(`${SE_API_PREFIX}/ata-records`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export async function updateATARecord(id: string, data: Record<string, unknown>): Promise<void> {
  await apiRequest<void>(`${SE_API_PREFIX}/ata-records/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteATARecord(id: string): Promise<void> {
  await apiRequest<void>(`${SE_API_PREFIX}/ata-records/${id}`, {
    method: 'DELETE',
  })
}

export async function submitATARecord(id: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`${SE_API_PREFIX}/ata-records/${id}/submit`, {
    method: 'POST',
  })
}

export async function approveATARecord(id: string, data: { comments?: string }): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`${SE_API_PREFIX}/ata-records/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function rejectATARecord(id: string, data: { reason: string }): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`${SE_API_PREFIX}/ata-records/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/**
 * AMENDED v19 (defect #2/#3 support): the backend binds ReassignATARecordCommand.
 * AssignToUserId as a NUMERIC long — the previous payload key `assignedTo` carried a
 * username string under the wrong name, so model binding silently produced 0 and every
 * reassign failed. The key is now `assignToUserId` and the value is validated as a number.
 */
export async function reassignATARecord(id: string, data: { assignToUserId: number | string; reason?: string }): Promise<{ message: string }> {
  const assignToUserId = Number(data.assignToUserId)
  if (!Number.isFinite(assignToUserId) || assignToUserId <= 0) {
    throw new Error('Please select a valid user to reassign to.')
  }
  return apiRequest<{ message: string }>(`${SE_API_PREFIX}/ata-records/${id}/reassign`, {
    method: 'POST',
    body: JSON.stringify({ assignToUserId, reason: data.reason || '' }),
  })
}

/**
 * AMENDED v7: Store CMM revision data fetched from the external system.
 * This persists the CMM revision number, date, and PDF URL to the ATARecord.
 * 
 * Key behaviors:
 * - Data is stored per part number (ATARecord)
 * - Once stored, data will NOT be removed unless the user explicitly refreshes
 * - If source data is updated, calling this again will store the latest data
 * - Does NOT require the record to be in Draft status (CMM is reference data)
 */
export async function storeCMMData(ataRecordId: string, data: {
  revNo: string;
  cmmRevDate: string;
  cmmPdfUrl: string;
}): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`${SE_API_PREFIX}/ata-records/${ataRecordId}/store-cmm`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// ===== Capability Assessment APIs =====
export async function getCapabilityAssessmentsByShop(shopId: string): Promise<CapabilityAssessmentDto[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/CapabilityAssessment/shop/${shopId}`)
  return extractArray<CapabilityAssessmentDto>(response)
}

export async function getCapabilityAssessmentById(id: string): Promise<CapabilityAssessmentDto | null> {
  return apiRequest<CapabilityAssessmentDto>(`${SE_API_PREFIX}/CapabilityAssessment/${id}`)
}

export async function getCapabilityAssessmentsByStatus(params: {
  shopId: string
  status?: CapabilityStatus
}): Promise<CapabilityAssessmentDto[]> {
  if (params.status !== undefined) {
    const response = await apiRequest<unknown>(`${SE_API_PREFIX}/CapabilityAssessment/shop/${params.shopId}/status/${params.status}`)
    return extractArray<CapabilityAssessmentDto>(response)
  }
  return getCapabilityAssessmentsByShop(params.shopId)
}

export async function createCapabilityAssessment(data: {
  componentId: string
  shopId: string
  status: CapabilityStatus
  justification?: string
  hasRequiredTooling: boolean
  hasRequiredTraining: boolean
  hasTechnicalData: boolean
  hasRequiredFacilities: boolean
  limitations?: string
  correctiveActions?: string
  assessmentDate?: string
  nextReviewDate?: string
  assessedBy: string
}): Promise<string> {
  return apiRequest<string>(`${SE_API_PREFIX}/CapabilityAssessment`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateCapabilityAssessment(id: string, data: {
  status?: CapabilityStatus
  justification?: string
  hasRequiredTooling?: boolean
  hasRequiredTraining?: boolean
  hasTechnicalData?: boolean
  hasRequiredFacilities?: boolean
  limitations?: string
  correctiveActions?: string
  nextReviewDate?: string
  approvedBy?: string
}): Promise<boolean> {
  return apiRequest<boolean>(`${SE_API_PREFIX}/CapabilityAssessment/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function deleteCapabilityAssessment(id: string): Promise<boolean> {
  return apiRequest<boolean>(`${SE_API_PREFIX}/CapabilityAssessment/${id}`, {
    method: 'DELETE',
  })
}

// ===== Technical Data APIs =====
export async function getADsByComponent(componentId: string): Promise<AirworthinessDirectiveDto[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/TechnicalData/airworthiness-directives/component/${componentId}`)
  return extractArray<AirworthinessDirectiveDto>(response)
}

export async function createAD(data: Omit<AirworthinessDirectiveDto, 'id'>): Promise<AirworthinessDirectiveDto> {
  return apiRequest<AirworthinessDirectiveDto>(`${SE_API_PREFIX}/TechnicalData/airworthiness-directives`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateAD(id: string, data: Partial<AirworthinessDirectiveDto>): Promise<AirworthinessDirectiveDto> {
  return apiRequest<AirworthinessDirectiveDto>(`${SE_API_PREFIX}/TechnicalData/airworthiness-directives/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function getSBsByComponent(componentId: string): Promise<ServiceBulletinDto[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/TechnicalData/service-bulletins/component/${componentId}`)
  return extractArray<ServiceBulletinDto>(response)
}

export async function createSB(data: Omit<ServiceBulletinDto, 'id'>): Promise<ServiceBulletinDto> {
  return apiRequest<ServiceBulletinDto>(`${SE_API_PREFIX}/TechnicalData/service-bulletins`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateSB(id: string, data: Partial<ServiceBulletinDto>): Promise<ServiceBulletinDto> {
  return apiRequest<ServiceBulletinDto>(`${SE_API_PREFIX}/TechnicalData/service-bulletins/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// ===== Tool Needs Analysis APIs =====
export async function getTNAByShop(shopId: string): Promise<ToolNeedsAnalysisDto[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/TechnicalData/tools/shop/${shopId}`)
  return extractArray<ToolNeedsAnalysisDto>(response)
}

export async function createTNA(data: Omit<ToolNeedsAnalysisDto, 'id' | 'componentPartNumber'>): Promise<ToolNeedsAnalysisDto> {
  return apiRequest<ToolNeedsAnalysisDto>(`${SE_API_PREFIX}/TechnicalData/tools`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateTNA(id: string, data: Partial<ToolNeedsAnalysisDto>): Promise<ToolNeedsAnalysisDto> {
  return apiRequest<ToolNeedsAnalysisDto>(`${SE_API_PREFIX}/TechnicalData/tools/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

// ===== Self Audit Checklist APIs =====
export async function getSelfAuditChecklistByShop(shopId: string): Promise<SelfAuditChecklistDto[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/SelfAudit/shop/${shopId}`)
  return extractArray<SelfAuditChecklistDto>(response)
}

export async function getSelfAuditChecklistByStatus(shopId: string, status: AuditStatus): Promise<SelfAuditChecklistDto[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/SelfAudit/shop/${shopId}/status/${status}`)
  return extractArray<SelfAuditChecklistDto>(response)
}

export async function updateAuditChecklistItem(id: string, data: {
  complianceStatus: ComplianceStatus
  findings?: string
  correctiveAction?: string
  dueDate?: string
  completionDate?: string
  assignedTo?: string
  auditStatus?: AuditStatus
}): Promise<SelfAuditChecklistDto> {
  return apiRequest<SelfAuditChecklistDto>(`${SE_API_PREFIX}/SelfAudit/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function createAuditChecklistItem(data: Omit<SelfAuditChecklistDto, 'id'>): Promise<SelfAuditChecklistDto> {
  return apiRequest<SelfAuditChecklistDto>(`${SE_API_PREFIX}/SelfAudit`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// ===== Workflow APIs =====
export async function getAuditLogsByEntity(entityType: string, entityId: string): Promise<WorkflowAuditLogDto[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/Workflow/audit-logs/entity/${entityType}/${entityId}`)
  return extractArray<WorkflowAuditLogDto>(response)
}

// ===== Employee Proficiency APIs =====
export async function getEmployeeProficiencyByShop(shopId: string): Promise<EmployeeProficiencyDto[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/EmployeeProficiency/shop/${shopId}`)
  return extractArray<EmployeeProficiencyDto>(response)
}

// ===== Form Submission APIs =====
export interface FormSubmissionResponse {
  id: string
  ataRecordId: string
  formType: string
  formNo: string
  revNo: string
  /** AMENDED v8: exposed so forms can round-trip the revision date. */
  revDate?: string
  formDataJson: string
  approvalStatus: number
  /** AMENDED v8: incremented by the backend on each Returned → Draft cycle. */
  revisionNumber?: number
  rejectionReason?: string
  /** AMENDED v8: reviewer comments captured on approve / return. */
  reviewComments?: string
  /** AMENDED v8: current delegate, if the form was delegated. */
  delegatedToUserId?: string
  sourceFormSubmissionId?: string
  createdBy: string
  createdAt: string
  updatedAt: string
}

/**
 * ===== Form Submission APIs — AMENDED v8 =====
 *
 * v8 ROOT-CAUSE FIX for the runtime error reported on the Table of Content
 * form approval click:
 *
 *   "Save Failed
 *    (0, _api_WEBPACK_IMPORTED_MODULE_4_.createFormSubmission) is not a function"
 *
 * WHY IT HAPPENED
 * ---------------
 * `useFormData.ts` imported  : createFormSubmission, updateFormSubmission, submitForm
 * `ApprovalWorkflowActions`  : submitForm, approveForm, rejectForm, delegateForm,
 *                              returnFormForRevision, getUsers, UserDto
 *
 * But this module only ever exported `saveForm`, `updateForm` and
 * `submitFormForApproval`. Webpack therefore resolved every missing symbol to
 * `undefined`, and the first call threw "... is not a function". The failure was
 * NOT in the backend — the request was never even sent.
 *
 * All of those symbols are now exported. The old names are kept as thin aliases
 * so nothing that already compiled breaks.
 *
 * v8 ROUTE FIX
 * ------------
 * FormSubmissionController is routed at `api/self-evaluation/forms` and exposes
 * the ATA-scoped reads under `/ata-record/{ataRecordId}`. The previous code
 * called `/forms/{ataRecordId}` and `/forms/{ataRecordId}/type/{formType}`,
 * which never matched a route and always returned 404. Corrected below.
 *
 * v8 PAYLOAD CONTRACT
 * -------------------
 * Bodies now match the MediatR commands exactly (camelCase binds to PascalCase):
 *   CreateFormSubmissionCommand   → ataRecordId, formType, formNo, revNo, revDate, formDataJson
 *   UpdateFormSubmissionCommand   → formNo, revNo, revDate, formDataJson
 *   ApproveFormSubmissionCommand  → comments
 *   RejectFormSubmissionCommand   → reason
 *   DelegateFormSubmissionCommand → delegateToUserId, reason
 *   ReturnFormForRevisionCommand  → comments
 *
 * NOTE: `GET /forms/ata-record/{id}/type/{formType}` answers 204 NoContent when
 * the form has not been created yet. `apiRequest` maps 204 to `undefined`, so
 * `getFormByType` returns null for "not created yet" instead of throwing.
 */

/** Normalizes a backend FormSubmission payload (PascalCase or camelCase). */
function normalizeApprovalStatus(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  if (typeof raw === 'string') {
    const value = raw.trim()
    const numeric = Number(value)
    if (value !== '' && Number.isFinite(numeric)) return numeric
    const named = ApprovalStatus[value as keyof typeof ApprovalStatus]
    if (typeof named === 'number') return named
  }
  return ApprovalStatus.Draft
}

function normalizeFormSubmission(raw: Record<string, any>): FormSubmissionResponse {
  return {
    id: raw.id || raw.Id || '',
    ataRecordId: raw.ataRecordId || raw.ATARecordId || raw.AtaRecordId || '',
    formType: raw.formType || raw.FormType || '',
    formNo: raw.formNo || raw.FormNo || '',
    revNo: raw.revNo || raw.RevNo || '',
    revDate: raw.revDate || raw.RevDate || undefined,
    formDataJson: raw.formDataJson || raw.FormDataJson || '{}',
    approvalStatus: normalizeApprovalStatus(raw.approvalStatus ?? raw.ApprovalStatus),
    revisionNumber: raw.revisionNumber ?? raw.RevisionNumber ?? 1,
    rejectionReason: raw.rejectionReason || raw.RejectionReason || undefined,
    reviewComments: raw.reviewComments || raw.ReviewComments || undefined,
    delegatedToUserId: raw.delegatedToUserId || raw.DelegatedToUserId || undefined,
    sourceFormSubmissionId: raw.sourceFormSubmissionId || raw.SourceFormSubmissionId || undefined,
    createdBy: raw.createdBy || raw.CreatedBy || '',
    createdAt: raw.createdAt || raw.CreatedAt || '',
    updatedAt: raw.updatedAt || raw.UpdatedAt || '',
  }
}

/** All forms belonging to one ATA record. */
export async function getFormsByATARecord(ataRecordId: string): Promise<FormSubmissionResponse[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/forms/ata-record/${ataRecordId}`)
  return extractArray<Record<string, any>>(response).map(normalizeFormSubmission)
}

/** Latest revision of one form type for an ATA record. Returns null when not created yet. */
export async function getFormByType(
  ataRecordId: string,
  formType: string
): Promise<FormSubmissionResponse | null> {
  const formTypes = formType === 'tna'
    ? ['tna', 'tool_need_analysis_report']
    : formType === 'tool_need_analysis_report'
      ? ['tool_need_analysis_report', 'tna']
      : [formType]
  let draftCandidate: FormSubmissionResponse | null = null
  let nonDraftCandidate: FormSubmissionResponse | null = null

  for (const candidateType of formTypes) {
    try {
      const raw = await apiRequest<Record<string, any> | undefined>(
        `${SE_API_PREFIX}/forms/ata-record/${ataRecordId}/type/${encodeURIComponent(candidateType)}`
      )
      if (raw) {
        const normalized = normalizeFormSubmission(raw)
        if (normalized.approvalStatus === ApprovalStatus.Rejected) {
          return normalized
        }
        if (normalized.approvalStatus !== ApprovalStatus.Draft) {
          nonDraftCandidate ??= normalized
        } else {
          draftCandidate ??= normalized
        }
      }
    } catch {
      // Try the legacy alias before treating the form as not created.
    }
  }

  // Older TNA records can exist under both aliases: one empty Draft row and
  // one real workflow row (Rejected/Pending). Reconcile the alias pair from
  // the ATA list so the editor does not bind to the empty row and lose Edit.
  if (formTypes.length > 1) {
    const forms = await getFormsByATARecord(ataRecordId)
    const aliases = new Set(formTypes.map(type => type.toLowerCase()))
    const matching = forms.filter(form => aliases.has(form.formType.trim().toLowerCase()))
    const workflowForm = matching.find(form => form.approvalStatus === ApprovalStatus.Rejected) ??
      matching.find(form => form.approvalStatus !== ApprovalStatus.Draft)
    if (workflowForm) return workflowForm
    if (matching.length > 0) return matching[0]
  }

  return nonDraftCandidate ?? draftCandidate
}

export async function getFormSubmissionById(id: string): Promise<FormSubmissionResponse | null> {
  try {
    const raw = await apiRequest<Record<string, any> | undefined>(`${SE_API_PREFIX}/forms/${id}`)
    if (!raw) return null
    return normalizeFormSubmission(raw)
  } catch {
    return null
  }
}

/** Forms waiting on the signed-in user's approval level. */
export async function getFormsPendingMyApproval(): Promise<FormSubmissionResponse[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/forms/pending-approval`)
  return extractArray<Record<string, any>>(response).map(normalizeFormSubmission)
}

/**
 * Create a form submission. THIS is the export whose absence produced
 * "createFormSubmission is not a function".
 */
export async function createFormSubmission(data: {
  ataRecordId: string
  formType: string
  formNo?: string
  revNo?: string
  revDate?: string | null
  formDataJson: string
  createdBy?: string
}): Promise<{ id: string }> {
  const payload = {
    ataRecordId: data.ataRecordId,
    formType: data.formType,
    formNo: data.formNo || '',
    revNo: data.revNo || '',
    revDate: data.revDate || null,
    formDataJson: data.formDataJson || '{}',
    createdBy: data.createdBy || '',
  }

  const result = await apiRequest<Record<string, any>>(`${SE_API_PREFIX}/forms`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  // Controller returns CreatedAtAction(..., new { id })
  return { id: String(result?.id ?? result?.Id ?? '') }
}

/** Update a Draft/Returned form submission. */
export async function updateFormSubmission(id: string, data: {
  formNo?: string
  revNo?: string
  revDate?: string | null
  formDataJson: string
  updatedBy?: string
}): Promise<void> {
  const payload = {
    formNo: data.formNo || '',
    revNo: data.revNo || '',
    revDate: data.revDate || null,
    formDataJson: data.formDataJson || '{}',
    updatedBy: data.updatedBy || '',
  }

  await apiRequest<void>(`${SE_API_PREFIX}/forms/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export async function deleteFormSubmission(id: string): Promise<void> {
  await apiRequest<void>(`${SE_API_PREFIX}/forms/${id}`, { method: 'DELETE' })
}

/** Submit a form into the approval chain (→ Pending Team Leader Review). */
export async function submitForm(id: string): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`${SE_API_PREFIX}/forms/${id}/submit`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

/** Approve at the current level; the backend advances to the next level. */
export async function approveForm(id: string, data: { comments?: string } = {}): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`${SE_API_PREFIX}/forms/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ comments: data.comments || '' }),
  })
}

export async function rejectForm(id: string, data: { reason: string }): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`${SE_API_PREFIX}/forms/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason: data.reason }),
  })
}

/** Delegate a form to another user (DelegateFormSubmissionCommand.DelegateToUserId). */
export async function delegateForm(id: string, data: {
  delegateToUserId: string | number
  reason?: string
}): Promise<{ message: string }> {
  // The backend binds DelegateToUserId as a NUMERIC long? — a string would fail
  // strict JSON binding and surface as "No delegate user was supplied" (403).
  const delegateToUserId = Number(data.delegateToUserId)
  if (!Number.isFinite(delegateToUserId) || delegateToUserId <= 0) {
    throw new Error('Please select a valid user to delegate to.')
  }
  return apiRequest<{ message: string }>(`${SE_API_PREFIX}/forms/${id}/delegate`, {
    method: 'POST',
    body: JSON.stringify({
      delegateToUserId,
      reason: data.reason || '',
    }),
  })
}

/** Return a form to the submitter for revision (command field is `comments`). */
export async function returnFormForRevision(id: string, data: { reason: string }): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`${SE_API_PREFIX}/forms/${id}/return`, {
    method: 'POST',
    body: JSON.stringify({ comments: data.reason }),
  })
}

// ----- Legacy aliases (kept so previously-compiling call sites keep working) -----

/** @deprecated use `createFormSubmission` */
export async function saveForm(data: {
  ataRecordId: string
  formType: string
  formNo: string
  revNo: string
  formDataJson: string
}): Promise<{ id: string }> {
  return createFormSubmission(data)
}

/** @deprecated use `updateFormSubmission` */
export async function updateForm(id: string, data: { formDataJson: string }): Promise<void> {
  return updateFormSubmission(id, data)
}

/** @deprecated use `submitForm` */
export async function submitFormForApproval(id: string): Promise<{ message: string }> {
  return submitForm(id)
}

// ===== User APIs (AMENDED v8) =====
/**
 * `ApprovalWorkflowActions` imported `getUsers` / `UserDto` from this module and
 * they did not exist, which broke the Delegate dialog the same way the form
 * helpers broke Save. They are implemented here against
 * `UserManagementController` (GET /api/self-evaluation/users), which answers
 * `{ data, totalCount, page, pageSize, totalPages }`.
 */
export interface UserDto {
  /** Always a string so it can be used directly as a Select value. */
  id: string
  /** Numeric backend id — required by /api/self-evaluation/users/assign-role. */
  userId: number
  username: string
  email: string
  fullName: string
  /** Backend role, e.g. "SpecialTeamLeader". */
  role: string
  /** Human readable role, e.g. "Special Team Leader". */
  roleDisplayName: string
  shopId?: string | null
  departmentId?: string | null
  supervisorUserId?: string | null
  jobTitle?: string | null
  isActive: boolean
}

function normalizeUser(raw: Record<string, any>): UserDto {
  const role = raw.role || raw.Role || ''
  const rawId = raw.id ?? raw.Id ?? raw.userId ?? raw.UserId ?? ''
  return {
    id: String(rawId),
    userId: Number(rawId) || 0,
    username: raw.username || raw.Username || '',
    email: raw.email || raw.Email || '',
    fullName: raw.fullName || raw.FullName || raw.username || raw.Username || '',
    role,
    roleDisplayName: getRoleDisplayName(role),
    shopId: raw.shopId || raw.ShopId || null,
    departmentId: raw.departmentId || raw.DepartmentId || null,
    supervisorUserId: raw.supervisorUserId || raw.SupervisorUserId || null,
    jobTitle: raw.jobTitle || raw.JobTitle || null,
    isActive: raw.isActive ?? raw.IsActive ?? true,
  }
}

export async function getUsers(params: {
  role?: string
  shopId?: string
  departmentId?: string
  isActive?: boolean
  search?: string
  page?: number
  pageSize?: number
} = {}): Promise<UserDto[]> {
  const query = new URLSearchParams()
  if (params.role) query.set('role', params.role)
  if (params.shopId) query.set('shopId', params.shopId)
  if (params.departmentId) query.set('departmentId', params.departmentId)
  if (params.isActive !== undefined) query.set('isActive', String(params.isActive))
  if (params.search) query.set('search', params.search)
  query.set('page', String(params.page ?? 1))
  query.set('pageSize', String(params.pageSize ?? 200))

  const response = await apiRequest<unknown>(`${API_BASE_URL}/self-evaluation/users?${query.toString()}`)
  return extractArray<Record<string, any>>(response).map(normalizeUser)
}

/** Users reporting to a supervisor — used by Shop Managers to see their Shop TLs as a group. */
export async function getUsersByHierarchy(supervisorId: string | number): Promise<UserDto[]> {
  const response = await apiRequest<unknown>(`${API_BASE_URL}/self-evaluation/users/hierarchy/${supervisorId}`)
  return extractArray<Record<string, any>>(response).map(normalizeUser)
}

/** Full organizational tree grouped by role (Admin → Director → ... → personnel). */
export async function getOrgTree(): Promise<Array<{ role: string; users: UserDto[] }>> {
  const response = await apiRequest<unknown>(`${API_BASE_URL}/self-evaluation/users/org-tree`)
  return extractArray<Record<string, any>>(response).map(group => ({
    role: group.role || group.Role || '',
    users: extractArray<Record<string, any>>(group.users ?? group.Users).map(normalizeUser),
  }))
}

// ===== File Attachment APIs =====

/**
 * AMENDED: one attached file, normalized from the backend FileAttachmentDto.
 * Extracted so FileUploadPanel can import the type instead of `any`.
 */
export interface FileAttachmentResponse {
  id: string
  ataRecordId: string
  formSubmissionId?: string
  formNodeType?: string
  // v13: the backend attachment DTO carries `formType`; `formNodeType` is kept for
  // backward compatibility with older payloads.
  formType?: string
  fileName: string
  contentType: string
  fileSize: number
  // v13: FileUploadPanel renders this alias of fileSize.
  fileSizeBytes: number
  approvalStatus: number
  comments?: string
  rejectionReason?: string
  uploadedBy?: string
  createdAt?: string
}

function normalizeFileAttachment(raw: Record<string, any>): FileAttachmentResponse {
  return {
    id: raw.id || raw.Id || '',
    ataRecordId: raw.ataRecordId || raw.AtaRecordId || raw.ATARecordId || '',
    formSubmissionId: raw.formSubmissionId || raw.FormSubmissionId || undefined,
    formNodeType: raw.formNodeType || raw.FormNodeType || undefined,
    formType: raw.formType || raw.FormType || raw.formNodeType || raw.FormNodeType || undefined,
    fileName: raw.fileName || raw.FileName || '',
    contentType: raw.contentType || raw.ContentType || 'application/octet-stream',
    fileSize: Number(raw.fileSize ?? raw.FileSize ?? 0),
    fileSizeBytes: Number(raw.fileSizeBytes ?? raw.FileSizeBytes ?? raw.fileSize ?? raw.FileSize ?? 0),
    approvalStatus: raw.approvalStatus ?? raw.ApprovalStatus ?? 0,
    comments: raw.comments || raw.Comments || undefined,
    rejectionReason: raw.rejectionReason || raw.RejectionReason || undefined,
    uploadedBy: raw.uploadedBy || raw.UploadedBy || undefined,
    createdAt: raw.createdAt || raw.CreatedAt || undefined,
  }
}

/** All file attachments for one form submission (GET /files/form/{id}). */
export async function getFilesByForm(formSubmissionId: string): Promise<FileAttachmentResponse[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/files/form/${formSubmissionId}`)
  return extractArray<Record<string, any>>(response).map(normalizeFileAttachment)
}

export async function getFilesByATARecord(ataRecordId: string): Promise<FileAttachmentResponse[]> {
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/files/ata-record/${ataRecordId}`)
  return extractArray<Record<string, any>>(response).map(normalizeFileAttachment)
}

export async function uploadFile(formData: FormData): Promise<UploadFileResult> {
  const response = await fetch(`${SE_API_PREFIX}/files/upload`, {
    method: 'POST',
    body: formData,
    credentials: 'include',
  })
  if (!response.ok) {
    // v13: parse the structured { code, message } denial body so FileUploadPanel
    // can map CompletedFormLocked / NoActiveGrant / GrantExpired to real messages.
    const errorText = await response.text().catch(() => '')
    let parsed: Record<string, any> | null = null
    try {
      parsed = errorText ? (JSON.parse(errorText) as Record<string, any>) : null
    } catch {
      parsed = null
    }
    const err = new Error(
      (parsed && (parsed.message || parsed.Message)) || errorText || `HTTP ${response.status}`,
    ) as Error & { code?: string }
    if (parsed) err.code = parsed.code || parsed.Code || undefined
    throw err
  }
  return (await response.json()) as UploadFileResult
}

export async function deleteFile(fileId: string): Promise<void> {
  await apiRequest<void>(`${SE_API_PREFIX}/files/${fileId}`, {
    method: 'DELETE',
  })
}

export async function approveFile(fileId: string, data: { comments?: string }): Promise<void> {
  await apiRequest<void>(`${SE_API_PREFIX}/files/${fileId}/approve`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function rejectFile(fileId: string, data: { reason: string }): Promise<void> {
  await apiRequest<void>(`${SE_API_PREFIX}/files/${fileId}/reject`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// ===== v13: Upload-grant APIs (completion-lock escape hatch, Admin-managed) =====

/** One Admin-issued upload privilege on a completed form. */
export interface UploadGrantResponse {
  id: string
  formSubmissionId: string
  forUserId: number
  forUserName?: string
  grantedByUserId?: number
  grantedByName?: string
  reason?: string
  isActive: boolean
  grantedAt?: string
  expiresAt?: string | null
  revokedAt?: string | null
  revokedReason?: string | null
}

/** Result of POST /files/upload — surfaces break-glass / grant metadata. */
export interface UploadFileResult {
  id?: string
  adminBreakGlass?: boolean
  grantExpiresAt?: string | null
  [key: string]: unknown
}

function normalizeUploadGrant(raw: Record<string, any>): UploadGrantResponse {
  return {
    id: raw.id || raw.Id || '',
    formSubmissionId: raw.formSubmissionId || raw.FormSubmissionId || '',
    forUserId: Number(raw.forUserId ?? raw.ForUserId ?? 0),
    forUserName: raw.forUserName || raw.ForUserName || undefined,
    grantedByUserId: raw.grantedByUserId != null ? Number(raw.grantedByUserId) : undefined,
    grantedByName: raw.grantedByName || raw.GrantedByName || undefined,
    reason: raw.reason || raw.Reason || undefined,
    isActive: raw.isActive ?? raw.IsActive ?? true,
    grantedAt: raw.grantedAt || raw.GrantedAt || undefined,
    expiresAt: raw.expiresAt ?? raw.ExpiresAt ?? null,
    revokedAt: raw.revokedAt ?? raw.RevokedAt ?? null,
    revokedReason: raw.revokedReason ?? raw.RevokedReason ?? null,
  }
}

/** GET /forms/{id}/upload-grants — Admin view of all grants on one form. */
export async function listUploadGrants(formSubmissionId: string): Promise<UploadGrantResponse[]> {
  const response = await apiRequest<unknown>(
    `${SE_API_PREFIX}/forms/${formSubmissionId}/upload-grants`,
  )
  return extractArray<Record<string, any>>(response).map(normalizeUploadGrant)
}

/** POST /forms/{id}/upload-grants — Admin grants a time-boxed upload privilege. */
export async function createUploadGrant(
  formSubmissionId: string,
  data: { forUserId: number; reason: string; expiresAt?: string | null },
): Promise<UploadGrantResponse> {
  const response = await apiRequest<Record<string, any>>(
    `${SE_API_PREFIX}/forms/${formSubmissionId}/upload-grants`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  )
  return normalizeUploadGrant(response ?? {})
}

/** POST /upload-grants/{id}/revoke — Admin revokes an active grant. */
export async function revokeUploadGrant(grantId: string, data: { reason: string }): Promise<void> {
  await apiRequest<void>(`${SE_API_PREFIX}/upload-grants/${grantId}/revoke`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

/** Starts a new revision and resets the linked Table of Contents workflow. */
export async function startATARecordRevision(
  id: string,
  data: { reason?: string } = {},
): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`${SE_API_PREFIX}/ata-records/${id}/start-revision`, {
    method: 'POST',
    body: JSON.stringify({ reason: data.reason ?? '' }),
  })
}

export interface ApprovedTrainingFormOption {
  id: string
  formType: string
  formNo: string
  approvedDate?: string | null
  sourceAtaRecordId: string
  sourceFormSubmissionId?: string | null
}

export async function getApprovedTrainingForms(params: {
  ataRecordId: string
  formType: string
  employeeId: string
}): Promise<ApprovedTrainingFormOption[]> {
  const query = new URLSearchParams({
    ataRecordId: params.ataRecordId,
    formType: params.formType,
    employeeId: params.employeeId,
  })
  const response = await apiRequest<unknown>(`${SE_API_PREFIX}/forms/approved-training?${query}`)
  return extractArray<Record<string, any>>(response).map(item => ({
    id: String(item.id ?? item.Id ?? ''),
    formType: item.formType ?? item.FormType ?? '',
    formNo: item.formNo ?? item.FormNo ?? '',
    approvedDate: item.approvedDate ?? item.ApprovedDate ?? null,
    sourceAtaRecordId: String(item.sourceAtaRecordId ?? item.SourceAtaRecordId ?? ''),
    sourceFormSubmissionId: item.sourceFormSubmissionId ?? item.SourceFormSubmissionId ?? null,
  }))
}

export async function includeApprovedTrainingForm(data: {
  sourceFormSubmissionId: string
  targetAtaRecordId: string
}): Promise<{ id: string }> {
  const result = await apiRequest<Record<string, any>>(`${SE_API_PREFIX}/forms/include-approved-training`, {
    method: 'POST',
    body: JSON.stringify(data),
  })
  return { id: String(result?.id ?? result?.Id ?? '') }
}