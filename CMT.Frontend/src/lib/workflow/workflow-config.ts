/**
 * =====================================================================================
 * AMENDED v17 - PHASE 1 (FRONTEND)
 * CMT.Frontend/src/lib/workflow/workflow-config.ts                          (NEW FILE)
 * Copy to: CMT.Frontend/src/lib/workflow/workflow-config.ts
 *
 * WHAT THIS FILE IS
 * -----------------
 * THE SINGLE CONFIG POINT of the whole amended workflow surface, as required by the
 * Phase 1 brief:
 *
 *   "Base URL comes from a single VITE_API_BASE_URL config point, with a pluggable
 *    transport so swapping real database -> real API is one switch, plus uniform
 *    ErrorCode surfacing."
 *
 * WHY IT IS NEEDED
 * ----------------
 * Today the base URL is re-resolved in FOURTEEN different places
 * (`workflow-proxy.ts`, `signature-proxy.ts`, `serverAuth.ts`, `users-proxy.ts`,
 * `lib/api.ts`, and 9 route handlers), each with its OWN default
 * (`http://localhost:5000/api` in one file, `https://localhost:5000/api` in another).
 * That means:
 *   - a deployment that changes the API host has to be edited in 14 files;
 *   - http vs https drift produces an unexplainable "The workflow service is unreachable"
 *     on exactly half of the endpoints;
 *   - nothing can be pointed at a different API without touching component code.
 *
 * From now on EVERY workflow call resolves its base URL here, and nowhere else.
 *
 * RESOLUTION ORDER (first non-empty wins)
 * ---------------------------------------
 *   1. import.meta.env.VITE_API_BASE_URL          <- the canonical Phase 1 switch
 *   2. process.env.VITE_API_BASE_URL              <- same name, Node / Next runtime
 *   3. process.env.NEXT_PUBLIC_VITE_API_BASE_URL  <- browser-exposed alias under Next
 *   4. process.env.NEXT_PUBLIC_API_BASE_URL       <- pre-existing repository variable
 *   5. process.env.CMT_API_BASE_URL                <- server-only, used by route handlers
 *   6. ''  (EMPTY)  -> same-origin, i.e. the Next.js proxy at /api/...
 *
 * WHY EMPTY IS THE DEFAULT
 * ------------------------
 * `workflow-api.ts` is a BROWSER client and must keep going through the Next.js proxy so
 * the HttpOnly `access_token` cookie is attached server side and no bearer token is ever
 * touched in client code. An empty base URL keeps that behaviour EXACTLY as it is today.
 * Setting VITE_API_BASE_URL to an absolute origin bypasses the proxy and talks to ASP.NET
 * directly - which is the "one switch" the brief asks for, and the only supported way to
 * change it.
 *
 * BINDING RULES
 *   (1) NEVER hardcode `/api/...` in a component. Import WORKFLOW_ROUTES from
 *       `workflow-api.ts`, which builds every path through `apiUrl()` below.
 *   (2) NEVER append a trailing slash to VITE_API_BASE_URL: it is stripped here anyway,
 *       and a double slash makes ASP.NET answer 404 instead of routing the controller.
 *   (3) The base URL must NOT already end in `/api`. The route table owns the `/api`
 *       prefix, so `https://host` is correct and `https://host/api` is normalised down to
 *       `https://host` to keep the pre-existing NEXT_PUBLIC_API_BASE_URL values working.
 * =====================================================================================
 */

/** The env shapes this file tolerates without exploding under either bundler. */
type EnvRecord = Record<string, string | undefined>

/**
 * Vite exposes `import.meta.env`; Next/Node does not. Accessing it unguarded throws in a
 * CommonJS transpilation target, so the read is isolated here.
 */
function viteEnv(): EnvRecord {
  try {
    // Webpack (and therefore Next.js) only supports PROPERTY ACCESS on
    // `import.meta`; a bare reference such as `import.meta as any` raises
    // "Critical dependency: Accessing import.meta directly is unsupported".
    // Reading the `.env` property directly keeps the bundler quiet and still
    // evaluates to `undefined` under Next/Node, where the field does not exist.
    const env = (import.meta as unknown as { env?: EnvRecord }).env
    return env && typeof env === 'object' ? env : {}
  } catch {
    return {}
  }
}

/** `process` is absent in a pure browser bundle, so this read is isolated too. */
function nodeEnv(): EnvRecord {
  try {
    if (typeof process === 'undefined' || !process || typeof process.env !== 'object') return {}
    return process.env as EnvRecord
  } catch {
    return {}
  }
}

function firstNonEmpty(...values: Array<string | undefined | null>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return ''
}

/**
 * Normalises a configured base URL:
 *   - trims whitespace,
 *   - removes every trailing slash,
 *   - removes a trailing `/api` (the route table owns that prefix).
 */
export function normalizeApiBaseUrl(raw: string | undefined | null): string {
  const value = (raw ?? '').trim()
  if (value === '') return ''
  const withoutTrailingSlash = value.replace(/\/+$/, '')
  return withoutTrailingSlash.replace(/\/api$/i, '')
}

const RESOLVED_BASE_URL = normalizeApiBaseUrl(
  firstNonEmpty(
    viteEnv().VITE_API_BASE_URL,
    nodeEnv().VITE_API_BASE_URL,
    nodeEnv().NEXT_PUBLIC_VITE_API_BASE_URL,
    nodeEnv().NEXT_PUBLIC_API_BASE_URL,
    nodeEnv().CMT_API_BASE_URL,
  ),
)

/**
 * Runtime override, used by tests and by a host page that injects the API origin after the
 * bundle was built. `null` means "no override, use the compiled value".
 */
let runtimeBaseUrlOverride: string | null = null

/**
 * THE ONE SWITCH. Call it once, before the first workflow request, to repoint the whole
 * client at a different API without touching a single component:
 *
 *   setApiBaseUrl('https://se-api.internal')   // talk to ASP.NET directly
 *   setApiBaseUrl('')                          // back to the Next.js proxy (default)
 */
export function setApiBaseUrl(value: string | null): void {
  runtimeBaseUrlOverride = value === null ? null : normalizeApiBaseUrl(value)
}

/** The base URL currently in force. `''` means same-origin (Next.js proxy). */
export function apiBaseUrl(): string {
  return runtimeBaseUrlOverride === null ? RESOLVED_BASE_URL : runtimeBaseUrlOverride
}

/** True while the client is going through the Next.js proxy (the default deployment). */
export function isProxyMode(): boolean {
  return apiBaseUrl() === ''
}

/**
 * Turns a ROUTE-TABLE path (always starting with `/api/`) into the absolute URL to fetch.
 * In proxy mode the path is returned unchanged, which is exactly today's behaviour.
 */
export function apiUrl(path: string): string {
  const base = apiBaseUrl()
  if (base === '') return path
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

/** Every request aborts after this many milliseconds, matching the proxy timeout. */
export const WORKFLOW_REQUEST_TIMEOUT_MS = 30000

/**
 * Sent on every mutating request so the ASP.NET `AuthorizationHandler` and the Next.js
 * route handlers can tell an app call apart from a stray cross-site POST.
 */
export const WORKFLOW_REQUESTED_WITH = 'CMT.Frontend'

/** Diagnostics for a settings screen or a support ticket - never printed to the user. */
export function workflowConfigSnapshot(): {
  baseUrl: string
  proxyMode: boolean
  source: string
  timeoutMs: number
} {
  const source =
    runtimeBaseUrlOverride !== null
      ? 'runtime override (setApiBaseUrl)'
      : RESOLVED_BASE_URL === ''
        ? 'default (same-origin Next.js proxy)'
        : 'VITE_API_BASE_URL / NEXT_PUBLIC_API_BASE_URL / CMT_API_BASE_URL'

  return {
    baseUrl: apiBaseUrl(),
    proxyMode: isProxyMode(),
    source,
    timeoutMs: WORKFLOW_REQUEST_TIMEOUT_MS,
  }
}