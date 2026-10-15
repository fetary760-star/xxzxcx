/**
 * =====================================================================================
 * PHASE 1 — AMENDED v2  (REPLACES the existing file)
 * Copy to: CMT.Frontend/src/lib/signature-api.ts
 *
 * WHAT CHANGED vs v1, AND WHY
 * ---------------------------
 * v1 was written for a Vite host: it read a bearer token out of `localStorage`
 * (`se.auth.token`, `accessToken`, ...), decoded the JWT in the browser to discover
 * the current role, and shipped a ~200-line in-memory DEMO DATASET guarded by
 * `import.meta.env.DEV`. Three consequences in THIS repository, which is a Next.js
 * app-directory host:
 *
 *   (1) `import.meta.env` does not exist under Next.js — the module throws at build
 *       time in a production build.
 *   (2) The app authenticates with an HttpOnly `access_token` cookie forwarded by a
 *       route handler (see `workflow-proxy.ts`, `proxy-auth.ts`). There is NO token
 *       in `localStorage`, so `authHeaders()` always produced an anonymous request
 *       and every call answered 401 — then fell back to fake data in dev, which hid
 *       the failure until production.
 *   (3) Reading the role from a client-decoded JWT contradicts `useAuth()`, the one
 *       principal source used everywhere else.
 *
 * v2 therefore:
 *   - routes every call through the Next.js proxy added in this phase
 *     (`src/app/api/admin/signatures/[[...path]]/route.ts`) with
 *     `credentials: 'include'`, so the HttpOnly cookie is forwarded server side and
 *     no token is ever touched in client code;
 *   - sends `X-CSRF-Token` on POST/DELETE, mirroring `ApiClient.uploadAttachment`;
 *   - DELETES the demo dataset and the JWT decoding entirely — a failure is now
 *     reported as a failure;
 *   - keeps the whole public surface v1 exposed (types, error codes, validation,
 *     formatters) so existing imports keep compiling, and ADDS the response
 *     normalisers the panel needs (`$values` / `{data:[]}` envelopes, PascalCase).
 *
 * CONTRACT MIRROR
 *   CMT.Application/Contracts/Signature/SignatureApiContracts.cs
 *     UserSignatureResponse   <-> UserSignatureResponse
 *     SignatureCoverageRow    <-> SignatureCoverageRow
 *     SignatureStampResult    <-> SignatureStampResult   (consumed in Phase 2)
 *     SignatureErrorCodes     <-> SignatureErrorCodes
 *
 * SECURITY INVARIANT
 *   `storagePath` is not part of any type in this file and is never requested. A
 *   specimen is rendered ONLY by fetching `/api/admin/signatures/{id}/file` with the
 *   session credentials and wrapping the bytes in a short-lived object URL, so no
 *   credential and no bucket key ever appears in markup.
 * =====================================================================================
 */

import { getCsrfToken } from '@/lib/csrf'

// ---------------------------------------------------------------------------
// 1. Contract types
// ---------------------------------------------------------------------------

/** Result of POST /api/admin/signatures — mirrors UserSignatureResponse. */
export interface UserSignatureResponse {
  id: string
  userId: number
  userFullName: string
  userRole: string
  userRoleLabel: string
  fileName: string
  contentType: string
  /** "Image" or "Pdf". */
  fileKind: string
  fileSizeBytes: number
  /** Short hash prefix, for the admin table only. */
  fileSha256Short: string
  isActive: boolean
  version: number
  uploadedAt: string
  uploadedBy: string
  revokedAt: string | null
  /** Authorised streaming endpoint, e.g. "/api/admin/signatures/{id}/file". */
  fileUrl: string
  remarks: string
}

/** One row of the coverage table — mirrors SignatureCoverageRow. */
export interface SignatureCoverageRow {
  userId: number
  fullName: string
  username: string
  role: string
  roleLabel: string
  isActiveUser: boolean
  /** False = this user cannot have an image stamped on approval yet. */
  hasActiveSignature: boolean
  signatureId: string | null
  uploadedAt: string | null
  version: number
  fileUrl: string
  /** True when the role signs forms, so a missing specimen is a real gap. */
  isApproverRole: boolean
  /** Optional; rendered when the API supplies it. */
  fileSha256Short?: string
  /** Optional; how many versions exist in total for this user. */
  totalVersions?: number
}

/**
 * Outcome of one stamping attempt — mirrors SignatureStampResult. Returned inside
 * `WorkflowActionResponse` and consumed by the Phase 2 signature block.
 */
export interface SignatureStampResult {
  applied: boolean
  userSignatureId: string | null
  signerName: string
  signerRole: string
  signedAtUtc: string
  signatureHash: string
  /** Populated when `applied` is false, e.g. "no active specimen on file". */
  warning?: string | null
}

/** Error codes returned by the API — mirrors SignatureErrorCodes. */
export const SignatureErrorCodes = {
  UserNotFound: 'SIGNATURE_USER_NOT_FOUND',
  FileMissing: 'SIGNATURE_FILE_MISSING',
  FileTooLarge: 'SIGNATURE_FILE_TOO_LARGE',
  ContentTypeInvalid: 'SIGNATURE_CONTENT_TYPE_INVALID',
  ExtensionInvalid: 'SIGNATURE_EXTENSION_INVALID',
  ContentMalformed: 'SIGNATURE_CONTENT_MALFORMED',
  NotFound: 'SIGNATURE_NOT_FOUND',
  AdminOnly: 'SIGNATURE_ADMIN_ONLY',
  StorageFailure: 'SIGNATURE_STORAGE_FAILURE',
} as const

/** Operator-facing copy per code: what happened, why, what to do next. */
const ERROR_COPY: Record<string, string> = {
  [SignatureErrorCodes.UserNotFound]:
    'That user no longer exists. Refresh the coverage table and pick the user again.',
  [SignatureErrorCodes.FileMissing]: 'No file reached the server. Choose a specimen and upload again.',
  [SignatureErrorCodes.FileTooLarge]: 'The specimen exceeds the 2 MB limit. Crop or re-export it smaller.',
  [SignatureErrorCodes.ContentTypeInvalid]: 'That content type is not accepted. Use PNG, JPEG, WEBP or PDF.',
  [SignatureErrorCodes.ExtensionInvalid]:
    'That file extension is not accepted. Use .png, .jpg, .jpeg, .webp or .pdf.',
  [SignatureErrorCodes.ContentMalformed]:
    'The file contents do not match its declared type (magic-number check failed), so it was rejected. ' +
    'Re-export the specimen and retry.',
  [SignatureErrorCodes.NotFound]: 'That specimen record is gone. Refresh the coverage table.',
  [SignatureErrorCodes.AdminOnly]: 'Only an Admin may upload or revoke signature specimens.',
  [SignatureErrorCodes.StorageFailure]:
    'The file could not be written to secure storage. Nothing was saved — please retry.',
}

export const SIGNATURE_API_BASE = '/api/admin/signatures'

/** 2 MB cap, matching the server-side guard. */
export const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024

export const ALLOWED_SIGNATURE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
export const ALLOWED_SIGNATURE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.pdf']

export class SignatureApiError extends Error {
  readonly errorCode: string | null
  readonly status: number

  constructor(message: string, errorCode: string | null, status: number) {
    super(message)
    this.name = 'SignatureApiError'
    this.errorCode = errorCode
    this.status = status
  }
}

// ---------------------------------------------------------------------------
// 2. Transport — cookie session + CSRF, through the Next.js proxy
// ---------------------------------------------------------------------------

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

async function buildHeaders(method: string, base: Record<string, string> = {}): Promise<HeadersInit> {
  const headers: Record<string, string> = { ...base }
  if (MUTATING_METHODS.has(method.toUpperCase())) {
    try {
      const csrf = await getCsrfToken()
      if (csrf) {
        headers['X-CSRF-Token'] = csrf
        headers['X-Requested-With'] = 'XMLHttpRequest'
      }
    } catch {
      // A missing CSRF token is handled by the server; never block the call here.
    }
  }
  return headers
}

/**
 * One request. NOTE: `Content-Type` is deliberately NOT set for multipart uploads —
 * the browser must add the boundary itself, exactly as in
 * `ApiClient.uploadAttachment`.
 */
async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase()
  const headers = await buildHeaders(method, (init.headers as Record<string, string>) ?? {})

  try {
    return await fetch(path, {
      ...init,
      method,
      headers,
      credentials: 'include',
      cache: 'no-store',
    })
  } catch (networkError) {
    throw new SignatureApiError(
      'The signature service is unreachable. Nothing was saved — check your connection and retry.',
      SignatureErrorCodes.StorageFailure,
      0,
    )
  }
}

async function failureFrom(response: Response): Promise<SignatureApiError> {
  let errorCode: string | null = null
  let message = ''
  try {
    const body = (await response.json()) as { errorCode?: string; code?: string; message?: string; title?: string }
    errorCode = body.errorCode ?? body.code ?? null
    message = body.message ?? body.title ?? ''
  } catch {
    /* non-JSON error body */
  }

  if (errorCode && ERROR_COPY[errorCode]) {
    return new SignatureApiError(ERROR_COPY[errorCode], errorCode, response.status)
  }
  if (response.status === 401) {
    return new SignatureApiError('Your session has expired. Sign in again to continue.', null, 401)
  }
  if (response.status === 403) {
    return new SignatureApiError(ERROR_COPY[SignatureErrorCodes.AdminOnly], SignatureErrorCodes.AdminOnly, 403)
  }
  if (response.status === 404) {
    return new SignatureApiError(ERROR_COPY[SignatureErrorCodes.NotFound], SignatureErrorCodes.NotFound, 404)
  }
  if (response.status === 413) {
    return new SignatureApiError(
      ERROR_COPY[SignatureErrorCodes.FileTooLarge],
      SignatureErrorCodes.FileTooLarge,
      413,
    )
  }
  return new SignatureApiError(
    message || `The request failed (HTTP ${response.status}). Please retry.`,
    errorCode,
    response.status,
  )
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw await failureFrom(response)
  return (await response.json()) as T
}

// ---------------------------------------------------------------------------
// 3. Response normalisation
//    Accepts a bare array, an ASP.NET `$values` envelope, a `{ data: [...] }`
//    envelope, and PascalCase or camelCase property names.
// ---------------------------------------------------------------------------

function unwrapList(payload: unknown): Record<string, unknown>[] {
  if (!payload) return []
  if (Array.isArray(payload)) return payload as Record<string, unknown>[]
  const obj = payload as Record<string, unknown>
  for (const key of ['data', '$values', 'items', 'coverage', 'signatures', 'results']) {
    const candidate = obj[key]
    if (Array.isArray(candidate)) return candidate as Record<string, unknown>[]
    if (candidate && typeof candidate === 'object' && Array.isArray((candidate as any).$values)) {
      return (candidate as any).$values as Record<string, unknown>[]
    }
  }
  return []
}

function pick(raw: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (raw[key] !== undefined && raw[key] !== null) return raw[key]
    const pascal = key.charAt(0).toUpperCase() + key.slice(1)
    if (raw[pascal] !== undefined && raw[pascal] !== null) return raw[pascal]
    const snake = key.replace(/[A-Z]/g, m => `_${m.toLowerCase()}`)
    if (raw[snake] !== undefined && raw[snake] !== null) return raw[snake]
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

function toSignature(raw: Record<string, unknown> | null | undefined): UserSignatureResponse | null {
  if (!raw) return null
  const id = str(pick(raw, 'id', 'userSignatureId', 'signatureId'))
  if (!id) return null

  const contentType = str(pick(raw, 'contentType'))
  const rawKind = str(pick(raw, 'fileKind')).toLowerCase()
  const fileKind = rawKind === 'pdf' || contentType === 'application/pdf' ? 'Pdf' : 'Image'

  return {
    id,
    userId: num(pick(raw, 'userId')),
    userFullName: str(pick(raw, 'userFullName', 'fullName')),
    userRole: str(pick(raw, 'userRole', 'role')),
    userRoleLabel: str(pick(raw, 'userRoleLabel', 'roleLabel'), str(pick(raw, 'userRole', 'role'))),
    fileName: str(pick(raw, 'fileName')),
    contentType,
    fileKind,
    fileSizeBytes: num(pick(raw, 'fileSizeBytes', 'fileSize')),
    fileSha256Short: str(pick(raw, 'fileSha256Short', 'fileSha256')).slice(0, 12),
    isActive: bool(pick(raw, 'isActive'), false),
    version: num(pick(raw, 'version')),
    uploadedAt: str(pick(raw, 'uploadedAt')),
    uploadedBy: str(pick(raw, 'uploadedBy', 'uploadedByFullName')),
    revokedAt: pick(raw, 'revokedAt') ? str(pick(raw, 'revokedAt')) : null,
    fileUrl: str(pick(raw, 'fileUrl'), signatureFileUrl(id)),
    remarks: str(pick(raw, 'remarks')),
  }
}

function toCoverageRow(raw: Record<string, unknown>): SignatureCoverageRow | null {
  const userId = num(pick(raw, 'userId', 'id'))
  if (!userId) return null

  // A server that nests the active specimen is also accepted.
  const nested = toSignature((pick(raw, 'activeSignature') as Record<string, unknown>) ?? null)
  const declaredHas = pick(raw, 'hasActiveSignature')
  const signatureId = str(pick(raw, 'signatureId'), nested?.id ?? '') || null

  return {
    userId,
    fullName: str(pick(raw, 'fullName', 'userFullName')),
    username: str(pick(raw, 'username')),
    role: str(pick(raw, 'role', 'userRole')),
    roleLabel: str(pick(raw, 'roleLabel', 'userRoleLabel'), str(pick(raw, 'role', 'userRole'))),
    isActiveUser: bool(pick(raw, 'isActiveUser', 'isActive'), true),
    hasActiveSignature: declaredHas !== undefined ? bool(declaredHas) : Boolean(signatureId),
    signatureId,
    uploadedAt: pick(raw, 'uploadedAt') ? str(pick(raw, 'uploadedAt')) : (nested?.uploadedAt ?? null),
    version: num(pick(raw, 'version'), nested?.version ?? 0),
    fileUrl: str(pick(raw, 'fileUrl'), signatureId ? signatureFileUrl(signatureId) : ''),
    isApproverRole: bool(pick(raw, 'isApproverRole'), true),
    fileSha256Short: str(pick(raw, 'fileSha256Short'), nested?.fileSha256Short ?? '') || undefined,
    totalVersions: pick(raw, 'totalVersions') !== undefined ? num(pick(raw, 'totalVersions')) : undefined,
  }
}

/** GAPS FIRST, then approver roles, then name — the order the Admin needs. */
export function sortCoverage(rows: SignatureCoverageRow[]): SignatureCoverageRow[] {
  return [...rows].sort((a, b) => {
    if (a.hasActiveSignature !== b.hasActiveSignature) return a.hasActiveSignature ? 1 : -1
    if (a.isApproverRole !== b.isApproverRole) return a.isApproverRole ? -1 : 1
    const roleDiff = (a.roleLabel || a.role).localeCompare(b.roleLabel || b.role)
    if (roleDiff !== 0) return roleDiff
    return (a.fullName || '').localeCompare(b.fullName || '')
  })
}

// ---------------------------------------------------------------------------
// 4. Endpoints
// ---------------------------------------------------------------------------

/** GET /api/admin/signatures — the coverage table. */
export async function fetchCoverage(approverRolesOnly = false): Promise<SignatureCoverageRow[]> {
  const query = approverRolesOnly ? '?approverRolesOnly=true' : ''
  const payload = await parseJson<unknown>(await request(`${SIGNATURE_API_BASE}${query}`))
  const rows = unwrapList(payload)
    .map(toCoverageRow)
    .filter((row): row is SignatureCoverageRow => Boolean(row))
  return sortCoverage(rows)
}

/** GET /api/admin/signatures/user/{userId} — full version history, newest first. */
export async function fetchHistory(userId: number): Promise<UserSignatureResponse[]> {
  const payload = await parseJson<unknown>(await request(`${SIGNATURE_API_BASE}/user/${userId}`))
  return unwrapList(payload)
    .map(toSignature)
    .filter((row): row is UserSignatureResponse => Boolean(row))
    .sort((a, b) => b.version - a.version)
}

export interface UploadSignatureInput {
  userId: number
  file: File
  remarks?: string
}

/**
 * POST /api/admin/signatures — multipart upload of one specimen.
 * The server bumps the version and auto-revokes the previous active row inside one
 * transaction, so a partially-applied replacement is impossible.
 */
export async function uploadSignature(input: UploadSignatureInput): Promise<UserSignatureResponse> {
  const body = new FormData()
  body.append('file', input.file, input.file.name)
  body.append('userId', String(input.userId))
  body.append('declaredContentType', input.file.type || '')
  if (input.remarks && input.remarks.trim()) body.append('remarks', input.remarks.trim())

  const payload = await parseJson<Record<string, unknown>>(
    await request(SIGNATURE_API_BASE, { method: 'POST', body }),
  )
  const created = toSignature((payload?.data as Record<string, unknown>) ?? payload)
  if (!created) {
    throw new SignatureApiError(
      'The upload succeeded but the server returned no specimen record. Refresh the coverage table to confirm.',
      null,
      200,
    )
  }
  return created
}

/** DELETE /api/admin/signatures/{id} — revoke WITHOUT touching past stamps. */
export async function revokeSignature(signatureId: string, reason?: string): Promise<void> {
  const query = reason && reason.trim() ? `?reason=${encodeURIComponent(reason.trim())}` : ''
  const response = await request(`${SIGNATURE_API_BASE}/${encodeURIComponent(signatureId)}${query}`, {
    method: 'DELETE',
  })
  if (!response.ok) throw await failureFrom(response)
}

/** The authorised streaming URL of a specimen. Never a storage path. */
export function signatureFileUrl(signatureId: string): string {
  return `${SIGNATURE_API_BASE}/${encodeURIComponent(signatureId)}/file`
}

export interface SignatureObject {
  /** Safe to place in <img src> or <object data>. */
  url: string
  contentType: string
  /** True when `url` must be released with URL.revokeObjectURL. */
  isObjectUrl: boolean
}

/**
 * Fetches `/api/admin/signatures/{id}/file` with the session credentials and wraps
 * the bytes in a short-lived object URL, so no credential ever appears in markup.
 * The caller MUST revoke the URL on unmount when `isObjectUrl` is true.
 */
export async function loadSignatureObject(signatureId: string): Promise<SignatureObject> {
  const response = await request(signatureFileUrl(signatureId))
  if (!response.ok) throw await failureFrom(response)
  const blob = await response.blob()
  return {
    url: URL.createObjectURL(blob),
    contentType: blob.type || 'application/octet-stream',
    isObjectUrl: true,
  }
}

// ---------------------------------------------------------------------------
// 5. Client-side pre-validation (the server re-checks everything)
// ---------------------------------------------------------------------------

/** Returns an operator-facing message when the file is unacceptable, else null. */
export function validateSignatureFile(file: File): string | null {
  const dot = file.name.lastIndexOf('.')
  const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : ''

  if (!ALLOWED_SIGNATURE_EXTENSIONS.includes(extension)) {
    return `"${file.name}" has an unsupported extension. Use ${ALLOWED_SIGNATURE_EXTENSIONS.join(', ')}.`
  }
  if (file.type && !ALLOWED_SIGNATURE_MIME.includes(file.type)) {
    return `"${file.type}" is not an accepted content type. Use PNG, JPEG, WEBP or PDF.`
  }
  if (file.type === 'application/pdf' && extension !== '.pdf') {
    return 'A PDF specimen must use the .pdf extension.'
  }
  if (file.type.startsWith('image/') && extension === '.pdf') {
    return 'An image specimen must not use the .pdf extension.'
  }
  if (file.size === 0) {
    return `"${file.name}" is empty. Pick the exported specimen file.`
  }
  if (file.size > MAX_SIGNATURE_BYTES) {
    return `"${file.name}" is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_SIGNATURE_BYTES)}.`
  }
  return null
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** Approval stamps are frozen in UTC, so the dashboard renders UTC verbatim. */
export function formatUtc(value?: string | null): string {
  if (!value) return '—'
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  const iso = date.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

export function isPdfSpecimen(contentTypeOrKind?: string | null): boolean {
  if (!contentTypeOrKind) return false
  return contentTypeOrKind.toLowerCase().includes('pdf')
}

/** Short hash for the admin table; the full digest stays in the tooltip. */
export function shaPrefix(sha?: string | null): string {
  if (!sha) return '—'
  return sha.trim().slice(0, 12).toLowerCase()
}