/**
 * =====================================================================================
 * NEW FILE
 * Copy to: CMT.Frontend/src/app/api/maintainx/[[...path]]/route.ts
 *
 * WHY THIS ROUTE EXISTS
 * ---------------------
 * MaintainX (http://svdcmpa01/maintenix) is intranet-only and its credentials live in
 * appsettings.json, so the browser must never call it and must never hold a bearer token.
 * This handler is the credential bridge for the two NEW capabilities:
 *
 *   GET  /api/maintainx/connector-status          -> is the connector switched on?
 *   POST /api/maintainx/et-part-number            -> resolve one ET P/N
 *   GET  /api/maintainx/user-identity?userId=     -> SE user  ->  MaintainX staff number
 *   POST /api/maintainx/signatures/import         -> import one Electronic Signature
 *
 * WHY `[[...path]]` (OPTIONAL CATCH-ALL)
 *   A required catch-all (`[...path]`) does not match a bare parent segment. The optional
 *   form matches any depth with one file, exactly like the signatures proxy.
 *
 * WHY A SEPARATE PROXY INSTEAD OF REUSING taskcard-proxy
 *   Same upstream host, different controller and different failure vocabulary: the ET P/N
 *   and signature endpoints answer with a STATUS the UI renders as a hint, so the status
 *   code and the JSON body must pass through UNCHANGED. Collapsing them would destroy the
 *   difference between "connector disabled" and "MaintainX unreachable" — the whole point
 *   of the connector contract.
 *
 * TIMEOUT
 *   Scraping is slow (login -> menu -> search -> Applicability -> Details), so the ceiling
 *   is 120 s, matching the task-card proxy rather than the 30 s signature proxy.
 * =====================================================================================
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
)
  .trim()
  .replace(/\/+$/, '')

/** MaintainX scraping is slow; mirror the task-card proxy ceiling. */
const TIMEOUT_MS = 120000

const TOKEN_COOKIE_NAMES = ['access_token', 'auth_token', 'authToken'] as const
const PLACEHOLDER_TOKENS = new Set(['', 'null', 'undefined', 'cookie-session'])

/** Storage locators must never cross this boundary, at any nesting depth. */
const FORBIDDEN_KEYS = new Set([
  'storagepath',
  'storage_path',
  'storagekey',
  'storage_key',
  'objectkey',
  'object_key',
  'absolutepath',
  'physicalpath',
  'maintainxpassword',
  'password',
])

/** Buffer-free JSON forwarding, but keep Node so `process.env` and long timeouts behave. */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

function isRealToken(value: string | null | undefined): value is string {
  if (!value) return false
  return !PLACEHOLDER_TOKENS.has(value.trim())
}

function extractAccessToken(req: NextRequest): string | null {
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

/** Defensive removal of any secret or storage locator the controller might leak. */
function sanitize(payload: unknown): unknown {
  if (Array.isArray(payload)) return payload.map(sanitize)
  if (payload && typeof payload === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key.toLowerCase())) continue
      out[key] = sanitize(value)
    }
    return out
  }
  return payload
}

function unauthorized() {
  return NextResponse.json(
    { message: 'Your session has expired. Sign in again to continue.', status: 'AuthenticationFailed' },
    { status: 401 },
  )
}

async function forward(req: NextRequest, segments: string[] | undefined, method: 'GET' | 'POST') {
  const token = extractAccessToken(req)
  if (!token) return unauthorized()

  const subPath = (segments ?? []).filter(Boolean).map(encodeURIComponent).join('/')
  const search = new URL(req.url).search || ''
  const backendUrl = `${API_BASE}/maintainx${subPath ? `/${subPath}` : ''}${search}`

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  }

  const csrf = req.headers.get('x-csrf-token')
  if (csrf) headers['X-CSRF-Token'] = csrf
  const requestedWith = req.headers.get('x-requested-with')
  if (requestedWith) headers['X-Requested-With'] = requestedWith

  let body: string | undefined
  if (method === 'POST') {
    headers['Content-Type'] = 'application/json'
    body = await req.text().catch(() => '')
    if (!body) body = '{}'
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(backendUrl, {
      method,
      headers,
      body,
      cache: 'no-store',
      signal: controller.signal,
    })

    if (response.status === 401) return unauthorized()
    if (response.status === 204) {
      return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } })
    }

    const text = await response.text().catch(() => '')

    // The STATUS CODE and the body pass through unchanged: the UI distinguishes
    // "connector disabled" from "unreachable" from "not registered" by them.
    let parsed: unknown = null
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      return NextResponse.json(
        {
          message: `The MaintainX service returned a non-JSON response (HTTP ${response.status}).`,
          status: 'Unavailable',
        },
        { status: response.ok ? 502 : response.status },
      )
    }

    const out = NextResponse.json(sanitize(parsed), { status: response.status })
    out.headers.set('Cache-Control', 'private, no-store')
    return out
  } catch (error: unknown) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return NextResponse.json(
      {
        message: aborted
          ? 'MaintainX did not answer in time. It is intranet-only, so it may be slow or unreachable.'
          : 'The MaintainX service is unreachable. Nothing was changed.',
        status: 'Unavailable',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: aborted ? 504 : 502 },
    )
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params
  return forward(req, path, 'GET')
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params
  return forward(req, path, 'POST')
}