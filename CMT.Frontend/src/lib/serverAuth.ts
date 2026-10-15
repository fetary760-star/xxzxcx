import { NextRequest } from 'next/server'

export interface User {
  user_id?: number
  userId?: number
  id?: number
  role_id?: number
  roleId?: number
  role_name?: string
  roleName?: string
  role?: string
  full_name?: string
  fullName?: string
  email?: string
  shop_id?: number
  authenticated?: boolean
}

export class AuthError extends Error {
  public readonly status: number
  public readonly body: Record<string, string>

  constructor(status: number, body: Record<string, string>) {
    super(body.error || 'Auth error')
    this.name = 'AuthError'
    this.status = status
    this.body = body
  }
}

const API_BASE = (
  process.env.CMT_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'http://localhost:5000/api'
).trim().replace(/\/+$/, '')

function decodeJwtPayload(token: string): any {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const payload = parts[1]
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4)

    const decoded = Buffer.from(padded, 'base64').toString('utf-8')
    return JSON.parse(decoded)
  } catch (error) {
    console.error('Failed to decode JWT:', error)
    return null
  }
}

function extractUserFromJwt(claims: any): User | null {
  if (!claims) return null

  const user: User = {
    user_id: claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier']
      ? parseInt(claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier'])
      : undefined,
    role: claims['Role'] || claims['role'] || claims['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'],
    role_name: claims['Role'] || claims['role'] || claims['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'],
    full_name: claims['FullName'] || claims['fullName'] || claims['full_name'],
    email: claims['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] || claims['email'],
    shop_id: claims['ShopId'] && claims['ShopId'] !== '' && !isNaN(parseInt(claims['ShopId'])) ? parseInt(claims['ShopId']) : undefined,
    authenticated: true
  }

  return user
}

function isValidTokenValue(token: string | null): boolean {
  if (!token) return false
  const trimmed = token.trim()
  if (trimmed === '' || trimmed === 'null' || trimmed === 'undefined') return false
  if (trimmed.startsWith('eyJ') && trimmed.split('.').length < 3) return false
  return true
}

function extractToken(req: NextRequest | Request): { token: string | null; authHeader: string | null } {
  // 1. Authorization header wins if it's a valid JWT.
  const authHeaderValue = req.headers.get('authorization')
  if (authHeaderValue) {
    const token = authHeaderValue.replace(/^Bearer\s+/i, '').trim()
    if (isValidTokenValue(token)) {
      return { token, authHeader: `Bearer ${token}` }
    }
  }

  // 2. Middleware-forwarded token (preferred over cookie parsing).
  const forwarded = req.headers.get('x-auth-token')
  if (forwarded && isValidTokenValue(forwarded)) {
    return { token: forwarded, authHeader: `Bearer ${forwarded}` }
  }

  // 3. Cookie — check access_token FIRST (canonical), then legacy names.
  const cookie = req.headers.get('cookie')
  if (cookie) {
    const tokenMatch = cookie.match(
      /(?:^|;\s*)(?:access_token|auth_token|authToken)=([^;]+)/
    )
    if (tokenMatch) {
      const token = decodeURIComponent(tokenMatch[1])
      if (isValidTokenValue(token)) {
        return { token, authHeader: `Bearer ${token}` }
      }
    }
  }

  return { token: null, authHeader: null }
}

/**
 * Try middleware-forwarded x-user-json header first, then fall back to
 * calling /auth/me on the backend. If /auth/me also fails, fall back to
 * local JWT decode.
 */
async function fetchUserFromBackend(req: NextRequest | Request): Promise<User | null> {
  // Fast path: middleware already validated this user.
  const forwardedUserJson = req.headers.get('x-user-json')
  if (forwardedUserJson) {
    try {
      const u = JSON.parse(forwardedUserJson)
      if (u && (u.user_id || u.userId || u.id)) {
        return { ...u, authenticated: true }
      }
    } catch {
      // fall through to backend validation
    }
  }

  try {
    const { token, authHeader } = extractToken(req)

    // Always prepare JWT fallback
    let jwtUser: User | null = null
    if (token) {
      const claims = decodeJwtPayload(token)
      jwtUser = extractUserFromJwt(claims)

      // Check if token is expired
      if (claims && claims.exp) {
        const now = Math.floor(Date.now() / 1000)
        if (claims.exp < now) {
          return null // Token expired
        }
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    }

    if (authHeader) {
      headers['Authorization'] = authHeader
    }

    // Forward cookies so cookie-based auth backends also work.
    const cookie = req.headers.get('cookie')
    if (cookie) headers['Cookie'] = cookie

    if (!authHeader && !cookie) {
      // No credentials at all — return JWT fallback if available.
      return jwtUser
    }

    const url = `${API_BASE}/auth/me`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
        cache: 'no-store'
      })
    } catch {
      clearTimeout(timeoutId)
      // Network error — use JWT fallback
      return jwtUser
    }

    clearTimeout(timeoutId)

    if (!response.ok) {
      await response.text().catch(() => '')
      // Backend returned error — use JWT fallback
      return jwtUser
    }

    const userData = await response.json()
    if (jwtUser && (!userData.role && !userData.role_name && !userData.roleName)) {
      userData.role = jwtUser.role
      userData.role_name = jwtUser.role_name
    }

    return userData
  } catch (error) {
    console.error('Error fetching user from backend:', error)
    // On any unexpected error, try JWT fallback
    const { token } = extractToken(req)
    if (token) {
      const claims = decodeJwtPayload(token)
      return extractUserFromJwt(claims)
    }
    return null
  }
}

function normalizeRole(role: string): string {
  if (!role) return ''
  const normalized = role.toLowerCase().trim()
  const roleMap: Record<string, string> = {
    'team_leader': 'team_leader',
    'teamleader': 'team_leader',
    'team-leader': 'team_leader',
    'shop_tl': 'shop_tl',
    'shoptl': 'shop_tl',
    'shop-tl': 'shop_tl',
    'shop_team_leader': 'shop_tl',
    'shopteamleader': 'shop_tl',
    'director': 'director',
    'manager': 'manager',
    'engineer': 'engineer',
    'customer_personnel': 'customer_personnel',
    'customerpersonnel': 'customer_personnel',
    'customer-personnel': 'customer_personnel',
    'customer': 'customer',
    'admin': 'admin',
    'administrator': 'admin',
    'shop_manager': 'shop_manager',
    'shopmanager': 'shop_manager',
    'shop-manager': 'shop_manager',
    'shop_mgr': 'shop_manager'
  }
  return roleMap[normalized] || normalized
}

function hasRequiredRole(user: User | null, allowedRoles: string[]): boolean {
  if (!user) return false

  const userRole = normalizeRole(user.role_name || user.roleName || user.role || '')
  const roleId = user.role_id || user.roleId

  const normalizedAllowed = allowedRoles.map(role => {
    if (/^\d+$/.test(role)) return role
    return normalizeRole(role)
  })

  if (userRole && normalizedAllowed.includes(userRole)) return true

  if (roleId) {
    const allowedRoleIds = allowedRoles
      .filter(role => /^\d+$/.test(role))
      .map(role => parseInt(role, 10))
    if (allowedRoleIds.includes(roleId)) return true
  }

  if (userRole === 'admin' || userRole === 'administrator') {
    return true
  }

  if (userRole === 'shop_tl') {
    if (normalizedAllowed.some(r => r === 'shop_tl' || r === '4')) return true
  }

  if (userRole === 'manager') {
    if (normalizedAllowed.some(r => r === 'manager' || r === '6')) return true
  }

  if (userRole === 'shop_manager') {
    if (normalizedAllowed.some(r =>
      r === 'shop_manager' || r === 'minimanager' || r === 'mini-manager' || r === '8'
    )) return true
  }

  return false
}

export async function requireRole(
  req: NextRequest | Request,
  allowedRoles: string[]
): Promise<User> {
  try {
    const user = await fetchUserFromBackend(req)

    if (!user) {
      throw new AuthError(401, {
        error: 'Authentication required',
        message: 'No valid user session found'
      })
    }

    if (!hasRequiredRole(user, allowedRoles)) {
      throw new AuthError(403, {
        error: 'Forbidden',
        message: 'Insufficient permissions'
      })
    }

    return user
  } catch (error) {
    if (error instanceof AuthError) throw error
    console.error('requireRole: Unexpected error:', error)
    throw new AuthError(500, {
      error: 'Authentication error',
      message: 'Failed to validate user permissions'
    })
  }
}

export async function getCurrentUser(req: NextRequest | Request): Promise<User | null> {
  return await fetchUserFromBackend(req)
}

export async function getUserFromRequest(req: NextRequest | Request): Promise<User | null> {
  try {
    const user = await fetchUserFromBackend(req)
    if (user) return { ...user, authenticated: true }
    return null
  } catch (error) {
    console.error('getUserFromRequest: Error getting user:', error)
    return null
  }
}

export function forwardAuthHeaders(req: NextRequest | Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  const { authHeader } = extractToken(req)
  if (authHeader) {
    headers['Authorization'] = authHeader
  }

  const csrfToken = req.headers.get('x-csrf-token')
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken

  const requestedWith = req.headers.get('x-requested-with')
  if (requestedWith) headers['X-Requested-With'] = requestedWith

  const cookie = req.headers.get('cookie')
  if (cookie) headers['Cookie'] = cookie

  return headers
}
