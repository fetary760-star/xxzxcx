import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
).trim().replace(/\/+$/, '')

// Sensitive paths that receive a strict CSP + no-store caching.
const SENSITIVE_PATH_PREFIXES = [
  '/dashboard',
  '/admin',
  '/settings',
  '/users',
  '/profile',
  '/reports',
  '/analytics',
  '/performance',
  '/schedule',
  '/workload',
  '/notifications',
  '/amendments',
  '/tasks',
  '/self-evaluation',
  '/admin-dashboard'
]

function generateCspNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function buildCsp(nonce: string, strict: boolean): string {
  const connectSrc = [
    "'self'",
    'http://localhost:5000',
    'http://svhqiis03:8757',
    'http://svdcmpa01',
    'https://*.ethiopianairlines.com',
    'wss://svhqiis03:8756',
    'ws://svhqiis03:8756',
    'wss://svhqiis03:8757',
    'ws://svhqiis03:8757',
    'blob:'
  ].join(' ')

  const directives = [
    "default-src 'self' blob: data:",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}' https://fonts.googleapis.com`,
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: https: http: blob: http://localhost:5000",
    "media-src 'self' blob: data:",
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'"
  ]

  void strict
  return directives.join('; ')
}

function applySecurityHeaders(res: NextResponse, nonce: string, isSensitive: boolean): NextResponse {
  res.headers.set('Content-Security-Policy', buildCsp(nonce, isSensitive))
  res.headers.set('X-Frame-Options', 'DENY')
  res.headers.set('X-Content-Type-Options', 'nosniff')
  res.headers.set('X-XSS-Protection', '1; mode=block')
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  res.headers.set(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=()'
  )
  res.headers.set('x-nonce', nonce)

  if (isSensitive) {
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, private')
    res.headers.set('Pragma', 'no-cache')
    res.headers.set('Expires', '0')
  }
  return res
}

function isSensitivePath(pathname: string): boolean {
  const p = pathname.toLowerCase()
  return SENSITIVE_PATH_PREFIXES.some(prefix => p === prefix || p.startsWith(prefix + '/'))
}

const SELF_EVALUATION_ROLES = [
  'admin', 'administrator', 'system_admin', 'special_admin', 'specialadmin',
  'director', 'dir', 'department_director',
  'special_team_leader', 'specialteamleader', 'special_tl', 'specialtl',
  'manager', 'mgr', 'manager_role',
  'shop_manager', 'shopmanager',
  'team_leader', 'teamleader', 'shop_tl', 'shopteamleader', 'shop_team_leader', 'stl',
  'engineer', 'technician', 'certifying_staff', 'certifyingstaff',
  'qa_personnel', 'qapersonnel', 'qa_manager', 'qamanager',
  'ecaa_personnel', 'ecaapersonnel', 'ecaa', 'ecaa_team', 'ecaa_staff',
  'inspector',
  'documentation_team_leader', 'documentationteamleader',
  'documentation_clerk', 'documentationclerk',
  'hr_specialist', 'hrspecialist', 'hr_manager', 'hrmanager',
  'customer_personnel', 'customer'
]

const routeRoleMap: Array<{ prefix: string; allowedRoles: string[] }> = [
  { prefix: '/admin-dashboard', allowedRoles: ['admin', 'special_admin', 'specialadmin'] },
  { prefix: '/admin', allowedRoles: ['admin', 'special_admin', 'specialadmin'] },
  { prefix: '/self-evaluation', allowedRoles: SELF_EVALUATION_ROLES },
  { prefix: '/maintenix-data', allowedRoles: ['admin', 'team_leader', 'director', 'manager', 'shop_manager'] },
  { prefix: '/employees', allowedRoles: ['admin', 'team_leader', 'director', 'shop_tl', 'manager', 'shop_manager'] },
  { prefix: '/performance', allowedRoles: ['admin', 'team_leader', 'director', 'manager', 'shop_manager'] },
  { prefix: '/reports', allowedRoles: ['admin', 'team_leader', 'director', 'shop_tl', 'customer_personnel', 'manager', 'shop_manager'] },
  { prefix: '/transfers', allowedRoles: ['admin', 'engineer', 'team_leader', 'director', 'customer_personnel', 'shop_tl', 'manager', 'shop_manager'] },
  { prefix: '/management', allowedRoles: ['admin', 'team_leader', 'director', 'shop_tl', 'manager', 'shop_manager'] },
  { prefix: '/tasks/create', allowedRoles: ['admin', 'team_leader', 'director', 'customer_personnel', 'manager', 'shop_tl', 'shop_manager'] },
  { prefix: '/tasks/completed', allowedRoles: ['admin', 'team_leader', 'director', 'engineer', 'customer_personnel', 'customer', 'shop_tl', 'manager', 'shop_manager'] },
  { prefix: '/tasks', allowedRoles: ['admin', 'team_leader', 'director', 'engineer', 'customer_personnel', 'customer', 'shop_tl', 'manager', 'shop_manager'] },
  { prefix: '/dashboard', allowedRoles: ['admin', 'team_leader', 'director', 'engineer', 'customer_personnel', 'customer', 'shop_tl', 'manager', 'shop_manager'] },
  { prefix: '/', allowedRoles: ['admin', 'team_leader', 'director', 'engineer', 'customer_personnel', 'customer', 'shop_tl', 'manager', 'shop_manager'] }
]

function readToken(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization') || ''
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim()
    if (token && token !== 'null' && token !== 'undefined') return token
  }

  const cookieHeader = req.headers.get('cookie') || ''
  if (!cookieHeader) return null

  const match = cookieHeader.match(
    /(?:^|;\s*)(?:access_token|auth_token|authToken)=([^;]+)/
  )
  if (match) {
    const token = decodeURIComponent(match[1]).trim()
    if (token && token !== 'null' && token !== 'undefined') return token
  }

  return null
}

/**
 * Decode JWT payload without verification (Edge runtime compatible).
 * Used as fallback when /auth/me is unreachable.
 */
function decodeJwtPayloadEdge(token: string): any {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)
    const decoded = atob(padded)
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

/**
 * Extract user info from JWT claims (Edge runtime compatible).
 */
function extractUserFromJwtClaims(claims: any): any {
  if (!claims) return null
  const userId = claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']
  if (!userId) return null

  return {
    user_id: parseInt(userId),
    id: parseInt(userId),
    userId: parseInt(userId),
    role: claims['Role'] || claims['role'] || claims['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || '',
    role_name: claims['Role'] || claims['role'] || claims['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'] || '',
    full_name: claims['FullName'] || claims['fullName'] || claims['full_name'] || '',
    fullName: claims['FullName'] || claims['fullName'] || claims['full_name'] || '',
    email: claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] || claims['email'] || '',
    shop_id: claims['ShopId'] && claims['ShopId'] !== '' && !isNaN(parseInt(claims['ShopId'])) ? parseInt(claims['ShopId']) : undefined,
    authenticated: true
  }
}

/**
 * Query backend /auth/me to validate token and get user.
 * FIXED: Falls back to local JWT decode if /auth/me is unreachable.
 */
async function fetchUserByToken(token: string | null, cookieHeader: string | null) {
  if (!token) return null

  // Always prepare a JWT-decoded fallback user
  const claims = decodeJwtPayloadEdge(token)
  const jwtUser = extractUserFromJwtClaims(claims)

  // Check if token is expired
  if (claims && claims.exp) {
    const now = Math.floor(Date.now() / 1000)
    if (claims.exp < now) {
      return null // Token expired, don't use fallback
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    }
    if (cookieHeader) headers['Cookie'] = cookieHeader

    const res = await fetch(`${API_BASE}/auth/me`, {
      method: 'GET',
      headers,
      signal: controller.signal,
      cache: 'no-store'
    })

    clearTimeout(timeoutId)

    if (!res.ok) {
      // Backend returned non-200 — use JWT fallback if available
      return jwtUser
    }

    const body = await res.json().catch(() => null)
    const user = body?.user ?? body

    if (user && (user.id || user.user_id || user.userId)) {
      return user
    }

    // /auth/me returned but no valid user — use JWT fallback
    return jwtUser
  } catch {
    // Network error, timeout, etc. — use JWT fallback
    return jwtUser
  }
}

function normalizeRole(raw: any): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'number') return String(raw)
  const s = String(raw).toLowerCase().trim()
  return s.replace(/[\s\-_]+/g, '_')
}

function findMatchingRoute(pathname: string) {
  const ordered = routeRoleMap.slice().sort((a, b) => b.prefix.length - a.prefix.length)
  for (const r of ordered) {
    if (r.prefix === '/') {
      if (pathname === '/') return r
      continue
    }
    if (pathname === r.prefix || pathname.startsWith(r.prefix + '/')) {
      return r
    }
  }
  return null
}

export async function middleware(req: NextRequest) {
  const pathname = req.nextUrl.pathname

  const nonce = generateCspNonce()
  const sensitive = isSensitivePath(pathname)

  const forwardedHeaders = new Headers(req.headers)
  forwardedHeaders.set('x-csp-nonce', nonce)

  if (pathname.startsWith('/api/')) {
    const cookieHeader = req.headers.get('cookie')
    const token = readToken(req)
    if (token) {
      const user = await fetchUserByToken(token, cookieHeader)
      if (user) {
        try {
          forwardedHeaders.set('x-user-id', String(user.user_id ?? user.id ?? user.userId ?? ''))
          forwardedHeaders.set('x-user-role', normalizeRole(user.role ?? user.role_name ?? user.roleName ?? ''))
          forwardedHeaders.set('x-user-json', JSON.stringify(user))
          forwardedHeaders.set('x-auth-token', token)
          if (!forwardedHeaders.get('authorization')) {
            forwardedHeaders.set('authorization', `Bearer ${token}`)
          }
        } catch (e) {
          console.error('middleware: failed to forward user headers', e)
        }
      }
    }
    const res = NextResponse.next({ request: { headers: forwardedHeaders } })
    return applySecurityHeaders(res, nonce, sensitive)
  }

  // Public pages & Next.js internals
  if (pathname === '/login' || pathname.startsWith('/_next/') || pathname.startsWith('/favicon')) {
    const res = NextResponse.next({ request: { headers: forwardedHeaders } })
    return applySecurityHeaders(res, nonce, sensitive)
  }

  const match = findMatchingRoute(pathname)
  if (!match) {
    const res = NextResponse.next({ request: { headers: forwardedHeaders } })
    return applySecurityHeaders(res, nonce, sensitive)
  }

  const cookieHeader = req.headers.get('cookie')
  const token = readToken(req)
  let user: any = null

  if (token) {
    user = await fetchUserByToken(token, cookieHeader)
  }

  if (!user) {
    const loginUrl = new URL('/login', req.url)
    loginUrl.searchParams.set('redirect', req.nextUrl.pathname + (req.nextUrl.search || ''))
    const redirect = NextResponse.redirect(loginUrl)
    return applySecurityHeaders(redirect, nonce, sensitive)
  }

  const roleRaw = user.role ?? user.role_name ?? user.roleName ?? ''
  const role = normalizeRole(roleRaw)
  const allowedLower = match.allowedRoles.map(r => normalizeRole(r))

  if (!allowedLower.includes(role)) {
    const redirect = NextResponse.redirect(new URL('/unauthorized', req.url))
    return applySecurityHeaders(redirect, nonce, sensitive)
  }

  try {
    forwardedHeaders.set('x-user-id', String(user.user_id ?? user.id ?? user.userId ?? ''))
    forwardedHeaders.set('x-user-role', role)
    forwardedHeaders.set('x-user-json', JSON.stringify(user))
    if (token) {
      forwardedHeaders.set('x-auth-token', token)
      if (!forwardedHeaders.get('authorization')) {
        forwardedHeaders.set('authorization', `Bearer ${token}`)
      }
    }
  } catch (e) {
    console.error('Failed to set user headers:', e)
  }

  const res = NextResponse.next({ request: { headers: forwardedHeaders } })
  return applySecurityHeaders(res, nonce, sensitive)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|otf|eot|map)).*)'
  ],
}
