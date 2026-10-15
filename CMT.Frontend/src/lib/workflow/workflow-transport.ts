/**
 * =====================================================================================
 * AMENDED v17 - PHASE 1 (FRONTEND)
 * CMT.Frontend/src/lib/workflow/workflow-transport.ts                       (NEW FILE)
 * Copy to: CMT.Frontend/src/lib/workflow/workflow-transport.ts
 *
 * WHAT THIS FILE IS
 * -----------------
 * The PLUGGABLE TRANSPORT and the UNIFORM ErrorCode SURFACE required by Phase 1. It owns
 * the four concerns that were previously buried inside `workflow-api.ts`:
 *
 *   1. how a request is actually sent            -> WorkflowTransport (swappable)
 *   2. how a payload is normalised               -> camelizeDeep / toArray
 *   3. how a failure becomes a typed error       -> WorkflowApiError + errorCode
 *   4. how a binary answer (the folder PDF)      -> WorkflowBlob pass-through
 *      is handed back
 *
 * WHY IT IS NEEDED
 * ----------------
 * v13 hardcoded `fetch` inside its private `request()` helper. Three consequences:
 *   - the client could not be pointed anywhere else without editing library code, so the
 *     "swapping real database -> real API is one switch" requirement was impossible;
 *   - `getFolderReport` had no way to return a binary body, so requirement #11 (download
 *     the consolidated PDF) could only be done by leaving the SPA with a raw <a href>,
 *     which loses the HttpOnly cookie under a cross-origin base URL;
 *   - a non-JSON answer (the Next.js 404 HTML page produced by the missing proxy routes)
 *     collapsed into the generic "The action could not be completed." with NO errorCode,
 *     which is exactly why the whole Functional Workflow Matrix looked silently dead.
 *
 * UNIFORM ErrorCode SURFACING - THE CONTRACT
 * ------------------------------------------
 * Every non-2xx answer becomes a `WorkflowApiError` carrying:
 *   .status     the HTTP status, PASSED THROUGH UNCHANGED
 *   .errorCode  a WorkflowErrorCodes value, ALWAYS non-null
 *   .message    a sentence safe to toast
 *   .payload    the camelised body, for a details panel
 *
 * When the server supplies no code, one is DERIVED from the status so a component can
 * still branch on a stable vocabulary instead of string-matching a message:
 *   401 / 403 -> PERMISSION_DENIED     404 -> INSTANCE_NOT_FOUND
 *   409       -> ALREADY_COMPLETED     422 -> REQUIRED_FIELDS_MISSING
 *   0         -> TRANSPORT_UNAVAILABLE (network / abort / proxy down)
 *   504       -> TRANSPORT_TIMEOUT
 *
 * BINDING RULES
 *   (1) NEVER rewrite ids on the way out. User ids are numbers (C# long), entity ids are
 *       strings (C# Guid). This layer serialises the body verbatim.
 *   (2) NEVER collapse a status. The specific rule (ASSIGNEE_OUTSIDE_SHOP,
 *       REGULATORY_DATE_REACHED, MANDATORY_FORMS_PENDING, ...) is the whole vocabulary the
 *       UI reacts to.
 *   (3) A replacement transport MUST honour the same envelope, including `status` and
 *       `errorCode`, otherwise the resolvers of `workflow-permissions.ts` lose their
 *       reasons and every control goes back to being blindly enabled.
 * =====================================================================================
 */

import {
  WORKFLOW_REQUESTED_WITH,
  WORKFLOW_REQUEST_TIMEOUT_MS,
  apiUrl,
} from '@/lib/workflow/workflow-config'
import { workflowErrorMessage } from '@/lib/workflow/workflow-types'

// =====================================================================================
// 1. ERROR CODES THIS LAYER CAN ADD ON TOP OF WorkflowErrorCodes
// =====================================================================================

/**
 * Transport-level codes. They are deliberately NOT in `WorkflowErrorCodes` because the
 * server can never return them: they describe a failure that happened BEFORE or INSTEAD
 * OF a server answer.
 */
export const TRANSPORT_ERROR_CODES = {
  /** Network down, DNS failure, proxy route missing, CORS refusal. */
  Unavailable: 'TRANSPORT_UNAVAILABLE',
  /** The request was aborted after WORKFLOW_REQUEST_TIMEOUT_MS. */
  Timeout: 'TRANSPORT_TIMEOUT',
  /** A 2xx answer whose body was not the JSON the contract declares. */
  MalformedResponse: 'TRANSPORT_MALFORMED_RESPONSE',
  /** A client-side guard refused the payload before it was sent. */
  InvalidRequest: 'TRANSPORT_INVALID_REQUEST',
} as const

export type TransportErrorCode =
  (typeof TRANSPORT_ERROR_CODES)[keyof typeof TRANSPORT_ERROR_CODES]

const TRANSPORT_ERROR_MESSAGES: Record<string, string> = {
  TRANSPORT_UNAVAILABLE: 'The workflow service is unreachable.',
  TRANSPORT_TIMEOUT: 'The workflow service did not answer in time.',
  TRANSPORT_MALFORMED_RESPONSE: 'The workflow service returned an unexpected answer.',
  TRANSPORT_INVALID_REQUEST: 'The request was incomplete, so it was not sent.',
}

/** Derives a stable code from a bare HTTP status when the server supplied none. */
export function errorCodeFromStatus(status: number): string {
  if (status === 0) return TRANSPORT_ERROR_CODES.Unavailable
  if (status === 401 || status === 403) return 'PERMISSION_DENIED'
  if (status === 404) return 'INSTANCE_NOT_FOUND'
  if (status === 409) return 'ALREADY_COMPLETED'
  if (status === 422) return 'REQUIRED_FIELDS_MISSING'
  if (status === 504) return TRANSPORT_ERROR_CODES.Timeout
  if (status >= 500) return TRANSPORT_ERROR_CODES.Unavailable
  return 'PERMISSION_DENIED'
}

// =====================================================================================
// 2. THE TYPED ERROR  (single error type for the whole workflow surface)
// =====================================================================================

export class WorkflowApiError extends Error {
  /** HTTP status, or 0 when no answer was ever received. */
  readonly status: number
  /** ALWAYS non-null - derived from the status when the server supplied none. */
  readonly errorCode: string
  /** Camelised response body, for a details panel. */
  readonly payload: unknown
  /** The method + path that failed, for a support ticket. */
  readonly requestSummary: string

  constructor(args: {
    status: number
    message?: string | null
    errorCode?: string | null
    payload?: unknown
    requestSummary?: string
  }) {
    const code = args.errorCode && args.errorCode.trim() !== ''
      ? args.errorCode.trim()
      : errorCodeFromStatus(args.status)

    const text =
      (args.message && args.message.trim() !== '' ? args.message.trim() : '') ||
      TRANSPORT_ERROR_MESSAGES[code] ||
      workflowErrorMessage({ errorCode: code })

    super(text)
    this.name = 'WorkflowApiError'
    this.status = args.status
    this.errorCode = code
    this.payload = args.payload ?? null
    this.requestSummary = args.requestSummary ?? ''
  }

  /** True for a failure that a retry could plausibly fix. */
  get isRetryable(): boolean {
    return (
      this.errorCode === TRANSPORT_ERROR_CODES.Unavailable ||
      this.errorCode === TRANSPORT_ERROR_CODES.Timeout ||
      this.status >= 500
    )
  }

  /** True when the caller must re-authenticate rather than change the payload. */
  get isUnauthorized(): boolean {
    return this.status === 401
  }
}

/** Narrows an unknown catch value into the uniform surface. */
export function asWorkflowApiError(error: unknown): WorkflowApiError {
  if (error instanceof WorkflowApiError) return error
  if (error instanceof Error) {
    const aborted = error.name === 'AbortError'
    return new WorkflowApiError({
      status: aborted ? 504 : 0,
      message: aborted ? null : error.message,
      errorCode: aborted ? TRANSPORT_ERROR_CODES.Timeout : TRANSPORT_ERROR_CODES.Unavailable,
    })
  }
  return new WorkflowApiError({ status: 0, errorCode: TRANSPORT_ERROR_CODES.Unavailable })
}

// =====================================================================================
// 3. CASING NORMALISATION  (moved out of v13 unchanged in behaviour)
//    ASP.NET may serialise PascalCase depending on the JsonSerializerOptions in use, and
//    ReferenceHandler.Preserve wraps arrays in { $values: [...] }. Both are flattened once,
//    deeply, so no per-DTO normaliser is ever needed.
// =====================================================================================

function camelKey(key: string): string {
  if (!key) return key
  if (key === key.toLowerCase()) return key
  let upperRun = 0
  while (
    upperRun < key.length &&
    key[upperRun] === key[upperRun].toUpperCase() &&
    /[A-Z]/.test(key[upperRun])
  ) {
    upperRun += 1
  }
  if (upperRun === 0) return key
  if (upperRun === key.length) return key.toLowerCase()
  if (upperRun === 1) return key[0].toLowerCase() + key.slice(1)
  // "ATARecordId" -> "ataRecordId", "QAPersonnel" -> "qaPersonnel"
  return key.slice(0, upperRun - 1).toLowerCase() + key.slice(upperRun - 1)
}

export function camelizeDeep<T>(input: unknown): T {
  if (Array.isArray(input)) {
    return input.map(item => camelizeDeep(item)) as unknown as T
  }
  if (input && typeof input === 'object') {
    const source = input as Record<string, unknown>
    if (Array.isArray(source.$values)) {
      return camelizeDeep(source.$values) as unknown as T
    }
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(source)) {
      if (key === '$id' || key === '$ref') continue
      out[camelKey(key)] = camelizeDeep(value)
    }
    return out as T
  }
  return input as T
}

/** Tolerates `[]`, `{ data: [] }`, `{ items: [] }`, `{ results: [] }`, `{ $values: [] }`. */
export function toArray<T>(payload: unknown): T[] {
  const value = camelizeDeep<unknown>(payload)
  if (!value) return []
  if (Array.isArray(value)) return value as T[]
  const obj = value as Record<string, unknown>
  for (const key of ['data', 'items', 'payload', 'results', 'rows']) {
    if (Array.isArray(obj[key])) return obj[key] as T[]
  }
  return []
}

// =====================================================================================
// 4. THE TRANSPORT CONTRACT
// =====================================================================================

export type WorkflowHttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export type WorkflowQuery = Record<
  string,
  string | number | boolean | null | undefined
>

export interface WorkflowRequestSpec {
  method: WorkflowHttpMethod
  /** Route-table path, ALWAYS starting with `/api/`. Never an absolute URL. */
  path: string
  query?: WorkflowQuery
  /** Serialised verbatim. Ids are NOT rewritten here. */
  body?: unknown
  /** `json` (default) or `blob` for the consolidated folder PDF. */
  expect?: 'json' | 'blob' | 'void'
  signal?: AbortSignal
}

/** A binary answer, kept together with the file name from Content-Disposition. */
export interface WorkflowBlob {
  blob: Blob
  fileName: string
  contentType: string
}

export interface WorkflowResponseEnvelope<T> {
  ok: boolean
  status: number
  /** Camelised JSON body, or null for a 204 / blob answer. */
  data: T | null
  blob: WorkflowBlob | null
  errorCode: string | null
  message: string | null
}

/**
 * THE SWAP POINT. Implement this interface and hand it to `setWorkflowTransport()` to move
 * the whole client onto a different backend without touching a single call site.
 */
export interface WorkflowTransport {
  readonly name: string
  send<T>(spec: WorkflowRequestSpec): Promise<WorkflowResponseEnvelope<T>>
}

// =====================================================================================
// 5. THE DEFAULT FETCH TRANSPORT
// =====================================================================================

function buildQueryString(query?: WorkflowQuery): string {
  if (!query) return ''
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

function fileNameFrom(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback
  const utf8 = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1].trim())
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = disposition.match(/filename="?([^";]+)"?/i)
  return plain ? plain[1].trim() : fallback
}

/**
 * Sends through `fetch` with `credentials: 'include'`, so the HttpOnly access_token cookie
 * is attached by the browser and forwarded by the Next.js proxy. NO bearer token is ever
 * read in client code.
 */
export function createFetchTransport(): WorkflowTransport {
  return {
    name: 'fetch',

    async send<T>(spec: WorkflowRequestSpec): Promise<WorkflowResponseEnvelope<T>> {
      const url = apiUrl(`${spec.path}${buildQueryString(spec.query)}`)
      const hasBody = spec.body !== undefined && spec.body !== null

      const headers: Record<string, string> = {
        Accept: spec.expect === 'blob' ? 'application/pdf, application/json' : 'application/json',
        'X-Requested-With': WORKFLOW_REQUESTED_WITH,
      }
      if (hasBody) headers['Content-Type'] = 'application/json'

      // A caller-supplied signal wins; otherwise the shared timeout applies.
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), WORKFLOW_REQUEST_TIMEOUT_MS)
      if (spec.signal) {
        if (spec.signal.aborted) controller.abort()
        else spec.signal.addEventListener('abort', () => controller.abort(), { once: true })
      }

      let response: Response
      try {
        response = await fetch(url, {
          method: spec.method,
          headers,
          body: hasBody ? JSON.stringify(spec.body) : undefined,
          credentials: 'include',
          cache: 'no-store',
          signal: controller.signal,
        })
      } catch (caught) {
        clearTimeout(timeoutId)
        const aborted = caught instanceof Error && caught.name === 'AbortError'
        return {
          ok: false,
          status: aborted ? 504 : 0,
          data: null,
          blob: null,
          errorCode: aborted
            ? TRANSPORT_ERROR_CODES.Timeout
            : TRANSPORT_ERROR_CODES.Unavailable,
          message: null,
        }
      } finally {
        clearTimeout(timeoutId)
      }

      if (response.status === 204) {
        return { ok: true, status: 204, data: null, blob: null, errorCode: null, message: null }
      }

      const contentType = response.headers.get('content-type') || ''

      // Requirement #11: the consolidated folder PDF keeps its file name.
      const isBinary =
        contentType.includes('application/pdf') ||
        contentType.includes('application/octet-stream') ||
        contentType.includes('application/zip')

      if (response.ok && isBinary) {
        const blob = await response.blob()
        return {
          ok: true,
          status: response.status,
          data: null,
          blob: {
            blob,
            contentType,
            fileName: fileNameFrom(
              response.headers.get('content-disposition'),
              'self-evaluation-report.pdf',
            ),
          },
          errorCode: null,
          message: null,
        }
      }

      const rawText = await response.text().catch(() => '')
      let parsed: unknown = null
      if (rawText) {
        try {
          parsed = JSON.parse(rawText)
        } catch {
          // The Next.js 404 HTML page lands here. Surfacing it as a code instead of as a
          // generic message is what makes a missing proxy route diagnosable.
          parsed = { message: response.ok ? '' : rawText.slice(0, 300) }
        }
      }

      const body = camelizeDeep<Record<string, unknown>>(parsed ?? {})

      if (!response.ok) {
        const errorCode =
          (typeof body.errorCode === 'string' && body.errorCode) ||
          (typeof body.code === 'string' && body.code) ||
          null
        const message =
          (typeof body.message === 'string' && body.message) ||
          (typeof body.title === 'string' && body.title) ||
          (typeof body.detail === 'string' && body.detail) ||
          null
        return { ok: false, status: response.status, data: null, blob: null, errorCode, message }
      }

      return {
        ok: true,
        status: response.status,
        data: body as unknown as T,
        blob: null,
        errorCode: null,
        message: null,
      }
    },
  }
}

// =====================================================================================
// 6. THE ACTIVE TRANSPORT  (the "one switch")
// =====================================================================================

let activeTransport: WorkflowTransport = createFetchTransport()

/**
 * Replaces the transport for the whole client. Pass `null` to restore the default.
 * A replacement MUST return the same envelope, `status` and `errorCode` included.
 */
export function setWorkflowTransport(transport: WorkflowTransport | null): void {
  activeTransport = transport ?? createFetchTransport()
}

export function getWorkflowTransport(): WorkflowTransport {
  return activeTransport
}

/**
 * Alias used by `workflow-api.ts` (`workflowTransport().request(...)`).
 * Kept as a function so a later `setWorkflowTransport()` swap is always seen.
 */
export function workflowTransport(): WorkflowTransport {
  return activeTransport
}

// =====================================================================================
// 7. THE FOUR PRIMITIVES EVERY API METHOD USES
// =====================================================================================

function summarise(spec: WorkflowRequestSpec): string {
  return `${spec.method} ${spec.path}`
}

/** Sends and THROWS a WorkflowApiError on any non-2xx answer. */
export async function sendWorkflow<T>(spec: WorkflowRequestSpec): Promise<T> {
  let envelope: WorkflowResponseEnvelope<T>
  try {
    envelope = await activeTransport.send<T>(spec)
  } catch (caught) {
    const error = asWorkflowApiError(caught)
    throw new WorkflowApiError({
      status: error.status,
      message: error.message,
      errorCode: error.errorCode,
      payload: error.payload,
      requestSummary: summarise(spec),
    })
  }

  if (!envelope.ok) {
    throw new WorkflowApiError({
      status: envelope.status,
      message: envelope.message,
      errorCode: envelope.errorCode,
      payload: envelope.data,
      requestSummary: summarise(spec),
    })
  }

  if (spec.expect === 'void') return undefined as unknown as T
  return (envelope.data ?? ({} as T)) as T
}

export function getJson<T>(path: string, query?: WorkflowQuery): Promise<T> {
  return sendWorkflow<T>({ method: 'GET', path, query })
}

export async function getList<T>(path: string, query?: WorkflowQuery): Promise<T[]> {
  const payload = await sendWorkflow<unknown>({ method: 'GET', path, query })
  return toArray<T>(payload)
}

export function postJson<T>(path: string, body?: unknown): Promise<T> {
  return sendWorkflow<T>({ method: 'POST', path, body })
}

export function putJson<T>(path: string, body?: unknown): Promise<T> {
  return sendWorkflow<T>({ method: 'PUT', path, body })
}

export function deleteJson<T>(path: string): Promise<T> {
  return sendWorkflow<T>({ method: 'DELETE', path })
}

/** 204 No Content endpoints (e.g. mark a notification read). */
export async function postNoContent(path: string, body?: unknown): Promise<void> {
  await sendWorkflow<void>({ method: 'POST', path, body, expect: 'void' })
}

/** Binary endpoints (the consolidated folder PDF of requirement #11). */
export async function getBlob(path: string, query?: WorkflowQuery): Promise<WorkflowBlob> {
  const envelope = await activeTransport.send<unknown>({
    method: 'GET',
    path,
    query,
    expect: 'blob',
  })

  if (!envelope.ok || !envelope.blob) {
    throw new WorkflowApiError({
      status: envelope.status,
      message: envelope.message,
      errorCode: envelope.errorCode ?? TRANSPORT_ERROR_CODES.MalformedResponse,
      payload: envelope.data,
      requestSummary: `GET ${path}`,
    })
  }

  return envelope.blob
}

/**
 * Guard applied before every request that carries a user id. It converts the many shapes a
 * component may hold (string from a <Select>, number from the API, `user.userId`) into the
 * C# long the contract demands, and refuses anything else instead of letting the server
 * answer 400 application/problem+json.
 */
export function toUserId(value: string | number | null | undefined): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new WorkflowApiError({
      status: 0,
      message: 'A valid user must be selected before this action can be sent.',
      errorCode: TRANSPORT_ERROR_CODES.InvalidRequest,
      payload: { received: value },
    })
  }
  return parsed
}

/** Guard for a C# Guid path segment: refuses an empty id before building a bad URL. */
export function toEntityId(value: string | null | undefined, label = 'record'): string {
  const trimmed = (value ?? '').trim()
  if (trimmed === '') {
    throw new WorkflowApiError({
      status: 0,
      message: `No ${label} was selected, so the request was not sent.`,
      errorCode: TRANSPORT_ERROR_CODES.InvalidRequest,
      payload: { received: value },
    })
  }
  return trimmed
}