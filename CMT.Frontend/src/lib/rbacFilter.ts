/**
 * Shared RBAC (Role-Based Access Control) filtering utility.
 * 
 * Extracts the core RBAC scoping logic from /api/tasks/route.ts so that
 * dashboard metrics and analytics endpoints can reuse the same filtering,
 * ensuring consistent task visibility across the entire application.
 */

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normalize role tokens */
function normalizeRole(raw: any): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'number') return String(raw)
  return String(raw).toLowerCase().trim().replace(/[\s\-\_]+/g, '_')
}

/** Extract assignedEngineer field from task with multiple case conventions */
function getTaskAssignedEngineer(task: any): string {
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

/** Try to extract tasks array from many common backend response shapes */
function extractTaskArray(body: any): any[] {
  if (!body) return []
  if (Array.isArray(body)) return body
  if (Array.isArray(body.tasks)) return body.tasks
  if (Array.isArray(body.data)) return body.data
  if (Array.isArray(body.results)) return body.results
  if (typeof body === 'object') {
    for (const k of Object.keys(body)) {
      if (Array.isArray((body as any)[k])) return (body as any)[k]
    }
  }
  return []
}

// ─── Backend fetchers ───────────────────────────────────────────────────────

async function getUsersCreatedByShopTL(shopTLUserId: number, authHeader?: string | null): Promise<number[]> {
  if (!authHeader) return []
  try {
    const res = await fetch(`${API_BASE}/users/created-by-shop-tl/${shopTLUserId}`, {
      headers: { Authorization: authHeader, Accept: 'application/json' }
    })
    if (!res.ok) return []
    const users = await res.json().catch(() => [])
    return Array.isArray(users) ? users.map((u: any) => Number(u.user_id ?? u.userId ?? u.id)).filter(Boolean) : []
  } catch {
    return []
  }
}

async function getManagedShopTLs(managerId: number, authHeader?: string | null): Promise<number[]> {
  if (!authHeader) return []
  try {
    const res = await fetch(`${API_BASE}/users/managed-by-manager/${managerId}`, {
      headers: { Authorization: authHeader, Accept: 'application/json' }
    })
    if (!res.ok) return []
    const users = await res.json().catch(() => [])
    return Array.isArray(users) ? users.map((u: any) => Number(u.user_id ?? u.userId ?? u.id)).filter(Boolean) : []
  } catch {
    return []
  }
}

async function getUsersInDirectorDepartments(directorUserId: number, authHeader?: string | null): Promise<number[]> {
  if (!authHeader) return []
  try {
    const res = await fetch(`${API_BASE}/directors/${directorUserId}/department-users`, {
      headers: { Authorization: authHeader, Accept: 'application/json' }
    })
    if (!res.ok) return []
    const responseBody = await res.json().catch(() => null)
    if (Array.isArray(responseBody)) {
      return responseBody.map((item: any) => {
        if (typeof item === 'number') return item
        return Number(item.user_id ?? item.userId ?? item.id ?? item)
      }).filter(id => !isNaN(id) && id > 0)
    }
    return []
  } catch {
    return []
  }
}

async function getDirectorScopeUsersDetailed(directorUserId: number, authHeader?: string | null): Promise<Array<{ userId: number, fullName: string, role: string }>> {
  if (!authHeader) return []
  try {
    const res = await fetch(`${API_BASE}/directors/${directorUserId}/users`, {
      headers: { Authorization: authHeader, Accept: 'application/json' }
    })
    if (!res.ok) return []
    const users = await res.json().catch(() => [])
    return Array.isArray(users) ? users.map((u: any) => ({
      userId: Number(u.userId ?? u.user_id ?? u.id ?? NaN),
      fullName: String(u.fullName ?? u.full_name ?? u.name ?? '').trim(),
      role: String(u.role ?? '').toLowerCase()
    })).filter(u => !isNaN(u.userId) && u.userId > 0) : []
  } catch {
    return []
  }
}

async function getTeamLeadersCreatedByDirector(directorUserId: number, authHeader?: string | null): Promise<{
  names: string[],
  ids: number[],
  engineerNames: string[],
  engineerIds: number[],
  hasTeamLeaders: boolean
}> {
  if (!authHeader) return { names: [], ids: [], engineerNames: [], engineerIds: [], hasTeamLeaders: false }
  try {
    const res = await fetch(`${API_BASE}/directors/${directorUserId}/team-leaders`, {
      headers: { Authorization: authHeader, Accept: 'application/json' }
    })
    if (!res.ok) return { names: [], ids: [], engineerNames: [], engineerIds: [], hasTeamLeaders: false }
    const teamLeaders = await res.json().catch(() => [])
    const names: string[] = []
    const ids: number[] = []
    const engineerNames: string[] = []
    const engineerIds: number[] = []
    if (Array.isArray(teamLeaders)) {
      teamLeaders.forEach((tl: any) => {
        const name = String(tl.FullName ?? tl.fullName ?? tl.full_name ?? tl.name ?? '').trim()
        const id = Number(tl.UserId ?? tl.userId ?? tl.user_id ?? tl.id ?? NaN)
        if (name) names.push(name)
        if (isFinite(id) && id > 0) ids.push(id)
        const engineers = tl.Engineers ?? tl.engineers ?? []
        if (Array.isArray(engineers)) {
          engineers.forEach((eng: any) => {
            const engName = String(eng.FullName ?? eng.fullName ?? eng.full_name ?? eng.name ?? '').trim()
            const engId = Number(eng.UserId ?? eng.userId ?? eng.user_id ?? eng.id ?? NaN)
            if (engName) engineerNames.push(engName)
            if (isFinite(engId) && engId > 0) engineerIds.push(engId)
          })
        }
      })
    }
    return { names, ids, engineerNames, engineerIds, hasTeamLeaders: ids.length > 0 }
  } catch {
    return { names: [], ids: [], engineerNames: [], engineerIds: [], hasTeamLeaders: false }
  }
}

// ─── Engineer hold request task IDs fetcher ─────────────────────────────────

async function getEngineerHoldRequestTaskIds(engineerId: number, authHeader?: string | null): Promise<number[]> {
  if (!authHeader || !isFinite(engineerId)) return []
  try {
    const res = await fetch(`${API_BASE}/task-holds/engineer/${engineerId}/task-ids`, {
      headers: { Authorization: authHeader, Accept: 'application/json' }
    })
    if (!res.ok) return []
    const body = await res.json().catch(() => null)
    if (body?.taskIds && Array.isArray(body.taskIds)) {
      return body.taskIds.map((id: any) => Number(id)).filter((id: number) => !isNaN(id) && id > 0)
    } else if (body?.payload && Array.isArray(body.payload)) {
      return body.payload.map((id: any) => Number(id)).filter((id: number) => !isNaN(id) && id > 0)
    } else if (Array.isArray(body)) {
      return body.map((id: any) => Number(id)).filter((id: number) => !isNaN(id) && id > 0)
    }
    return []
  } catch {
    return []
  }
}

// ─── Core RBAC filter ───────────────────────────────────────────────────────

/**
 * Apply role-based access control scoping to a tasks array.
 * This is the single source of truth for task visibility across the app.
 */
export async function applyRbacScoping(tasks: any[], user: any, authHeader?: string | null): Promise<any[]> {
  if (!user) return []
  
  const role = normalizeRole(user?.role ?? user?.role_name ?? user?.roleName ?? user?.roleDisplayName ?? '')

  // Admin sees everything
  if (role === 'admin' || role === 'administrator') {
    return tasks
  }

  // Team Leaders: check if a Director has set a restricted scope for this TL
  if (role === 'team_leader' || role === 'teamleader' || role === '0') {
    const tlUserId = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    
    // Dynamically import the TL scope store (server-side only)
    let tlAllowedUserIds: number[] = []
    try {
      const { getTLAllowedUserIds } = await import('@/lib/tl-scope-store')
      tlAllowedUserIds = getTLAllowedUserIds(tlUserId)
    } catch {
      // If import fails (e.g. client-side), no restriction
    }
    
    // If no scope restriction, TL sees everything (original behavior)
    if (tlAllowedUserIds.length === 0) {
      return tasks
    }
    
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
    
    return tasks.filter(t => {
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
  }

  // Director
  if (role === 'director' || role === '1') {
    const directorUserId = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    if (!isFinite(directorUserId)) return []

    const teamLeaderData = await getTeamLeadersCreatedByDirector(directorUserId, authHeader)
    if (teamLeaderData.hasTeamLeaders) {
      return tasks
    }

    const departmentUserIds = await getUsersInDirectorDepartments(directorUserId, authHeader)
    const scopeUsersDetailed = await getDirectorScopeUsersDetailed(directorUserId, authHeader)
    const scopeUserNames = scopeUsersDetailed.map(u => u.fullName.toLowerCase())
    const allAssignableNames = new Set<string>([...scopeUserNames])
    const allScopeUserIds = new Set<number>([...departmentUserIds])

    if (allScopeUserIds.size === 0 && allAssignableNames.size === 0) return []

    return tasks.filter(t => {
      const taskCreatedBy = Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN)
      const taskAssignedTo = getTaskAssignedEngineer(t).toLowerCase()
      const createdByInScope = allScopeUserIds.has(taskCreatedBy)
      let assignedToInScope = false
      if (taskAssignedTo && taskAssignedTo !== 'unassigned') {
        for (const scopeName of allAssignableNames) {
          if (!scopeName) continue
          if (taskAssignedTo === scopeName || taskAssignedTo.includes(scopeName) || scopeName.includes(taskAssignedTo)) {
            assignedToInScope = true
            break
          }
        }
      }
      return createdByInScope || assignedToInScope
    })
  }

  // Engineer: tasks assigned to them OR tasks where they have submitted hold requests
  // CRITICAL FIX: After hold approval with transfer_to_tl or return_to_initiator,
  // the assignedEngineer changes, so the engineer loses visibility. We also include
  // tasks where the engineer has submitted hold requests to maintain visibility.
  if (role === 'engineer' || role === '2') {
    const name = String(user?.fullName ?? user?.full_name ?? user?.name ?? '').toLowerCase().trim()
    const uid = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    if (!name && !isFinite(uid)) return []

    // Fetch task IDs where this engineer has submitted hold requests
    const holdRequestTaskIds = await getEngineerHoldRequestTaskIds(uid, authHeader)
    const holdTaskIdSet = new Set<number>(holdRequestTaskIds)

    return tasks.filter(t => {
      // CRITERION 1: Task is assigned to the engineer (original logic)
      const assignedStr = getTaskAssignedEngineer(t).toLowerCase()
      if (name && assignedStr) {
        const parts = assignedStr.split(',').map((s: string) => s.trim())
        if (parts.includes(name) || assignedStr.includes(name)) return true
      }
      const assignedId = Number(t.assigned_engineer_id ?? t.assignedEngineerId ?? t.AssignedEngineerId ?? t.assigned_id ?? t.assigned_to_id ?? NaN)
      if (isFinite(uid) && isFinite(assignedId) && assignedId === uid) return true

      // CRITERION 2: Engineer has submitted a hold request for this task
      const taskId = Number(t.taskId ?? t.TaskId ?? t.task_id ?? t.id ?? NaN)
      if (isFinite(taskId) && holdTaskIdSet.has(taskId)) return true

      return false
    })
  }

  // Customer or customer_personnel: only tasks they created
  if (role === 'customer' || role === 'customer_personnel' || role === 'customerpersonnel' || role === '3' || role === '4') {
    const uid = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    const name = String(user?.fullName ?? user?.full_name ?? user?.name ?? '').toLowerCase()
    return tasks.filter(t => {
      const createdBy = Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN)
      const creatorName = String(t.creatorName ?? t.CreatorName ?? t.creator_name ?? t.created_by_name ?? t.creator ?? '').toLowerCase()
      if (isFinite(uid) && isFinite(createdBy) && createdBy === uid) return true
      if (name && creatorName && creatorName.includes(name)) return true
      return false
    })
  }

  // Shop team leader: tasks created by users they created
  if (role === 'shop_tl' || role === 'shoptl' || role === '5') {
    const shopTLUserId = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    if (!isFinite(shopTLUserId)) return []
    const createdUserIds = await getUsersCreatedByShopTL(shopTLUserId, authHeader)
    return tasks.filter(t => {
      const taskCreatedBy = Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN)
      return createdUserIds.includes(taskCreatedBy) || taskCreatedBy === shopTLUserId
    })
  }

  // Manager: see tasks from Shop TLs they manage and their customer personnel
  if (role === 'manager' || role === '6') {
    const managerId = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    if (!isFinite(managerId)) return []
    const managedShopTLIds = await getManagedShopTLs(managerId, authHeader)
    if (managedShopTLIds.length === 0) return []
    const allManagedUserIds = [...managedShopTLIds]
    for (const shopTLId of managedShopTLIds) {
      const createdByShopTL = await getUsersCreatedByShopTL(shopTLId, authHeader)
      allManagedUserIds.push(...createdByShopTL)
    }
    return tasks.filter(t => {
      const taskCreatedBy = Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN)
      return allManagedUserIds.includes(taskCreatedBy)
    })
  }

  // Shop Manager: see tasks from users in their shop only (scoped by shop_name)
  if (role === 'shop_manager' || role === 'shopmanager' || role === 'minimanager' || role === '8') {
    const shopManagerId = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
    const shopManagerShopId = Number(user?.shop_id ?? user?.shopId ?? NaN)
    const shopManagerShopName = String(user?.shop_name ?? user?.shopName ?? '').trim().toLowerCase()
    if (!isFinite(shopManagerId)) return []

    // Primary: Fetch users by shop_name for accurate scoping across shop name matches
    // Fallback: Fetch by shop_id if shop_name is not available
    try {
      let shopUserIds: number[] = []

      // Try shop_name-based scoping first (preferred for accurate grouping)
      if (shopManagerShopName) {
        const nameRes = await fetch(`${API_BASE}/users/by-shop-name/${encodeURIComponent(shopManagerShopName)}`, {
          headers: { Authorization: authHeader || '', Accept: 'application/json' }
        })
        if (nameRes.ok) {
          const shopUsers = await nameRes.json().catch(() => [])
          shopUserIds = Array.isArray(shopUsers)
            ? shopUsers.map((u: any) => Number(u.user_id ?? u.userId ?? u.id)).filter(Boolean)
            : []
        }
      }

      // Fallback to shop_id-based scoping if shop_name lookup returned no results
      if (shopUserIds.length === 0 && isFinite(shopManagerShopId)) {
        const idRes = await fetch(`${API_BASE}/users/by-shop/${shopManagerShopId}`, {
          headers: { Authorization: authHeader || '', Accept: 'application/json' }
        })
        if (idRes.ok) {
          const shopUsers = await idRes.json().catch(() => [])
          shopUserIds = Array.isArray(shopUsers)
            ? shopUsers.map((u: any) => Number(u.user_id ?? u.userId ?? u.id)).filter(Boolean)
            : []
        }
      }

      // Include the shop manager's own ID
      if (!shopUserIds.includes(shopManagerId)) shopUserIds.push(shopManagerId)

      if (shopUserIds.length > 0) {
        return tasks.filter(t => {
          const taskCreatedBy = Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN)
          // Also match tasks by shop_name on the task itself for broader scoping
          const taskShopName = String(t.shop_name ?? t.shopName ?? t.ShopName ?? '').trim().toLowerCase()
          const createdByInShop = shopUserIds.includes(taskCreatedBy)
          const taskBelongsToShop = shopManagerShopName && taskShopName && taskShopName === shopManagerShopName
          return createdByInShop || taskBelongsToShop
        })
      }
    } catch {
      // Fallback: only show tasks created by the shop manager themselves
    }

    return tasks.filter(t => {
      const taskCreatedBy = Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN)
      return taskCreatedBy === shopManagerId
    })
  }

  // Default: only tasks created by user
  const uid = Number(user?.user_id ?? user?.id ?? user?.userId ?? NaN)
  if (isFinite(uid)) {
    return tasks.filter(t => Number(t.createdBy ?? t.CreatedBy ?? t.created_by ?? t.creator_id ?? t.creatorId ?? NaN) === uid)
  }

  return []
}

// ─── Fetch helpers for analytics routes ─────────────────────────────────────

/** Fetch user from backend /auth/me */
export async function fetchUserFromBackend(authHeader?: string | null): Promise<any | null> {
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

/**
 * Fetch ALL tasks from backend by querying each active status individually,
 * then merge and deduplicate. This mirrors the approach used in /api/tasks/route.ts
 * to bypass backend pagination limits that cause incomplete results.
 *
 * Active statuses: Pending=0, InProgress=1, Blocked=3, OnHold=4, Cancelled=5, Paused=6
 * Completed=2 is included here (unlike the tasks list route) because dashboard/analytics
 * need completed tasks for metrics like completion rate and average delay.
 *
 * PAGINATION FIX: Fetches ALL pages per status (up to 10,000 tasks total) instead of
 * only the first page of 1,000 tasks. This ensures analytics metrics are accurate
 * when there are more than 1,000 tasks in any given status.
 */
async function fetchAllTasksFromBackend(authHeader: string, cookieHeader?: string | null): Promise<any[]> {
  const headers: Record<string, string> = {
    Authorization: authHeader,
    Accept: 'application/json'
  }
  if (cookieHeader) headers['Cookie'] = cookieHeader

  // Include ALL statuses (0-7) so dashboard/analytics have complete data
  // Status enum (from C# TaskStatus): Pending=0, InProgress=1, Completed=2, Blocked=3, OnHold=4, Rejected=5, Cancelled=6, Paused=7
  const allStatuses = ['0', '1', '2', '3', '4', '5', '6', '7']

  const PAGE_SIZE = 1000
  const MAX_TOTAL_TASKS = 10000
  const MAX_PAGES_PER_STATUS = Math.ceil(MAX_TOTAL_TASKS / PAGE_SIZE) // 10 pages max per status

  const allTasks: any[] = []
  const seenTaskIds = new Set<number | string>()

  /**
   * Fetch all pages for a single status code.
   * Keeps requesting subsequent pages until:
   * - The returned page has fewer items than PAGE_SIZE (last page), or
   * - We hit MAX_PAGES_PER_STATUS to prevent runaway requests.
   */
  const fetchAllPagesForStatus = async (statusCode: string): Promise<any[]> => {
    const statusTasks: any[] = []
    let pageNumber = 1

    while (pageNumber <= MAX_PAGES_PER_STATUS) {
      try {
        const url = `${API_BASE}/tasks?status=${statusCode}&pageSize=${PAGE_SIZE}&pageNumber=${pageNumber}`
        const res = await fetch(url, { headers })
        if (!res.ok) break
        const body = await res.json().catch(() => null)
        const pageTasks = extractTaskArray(body)

        if (pageTasks.length === 0) break

        statusTasks.push(...pageTasks)

        // If we got fewer tasks than the page size, we've reached the last page
        if (pageTasks.length < PAGE_SIZE) break

        pageNumber++
      } catch {
        break
      }
    }

    return statusTasks
  }

  const fetchPromises = allStatuses.map(fetchAllPagesForStatus)
  const results = await Promise.all(fetchPromises)

  for (const tasks of results) {
    for (const task of tasks) {
      const taskId = task.taskId ?? task.TaskId ?? task.task_id ?? task.id
      if (taskId && !seenTaskIds.has(taskId)) {
        seenTaskIds.add(taskId)
        allTasks.push(task)
      } else if (!taskId) {
        allTasks.push(task)
      }
    }
  }

  return allTasks
}

/** Fetch ALL tasks from backend and apply RBAC filtering */
export async function fetchRbacFilteredTasks(authHeader: string, cookieHeader?: string | null): Promise<any[]> {
  try {
    // Fetch all tasks across all statuses with proper pagination
    const rawList = await fetchAllTasksFromBackend(authHeader, cookieHeader)

    // Get user for RBAC
    const user = await fetchUserFromBackend(authHeader)
    if (!user) return []

    return applyRbacScoping(rawList, user, authHeader)
  } catch {
    return []
  }
}

// ─── Completed tasks fetcher (from /tasks/completed endpoint) ───────────────

/**
 * Fetch ALL completed tasks from the dedicated /tasks/completed backend endpoint
 * (the completed_tasks table), with pagination and deduplication by originalTaskId.
 *
 * This is the SAME data source used by the Completed Tasks Table (/api/tasks/completed).
 * Using this function in analytics ensures the "Tasks Completed" metric matches
 * the completed tasks table count exactly.
 *
 * KEY DIFFERENCES from fetchAllTasksFromBackend + status filter:
 * 1. Fetches from /tasks/completed (completed_tasks table) NOT /tasks (active Tasks table)
 * 2. Deduplicates by originalTaskId (keeps most recent completion per original task)
 * 3. Ensures reopened tasks that still show status=2 in the Tasks table don't inflate counts
 */
async function fetchAllCompletedTasksFromBackend(authHeader: string, cookieHeader?: string | null): Promise<any[]> {
  const headers: Record<string, string> = {
    Authorization: authHeader,
    Accept: 'application/json'
  }
  if (cookieHeader) headers['Cookie'] = cookieHeader

  const PAGE_SIZE = 1000
  const MAX_TASKS = 10000
  const MAX_PAGES = Math.ceil(MAX_TASKS / PAGE_SIZE)

  let rawList: any[] = []
  const seenTaskIds = new Set<string | number>()
  let pageNumber = 1
  let keepFetching = true

  while (keepFetching && rawList.length < MAX_TASKS) {
    try {
      const url = `${API_BASE}/tasks/completed?pageSize=${PAGE_SIZE}&pageNumber=${pageNumber}`
      const res = await fetch(url, { headers })
      if (!res.ok) break
      const body = await res.json().catch(() => null)
      const pageTasks = extractTaskArray(body)

      if (pageTasks.length === 0) break

      // Deduplicate by taskId as we accumulate across pages
      for (const task of pageTasks) {
        const taskId = task.taskId ?? task.TaskId ?? task.task_id ?? task.id
        if (taskId && !seenTaskIds.has(taskId)) {
          seenTaskIds.add(taskId)
          rawList.push(task)
        } else if (!taskId) {
          rawList.push(task)
        }
      }

      if (pageTasks.length < PAGE_SIZE) break
      pageNumber++
      if (pageNumber > MAX_PAGES) break
    } catch {
      break
    }
  }

  // Deduplicate by originalTaskId — keep only the most recent completion per original task.
  // This mirrors the exact deduplication logic in /api/tasks/completed/route.ts.
  const origIdMap = new Map<number | string, any>()
  const noOrigId: any[] = []

  for (const task of rawList) {
    const origId = task.originalTaskId ?? task.original_task_id ?? task.OriginalTaskId ?? null
    if (origId == null) {
      noOrigId.push(task)
      continue
    }
    const existing = origIdMap.get(origId)
    if (!existing) {
      origIdMap.set(origId, task)
    } else {
      const existingDate = new Date(
        existing.completedAt ?? existing.completed_at ?? existing.CompletedAt ??
        existing.actualCompletionDate ?? existing.actual_completion_date ?? 0
      ).getTime()
      const newDate = new Date(
        task.completedAt ?? task.completed_at ?? task.CompletedAt ??
        task.actualCompletionDate ?? task.actual_completion_date ?? 0
      ).getTime()
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

  return [...origIdMap.values(), ...noOrigId]
}

/**
 * Fetch completed tasks from the /tasks/completed endpoint and apply RBAC filtering.
 *
 * This is the single source of truth for completed task data across analytics.
 * It ensures the "Tasks Completed" metric in analytics matches the Completed Tasks Table.
 *
 * Use this instead of fetchRbacFilteredTasks + status filter for any analytics
 * that need completed task counts or completed task data.
 */
export async function fetchRbacFilteredCompletedTasks(authHeader: string, cookieHeader?: string | null): Promise<any[]> {
  try {
    const rawList = await fetchAllCompletedTasksFromBackend(authHeader, cookieHeader)

    const user = await fetchUserFromBackend(authHeader)
    if (!user) return []

    return applyRbacScoping(rawList, user, authHeader)
  } catch {
    return []
  }
}

/** Normalize status string for consistent comparison */
export function normalizeStatus(status: any): string {
  if (status === null || status === undefined) return 'Pending'
  if (typeof status === 'number') {
    switch (status) {
      case 0: return 'Pending'
      case 1: return 'In Progress'
      case 2: return 'Completed'
      case 3: return 'Blocked'
      case 4: return 'On Hold'
      case 5: return 'Rejected'
      case 6: return 'Cancelled'
      case 7: return 'Paused'
      case 8: return 'Pending TL Approval'
      default: return 'Pending'
    }
  }
  const statusStr = String(status).toLowerCase().replace(/[_\s-]+/g, '')
  switch (statusStr) {
    case 'pending': return 'Pending'
    case 'inprogress': return 'In Progress'
    case 'completed': return 'Completed'
    case 'blocked': return 'Blocked'
    case 'onhold': return 'On Hold'
    case 'rejected': return 'Rejected'
    case 'cancelled': return 'Cancelled'
    case 'paused': return 'Paused'
    case 'pendingtlapproval': return 'Pending TL Approval'
    default: return 'Pending'
  }
}

/** Extract auth header from request.
 *  Order of preference:
 *    1. Authorization header sent by the client.
 *    2. x-auth-token forwarded by middleware.ts (set after /auth/me success).
 *    3. access_token cookie (written by /api/auth/login, read by .NET backend).
 *    4. Legacy auth_token / authToken cookies.
 */
export function extractAuthHeader(req: Request): string | null {
  const authHeader = req.headers.get('authorization')
  if (authHeader) return authHeader

  const forwarded = req.headers.get('x-auth-token')
  if (forwarded && forwarded.trim() && forwarded !== 'null' && forwarded !== 'undefined') {
    return `Bearer ${forwarded.trim()}`
  }

  const cookie = req.headers.get('cookie')
  if (cookie) {
    const tokenMatch = cookie.match(/(?:^|;\s*)(?:access_token|auth_token|authToken)=([^;]+)/)
    if (tokenMatch) {
      const raw = decodeURIComponent(tokenMatch[1]).trim()
      if (raw && raw !== 'null' && raw !== 'undefined') {
        return `Bearer ${raw}`
      }
    }
  }
  return null
}

/** Get assigned engineer from task (exported for use in analytics) */
export { getTaskAssignedEngineer, extractTaskArray }