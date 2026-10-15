import { NextRequest, NextResponse } from 'next/server'
import { requireRole, AuthError } from '@/lib/serverAuth'
import { fetchRbacFilteredCompletedTasks, getTaskAssignedEngineer } from '@/lib/rbacFilter'
import { resolveAuthorizationHeader } from '@/lib/proxy-auth'

/**
 * RBAC-aware average delay analytics endpoint.
 * 
 * CRITICAL FIX: Uses fetchRbacFilteredCompletedTasks which fetches from the
 * /tasks/completed endpoint (the completed_tasks table) — the SAME data source
 * as the Completed Tasks Table. This ensures delay analytics are computed from
 * the same set of completed tasks shown in the table.
 *
 * DELAY CALCULATION (ROLE-BASED, PAUSE-AWARE):
 * - For Engineers: delay = ActualCompletion - max(EffectiveTarget, TaskAssignedAt) - cappedPauseDuration
 *   Engineers are NOT penalized for delays that occurred before the task was assigned to them.
 *   If assigned after target date, EffectiveTarget is recalculated:
 *     EffectiveTarget = TaskAssignedAt + (OriginalTarget - CreatedAt)
 *   This preserves the original duration and shifts it to start from TaskAssignedAt.
 *   CRITICAL: If TaskAssignedAt is null, engineer gets 0 delay (benefit of the doubt).
 * - For all other roles: delay = ActualCompletion - TargetDate - cappedPauseDuration
 *   Standard delay calculation using target date as reference.
 *
 * TARGET COMPLETION DATE AUTO-UPDATE:
 * When a Team Leader assigns a task AFTER the original target date has passed (even by 1 minute),
 * the TargetCompletionDate is automatically updated in the database by the backend TaskService.
 * Formula: NewTarget = TaskAssignedAt + (OriginalTarget - CreatedAt)
 * This ensures the engineer gets the same working time originally planned.
 *
 * ROLE-BASED DURATION CALCULATION:
 * - For Engineers: Duration = EffectiveCompletion - TaskAssignedAt (Pause-Adjusted)
 *   If TaskAssignedAt is null, duration = 0 (not penalized).
 * - For all other roles: Duration = EffectiveCompletion - CreatedAt (Pause-Adjusted)
 *
 * TL PERMISSION: Reads the `x-tl-can-view-completed-tasks` header.
 * When set to 'false', completed tasks are excluded from the dataset.
 * Since delay analysis is entirely based on completed tasks, this will
 * return zeroed/empty results when the TL cannot view completed tasks.
 */

/** Maximum pause cap in minutes (5 days = 7200 minutes) — matches backend constant */
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
 * Priority: engineerCompletedAt > actualCompletionDate > completedAt
 */
function getActualCompletionDate(t: any): string | null {
  return t.engineerCompletedAt ?? t.engineer_completed_at ?? t.EngineerCompletedAt ??
    t.actualCompletionDate ?? t.actual_completion_date ?? t.ActualCompletionDate ??
    t.completedAt ?? t.completed_at ?? t.CompletedAt ??
    null
}

/**
 * Extract the target completion date from a task.
 * Priority: targetCompletionDate > estimatedCompletionDate
 */
function getTargetCompletionDate(t: any): string | null {
  return t.targetCompletionDate ?? t.target_completion_date ?? t.TargetCompletionDate ??
    t.estimatedCompletionDate ?? t.estimated_completion_date ?? t.EstimatedCompletionDate ??
    null
}

/**
 * Extract TotalPausedDurationMinutes from a completed task.
 * Returns 0 if not available.
 */
function getTotalPausedDurationMinutes(t: any): number {
  const raw = t.totalPausedDurationMinutes ?? t.TotalPausedDurationMinutes ??
    t.total_paused_duration_minutes ?? t.pausedDurationMinutes ??
    t.PausedDurationMinutes ?? t.paused_duration_minutes ?? 0
  const val = Number(raw)
  return Number.isFinite(val) && val >= 0 ? val : 0
}

/**
 * Extract TaskAssignedAt from a completed task.
 */
function getTaskAssignedAt(t: any): string | null {
  return t.taskAssignedAt ?? t.task_assigned_at ?? t.TaskAssignedAt ??
    t.assignedAt ?? t.assigned_at ?? t.AssignedAt ?? null
}

/**
 * Extract TaskCreatedAt from a completed task.
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
 * 
 * For engineers, ALWAYS recalculates when TaskAssignedAt > CreatedAt (even by 1 minute):
 *   EffectiveTarget = TaskAssignedAt + (OriginalTarget - CreatedAt)
 * 
 * This preserves the original working duration and shifts it to start from TaskAssignedAt.
 * The engineer's performance is always evaluated from when they received the task.
 * 
 * EXAMPLE: TC-78
 *   Created At: Mar 24, 2026
 *   Original Target: Apr 13, 2026 (20 days duration)
 *   Task Assigned At: Jun 22, 2026 (assigned 70 days after target!)
 *   Effective Target: Jun 22 + 20 days = Jul 12, 2026
 *   → Engineer now has 20 days from assignment, NOT penalized for the 70-day gap.
 * 
 * EXAMPLE: TC-129
 *   Created At: Jun 9, 2026
 *   Original Target: Jun 29, 2026 (20 days duration)
 *   Task Assigned At: Jun 22, 2026 (assigned 13 days after creation)
 *   Effective Target: Jun 22 + 20 days = Jul 12, 2026
 *   → Engineer gets the full 20 days from their assignment date.
 * 
 * For non-engineer roles, returns the original target date unchanged.
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
    // Recalculate: preserve original duration and shift to start from TaskAssignedAt
    let originalDurationMs = originalTargetMs - createdMs
    // Ensure minimum 1 day duration
    if (originalDurationMs < 86400000) { // 1 day in ms
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
 * 
 * For Engineers: delay = ActualCompletion - max(EffectiveTarget, TaskAssignedAt) - cappedPauseDuration
 *   Engineers are NOT penalized for delays that occurred before the task was assigned to them.
 *   If assigned after target date, EffectiveTarget is recalculated (preserving original duration).
 *   CRITICAL: If TaskAssignedAt is null, returns 0 (engineer not penalized).
 * 
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
  // Apply 5-day pause cap
  const cappedPauseMinutes = Math.min(totalPausedMinutes, MAX_PAUSE_CAP_MINUTES)
  const cappedPauseMs = cappedPauseMinutes * 60 * 1000

  let rawDelayMs: number

  if (isEngineer) {
    // CRITICAL FIX: If TaskAssignedAt is null for an engineer, return 0 delay.
    // Engineers should NOT be penalized when assignment date is not recorded.
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
    // For all other roles: Standard delay = Actual - Target
    rawDelayMs = actualDateMs - targetDateMs
  }

  const effectiveDelayMs = rawDelayMs - cappedPauseMs
  return Math.round(effectiveDelayMs / (1000 * 60 * 60 * 24))
}

/**
 * Calculate role-based duration in days from the appropriate start date to effective completion.
 * For Engineers: EffectiveCompletion - TaskAssignedAt (pause-adjusted)
 *   CRITICAL: If TaskAssignedAt is null, returns 0 (not penalized).
 * For all other roles: EffectiveCompletion - CreatedAt (pause-adjusted)
 */
function calculateRoleBasedDurationDays(
  actualCompletionMs: number,
  taskAssignedAt: string | null,
  taskCreatedAt: string | null,
  totalPausedMinutes: number,
  isEngineer: boolean
): number {
  // Determine start date based on role
  let startMs: number
  if (isEngineer) {
    // Engineers: use TaskAssignedAt only. If null, duration = 0 (not penalized)
    if (!taskAssignedAt) {
      return 0
    }
    startMs = new Date(taskAssignedAt).getTime()
    if (isNaN(startMs)) {
      return 0
    }
  } else {
    // All other roles: use CreatedAt
    startMs = taskCreatedAt ? new Date(taskCreatedAt).getTime() : actualCompletionMs
  }

  // Calculate raw duration
  const rawDurationMs = actualCompletionMs - startMs

  // Apply 5-day pause cap
  const cappedPauseMinutes = Math.min(totalPausedMinutes, MAX_PAUSE_CAP_MINUTES)
  const cappedPauseMs = cappedPauseMinutes * 60 * 1000

  // Effective duration = raw duration - paused time
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

    // Determine user role from request headers for role-based calculations
    const userRoleHeader = request.headers.get('x-user-role') || request.headers.get('x-auth-role') || ''
    const isEngineer = isEngineerRole(userRoleHeader)

    // Fetch completed tasks from the /tasks/completed endpoint
    const completedTasks = canViewCompletedTasks
      ? await fetchRbacFilteredCompletedTasks(authHeader, cookieHeader)
      : []

    // Filter for completed tasks with both actual and target dates
    const completedWithDates = completedTasks.filter(t => {
      const actualDate = getActualCompletionDate(t)
      const targetDate = getTargetCompletionDate(t)
      return actualDate && targetDate
    })

    // Compute delay for each task (ROLE-BASED, PAUSE-AWARE)
    let totalLateDelay = 0
    let totalEarlyDelivery = 0
    let onTime = 0
    let early = 0
    let late = 0
    let totalDurationDays = 0

    const delayBreakdown = completedWithDates.map(t => {
      const actualDate = new Date(getActualCompletionDate(t)!)
      const targetDate = new Date(getTargetCompletionDate(t)!)
      const totalPausedMinutes = getTotalPausedDurationMinutes(t)
      const taskAssignedAtRaw = getTaskAssignedAt(t)
      const taskCreatedAtRaw = getTaskCreatedAt(t)

      // Compute effective target for engineers (recalculated if assigned late)
      const { effectiveTargetMs, wasRecalculated } = getEffectiveTargetDate(
        targetDate.getTime(), taskAssignedAtRaw, taskCreatedAtRaw, isEngineer
      )

      // ROLE-BASED DELAY CALCULATION
      const delayDays = calculateRoleBasedDelayDays(
        actualDate.getTime(),
        targetDate.getTime(),
        taskAssignedAtRaw,
        taskCreatedAtRaw,
        totalPausedMinutes,
        isEngineer
      )

      // ROLE-BASED DURATION: Calculate duration from role-appropriate start date
      const durationDays = calculateRoleBasedDurationDays(
        actualDate.getTime(),
        taskAssignedAtRaw,
        taskCreatedAtRaw,
        totalPausedMinutes,
        isEngineer
      )
      totalDurationDays += durationDays

      let status = 'On Time'
      if (delayDays > 0) {
        late++
        totalLateDelay += delayDays
        status = 'Late Delivery'
      } else if (delayDays < 0) {
        early++
        totalEarlyDelivery += Math.abs(delayDays)
        status = 'Early Delivery'
      } else {
        onTime++
      }

      // Format effective target date for display
      const effectiveTargetDate = isEngineer && wasRecalculated
        ? new Date(effectiveTargetMs).toLocaleDateString()
        : null

      return {
        taskId: t.taskId ?? t.TaskId ?? t.task_id ?? t.originalTaskId ?? t.original_task_id ?? t.id,
        serialNumber: t.serialNumber ?? t.serial_number ?? t.SerialNumber ?? '',
        partNumber: t.partNumber ?? t.part_number ?? t.PartNumber ?? '',
        description: t.description ?? t.Description ?? '',
        delayDays,
        status,
        actualDate: actualDate.toLocaleDateString(),
        targetDate: isEngineer && wasRecalculated
          ? new Date(effectiveTargetMs).toLocaleDateString()
          : targetDate.toLocaleDateString(),
        originalTargetDate: targetDate.toLocaleDateString(),
        effectiveTargetDate,
        engineer: getTaskAssignedEngineer(t) || 'Unassigned',
        priority: normalizePriority(t.priorityLevelName ?? t.priority_level_name ?? t.PriorityLevelName ?? t.priority ?? ''),
        taskAssignedAt: taskAssignedAtRaw ? new Date(taskAssignedAtRaw).toLocaleDateString() : null,
        taskCreatedAt: taskCreatedAtRaw ? new Date(taskCreatedAtRaw).toLocaleDateString() : null,
        durationDays,
        categoryName: t.categoryName ?? t.category_name ?? t.CategoryName ?? ''
      }
    })

    // Sort by delay (most late first)
    delayBreakdown.sort((a, b) => b.delayDays - a.delayDays)

    const totalAnalyzed = completedWithDates.length
    // avgDelayDays = sum of POSITIVE delay days only / count of LATE tasks only
    const avgDelayDays = late > 0 ? totalLateDelay / late : 0
    const avgLateDelay = late > 0 ? totalLateDelay / late : 0
    const avgEarlyDelivery = early > 0 ? totalEarlyDelivery / early : 0
    // ROLE-BASED average duration
    const avgDurationDays = totalAnalyzed > 0 ? totalDurationDays / totalAnalyzed : 0

    // Build per-engineer summary from the FULL delay breakdown
    const perEngineerSummary: Record<string, { onTime: number; early: number; late: number; totalPositiveDelay: number; totalEarlyDelivery: number }> = {}
    for (const item of delayBreakdown) {
      const eng = item.engineer || 'Unassigned'
      if (!perEngineerSummary[eng]) {
        perEngineerSummary[eng] = { onTime: 0, early: 0, late: 0, totalPositiveDelay: 0, totalEarlyDelivery: 0 }
      }
      if (item.delayDays === 0) {
        perEngineerSummary[eng].onTime++
      } else if (item.delayDays < 0) {
        perEngineerSummary[eng].early++
        perEngineerSummary[eng].totalEarlyDelivery += Math.abs(item.delayDays)
      } else {
        perEngineerSummary[eng].late++
        perEngineerSummary[eng].totalPositiveDelay += item.delayDays
      }
    }

    const result = {
      avgDelayDays,
      avgLateDelay,
      avgEarlyDelivery,
      totalAnalyzed,
      onTime,
      early,
      late,
      onTimePercentage: totalAnalyzed > 0 ? ((onTime / totalAnalyzed) * 100).toFixed(1) : '0',
      earlyPercentage: totalAnalyzed > 0 ? ((early / totalAnalyzed) * 100).toFixed(1) : '0',
      latePercentage: totalAnalyzed > 0 ? ((late / totalAnalyzed) * 100).toFixed(1) : '0',
      delayBreakdown: delayBreakdown.slice(0, 50),
      perEngineerSummary,
      avgDurationDays,
      userRole: userRoleHeader || ''
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('[api/analytics/avg-delay] Error:', error)

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