/**
 * FIXED: src/lib/proxy-auth.ts
 * 
 * KEY FIX: Added `req.cookies.get()` API usage as the PRIMARY method for
 * extracting tokens in Next.js App Router Route Handlers.
 * 
 * In Next.js App Router, middleware's `NextResponse.next({ request: { headers } })`
 * does NOT reliably forward custom headers to Route Handlers. The Route Handler
 * receives the original browser request. Since the browser only sends cookies
 * (not Authorization headers for same-origin API calls from fetch with credentials: 'include'),
 * we must use the NextRequest cookies API which is the most reliable way to
 * access cookies in App Router.
 * 
 * IMPORTANT: This file must be imported in route handlers that use NextRequest.
 * The `resolveBearerToken` function now accepts `Request | NextRequest` and
 * uses the cookies API when available.
 */

/** Return true if the string looks like a usable bearer token value. */
function isUsableTokenValue(token: string | null | undefined): boolean {
  if (!token) return false
  const trimmed = token.trim()
  if (!trimmed) return false
  const lower = trimmed.toLowerCase()
  if (lower === 'null' || lower === 'undefined' || lower === 'cookie-session' || lower === 'session') return false
  // Must look like a JWT (3 dot-separated parts) or at least be reasonably long
  if (trimmed.length < 10) return false
  return true
}

/**
 * Resolve the bearer token from the incoming request.
 * 
 * Priority order:
 *   1. NextRequest.cookies API (most reliable in App Router Route Handlers)
 *   2. Authorization header
 *   3. x-auth-token header (middleware-forwarded, may not work in all versions)
 *   4. Manual cookie header parsing (fallback)
 *
 * Returns the raw token string (no "Bearer " prefix) or null.
 */
export function resolveBearerToken(request: Request): string | null {
  // 1. Try NextRequest cookies API first (most reliable in App Router)
  if ('cookies' in request && typeof (request as any).cookies?.get === 'function') {
    const nextReq = request as any
    const candidateNames = ['access_token', 'auth_token', 'authToken']
    for (const name of candidateNames) {
      const cookie = nextReq.cookies.get(name)
      if (cookie?.value && isUsableTokenValue(cookie.value)) {
        return cookie.value.trim()
      }
    }
  }

  // 2. Authorization header
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization')
  if (authHeader) {
    const t = authHeader.replace(/^Bearer\s+/i, '').trim()
    if (isUsableTokenValue(t)) return t
  }

  // 3. Middleware-forwarded token
  const forwarded = request.headers.get('x-auth-token')
  if (isUsableTokenValue(forwarded)) return (forwarded as string).trim()

  // 4. Manual cookie header parsing (fallback)
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
          // If decodeURIComponent fails, try raw value
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
 * Build a headers object suitable for proxying a request to the .NET backend.
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

  // Don't forward the full cookie header to backend - it may cause issues
  // The Authorization header is sufficient for the ASP.NET backend

  const csrfToken = request.headers.get('x-csrf-token')
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken

  const requestedWith = request.headers.get('x-requested-with')
  if (requestedWith) headers['X-Requested-With'] = requestedWith

  return { ...headers, ...extra }
}