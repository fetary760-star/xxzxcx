// If running in the browser, disable all console logging from this file.
if (typeof window !== 'undefined') {
  console.log = () => {};
}

import { NextRequest, NextResponse } from 'next/server'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

/**
 * RBAC proxy for /api/tasks/completed - FIXED to show only completed tasks
 * - Fetches tasks from backend CMT_API_BASE_URL/tasks (forwards auth/cookies).
 * - Resolves authenticated user (prefer middleware forwarded x-user-json; otherwise calls backend /auth/me).
 * - Applies server-side role-based scoping to the returned tasks array.
 * - CRITICAL FIX: Filters for status === 2 (Completed) AFTER RBAC filtering
 * - COMPREHENSIVE FIX: Directors now see ALL tasks where:
 *   1. Task was created by someone in their scope (createdBy in departmentUserIds), OR
 *   2. Task is assigned to someone in their scope (assignedEngineer matches user names), OR
 *   3. Task is assigned to Engineers under Team Leaders created by the Director, OR
 *   4. If Director has Team Leaders, they see ALL tasks (since Team Leaders see all tasks)
 * - Manager role filtering to see tasks from Shop TLs and their customer personnel
 * - Shop TL sees tasks created by users they created, not just by shop
 * - CRITICAL FIX: Directors with Team Leaders now see ALL tasks (since Team Leaders see all tasks)
 */

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/** Normalize role tokens */
function normalizeRole(raw: any): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'number') return String(raw)
  return String(raw).toLowerCase().trim().replace(/[\s\-\_]+/g, '_')
}

/** Try to get user from middleware forwarded header if present */
function getUserFromForwarded(headers: Headers): any | null {
  const j = headers.get('x-user-json')
  if (!j) return null
  try { return JSON.parse(j) } catch { return null }
}

/** If needed, call backend /auth/me to validate token and get user */
async function fetchUserFromBackend(authHeader?: string | null) {
  if (!authHeader) return null
  try {
    const res = await fetch(`${API_BASE}/auth/me`, { headers: { Authorization: authHeader, Accept: 'application/json' } })
    if (!res.ok) return null
    const body = await res.json().catch(() => null)
    return body?.user ?? body
  } catch {
    return null
  }
}

/** Forward Authorization/cookie headers when calling backend.
 *  REFRESH FIX: resolve Authorization from Authorization header,
 *  middleware-forwarded x-auth-token, or access_token/auth_token cookie
 *  so the .NET backend still receives a Bearer token after a full page
 *  reload (when the in-memory token in secureAuthStore is gone but the
 *  HttpOnly access_token cookie is still present).
 */
function buildForwardHeaders(incoming: Request) {
  const fh = new Headers()
  const auth = resolveAuthorizationHeader(incoming)
  if (auth) fh.set('authorization', auth)
  const cookie = incoming.headers.get('cookie')
  if (cookie) fh.set('cookie', cookie)
  fh.set('accept', 'application/json')
  return fh
}

/** Try to extract tasks array from many common backend response shapes */
function extractTaskArray(body: any): any[] {
  if (!body) return []
  if (Array.isArray(body)) return body
  if (Array.isArray(body.tasks)) return body.tasks
  if (Array.isArray(body.data)) return body.data
  if (Array.isArray(body.results)) return body.results
  // find the first array property
  if (typeof body === 'object') {
    for (const k of Object.keys(body)) {
      if (Array.isArray((body as any)[k])) return (body as any)[k]
    }
  }
  return []
}

/** 
 * FIXED: Extract assignedEngineer field from task with multiple case conventions
 * The backend may return AssignedEngineer (PascalCase) or assignedEngineer (camelCase)
 */
function getTaskAssignedEngineer(task: any): string {
  // Try all possible field names (PascalCase, camelCase, snake_case)
  const value = task.AssignedEngineer ?? 
                task.assignedEngineer ?? 
                task.assigned_engineer ?? 
                task.Assigned ?? 
                task.assigned ?? 
                task.assigned_to ?? 
                task.assigned_to_name ?? 
                ''
  return String(value ?? '').trim()
}

/** Get users created by shop TL from backend */
async function getUsersCreatedByShopTL(shopTLUserId: number, authHeader?: string | null): Promise<number[]> {
  if (!authHeader) return []
  try {
    console.log(`🔍 [Shop TL Users] Fetching users created by Shop TL ${shopTLUserId}`)
    const res = await fetch(`${API_BASE}/users/created-by-shop-tl/${shopTLUserId}`, { 
      headers: { Authorization: authHeader, Accept: 'application/json' } 
    })
    if (!res.ok) {
      console.log(`❌ [Shop TL Users] Failed to fetch users: ${res.status}`)
      return []
    }
    const users = await res.json().catch(() => [])
    const userIds = Array.isArray(users) ? users.map((u: any) => Number(u.user_id ?? u.userId ?? u.id)).filter(Boolean) : []
    console.log(`✅ [Shop TL Users] Found ${userIds.length} users created by Shop TL ${shopTLUserId}:`, userIds)
    return userIds
  } catch (err) {
    console.error(`❌ [Shop TL Users] Error fetching users:`, err)
    return []
  }
}

/** Get Shop Team Leaders managed by a Manager from backend */
async function getManagedShopTLs(managerId: number, authHeader?: string | null): Promise<number[]> {
  if (!authHeader) return []
  try {
    console.log(`🔍 [Manager Users] Fetching Shop TLs managed by Manager ${managerId}`)
    const res = await fetch(`${API_BASE}/users/managed-by-manager/${managerId}`, { 
      headers: { Authorization: authHeader, Accept: 'application/json' } 
    })
    if (!res.ok) {
      console.log(`❌ [Manager Users] Failed to fetch managed users: ${res.status}`)
      return []
    }
    const users = await res.json().catch(() => [])
    const shopTLIds = Array.isArray(users) ? users.map((u: any) => Number(u.user_id ?? u.userId ?? u.id)).filter(Boolean) : []
    console.log(`✅ [Manager Users] Found ${shopTLIds.length} Shop TLs managed by Manager ${managerId}:`, shopTLIds)
    return shopTLIds
  } catch (err) {
    console.error(`❌ [Manager Users] Error fetching managed Shop TLs:`, err)
    return []
  }
}

/** 
 * FIXED: Get all users in the same shop via the /users endpoint.
 * The backend auto-scopes the /users response by shop when the requesting user has a shopId.
 * This is used by shop_manager to discover all Shop TLs and users in their shop.
 */
async function getShopScopedUsers(authHeader?: string | null): Promise<number[]> {
  if (!authHeader) return []
  try {
    console.log(`🔍 [Shop Scoped Users] Fetching all users via /users (backend auto-scopes by shop)`)
    const res = await fetch(`${API_BASE}/users`, { 
      headers: { Authorization: authHeader, Accept: 'application/json' } 
    })
    if (!res.ok) {
      console.log(`❌ [Shop Scoped Users] Failed to fetch users: ${res.status}`)
      return []
    }
    const body = await res.json().catch(() => null)
    const users = Array.isArray(body) ? body : (body?.users ?? body?.data ?? [])
    const userIds = Array.isArray(users) 
      ? users.map((u: any) => Number(u.user_id ?? u.userId ?? u.id)).filter((id: number) => !isNaN(id) && id > 0) 
      : []
    console.log(`✅ [Shop Scoped Users] Found ${userIds.length} users in shop scope:`, userIds)
    return userIds
  } catch (err) {
    console.error(`❌ [Shop Scoped Users] Error fetching shop-scoped users:`, err)
    return []
  }
}

/** FIXED: Get all users within director's assigned departments from backend */
async function getUsersInDirectorDepartments(directorUserId: number, authHeader?: string | null): Promise<number[]> {
  if (!authHeader) return []
  try {
    console.log(`🔍 [Director Users] Fetching users in departments managed by Director ${directorUserId}`)
    const res = await fetch(`${API_BASE}/directors/${directorUserId}/department-users`, { 
      headers: { Authorization: authHeader, Accept: 'application/json' } 
    })
    if (!res.ok) {
      console.log(`❌ [Director Users] Failed to fetch department users: ${res.status}`)
      return []
    }
    
    const responseBody = await res.json().catch(() => null)
    console.log(`📦 [Director Users] Raw response:`, responseBody)
    
    // CRITICAL FIX: The backend returns a plain array of integers, not an array of objects
    let userIds: number[] = []
    
    if (Array.isArray(responseBody)) {
      // If it's already an array of numbers, use it directly
      userIds = responseBody.map((item: any) => {
        // Handle both plain numbers and objects with user_id/userId/id fields
        if (typeof item === 'number') return item
        return Number(item.user_id ?? item.userId ?? item.id ?? item)
      }).filter(id => !isNaN(id) && id > 0)
    }
    
    console.log(`✅ [Director Users] Found ${userIds.length} users in Director ${directorUserId}'s departments:`, userIds)
    return userIds
  } catch (err) {
    console.error(`❌ [Director Users] Error fetching department users:`, err)
    return []
  }
}

/** NEW: Get detailed user information for users in Director's scope */
async function getDirectorScopeUsersDetailed(directorUserId: number, authHeader?: string | null): Promise<Array<{userId: number, fullName: string, role: string}>> {
  if (!authHeader) return []
  try {
    console.log(`🔍 [Director Users Detailed] Fetching detailed user info for Director ${directorUserId}`)
    const res = await fetch(`${API_BASE}/directors/${directorUserId}/users`, { 
      headers: { Authorization: authHeader, Accept: 'application/json' } 
    })
    if (!res.ok) {
      console.log(`❌ [Director Users Detailed] Failed to fetch users: ${res.status}`)
      return []
    }
    
    const users = await res.json().catch(() => [])
    console.log(`📦 [Director Users Detailed] Raw response count: ${Array.isArray(users) ? users.length : 0}`)
    
    const userDetails = Array.isArray(users) ? users.map((u: any) => ({
      userId: Number(u.userId ?? u.user_id ?? u.id ?? NaN),
      fullName: String(u.fullName ?? u.full_name ?? u.name ?? '').trim(),
      role: String(u.role ?? '').toLowerCase()
    })).filter(u => !isNaN(u.userId) && u.userId > 0) : []
    
    console.log(`✅ [Director Users Detailed] Found ${userDetails.length} users with details`)
    return userDetails
  } catch (err) {
    console.error(`❌ [Director Users Detailed] Error fetching users:`, err)
    return []
  }
}

/** NEW: Get Team Leaders created by Director from backend - returns names, IDs, and their Engineers */
async function getTeamLeadersCreatedByDirector(directorUserId: number, authHeader?: string | null): Promise<{ 
  names: string[], 
  ids: number[],
  engineerNames: string[],
  engineerIds: number[],
  hasTeamLeaders: boolean
}> {
  if (!authHeader) return { names: [], ids: [], engineerNames: [], engineerIds: [], hasTeamLeaders: false }
  try {
    console.log(`🔍 [Director Team Leaders] Fetching Team Leaders created by Director ${directorUserId}`)
    const res = await fetch(`${API_BASE}/directors/${directorUserId}/team-leaders`, { 
      headers: { Authorization: authHeader, Accept: 'application/json' } 
    })
    if (!res.ok) {
      console.log(`❌ [Director Team Leaders] Failed to fetch Team Leaders: ${res.status}`)
      return { names: [], ids: [], engineerNames: [], engineerIds: [], hasTeamLeaders: false }
    }
    
    const teamLeaders = await res.json().catch(() => [])
    console.log(`📦 [Director Team Leaders] Raw response:`, JSON.stringify(teamLeaders, null, 2))
    
    // FIXED: Handle multiple case conventions for fullName field and also extract IDs
    const names: string[] = []
    const ids: number[] = []
    const engineerNames: string[] = []
    const engineerIds: number[] = []
    
    if (Array.isArray(teamLeaders)) {
      teamLeaders.forEach((tl: any) => {
        const name = String(tl.FullName ?? tl.fullName ?? tl.full_name ?? tl.name ?? '').trim()
        const id = Number(tl.UserId ?? tl.userId ?? tl.user_id ?? tl.id ?? NaN)
        console.log(`   Team Leader object:`, { userId: id, name })
        if (name) names.push(name)
        if (isFinite(id) && id > 0) ids.push(id)
        
        // CRITICAL FIX: Extract Engineers under each Team Leader
        const engineers = tl.Engineers ?? tl.engineers ?? []
        if (Array.isArray(engineers)) {
          engineers.forEach((eng: any) => {
            const engName = String(eng.FullName ?? eng.fullName ?? eng.full_name ?? eng.name ?? '').trim()
            const engId = Number(eng.UserId ?? eng.userId ?? eng.user_id ?? eng.id ?? NaN)
            if (engName) {
              engineerNames.push(engName)
              console.log(`      └─ Engineer: ${engName} (ID: ${engId})`)
            }
            if (isFinite(engId) && engId > 0) engineerIds.push(engId)
          })
        }
      })
    }
    
    const hasTeamLeaders = ids.length > 0
    
    console.log(`✅ [Director Team Leaders] Found ${names.length} Team Leaders created by Director ${directorUserId}:`, names)
    console.log(`✅ [Director Team Leaders] Team Leader IDs:`, ids)
    console.log(`✅ [Director Team Leaders] Engineers under Team Leaders (${engineerNames.length}):`, engineerNames)
    console.log(`✅ [Director Team Leaders] Engineer IDs:`, engineerIds)
    console.log(`✅ [Director Team Leaders] Has Team Leaders: ${hasTeamLeaders}`)
    return { names, ids, engineerNames, engineerIds, hasTeamLeaders }
  } catch (err) {
    console.error(`❌ [Director Team Leaders] Error fetching Team Leaders:`, err)
    return { names: [], ids: [], engineerNames: [], engineerIds: [], hasTeamLeaders: false }
  }
}

/** Fetch task IDs where the engineer has submitted hold requests */
async function getEngineerHoldRequestTaskIds(engineerId: number, authHeader?: string | null): Promise<number[]> {
  if (!authHeader || !isFinite(engineerId)) return []
  try {
    const res = await fetch(`${API_BASE}/task-holds/engineer/${engineerId}/task-ids`, {
      headers: { Authorization: authHeader, Accept: 'application/json' }
    })
    if (!res.ok) return []
    const body = await res.json().catch(() => null)
    let taskIds: number[] = []
    if (body?.taskIds && Array.isArray(body.taskIds)) {
      taskIds = body.taskIds.map((id: any) => Number(id)).filter((id: number) => !isNaN(id) && id > 0)
    } else if (body?.payload && Array.isArray(body.payload)) {
      taskIds = body.payload.map((id: any) => Number(id)).filter((id: number) => !isNaN(id) && id > 0)
    } else if (Array.isArray(body)) {
      taskIds = body.map((id: any) => Number(id)).filter((id: number) => !isNaN(id) && id > 0)
    }
    return taskIds
  } catch {
    return []
  }
}

/**
 * ENGINEER FALLBACK for completed tasks: When the backend returns 0 completed tasks for an engineer,
 * try alternative approaches to fetch the engineer's completed tasks.
 */
async function fetchEngineerCompletedTasksFallback(user: any, forwardHeaders: Headers, authHeader?: string | null): Promise<any[]> {
  const uid = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
  if (!isFinite(uid)) return []

  console.log(`🔄 [Engineer Completed Fallback] Trying alternative approaches for engineer ${uid}...`)

  // Approach 1: Try GET /tasks/user/{userId} and filter for completed
  try {
    const res = await fetch(`${API_BASE}/tasks/user/${uid}`, { headers: forwardHeaders })
    if (res.ok) {
      const text = await res.text().catch(() => '')
      let body: any = null
      try { body = JSON.parse(text) } catch { body = text }
      const tasks = extractTaskArray(body)
      const completedTasks = tasks.filter(t => Number(t.status ?? t.Status ?? -1) === 2)
      if (completedTasks.length > 0) {
        console.log(`✅ [Engineer Completed Fallback] Found ${completedTasks.length} completed tasks from /tasks/user/${uid}`)
        return completedTasks
      }
    }
  } catch {}

  // Approach 2: Try fetching with status=2 and assignedEngineerId
  try {
    const res = await fetch(`${API_BASE}/tasks?status=2&assignedEngineerId=${uid}&pageSize=1000&pageNumber=1`, { headers: forwardHeaders })
    if (res.ok) {
      const text = await res.text().catch(() => '')
      let body: any = null
      try { body = JSON.parse(text) } catch { body = text }
      const tasks = extractTaskArray(body)
      if (tasks.length > 0) {
        console.log(`✅ [Engineer Completed Fallback] Found ${tasks.length} completed tasks with assignedEngineerId=${uid}`)
        return tasks
      }
    }
  } catch {}

  // Approach 3: Get hold request task IDs and fetch individually, filter for completed
  try {
    const holdTaskIds = await getEngineerHoldRequestTaskIds(uid, authHeader)
    if (holdTaskIds.length > 0) {
      const fetchPromises = holdTaskIds.map(async (taskId) => {
        try {
          const res = await fetch(`${API_BASE}/tasks/${taskId}`, { headers: forwardHeaders })
          if (res.ok) {
            const text = await res.text().catch(() => '')
            let task: any = null
            try { task = JSON.parse(text) } catch { return null }
            const actualTask = task?.task ?? task?.data ?? task
            if (actualTask && Number(actualTask.status ?? actualTask.Status ?? -1) === 2) {
              return actualTask
            }
          }
          return null
        } catch { return null }
      })
      const results = await Promise.all(fetchPromises)
      const completedTasks = results.filter(Boolean)
      if (completedTasks.length > 0) {
        console.log(`✅ [Engineer Completed Fallback] Found ${completedTasks.length} completed tasks from hold request IDs`)
        return completedTasks
      }
    }
  } catch {}

  return []
}

/** RBAC scoping - ENHANCED with Director department scoping, Manager role support, and TL scope restriction */
async function applyRoleScoping(tasks: any[], user: any, authHeader?: string | null) {
  const role = normalizeRole(user?.role ?? user?.role_name ?? user?.roleName ?? user?.roleDisplayName ?? '')
  
  console.log(`🔐 [RBAC Filtering] Starting for user: { userId: ${user?.user_id ?? user?.id}, role: '${role}', totalTasks: ${tasks.length} }`)
  
  // Team Leaders: check if a Director has set a restricted scope for this TL
  if (role === 'team_leader' || role === 'teamleader' || role === '0') {
    const tlUserId = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    
    // Dynamically import the TL scope store (server-side only)
    let tlAllowedUserIds: number[] = []
    try {
      const { getTLAllowedUserIds } = await import('@/lib/tl-scope-store')
      tlAllowedUserIds = getTLAllowedUserIds(tlUserId)
    } catch {
      // If import fails, no restriction
    }
    
    // If no scope restriction, TL sees everything (original behavior)
    if (tlAllowedUserIds.length === 0) {
      console.log(`✅ [RBAC Filtering] Team Leader ${tlUserId} - no scope restriction, showing all ${tasks.length} tasks`)
      return tasks
    }
    
    console.log(`🔐 [RBAC Filtering] Team Leader ${tlUserId} - scope restricted to ${tlAllowedUserIds.length} user IDs:`, tlAllowedUserIds)
    
    // Scope restriction exists: only show tasks created by or assigned to users in scope
    const allowedUserIdSet = new Set(tlAllowedUserIds)
    
    // Fetch user details for name-based matching on assignedEngineer
    let allowedUserNames: Set<string> = new Set()
    try {
      if (authHeader) {
        const usersRes = await fetch(`${API_BASE}/users`, { 
          headers: { Authorization: authHeader, Accept: 'application/json' } 
        })
        if (usersRes.ok) {
          const usersBody = await usersRes.json().catch(() => null)
          const usersList = Array.isArray(usersBody) ? usersBody : (usersBody?.users ?? usersBody?.data ?? [])
          if (Array.isArray(usersList)) {
            usersList.forEach((u: any) => {
              const uid = Number(u.userId ?? u.user_id ?? u.id ?? NaN)
              if (allowedUserIdSet.has(uid)) {
                const name = String(u.fullName ?? u.full_name ?? u.name ?? '').toLowerCase().trim()
                if (name) allowedUserNames.add(name)
              }
            })
          }
        }
      }
    } catch {
      // Silently handle
    }
    
    console.log(`📋 [RBAC Filtering] Team Leader ${tlUserId} scope - allowed user names:`, [...allowedUserNames])
    
    const filtered = tasks.filter(t => {
      const taskCreatedBy = Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN)
      const taskAssignedTo = getTaskAssignedEngineer(t).toLowerCase()
      
      // CRITERION 1: Task created by someone in TL's scope
      if (allowedUserIdSet.has(taskCreatedBy)) return true
      
      // CRITERION 2: Task assigned to someone in TL's scope (by name matching)
      if (taskAssignedTo && taskAssignedTo !== 'unassigned') {
        for (const scopeName of allowedUserNames) {
          if (!scopeName) continue
          if (taskAssignedTo === scopeName || 
              taskAssignedTo.includes(scopeName) ||
              scopeName.includes(taskAssignedTo)) {
            return true
          }
        }
      }
      
      return false
    })
    
    console.log(`✅ [RBAC Filtering] Team Leader ${tlUserId} scoped tasks: ${filtered.length}/${tasks.length}`)
    return filtered
  }

  // COMPREHENSIVE FIX: Directors now see tasks based on MULTIPLE criteria:
  // 1. Tasks created by users in their scope (createdBy)
  // 2. Tasks assigned to users in their scope (assignedEngineer name matching)
  // 3. Tasks assigned to Team Leaders they created (assignedEngineer name matching)
  // 4. Tasks assigned to Engineers under their Team Leaders (assignedEngineer name matching)
  // 5. CRITICAL: If Director has created Team Leaders, they see ALL tasks (since Team Leaders see all)
  if (role === 'director' || role === '1') {
    const directorUserId = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    if (!isFinite(directorUserId)) {
      console.log(`❌ [RBAC Filtering] Director - invalid userId`)
      return []
    }
    
    console.log(`🔐 [RBAC Filtering] Director (userId: ${directorUserId}) - fetching comprehensive scope`)
    
    // Get all Team Leaders created by this Director (by name and ID) AND their Engineers
    const teamLeaderData = await getTeamLeadersCreatedByDirector(directorUserId, authHeader)
    
    // CRITICAL FIX: If Director has created Team Leaders, they should see ALL tasks
    // because Team Leaders have full visibility of all tasks in the system
    if (teamLeaderData.hasTeamLeaders) {
      console.log(`🎯 [RBAC Filtering] Director ${directorUserId} has ${teamLeaderData.ids.length} Team Leaders - showing ALL tasks`)
      console.log(`   Reason: Team Leaders see all tasks, so Director inherits their visibility`)
      console.log(`✅ [RBAC Filtering] Director showing all ${tasks.length} tasks (via Team Leader inheritance)`)
      return tasks
    }
    
    // If no Team Leaders, fall back to department-based filtering
    console.log(`📋 [RBAC Filtering] Director ${directorUserId} has no Team Leaders - using department-based filtering`)
    
    // Get all user IDs within director's scope (from backend)
    const departmentUserIds = await getUsersInDirectorDepartments(directorUserId, authHeader)
    
    // Get detailed user information (names + roles) for assignment matching
    const scopeUsersDetailed = await getDirectorScopeUsersDetailed(directorUserId, authHeader)
    const scopeUserNames = scopeUsersDetailed.map(u => u.fullName.toLowerCase())
    
    // Combine all names that should match assignedEngineer
    const allAssignableNames = new Set<string>([
      ...scopeUserNames
    ])
    
    // Combine all user IDs that can create tasks visible to Director
    const allScopeUserIds = new Set<number>([
      ...departmentUserIds
    ])
    
    if (allScopeUserIds.size === 0 && allAssignableNames.size === 0) {
      console.log(`⚠️ [RBAC Filtering] Director ${directorUserId} has no assigned departments/users`)
      return []
    }
    
    console.log(`📋 [RBAC Filtering] Director ${directorUserId} filtering criteria:`)
    console.log(`   - Can see tasks CREATED BY ${departmentUserIds.length} users in departments`)
    console.log(`   - Can see tasks ASSIGNED TO ${allAssignableNames.size} unique names`)
    
    // ENHANCED: Log all unique createdBy and assignedEngineer values for debugging
    const uniqueCreatedBy = [...new Set(tasks.map(t => Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? NaN)).filter(isFinite))]
    const uniqueAssigned = [...new Set(tasks.map(t => getTaskAssignedEngineer(t)).filter(Boolean))]
    
    console.log(`📋 [RBAC Filtering] Task field analysis:`)
    console.log(`   - Unique createdBy values (${uniqueCreatedBy.length}): [${uniqueCreatedBy.slice(0, 15).join(', ')}${uniqueCreatedBy.length > 15 ? '...' : ''}]`)
    console.log(`   - Unique assignedEngineer values (${uniqueAssigned.length}): [${uniqueAssigned.slice(0, 10).join(', ')}${uniqueAssigned.length > 10 ? '...' : ''}]`)
    
    const filtered = tasks.filter(t => {
      const taskCreatedBy = Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN)
      const taskAssignedTo = getTaskAssignedEngineer(t).toLowerCase()
      
      // CRITERION 1: Task created by someone in director's scope
      const createdByInScope = allScopeUserIds.has(taskCreatedBy)
      
      // CRITERION 2: Task assigned to someone in director's scope (by name matching)
      let assignedToInScope = false
      if (taskAssignedTo && taskAssignedTo !== 'unassigned') {
        // Check if any name in our scope matches the assigned engineer
        for (const scopeName of allAssignableNames) {
          if (!scopeName) continue
          // Check for exact match or partial match (handles comma-separated names)
          if (taskAssignedTo === scopeName || 
              taskAssignedTo.includes(scopeName) ||
              scopeName.includes(taskAssignedTo)) {
            assignedToInScope = true
            break
          }
        }
      }
      
      const included = createdByInScope || assignedToInScope
      
      return included
    })
    
    console.log(`✅ [RBAC Filtering] Director filtered tasks: ${filtered.length}/${tasks.length}`)
    
    // Enhanced diagnostics if few tasks matched
    if (filtered.length < tasks.length * 0.1 && tasks.length > 10) {
      console.log(`⚠️ [RBAC Filtering] DIAGNOSTIC: Only ${filtered.length} tasks matched for Director ${directorUserId}`)
      console.log(`   Analysis:`)
      const createdByMatches = tasks.filter(t => allScopeUserIds.has(Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? NaN))).length
      console.log(`   - createdBy matches: ${createdByMatches}`)
      
      const assignedMatches = tasks.filter(t => {
        const assigned = getTaskAssignedEngineer(t).toLowerCase()
        if (!assigned || assigned === 'unassigned') return false
        for (const scopeName of allAssignableNames) {
          if (assigned.includes(scopeName) || scopeName.includes(assigned)) return true
        }
        return false
      }).length
      console.log(`   - assignedEngineer matches: ${assignedMatches}`)
    }
    
    return filtered
  }

  // engineer: tasks assigned to them OR tasks where they have submitted hold requests OR tasks they created
  if (role === 'engineer' || role === '2') {
    const name = String(user?.fullName ?? user?.full_name ?? user?.name ?? '').toLowerCase().trim()
    const uid = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    console.log(`🔐 [RBAC Filtering] Engineer - filtering by assignment + hold requests + createdBy (userId: ${uid}, name: '${name}')`)
    if (!name && !isFinite(uid)) return []

    // Fetch task IDs where this engineer has submitted hold requests
    const holdRequestTaskIds = await getEngineerHoldRequestTaskIds(uid, authHeader)
    const holdTaskIdSet = new Set<number>(holdRequestTaskIds)

    const filtered = tasks.filter(t => {
      const taskId = Number(t.taskId ?? t.TaskId ?? t.task_id ?? t.id ?? NaN)

      // CRITERION 1: Task is assigned to the engineer by name
      const assignedStr = getTaskAssignedEngineer(t).toLowerCase()
      if (name && assignedStr) {
        const parts = assignedStr.split(',').map((s: string) => s.trim())
        if (parts.includes(name) || assignedStr.includes(name)) return true
      }

      // CRITERION 2: Check assigned engineer ID variants
      const assignedId = Number(t.assigned_engineer_id ?? t.assignedEngineerId ?? t.AssignedEngineerId ?? t.assigned_id ?? t.assigned_to_id ?? t.assignedToId ?? t.engineer_id ?? t.engineerId ?? NaN)
      if (isFinite(uid) && isFinite(assignedId) && assignedId === uid) return true

      // CRITERION 3: Task was created by this engineer
      const createdBy = Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN)
      if (isFinite(uid) && isFinite(createdBy) && createdBy === uid) return true

      // CRITERION 4: Engineer has submitted a hold request for this task
      if (isFinite(taskId) && holdTaskIdSet.has(taskId)) return true

      return false
    })
    console.log(`✅ [RBAC Filtering] Engineer filtered tasks: ${filtered.length} (hold requests: ${holdTaskIdSet.size} task IDs checked)`)
    return filtered
  }

  // customer or customer_personnel: only tasks they created (created_by or creator_name)
  if (role === 'customer' || role === 'customer_personnel' || role === 'customerpersonnel' || role === '3' || role === '4') {
    const uid = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    const name = String(user?.fullName ?? user?.full_name ?? user?.name ?? '').toLowerCase()
    console.log(`🔐 [RBAC Filtering] Customer/Customer Personnel - filtering by creator (userId: ${uid}, name: '${name}')`)
    const filtered = tasks.filter(t => {
      const createdBy = Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN)
      const creatorName = String(t.creatorName ?? t.CreatorName ?? t.creator_name ?? t.created_by_name ?? t.creator ?? '').toLowerCase()
      if (isFinite(uid) && isFinite(createdBy) && createdBy === uid) return true
      if (name && creatorName && creatorName.includes(name)) return true
      return false
    })
    console.log(`✅ [RBAC Filtering] Customer filtered tasks: ${filtered.length}`)
    return filtered
  }

  // shop team leader: tasks created by users they created (not just by shop)
  if (role === 'shop_tl' || role === 'shoptl' || role === '5') {
    const shopTLUserId = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    if (!isFinite(shopTLUserId)) return []
    
    console.log(`🔐 [RBAC Filtering] Shop TL (userId: ${shopTLUserId}) - fetching created users`)
    
    // Get list of user IDs that were created by this shop TL
    const createdUserIds = await getUsersCreatedByShopTL(shopTLUserId, authHeader)
    
    const filtered = tasks.filter(t => {
      const taskCreatedBy = Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN)
      // Show tasks created by users that this shop TL created
      const isCreatedByShopTLUser = createdUserIds.includes(taskCreatedBy)
      // Also show tasks created by the shop TL themselves
      const isCreatedByShopTL = taskCreatedBy === shopTLUserId
      
      const included = isCreatedByShopTLUser || isCreatedByShopTL
      if (included) {
        console.log(`  ✓ Task ${t.taskId ?? t.TaskId ?? t.task_id} included (createdBy: ${taskCreatedBy})`)
      }
      return included
    })
    
    console.log(`✅ [RBAC Filtering] Shop TL filtered tasks: ${filtered.length} (from ${createdUserIds.length} created users)`)
    return filtered
  }

  // Shop Manager role - COMPREHENSIVE FIX: Shop Manager sees ALL tasks from ALL users in the same shop.
  // A shop_manager is the manager of their specific shop, so they should see every task that belongs
  // to that shop — regardless of whether the task was created by a Shop TL, customer personnel,
  // or any other user in the same shop.
  //
  // Strategy: Filter tasks by matching the task's ShopId/ShopName against the shop_manager's shopId/shopName.
  // This is more reliable than trying to discover all user IDs via the /users endpoint, which only
  // returns a limited subset of users due to backend auto-scoping.
  // As a fallback, we also match by createdBy user IDs from the /users endpoint.
  if (role === 'shop_manager' || role === 'shopmanager' || role === 'minimanager' || role === '8') {
    const shopManagerId = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    if (!isFinite(shopManagerId)) {
      console.log(`❌ [RBAC Filtering] Shop Manager - invalid userId`)
      return []
    }
    
    const shopManagerShopId = Number(user?.shop_id ?? user?.shopId ?? NaN)
    const shopManagerShopName = String(user?.shop_name ?? user?.shopName ?? '').toLowerCase().trim()
    
    console.log(`🔐 [RBAC Filtering] Shop Manager (userId: ${shopManagerId}, shopId: ${shopManagerShopId}, shopName: '${shopManagerShopName}') - filtering by shop scope`)
    
    // Also fetch user IDs from /users endpoint as a secondary matching criterion
    const shopScopedUserIds = await getShopScopedUsers(authHeader)
    
    // Build list of all user IDs whose tasks this shop manager can see
    const allManagedUserIds: number[] = [shopManagerId] // Include self
    allManagedUserIds.push(...shopScopedUserIds)
    
    // For each shop-scoped user, also get users they created (customer personnel)
    for (const userId of shopScopedUserIds) {
      const createdByUser = await getUsersCreatedByShopTL(userId, authHeader)
      allManagedUserIds.push(...createdByUser)
    }
    
    // Deduplicate
    const uniqueManagedUserIds = new Set(allManagedUserIds)
    
    console.log(`📋 [RBAC Filtering] Shop Manager ${shopManagerId} matching criteria:`)
    console.log(`   - Primary: tasks with shopId=${shopManagerShopId} or shopName='${shopManagerShopName}'`)
    console.log(`   - Secondary: tasks createdBy ${uniqueManagedUserIds.size} known user IDs: [${[...uniqueManagedUserIds].join(', ')}]`)
    
    const filtered = tasks.filter(t => {
      const taskCreatedBy = Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN)
      const taskShopId = Number(t.shopId ?? t.ShopId ?? t.shop_id ?? NaN)
      const taskShopName = String(t.shopName ?? t.ShopName ?? t.shop_name ?? '').toLowerCase().trim()
      
      // CRITERION 1 (Primary): Task belongs to the same shop by ShopId
      if (isFinite(shopManagerShopId) && isFinite(taskShopId) && taskShopId === shopManagerShopId) {
        return true
      }
      
      // CRITERION 2 (Primary): Task belongs to the same shop by ShopName
      if (shopManagerShopName && taskShopName && taskShopName === shopManagerShopName) {
        return true
      }
      
      // CRITERION 3 (Secondary/Fallback): Task created by a known user in the shop scope
      if (uniqueManagedUserIds.has(taskCreatedBy)) {
        return true
      }
      
      return false
    })
    
    console.log(`✅ [RBAC Filtering] Shop Manager filtered tasks: ${filtered.length}/${tasks.length}`)
    
    // Debug: Log matching breakdown
    if (filtered.length > 0) {
      const byShopId = tasks.filter(t => isFinite(shopManagerShopId) && Number(t.shopId ?? t.ShopId ?? t.shop_id ?? NaN) === shopManagerShopId).length
      const byShopName = tasks.filter(t => shopManagerShopName && String(t.shopName ?? t.ShopName ?? t.shop_name ?? '').toLowerCase().trim() === shopManagerShopName).length
      const byUserId = tasks.filter(t => uniqueManagedUserIds.has(Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN))).length
      console.log(`   Breakdown: ${byShopId} by shopId, ${byShopName} by shopName, ${byUserId} by userId`)
    }
    
    return filtered
  }

  // Manager role - see tasks from Shop TLs they manage and their customer personnel
  if (role === 'manager' || role === '6') {
    const managerId = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    if (!isFinite(managerId)) {
      console.log(`❌ [RBAC Filtering] Manager - invalid userId`)
      return []
    }
    
    console.log(`🔐 [RBAC Filtering] Manager (userId: ${managerId}) - fetching managed Shop TLs and their users`)
    
    // Get all Shop Team Leaders managed by this Manager
    const managedShopTLIds = await getManagedShopTLs(managerId, authHeader)
    
    if (managedShopTLIds.length === 0) {
      console.log(`⚠️ [RBAC Filtering] Manager ${managerId} has no managed Shop TLs`)
      return []
    }
    
    // For each Shop TL, get the users they created (customer personnel)
    const allManagedUserIds = [...managedShopTLIds] // Include Shop TLs themselves
    
    for (const shopTLId of managedShopTLIds) {
      const createdByShopTL = await getUsersCreatedByShopTL(shopTLId, authHeader)
      allManagedUserIds.push(...createdByShopTL)
    }
    
    console.log(`📋 [RBAC Filtering] Manager ${managerId} can see tasks from ${allManagedUserIds.length} users:`, allManagedUserIds)
    
    const filtered = tasks.filter(t => {
      const taskCreatedBy = Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN)
      const included = allManagedUserIds.includes(taskCreatedBy)
      
      if (included) {
        console.log(`  ✓ Task ${t.taskId ?? t.TaskId ?? t.task_id} included (createdBy: ${taskCreatedBy}, description: '${t.description?.substring(0, 50)}')`)
      }
      
      return included
    })
    
    console.log(`✅ [RBAC Filtering] Manager filtered tasks: ${filtered.length}/${tasks.length}`)
    return filtered
  }

  // default conservative rule: only tasks created by user
  console.log(`🔐 [RBAC Filtering] Using default filtering (tasks created by user)`)
  const uid = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
  if (isFinite(uid)) {
    const filtered = tasks.filter(t => Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN) === uid)
    console.log(`✅ [RBAC Filtering] Default filtered tasks: ${filtered.length}`)
    return filtered
  }

  // if nothing we can match, return empty list to avoid accidental leakage
  console.log(`❌ [RBAC Filtering] No matching criteria - returning empty list`)
  return []
}

export async function GET(request: Request) {
  const startTime = Date.now()
  console.log('\n================================================================================')
  console.log('🚀 [API Route /api/tasks/completed] GET Request Started')
  console.log('================================================================================')
  
  try {
    // prefer middleware forwarded user (set by middleware earlier)
    const forwardedUserJson = getUserFromForwarded(new Headers(request.headers))
    let user = forwardedUserJson ?? null
    
    console.log('👤 [User Resolution] Forwarded user:', forwardedUserJson ? 'Found' : 'Not found')

    // REFRESH FIX: Resolve auth from Authorization header, x-auth-token, or
    // access_token cookie so this endpoint works after a full page reload.
    const auth = resolveAuthorizationHeader(request)
    if (!user && auth) {
      console.log('🔑 [User Resolution] Fetching user from backend /auth/me')
      user = await fetchUserFromBackend(auth)
    }
    
    if (user) {
      console.log('✅ [User Resolution] Authenticated user:', {
        userId: user.user_id ?? user.id ?? user.userId,
        userName: user.fullName ?? user.full_name ?? user.name,
        role: user.role ?? user.role_name ?? user.roleName,
        departmentId: user.department_id ?? user.departmentId,
        shopId: user.shop_id ?? user.shopId,
        shopName: user.shop_name ?? user.shopName
      })
    } else {
      console.log('❌ [User Resolution] No authenticated user found')
    }

    // Build backend target URL and properly forward ALL query parameters
    // CRITICAL FIX: Use the dedicated /tasks/completed endpoint which queries the completed_tasks table directly.
    // Previously, this route fetched from /tasks (the active Tasks table) and filtered by status === 2,
    // which caused stale "Completed" records in the Tasks table to appear even after reopening.
    // The /tasks/completed endpoint queries the completed_tasks table, which is the source of truth.
    //
    // PAGINATION FIX: Fetch ALL pages from the backend (up to 10,000 tasks) instead of just the first page.
    // The backend may cap results at 1,000 per page, so we iterate through pages until we get all tasks.
    const url = new URL(request.url)

    console.log('🌐 [Backend Request] Original query params:', Object.fromEntries(url.searchParams.entries()))

    // forward headers for backend call
    const forwardHeaders = buildForwardHeaders(request)

    // ─── Multi-page fetch: retrieve all completed tasks up to MAX_TASKS ───
    const MAX_TASKS = 10000
    const PAGE_SIZE = 1000
    let rawList: any[] = []
    const seenTaskIds = new Set<string | number>()
    let body: any = null
    let pageNumber = 1
    let keepFetching = true

    while (keepFetching && rawList.length < MAX_TASKS) {
      const pageParams = new URLSearchParams(url.searchParams)
      pageParams.set('pageSize', String(PAGE_SIZE))
      pageParams.set('pageNumber', String(pageNumber))
      const qs = pageParams.toString() ? `?${pageParams.toString()}` : ''
      const backendUrl = `${API_BASE}/tasks/completed${qs}`

      console.log(`🌐 [Backend Request] Fetching page ${pageNumber}: ${backendUrl}`)

      const backendRes = await fetch(backendUrl, { headers: forwardHeaders })
      const text = await backendRes.text().catch(() => '')
      let pageBody: any = null
      try { pageBody = JSON.parse(text) } catch { pageBody = text }

      console.log(`📥 [Backend Response] Page ${pageNumber} status: ${backendRes.status}, body type: ${typeof pageBody}`)

      // On the first page, preserve the body shape for later response envelope matching
      if (pageNumber === 1) {
        body = pageBody
      }

      const pageTasks = extractTaskArray(pageBody)
      console.log(`📋 [Page ${pageNumber}] Extracted ${pageTasks.length} tasks`)

      if (pageTasks.length === 0) {
        // No more tasks to fetch
        keepFetching = false
      } else {
        // Deduplicate by taskId as we accumulate across pages
        for (const task of pageTasks) {
          const taskId = task.taskId ?? task.TaskId ?? task.task_id ?? task.id
          if (taskId && !seenTaskIds.has(taskId)) {
            seenTaskIds.add(taskId)
            rawList.push(task)
          } else if (!taskId) {
            rawList.push(task) // Include tasks without IDs as safety
          }
        }
        
        // If we got fewer tasks than the page size, we've reached the last page
        if (pageTasks.length < PAGE_SIZE) {
          keepFetching = false
        } else {
          pageNumber++
        }
      }

      // Safety: don't exceed max pages (10 pages × 1000 = 10,000 tasks)
      if (pageNumber > Math.ceil(MAX_TASKS / PAGE_SIZE)) {
        console.log(`⚠️ [Pagination] Reached max page limit (${pageNumber - 1} pages, ${rawList.length} tasks). Stopping.`)
        keepFetching = false
      }
    }

    console.log(`✅ [Pagination] Fetched ${rawList.length} total completed tasks across ${pageNumber} page(s)`)

    // CRITICAL FIX: Deduplicate by originalTaskId to prevent multiple completed_task records
    // for the same original task from appearing. When a task is reopened and completed again,
    // a new completed_task record is created with the same originalTaskId. Keep only the most
    // recent entry (highest completedTaskId or latest completedAt/actualCompletionDate).
    {
      const origIdMap = new Map<number | string, any>()
      const deduped: any[] = []
      for (const task of rawList) {
        const origId = task.originalTaskId ?? task.original_task_id ?? task.OriginalTaskId ?? null
        if (origId == null) {
          // No originalTaskId — include as-is (safety fallback)
          deduped.push(task)
          continue
        }
        const existing = origIdMap.get(origId)
        if (!existing) {
          origIdMap.set(origId, task)
        } else {
          // Keep the one with the later completedAt/actualCompletionDate, or higher completedTaskId
          const existingDate = new Date(existing.completedAt ?? existing.completed_at ?? existing.CompletedAt ?? existing.actualCompletionDate ?? existing.actual_completion_date ?? 0).getTime()
          const newDate = new Date(task.completedAt ?? task.completed_at ?? task.CompletedAt ?? task.actualCompletionDate ?? task.actual_completion_date ?? 0).getTime()
          if (newDate > existingDate) {
            origIdMap.set(origId, task)
          } else if (newDate === existingDate) {
            const existingCtId = Number(existing.completedTaskId ?? existing.completed_task_id ?? existing.CompletedTaskId ?? 0)
            const newCtId = Number(task.completedTaskId ?? task.completed_task_id ?? task.CompletedTaskId ?? 0)
            if (newCtId > existingCtId) {
              origIdMap.set(origId, task)
            }
          }
        }
      }
      // Rebuild rawList from the deduplicated map
      rawList = [...origIdMap.values(), ...deduped.filter(t => {
        const origId = t.originalTaskId ?? t.original_task_id ?? t.OriginalTaskId ?? null
        return origId == null
      })]
      console.log(`🔄 [Deduplication] After deduplicating by originalTaskId: ${rawList.length} tasks`)
    }

    console.log('📋 [Task Extraction] Raw tasks count:', rawList.length)
    if (rawList.length > 0) {
      console.log('📋 [Task Extraction] Sample tasks (first 3):')
      rawList.slice(0, 3).forEach((t, i) => {
        console.log(`  Task ${i + 1}:`, {
          taskId: t.taskId ?? t.TaskId ?? t.task_id ?? t.id,
          description: t.description?.substring(0, 50),
          createdBy: t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id,
          creatorName: t.creatorName ?? t.CreatorName ?? t.creator_name ?? t.created_by_name,
          assignedEngineer: getTaskAssignedEngineer(t),
          status: t.status ?? t.Status
        })
      })
    }

    // CRITICAL FIX: When backend returns 0 tasks, check if this is an engineer
    // and use the fallback mechanism to fetch their completed tasks individually
    if (!Array.isArray(rawList) || rawList.length === 0) {
      console.log('⚠️ [Task Extraction] No tasks found or empty array from backend')
      
      if (user) {
        const userRole = normalizeRole(user?.role ?? user?.role_name ?? user?.roleName ?? user?.roleDisplayName ?? '')
        if (userRole === 'engineer' || userRole === '2') {
          console.log('🔄 [Engineer Completed Fallback] Backend returned 0 tasks for engineer, activating fallback...')
          const fallbackTasks = await fetchEngineerCompletedTasksFallback(user, forwardHeaders, auth)
          if (fallbackTasks.length > 0) {
            console.log(`✅ [Engineer Completed Fallback] Retrieved ${fallbackTasks.length} completed tasks via fallback`)
            console.log('⏱️ [API Route] Completed in', Date.now() - startTime, 'ms')
            console.log('================================================================================\n')
            return NextResponse.json(fallbackTasks, { status: 200 })
          }
        }
      }
      
      console.log('⚠️ [Task Extraction] Returning backend response as-is')
      console.log('⏱️ [API Route] Completed in', Date.now() - startTime, 'ms')
      console.log('================================================================================\n')
      return new NextResponse(JSON.stringify(body), { status: 200, headers: new Headers({ 'content-type': 'application/json' }) })
    }

    // server-side RBAC scoping applied to all tasks
    console.log('🔐 [RBAC Filtering] Starting filtering process...')
    let rbacFiltered = user ? await applyRoleScoping(rawList, user, auth) : []

    // CRITICAL FIX: If RBAC filtering returned 0 tasks for an engineer, try the fallback
    if (rbacFiltered.length === 0 && rawList.length > 0 && user) {
      const userRole = normalizeRole(user?.role ?? user?.role_name ?? user?.roleName ?? user?.roleDisplayName ?? '')
      if (userRole === 'engineer' || userRole === '2') {
        console.log(`🔄 [Engineer Completed Fallback] RBAC filtered to 0 tasks (from ${rawList.length} raw tasks), trying fallback...`)
        const fallbackTasks = await fetchEngineerCompletedTasksFallback(user, forwardHeaders, auth)
        if (fallbackTasks.length > 0) {
          console.log(`✅ [Engineer Completed Fallback] Retrieved ${fallbackTasks.length} completed tasks via fallback`)
          rbacFiltered = fallbackTasks
        }
      }
    }

    console.log('📊 [RBAC Results] After RBAC filtering:', {
      originalTaskCount: rawList.length,
      rbacFilteredCount: rbacFiltered.length,
      excludedByRBAC: rawList.length - rbacFiltered.length
    })

    // UPDATED: Since we now fetch from /tasks/completed (the dedicated completed_tasks table endpoint),
    // the backend already filters for completed status. We still apply a safety filter here as defense-in-depth.
    console.log('🎯 [Completed Filter] Applying safety filter for completed tasks (status === 2)...')
    const completedTasks = rbacFiltered.filter(t => {
      const status = Number(t.status ?? t.Status ?? -1)
      // Accept status 2 (Completed) or tasks that don't have a status field (already from completed_tasks table)
      return status === 2 || status === -1
    })

    console.log('📊 [Final Results] Summary:', {
      originalTaskCount: rawList.length,
      afterRBACCount: rbacFiltered.length,
      completedTaskCount: completedTasks.length,
      excludedByStatus: rbacFiltered.length - completedTasks.length,
      note: 'Using /tasks/completed endpoint (completed_tasks table) as source of truth'
    })
    
    console.log('⏱️ [API Route] Completed in', Date.now() - startTime, 'ms')
    console.log('================================================================================\n')

    // Return completed tasks only
    if (body && typeof body === 'object' && !Array.isArray(body) && (body.tasks || body.data || body.results)) {
      const out = { ...body }
      if (Array.isArray(out.tasks)) out.tasks = completedTasks
      else if (Array.isArray(out.data)) out.data = completedTasks
      else if (Array.isArray(out.results)) out.results = completedTasks
      return new NextResponse(JSON.stringify(out), { status: 200, headers: new Headers({ 'content-type': 'application/json' }) })
    }

    return NextResponse.json(completedTasks, { status: 200 })
  } catch (err: any) {
    console.error('❌ [RBAC completed tasks proxy error]', err)
    console.log('⏱️ [API Route] Failed in', Date.now() - startTime, 'ms')
    console.log('================================================================================\n')
    
    return new NextResponse(
      JSON.stringify({ 
        error: 'Unable to connect to the server',
        message: 'The backend service is currently unavailable. Please ensure the backend server is running or try again later.',
        userFriendly: true
      }), 
      { 
        status: 503,
        headers: new Headers({ 'content-type': 'application/json' })
      }
    )
  }
}