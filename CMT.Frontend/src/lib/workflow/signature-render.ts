/**
 * =====================================================================================
 * AMENDED v16 - PHASE 1 (FRONTEND) - CMT.Frontend/src/lib/workflow/signature-render.ts
 * Copy to: CMT.Frontend/src/lib/workflow/signature-render.ts        (NEW FILE)
 *
 * WHAT THIS FILE IS
 * -----------------
 * The RUNTIME half of requirement #13:
 *
 *   "Link a stored name, date, signature image from the database storage path to the
 *    corresponding user ID upon approval. Automatically generate and apply name, date and
 *    signature upon approval based on the signer's identity and role."
 *
 * `src/lib/signature-api.ts` (which you already amended) covers the ADMIN side:
 * upload / revoke / coverage table, all under `/api/admin/signatures`. Those endpoints are
 * Admin-only by design, so a Manager rendering a form he just approved cannot use them —
 * he would get SIGNATURE_ADMIN_ONLY (403) and the printed block would show a blank
 * signature cell for the rest of the session.
 *
 * This file is therefore the NON-ADMIN, READ-ONLY resolver used while PRINTING a form:
 * it turns a `FormSignatureResponse.userId` into a credential-free object URL of that
 * user's ACTIVE specimen, caches it per user for the lifetime of the page, and degrades
 * to a typed name + role + UTC date when no specimen exists.
 *
 * ENDPOINT CONTRACT CONSUMED  (Phase 2 implements it; the client is already correct)
 * ---------------------------------------------------------------------------------
 *   GET /api/signatures/user/{userId}/active
 *        200 -> ActiveSignatureResponse (below)
 *        204 -> no active specimen for that user  (NOT an error)
 *        403 -> caller may not view that specimen (NOT an error: fall back to typed name)
 *
 *   GET /api/signatures/{signatureId}/file
 *        200 -> image/png | image/jpeg | image/webp | application/pdf
 *
 * FALLBACK ORDER (deliberate, never throws to the caller)
 *   1. `/api/signatures/user/{userId}/active`      - the normal path for every approver
 *   2. `/api/admin/signatures/user/{userId}`       - only succeeds for an Admin session
 *   3. typed name + role + UTC date                - always available
 *
 * THREE HARD RULES
 *   (1) THE RAW STORAGE PATH IS NEVER TOUCHED. The specimen is only ever obtained by
 *       requesting the authorised streaming endpoint with `credentials: 'include'`, and the
 *       bytes are wrapped in a short-lived object URL. No token, no path, ever appears in
 *       markup — identical to the design point already documented in signature-api.ts.
 *   (2) USER IDS ARE NUMBERS (C# long). Signature ids are strings (C# Guid).
 *   (3) A MISSING SPECIMEN IS NOT AN ERROR. Requirement #13 says the signature image is
 *       linked "after being uploaded by the admin"; before that upload the form must still
 *       print the approver's name, role and date. Any component that treats absence as a
 *       failure would block the whole approval chain on an admin task.
 * =====================================================================================
 */

'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { roleLabel } from '@/lib/role-hierarchy'

// =====================================================================================
// 1. SHAPES
// =====================================================================================

/** Mirror of the Phase 2 `ActiveSignatureResponse`. */
export interface ActiveSignatureResponse {
  /** C# long. */
  userId: number
  /** C# Guid. Null when the user has no active specimen. */
  signatureId: string | null
  /** Authorised streaming endpoint, e.g. "/api/signatures/{id}/file". Never a path. */
  fileUrl: string
  /** "Image" or "Pdf". */
  fileKind: string
  contentType: string
  version: number
  uploadedAt: string | null
}

/** What a printed signature cell needs in order to render itself. */
export interface ResolvedSignature {
  userId: number
  /** Safe for <img src> / <object data>. Empty when no specimen is available. */
  imageUrl: string
  contentType: string
  /** True when `imageUrl` must be released with URL.revokeObjectURL. */
  isObjectUrl: boolean
  /** True when a real specimen was found; false = typed name / date only. */
  hasSpecimen: boolean
  /** True when the specimen is a PDF and must be rendered with <object>. */
  isPdf: boolean
  version: number
  /**
   * Why no image is shown. Rendered as a `title` on the cell, never as an error toast:
   * a missing specimen must not look like a broken approval.
   */
  unavailableReason: string
}

const NO_SIGNATURE = (userId: number, reason: string): ResolvedSignature => ({
  userId,
  imageUrl: '',
  contentType: '',
  isObjectUrl: false,
  hasSpecimen: false,
  isPdf: false,
  version: 0,
  unavailableReason: reason,
})

// =====================================================================================
// 2. ROUTES
// =====================================================================================

export const SIGNATURE_RENDER_ROUTES = {
  /** Preferred, available to every authenticated user for the signers of a form. */
  activeOfUser: (userId: number) => `/api/signatures/user/${userId}/active`,
  file: (signatureId: string) => `/api/signatures/${signatureId}/file`,
  /** Admin-only fallback, reusing the surface of signature-api.ts. */
  adminHistoryOfUser: (userId: number) => `/api/admin/signatures/user/${userId}`,
  adminFile: (signatureId: string) => `/api/admin/signatures/${signatureId}/file`,
} as const

// =====================================================================================
// 3. TRANSPORT  (never throws; every failure becomes a typed-name fallback)
// =====================================================================================

/** Outcome of a JSON GET: the parsed body plus a TRANSIENT flag. */
interface JsonOutcome<T> {
  /** Parsed body, or null when there is no usable JSON (204 / error / transient). */
  data: T | null
  /**
   * True when the request failed TRANSIENTLY (401 before the session is live, 5xx, network).
   * A transient failure must NEVER be cached: the next mount has to retry, otherwise one
   * early probe would print "typed name only" for the rest of the session. 204 (no specimen)
   * and 403 (not permitted) are AUTHORITATIVE negatives and stay cacheable.
   */
  transient: boolean
}

async function getJson<T>(url: string): Promise<JsonOutcome<T>> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    })
    if (response.status === 204) return { data: null, transient: false }
    if (response.status === 401 || response.status >= 500) return { data: null, transient: true }
    if (!response.ok) return { data: null, transient: false } // 403 etc. — authoritative
    return { data: (await response.json()) as T, transient: false }
  } catch {
    return { data: null, transient: true }
  }
}

/** Outcome of a specimen stream: an object URL (empty when none) plus a TRANSIENT flag. */
interface BlobOutcome {
  url: string
  contentType: string
  /** True when the stream failed transiently (401 / 5xx / network) — never cache the fallback. */
  transient: boolean
}

async function getBlobUrl(url: string): Promise<BlobOutcome> {
  try {
    const response = await fetch(url, { method: 'GET', credentials: 'include', cache: 'no-store' })
    if (response.status === 401 || response.status >= 500) {
      return { url: '', contentType: '', transient: true }
    }
    if (!response.ok) return { url: '', contentType: '', transient: false } // 403 / 404 — authoritative
    const blob = await response.blob()
    if (blob.size === 0) return { url: '', contentType: '', transient: false }
    return {
      url: URL.createObjectURL(blob),
      contentType: blob.type || 'application/octet-stream',
      transient: false,
    }
  } catch {
    return { url: '', contentType: '', transient: true }
  }
}

// =====================================================================================
// 4. CACHE
//    One in-flight promise and one object URL PER USER per page. Without it a folder PDF
//    preview containing 11 forms would fetch the same Director specimen 11 times.
// =====================================================================================

const cache = new Map<number, ResolvedSignature>()
const inFlight = new Map<number, Promise<ResolvedSignature>>()

/** Drops the cached specimen of one user (call it after an admin re-upload). */
export function invalidateSignature(userId: number): void {
  const cached = cache.get(userId)
  if (cached?.isObjectUrl && cached.imageUrl) URL.revokeObjectURL(cached.imageUrl)
  cache.delete(userId)
  inFlight.delete(userId)
}

/** Drops every cached specimen and releases every object URL. */
export function invalidateAllSignatures(): void {
  for (const resolved of cache.values()) {
    if (resolved.isObjectUrl && resolved.imageUrl) URL.revokeObjectURL(resolved.imageUrl)
  }
  cache.clear()
  inFlight.clear()
}

function isPdfLike(value?: string | null): boolean {
  return !!value && value.toLowerCase().includes('pdf')
}

/** What `resolveUncached` returns: the printable state PLUS whether it may be cached. */
interface ResolveOutcome {
  signature: ResolvedSignature
  /** False for a transient failure — the result is shown once, then retried on the next mount. */
  cacheable: boolean
}

async function resolveUncached(userId: number): Promise<ResolveOutcome> {
  if (!Number.isFinite(userId) || userId <= 0) {
    return {
      signature: NO_SIGNATURE(userId, 'The signer could not be identified.'),
      cacheable: true,
    }
  }

  // ---- 1. the normal, non-admin path -------------------------------------------------
  const active = await getJson<ActiveSignatureResponse>(SIGNATURE_RENDER_ROUTES.activeOfUser(userId))
  if (active.transient && !active.data) {
    // The server is down / the session is not live YET. Show the typed name for this paint,
    // but do NOT cache: the next mount retries, so one blip can never blank the cell for the
    // whole session (that permanent latch was the second half of "signatures not displayed").
    return {
      signature: NO_SIGNATURE(
        userId,
        'The signature service could not be reached right now. The cell retries on the next render.',
      ),
      cacheable: false,
    }
  }
  if (active.data && active.data.signatureId) {
    const streamed = await getBlobUrl(
      active.data.fileUrl || SIGNATURE_RENDER_ROUTES.file(active.data.signatureId),
    )
    if (streamed.url) {
      return {
        signature: {
          userId,
          imageUrl: streamed.url,
          contentType: streamed.contentType,
          isObjectUrl: true,
          hasSpecimen: true,
          isPdf: isPdfLike(streamed.contentType) || isPdfLike(active.data.fileKind),
          version: active.data.version ?? 1,
          unavailableReason: '',
        },
        cacheable: true,
      }
    }
    if (streamed.transient) {
      return {
        signature: NO_SIGNATURE(
          userId,
          'The signature file could not be streamed right now. The cell retries on the next render.',
        ),
        cacheable: false,
      }
    }
  }

  // ---- 2. Admin session fallback -----------------------------------------------------
  const history = await getJson<Array<{ id: string; isActive: boolean; version: number; contentType: string; fileKind: string }>>(
    SIGNATURE_RENDER_ROUTES.adminHistoryOfUser(userId),
  )
  if (!history.transient) {
    const activeRow = Array.isArray(history.data) ? history.data.find(row => row.isActive) : null
    if (activeRow) {
      const streamed = await getBlobUrl(SIGNATURE_RENDER_ROUTES.adminFile(activeRow.id))
      if (streamed.url) {
        return {
          signature: {
            userId,
            imageUrl: streamed.url,
            contentType: streamed.contentType,
            isObjectUrl: true,
            hasSpecimen: true,
            isPdf: isPdfLike(streamed.contentType) || isPdfLike(activeRow.fileKind),
            version: activeRow.version ?? 1,
            unavailableReason: '',
          },
          cacheable: true,
        }
      }
    }
  }

  // ---- 3. typed name + role + date ---------------------------------------------------
  return {
    signature: NO_SIGNATURE(
      userId,
      'No signature specimen has been uploaded for this user yet, so the approval is printed with the signer name, role and date only.',
    ),
    cacheable: true,
  }
}

/**
 * Resolve (and cache) the active specimen of one user. NEVER rejects: an unresolvable
 * specimen yields `hasSpecimen: false` plus a human reason.
 */
export function resolveSignature(userId: number): Promise<ResolvedSignature> {
  const cached = cache.get(userId)
  if (cached) return Promise.resolve(cached)

  const pending = inFlight.get(userId)
  if (pending) return pending

  const promise = resolveUncached(userId)
    .then(outcome => {
      // A transient failure is deliberately NOT cached: the next mount must retry, so a
      // single 401/5xx blip can never blank a printed cell for the rest of the session.
      if (outcome.cacheable) cache.set(userId, outcome.signature)
      inFlight.delete(userId)
      return outcome.signature
    })
    .catch(() => {
      // A thrown resolver is a transport failure — show the typed name, retry next mount.
      const fallback = NO_SIGNATURE(userId, 'The signature specimen could not be loaded.')
      inFlight.delete(userId)
      return fallback
    })

  inFlight.set(userId, promise)
  return promise
}

// =====================================================================================
// 5. REACT HOOK
// =====================================================================================

export interface SignatureImageState {
  signature: ResolvedSignature | null
  loading: boolean
}

/**
 * Loads the specimen of `userId` for a printed signature cell.
 * `enabled = false` keeps the hook idle (used while the step has not been executed yet).
 */
export function useSignatureImage(
  userId?: number | null,
  enabled = true,
): SignatureImageState {
  const [signature, setSignature] = useState<ResolvedSignature | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const requestRef = useRef(0)

  useEffect(() => {
    const id = typeof userId === 'number' ? userId : Number.parseInt(String(userId ?? ''), 10)
    if (!enabled || !Number.isFinite(id) || id <= 0) {
      setSignature(null)
      setLoading(false)
      return
    }

    const ticket = ++requestRef.current
    setLoading(true)

    void resolveSignature(id).then(result => {
      if (ticket === requestRef.current) {
        setSignature(result)
        setLoading(false)
      }
    })
  }, [userId, enabled])

  return { signature, loading }
}

// =====================================================================================
// 6. PRINTED TEXT HELPERS
//    Approval stamps are frozen in UTC server side, so the printed cell renders UTC
//    verbatim — exactly like `formatUtc` in signature-api.ts. A local timezone would make
//    two approvers of the same form appear to have signed on different days.
// =====================================================================================

/** "2026-08-27" — the printed date cell of every signature block. */
export function formatSignatureDate(value?: string | null): string {
  if (!value) return ''
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().slice(0, 10)
}

/** "2026-08-27 09:14 UTC" — used in tooltips and in the audit trail. */
export function formatSignatureTimestamp(value?: string | null): string {
  if (!value) return ''
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return value
  const iso = date.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

/** "Karim Nour — Shop Team Leader" for the printed name line. */
export function signerCaption(personName?: string | null, personRole?: string | null): string {
  const name = (personName ?? '').trim()
  const role = personRole ? roleLabel(personRole) : ''
  if (name && role) return `${name} — ${role}`
  return name || role
}

/**
 * Short integrity marker printed next to a stamped signature, so a paper copy can be
 * traced back to the executed step. Uses the server `signatureHash` when present.
 */
export function signatureTrace(signatureHash?: string | null, version?: number): string {
  const hash = (signatureHash ?? '').trim()
  if (!hash) return ''
  const short = hash.length > 12 ? hash.slice(0, 12) : hash
  return version && version > 1 ? `${short} · v${version}` : short
}