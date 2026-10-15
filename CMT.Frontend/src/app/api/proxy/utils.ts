// src/app/api/proxy/utils.ts
// Helper to proxy requests to the backend specified in environment.
//
// CSRF STRATEGY (simplified):
// The .NET backend's CsrfMiddleware now skips CSRF validation for requests
// that carry a valid Bearer token in the Authorization header. Since the
// Next.js proxy always forwards the Authorization header, we simply:
//   1. Strip the client-side CSRF headers (X-CSRF-Token, X-Requested-With)
//      to avoid any mismatch issues
//   2. Strip the CSRF-TOKEN cookie to avoid stale/mismatched cookie values
//   3. Forward the Authorization: Bearer header as-is
//
// CRITICAL FIX: The browser often does NOT send an Authorization header —
// it only sends HttpOnly cookies (access_token, auth_token, authToken).
// The .NET backend JWT Bearer middleware only processes the Authorization
// header, NOT cookies. So we must extract the token from cookies and inject
// it as an Authorization header before forwarding to the backend. Without
// this, the backend falls back to a default user id (1) on [AllowAnonymous]
// endpoints, causing 403 errors when the notification doesn't belong to
// that default user.

/**
 * Extracts a bearer token from the cookie header string.
 * Checks access_token, auth_token, authToken in priority order.
 */
function extractTokenFromCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  const candidateNames = ['access_token', 'auth_token', 'authToken']
  for (const name of candidateNames) {
    const re = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)
    const m = cookieHeader.match(re)
    if (m) {
      try {
        const raw = decodeURIComponent(m[1]).trim()
        if (raw && raw.toLowerCase() !== 'null' && raw.toLowerCase() !== 'undefined') {
          return raw
        }
      } catch {
        // fall through
      }
    }
  }
  return null
}

export async function proxyRequest(req: Request, backendPath: string) {
  const rawBackendUrl = (
    process.env.BACKEND_URL ||
    process.env.CMT_API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    'http://localhost:5000/api'
  ).trim();

  if (!rawBackendUrl) {
    return new Response(
      JSON.stringify({
        error: 'BACKEND_URL, CMT_API_BASE_URL, or NEXT_PUBLIC_API_BASE_URL not configured on server. Set one in your .env.local'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  // Remove trailing slash from configured backend base
  let backendBase = rawBackendUrl.replace(/\/$/, '')

  // If backendBase is relative (starts with '/'), resolve it to absolute using request origin.
  if (!/^https?:\/\//i.test(backendBase)) {
    try {
      const reqUrl = new URL((req as any).url)
      backendBase = `${reqUrl.protocol}//${reqUrl.host}${backendBase}`
    } catch (err: any) {
      return new Response(
        JSON.stringify({
          error: 'Failed to resolve BACKEND_URL from relative value',
          details: err?.message ?? String(err),
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    }
  }

  // Ensure backendPath begins with a slash
  const path = backendPath.startsWith('/') ? backendPath : `/${backendPath}`
  const url = `${backendBase}${path}`

  // ── Build outgoing headers ──────────────────────────────────────────
  // Strip: host, and ALL client-side CSRF headers (the backend will skip
  // CSRF validation when it sees the Bearer token)
  const headers: Record<string, string> = {}
  const skipHeaders = new Set([
    'host',
    'x-csrf-token',
    'x-requested-with',
  ])

  req.headers.forEach((value, key) => {
    const lowerKey = key.toLowerCase()
    if (skipHeaders.has(lowerKey)) {
      return
    }
    headers[key] = value
  })

  // ── Inject Authorization header from cookies if missing ─────────────
  // The browser only sends cookies; the backend needs Authorization: Bearer.
  const hasAuthHeader = Object.keys(headers).some(
    k => k.toLowerCase() === 'authorization'
  )
  if (!hasAuthHeader) {
    const cookieHeader = headers['cookie'] || req.headers.get('cookie')
    const token = extractTokenFromCookies(cookieHeader)
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
  }

  // Strip CSRF-related cookies from the forwarded cookie header to avoid
  // stale/mismatched values confusing the backend.
  if (headers['cookie']) {
    const cleanedCookies = headers['cookie']
      .split(';')
      .map(c => c.trim())
      .filter(c => {
        const name = c.split('=')[0].trim().toLowerCase()
        return name !== 'csrf-token' &&
               name !== 'x-csrf-token' &&
               !name.startsWith('.aspnetcore.antiforgery')
      })
      .join('; ')

    if (cleanedCookies) {
      headers['cookie'] = cleanedCookies
    } else {
      delete headers['cookie']
    }
  }

  // ── Read body ──────────────────────────────────────────────────────
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  let body: ArrayBuffer | null = null
  if (hasBody) {
    try {
      body = await req.arrayBuffer()
    } catch {
      body = null
    }
  }

  const init: RequestInit = {
    method: req.method,
    headers,
    body: hasBody && body && body.byteLength > 0 ? body : undefined,
    redirect: 'follow',
  }

  try {
    const backendRes = await fetch(url, init)

    // ── Response handling ──────────────────────────────────────────
    const resHeaders = new Headers()
    const hopByHop = new Set([
      'connection', 'keep-alive', 'proxy-authenticate',
      'proxy-authorization', 'te', 'trailer',
      'transfer-encoding', 'upgrade',
    ])

    backendRes.headers.forEach((value, key) => {
      if (!hopByHop.has(key.toLowerCase())) {
        resHeaders.set(key, value)
      }
    })

    const responseBody = await backendRes.arrayBuffer()
    return new Response(responseBody, {
      status: backendRes.status,
      headers: resHeaders,
    })
  } catch (err: any) {
    const message = err?.message ?? String(err)
    return new Response(JSON.stringify({ error: 'Proxy request failed', details: message }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}