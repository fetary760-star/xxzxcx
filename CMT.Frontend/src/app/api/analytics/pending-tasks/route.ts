import { NextRequest, NextResponse } from 'next/server'
import { requireRole, AuthError } from '@/lib/serverAuth'
import { fetchRbacFilteredTasks, normalizeStatus } from '@/lib/rbacFilter'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

/**
 * RBAC-aware pending tasks analytics endpoint.
 * 
 * ROLE-BASED ELAPSED CALCULATION:
 * - For Engineers: Elapsed days = Now - TaskAssignedAt (Pause-Adjusted)
 *   CRITICAL: If TaskAssignedAt is null, elapsed = 0 (engineer not penalized).
 * - For all other roles: Elapsed days = Now - CreatedAt (Pause-Adjusted)
 *
 * ROLE-BASED OVERDUE:
 * - For Engineers: overdue = Now > max(EffectiveTarget, TaskAssignedAt)
 *   EffectiveTarget is recalculated if TaskAssignedAt > OriginalTarget (even by 1 minute):
 *     EffectiveTarget = TaskAssignedAt + (OriginalTarget - CreatedAt)
 *   CRITICAL: If TaskAssignedAt is null, task is NOT overdue for engineer.
 * - For all other roles: overdue = TargetDate < Now
 *
 * TL PERMISSION: Reads the `x-tl-can-view-completed-tasks` header.
 */

/** Maximum pause cap in minutes (5 days = 7200 minutes) */
const MAX_PAUSE_CAP_MINUTES = 7200

/** Extract assigned engineer from task */
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
 * Calculate elapsed days from the role-appropriate start date to now (pause-adjusted).
 * For Engineers: If TaskAssignedAt is null, returns 0 (not penalized).
 */
function calculateElapsedDays(
  taskAssignedAt: string | null,
  taskCreatedAt: string | null,
  totalPausedMinutes: number,
  isEngineer: boolean
): number {
  const now = Date.now()
  let startMs: number
  if (isEngineer) {
    // CRITICAL FIX: If TaskAssignedAt is null, elapsed = 0 (not penalized)
    if (!taskAssignedAt) {
      return 0
    }
    startMs = new Date(taskAssignedAt).getTime()
    if (isNaN(startMs)) {
      return 0
    }
  } else {
    startMs = taskCreatedAt ? new Date(taskCreatedAt).getTime() : now
  }

  const rawElapsedMs = now - startMs
  const cappedPauseMinutes = Math.min(totalPausedMinutes, MAX_PAUSE_CAP_MINUTES)
  const cappedPauseMs = cappedPauseMinutes * 60 * 1000
  const effectiveElapsedMs = rawElapsedMs - cappedPauseMs

  return Math.max(0, Math.round(effectiveElapsedMs / (1000 * 60 * 60 * 24)))
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

    // Fetch RBAC-filtered tasks
    let filteredTasks = await fetchRbacFilteredTasks(authHeader, cookieHeader)

    // When canViewCompletedTasks is false, pre-filter to exclude completed tasks
    if (!canViewCompletedTasks) {
      filteredTasks = filteredTasks.filter(t => {
        const status = normalizeStatus(t.status ?? t.Status ?? t.taskStatus ?? 0)
        return status !== 'Completed'
      })
    }

    // Filter for pending/active tasks (non-completed, non-rejected, non-cancelled)
    const now = new Date()
    const pendingTasks = filteredTasks.filter(t => {
      const status = normalizeStatus(t.status ?? t.Status ?? t.taskStatus ?? 0)
      return status !== 'Completed' && status !== 'Rejected' && status !== 'Cancelled'
    })

    // Count overdue tasks (ROLE-BASED)
    // For Engineers: overdue = Now > max(EffectiveTarget, TaskAssignedAt)
    //   EffectiveTarget recalculated if assigned late.
    //   CRITICAL: If TaskAssignedAt is null, task is NOT overdue for engineer.
    // For all other roles: overdue = TargetDate < Now
    const overdueTasks = pendingTasks.filter(t => {
      const targetDate = t.targetCompletionDate ?? t.target_completion_date ?? t.TargetCompletionDate ?? null
      if (!targetDate) return false
      try {
        const targetMs = new Date(targetDate).getTime()
        if (isEngineer) {
          const taskAssignedAtRaw = getTaskAssignedAt(t)
          // CRITICAL FIX: If no TaskAssignedAt, engineer is NOT overdue
          if (!taskAssignedAtRaw) return false
          const assignedMs = new Date(taskAssignedAtRaw).getTime()
          if (isNaN(assignedMs)) return false

          // Compute effective target (recalculated if assigned late)
          const taskCreatedAtRaw = getTaskCreatedAt(t)
          const { effectiveTargetMs } = getEffectiveTargetDate(targetMs, taskAssignedAtRaw, taskCreatedAtRaw, true)

          // Effective reference = max(EffectiveTarget, TaskAssignedAt)
          const effectiveReferenceMs = assignedMs > effectiveTargetMs ? assignedMs : effectiveTargetMs
          return effectiveReferenceMs < now.getTime()
        }
        return targetMs < now.getTime()
      } catch {
        return false
      }
    })

    // Breakdown by status
    const byStatus: Record<string, number> = {}
    pendingTasks.forEach(t => {
      const status = normalizeStatus(t.status ?? t.Status ?? t.taskStatus ?? 0)
      byStatus[status] = (byStatus[status] || 0) + 1
    })

    // Breakdown by priority
    const byPriority: Record<string, number> = {}
    pendingTasks.forEach(t => {
      const priority = normalizePriority(t.priorityLevelName ?? t.priority_level_name ?? t.PriorityLevelName ?? t.priority ?? '')
      byPriority[priority] = (byPriority[priority] || 0) + 1
    })

    // Breakdown by engineer
    const byEngineer: Record<string, number> = {}
    pendingTasks.forEach(t => {
      const engineer = getTaskAssignedEngineer(t) || 'Unassigned'
      const engineers = engineer.split(',').map(s => s.trim()).filter(Boolean)
      if (engineers.length === 0) engineers.push('Unassigned')
      engineers.forEach(eng => {
        byEngineer[eng] = (byEngineer[eng] || 0) + 1
      })
    })

    // Build pending tasks detail list (up to 15)
    // ROLE-BASED: Elapsed days from role-appropriate start date
    // ROLE-BASED OVERDUE: For Engineers, uses effective target (recalculated if assigned late)
    const pendingTasksList = pendingTasks
      .sort((a, b) => {
        const dateA = new Date(a.createdAt ?? a.created_at ?? a.CreatedAt ?? 0).getTime()
        const dateB = new Date(b.createdAt ?? b.created_at ?? b.CreatedAt ?? 0).getTime()
        return dateB - dateA
      })
      .slice(0, 15)
      .map(t => {
        const targetDate = t.targetCompletionDate ?? t.target_completion_date ?? t.TargetCompletionDate ?? null
        const taskAssignedAtRaw = getTaskAssignedAt(t)
        const taskCreatedAtRaw = getTaskCreatedAt(t)
        const totalPausedMinutes = getTotalPausedDurationMinutes(t)

        // Compute effective target for engineers
        let effectiveTargetDate: string | null = null
        let originalTargetDate: string | null = null
        let isOverdue = false

        if (targetDate) {
          try {
            const targetMs = new Date(targetDate).getTime()
            originalTargetDate = new Date(targetMs).toLocaleDateString()

            if (isEngineer) {
              if (taskAssignedAtRaw) {
                const assignedMs = new Date(taskAssignedAtRaw).getTime()
                if (!isNaN(assignedMs)) {
                  // Compute effective target (recalculated if assigned late)
                  const { effectiveTargetMs, wasRecalculated } = getEffectiveTargetDate(
                    targetMs, taskAssignedAtRaw, taskCreatedAtRaw, true
                  )
                  if (wasRecalculated) {
                    effectiveTargetDate = new Date(effectiveTargetMs).toLocaleDateString()
                  }

                  // Effective reference = max(EffectiveTarget, TaskAssignedAt)
                  const effectiveReferenceMs = assignedMs > effectiveTargetMs ? assignedMs : effectiveTargetMs
                  isOverdue = effectiveReferenceMs < now.getTime()
                }
              }
              // If no taskAssignedAt, isOverdue stays false
            } else {
              isOverdue = targetMs < now.getTime()
            }
          } catch {
            isOverdue = false
          }
        }

        // Calculate elapsed days based on role
        const elapsedDays = calculateElapsedDays(taskAssignedAtRaw, taskCreatedAtRaw, totalPausedMinutes, isEngineer)

        // Determine the primary date to show based on role
        const primaryCreatedAt = isEngineer
          ? (taskAssignedAtRaw || taskCreatedAtRaw || '')
          : (taskCreatedAtRaw || '')

        // Display target: effective target for engineers if recalculated, otherwise original
        const displayTargetDate = effectiveTargetDate || (targetDate ? targetDate : null)

        return {
          taskId: t.taskId ?? t.TaskId ?? t.task_id ?? t.id,
          serialNumber: t.serialNumber ?? t.serial_number ?? t.SerialNumber ?? '',
          partNumber: t.partNumber ?? t.part_number ?? t.PartNumber ?? '',
          description: t.description ?? t.Description ?? '',
          status: normalizeStatus(t.status ?? t.Status ?? t.taskStatus ?? 0),
          priority: normalizePriority(t.priorityLevelName ?? t.priority_level_name ?? t.PriorityLevelName ?? t.priority ?? ''),
          engineer: getTaskAssignedEngineer(t) || 'Unassigned',
          targetDate: displayTargetDate,
          originalTargetDate,
          effectiveTargetDate,
          createdAt: primaryCreatedAt,
          taskAssignedAt: taskAssignedAtRaw || null,
          taskCreatedAt: taskCreatedAtRaw || null,
          isOverdue,
          elapsedDays
        }
      })

    const result = {
      totalPending: pendingTasks.length,
      overdue: overdueTasks.length,
      byStatus,
      byPriority,
      byEngineer,
      pendingTasks: pendingTasksList,
      userRole: userRoleHeader || ''
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[api/analytics/pending-tasks] Error:', error)

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