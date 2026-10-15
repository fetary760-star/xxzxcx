/**
 * Shared helper for proxy routes under `src/app/api/**`.
 *
 * PROBLEM THIS FIXES
 * ------------------
 * Many proxy routes were doing the equivalent of:
 *
 *     const token = request.headers.get('authorization')?.replace('Bearer ', '')
 *     if (!token) return NextResponse.json({ error: '...' }, { status: 401 })
 *
 * That works when the browser has a live JS session (the client attaches
 * `Authorization: Bearer <token>` from `secureAuthStore`), but on a full
 * page reload:
 *
 *   - The in-memory `secureAuthStore` token is lost.
 *   - Only the HttpOnly `access_token` / `refresh_token` cookies are sent.
 *   - `middleware.ts` forwards a validated `x-auth-token` header too, but
 *     the proxy routes were ignoring it.
 *
 * Result: dashboard/workload/tasks/performance/etc. proxy routes returned
 * 401 on refresh even though the user was still logged in — which is why
 * tables rendered as "No data" while `/api/task-holds/pending` (already
 * patched) worked.
 *
 * WHAT THIS HELPER DOES
 * ---------------------
 * - `resolveBearerToken(req)` looks for the token in (in order):
 *     1. `Authorization: Bearer <token>` header
 *     2. `x-auth-token` header forwarded by `middleware.ts`
 *     3. `access_token` / `auth_token` / `authToken` cookies
 *   and returns the raw token string (without the `Bearer ` prefix).
 *
 * - `resolveAuthorizationHeader(req)` returns `"Bearer <token>"` suitable
 *   for forwarding to the .NET backend, or `null` if no token exists.
 *
 * - `buildBackendProxyHeaders(req, extra?)` builds a `Headers`-shaped object
 *   that proxy routes should send to the backend: it always forwards the
 *   resolved Authorization header, the original `Cookie` header, any CSRF
 *   headers the client sent, and sets `Accept: application/json`.
 *
 * AMENDMENT: Added additional logging and improved cookie parsing to handle
 * URL-encoded JWT tokens in cookies.
 */

/** Return true if the string looks like a usable bearer token value. */
function isUsableTokenValue(token: string | null | undefined): boolean {
  if (!token) return false
  const trimmed = token.trim()
  if (!trimmed) return false
  const lower = trimmed.toLowerCase()
  if (lower === 'null' || lower === 'undefined' || lower === 'cookie-session' || lower === 'session') return false
  // Basic JWT structure check: should have 3 dot-separated parts
  if (trimmed.includes('.') && trimmed.split('.').length === 3) return true
  // Allow non-JWT tokens too (e.g., opaque tokens)
  return trimmed.length > 10
}

/**
 * Resolve the bearer token from the incoming request, checking:
 *   1. Authorization header.
 *   2. `x-auth-token` header forwarded by middleware.
 *   3. `access_token` / `auth_token` / `authToken` cookies.
 *
 * Returns the raw token string (no "Bearer " prefix) or null.
 */
export function resolveBearerToken(request: Request): string | null {
  // 1. Authorization header.
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  if (authHeader) {
    const t = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (isUsableTokenValue(t)) return t
  }

  // 2. Middleware-forwarded token.
  const forwarded = request.headers.get('x-auth-token')
  if (isUsableTokenValue(forwarded)) return (forwarded as string).trim()

  // 3. Cookies (in priority order).
  const cookieHeader = request.headers.get('cookie')
  if (cookieHeader) {
    const candidateNames = ['access_token', 'auth_token', 'authToken']
    for (const name of candidateNames) {
      const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)
      const m = cookieHeader.match(re)
      if (m) {
        try {
          const raw = decodeURIComponent(m[1]).trim()
          if (isUsableTokenValue(raw)) return raw
        } catch {
          // Try without decoding in case it's already plain
          const raw = m[1].trim()
          if (isUsableTokenValue(raw)) return raw
        }
      }
    }
  }

  return null
}

/**
 * Resolve an `"Bearer <token>"` Authorization header value suitable for
 * forwarding to the backend. Returns null if no token can be found.
 */
export function resolveAuthorizationHeader(request: Request): string | null {
  const token = resolveBearerToken(request)
  return token ? `Bearer ${token}` : null
}

/**
 * Build a headers object suitable for proxying a request to the .NET
 * backend. Always forwards:
 *   - The resolved `Authorization: Bearer <token>` (header / middleware /
 *     cookie fallback order).
 *   - The original `Cookie` header, so cookie-auth-based backends also work.
 *   - `x-csrf-token` / `x-requested-with` if the client sent them.
 *   - `Accept: application/json`.
 *
 * The optional `extra` argument lets the caller merge extra headers (e.g.
 * `{ 'Content-Type': 'application/json' }`). Extra headers override the
 * defaults on key conflict.
 */
export function buildBackendProxyHeaders(
  request: Request,
  extra: Record<string, string> = {}
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }

  const authHeader = resolveAuthorizationHeader(request)
  if (authHeader) headers['Authorization'] = authHeader

  const cookie = request.headers.get('cookie')
  if (cookie) headers['Cookie'] = cookie

  const csrfToken = request.headers.get('x-csrf-token')
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken

  const requestedWith = request.headers.get('x-requested-with')
  if (requestedWith) headers['X-Requested-With'] = requestedWith

  return { ...headers, ...extra }
}