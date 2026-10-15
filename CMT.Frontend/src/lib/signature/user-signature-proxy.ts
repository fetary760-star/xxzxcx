/**
 * =====================================================================================
 * AMENDED v30 — PHASE 1 / DELIVERABLE 5: THE NON-ADMIN SIGNATURE READ PROXY
 * Copy to: CMT.Frontend/src/lib/signature/user-signature-proxy.ts     (REPLACES the v29 file)
 *
 * WHY A SECOND PROXY NEXT TO `signature-proxy.ts`
 * ----------------------------------------------
 * `src/lib/signature/signature-proxy.ts` forwards to `{API_BASE}/admin/signatures/...`. Its
 * base path is hard-coded, and correctly so: it serves the Admin library. The PRINTED FORM
 * needs a different base — `{API_BASE}/signatures/...` — because the reader is a Shop Team
 * Leader, a Manager, a Director or an Inspector, and the admin controller answers
 * 403 SIGNATURE_ADMIN_ONLY to all of them.
 *
 * Reusing `proxySignatureRequest()` here would silently rewrite
 * `/api/signatures/user/12/active` into `/api/admin/signatures/user/12/active`, i.e. reproduce
 * the exact 403 that keeps every signature cell blank.
 *
 * KEPT FROM v29 (verbatim behaviour, on purpose)
 *   - the same token extraction order: Authorization header, `x-auth-token`, then the
 *     `access_token` / `auth_token` / `authToken` cookies, then a manual cookie-header parse;
 *   - the `PLACEHOLDER_TOKENS` guard, so the literal `cookie-session` is never sent as bearer;
 *   - `stripStoragePaths()` defence in depth, at any nesting depth;
 *   - byte-for-byte streaming of any non-JSON content type, which is what makes `image/png`,
 *     `image/jpeg`, `image/webp` and `application/pdf` render instead of being corrupted;
 *   - a REAL 204 with an empty body — `signature-render.ts` distinguishes 204
 *     ("no specimen on file, print the typed name") from a failure;
 *   - `Cache-Control: private, no-store` on every response.
 *
 * WHAT v30 ADDS
 *   AMENDMENT 1 — PATH WHITELIST. v29 forwarded ANY segment list under `/api/signatures`, which
 *     made the route an open forwarder into the backend `SignaturesController` (including any
 *     future non-read action it may gain). v30 accepts EXACTLY the two contracted read shapes:
 *
 *        ['user', '{userId}', 'active']   with userId a positive integer  (C# long)
 *        ['{signatureId}', 'file']        with signatureId a GUID          (C# Guid)
 *
 *     Anything else is answered 404 `SIGNATURE_ROUTE_NOT_FOUND` locally, without a backend
 *     round-trip. This is also a correctness win: a malformed id can no longer reach EF Core.
 *
 *   AMENDMENT 2 — `encodeURIComponent` NO LONGER MANGLES THE PATH. v29 encoded every segment;
 *     since the whitelist now guarantees the segments are `[0-9]+`, a GUID and two literals,
 *     they are appended verbatim, so no `%xx` can ever reach the ASP.NET route template.
 *
 *   AMENDMENT 3 — `Accept` IS METHOD-AWARE. The `active` lookup asks for JSON only; the `file`
 *     stream asks for the image / PDF types. A backend content negotiator can no longer return
 *     JSON for a specimen stream.
 *
 *   AMENDMENT 4 — A REVOKED SPECIMEN IS STILL STREAMED. Documented explicitly here because the
 *     proxy must not add its own filtering: revoking only rotates the ACTIVE pointer, and a
 *     signature already printed on an executed form must never blank out. Only a soft-deleted
 *     row is 404, and that decision belongs to `SignatureReadService`.
 *
 * FIVE HARD RULES
 *   (1) THE HTTP STATUS IS PASSED THROUGH UNCHANGED. 200 / 204 / 401 / 403 / 404 all carry
 *       meaning for the client; collapsing them into 500 destroys the fallback chain of
 *       `signature-render.ts`.
 *   (2) READ-ONLY: GET and HEAD only. Uploads and revocation stay Admin-only at
 *       `/api/admin/signatures`.
 *   (3) A MISSING SESSION IS A JSON 401, NEVER A REDIRECT — an HTML redirect body would be
 *       parsed as a specimen and produce a broken image.
 *   (4) NO STORAGE LOCATOR AND NO FILE DIGEST, AT ANY DEPTH.
 *   (5) NEVER THROW: any transport failure becomes a JSON error with an `errorCode`, so the
 *       printed cell degrades to the typed name instead of crashing the form.
 * =====================================================================================
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** Same resolution order as the workflow / self-evaluation / admin-signature proxies. */
const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
)
  .trim()
  .replace(/\/+$/, '')

/** A specimen is at most 2 MB, so 30 s is generous. */
const REQUEST_TIMEOUT_MS = 30000

/** Cookie names the app has used across versions — all still accepted. */
const TOKEN_COOKIE_NAMES = ['access_token', 'auth_token', 'authToken'] as const

const PLACEHOLDER_TOKENS = new Set(['', 'null', 'undefined', 'cookie-session'])

/** Keys that must never reach the browser, at any nesting depth (rule 4). */
const FORBIDDEN_KEYS = new Set([
  'storagepath',
  'storage_path',
  'storagekey',
  'storage_key',
  'objectkey',
  'object_key',
  'absolutepath',
  'physicalpath',
  'filesha256',
  'file_sha256',
])

const NO_STORE_HEADERS = { 'Cache-Control': 'private, no-store' } as const

function isRealToken(value: string | null | undefined): value is string {
  if (!value) return false
  return !PLACEHOLDER_TOKENS.has(value.trim())
}

/**
 * Extracts the bearer token. Identical order to `signature-proxy.ts`, so a session that works
 * for the Admin library works here too.
 */
export function extractSignatureToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization')
  if (authHeader) {
    const bare = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (isRealToken(bare)) return bare
  }

  const middlewareToken = req.headers.get('x-auth-token')
  if (isRealToken(middlewareToken)) return middlewareToken.trim()

  for (const name of TOKEN_COOKIE_NAMES) {
    const cookie = req.cookies.get(name)
    if (isRealToken(cookie?.value)) return cookie!.value.trim()
  }

  const cookieHeader = req.headers.get('cookie')
  if (cookieHeader) {
    for (const name of TOKEN_COOKIE_NAMES) {
      const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))
      if (!match) continue
      let raw = match[1]
      try {
        raw = decodeURIComponent(raw)
      } catch {
        /* keep the undecoded value */
      }
      if (isRealToken(raw)) return raw.trim()
    }
  }

  return null
}

// =====================================================================================
// AMENDMENT 1 — THE PATH WHITELIST
// =====================================================================================

/** C# long: a positive integer with no sign and no padding surprises. */
const USER_ID = /^[1-9]\d{0,18}$/
/** C# Guid, canonical hyphenated form (the only form the API emits). */
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

export type SignatureReadShape = 'active' | 'file'

export interface ResolvedSignaturePath {
  shape: SignatureReadShape
  /** The path appended to `{API_BASE}/signatures`, already safe (no encoding needed). */
  subPath: string
}

/**
 * Resolves the incoming segments to one of the TWO contracted read shapes, or null.
 *
 *   ['user', '102', 'active']  ->  'user/102/active'
 *   ['6f1c…', 'file']          ->  '6f1c…/file'
 */
export function resolveSignatureReadPath(
  segments: string[] | undefined,
): ResolvedSignaturePath | null {
  const parts = (segments ?? []).filter(Boolean)

  if (parts.length === 3 && parts[0].toLowerCase() === 'user' && parts[2].toLowerCase() === 'active') {
    if (!USER_ID.test(parts[1])) return null
    return { shape: 'active', subPath: `user/${parts[1]}/active` }
  }

  if (parts.length === 2 && parts[1].toLowerCase() === 'file') {
    if (!GUID.test(parts[0])) return null
    return { shape: 'file', subPath: `${parts[0]}/file` }
  }

  return null
}

// =====================================================================================
// PAYLOAD HYGIENE
// =====================================================================================

/** Rule (4): defensive removal of any storage locator / integrity digest, at any depth. */
function stripStoragePaths(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload.map(stripStoragePaths)
  if (payload && typeof payload === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) continue
      out[key] = stripStoragePaths(value)
    }
    return out
  }
  return payload
}

/** AMENDMENT 3 — the `Accept` header depends on what is being fetched. */
function acceptFor(shape: SignatureReadShape): string {
  return shape === 'active'
    ? 'application/json'
    : 'image/png, image/jpeg, image/webp, application/pdf, application/octet-stream;q=0.8, application/json;q=0.1'
}

function buildProxyHeaders(
  req: NextRequest,
  token: string,
  shape: SignatureReadShape,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: acceptFor(shape),
    Authorization: `Bearer ${token}`,
  }

  const cookie = req.headers.get('cookie')
  if (cookie) headers.Cookie = cookie

  const csrf = req.headers.get('x-csrf-token')
  if (csrf) headers['X-CSRF-Token'] = csrf

  const requestedWith = req.headers.get('x-requested-with')
  if (requestedWith) headers['X-Requested-With'] = requestedWith

  return headers
}

// =====================================================================================
// THE PROXY
// =====================================================================================

/**
 * Forwards one READ request to `{API_BASE}/signatures/{...}`.
 *
 * The two paths this phase serves:
 *   GET /api/signatures/user/{userId}/active   -> 200 ActiveSignatureResponse | 204 | 403 | 401
 *   GET /api/signatures/{signatureId}/file     -> 200 image|pdf | 403 | 404 | 401
 *
 * AMENDMENT 4: a REVOKED specimen is still streamed. Revoking only rotates the active pointer
 * and must never blank a signature already printed on an executed form. Only a soft-deleted row
 * yields 404, and that decision belongs to `SignatureReadService`, not to this proxy.
 */
export async function proxyUserSignatureRequest(
  req: NextRequest,
  segments: string[] | undefined,
  method: 'GET' | 'HEAD' = 'GET',
): Promise<Response> {
  try {
    // ---- AMENDMENT 1: reject anything that is not one of the two contracted shapes ----
    const resolved = resolveSignatureReadPath(segments)
    if (!resolved) {
      return NextResponse.json(
        {
          message:
            'Unknown signature route. Only GET /api/signatures/user/{userId}/active and GET /api/signatures/{signatureId}/file are available.',
          errorCode: 'SIGNATURE_ROUTE_NOT_FOUND',
        },
        { status: 404, headers: NO_STORE_HEADERS },
      )
    }

    const token = extractSignatureToken(req)
    if (!token) {
      // Rule (3): a JSON 401, never an HTML redirect.
      return NextResponse.json(
        {
          message: 'Your session has expired. Sign in again to continue.',
          errorCode: 'SIGNATURE_NOT_AUTHENTICATED',
        },
        { status: 401, headers: NO_STORE_HEADERS },
      )
    }

    // AMENDMENT 2: the whitelist guarantees the segments are safe, so they are appended
    // verbatim — no `%xx` can reach the ASP.NET route template.
    const search = new URL(req.url).search || ''
    const backendUrl = `${API_BASE}/signatures/${resolved.subPath}${search}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(backendUrl, {
        method,
        headers: buildProxyHeaders(req, token, resolved.shape),
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId)
      const aborted = fetchError instanceof Error && fetchError.name === 'AbortError'
      // Rule (5): a transport failure is reported, never thrown. The printed cell falls back
      // to the typed name, which is the documented degradation of `signature-render.ts`.
      return NextResponse.json(
        {
          message: aborted
            ? 'The signature service did not answer in time.'
            : 'The signature service is unreachable.',
          errorCode: 'SIGNATURE_STORAGE_FAILURE',
          details: fetchError instanceof Error ? fetchError.message : String(fetchError),
        },
        { status: aborted ? 504 : 502, headers: NO_STORE_HEADERS },
      )
    }

    clearTimeout(timeoutId)

    // ---- 204: "no specimen on file". MUST stay a real 204 with an empty body. ----------
    // `signature-render.ts` treats it as "print the typed name", NOT as an error. Turning it
    // into a 200 with a null body would work today but silently break any caller that checks
    // `response.status === 204`.
    if (response.status === 204) {
      return new Response(null, { status: 204, headers: NO_STORE_HEADERS })
    }

    const contentType = response.headers.get('content-type') || ''

    // ---- JSON (the `active` lookup + every error payload): status passed through -------
    if (contentType.includes('json')) {
      const data = await response.json().catch(() => null)
      const out = NextResponse.json(stripStoragePaths(data), { status: response.status })
      out.headers.set('Cache-Control', 'private, no-store')
      return out
    }

    // ---- ANY other content type is streamed byte-for-byte ------------------------------
    // This branch is what makes image/png, image/jpeg, image/webp and application/pdf
    // specimens render correctly inside <img> / <object> on the printed form.
    const buffer = await response.arrayBuffer()
    const outHeaders: Record<string, string> = {
      'Content-Type': contentType || 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    }
    const disposition = response.headers.get('content-disposition')
    if (disposition) outHeaders['Content-Disposition'] = disposition
    const length = response.headers.get('content-length')
    if (length) outHeaders['Content-Length'] = length

    return new Response(buffer, { status: response.status, headers: outHeaders })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        message: 'The signature proxy failed unexpectedly.',
        errorCode: 'SIGNATURE_STORAGE_FAILURE',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500, headers: NO_STORE_HEADERS },
    )
  }
}