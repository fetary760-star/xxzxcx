/**
 * =====================================================================================
 * PHASE 1 — AMENDED (NEW FILE)
 * Copy to: CMT.Frontend/src/lib/signature/signature-proxy.ts
 *
 * WHAT THIS FILE IS
 * -----------------
 * The SERVER-SIDE half of the signature transport. It is the exact analogue of
 * `src/lib/workflow/workflow-proxy.ts`, but specialised for
 * CMT.Web.Api/Controllers/AdminSignaturesController.cs:
 *
 *   GET    /api/admin/signatures[?approverRolesOnly=true]   -> coverage table
 *   GET    /api/admin/signatures/user/{userId}              -> version history
 *   POST   /api/admin/signatures            (multipart)     -> upload one specimen
 *   GET    /api/admin/signatures/{id}/file                  -> authorised byte stream
 *   DELETE /api/admin/signatures/{id}[?reason=]             -> revoke (past stamps intact)
 *
 * WHY A SEPARATE PROXY INSTEAD OF REUSING proxyWorkflowRequest()
 * -------------------------------------------------------------
 * `proxyWorkflowRequest` only streams `application/pdf`, `application/octet-stream`
 * and `application/zip` back to the browser. A signature specimen is normally
 * `image/png`, `image/jpeg` or `image/webp`, so it would fall through to the
 * `response.text()` branch and the bytes would be corrupted into a UTF-8 string —
 * the thumbnail would render as a broken image. This proxy streams ANY non-JSON
 * content type byte-for-byte.
 *
 * FOUR BINDING RULES
 *   (1) `storage_path` NEVER crosses this boundary. If a future controller build
 *       accidentally serialises it, `stripStoragePaths()` removes it here, so the
 *       browser can never learn the bucket key even by mistake.
 *   (2) The multipart body is forwarded UNTOUCHED (raw ArrayBuffer + the original
 *       `Content-Type`, boundary included). Re-serialising a FormData server side
 *       is what silently drops the file part.
 *   (3) The HTTP status is passed through UNCHANGED, because the client reads
 *       `errorCode` (SIGNATURE_FILE_TOO_LARGE, SIGNATURE_CONTENT_MALFORMED,
 *       SIGNATURE_ADMIN_ONLY, ...) and renders one specific sentence per code.
 *       Collapsing 400/403/409 into 500 destroys that vocabulary.
 *   (4) Every specimen response is returned with `Cache-Control: private, no-store`
 *       so a signature image is never written to a shared/disk cache.
 * =====================================================================================
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/** Same resolution order as the workflow / self-evaluation proxies. */
const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
)
  .trim()
  .replace(/\/+$/, '')

/** Uploads are capped at 2 MB server side, so 30 s is generous. */
const REQUEST_TIMEOUT_MS = 30000

/** Cookie names the app has used across versions — all are still accepted. */
const TOKEN_COOKIE_NAMES = ['access_token', 'auth_token', 'authToken'] as const

const PLACEHOLDER_TOKENS = new Set(['', 'null', 'undefined', 'cookie-session'])

/** Keys that must never reach the browser, at any nesting depth. */
const FORBIDDEN_KEYS = new Set([
  'storagepath',
  'storage_path',
  'storagekey',
  'storage_key',
  'objectkey',
  'object_key',
  'absolutepath',
  'physicalpath',
])

function isRealToken(value: string | null | undefined): value is string {
  if (!value) return false
  return !PLACEHOLDER_TOKENS.has(value.trim())
}

/**
 * Extracts the bearer token. An explicit Authorization header wins over the
 * HttpOnly cookie, so a server component that already holds a token can call the
 * proxy directly.
 */
export function extractAccessToken(req: NextRequest): string | null {
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

/** Rule (1): defensive removal of any storage locator, at any depth. */
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

function buildProxyHeaders(
  req: NextRequest,
  token: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    // The specimen stream is binary, so accept both.
    Accept: 'application/json, application/octet-stream;q=0.9, */*;q=0.8',
    Authorization: `Bearer ${token}`,
  }

  const cookie = req.headers.get('cookie')
  if (cookie) headers.Cookie = cookie

  const csrf = req.headers.get('x-csrf-token')
  if (csrf) headers['X-CSRF-Token'] = csrf

  const requestedWith = req.headers.get('x-requested-with')
  if (requestedWith) headers['X-Requested-With'] = requestedWith

  return { ...headers, ...extra }
}

/**
 * Forwards one request to `{API_BASE}/admin/signatures/{...segments}` preserving
 * method, query string, body and content type.
 *
 * `segments` may be EMPTY: `/api/admin/signatures` (coverage list + upload) has no
 * segments at all, which is exactly why the route file uses the OPTIONAL catch-all
 * `[[...path]]` rather than `[...path]` (a required catch-all 404s on the bare
 * parent segment).
 */
export async function proxySignatureRequest(
  req: NextRequest,
  segments: string[] | undefined,
  method: string,
): Promise<Response> {
  try {
    const token = extractAccessToken(req)
    if (!token) {
      return NextResponse.json(
        { message: 'Your session has expired. Sign in again to continue.', errorCode: 'PERMISSION_DENIED' },
        { status: 401 },
      )
    }

    const subPath = (segments ?? []).filter(Boolean).map(encodeURIComponent).join('/')
    const search = new URL(req.url).search || ''
    const backendUrl = `${API_BASE}/admin/signatures${subPath ? `/${subPath}` : ''}${search}`

    const incomingContentType = req.headers.get('content-type') || ''
    const isMultipart = incomingContentType.includes('multipart/form-data')

    // Rule (2): keep the ORIGINAL content type (with its boundary) for multipart.
    const extraHeaders: Record<string, string> =
      method === 'GET' || method === 'HEAD' || method === 'DELETE'
        ? {}
        : isMultipart
          ? { 'Content-Type': incomingContentType }
          : { 'Content-Type': 'application/json' }

    const headers = buildProxyHeaders(req, token, extraHeaders)

    let body: BodyInit | null = null
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        if (isMultipart) {
          const buffer = await req.arrayBuffer()
          body = Buffer.from(buffer)
        } else {
          const text = await req.text()
          if (text) body = text
        }
      } catch {
        body = null
      }
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(backendUrl, {
        method,
        headers,
        body,
        signal: controller.signal,
        cache: 'no-store',
      })
    } catch (fetchError: unknown) {
      clearTimeout(timeoutId)
      const aborted = fetchError instanceof Error && fetchError.name === 'AbortError'
      return NextResponse.json(
        {
          message: aborted
            ? 'The signature service did not answer in time. Nothing was stored.'
            : 'The signature service is unreachable. Nothing was stored.',
          errorCode: 'SIGNATURE_STORAGE_FAILURE',
          details: fetchError instanceof Error ? fetchError.message : String(fetchError),
        },
        { status: aborted ? 504 : 502 },
      )
    }

    clearTimeout(timeoutId)

    if (response.status === 204) {
      return new Response(null, {
        status: 204,
        headers: { 'Cache-Control': 'private, no-store' },
      })
    }

    const contentType = response.headers.get('content-type') || ''

    // ----- JSON: strip storage locators, pass the status through unchanged -----
    if (contentType.includes('json')) {
      const data = await response.json().catch(() => null)
      const safe = stripStoragePaths(data)
      const out = NextResponse.json(safe, { status: response.status })
      out.headers.set('Cache-Control', 'private, no-store')
      return out
    }

    // ----- ANY other content type is streamed byte-for-byte -----
    // This is the branch that makes image/png, image/jpeg, image/webp and
    // application/pdf specimens render correctly in <img> / <object>.
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
      { status: 500 },
    )
  }
}