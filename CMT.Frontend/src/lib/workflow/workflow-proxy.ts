/**
 * =====================================================================================
 * AMENDED v17 - PHASE 1 (FRONTEND)
 * CMT.Frontend/src/lib/workflow/workflow-proxy.ts   (REPLACES the whole v15 file)
 * Copy to: CMT.Frontend/src/lib/workflow/workflow-proxy.ts
 *
 * WHY THIS FILE HAD TO BE RE-ISSUED  -  THE SINGLE WORST BUG OF THE v15/v17 SET
 * ----------------------------------------------------------------------------
 * v15 declared FOUR parameters:
 *
 *     proxyWorkflowRequest(req, prefix, segments, method)
 *
 * but BOTH route files that call it pass only THREE:
 *
 *     src/app/api/workflow/[[...path]]/route.ts
 *         return proxyWorkflowRequest(req, UPSTREAM_PREFIX, ctx.params?.path ?? [])
 *     src/app/api/evaluation-folders/[[...path]]/route.ts
 *         return proxyWorkflowRequest(req, UPSTREAM_PREFIX, ctx.params?.path ?? [])
 *
 * so `method` arrives as `undefined` and the upstream call becomes
 * `fetch(url, { method: undefined, body: <the JSON> })`. Node then sends a GET WITH a body,
 * which either throws `TypeError: Request with GET/HEAD method cannot have body` or reaches
 * ASP.NET as a GET that matches no `[HttpPost]` action. NET EFFECT: **every single amended
 * endpoint fails** - assign, delegate, approve, reject, return, skip, checklist,
 * joint-approval, sign-off, report, revisions, amend - while the two GET endpoints
 * (catalog, permissions/me) accidentally work, which is precisely the symptom pattern of
 * "the routes exist but nothing can be actioned".
 *
 * THE FIX
 * -------
 * `method` is now OPTIONAL and defaults to `req.method`, which is always correct because
 * Next.js already dispatched the request to the matching verb export. The four-argument
 * call site keeps working unchanged, so this file is backward compatible with any code you
 * have already copied.
 *
 * TWO SMALLER DEFECTS ALSO FIXED
 * ------------------------------
 *   (a) v15 forced `Content-Type: application/json` on GET / HEAD, which some proxies and
 *       WAFs reject on a body-less request. The header is now only set when a body exists.
 *   (b) v15 resolved its own API base URL with its own default (`http://localhost:5000/api`,
 *       note the http) while `lib/api.ts` defaults to `https://localhost:5000/api`. Half the
 *       surface therefore pointed at a different scheme. The base URL now comes from the
 *       single config point of `workflow-config.ts` (VITE_API_BASE_URL first), with the
 *       pre-existing server-only variables kept as fallbacks.
 *
 * BINDING RULES (unchanged)
 *   (1) NEVER rewrite the JSON body. The client already normalises casing and id types
 *       (user ids = number / C# long, entity ids = string / C# Guid). A proxy that
 *       "helpfully" re-serialises is how `delegateToUserId` became a string before.
 *   (2) PASS THE STATUS THROUGH UNCHANGED. `WorkflowApiError` reads `errorCode` off the body
 *       and the component reacts to the specific rule (ASSIGNEE_OUTSIDE_SHOP,
 *       REGULATORY_DATE_REACHED, MANDATORY_FORMS_PENDING, ...). Collapsing a 409 into a 500
 *       destroys that vocabulary.
 *   (3) The PDF of requirement #11 arrives as application/pdf or octet-stream; it must be
 *       streamed back WITH `Content-Disposition`, otherwise the download has no file name.
 * =====================================================================================
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

import { normalizeApiBaseUrl } from '@/lib/workflow/workflow-config'

/**
 * Server-side base URL. `workflow-config.ts` already resolves VITE_API_BASE_URL /
 * NEXT_PUBLIC_API_BASE_URL / CMT_API_BASE_URL, but on the SERVER an empty value must not mean
 * "same origin" (that would make the route handler call itself in an infinite loop), so a
 * concrete localhost default is applied here only.
 */
const API_BASE = (() => {
  const configured = normalizeApiBaseUrl(
    process.env.CMT_API_BASE_URL ||
      process.env.VITE_API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      '',
  )
  const root = configured !== '' ? configured : 'https://localhost:5000'
  // The route table owns the `/api` prefix, so it is appended exactly once here.
  return `${root}/api`
})()

const REQUEST_TIMEOUT_MS = 30000

/** Cookie names the app has used across versions - all are still accepted. */
const TOKEN_COOKIE_NAMES = ['access_token', 'auth_token', 'authToken'] as const

const PLACEHOLDER_TOKENS = new Set(['', 'null', 'undefined', 'cookie-session'])

function isRealToken(value: string | null | undefined): value is string {
  if (!value) return false
  return !PLACEHOLDER_TOKENS.has(value.trim())
}

/**
 * Extracts the bearer token from the request. Order matters: an explicit Authorization
 * header wins over the cookie, so a server component that already holds a token can call
 * the proxy directly.
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

function buildProxyHeaders(
  req: NextRequest,
  token: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: req.headers.get('accept') || 'application/json',
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
 * Forwards one request to `{API_BASE}/{prefix}/{...segments}` preserving method, query
 * string, body and content type.
 *
 * @param prefix  "workflow" or "evaluation-folders" - the controller root on the ASP.NET side.
 * @param segments the optional catch-all segments. EMPTY is legal: `/api/evaluation-folders`
 *        (list + create) has no segments at all, which is exactly why the route files use the
 *        OPTIONAL catch-all `[[...path]]` instead of `[...path]`.
 * @param method OPTIONAL. Defaults to `req.method`. THIS DEFAULT IS THE v17 FIX: passing it
 *        was previously mandatory and both route files omitted it, so every mutating call
 *        went upstream as `method: undefined`.
 */
export async function proxyWorkflowRequest(
  req: NextRequest,
  prefix: string,
  segments: string[] | undefined,
  method?: string,
): Promise<Response> {
  const verb = (method || req.method || 'GET').toUpperCase()

  try {
    const token = extractAccessToken(req)
    if (!token) {
      return NextResponse.json(
        { message: 'Your session has expired. Please sign in again.', errorCode: 'PERMISSION_DENIED' },
        { status: 401 },
      )
    }

    const subPath = (segments ?? []).filter(Boolean).join('/')
    const search = new URL(req.url).search || ''
    const backendUrl = `${API_BASE}/${prefix}${subPath ? `/${subPath}` : ''}${search}`

    const incomingContentType = req.headers.get('content-type') || ''
    const isMultipart = incomingContentType.includes('multipart/form-data')
    const canHaveBody = verb !== 'GET' && verb !== 'HEAD'

    let body: BodyInit | null = null
    if (canHaveBody) {
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

    // Fix (a): the Content-Type header is only sent when there really is a body.
    const extraHeaders: Record<string, string> = {}
    if (body !== null) {
      extraHeaders['Content-Type'] = isMultipart ? incomingContentType : 'application/json'
    }

    const headers = buildProxyHeaders(req, token, extraHeaders)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    let response: Response
    try {
      response = await fetch(backendUrl, {
        method: verb,
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
            ? 'The workflow service did not answer in time.'
            : 'The workflow service is unreachable.',
          errorCode: aborted ? 'TRANSPORT_TIMEOUT' : 'TRANSPORT_UNAVAILABLE',
          details: fetchError instanceof Error ? fetchError.message : String(fetchError),
        },
        { status: aborted ? 504 : 502 },
      )
    }

    clearTimeout(timeoutId)

    if (response.status === 204) return new Response(null, { status: 204 })

    const contentType = response.headers.get('content-type') || ''

    // Requirement #11: the consolidated folder PDF must keep its file name.
    if (
      contentType.includes('application/pdf') ||
      contentType.includes('application/octet-stream') ||
      contentType.includes('application/zip')
    ) {
      const blob = await response.blob()
      const disposition = response.headers.get('content-disposition')
      const outHeaders: Record<string, string> = { 'Content-Type': contentType }
      if (disposition) outHeaders['Content-Disposition'] = disposition
      return new Response(blob, { status: response.status, headers: outHeaders })
    }

    if (contentType.includes('json')) {
      const data = await response.json().catch(() => null)
      // Status is passed through UNCHANGED so `errorCode` keeps its meaning client side.
      return NextResponse.json(data, { status: response.status })
    }

    const text = await response.text().catch(() => '')
    return new Response(text, {
      status: response.status,
      headers: { 'Content-Type': contentType || 'text/plain' },
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        message: 'The workflow proxy failed unexpectedly.',
        errorCode: 'TRANSPORT_UNAVAILABLE',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}