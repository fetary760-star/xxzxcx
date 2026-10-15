/**
 * =====================================================================================
 * maintainx-connector.ts — v3 AMENDMENT (CANONICAL STAFF NUMBER ON THE WIRE)
 * Copy to: CMT.Frontend/src/lib/maintainx/maintainx-connector.ts
 *
 * WHAT v3 CHANGES
 * ---------------
 * (1) `MaintainXIdentity.canonicalStaffNumber` is parsed and returned, so the Admin table
 *     can render the "#105 · 21041 -> MaintainX 21041" proof without re-deriving the
 *     canonicalisation rule in the browser.
 * (2) `MaintainXSignatureImportResult.canonicalStaffNumber` is parsed from the amended
 *     MaintainXController response, so an import toast can name the canonical account.
 *
 * EVERYTHING ELSE IS UNCHANGED: the status enums and copy, the parsing mirrors of
 * MaintainXDetailParser, the ET P/N field audit (ET_PN_FORMS), the transport with CSRF
 * handling, and the endpoint normalisers. Invariant (2) still holds — the description
 * never enters the ET P/N field — and invariant (3) still holds — no MaintainX
 * credentials ever reach the browser.
 * =====================================================================================
 */

import { getCsrfToken } from '@/lib/csrf'

export const MAINTAINX_PROXY_BASE = '/api/maintainx'

// =====================================================================================
// 1. Status enums — names and ORDER mirror the C# enums exactly
// =====================================================================================

/** Mirrors CMT.Application.SelfEvaluation.Services.EtPartNumberResolutionStatus. */
export const ET_PN_STATUS_NAMES = [
  'Resolved',
  'ConnectorDisabled',
  'TaskDefinitionNotFound',
  'ApplicabilityNotFound',
  'PartNumberNotFound',
  'DetailsNotFound',
  'NotResolved',
  'AuthenticationFailed',
  'Unavailable',
  'InvalidRequest',
] as const
export type EtPartNumberStatus = (typeof ET_PN_STATUS_NAMES)[number]

/** Mirrors CMT.Application.SelfEvaluation.Services.MaintainXSignatureFetchStatus. */
export const SIGNATURE_FETCH_STATUS_NAMES = [
  'Fetched',
  'ConnectorDisabled',
  'UserIdNotMapped',
  'UserNotFoundInMaintainX',
  'SignatureNotRegistered',
  'DownloadFailed',
  'ContentInvalid',
  'FileTooLarge',
  'AuthenticationFailed',
  'Unavailable',
] as const
export type MaintainXSignatureFetchStatus = (typeof SIGNATURE_FETCH_STATUS_NAMES)[number]

/** Mirrors CMT.Application.SelfEvaluation.Services.MaintainXIdentityStatus. */
export const IDENTITY_STATUS_NAMES = [
  'Mapped',
  'SourceFieldEmpty',
  'SourceFieldNotAStaffNumber',
  'OverrideMissing',
] as const
export type MaintainXIdentityStatus = (typeof IDENTITY_STATUS_NAMES)[number]

/**
 * Operator-facing copy per ET P/N status. Deliberately says what to do next, because
 * the person reading it is mid-way through filling a controlled form.
 */
const ET_PN_STATUS_COPY: Record<EtPartNumberStatus, string> = {
  Resolved:
    'Stock Code read from the page behind the MaintainX "Stock No:" entry (the Stock No itself is never used).',
  ConnectorDisabled:
    'MaintainX lookup is not configured on this server, so the ET P/N stays manual. Type the stock number.',
  TaskDefinitionNotFound:
    'MaintainX has no task definition for this ATA code. Check the ATA, or open the task definition manually and copy the stock number.',
  ApplicabilityNotFound:
    'The task definition was found but its Applicability tab lists no part numbers. Nothing could be read.',
  PartNumberNotFound:
    'This part number is not listed on the Applicability tab of that task definition. Confirm the P/N on the ATA Record.',
  DetailsNotFound: 'The Details tab of that part number carries no stock-number entry.',
  NotResolved:
    'A Details entry was present but no usable stock code survived parsing (the cell may hold only a description, or the page behind the entry exposed no "Stock Code:").',
  AuthenticationFailed:
    'MaintainX rejected the stored credentials or the session expired. Ask an administrator to check the connector configuration.',
  Unavailable:
    'MaintainX did not answer in time. It is intranet-only, so it may be slow or unreachable right now.',
  InvalidRequest:
    'An ATA code and a part number are both required. Fill them on the ATA Record first.',
}

const SIGNATURE_STATUS_COPY: Record<MaintainXSignatureFetchStatus, string> = {
  Fetched: 'Specimen imported from MaintainX.',
  ConnectorDisabled:
    'MaintainX signature import is not configured on this server. Upload the specimen manually.',
  UserIdNotMapped:
    'This user could not be matched to a MaintainX account. Add a MaintainXConnector:UserIdOverrides entry for the username.',
  UserNotFoundInMaintainX:
    'The mapped staff number does not exist in MaintainX. Verify the number with the user.',
  SignatureNotRegistered:
    'This user has never registered an electronic signature in MaintainX. Ask them to register one, or upload a specimen manually.',
  DownloadFailed:
    'The signature image URL was found but the bytes could not be downloaded. Nothing was saved — retry.',
  ContentInvalid:
    'The downloaded file is not a valid image (magic-number check failed), so it was rejected.',
  FileTooLarge: 'The MaintainX specimen exceeds the configured size limit and was rejected.',
  AuthenticationFailed:
    'MaintainX rejected the stored credentials or the session expired. Ask an administrator to check the connector configuration.',
  Unavailable: 'MaintainX did not answer in time. Nothing was saved.',
}

const IDENTITY_STATUS_COPY: Record<MaintainXIdentityStatus, string> = {
  Mapped: 'Matched to a MaintainX staff number.',
  SourceFieldEmpty: 'This user has no username, so no MaintainX account can be matched.',
  SourceFieldNotAStaffNumber:
    'The username is not a MaintainX staff number (e.g. 21041). Add a UserIdOverrides entry for it.',
  OverrideMissing:
    'UserIdSource is ConfigurationOverrideOnly and this username has no UserIdOverrides entry.',
}

export function describeEtPartNumberStatus(status: EtPartNumberStatus): string {
  return ET_PN_STATUS_COPY[status] ?? ET_PN_STATUS_COPY.NotResolved
}

export function describeSignatureFetchStatus(status: MaintainXSignatureFetchStatus): string {
  return SIGNATURE_STATUS_COPY[status] ?? SIGNATURE_STATUS_COPY.SignatureNotRegistered
}

export function describeIdentityStatus(status: MaintainXIdentityStatus): string {
  return IDENTITY_STATUS_COPY[status] ?? IDENTITY_STATUS_COPY.SourceFieldEmpty
}

/** True when the status is a transient/infrastructure problem worth retrying. */
export function isRetryableStatus(status: EtPartNumberStatus | MaintainXSignatureFetchStatus): boolean {
  return status === 'Unavailable' || status === 'AuthenticationFailed' || status === 'DownloadFailed'
}

// =====================================================================================
// 2. Parsing mirrors of MaintainXDetailParser (single behaviour, both tiers)
// =====================================================================================

/**
 * Matches a Maintenix Details entry such as `25H0026 (SLIDE AY)` and captures the stock
 * number plus the optional parenthesised description.
 */
const STOCK_ENTRY_PATTERN = /^\s*([^()\s][^()]*?)\s*(?:\(\s*([^()]*?)\s*\))?\s*$/

/**
 * Extracts ONLY the part number, dropping the description exactly as the requirement
 * specifies.
 *
 *   "25H0026 (SLIDE AY)"   -> "25H0026"
 *   "  25H0026(SLIDE AY) " -> "25H0026"
 *   "25H0026"              -> "25H0026"
 *   "(SLIDE AY)"           -> ""
 */
export function parseStockNumber(rawDetailEntry?: string | null): string {
  if (!rawDetailEntry) return ''
  const collapsed = rawDetailEntry.replace(/\s+/g, ' ').trim()
  if (!collapsed) return ''

  const match = STOCK_ENTRY_PATTERN.exec(collapsed)
  if (!match) return ''

  // A trailing separator such as "25H0026 -" or "25H0026:" is noise, not part of the P/N.
  return match[1].trim().replace(/[-:,;.]+$/, '').trim()
}

/** The parenthesised description. DIAGNOSTIC ONLY — never write this into the field. */
export function parseStockDescription(rawDetailEntry?: string | null): string {
  if (!rawDetailEntry) return ''
  const match = STOCK_ENTRY_PATTERN.exec(rawDetailEntry.replace(/\s+/g, ' ').trim())
  return match?.[2]?.trim() ?? ''
}

/**
 * v3 MIRROR of MaintainXDetailParser.IsPlausibleStockNumber: the strict shape test every
 * stock candidate must pass before it is chased upstream. A description such as
 * "EVACUATION SLIDE/RAFT, DOOR-3" contains whitespace, a comma and a slash — none of
 * which a Maintenix stock code ever does — so it is rejected here exactly as the C#
 * parser rejects it.
 *
 *   "25H0025"                       -> true
 *   "EVACUATION SLIDE/RAFT, DOOR-3" -> false
 *   "SLIDE AY"                      -> false
 *   "62210-00016-04"                -> true
 */
export function isPlausibleStockNumber(value?: string | null): boolean {
  if (!value) return false
  const candidate = value.trim()

  if (/\s/.test(candidate)) return false
  if (/[,/\\()]/.test(candidate)) return false
  if (candidate.length < 3 || candidate.length > 32) return false
  if (!/\d/.test(candidate)) return false
  if (!/^[A-Za-z0-9]/.test(candidate)) return false

  return /^[A-Za-z0-9.-]+$/.test(candidate)
}

/**
 * Normalises an ATA chapter code for MaintainX's `aTaskCd` field.
 * "25-39-44" and "253944" both become "253944"; a full task code such as
 * "EMEH2561330DTC-JIC" is returned unchanged because Maintenix accepts it verbatim.
 */
export function normalizeAtaCode(ataCode?: string | null): string {
  const trimmed = (ataCode ?? '').trim()
  if (!trimmed) return ''
  if (/[A-Za-z]/.test(trimmed)) return trimmed
  return trimmed.replace(/[-\s]/g, '')
}

/** Uppercase, alphanumeric-only form of a part number. */
export function canonicalPartNumber(partNumber?: string | null): string {
  if (!partNumber) return ''
  return partNumber.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
}

/** True when two part numbers refer to the same item (Maintenix prints 62773-336). */
export function partNumbersMatch(left?: string | null, right?: string | null): boolean {
  const a = canonicalPartNumber(left)
  return a.length > 0 && a === canonicalPartNumber(right)
}

// =====================================================================================
// 3. THE ET P/N FIELD AUDIT
//    The answer to "which listed forms actually carry an ET P/N: field".
//    Derived by inspecting every form component under
//    src/components/self-evaluation/forms — NOT by assumption.
// =====================================================================================

export interface EtPnFormAudit {
  /** Printed label of the node in the Table of Contents. */
  label: string
  /** Controlled document number, when the sheet carries one. */
  formNo: string
  /** Section of the Table of Contents the node sits under. */
  section: string
  /** TRUE only when the hard copy prints an "ET P/N:" box. */
  hasEtPartNumber: boolean
  /** Why — kept next to the flag so the audit cannot silently drift. */
  note: string
}

/**
 * Keyed by `FormNodeType`. Typed as `string` keys on purpose: this registry is a FLAT
 * audit table, and forcing exhaustiveness against FormNodeType would make adding a new
 * node a compile error instead of a review item.
 */
export const ET_PN_FORMS: Record<string, EtPnFormAudit> = {
  // ---- The ONLY two sheets with an ET P/N field --------------------------------------
  tna: {
    label: 'TNA',
    formNo: 'MNT-1229B',
    section: 'TOOLS AND EQUIPMENT',
    hasEtPartNumber: true,
    note: 'CMM DATA band prints "ET P/N:" beside REV.DATE.',
  },
  tool_need_analysis_report: {
    label: 'TOOL NEED ANALYSIS REPORT',
    formNo: 'MNT-1229B',
    section: 'TOOLS AND EQUIPMENT',
    hasEtPartNumber: true,
    note: 'Same MNT-1229B sheet as TNA, rendered in full-report variant, so it shares the ET P/N box.',
  },
  periodic_self_audit: {
    label: 'PERIODIC CAPABILITY SELF-AUDIT',
    formNo: 'MNT-1325',
    section: 'Promoted top-level',
    hasEtPartNumber: true,
    note: 'Prints a dedicated "ET-P/N:" row under the identity grid.',
  },

  // ---- Promoted top-level items: no ET P/N box ---------------------------------------
  confirmation_letter: {
    label: 'LETTER OF CONFIRMATION',
    formNo: 'ENG-751',
    section: 'Promoted top-level',
    hasEtPartNumber: false,
    note: 'Letter body plus Letter Ref. No; the hard copy has no stock-number field.',
  },
  request_letter: {
    label: 'AMENDMENT REQUEST',
    formNo: 'ENG-751',
    section: 'Promoted top-level',
    hasEtPartNumber: false,
    note: 'Letter body plus Letter Ref. No; the hard copy has no stock-number field.',
  },
  '918_faa': {
    label: '918 FAA',
    formNo: 'MNT 918',
    section: 'Promoted top-level',
    hasEtPartNumber: false,
    note: 'Capability list keyed by description / P/N / ATA only.',
  },
  '918a_caa': {
    label: '918 A CAA',
    formNo: 'MNT 918A',
    section: 'Promoted top-level',
    hasEtPartNumber: false,
    note: 'Capability list keyed by description / P/N / ATA only.',
  },

  // ---- DOCUMENTATION (4 forms) ------------------------------------------------------
  capability_self_evaluation: {
    label: 'CMM REV. STATUS / CAPABILITY SELF EVALUATION',
    formNo: '',
    section: 'DOCUMENTATION',
    hasEtPartNumber: false,
    note: 'Shows the CMM revision status; the ET Part No it displays comes from the CMM fetcher, not an editable ET P/N box.',
  },
  task_card: {
    label: 'TASK CARD',
    formNo: '',
    section: 'DOCUMENTATION',
    hasEtPartNumber: false,
    note: 'This tab is the SOURCE of the MaintainX PDF; it stores documents rather than printing an ET P/N field.',
  },
  sb: {
    label: 'SB',
    formNo: 'MNT-1420A',
    section: 'DOCUMENTATION / OTHERS',
    hasEtPartNumber: false,
    note: 'Service Bulletin list; no stock-number field.',
  },
  ad: {
    label: 'AD',
    formNo: 'MNT-1420B',
    section: 'DOCUMENTATION / OTHERS',
    hasEtPartNumber: false,
    note: 'Airworthiness Directive list; no stock-number field.',
  },

  // ---- TRAINING DOCUMENT (8 forms) --------------------------------------------------
  component_maintenance_training: {
    label: 'MAINTENANCE AND GENERIC COURSES',
    formNo: '',
    section: 'TRAINING DOCUMENT',
    hasEtPartNumber: false,
    note: 'Training verification sheet; personnel-keyed, no component stock number.',
  },
  training_verification_inspection: {
    label: 'TRAINING VERIFICATION (INSPECTION)',
    formNo: 'MNT-922B',
    section: 'TRAINING DOCUMENT',
    hasEtPartNumber: false,
    note: 'Training verification sheet; personnel-keyed.',
  },
  training_verification_technician: {
    label: 'TRAINING VERIFICATION (TECHNICIAN)',
    formNo: 'MNT-922C',
    section: 'TRAINING DOCUMENT',
    hasEtPartNumber: false,
    note: 'Training verification sheet; personnel-keyed.',
  },
  inspector_proficiency: {
    label: 'INSPECTION PROFICIENCY',
    formNo: 'MNT-1378',
    section: 'TRAINING DOCUMENT',
    hasEtPartNumber: false,
    note: 'Proficiency assessment; personnel-keyed.',
  },
  competency_assessment: {
    label: 'COMPETENCY ASSESSMENT',
    formNo: 'MNT 3.14-020',
    section: 'TRAINING DOCUMENT',
    hasEtPartNumber: false,
    note: 'Competency assessment; personnel-keyed.',
  },
  similar_technology: {
    label: 'SIMILAR TECHNOLOGY',
    formNo: '',
    section: 'TRAINING DOCUMENT',
    hasEtPartNumber: false,
    note: 'Technology-equivalence justification; no stock-number field.',
  },
  similar_task: {
    label: 'SIMILAR TASK',
    formNo: '',
    section: 'TRAINING DOCUMENT',
    hasEtPartNumber: false,
    note: 'Task-equivalence justification; no stock-number field.',
  },
  simple_task: {
    label: 'SIMPLE TASK',
    formNo: '',
    section: 'TRAINING DOCUMENT',
    hasEtPartNumber: false,
    note: 'Task-simplicity justification; no stock-number field.',
  },

  // ---- TOOLS AND EQUIPMENT (remaining 5 of 7) ---------------------------------------
  alternate_tools_equivalency: {
    label: 'ALTERNATE TOOLS EQUIVALENCY',
    formNo: '',
    section: 'TOOLS AND EQUIPMENT',
    hasEtPartNumber: false,
    note: 'Compares required vs alternate TOOL part numbers; the component ET P/N is not printed.',
  },
  inhouse_manufactured_tools: {
    label: 'IN-HOUSE MANUFACTURED TOOLS',
    formNo: '',
    section: 'TOOLS AND EQUIPMENT',
    hasEtPartNumber: false,
    note: 'Tool manufacturing card; keyed by tool P/N, not the component stock number.',
  },
  tool_mfg_jic: {
    label: 'TOOL MFG JIC',
    formNo: '',
    section: 'TOOLS AND EQUIPMENT',
    hasEtPartNumber: false,
    note: 'Job instruction card for tool manufacture.',
  },
  tool_risk_assessment: {
    label: 'TOOL RISK ASSESSMENT',
    formNo: '',
    section: 'TOOLS AND EQUIPMENT',
    hasEtPartNumber: false,
    note: 'Risk assessment sheet; no stock-number field.',
  },
  tool_mfg_form_1554: {
    label: 'TOOL MFG FORM',
    formNo: 'MNT-1554',
    section: 'TOOLS AND EQUIPMENT',
    hasEtPartNumber: false,
    note: 'Tool manufacturing form; keyed by tool P/N.',
  },

  // ---- FACILITY REQUIREMENT EVALUATION (3 forms) ------------------------------------
  repair_facility_evaluation: {
    label: 'REPAIR FACILITY EVALUATION',
    formNo: '',
    section: 'FACILITY REQUIREMENT EVALUATION',
    hasEtPartNumber: false,
    note: 'Facility checklist; no component stock number.',
  },
  cleaning_facility_evaluation: {
    label: 'CLEANING FACILITY EVALUATION',
    formNo: '',
    section: 'FACILITY REQUIREMENT EVALUATION',
    hasEtPartNumber: false,
    note: 'Facility checklist; no component stock number.',
  },
  environmental_facility_evaluation: {
    label: 'ENVIRONMENTAL FACILITY EVALUATION',
    formNo: '',
    section: 'FACILITY REQUIREMENT EVALUATION',
    hasEtPartNumber: false,
    note: 'Facility checklist; no component stock number.',
  },

  // ---- CONSUMABLES ------------------------------------------------------------------
  list_of_consumables: {
    label: 'LIST OF CONSUMABLES',
    formNo: '',
    section: 'CONSUMABLES',
    hasEtPartNumber: false,
    note: 'Rows carry CONSUMABLE part numbers; the component ET P/N is not printed.',
  },
  alternate_consumable_declaration: {
    label: 'ALTERNATE CONSUMABLE DECLARATION',
    formNo: '',
    section: 'CONSUMABLES',
    hasEtPartNumber: false,
    note: 'Declares an equivalent consumable; keyed by consumable P/N.',
  },

  // ---- Legacy node, still reachable for stored submissions --------------------------
  table_of_content: {
    label: 'TABLE OF CONTENT',
    formNo: '',
    section: 'Legacy',
    hasEtPartNumber: false,
    note: 'Index page only.',
  },
}

/** The audit, as the flat list the Admin/workspace can render. */
export const ET_PN_FORM_TYPES: string[] = Object.keys(ET_PN_FORMS).filter(
  key => ET_PN_FORMS[key].hasEtPartNumber,
)

/** TRUE only for the forms whose hard copy really prints an ET P/N box. */
export function hasEtPartNumberField(formType?: string | null): boolean {
  if (!formType) return false
  return ET_PN_FORMS[formType]?.hasEtPartNumber === true
}

/** The controlled document number recorded on the audit trail of a lookup. */
export function etPartNumberFormNo(formType?: string | null): string {
  if (!formType) return ''
  return ET_PN_FORMS[formType]?.formNo ?? ''
}

// =====================================================================================
// 4. Contract types (mirror the C# result objects)
// =====================================================================================

export interface MaintainXConnectorStatus {
  enabled: boolean
  /** "None" | "Scraper" | "Http" */
  provider: string
  etPartNumberEnabled: boolean
  signatureImportEnabled: boolean
  /** "Username" | "ConfigurationOverrideOnly" */
  userIdSource: string
  /** True when a live ET P/N lookup may actually be attempted. */
  canResolveEtPartNumber: boolean
  /** True when a live specimen import may actually be attempted. */
  canImportSignatures: boolean
}

export interface EtPartNumberRequest {
  ataCode: string
  partNumber: string
  /** Skips the search step when the TASK CARD tab already resolved the URL. */
  taskDefinitionUrl?: string
  /** "MNT-1229B" | "MNT-1325" — recorded on the audit trail. */
  formNo?: string
  ataRecordId?: string
}

export interface EtPartNumberResult {
  status: EtPartNumberStatus
  found: boolean
  /** THE VALUE THE FORM NEEDS: bare STOCK CODE, description stripped (NOT the Stock No). */
  etPartNumber: string
  /** Diagnostic only. NEVER concatenate this into the field. */
  etPartDescription: string
  rawDetailEntry: string
  /** The "Stock No:" cell read on the Details tab, e.g. "25H0026" — the LINK, not the answer. */
  stockNo: string
  /** The href of the stock entry that was clicked to reach the Stock Code page. */
  stockNoUrl: string
  /** The "Stock Code:" read behind the stock entry — equals etPartNumber when resolved. */
  stockCode: string

  ataCode: string
  partNumber: string
  taskCode: string
  taskDefinitionCode: string
  taskDefinitionName: string
  taskDefinitionUrl: string
  matchedApplicabilityPartNumber: string
  resolvedAtUtc: string
  provider: string

  message: string
  steps: string[]
  /** Every stock entry seen on the Details tab, when more than one exists. */
  candidates: string[]
}

export interface MaintainXIdentity {
  status: MaintainXIdentityStatus
  isMapped: boolean
  /** The MaintainX staff number, e.g. "21041". */
  maintainXUsername: string
  /**
   * v3: the canonical form (uppercase, alphanumeric-only, zero-padding dropped), so the
   * Admin table can prove "#105 · 21041 -> MaintainX 21041" without re-deriving the rule.
   */
  canonicalStaffNumber: string
  seUserId: number
  /** "Override" | "Username" */
  source: string
  message: string
}

export interface MaintainXSignatureImportResult {
  status: MaintainXSignatureFetchStatus
  /** True when a specimen version was actually created. */
  imported: boolean
  /** True when the bytes were identical and the version was intentionally not bumped. */
  skippedUnchanged: boolean
  maintainXUsername: string
  /** v3: canonicalised staff number echoed by the amended controller. */
  canonicalStaffNumber: string
  seUserId: number
  signatureId: string | null
  version: number
  contentType: string
  fileName: string
  sha256: string
  provider: string
  message: string
  steps: string[]
}

// =====================================================================================
// 5. Transport
// =====================================================================================

export class MaintainXApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'MaintainXApiError'
    this.status = status
  }
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

async function buildHeaders(method: string, json: boolean): Promise<Record<string, string>> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (json) headers['Content-Type'] = 'application/json'

  if (MUTATING_METHODS.has(method)) {
    try {
      const csrf = await getCsrfToken()
      if (csrf) {
        headers['X-CSRF-Token'] = csrf
        headers['X-Requested-With'] = 'XMLHttpRequest'
      }
    } catch {
      // A missing CSRF token is handled server side; never block the call here.
    }
  }
  return headers
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text().catch(() => '')

  if (!response.ok) {
    let message = `The MaintainX service returned HTTP ${response.status}.`
    if (response.status === 401) message = 'Your session has expired. Sign in again to continue.'
    if (response.status === 403) message = 'You do not have permission to use the MaintainX connector.'
    try {
      const parsed = JSON.parse(text) as { message?: string; errorMessage?: string; title?: string }
      message = parsed.errorMessage || parsed.message || parsed.title || message
    } catch {
      if (text && text.length < 300) message = text
    }
    throw new MaintainXApiError(message, response.status)
  }

  try {
    return JSON.parse(text) as T
  } catch {
    throw new MaintainXApiError('The MaintainX service returned a non-JSON response.', 502)
  }
}

async function call<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const headers = await buildHeaders(method, body !== undefined)
  let response: Response
  try {
    response = await fetch(`${MAINTAINX_PROXY_BASE}${path}`, {
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new MaintainXApiError(
      'The MaintainX service is unreachable. It is intranet-only, so check the connection and retry.',
      0,
    )
  }
  return readJson<T>(response)
}

// =====================================================================================
// 6. Normalisation helpers
// =====================================================================================

function pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) return raw[key]
    const pascal = key.charAt(0).toUpperCase() + key.slice(1)
    if (raw[pascal] !== undefined && raw[pascal] !== null) return raw[pascal]
  }
  return undefined
}

function str(value: unknown, fallback = ''): string {
  return value === undefined || value === null ? fallback : String(value)
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function bool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'boolean') return value
  const text = String(value).toLowerCase()
  return text === 'true' || text === '1' || text === 'yes'
}

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(item => str(item)).filter(Boolean)
  if (value && typeof value === 'object') {
    const nested = (value as Record<string, unknown>).$values
    if (Array.isArray(nested)) return nested.map(item => str(item)).filter(Boolean)
  }
  return []
}

/** Accepts "Resolved", "resolved" or the numeric ordinal 0. */
function toEnum<T extends string>(value: unknown, names: readonly T[], fallback: T): T {
  if (typeof value === 'number' && names[value] !== undefined) return names[value]
  const text = str(value).trim()
  if (!text) return fallback
  if (/^\d+$/.test(text)) {
    const byIndex = names[Number(text)]
    if (byIndex !== undefined) return byIndex
  }
  const match = names.find(name => name.toLowerCase() === text.toLowerCase())
  return match ?? fallback
}

// =====================================================================================
// 7. Endpoints
// =====================================================================================

/**
 * GET /api/maintainx/connector-status
 *
 * Drives whether the "Fetch from MaintainX" affordance is rendered at all. When the
 * endpoint is absent (backend not deployed yet) a DISABLED status is returned instead of
 * throwing, so the forms keep working with manual entry.
 */
export async function fetchConnectorStatus(): Promise<MaintainXConnectorStatus> {
  const disabled: MaintainXConnectorStatus = {
    enabled: false,
    provider: 'None',
    etPartNumberEnabled: false,
    signatureImportEnabled: false,
    userIdSource: 'Username',
    canResolveEtPartNumber: false,
    canImportSignatures: false,
  }

  try {
    const raw = await call<Record<string, unknown>>('/connector-status', 'GET')
    const payload = (pick(raw, 'data') as Record<string, unknown>) ?? raw
    const enabled = bool(pick(payload, 'enabled'))
    const provider = str(pick(payload, 'provider'), 'None')
    const etEnabled = bool(pick(payload, 'etPartNumberEnabled'), true)
    const signatureEnabled = bool(pick(payload, 'signatureImportEnabled'), true)
    const liveProvider = provider !== '' && provider.toLowerCase() !== 'none'

    return {
      enabled,
      provider,
      etPartNumberEnabled: etEnabled,
      signatureImportEnabled: signatureEnabled,
      userIdSource: str(pick(payload, 'userIdSource'), 'Username'),
      canResolveEtPartNumber:
        pick(payload, 'canResolveEtPartNumber') !== undefined
          ? bool(pick(payload, 'canResolveEtPartNumber'))
          : enabled && etEnabled && liveProvider,
      canImportSignatures:
        pick(payload, 'canImportSignatures') !== undefined
          ? bool(pick(payload, 'canImportSignatures'))
          : enabled && signatureEnabled && liveProvider,
    }
  } catch (error: unknown) {
    // A 403/404 means the connector surface is genuinely not available on this server —
    // that is an AUTHORITATIVE "disabled" and is safe to cache.
    const status = error instanceof MaintainXApiError ? error.status : -1
    const authoritative = status === 403 || status === 404
    if (authoritative) return disabled
    // 401 (session not established yet), 5xx (server warming / broken) and a network
    // failure (status 0) are TRANSIENT. Rethrow so the caller RETRIES on the next mount
    // instead of latching "disabled" for the whole session.
    throw error
  }
}

/**
 * POST /api/maintainx/et-part-number
 *
 * Never throws for a MaintainX-side condition: an InvalidRequest / Unavailable result is
 * returned so the caller can render a hint beside a still-editable input.
 */
export async function resolveEtPartNumber(request: EtPartNumberRequest): Promise<EtPartNumberResult> {
  const base: EtPartNumberResult = {
    status: 'NotResolved',
    found: false,
    etPartNumber: '',
    etPartDescription: '',
    rawDetailEntry: '',
    stockNo: '',
    stockNoUrl: '',
    stockCode: '',
    ataCode: request.ataCode ?? '',
    partNumber: request.partNumber ?? '',
    taskCode: normalizeAtaCode(request.ataCode),
    taskDefinitionCode: '',
    taskDefinitionName: '',
    taskDefinitionUrl: request.taskDefinitionUrl ?? '',
    matchedApplicabilityPartNumber: '',
    resolvedAtUtc: '',
    provider: 'None',
    message: '',
    steps: [],
    candidates: [],
  }

  if (!request.ataCode?.trim() || !request.partNumber?.trim()) {
    return {
      ...base,
      status: 'InvalidRequest',
      message: describeEtPartNumberStatus('InvalidRequest'),
    }
  }

  let raw: Record<string, unknown>
  try {
    raw = await call<Record<string, unknown>>('/et-part-number', 'POST', {
      ataCode: request.ataCode.trim(),
      partNumber: request.partNumber.trim(),
      taskDefinitionUrl: request.taskDefinitionUrl || undefined,
      formNo: request.formNo || undefined,
      ataRecordId: request.ataRecordId || undefined,
    })
  } catch (error: unknown) {
    const status: EtPartNumberStatus =
      error instanceof MaintainXApiError && error.status === 404 ? 'ConnectorDisabled' : 'Unavailable'
    return {
      ...base,
      status,
      message: error instanceof Error ? error.message : describeEtPartNumberStatus(status),
    }
  }

  const payload = (pick(raw, 'data') as Record<string, unknown>) ?? raw
  const status = toEnum(pick(payload, 'status'), ET_PN_STATUS_NAMES, 'NotResolved')

  // Sanitise defensively: even a compliant server value goes through the same parser AND
  // the same shape rules, so "25H0026 (SLIDE AY)" can never reach the ET P/N cell with its
  // description attached, and a description-only string can never arrive at all.
  const rawDetailEntry = str(pick(payload, 'rawDetailEntry'))
  const serverStockCode = str(pick(payload, 'stockCode'))
  const serverValue = str(pick(payload, 'etPartNumber'))
  const parsed = parseStockNumber(serverStockCode) || parseStockNumber(serverValue) || parseStockNumber(rawDetailEntry)
  const etPartNumber = isPlausibleStockNumber(parsed) ? parsed : ''

  return {
    status,
    found: Boolean(etPartNumber) && status === 'Resolved',
    etPartNumber,
    etPartDescription: str(pick(payload, 'etPartDescription')) || parseStockDescription(rawDetailEntry),
    rawDetailEntry,
    stockNo: str(pick(payload, 'stockNo')) || parseStockNumber(rawDetailEntry),
    stockNoUrl: str(pick(payload, 'stockNoUrl')),
    stockCode: serverStockCode || serverValue,
    ataCode: str(pick(payload, 'ataCode'), base.ataCode),
    partNumber: str(pick(payload, 'partNumber'), base.partNumber),
    taskCode: str(pick(payload, 'taskCode'), base.taskCode),
    taskDefinitionCode: str(pick(payload, 'taskDefinitionCode')),
    taskDefinitionName: str(pick(payload, 'taskDefinitionName')),
    taskDefinitionUrl: str(pick(payload, 'taskDefinitionUrl'), base.taskDefinitionUrl),
    matchedApplicabilityPartNumber: str(pick(payload, 'matchedApplicabilityPartNumber')),
    resolvedAtUtc: str(pick(payload, 'resolvedAtUtc')),
    provider: str(pick(payload, 'provider'), 'None'),
    message: str(pick(payload, 'message')) || describeEtPartNumberStatus(status),
    steps: list(pick(payload, 'steps')),
    candidates: list(pick(payload, 'candidates')),
  }
}

/**
 * GET /api/maintainx/user-identity?userId={id}
 *
 * "The system should automatically align the user ID from the Self-Evaluation module with
 *  the existing MaintainX user ID." The API answers with the resolver's verdict; the UI
 * only renders it, so the mapping rule lives in exactly one place.
 */
export async function fetchMaintainXIdentity(userId: number): Promise<MaintainXIdentity> {
  const base: MaintainXIdentity = {
    status: 'SourceFieldEmpty',
    isMapped: false,
    maintainXUsername: '',
    canonicalStaffNumber: '',
    seUserId: userId,
    source: '',
    message: '',
  }

  let raw: Record<string, unknown>
  try {
    raw = await call<Record<string, unknown>>(`/user-identity?userId=${encodeURIComponent(String(userId))}`, 'GET')
  } catch (error: unknown) {
    return { ...base, message: error instanceof Error ? error.message : describeIdentityStatus('SourceFieldEmpty') }
  }

  const payload = (pick(raw, 'data') as Record<string, unknown>) ?? raw
  const status = toEnum(pick(payload, 'status'), IDENTITY_STATUS_NAMES, 'SourceFieldEmpty')
  const maintainXUsername = str(pick(payload, 'maintainXUsername', 'maintainXUserName', 'username'))

  return {
    status,
    isMapped:
      pick(payload, 'isMapped') !== undefined
        ? bool(pick(payload, 'isMapped'))
        : status === 'Mapped' && Boolean(maintainXUsername),
    maintainXUsername,
    canonicalStaffNumber: str(pick(payload, 'canonicalStaffNumber')),
    seUserId: num(pick(payload, 'seUserId'), userId),
    source: str(pick(payload, 'source')),
    message: str(pick(payload, 'message')) || describeIdentityStatus(status),
  }
}

/**
 * POST /api/maintainx/signatures/import  { userId }
 *
 * The API walks References -> user details -> Electronic Signature, verifies the returned
 * username matches the requested staff number through the canonicaliser, and hands the
 * bytes to IUserSignatureService.UploadAsync — which keeps versioning,
 * supersede-and-revoke and the audit log in one place. This client never writes storage
 * paths and never receives one.
 */
export async function importMaintainXSignature(userId: number): Promise<MaintainXSignatureImportResult> {
  const base: MaintainXSignatureImportResult = {
    status: 'Unavailable',
    imported: false,
    skippedUnchanged: false,
    maintainXUsername: '',
    canonicalStaffNumber: '',
    seUserId: userId,
    signatureId: null,
    version: 0,
    contentType: '',
    fileName: '',
    sha256: '',
    provider: 'None',
    message: '',
    steps: [],
  }

  let raw: Record<string, unknown>
  try {
    raw = await call<Record<string, unknown>>('/signatures/import', 'POST', { userId })
  } catch (error: unknown) {
    const status: MaintainXSignatureFetchStatus =
      error instanceof MaintainXApiError && error.status === 404 ? 'ConnectorDisabled' : 'Unavailable'
    return {
      ...base,
      status,
      message: error instanceof Error ? error.message : describeSignatureFetchStatus(status),
    }
  }

  const payload = (pick(raw, 'data') as Record<string, unknown>) ?? raw
  const status = toEnum(pick(payload, 'status'), SIGNATURE_FETCH_STATUS_NAMES, 'SignatureNotRegistered')
  const signatureId = str(pick(payload, 'signatureId', 'userSignatureId')) || null

  return {
    status,
    imported:
      pick(payload, 'imported') !== undefined
        ? bool(pick(payload, 'imported'))
        : status === 'Fetched' && Boolean(signatureId),
    skippedUnchanged: bool(pick(payload, 'skippedUnchanged')),
    maintainXUsername: str(pick(payload, 'maintainXUsername', 'maintainXUserName')),
    canonicalStaffNumber: str(pick(payload, 'canonicalStaffNumber')),
    seUserId: num(pick(payload, 'seUserId'), userId),
    signatureId,
    version: num(pick(payload, 'version')),
    contentType: str(pick(payload, 'contentType')),
    fileName: str(pick(payload, 'fileName')),
    sha256: str(pick(payload, 'sha256')).slice(0, 12),
    provider: str(pick(payload, 'provider'), 'None'),
    message: str(pick(payload, 'message')) || describeSignatureFetchStatus(status),
    steps: list(pick(payload, 'steps')),
  }
}

/** UTC formatter matching the signature admin, so provenance reads identically. */
export function formatMaintainXUtc(value?: string | null): string {
  if (!value) return '—'
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  const iso = date.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}