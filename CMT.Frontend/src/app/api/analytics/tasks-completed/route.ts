import { NextRequest, NextResponse } from 'next/server'
import { requireRole, AuthError } from '@/lib/serverAuth'
import { fetchRbacFilteredCompletedTasks, fetchRbacFilteredTasks, normalizeStatus, getTaskAssignedEngineer } from '@/lib/rbacFilter'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

/**
 * RBAC-aware tasks completed analytics endpoint.
 * 
 * CRITICAL FIX: Uses fetchRbacFilteredCompletedTasks which fetches from the
 * /tasks/completed endpoint (the completed_tasks table).
 *
 * ROLE-BASED DURATION CALCULATION:
 * - For Engineers: Duration = EffectiveCompletion - TaskAssignedAt (Pause-Adjusted)
 *   CRITICAL: If TaskAssignedAt is null, duration = 0 (engineer not penalized).
 * - For all other roles: Duration = EffectiveCompletion - CreatedAt (Pause-Adjusted)
 *
 * TARGET COMPLETION DATE AUTO-UPDATE:
 * When a Team Leader assigns a task AFTER the original target date (even by 1 minute),
 * the TargetCompletionDate is automatically updated in the database.
 * Formula: NewTarget = TaskAssignedAt + (OriginalTarget - CreatedAt)
 *
 * TL PERMISSION: Reads the `x-tl-can-view-completed-tasks` header.
 */

/** Maximum pause cap in minutes (5 days = 7200 minutes) */
const MAX_PAUSE_CAP_MINUTES = 7200

/** Normalize priority string */
function normalizePriority(raw: any): string {
  if (!raw) return 'Unknown'
  const s = String(raw).toLowerCase().trim()
  if (s === 'high' || s === '1') return 'High'
  if (s === 'medium' || s === 'med' || s === '2') return 'Medium'
  if (s === 'low' || s === '3') return 'Low'
  return String(raw).trim() || 'Unknown'
}

/**
 * Extract TaskAssignedAt from a task.
 */
function getTaskAssignedAt(t: any): string | null {
  return t.taskAssignedAt ?? t.task_assigned_at ?? t.TaskAssignedAt ??
    t.assignedAt ?? t.assigned_at ?? t.AssignedAt ?? null
}

/**
 * Extract TaskCreatedAt / CreatedAt from a task.
 */
function getTaskCreatedAt(t: any): string | null {
  return t.taskCreatedAt ?? t.task_created_at ?? t.TaskCreatedAt ??
    t.createdAt ?? t.created_at ?? t.CreatedAt ?? null
}

/**
 * Extract TotalPausedDurationMinutes from a task.
 */
function getTotalPausedDurationMinutes(t: any): number {
  const raw = t.totalPausedDurationMinutes ?? t.TotalPausedDurationMinutes ??
    t.total_paused_duration_minutes ?? t.pausedDurationMinutes ??
    t.PausedDurationMinutes ?? t.paused_duration_minutes ?? 0
  const val = Number(raw)
  return Number.isFinite(val) && val >= 0 ? val : 0
}

/**
 * Determine if the user role is an Engineer.
 * Handles various formats: "engineer", "Engineer", "2", "eng", "Engineer (Avionics)", etc.
 */
function isEngineerRole(userRole: string | null): boolean {
  if (!userRole) return false
  const role = userRole.trim().toLowerCase().replace(/[\s\-]+/g, '_')
  // Exact matches
  if (role === 'engineer' || role === '2' || role === 'eng') return true
  // Starts-with match for composite roles like "engineer_(avionics)"
  if (role.startsWith('engineer')) return true
  return false
}

/**
 * Compute the Effective Target Completion Date for engineers.
 * For engineers, ALWAYS recalculates when TaskAssignedAt > CreatedAt (even by 1 minute):
 *   EffectiveTarget = TaskAssignedAt + (OriginalTarget - CreatedAt)
 * This preserves the original working duration and shifts it to start from TaskAssignedAt.
 * The engineer's performance is always evaluated from when they received the task.
 */
function getEffectiveTargetDate(
  originalTargetMs: number,
  taskAssignedAt: string | null,
  taskCreatedAt: string | null,
  isEngineer: boolean
): { effectiveTargetMs: number; wasRecalculated: boolean } {
  if (!isEngineer) {
    return { effectiveTargetMs: originalTargetMs, wasRecalculated: false }
  }

  if (!taskAssignedAt) {
    return { effectiveTargetMs: originalTargetMs, wasRecalculated: false }
  }

  const assignedMs = new Date(taskAssignedAt).getTime()
  if (isNaN(assignedMs)) {
    return { effectiveTargetMs: originalTargetMs, wasRecalculated: false }
  }

  // Always recalculate for engineers when TaskAssignedAt > CreatedAt (even by 1 minute)
  const createdMs = taskCreatedAt ? new Date(taskCreatedAt).getTime() : originalTargetMs
  if (assignedMs > createdMs) {
    let originalDurationMs = originalTargetMs - createdMs
    // Ensure minimum 1 day duration
    if (originalDurationMs < 86400000) {
      originalDurationMs = 86400000
    }
    const effectiveTargetMs = assignedMs + originalDurationMs
    return { effectiveTargetMs, wasRecalculated: true }
  }

  // TaskAssignedAt is same as or before CreatedAt (edge case) — use original
  return { effectiveTargetMs: originalTargetMs, wasRecalculated: false }
}

/**
 * Calculate role-based duration in days from the appropriate start date to effective completion.
 * For Engineers: If TaskAssignedAt is null, returns 0 (not penalized).
 */
function calculateRoleBasedDurationDays(
  actualCompletionMs: number,
  taskAssignedAt: string | null,
  taskCreatedAt: string | null,
  totalPausedMinutes: number,
  isEngineer: boolean
): number {
  let startMs: number
  if (isEngineer) {
    // CRITICAL FIX: If TaskAssignedAt is null, duration = 0 (not penalized)
    if (!taskAssignedAt) {
      return 0
    }
    startMs = new Date(taskAssignedAt).getTime()
    if (isNaN(startMs)) {
      return 0
    }
  } else {
    startMs = taskCreatedAt ? new Date(taskCreatedAt).getTime() : actualCompletionMs
  }

  const rawDurationMs = actualCompletionMs - startMs
  const cappedPauseMinutes = Math.min(totalPausedMinutes, MAX_PAUSE_CAP_MINUTES)
  const cappedPauseMs = cappedPauseMinutes * 60 * 1000
  const effectiveDurationMs = rawDurationMs - cappedPauseMs

  return Math.max(0, Math.round(effectiveDurationMs / (1000 * 60 * 60 * 24)))
}

export async function GET(request: NextRequest) {
  try {
    await requireRole(request, [
      'team_leader', 'teamleader', 'director', 'engineer', 'customer', 'customer_personnel', 'shop_tl', 'shoptl', 'shop-tl', 'manager', 'shop_manager', 'shopmanager', 'shop_mgr', 'admin', 'administrator',
      '0', '1', '2', '3', '4', '5', '6', '7', '8'
    ])

    const authHeader = resolveAuthorizationHeader(request)
    const cookieHeader = request.headers.get('cookie')

    if (!authHeader) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // TL Permission
    const canViewCompletedTasksHeader = request.headers.get('x-tl-can-view-completed-tasks')
    const canViewCompletedTasks = canViewCompletedTasksHeader !== 'false'

    // Determine user role for role-based calculations
    const userRoleHeader = request.headers.get('x-user-role') || request.headers.get('x-auth-role') || ''
    const isEngineer = isEngineerRole(userRoleHeader)

    // Fetch completed tasks from the /tasks/completed endpoint
    const completedTasks = canViewCompletedTasks
      ? await fetchRbacFilteredCompletedTasks(authHeader, cookieHeader)
      : []

    // Breakdown by priority
    const byPriority: Record<string, number> = {}
    completedTasks.forEach(t => {
      const priority = normalizePriority(t.priorityLevelName ?? t.priority_level_name ?? t.PriorityLevelName ?? t.priority ?? '')
      byPriority[priority] = (byPriority[priority] || 0) + 1
    })

    // Breakdown by engineer
    const byEngineer: Record<string, number> = {}
    completedTasks.forEach(t => {
      const engineer = getTaskAssignedEngineer(t) || 'Unassigned'
      const engineers = engineer.split(',').map(s => s.trim()).filter(Boolean)
      if (engineers.length === 0) engineers.push('Unassigned')
      engineers.forEach(eng => {
        byEngineer[eng] = (byEngineer[eng] || 0) + 1
      })
    })

    // Priority stats (completed vs total for each priority)
    const allFilteredTasks = canViewCompletedTasks
      ? await fetchRbacFilteredTasks(authHeader, cookieHeader)
      : (await fetchRbacFilteredTasks(authHeader, cookieHeader)).filter(t => {
          const status = normalizeStatus(t.status ?? t.Status ?? t.taskStatus ?? 0)
          return status !== 'Completed'
        })

    const priorityStats: Record<string, { completed: number; total: number; rate: number }> = {}
    const priorityLevels = ['High', 'Medium', 'Low']
    priorityLevels.forEach(priority => {
      const total = allFilteredTasks.filter(t =>
        normalizePriority(t.priorityLevelName ?? t.priority_level_name ?? t.PriorityLevelName ?? t.priority ?? '') === priority
      ).length
      const completed = completedTasks.filter(t =>
        normalizePriority(t.priorityLevelName ?? t.priority_level_name ?? t.PriorityLevelName ?? t.priority ?? '') === priority
      ).length
      if (total > 0) {
        priorityStats[priority] = {
          completed,
          total,
          rate: (completed / total) * 100
        }
      }
    })

    // Recent completions (last 50 for detailed search/filter)
    // ROLE-BASED: Duration calculated from role-appropriate start date
    const recentCompletions = completedTasks
      .filter(t => t.actualCompletionDate ?? t.actual_completion_date ?? t.ActualCompletionDate ?? t.completedAt ?? t.completed_at ?? t.createdAt ?? t.created_at)
      .sort((a, b) => {
        const dateA = new Date(a.actualCompletionDate ?? a.actual_completion_date ?? a.ActualCompletionDate ?? a.completedAt ?? a.completed_at ?? a.createdAt ?? a.created_at ?? 0).getTime()
        const dateB = new Date(b.actualCompletionDate ?? b.actual_completion_date ?? b.ActualCompletionDate ?? b.completedAt ?? b.completed_at ?? b.createdAt ?? b.created_at ?? 0).getTime()
        return dateB - dateA
      })
      .slice(0, 50)
      .map(t => {
        const taskAssignedAtRaw = getTaskAssignedAt(t)
        const taskCreatedAtRaw = getTaskCreatedAt(t)
        const totalPausedMinutes = getTotalPausedDurationMinutes(t)

        // Get actual completion date
        const actualDateStr = t.engineerCompletedAt ?? t.engineer_completed_at ?? t.EngineerCompletedAt ??
          t.actualCompletionDate ?? t.actual_completion_date ?? t.ActualCompletionDate ??
          t.completedAt ?? t.completed_at ?? t.CompletedAt ?? ''
        const actualMs = actualDateStr ? new Date(actualDateStr).getTime() : 0

        // Calculate role-based duration
        const durationDays = actualMs > 0
          ? calculateRoleBasedDurationDays(actualMs, taskAssignedAtRaw, taskCreatedAtRaw, totalPausedMinutes, isEngineer)
          : 0

        // TC Number: use originalTaskId
        const tcNumber = t.originalTaskId ?? t.original_task_id ?? t.OriginalTaskId ?? t.taskId ?? t.TaskId ?? t.task_id ?? t.id

        // Determine primary created date based on role
        const primaryCreatedDate = isEngineer
          ? (taskAssignedAtRaw || taskCreatedAtRaw || '')
          : (taskCreatedAtRaw || '')

        // Extract target date for display
        const targetDateStr = t.targetCompletionDate ?? t.target_completion_date ?? t.TargetCompletionDate ??
          t.estimatedCompletionDate ?? t.estimated_completion_date ?? t.EstimatedCompletionDate ?? null

        // Compute effective target for engineers
        let effectiveTargetDate: string | null = null
        let originalTargetDate: string | null = null
        if (targetDateStr) {
          const targetMs = new Date(targetDateStr).getTime()
          originalTargetDate = new Date(targetMs).toLocaleDateString()
          const { effectiveTargetMs, wasRecalculated } = getEffectiveTargetDate(
            targetMs, taskAssignedAtRaw, taskCreatedAtRaw, isEngineer
          )
          if (isEngineer && wasRecalculated) {
            effectiveTargetDate = new Date(effectiveTargetMs).toLocaleDateString()
          }
        }

        // Display target: effective for engineers if recalculated, otherwise original
        const displayTargetDate = effectiveTargetDate || (targetDateStr ? new Date(targetDateStr).toLocaleDateString() : null)

        return {
          taskId: tcNumber,
          serialNumber: t.serialNumber ?? t.serial_number ?? t.SerialNumber ?? '',
          partNumber: t.partNumber ?? t.part_number ?? t.PartNumber ?? '',
          description: t.description ?? t.Description ?? '',
          completedDate: t.actualCompletionDate ?? t.actual_completion_date ?? t.ActualCompletionDate ?? t.completedAt ?? t.completed_at ?? '',
          targetDate: displayTargetDate,
          originalTargetDate,
          effectiveTargetDate,
          engineer: getTaskAssignedEngineer(t) || 'Unassigned',
          priority: normalizePriority(t.priorityLevelName ?? t.priority_level_name ?? t.PriorityLevelName ?? t.priority ?? ''),
          createdDate: primaryCreatedDate,
          taskAssignedAt: taskAssignedAtRaw || null,
          taskCreatedAt: taskCreatedAtRaw || null,
          categoryName: t.categoryName ?? t.category_name ?? t.CategoryName ?? '',
          durationDays
        }
      })

    // Calculate average duration across all completed tasks
    let totalDurationDays = 0
    let durationCount = 0
    completedTasks.forEach(t => {
      const actualDateStr = t.engineerCompletedAt ?? t.engineer_completed_at ?? t.EngineerCompletedAt ??
        t.actualCompletionDate ?? t.actual_completion_date ?? t.ActualCompletionDate ??
        t.completedAt ?? t.completed_at ?? t.CompletedAt ?? ''
      const actualMs = actualDateStr ? new Date(actualDateStr).getTime() : 0
      if (actualMs > 0) {
        const taskAssignedAtRaw = getTaskAssignedAt(t)
        const taskCreatedAtRaw = getTaskCreatedAt(t)
        const totalPausedMinutes = getTotalPausedDurationMinutes(t)
        totalDurationDays += calculateRoleBasedDurationDays(actualMs, taskAssignedAtRaw, taskCreatedAtRaw, totalPausedMinutes, isEngineer)
        durationCount++
      }
    })
    const avgDurationDays = durationCount > 0 ? totalDurationDays / durationCount : 0

    const result = {
      totalCompleted: completedTasks.length,
      byPriority,
      byEngineer,
      priorityStats,
      recentCompletions,
      avgDurationDays,
      userRole: userRoleHeader || ''
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[api/analytics/tasks-completed] Error:', error)

    if (error instanceof AuthError) {
      return NextResponse.json(error.body, { status: error.status })
    }

    if (error instanceof Response) {
      const errorData = await error.json().catch(() => ({ error: 'unauthorized' }))
      return NextResponse.json(errorData, { status: error.status })
    }

    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    )
  }
}