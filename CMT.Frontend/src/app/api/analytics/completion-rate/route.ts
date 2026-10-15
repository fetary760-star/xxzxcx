import { NextRequest, NextResponse } from 'next/server'
import { requireRole, AuthError } from '@/lib/serverAuth'
import { fetchRbacFilteredTasks, fetchRbacFilteredCompletedTasks, normalizeStatus, getTaskAssignedEngineer } from '@/lib/rbacFilter'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

/**
 * RBAC-aware completion rate analytics endpoint.
 * 
 * CRITICAL FIX: Uses fetchRbacFilteredCompletedTasks for completed task counts
 * to ensure consistency with the Completed Tasks Table. Non-completed task counts
 * still come from fetchRbacFilteredTasks (the active Tasks table).
 *
 * COMPLETION RATE CALCULATION:
 * CompletionRate = (CompletedTasks / TotalTasks) * 100
 * where TotalTasks = non-completed active tasks + completed tasks (from completed_tasks table)
 *
 * ROLE-BASED DELAY CALCULATION:
 * - For Engineers: delay = ActualCompletion - max(EffectiveTarget, TaskAssignedAt) - cappedPauseDuration
 *   Engineers are NOT penalized for delays before assignment.
 *   EffectiveTarget is recalculated if TaskAssignedAt > OriginalTarget (even by 1 minute):
 *     EffectiveTarget = TaskAssignedAt + (OriginalTarget - CreatedAt)
 *   CRITICAL: If TaskAssignedAt is null, engineer gets 0 delay.
 * - For all other roles: delay = ActualCompletion - TargetDate - cappedPauseDuration
 *
 * ROLE-BASED DURATION CALCULATION:
 * - For Engineers: Duration = EffectiveCompletion - TaskAssignedAt (Pause-Adjusted)
 *   If TaskAssignedAt is null, duration = 0.
 * - For all other roles: Duration = EffectiveCompletion - CreatedAt (Pause-Adjusted)
 *
 * TL PERMISSION: Reads the `x-tl-can-view-completed-tasks` header.
 * When set to 'false', completed tasks are excluded from the dataset.
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
 * Extract the best actual completion date from a completed task.
 */
function getActualCompletionDate(t: any): string | null {
  return t.engineerCompletedAt ?? t.engineer_completed_at ?? t.EngineerCompletedAt ??
    t.actualCompletionDate ?? t.actual_completion_date ?? t.ActualCompletionDate ??
    t.completedAt ?? t.completed_at ?? t.CompletedAt ??
    null
}

/**
 * Extract the target completion date from a task.
 */
function getTargetCompletionDate(t: any): string | null {
  return t.targetCompletionDate ?? t.target_completion_date ?? t.TargetCompletionDate ??
    t.estimatedCompletionDate ?? t.estimated_completion_date ?? t.EstimatedCompletionDate ??
    null
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
 * Extract TaskAssignedAt from a task.
 */
function getTaskAssignedAt(t: any): string | null {
  return t.taskAssignedAt ?? t.task_assigned_at ?? t.TaskAssignedAt ??
    t.assignedAt ?? t.assigned_at ?? t.AssignedAt ?? null
}

/**
 * Extract TaskCreatedAt from a task.
 */
function getTaskCreatedAt(t: any): string | null {
  return t.taskCreatedAt ?? t.task_created_at ?? t.TaskCreatedAt ??
    t.createdAt ?? t.created_at ?? t.CreatedAt ?? null
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
 * Calculate role-based delay in days.
 * For Engineers: delay = ActualCompletion - max(EffectiveTarget, TaskAssignedAt) - cappedPauseDuration
 *   CRITICAL: If TaskAssignedAt is null, returns 0 (engineer not penalized).
 * For all other roles: delay = ActualCompletion - TargetDate - cappedPauseDuration
 */
function calculateRoleBasedDelayDays(
  actualDateMs: number,
  targetDateMs: number,
  taskAssignedAt: string | null,
  taskCreatedAt: string | null,
  totalPausedMinutes: number,
  isEngineer: boolean
): number {
  const cappedPauseMinutes = Math.min(totalPausedMinutes, MAX_PAUSE_CAP_MINUTES)
  const cappedPauseMs = cappedPauseMinutes * 60 * 1000

  let rawDelayMs: number

  if (isEngineer) {
    // CRITICAL FIX: If TaskAssignedAt is null, engineer gets 0 delay
    if (!taskAssignedAt) {
      return 0
    }
    const assignedMs = new Date(taskAssignedAt).getTime()
    if (isNaN(assignedMs)) {
      return 0
    }

    // Compute effective target (recalculated if assigned late)
    const { effectiveTargetMs } = getEffectiveTargetDate(targetDateMs, taskAssignedAt, taskCreatedAt, true)

    // effective reference = max(EffectiveTarget, TaskAssignedAt)
    const effectiveReferenceMs = assignedMs > effectiveTargetMs ? assignedMs : effectiveTargetMs
    rawDelayMs = actualDateMs - effectiveReferenceMs
  } else {
    rawDelayMs = actualDateMs - targetDateMs
  }

  const effectiveDelayMs = rawDelayMs - cappedPauseMs
  return Math.round(effectiveDelayMs / (1000 * 60 * 60 * 24))
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

    // Fetch RBAC-filtered tasks from active Tasks table
    let filteredTasks = await fetchRbacFilteredTasks(authHeader, cookieHeader)

    // Fetch completed tasks from the /tasks/completed endpoint
    const completedTasksFromTable = canViewCompletedTasks
      ? await fetchRbacFilteredCompletedTasks(authHeader, cookieHeader)
      : []

    // Apply TL completed-tasks filter
    if (!canViewCompletedTasks) {
      filteredTasks = filteredTasks.filter(t => {
        const status = normalizeStatus(t.status ?? t.Status ?? t.taskStatus ?? 0)
        return status !== 'Completed'
      })
    }

    // Count non-completed statuses from the active Tasks table
    let inProgressTasks = 0
    let pendingTasks = 0
    let blockedTasks = 0
    let onHoldTasks = 0
    let pausedTasks = 0
    let rejectedTasks = 0
    let cancelledTasks = 0
    let pendingTLTasks = 0
    const statusBreakdown: Record<string, number> = {}

    filteredTasks.forEach(t => {
      const status = normalizeStatus(t.status ?? t.Status ?? t.taskStatus ?? 0)
      if (status === 'Completed') return
      statusBreakdown[status] = (statusBreakdown[status] || 0) + 1

      switch (status) {
        case 'In Progress': inProgressTasks++; break
        case 'Pending': pendingTasks++; break
        case 'Blocked': blockedTasks++; break
        case 'On Hold': onHoldTasks++; break
        case 'Paused': pausedTasks++; break
        case 'Rejected': rejectedTasks++; break
        case 'Cancelled': cancelledTasks++; break
        case 'Pending TL Approval': pendingTLTasks++; break
        default: pendingTasks++; break
      }
    })

    // Use the completed_tasks table count for the completed metric
    const completedTasks = completedTasksFromTable.length
    if (completedTasks > 0) {
      statusBreakdown['Completed'] = completedTasks
    }

    // Total = non-completed (from active table) + completed (from completed_tasks table)
    const nonCompletedTotal = inProgressTasks + pendingTasks + blockedTasks + onHoldTasks +
      pausedTasks + rejectedTasks + cancelledTasks + pendingTLTasks
    const totalTasks = nonCompletedTotal + completedTasks
    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

    // Category distribution with engineer breakdown
    const categoryDistribution: Record<string, {
      categoryName: string
      totalTasks: number
      completedTasks: number
      completionRate: number
      engineerDistribution: Record<string, number>
    }> = {}

    // Add non-completed tasks from active table
    filteredTasks.forEach(t => {
      const status = normalizeStatus(t.status ?? t.Status ?? t.taskStatus ?? 0)
      if (status === 'Completed') return
      const category = t.categoryName ?? t.category_name ?? t.CategoryName ?? 'Uncategorized'
      const engineer = getTaskAssignedEngineer(t) || 'Unassigned'

      if (!categoryDistribution[category]) {
        categoryDistribution[category] = {
          categoryName: category,
          totalTasks: 0,
          completedTasks: 0,
          completionRate: 0,
          engineerDistribution: {}
        }
      }

      categoryDistribution[category].totalTasks++

      const engineers = engineer.split(',').map(s => s.trim()).filter(Boolean)
      if (engineers.length === 0) engineers.push('Unassigned')
      engineers.forEach(eng => {
        categoryDistribution[category].engineerDistribution[eng] =
          (categoryDistribution[category].engineerDistribution[eng] || 0) + 1
      })
    })

    // Add completed tasks from completed_tasks table
    completedTasksFromTable.forEach(t => {
      const category = t.categoryName ?? t.category_name ?? t.CategoryName ?? 'Uncategorized'
      const engineer = getTaskAssignedEngineer(t) || 'Unassigned'

      if (!categoryDistribution[category]) {
        categoryDistribution[category] = {
          categoryName: category,
          totalTasks: 0,
          completedTasks: 0,
          completionRate: 0,
          engineerDistribution: {}
        }
      }

      categoryDistribution[category].totalTasks++
      categoryDistribution[category].completedTasks++

      const engineers = engineer.split(',').map(s => s.trim()).filter(Boolean)
      if (engineers.length === 0) engineers.push('Unassigned')
      engineers.forEach(eng => {
        categoryDistribution[category].engineerDistribution[eng] =
          (categoryDistribution[category].engineerDistribution[eng] || 0) + 1
      })
    })

    // Compute completion rate per category
    Object.values(categoryDistribution).forEach(cat => {
      cat.completionRate = cat.totalTasks > 0 ? (cat.completedTasks / cat.totalTasks) * 100 : 0
    })

    // Completion trend (recent completed tasks) — from completed_tasks table
    // ROLE-BASED: Delay and Duration calculated from role-appropriate start date
    const completedTasksList = completedTasksFromTable
      .sort((a, b) => {
        const dateA = new Date(getActualCompletionDate(a) ?? a.createdAt ?? a.created_at ?? 0).getTime()
        const dateB = new Date(getActualCompletionDate(b) ?? b.createdAt ?? b.created_at ?? 0).getTime()
        return dateB - dateA
      })
      .slice(0, 50)
      .map(t => {
        let delayDays = 0
        const actualDate = getActualCompletionDate(t)
        const targetDate = getTargetCompletionDate(t)
        const taskAssignedAtRaw = getTaskAssignedAt(t)
        const taskCreatedAtRaw = getTaskCreatedAt(t)
        const totalPausedMinutes = getTotalPausedDurationMinutes(t)

        let effectiveTargetDate: string | null = null
        let originalTargetDate: string | null = null

        if (actualDate && targetDate) {
          try {
            const actualMs = new Date(actualDate).getTime()
            const targetMs = new Date(targetDate).getTime()
            originalTargetDate = new Date(targetMs).toLocaleDateString()

            // Compute effective target for engineers
            const { effectiveTargetMs, wasRecalculated } = getEffectiveTargetDate(
              targetMs, taskAssignedAtRaw, taskCreatedAtRaw, isEngineer
            )
            if (isEngineer && wasRecalculated) {
              effectiveTargetDate = new Date(effectiveTargetMs).toLocaleDateString()
            }

            // ROLE-BASED DELAY CALCULATION
            delayDays = calculateRoleBasedDelayDays(
              actualMs, targetMs, taskAssignedAtRaw, taskCreatedAtRaw, totalPausedMinutes, isEngineer
            )
          } catch {}
        }

        // Role-based duration calculation
        const actualMs = actualDate ? new Date(actualDate).getTime() : 0
        const durationDays = actualMs > 0
          ? calculateRoleBasedDurationDays(actualMs, taskAssignedAtRaw, taskCreatedAtRaw, totalPausedMinutes, isEngineer)
          : 0

        // Determine the display target date (effective for engineers if recalculated)
        const displayTargetDate = effectiveTargetDate || (targetDate ? new Date(targetDate).toLocaleDateString() : null)

        return {
          taskId: t.taskId ?? t.TaskId ?? t.task_id ?? t.originalTaskId ?? t.original_task_id ?? t.id,
          serialNumber: t.serialNumber ?? t.serial_number ?? t.SerialNumber ?? '',
          partNumber: t.partNumber ?? t.part_number ?? t.PartNumber ?? '',
          description: t.description ?? t.Description ?? '',
          date: actualDate ?? t.createdAt ?? t.created_at ?? '',
          targetDate: displayTargetDate,
          originalTargetDate,
          effectiveTargetDate,
          engineer: getTaskAssignedEngineer(t) || 'Unassigned',
          priority: normalizePriority(t.priorityLevelName ?? t.priority_level_name ?? t.PriorityLevelName ?? t.priority ?? ''),
          delayDays,
          durationDays,
          taskAssignedAt: taskAssignedAtRaw ? new Date(taskAssignedAtRaw).toLocaleDateString() : null,
          taskCreatedAt: taskCreatedAtRaw ? new Date(taskCreatedAtRaw).toLocaleDateString() : null,
          categoryName: t.categoryName ?? t.category_name ?? t.CategoryName ?? ''
        }
      })

    const result = {
      totalTasks,
      completedTasks,
      inProgressTasks,
      pendingTasks,
      blockedTasks,
      onHoldTasks,
      completionRate,
      statusBreakdown,
      categoryDistribution,
      completionTrend: completedTasksList,
      userRole: userRoleHeader || ''
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[api/analytics/completion-rate] Error:', error)

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