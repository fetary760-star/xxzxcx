import { requireRole } from '@/lib/serverAuth'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

/**
 * API endpoint to fetch users with Director or Team Lead roles
 * This endpoint is for populating the "Director" dropdown in forms
 * that need to assign directors/team leads.
 */

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')
const ALLOWED = ['team_leader', 'teamleader', 'director', 'manager', 'shop_manager', 'admin', 'shop_tl', '1', '5', '6', '7', '8']

function forwardHeaders(req: Request) {
  const h: Record<string, string> = {}
  // FIX (refresh cascade): resolve the bearer token from Authorization
  // header, middleware-forwarded x-auth-token header, OR access_token/
  // auth_token/authToken cookie
  const finalAuthHeader = resolveAuthorizationHeader(req)
  if (finalAuthHeader) h.authorization = finalAuthHeader
  const c = req.headers.get('cookie')
  if (c) h.cookie = c
  return h
}

interface User {
  user_id?: number
  userId?: number
  id?: number
  Id?: number
  role_id?: number
  roleId?: number
  RoleId?: number
  role_name?: string
  roleName?: string
  role?: string
  Role?: string
  full_name?: string
  fullName?: string
  name?: string
  Name?: string
  username?: string
  Username?: string
  email?: string
  Email?: string
}

interface FormattedDirector {
  id: number
  user_id: number
  name: string
  full_name?: string
  email?: string
  role_id?: number
  role_name?: string
}

export async function GET(req: Request) {
  await requireRole(req, ALLOWED)
  
  try {
    // Fetch all users from backend
    const res = await fetch(`${API_BASE}/users`, { headers: forwardHeaders(req) })
    
    if (!res.ok) {
      const text = await res.text()
      return new Response(text, { 
        status: res.status, 
        headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } 
      })
    }
    
    const data = await res.json()
    const allUsers = Array.isArray(data) ? data : data?.data ?? []
    
    // Filter to include users with Director (role_id = 1) or Team Lead (role_id = 3) roles
    const directors = allUsers.filter((user: User) => {
      const roleId = user.role_id ?? user.roleId ?? user.RoleId
      const roleName = (user.role_name ?? user.roleName ?? user.role ?? user.Role ?? '').toLowerCase().trim()
      
      // Include Director and Team Lead roles
      return roleId === 1 || roleId === 3 || 
             roleName === 'director' || 
             roleName === 'team_leader' || 
             roleName === 'teamleader' || 
             roleName === 'team leader'
    })
    
    // Format the response with consistent field names
    const formattedDirectors = directors.map((user: User): FormattedDirector => ({
      id: user.user_id ?? user.userId ?? user.id ?? user.Id ?? 0,
      user_id: user.user_id ?? user.userId ?? user.id ?? user.Id ?? 0,
      name: user.full_name ?? user.fullName ?? user.name ?? user.Name ?? user.username ?? user.Username ?? user.email ?? 'Unknown User',
      full_name: user.full_name ?? user.fullName ?? user.name ?? user.Name,
      email: user.email ?? user.Email,
      role_id: user.role_id ?? user.roleId ?? user.RoleId,
      role_name: user.role_name ?? user.roleName ?? user.role ?? user.Role
    }))
    
    return new Response(JSON.stringify(formattedDirectors), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (err: unknown) {
    console.error('[api/directors] GET error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: 'Failed to fetch directors', message: errorMessage }), 
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}