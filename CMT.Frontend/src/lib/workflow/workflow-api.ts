/**
 * =====================================================================================
 * AMENDED v19 - THE TYPED API CLIENT
 * CMT.Frontend/src/lib/workflow/workflow-api.ts       (REPLACES the whole v18 file)
 * Copy to: CMT.Frontend/src/lib/workflow/workflow-api.ts
 *
 * WHAT THIS FILE IS
 * -----------------
 * ONE method per endpoint declared at the top of
 * `CMT.Application/Contracts/Workflow/WorkflowApiContracts.cs`, on the EXACT
 * verb / path / status contract, with:
 *   - route paths declared ONLY here (the transport resolves them through
 *     `apiUrl()` of `workflow-config.ts`, the single `VITE_API_BASE_URL` point);
 *   - the wire call delegated ONLY to `workflow-transport.ts` (pluggable transport);
 *   - a NON-NULL `errorCode` on every failure (uniform ErrorCode surfacing, done by
 *     the transport itself).
 *
 * WHAT v19 CHANGES vs v18  (the inbox/folders 404 fix)
 * ----------------------------------------------------
 *   (1) NEW ROUTE `inboxCounts: () => '/api/workflow/inbox/counts'` and its typed
 *       wrapper `getWorkflowInboxCounts()` — served by the NEW WorkflowInboxController
 *       ([Route("api/workflow")], GET inbox + GET inbox/counts). The existing
 *       `inbox: () => '/api/workflow/inbox'` path is UNCHANGED; it is now actually
 *       served instead of 404.
 *   (2) `InboxQuery.scope` accepts 'mine' | 'shop' | 'all' as normalised by
 *       WorkflowInboxQueryService (the legacy 'pending' | 'delegated' | 'unit' values
 *       are kept for compatibility and still reach the server unchanged).
 *   (3) NO OTHER PATH CHANGED. /api/evaluation-folders keeps hitting the Next.js proxy,
 *       which forwards to the NEW EvaluationFoldersController (read surface: list,
 *       detail, table-of-contents, progress).
 *
 * THE IMPORT SURFACE IT DEPENDS ON  (do not rename these on the two sibling files)
 * ------------------------------------------------------------------------------
 *   workflow-config.ts    -> apiUrl(path: string): string
 *   workflow-transport.ts -> getJson / getList / postJson / putJson / postNoContent /
 *                            getBlob / toUserId / toEntityId / WorkflowApiError /
 *                            WorkflowBlob
 *
 * BINDING RULES carried over from v17/v18
 * ---------------------------------------
 * AMENDMENT 2 - `submitFormDraft` does not swallow the validation field list: a 422
 *   REQUIRED_FIELDS_MISSING payload is preserved on `WorkflowApiError.payload`; read it
 *   with `missingFieldsOf(error)` to highlight the empty inputs.
 * AMENDMENT 5 - `markNotificationRead` uses the 204 path (`postNoContent`).
 * AMENDMENT 6 - the PDF is STREAMED through `getBlob` (credentials included), never a
 *   bare `<a href>`; `folderReportDownloadUrl()` remains only as the canonical
 *   same-origin fallback link.
 * AMENDMENT 7 - `requestDelegatedReview` / `confirmDelegatedReview` mirror the backend
 *   v14 endpoints: the approver borrows a reviewer while KEEPING the approval
 *   (PendingDelegatedReview, same StepNo); distinct from `delegate`, which transfers it.
 *
 * TWO BINDING ID RULES (identical to the backend contracts)
 *   - USER ids are `number`  (C# long):  assignToUserId, delegateToUserId, reviewerUserId...
 *   - ENTITY ids are `string` (C# Guid): folderId, instanceId, stepId, submissionId...
 * =====================================================================================
 */

import { apiUrl } from '@/lib/workflow/workflow-config'
import {
  WorkflowApiError,
  getBlob,
  getList,
  getJson,
  postJson,
  postNoContent,
  putJson,
  toEntityId,
  toUserId,
  type WorkflowBlob,
} from '@/lib/workflow/workflow-transport'

import {
  type AssignStepRequest,
  type CatalogFormResponse,
  type ChecklistVerifyRequest,
  type CompetencyMatrixRowResponse,
  type ConfirmDelegatedReviewRequest,
  type CreateFolderRequest,
  type CreateFormDraftRequest,
  type DecisionRequest,
  type DelegateStepRequest,
  type EnableJointApprovalRequest,
  type ExpiryItemResponse,
  type FolderDetailResponse,
  type FolderProgressResponse,
  type FolderReportResponse,
  type FolderSummaryResponse,
  type InboxItemResponse,
  type MyPermissionsResponse,
  type NotificationResponse,
  type RaiseRevisionRequest,
  type RequestDelegatedReviewRequest,
  type RevisionResponse,
  type SkipStepRequest,
  type StartAmendmentRequest,
  type SubmitFormRequest,
  type TableOfContentsResponse,
  type ToolEquivalencyRowResponse,
  type WorkflowActionResponse,
  type WorkflowInstanceResponse,
} from '@/lib/workflow/workflow-types'

// AMENDED v19 - the inbox counts contract mirror (WorkflowInboxContracts.cs).
import { type WorkflowInboxCountsResponse } from '@/lib/workflow/workflow-inbox-types'

// =====================================================================================
// 1. THE ROUTE TABLE  -  the ONLY place a workflow path is written down
//    Entries are ROUTE-TABLE PATHS starting with `/api/`. The transport resolves every
//    path through apiUrl(), so VITE_API_BASE_URL is honoured everywhere exactly once.
// =====================================================================================

export const WORKFLOW_ROUTES = {
  // ---- Evaluation folders (requirement #2, #11, #12, #14) ----
  folders: () => '/api/evaluation-folders',
  folder: (folderId: string) => `/api/evaluation-folders/${enc(folderId)}`,
  folderTableOfContents: (folderId: string) =>
    `/api/evaluation-folders/${enc(folderId)}/table-of-contents`,
  folderProgress: (folderId: string) =>
    `/api/evaluation-folders/${enc(folderId)}/progress`,
  folderSignOff: (folderId: string) =>
    `/api/evaluation-folders/${enc(folderId)}/sign-off`,
  folderReport: (folderId: string) => `/api/evaluation-folders/${enc(folderId)}/report`,
  folderRevisions: (folderId: string) =>
    `/api/evaluation-folders/${enc(folderId)}/revisions`,
  folderCompetencyMatrix: (folderId: string) =>
    `/api/evaluation-folders/${enc(folderId)}/competency-matrix`,
  folderToolEquivalencyMatrix: (folderId: string) =>
    `/api/evaluation-folders/${enc(folderId)}/tool-equivalency-matrix`,

  // ---- Workflow forms (requirement #3 - the generic engine) ----
  forms: () => '/api/workflow/forms',
  form: (instanceId: string) => `/api/workflow/forms/${enc(instanceId)}`,
  formSubmit: (instanceId: string) => `/api/workflow/forms/${enc(instanceId)}/submit`,
  formAssign: (instanceId: string) => `/api/workflow/forms/${enc(instanceId)}/assign`,
  formReviewAndAssign: (instanceId: string) =>
    `/api/workflow/forms/${enc(instanceId)}/review-and-assign`,
  formApproveAndAssignManager: (instanceId: string) =>
    `/api/workflow/forms/${enc(instanceId)}/approve-and-assign-manager`,
  formDelegate: (instanceId: string) =>
    `/api/workflow/forms/${enc(instanceId)}/delegate`,
  // AMENDED v14 - delegated review: the approver KEEPS the approval.
  formRequestReview: (instanceId: string) =>
    `/api/workflow/forms/${enc(instanceId)}/request-review`,
  formConfirmReview: (instanceId: string) =>
    `/api/workflow/forms/${enc(instanceId)}/confirm-review`,
  formApprove: (instanceId: string) => `/api/workflow/forms/${enc(instanceId)}/approve`,
  formReject: (instanceId: string) => `/api/workflow/forms/${enc(instanceId)}/reject`,
  formReturn: (instanceId: string) => `/api/workflow/forms/${enc(instanceId)}/return`,
  formSkip: (instanceId: string) => `/api/workflow/forms/${enc(instanceId)}/skip`,
  formChecklist: (instanceId: string) =>
    `/api/workflow/forms/${enc(instanceId)}/checklist`,
  formJointApproval: (instanceId: string) =>
    `/api/workflow/forms/${enc(instanceId)}/joint-approval`,

  // ---- Inbox / catalog / permissions ----
  inbox: () => '/api/workflow/inbox',
  // AMENDED v19 - one-call counters for the role sidebar (WorkflowInboxController).
  inboxCounts: () => '/api/workflow/inbox/counts',
  catalog: () => '/api/workflow/catalog',
  catalogForm: (formType: string) => `/api/workflow/catalog/${enc(formType)}`,
  myPermissions: () => '/api/workflow/permissions/me',

  // ---- Expiry + amendment cycle (requirement #10) ----
  expiries: () => '/api/workflow/expiries',
  expiryAmend: (expiryId: string) =>
    `/api/workflow/expiries/${enc(expiryId)}/amend`,

  // ---- Notification centre (requirement #10) ----
  notifications: () => '/api/workflow/notifications',
  notificationRead: (notificationId: string) =>
    `/api/workflow/notifications/${enc(notificationId)}/read`,
} as const

function enc(value: string | number): string {
  return encodeURIComponent(String(value ?? ''))
}

// =====================================================================================
// 2. PAYLOAD HELPERS
// =====================================================================================

/**
 * AMENDMENT 2 - reads `missingFields` off a 422 REQUIRED_FIELDS_MISSING payload so a form
 * can highlight the empty inputs:
 *
 *     catch (error) { const fields = missingFieldsOf(error) }
 *
 * The transport preserves the camelised body on `WorkflowApiError.payload`.
 */
export function missingFieldsOf(error: unknown): string[] {
  if (!(error instanceof WorkflowApiError)) return []
  const payload = error.payload as Record<string, unknown> | null
  if (!payload || typeof payload !== 'object') return []
  const candidate = payload.missingFields ?? payload.MissingFields ?? payload.fields
  if (!Array.isArray(candidate)) return []
  return candidate.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
}

// =====================================================================================
// 3. EVALUATION FOLDERS  (requirement #2, #11, #12, #14)
//    AMENDED v19 - the read surface (list / detail / table-of-contents / progress) is
//    served by the NEW EvaluationFoldersController at [Route("api/evaluation-folders")].
//    The engine transitions (create / sign-off / report / revisions / matrices) answer
//    501 FOLDER_ENGINE_NOT_WIRED until the engine handlers are wired — surfaced as a
//    WorkflowApiError with that errorCode, never a silent 404.
// =====================================================================================

export interface ListFoldersQuery {
  shopId?: string | null
  departmentId?: string | null
  ataChapter?: string | null
  /** ApprovalStatus numeric value. A string from a <Select> is coerced. */
  status?: number | string | null
  search?: string | null
  page?: number | null
  pageSize?: number | null
}

/** GET /api/evaluation-folders -> 200 FolderSummaryResponse[] */
export async function listEvaluationFolders(
  query?: ListFoldersQuery,
): Promise<FolderSummaryResponse[]> {
  const status =
    query?.status === null || query?.status === undefined || query.status === ''
      ? undefined
      : Number(query.status)

  return getList<FolderSummaryResponse>(WORKFLOW_ROUTES.folders(), {
    shopId: query?.shopId ?? null,
    departmentId: query?.departmentId ?? null,
    ataChapter: query?.ataChapter ?? null,
    status: Number.isFinite(status as number) ? (status as number) : null,
    search: query?.search ?? null,
    page: query?.page ?? null,
    pageSize: query?.pageSize ?? null,
  })
}

/** POST /api/evaluation-folders -> 201 FolderDetailResponse */
export async function createEvaluationFolder(
  request: CreateFolderRequest,
): Promise<FolderDetailResponse> {
  return postJson<FolderDetailResponse>(WORKFLOW_ROUTES.folders(), request)
}

/** GET /api/evaluation-folders/{folderId} -> 200 FolderDetailResponse */
export async function getEvaluationFolder(folderId: string): Promise<FolderDetailResponse> {
  return getJson<FolderDetailResponse>(
    WORKFLOW_ROUTES.folder(toEntityId(folderId, 'folderId')),
  )
}

/** PUT /api/evaluation-folders/{folderId} -> 200 FolderDetailResponse */
export async function updateEvaluationFolder(
  folderId: string,
  request: Partial<CreateFolderRequest>,
): Promise<FolderDetailResponse> {
  return putJson<FolderDetailResponse>(
    WORKFLOW_ROUTES.folder(toEntityId(folderId, 'folderId')),
    request,
  )
}

/**
 * GET /api/evaluation-folders/{folderId}/table-of-contents -> 200 TableOfContentsResponse
 * Feed the result straight into `buildTableOfContentsView()` of `toc-view-model.ts`; never
 * render the raw payload, because the server may send the sections in any order.
 */
export async function getFolderTableOfContents(
  folderId: string,
): Promise<TableOfContentsResponse> {
  return getJson<TableOfContentsResponse>(
    WORKFLOW_ROUTES.folderTableOfContents(toEntityId(folderId, 'folderId')),
  )
}

/** GET /api/evaluation-folders/{folderId}/progress -> 200 FolderProgressResponse */
export async function getFolderProgress(folderId: string): Promise<FolderProgressResponse> {
  return getJson<FolderProgressResponse>(
    WORKFLOW_ROUTES.folderProgress(toEntityId(folderId, 'folderId')),
  )
}

/**
 * POST /api/evaluation-folders/{folderId}/sign-off -> 200 WorkflowActionResponse
 * Requirement #14: the final sequential sign-off that LOCKS the folder.
 * 409 MANDATORY_FORMS_PENDING when a mandatory item is still open.
 */
export async function signOffFolder(
  folderId: string,
  payload?: { comments?: string | null },
): Promise<WorkflowActionResponse> {
  return postJson<WorkflowActionResponse>(
    WORKFLOW_ROUTES.folderSignOff(toEntityId(folderId, 'folderId')),
    payload ?? {},
  )
}

/**
 * POST /api/evaluation-folders/{folderId}/report -> 200 FolderReportResponse
 * Requirement #11: consolidates every APPROVED record + signature block into the PDF.
 * The contract returns FolderReportResponse (fileName + downloadUrl + counts); stream the
 * bytes with `downloadFolderReport()` or follow `downloadUrl`.
 */
export async function generateFolderReport(
  folderId: string,
): Promise<FolderReportResponse> {
  return postJson<FolderReportResponse>(
    WORKFLOW_ROUTES.folderReport(toEntityId(folderId, 'folderId')),
    {},
  )
}

/**
 * Convenience composite: marks the folder complete through the final sign-off and then
 * consolidates the PDF. ALREADY_COMPLETED is swallowed on BOTH calls, so pressing the
 * button twice never dead-ends: the existing report is simply served again.
 */
export async function completeFolderAndGenerateReport(
  folderId: string,
  comments?: string | null,
): Promise<{ action: WorkflowActionResponse | null; report: FolderReportResponse }> {
  const id = toEntityId(folderId, 'folderId')

  let action: WorkflowActionResponse | null = null
  try {
    action = await signOffFolder(id, { comments: comments ?? '' })
  } catch (error) {
    if (!(error instanceof WorkflowApiError && error.errorCode === 'ALREADY_COMPLETED')) {
      throw error
    }
  }

  let report: FolderReportResponse
  try {
    report = await generateFolderReport(id)
  } catch (error) {
    if (error instanceof WorkflowApiError && error.errorCode === 'ALREADY_COMPLETED') {
      report = {
        folderId: id,
        success: true,
        message: 'The folder was already complete; the consolidated report is served again.',
        fileName: `self-evaluation-report-${id}.pdf`,
        downloadUrl: folderReportDownloadUrl(id),
        generatedAt: new Date().toISOString(),
        includedForms: 0,
        includedSignatures: 0,
      }
    } else {
      throw error
    }
  }

  return { action, report }
}

/**
 * GET /api/evaluation-folders/{folderId}/report -> 200 application/pdf
 * AMENDMENT 6: streamed through the transport WITH credentials, so it also works under an
 * absolute VITE_API_BASE_URL. Returns the blob AND the server file name.
 */
export async function downloadFolderReport(folderId: string): Promise<WorkflowBlob> {
  return getBlob(WORKFLOW_ROUTES.folderReport(toEntityId(folderId, 'folderId')))
}

/**
 * Canonical link target of the consolidated PDF, for a same-origin `<a href>` fallback.
 * Prefer `downloadFolderReport()` / the `downloadUrl` returned by the server.
 */
export function folderReportDownloadUrl(folderId: string): string {
  return apiUrl(WORKFLOW_ROUTES.folderReport(toEntityId(folderId, 'folderId')))
}

/** GET /api/evaluation-folders/{folderId}/revisions -> 200 RevisionResponse[] */
export async function listFolderRevisions(folderId: string): Promise<RevisionResponse[]> {
  return getList<RevisionResponse>(
    WORKFLOW_ROUTES.folderRevisions(toEntityId(folderId, 'folderId')),
  )
}

/**
 * POST /api/evaluation-folders/{folderId}/revisions -> 201 RevisionResponse
 * Requirement #12: the two-year cycle, or a CMM / Component Maintenance Task / Task Card
 * revision trigger.
 */
export async function raiseFolderRevision(
  folderId: string,
  request: RaiseRevisionRequest,
): Promise<RevisionResponse> {
  return postJson<RevisionResponse>(
    WORKFLOW_ROUTES.folderRevisions(toEntityId(folderId, 'folderId')),
    request,
  )
}

/** GET /api/evaluation-folders/{folderId}/competency-matrix -> 200 CompetencyMatrixRowResponse[] */
export async function getCompetencyMatrix(
  folderId: string,
): Promise<CompetencyMatrixRowResponse[]> {
  return getList<CompetencyMatrixRowResponse>(
    WORKFLOW_ROUTES.folderCompetencyMatrix(toEntityId(folderId, 'folderId')),
  )
}

/** GET /api/evaluation-folders/{folderId}/tool-equivalency-matrix -> 200 ToolEquivalencyRowResponse[] */
export async function getToolEquivalencyMatrix(
  folderId: string,
): Promise<ToolEquivalencyRowResponse[]> {
  return getList<ToolEquivalencyRowResponse>(
    WORKFLOW_ROUTES.folderToolEquivalencyMatrix(toEntityId(folderId, 'folderId')),
  )
}

// =====================================================================================
// 4. WORKFLOW FORMS  -  the generic engine (requirement #3 .. #9)
// =====================================================================================

/**
 * POST /api/workflow/forms -> 201 WorkflowInstanceResponse
 * Drafting gate: MNT-1420A only under the "Others" category, MNT-1420B STL only,
 * MNT-1229B STL or ENG, and so on. The catalog decides; the server enforces.
 */
export async function createFormDraft(
  request: CreateFormDraftRequest,
): Promise<WorkflowInstanceResponse> {
  return postJson<WorkflowInstanceResponse>(WORKFLOW_ROUTES.forms(), request)
}

/** GET /api/workflow/forms/{instanceId} -> 200 WorkflowInstanceResponse */
export async function getWorkflowForm(instanceId: string): Promise<WorkflowInstanceResponse> {
  return getJson<WorkflowInstanceResponse>(
    WORKFLOW_ROUTES.form(toEntityId(instanceId, 'instanceId')),
  )
}

/**
 * POST /api/workflow/forms/{instanceId}/submit -> 200 WorkflowActionResponse
 * 422 REQUIRED_FIELDS_MISSING carries `missingFields` on the error payload - read it with
 * `missingFieldsOf(error)` (AMENDMENT 2) so the editor can highlight the empty inputs.
 */
export async function submitFormDraft(
  instanceId: string,
  request: SubmitFormRequest,
): Promise<WorkflowActionResponse> {
  return postJson<WorkflowActionResponse>(
    WORKFLOW_ROUTES.formSubmit(toEntityId(instanceId, 'instanceId')),
    request,
  )
}

/**
 * POST /api/workflow/forms/{instanceId}/assign -> 200 WorkflowActionResponse
 * "STL manually assigns the record to a designated Certifying Staff member."
 * "DL assigns to an available clerk."
 */
export async function assignWorkflowStep(
  instanceId: string,
  request: AssignStepRequest,
): Promise<WorkflowActionResponse> {
  return postJson<WorkflowActionResponse>(
    WORKFLOW_ROUTES.formAssign(toEntityId(instanceId, 'instanceId')),
    { ...request, assignToUserId: toUserId(request.assignToUserId) },
  )
}

export async function reviewAndAssignTrainingStep(
  instanceId: string,
  request: AssignStepRequest,
): Promise<WorkflowActionResponse> {
  return postJson<WorkflowActionResponse>(
    WORKFLOW_ROUTES.formReviewAndAssign(toEntityId(instanceId, 'instanceId')),
    request,
  )
}

export async function approveAndAssignTrainingManager(
  instanceId: string,
  request: AssignStepRequest,
): Promise<WorkflowActionResponse> {
  return postJson<WorkflowActionResponse>(
    WORKFLOW_ROUTES.formApproveAndAssignManager(toEntityId(instanceId, 'instanceId')),
    request,
  )
}

/**
 * POST /api/workflow/forms/{instanceId}/delegate -> 200 WorkflowActionResponse
 * "Shop Team Leaders can assign these to lower-tier staff if workload is high."
 */
export async function delegateWorkflowStep(
  instanceId: string,
  request: DelegateStepRequest,
): Promise<WorkflowActionResponse> {
  return postJson<WorkflowActionResponse>(
    WORKFLOW_ROUTES.formDelegate(toEntityId(instanceId, 'instanceId')),
    {
      ...request,
      delegateToUserId: toUserId(request.delegateToUserId),
    },
  )
}

/**
 * AMENDED v14 - POST /api/workflow/forms/{instanceId}/request-review -> 200 WorkflowActionResponse
 * The OWNER of the approval step (Director / QA Manager / ECAA Team / HR Manager /
 * Documentation Team Leader) sends it to a delegated reviewer while KEEPING the approval.
 * The instance moves to PendingDelegatedReview on the SAME StepNo - distinct from
 * `delegateWorkflowStep`, which transfers the approval itself.
 */
export async function requestDelegatedReview(
  instanceId: string,
  request: RequestDelegatedReviewRequest,
): Promise<WorkflowActionResponse> {
  return postJson<WorkflowActionResponse>(
    WORKFLOW_ROUTES.formRequestReview(toEntityId(instanceId, 'instanceId')),
    {
      ...request,
      reviewerUserId: toUserId(request.reviewerUserId),
    },
  )
}

/**
 * AMENDED v14 - POST /api/workflow/forms/{instanceId}/confirm-review -> 200 WorkflowActionResponse
 * The delegated reviewer confirms the review; the instance returns to the SAME StepNo and
 * to that step's own Status, so the original approver performs the final approval and the
 * signature block stamps HIM - never the reviewer.
 */
export async function confirmDelegatedReview(
  instanceId: string,
  request: ConfirmDelegatedReviewRequest,
): Promise<WorkflowActionResponse> {
  return postJson<WorkflowActionResponse>(
    WORKFLOW_ROUTES.formConfirmReview(toEntityId(instanceId, 'instanceId')),
    request,
  )
}

/**
 * POST /api/workflow/forms/{instanceId}/approve -> 200 WorkflowActionResponse
 * This is the call that STAMPS the signature block: the server writes
 * name + role + UTC date + the specimen link of the caller onto the step
 * (requirement #13), then advances the chain.
 */
export async function approveWorkflowStep(
  instanceId: string,
  request: DecisionRequest,
): Promise<WorkflowActionResponse> {
  return postJson<WorkflowActionResponse>(
    WORKFLOW_ROUTES.formApprove(toEntityId(instanceId, 'instanceId')),
    request,
  )
}

/** POST /api/workflow/forms/{instanceId}/reject -> 200 WorkflowActionResponse */
export async function rejectWorkflowStep(
  instanceId: string,
  request: DecisionRequest,
): Promise<WorkflowActionResponse> {
  return postJson<WorkflowActionResponse>(
    WORKFLOW_ROUTES.formReject(toEntityId(instanceId, 'instanceId')),
    request,
  )
}

/** POST /api/workflow/forms/{instanceId}/return -> 200 WorkflowActionResponse (rework) */
export async function returnWorkflowStep(
  instanceId: string,
  request: DecisionRequest,
): Promise<WorkflowActionResponse> {
  return postJson<WorkflowActionResponse>(
    WORKFLOW_ROUTES.formReturn(toEntityId(instanceId, 'instanceId')),
    request,
  )
}

/**
 * POST /api/workflow/forms/{instanceId}/skip -> 200 WorkflowActionResponse
 * Skip logic: manual in-house steps, "training not required", and the 918 / 918A
 * "Optional / May Skip Now" flag. 409 REGULATORY_DATE_REACHED when the target date passed.
 */
export async function skipWorkflowStep(
  instanceId: string,
  request: SkipStepRequest,
): Promise<WorkflowActionResponse> {
  return postJson<WorkflowActionResponse>(
    WORKFLOW_ROUTES.formSkip(toEntityId(instanceId, 'instanceId')),
    request,
  )
}

/**
 * POST /api/workflow/forms/{instanceId}/checklist -> 200 WorkflowActionResponse
 * AMENDMENT 3 - MNT-1325 step-by-step verification of each page, tool equivalency and
 * facility metric. A Gate step stays pending until every mandatory item is verified.
 */
export async function verifyChecklistItem(
  instanceId: string,
  request: ChecklistVerifyRequest,
): Promise<WorkflowActionResponse> {
  return postJson<WorkflowActionResponse>(
    WORKFLOW_ROUTES.formChecklist(toEntityId(instanceId, 'instanceId')),
    request,
  )
}

/**
 * POST /api/workflow/forms/{instanceId}/joint-approval -> 200 WorkflowActionResponse
 * Requirement: "When enabled, triggers form generation and sequential approvals:
 * DIR -> QA Personnel (MNT-918) -> ECAA Team (MNT-918A)."
 */
export async function enableJointApproval(
  instanceId: string,
  request: EnableJointApprovalRequest,
): Promise<WorkflowActionResponse> {
  return postJson<WorkflowActionResponse>(
    WORKFLOW_ROUTES.formJointApproval(toEntityId(instanceId, 'instanceId')),
    request,
  )
}

// =====================================================================================
// 5. INBOX / CATALOG / PERMISSIONS
// =====================================================================================

export interface InboxQuery {
  /**
   * AMENDED v19 - the scopes normalised by WorkflowInboxQueryService:
   *   'mine' (default) = rows the caller personally touches;
   *   'all'            = everything the caller may see — what the role sidebar uses;
   *   'shop'           = everything inside the caller's shop.
   * The legacy 'pending' | 'delegated' | 'unit' values are kept and pass through.
   */
  scope?: 'pending' | 'delegated' | 'unit' | 'mine' | 'shop' | 'all' | null
  formType?: string | null
  folderId?: string | null
  page?: number | null
  pageSize?: number | null
}

/** GET /api/workflow/inbox -> 200 InboxItemResponse[] (actually WorkflowInboxItem[], a superset) */
export async function getWorkflowInbox(query?: InboxQuery): Promise<InboxItemResponse[]> {
  return getList<InboxItemResponse>(WORKFLOW_ROUTES.inbox(), {
    scope: query?.scope ?? null,
    formType: query?.formType ?? null,
    folderId: query?.folderId ?? null,
    page: query?.page ?? null,
    pageSize: query?.pageSize ?? null,
  })
}

/**
 * AMENDED v19 - GET /api/workflow/inbox/counts -> 200 WorkflowInboxCountsResponse
 * ONE call for the whole role sidebar: Totals, Mine ("My Requests"), and one
 * WorkflowRoleCounts block per sidebar role (Director, Manager, Shop Team Leader,
 * CAA Officer, QA Manager, Documentation) with the five counters each. Served by
 * WorkflowInboxController (NEW) through WorkflowInboxQueryService.
 */
export interface InboxCountsQuery {
  scope?: 'mine' | 'shop' | 'all' | null
  pageSize?: number | null
}

export async function getWorkflowInboxCounts(
  query?: InboxCountsQuery,
): Promise<WorkflowInboxCountsResponse> {
  return getJson<WorkflowInboxCountsResponse>(WORKFLOW_ROUTES.inboxCounts(), {
    scope: query?.scope ?? null,
    pageSize: query?.pageSize ?? null,
  })
}

/**
 * GET /api/workflow/catalog -> 200 CatalogFormResponse[]
 * Returns step enums as STRINGS; always normalise with `stepFactsFromCatalog()` of
 * `workflow-permissions.ts` before evaluating a rule.
 */
export async function getWorkflowCatalog(): Promise<CatalogFormResponse[]> {
  return getList<CatalogFormResponse>(WORKFLOW_ROUTES.catalog())
}

/** GET /api/workflow/catalog/{formType} -> 200 CatalogFormResponse */
export async function getCatalogForm(formType: string): Promise<CatalogFormResponse> {
  return getJson<CatalogFormResponse>(
    WORKFLOW_ROUTES.catalogForm(toEntityId(formType, 'formType')),
  )
}

/**
 * GET /api/workflow/permissions/me -> 200 MyPermissionsResponse
 * THE authority for the effective permission list; feed it into
 * `actorFromMyPermissions()` once per session.
 */
export async function getMyWorkflowPermissions(): Promise<MyPermissionsResponse> {
  return getJson<MyPermissionsResponse>(WORKFLOW_ROUTES.myPermissions())
}

// =====================================================================================
// 6. EXPIRY + AMENDMENT CYCLE  (requirement #10)
// =====================================================================================

export interface ExpiryQuery {
  /** Days ahead to look. Omit for the server default. */
  withinDays?: number | null
  folderId?: string | null
  shopId?: string | null
  /** true = only items already past their date. */
  overdueOnly?: boolean | null
}

/** GET /api/workflow/expiries -> 200 ExpiryItemResponse[] */
export async function listExpiries(query?: ExpiryQuery): Promise<ExpiryItemResponse[]> {
  return getList<ExpiryItemResponse>(WORKFLOW_ROUTES.expiries(), {
    withinDays: query?.withinDays ?? null,
    folderId: query?.folderId ?? null,
    shopId: query?.shopId ?? null,
    overdueOnly: query?.overdueOnly ?? null,
  })
}

/**
 * POST /api/workflow/expiries/{expiryId}/amend -> 201 WorkflowInstanceResponse
 * Opens the role-based amendment of the expired data; the returned instance carries its
 * OWN approval cycle, which must complete before the change is finalised.
 */
export async function startAmendment(
  expiryId: string,
  request: StartAmendmentRequest,
): Promise<WorkflowInstanceResponse> {
  return postJson<WorkflowInstanceResponse>(
    WORKFLOW_ROUTES.expiryAmend(toEntityId(expiryId, 'expiryId')),
    request,
  )
}

// =====================================================================================
// 7. NOTIFICATION CENTRE  (requirement #10)
// =====================================================================================

export interface NotificationQuery {
  unreadOnly?: boolean | null
  category?: string | null
  page?: number | null
  pageSize?: number | null
}

/** GET /api/workflow/notifications -> 200 NotificationResponse[] */
export async function listNotifications(
  query?: NotificationQuery,
): Promise<NotificationResponse[]> {
  return getList<NotificationResponse>(WORKFLOW_ROUTES.notifications(), {
    unreadOnly: query?.unreadOnly ?? null,
    category: query?.category ?? null,
    page: query?.page ?? null,
    pageSize: query?.pageSize ?? null,
  })
}

/**
 * POST /api/workflow/notifications/{notificationId}/read -> 204 No Content
 * AMENDMENT 5: the 204 path, so the bell actually clears.
 */
export async function markNotificationRead(notificationId: string): Promise<void> {
  return postNoContent(
    WORKFLOW_ROUTES.notificationRead(toEntityId(notificationId, 'notificationId')),
  )
}

/**
 * Marks every unread notification read. The contract exposes ONLY the per-item 204
 * endpoint, so "mark all" is a client-side fan-out of real per-item calls. Called without
 * arguments it lists the unread items first, then marks each one.
 */
export async function markAllNotificationsRead(notificationIds?: string[]): Promise<void> {
  if (notificationIds) {
    const ids = notificationIds.filter(id => id.trim() !== '')
    await Promise.all(ids.map(id => markNotificationRead(id)))
    return
  }
  const unread = await listNotifications({ unreadOnly: true })
  await Promise.all(unread.map(n => markNotificationRead(n.id)))
}

// =====================================================================================
// 8. ONE NAMESPACE OBJECT  -  convenient for mocking in a test
// =====================================================================================

export const workflowApi = {
  // folders
  listEvaluationFolders,
  createEvaluationFolder,
  getEvaluationFolder,
  updateEvaluationFolder,
  getFolderTableOfContents,
  getFolderProgress,
  signOffFolder,
  generateFolderReport,
  downloadFolderReport,
  folderReportDownloadUrl,
  listFolderRevisions,
  raiseFolderRevision,
  getCompetencyMatrix,
  getToolEquivalencyMatrix,
  // forms
  createFormDraft,
  getWorkflowForm,
  submitFormDraft,
  assignWorkflowStep,
  delegateWorkflowStep,
  requestDelegatedReview,
  confirmDelegatedReview,
  approveWorkflowStep,
  rejectWorkflowStep,
  returnWorkflowStep,
  skipWorkflowStep,
  verifyChecklistItem,
  enableJointApproval,
  // inbox / catalog / permissions
  getWorkflowInbox,
  getWorkflowInboxCounts,
  getWorkflowCatalog,
  getCatalogForm,
  getMyWorkflowPermissions,
  // expiries + notifications
  listExpiries,
  startAmendment,
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} as const

export type WorkflowApi = typeof workflowApi