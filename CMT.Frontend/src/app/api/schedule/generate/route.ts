// API route: POST /api/schedule/generate
// Enhanced with EAT timezone support, leave deductions, and weekend amendments
// - Fetches real tasks and users from database
// - Uses /api/users/by-role/engineer for faster user fetching
// - Includes in-memory cache to avoid repeated slow backend calls
// - Returns scheduleEntries, unscheduled, summary
import { NextRequest } from 'next/server'
import { greedySchedule, EAT_SCHEDULE_CONFIG, type LeaveEntry, type WeekendAmendment } from '../../../../lib/scheduler'

// ---------------------------------------------------------------------------
// In-memory cache for users (engineers don't change often)
// ---------------------------------------------------------------------------
interface CacheEntry<T> {
  data: T
  timestamp: number
}

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes
let usersCache: CacheEntry<any[]> | null = null

function getCachedUsers(): any[] | null {
  if (usersCache && Date.now() - usersCache.timestamp < CACHE_TTL_MS) {
    console.log(`[Schedule] Using cached users (${usersCache.data.length} engineers, age: ${Math.round((Date.now() - usersCache.timestamp) / 1000)}s)`)
    return usersCache.data
  }
  return null
}

function setCachedUsers(users: any[]): void {
  usersCache = { data: users, timestamp: Date.now() }
}

// ---------------------------------------------------------------------------
// Helper to get auth token from request
// ---------------------------------------------------------------------------
function getAuthToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }

  const token = request.cookies.get('auth_token')?.value ||
                request.cookies.get('authToken')?.value ||
                request.cookies.get('token')?.value ||
                request.cookies.get('accessToken')?.value

  return token || null
}

// ---------------------------------------------------------------------------
// Fetch with retry and configurable timeout
// ---------------------------------------------------------------------------
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 1,
  timeoutMs = 60000
): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      return response
    } catch (err: any) {
      clearTimeout(timeoutId)
      const isLastAttempt = attempt === retries
      if (isLastAttempt) {
        if (err?.name === 'AbortError') {
          throw new Error(
            `Request to ${url} timed out after ${timeoutMs}ms (${retries + 1} attempts). ` +
            `Please verify the backend is running and responsive.`
          )
        }
        throw err
      }
      console.warn(`[Schedule] Attempt ${attempt + 1} failed for ${url}: ${err?.message}. Retrying in ${(attempt + 1)}s...`)
      await new Promise((resolve) => setTimeout(resolve, (attempt + 1) * 1000))
    }
  }
  throw new Error(`fetchWithRetry: unreachable`)
}

// ---------------------------------------------------------------------------
// Build common headers
// ---------------------------------------------------------------------------
function buildHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

// ---------------------------------------------------------------------------
// Fetch tasks from backend
// ---------------------------------------------------------------------------
async function fetchTasksFromDatabase(start: string, end: string, token: string | null) {
  const backendUrl = process.env.CMT_API_BASE_URL || process.env.CMT_API_URL || 'http://localhost:5000/api'
  const baseUrl = backendUrl.endsWith('/api') ? backendUrl : `${backendUrl}/api`
  const url = `${baseUrl}/tasks`
  const headers = buildHeaders(token)

  console.log(`[Schedule] Fetching tasks from: ${url}`)
  const startTime = Date.now()

  const response = await fetchWithRetry(url, { method: 'GET', headers }, 1, 60000)

  console.log(`[Schedule] Tasks fetched in ${Date.now() - startTime}ms`)

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Backend API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  const tasks = Array.isArray(data) ? data : (data.tasks || [])

  return tasks.map((task: any) => ({
    task_id: task.taskId || task.task_id || task.id,
    estimated_hours: task.estimatedHours || task.estimated_hours || 8,
    planned_start_date: task.estimatedCompletionDate ? new Date(task.estimatedCompletionDate).toISOString().slice(0, 10) : start,
    planned_end_date: task.targetCompletionDate ? new Date(task.targetCompletionDate).toISOString().slice(0, 10) : end,
    assigned_user_id: task.assignedEngineer !== "Unassigned" ? task.assignedEngineer : null,
    priority: task.priorityId || task.priority_id || 1,
    shop_id: task.shopId || task.shop_id,
    category_id: task.categoryId || task.category_id,
    category_name: task.categoryName || task.category_name,
    description: task.description,
    status: task.status,
  }))
}

// ---------------------------------------------------------------------------
// Fetch engineers from backend
// Strategy: Try /api/users/by-role/engineer first (smaller, faster query),
//           fall back to /api/users if that fails.
//           Results are cached for 5 minutes.
// ---------------------------------------------------------------------------
async function fetchUsersFromDatabase(token: string | null) {
  // Check cache first
  const cached = getCachedUsers()
  if (cached) return cached

  const backendUrl = process.env.CMT_API_BASE_URL || process.env.CMT_API_URL || 'http://localhost:5000/api'
  const baseUrl = backendUrl.endsWith('/api') ? backendUrl : `${backendUrl}/api`
  const headers = buildHeaders(token)

  // Strategy 1: Try the lightweight by-role endpoint first
  const byRoleUrl = `${baseUrl}/users/by-role/engineer`
  console.log(`[Schedule] Fetching engineers from: ${byRoleUrl}`)
  const startTime = Date.now()

  try {
    const response = await fetchWithRetry(byRoleUrl, { method: 'GET', headers }, 1, 45000)

    if (response.ok) {
      const data = await response.json()
      const rawUsers = Array.isArray(data) ? data : (data.users || data.data || [])
      console.log(`[Schedule] Engineers fetched via by-role in ${Date.now() - startTime}ms (${rawUsers.length} users)`)

      const users = transformUsers(rawUsers)
      if (users.length > 0) {
        setCachedUsers(users)
        return users
      }
      console.warn(`[Schedule] by-role/engineer returned 0 users, trying /users fallback`)
    } else {
      console.warn(`[Schedule] by-role/engineer returned ${response.status}, trying /users fallback`)
    }
  } catch (err: any) {
    console.warn(`[Schedule] by-role/engineer failed: ${err?.message}. Trying /users fallback...`)
  }

  // Strategy 2: Fall back to /api/users (all users) and filter to engineers
  const allUsersUrl = `${baseUrl}/users`
  console.log(`[Schedule] Fallback: Fetching all users from: ${allUsersUrl}`)
  const fallbackStart = Date.now()

  try {
    const response = await fetchWithRetry(allUsersUrl, { method: 'GET', headers }, 1, 90000)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Backend API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()
    const rawUsers = Array.isArray(data) ? data : (data.users || data.data || [])
    console.log(`[Schedule] All users fetched in ${Date.now() - fallbackStart}ms (${rawUsers.length} total)`)

    // Filter to engineers only
    const engineers = rawUsers.filter((u: any) => {
      const role = String(u.role ?? u.role_name ?? u.roleName ?? '').toLowerCase()
      return role === 'engineer' || role === '2'
    })

    const users = transformUsers(engineers)
    console.log(`[Schedule] Filtered to ${users.length} engineers`)
    setCachedUsers(users)
    return users
  } catch (err: any) {
    console.error(`[Schedule] Both user fetch strategies failed: ${err?.message}`)
    throw new Error(
      `Unable to fetch users from backend. ` +
      `Tried ${byRoleUrl} and ${allUsersUrl}. ` +
      `Backend may be experiencing database timeouts. ` +
      `Original error: ${err?.message}`
    )
  }
}

// ---------------------------------------------------------------------------
// Transform raw user data to scheduler format
// ---------------------------------------------------------------------------
function transformUsers(rawUsers: any[]) {
  return rawUsers.map((user: any) => ({
    user_id: user.userId || user.user_id || user.id,
    full_name: user.fullName || user.full_name || `${user.firstName || ''} ${user.lastName || ''}`.trim() || `User ${user.userId || user.user_id || user.id}`,
    work_hours_per_day: EAT_SCHEDULE_CONFIG.netWorkHoursPerDay,
    role: user.role || user.role_name || user.roleName,
  }))
}

// ---------------------------------------------------------------------------
// POST /api/schedule/generate
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const start = body.start
    const end = body.end

    if (!start || !end) {
      return Response.json({
        error: 'start and end dates are required'
      }, { status: 400 })
    }

    // Get token for backend calls
    const token = getAuthToken(request)
    if (!token) {
      console.warn('[Schedule] No auth token found in request cookies or headers')
    }

    // Fetch real data from database (parallel for better performance)
    const [tasks, users] = await Promise.all([
      fetchTasksFromDatabase(start, end, token),
      fetchUsersFromDatabase(token),
    ])

    if (users.length === 0) {
      return Response.json({
        error: 'No users available for scheduling. Please ensure users exist in the database.'
      }, { status: 400 })
    }

    // Parse leave entries and weekend amendments from request body
    const leaves: LeaveEntry[] = body.leaves ?? []
    const weekendAmendments: WeekendAmendment[] = body.weekendAmendments ?? []

    // Use the enhanced scheduler with EAT config
    const defaultWorkHours = body.defaultWorkHours ?? EAT_SCHEDULE_CONFIG.netWorkHoursPerDay
    const result = greedySchedule(
      tasks,
      users,
      body.time_offs || [],
      { start, end },
      {
        defaultWorkHours,
        respectTimeOff: body.respectTimeOff !== false,
        scheduleConfig: EAT_SCHEDULE_CONFIG,
        leaves,
        weekendAmendments,
      }
    )

    return Response.json({
      ok: true,
      scheduleEntries: result.scheduleEntries,
      unscheduled: result.unscheduled,
      perUserTotals: result.perUserTotals,
      tasksCount: tasks.length,
      usersCount: users.length,
      timezone: EAT_SCHEDULE_CONFIG.timezone,
      netWorkHoursPerDay: defaultWorkHours,
      leavesApplied: leaves.length,
      weekendAmendmentsApplied: weekendAmendments.length,
      message: 'Schedule generated successfully using EAT timezone configuration'
    })

  } catch (error: any) {
    console.error('Schedule generation error:', error)

    return Response.json({
      error: 'Schedule generation failed',
      message: error?.message || String(error),
      details: error?.stack || 'No additional details available'
    }, { status: 500 })
  }
}