import { NextRequest, NextResponse } from 'next/server'
import { requireRole, forwardAuthHeaders, AuthError } from '@/lib/serverAuth'
import { fetchRbacFilteredTasks, fetchRbacFilteredCompletedTasks, normalizeStatus, extractAuthHeader } from '@/lib/rbacFilter'

/**
 * RBAC-aware dashboard metrics endpoint.
 * 
 * CRITICAL FIX: Uses fetchRbacFilteredCompletedTasks for the "Tasks Completed"
 * metric to ensure it matches the Completed Tasks Table count exactly.
 * Non-completed task counts still come from fetchRbacFilteredTasks (the active Tasks table).
 *
 * Previously, the "Tasks Completed" metric was derived from the active Tasks table
 * by filtering for status=2, which caused a discrepancy with the Completed Tasks Table
 * due to stale records and lack of deduplication by originalTaskId.
 */

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '')

/** Normalize role tokens */
function normalizeRole(raw: any): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'number') return String(raw)
  return String(raw).toLowerCase().trim().replace(/[\s\-\_]+/g, '_')
}

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

export async function GET(request: NextRequest) {
  try {
    // Validate authentication and role
    const user = await requireRole(request, [
      'team_leader', 'teamleader', 'director', 'engineer', 'customer', 'customer_personnel', 'shop_tl', 'shoptl', 'shop-tl', 'manager', 'shop_manager', 'shopmanager', 'shop_mgr', 'admin', 'administrator', 'unknown',
      '0', '1', '2', '3', '4', '5', '6', '7', '8'
    ])

    const authHeader = extractAuthHeader(request)
    const cookieHeader = request.headers.get('cookie')

    if (!authHeader) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    // Fetch ALL active tasks and apply RBAC filtering (for non-completed status counts)
    const filteredTasks = await fetchRbacFilteredTasks(authHeader, cookieHeader)

    // CRITICAL FIX: Fetch completed tasks from the /tasks/completed endpoint
    // (the completed_tasks table) for accurate "Tasks Completed" metric.
    // This ensures the dashboard metric matches the Completed Tasks Table count.
    const completedTasksFromTable = await fetchRbacFilteredCompletedTasks(authHeader, cookieHeader)

    // Compute metrics from RBAC-filtered tasks
    const now = new Date()

    let pendingTasks = 0
    let inProgressTasks = 0
    let blockedTasks = 0
    let onHoldTasks = 0
    let cancelledTasks = 0
    let pausedTasks = 0
    let overdueTasks = 0
    const taskStatusBreakdown: Record<string, number> = {}

    // Count non-completed statuses from the active Tasks table
    for (const task of filteredTasks) {
      const status = normalizeStatus(task.status ?? task.Status ?? task.taskStatus ?? 0)

      // Skip completed tasks from active table — we use completedTasksFromTable instead
      if (status === 'Completed') continue

      taskStatusBreakdown[status] = (taskStatusBreakdown[status] || 0) + 1

      switch (status) {
        case 'Pending':
          pendingTasks++
          break
        case 'In Progress':
          inProgressTasks++
          break
        case 'Blocked':
          blockedTasks++
          break
        case 'On Hold':
          onHoldTasks++
          break
        case 'Cancelled':
          cancelledTasks++
          break
        case 'Paused':
          pausedTasks++
          break
        default:
          pendingTasks++ // Count unknown statuses as pending
          break
      }

      // Check overdue (non-completed, non-cancelled, non-paused tasks past target date)
      if (status !== 'Cancelled' && status !== 'Paused') {
        const targetDate = task.targetCompletionDate ?? task.target_completion_date ?? task.TargetCompletionDate ?? null
        if (targetDate) {
          try {
            const target = new Date(targetDate)
            if (target < now) {
              overdueTasks++
            }
          } catch {}
        }
      }
    }

    // Use the completed_tasks table count for the completed metric
    const tasksCompleted = completedTasksFromTable.length
    taskStatusBreakdown['Completed'] = tasksCompleted

    // Total = non-completed (from active table) + completed (from completed_tasks table)
    const nonCompletedTotal = pendingTasks + inProgressTasks + blockedTasks + onHoldTasks + cancelledTasks + pausedTasks
    const totalTasks = nonCompletedTotal + tasksCompleted

    // Compute completion rate
    const completionRate = totalTasks > 0 ? (tasksCompleted / totalTasks) * 100 : 0

    // Compute average delay for completed tasks (from completed_tasks table)
    let totalDelay = 0
    let delayCount = 0
    for (const task of completedTasksFromTable) {
      const actualDate = task.actualCompletionDate ?? task.actual_completion_date ?? task.ActualCompletionDate ?? task.completedAt ?? task.completed_at ?? null
      const targetDate = task.targetCompletionDate ?? task.target_completion_date ?? task.TargetCompletionDate ?? null
      if (actualDate && targetDate) {
        try {
          const actual = new Date(actualDate)
          const target = new Date(targetDate)
          const delayDays = Math.round((actual.getTime() - target.getTime()) / (1000 * 60 * 60 * 24))
          totalDelay += delayDays
          delayCount++
        } catch {}
      }
    }
    const avgDelayDays = delayCount > 0 ? totalDelay / delayCount : 0

    // Build recent tasks (last 10)
    const recentTasks = filteredTasks
      .sort((a, b) => {
        const dateA = new Date(a.createdAt ?? a.created_at ?? a.CreatedAt ?? 0).getTime()
        const dateB = new Date(b.createdAt ?? b.created_at ?? b.CreatedAt ?? 0).getTime()
        return dateB - dateA
      })
      .slice(0, 10)
      .map(t => ({
        taskId: t.taskId ?? t.TaskId ?? t.task_id ?? t.id,
        description: t.description ?? t.Description ?? '',
        status: normalizeStatus(t.status ?? t.Status ?? 0),
        createdByName: t.creatorName ?? t.CreatorName ?? t.creator_name ?? t.created_by_name ?? '',
        createdAt: t.createdAt ?? t.created_at ?? t.CreatedAt ?? '',
        completedAt: t.actualCompletionDate ?? t.actual_completion_date ?? undefined,
        categoryName: t.categoryName ?? t.category_name ?? t.CategoryName ?? undefined,
        priorityName: t.priorityLevelName ?? t.priority_level_name ?? t.PriorityLevelName ?? undefined,
        isCompleted: normalizeStatus(t.status ?? t.Status ?? 0) === 'Completed'
      }))

    const role = normalizeRole(user.role ?? user.role_name ?? (user as any).roleName ?? '')

    // "Pending Tasks" on the dashboard should represent ALL active/non-completed tasks
    // (i.e., everything that is NOT Completed and NOT Cancelled) to match the task table count.
    const allActiveTasks = pendingTasks + inProgressTasks + blockedTasks + onHoldTasks + pausedTasks

    const metrics = {
      totalTasks,
      tasksCompleted,
      pendingTasks: allActiveTasks,
      pendingStatusOnly: pendingTasks,
      inProgressTasks,
      blockedTasks,
      onHoldTasks,
      pausedTasks,
      cancelledTasks,
      overdueTasks,
      completionRate,
      avgDelayDays,
      completionRateFormatted: `${completionRate.toFixed(2)}%`,
      avgDelayFormatted: `${avgDelayDays.toFixed(2)} days`,
      userRole: role,
      userShopId: (user as any).shop_id ?? (user as any).shopId ?? undefined,
      userShopName: (user as any).shop_name ?? (user as any).shopName ?? undefined,
      isRoleBasedView: true,
      recentTasks,
      taskStatusBreakdown
    }

    return NextResponse.json(metrics)
  } catch (error) {
    console.error('[api/dashboard] Error:', error)

    if (error instanceof AuthError) {
      return NextResponse.json(error.body, { status: error.status })
    }

    return NextResponse.json(
      { error: 'Internal server error', message: 'Failed to process request' },
      { status: 500 }
    )
  }
}