'use client';

import React, { useEffect, useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTimezone } from '@/lib/timezone-context'
import { Badge } from '@/components/ui/badge'
import apiClient from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { useTLPermissions } from '@/lib/tl-permissions-context'
import { useRolePermissions } from '@/hooks/useRolePermissions'

interface WorkItem {
  engineerId?: string | number
  engineerName: string
  openCount: number
  inProgressCount: number
  onHoldCount: number
  blockedCount: number
  rejectedCount: number
  pausedCount: number
  pendingTLApprovalCount: number
  cancelledCount: number
  completedCount: number
  handledCount: number
  activeCount: number // Pending + InProgress + OnHold + Blocked + Paused + PendingTLApproval + Rejected
  capacity: number
  taskBreakdown: TaskBreakdownItem[]
  completedTaskBreakdown: CompletedTaskBreakdownItem[]
  metrics: WorkloadMetrics | null
}

interface TaskBreakdownItem {
  taskId: number
  serialNumber: string
  partNumber: string
  description: string
  status: string
  priority: string
  category: string
  estimatedHours: number
  estimatedCompletionDate?: string
  targetCompletionDate?: string
  createdAt: string
  isOverdue: boolean
  daysRemaining: number
}

interface CompletedTaskBreakdownItem {
  completedTaskId: number
  originalTaskId: number
  serialNumber: string
  partNumber: string
  description: string
  priority: string
  category: string
  completedAt: string
  actualCompletionDate?: string
  targetCompletionDate?: string
  wasOnTime: boolean
  completionDays: number
  hasAmendmentRequest: boolean
  amendmentStatus?: string
}

interface WorkloadMetrics {
  averageTaskCompletionDays: number
  onTimeCompletionRate: number
  overdueTasks: number
  upcomingDeadlines: number
  utilizationRate: number
  performanceRating: string
}

// ─── NEW: Interfaces for the accessible engineer workload summary ────────────

interface CategoryTaskDistribution {
  categoryName: string
  activeCount: number
  completedCount: number
  totalCount: number
  overdueCount: number
  urgentCount: number
}

interface UrgencyBreakdownItem {
  taskId: number
  serialNumber: string
  description: string
  assignedEngineer: string
  status: string
  priority: string
  category: string
  targetCompletionDate?: string
  daysRemaining: number
  isOverdue: boolean
  urgencyLevel: string
  estimatedHours: number
}

interface StatusDistribution {
  statusName: string
  count: number
  percentage: number
}

interface AccessibleWorkloadSummary {
  groupLabel: string
  accessibleEngineerCount: number
  accessibleEngineerNames: string[]
  categoryDistribution: CategoryTaskDistribution[]
  statusDistribution: StatusDistribution[]
  urgencyPrioritizedTasks: UrgencyBreakdownItem[]
  engineerWorkloads: WorkItem[]
  totalActiveTasks: number
  totalCompletedTasks: number
  totalAssignedTasks: number
  totalOverdueTasks: number
  totalUrgentTasks: number
  averageWorkloadPercentage: number
}

// ─── Chart view mode ─────────────────────────────────────────────────────────

type ChartView = 'category' | 'status' | 'engineer'

export default function EngineerWorkload({ compact = false }: { compact?: boolean }) {
  const { user, token, directorPermissions } = useAuth()
  const { formatDate } = useTimezone()
  const [items, setItems] = useState<WorkItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedEngineer, setExpandedEngineer] = useState<string | null>(null)
  const [chartView, setChartView] = useState<ChartView>('engineer')

  // Master-detail state for the "By Category" view
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [expandedCategoryEngineer, setExpandedCategoryEngineer] = useState<string | null>(null)

  // NEW: Accessible workload summary from the new endpoint
  const [accessibleSummary, setAccessibleSummary] = useState<AccessibleWorkloadSummary | null>(null)

  // Permission checks — safety net in case the parent doesn't gate rendering
  const { tlPermissions, isLoadingTLPermissions } = useTLPermissions()
  const { canViewEngineerWorkload: matrixCanViewWorkload } = useRolePermissions()

  const userRole = (user?.role ?? '').toLowerCase().trim().replace(/[\s\-_]+/g, '')
  const isTeamLeaderRole = userRole === 'teamleader' || userRole === 'team_leader' || userRole === '0'
  const isDirectorRole = userRole === 'director' || userRole === '1'

  const isPermissionDenied = useMemo(() => {
    // Director: check director-specific override
    if (isDirectorRole && directorPermissions && directorPermissions.canViewEngineerWorkload === false) {
      return true
    }
    // Team Leader: check TL-specific override
    if (isTeamLeaderRole && tlPermissions && tlPermissions.canViewEngineerWorkload === false) {
      return true
    }
    // Fallback to role matrix
    if (!isDirectorRole && !matrixCanViewWorkload) {
      return true
    }
    return false
  }, [isDirectorRole, directorPermissions, isTeamLeaderRole, tlPermissions, matrixCanViewWorkload])

  // If permissions deny access, render nothing (parent should also gate, but this is a safety net)
  if (isPermissionDenied && !isLoadingTLPermissions) {
    return null
  }

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        // FIXED: Ensure proper authentication headers
        const authHeaders: Record<string, string> = {
          'Content-Type': 'application/json'
        }
        
        // Use token from auth context
        if (token) {
          authHeaders['Authorization'] = `Bearer ${token}`
        }
        
        let workloadData: WorkItem[] = []
        
        try {
          // Try the workload API endpoint first with proper auth
          const workloadRes = await fetch('/api/workload', {
            credentials: 'include',
            headers: authHeaders
          })
          
          if (workloadRes.ok) {
            const workloadResult = await workloadRes.json()
            const workloadList = Array.isArray(workloadResult) ? workloadResult : workloadResult?.data ?? workloadResult?.workload ?? []
            
            if (workloadList.length > 0) {
              // FIXED: Trust the backend workload data directly
              workloadData = workloadList.map((item: any) => {
                const engineerName = item.engineerName ?? item.engineer_name ?? item.name ?? 'Unknown'
                
                const openCount = Number(item.openCount ?? item.open_count ?? item.pending ?? 0)
                const inProgressCount = Number(item.inProgressCount ?? item.in_progress_count ?? item.inProgress ?? 0)
                const onHoldCount = Number(item.onHoldCount ?? item.on_hold_count ?? item.onHold ?? 0)
                const blockedCount = Number(item.blockedCount ?? item.blocked_count ?? item.blocked ?? 0)
                const rejectedCount = Number(item.rejectedCount ?? item.rejected_count ?? item.rejected ?? 0)
                const pausedCount = Number(item.pausedCount ?? item.paused_count ?? item.paused ?? 0)
                const pendingTLApprovalCount = Number(item.pendingTLApprovalCount ?? item.pending_tl_approval_count ?? 0)
                const cancelledCount = Number(item.cancelledCount ?? item.cancelled_count ?? 0)
                const completedCount = Number(item.completedCount ?? item.completed_count ?? item.completed ?? 0)
                const activeCount = Number(item.activeCount ?? item.active_count ?? item.active ?? 0)
                const handledCount = Number(item.handledCount ?? item.handled_count ?? item.total ?? 0)
                
                const computedActiveCount = openCount + inProgressCount + onHoldCount + blockedCount + pausedCount + pendingTLApprovalCount + rejectedCount
                const finalActiveCount = activeCount > 0 ? activeCount : computedActiveCount
                
                // FIXED: Deduplicate taskBreakdown by taskId
                const rawTaskBreakdown: TaskBreakdownItem[] = item.taskBreakdown ?? []
                const seenTaskIds = new Set<number>()
                const dedupedTaskBreakdown: TaskBreakdownItem[] = []
                for (const task of rawTaskBreakdown) {
                  const tid = Number(task.taskId ?? 0)
                  if (tid > 0 && seenTaskIds.has(tid)) continue
                  if (tid > 0) seenTaskIds.add(tid)
                  dedupedTaskBreakdown.push(task)
                }

                // FIXED: Deduplicate completedTaskBreakdown by originalTaskId
                const rawCompletedBreakdown: CompletedTaskBreakdownItem[] = item.completedTaskBreakdown ?? []
                const completedByOrigId = new Map<number, CompletedTaskBreakdownItem>()
                for (const ct of rawCompletedBreakdown) {
                  const origId = Number(ct.originalTaskId ?? 0)
                  if (origId <= 0) {
                    completedByOrigId.set(-(completedByOrigId.size + 1), ct)
                    continue
                  }
                  const existing = completedByOrigId.get(origId)
                  if (!existing) {
                    completedByOrigId.set(origId, ct)
                  } else {
                    const existingTime = new Date(existing.completedAt || 0).getTime()
                    const newTime = new Date(ct.completedAt || 0).getTime()
                    if (newTime > existingTime) {
                      completedByOrigId.set(origId, ct)
                    } else if (newTime === existingTime && Number(ct.completedTaskId ?? 0) > Number(existing.completedTaskId ?? 0)) {
                      completedByOrigId.set(origId, ct)
                    }
                  }
                }
                const dedupedCompletedBreakdown = Array.from(completedByOrigId.values())

                const dedupedCompletedCount = dedupedCompletedBreakdown.length
                const derivedHandledCount = finalActiveCount + dedupedCompletedCount + cancelledCount

                return {
                  engineerId: item.engineerId ?? item.engineer_id ?? item.id,
                  engineerName,
                  openCount,
                  inProgressCount,
                  onHoldCount,
                  blockedCount,
                  rejectedCount,
                  pausedCount,
                  pendingTLApprovalCount,
                  cancelledCount,
                  completedCount: dedupedCompletedCount,
                  handledCount: derivedHandledCount,
                  activeCount: finalActiveCount,
                  capacity: Number(item.capacity ?? 12),
                  taskBreakdown: dedupedTaskBreakdown,
                  completedTaskBreakdown: dedupedCompletedBreakdown,
                  metrics: item.metrics ?? null
                }
              })
            }
          } else {
            if (process.env.NODE_ENV === 'development') {
              console.debug('⚠️ EngineerWorkload - Workload API returned error:', workloadRes.status)
            }
            if (workloadRes.status === 401) {
              setError('Authentication required. Please log in again.')
              return
            }
          }
        } catch (workloadError) {
          if (process.env.NODE_ENV === 'development') {
            console.debug('⚠️ EngineerWorkload - Workload API failed:', workloadError)
          }
        }
        
        // FIXED: If workload API failed, aggregate from current tasks data with proper auth
        if (workloadData.length === 0) {
          const tasksRes = await fetch('/api/tasks', {
            credentials: 'include',
            headers: authHeaders
          })
          
          if (!tasksRes.ok) {
            if (tasksRes.status === 401) {
              setError('Authentication required. Please log in again.')
              return
            }
            const userMsg = tasksRes.status >= 500 ? 'Cannot reach the server. Please try again later.' : `Failed to load tasks: ${tasksRes.status}`
            setError(userMsg)
            return
          }
          
          const tasksData = await tasksRes.json()
          const tasksList = Array.isArray(tasksData) ? tasksData : tasksData?.tasks ?? tasksData?.data ?? []
          
          // FIXED: Aggregate tasks by assigned engineer with proper status handling
          const grouped: Record<string, WorkItem> = {}
          
          tasksList.forEach((task: any) => {
            let engineerRaw = task.assigned_engineer ?? task.assigned ?? task.assignedEngineer ?? task.AssignedEngineer ?? 'Unassigned'
            let engineerName = typeof engineerRaw === 'string' ? engineerRaw.trim() : String(engineerRaw)
            
            if (engineerName.includes(',')) {
              const engineers = engineerName.split(',').map((e: string) => e.trim()).filter((e: string) => e.length > 0)
              engineers.forEach((eng: string) => processTaskForEngineer(task, eng, grouped))
            } else {
              processTaskForEngineer(task, engineerName, grouped)
            }
          })
          
          function processTaskForEngineer(task: any, engineerName: string, grouped: Record<string, WorkItem>) {
            if (!engineerName || engineerName.toLowerCase() === 'undefined' || engineerName.toLowerCase() === 'null' || engineerName.trim() === '') {
              engineerName = 'Unassigned'
            }
            
            const key = engineerName
            if (!grouped[key]) {
              grouped[key] = {
                engineerName: engineerName,
                openCount: 0,
                inProgressCount: 0,
                onHoldCount: 0,
                blockedCount: 0,
                rejectedCount: 0,
                pausedCount: 0,
                pendingTLApprovalCount: 0,
                cancelledCount: 0,
                completedCount: 0,
                handledCount: 0,
                activeCount: 0,
                capacity: 12,
                taskBreakdown: [],
                completedTaskBreakdown: [],
                metrics: null
              }
            }
            
            const rawStatus = task.status ?? task.Status ?? task.taskStatus ?? 0
            let normalizedStatus = 'Pending'
            
            if (typeof rawStatus === 'number') {
              switch (rawStatus) {
                case 0: normalizedStatus = 'Pending'; break
                case 1: normalizedStatus = 'In Progress'; break
                case 2: normalizedStatus = 'Completed'; break
                case 3: normalizedStatus = 'Blocked'; break
                case 4: normalizedStatus = 'On Hold'; break
                case 5: normalizedStatus = 'Rejected'; break
                case 6: normalizedStatus = 'Cancelled'; break
                case 7: normalizedStatus = 'Paused'; break
                case 8: normalizedStatus = 'PendingTLApproval'; break
                default: normalizedStatus = 'Pending'
              }
            } else {
              const statusStr = String(rawStatus).toLowerCase().replace(/[_\s-]+/g, '')
              switch (statusStr) {
                case 'pending': normalizedStatus = 'Pending'; break
                case 'inprogress': normalizedStatus = 'In Progress'; break
                case 'completed': normalizedStatus = 'Completed'; break
                case 'blocked': normalizedStatus = 'Blocked'; break
                case 'onhold': normalizedStatus = 'On Hold'; break
                case 'rejected': normalizedStatus = 'Rejected'; break
                case 'cancelled': normalizedStatus = 'Cancelled'; break
                case 'paused': normalizedStatus = 'Paused'; break
                case 'pendingtlapproval': normalizedStatus = 'PendingTLApproval'; break
                default: normalizedStatus = 'Pending'
              }
            }
            
            switch (normalizedStatus) {
              case 'Completed':
                grouped[key].completedCount += 1
                break
              case 'In Progress':
                grouped[key].inProgressCount += 1
                grouped[key].activeCount += 1
                break
              case 'On Hold':
                grouped[key].onHoldCount += 1
                grouped[key].activeCount += 1
                break
              case 'Blocked':
                grouped[key].blockedCount += 1
                grouped[key].activeCount += 1
                break
              case 'Rejected':
                grouped[key].rejectedCount += 1
                grouped[key].activeCount += 1
                break
              case 'Paused':
                grouped[key].pausedCount += 1
                grouped[key].activeCount += 1
                break
              case 'PendingTLApproval':
                grouped[key].pendingTLApprovalCount += 1
                grouped[key].activeCount += 1
                break
              case 'Cancelled':
                grouped[key].cancelledCount += 1
                break
              default: // Pending
                grouped[key].openCount += 1
                grouped[key].activeCount += 1
                break
            }
            
            grouped[key].handledCount = grouped[key].activeCount + grouped[key].completedCount + grouped[key].cancelledCount
          }
          
          workloadData = Object.values(grouped)
            .filter((item) => {
              const name = (item.engineerName ?? '').toString().trim()
              return name.length > 0 && (item.handledCount ?? 0) > 0
            })
            .sort((a, b) => (b.activeCount ?? 0) - (a.activeCount ?? 0))
        }
        
        if (mounted) {
          if (workloadData.length === 0) {
            setItems([])
          } else {
            const seen = new Set<string>()
            const uniqueItems = workloadData.filter((item) => {
              const name = item.engineerName || 'Unknown'
              if (seen.has(name)) return false
              seen.add(name)
              return true
            })
            
            setItems(uniqueItems)

            // NEW: Try to fetch accessible engineer workload summary
            // Pass all engineer names to the accessible endpoint
            try {
              const engineerNames = uniqueItems.map(i => i.engineerName).filter(n => n && n !== 'Unknown' && n !== 'Unassigned')
              if (engineerNames.length > 0) {
                const queryParams = engineerNames.map(n => `engineers=${encodeURIComponent(n)}`).join('&')
                const accessibleRes = await fetch(`/api/workload/accessible?${queryParams}`, {
                  credentials: 'include',
                  headers: authHeaders
                })
                if (accessibleRes.ok) {
                  const accessibleData = await accessibleRes.json()
                  if (mounted) {
                    setAccessibleSummary(accessibleData)
                  }
                }
              }
            } catch {
              // Accessible endpoint not available — use client-side computation
              if (mounted) {
                setAccessibleSummary(buildClientSideAccessibleSummary(uniqueItems))
              }
            }
          }
        }
        
      } catch (err: any) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('❌ EngineerWorkload - Load error (debug):', err)
        }
        if (mounted) {
          const isNetwork = err?.message?.toLowerCase?.().includes('failed to fetch') || err instanceof TypeError
          const statusIsServer = err?.status && Number(err.status) >= 500
          setError(isNetwork || statusIsServer ? 'Cannot reach the server. Please try again later.' : 'Failed to load workload data.')
          setItems([])
        }
      } finally {
        if (mounted) setLoading(false)
      }
    }
    
    load()
    return () => { mounted = false }
  }, [user, token])

  // ─── Client-side fallback: build accessible summary from workload items ────

  function buildClientSideAccessibleSummary(workloadItems: WorkItem[]): AccessibleWorkloadSummary {
    const engineerItems = workloadItems.filter(item => {
      const name = (item.engineerName ?? '').trim().toLowerCase()
      return name && name !== 'unassigned' && name !== 'unknown' && name !== 'n/a'
    })

    // Build category distribution from task breakdowns
    const allActiveTasks = engineerItems.flatMap(w => w.taskBreakdown ?? [])
    const allCompletedTasks = engineerItems.flatMap(w => w.completedTaskBreakdown ?? [])

    const categoryMap = new Map<string, CategoryTaskDistribution>()
    for (const task of allActiveTasks) {
      const cat = task.category || 'Unknown'
      const existing = categoryMap.get(cat) || { categoryName: cat, activeCount: 0, completedCount: 0, totalCount: 0, overdueCount: 0, urgentCount: 0 }
      existing.activeCount += 1
      existing.totalCount += 1
      if (task.isOverdue) existing.overdueCount += 1
      if (task.daysRemaining >= 0 && task.daysRemaining <= 3) existing.urgentCount += 1
      categoryMap.set(cat, existing)
    }
    for (const task of allCompletedTasks) {
      const cat = task.category || 'Unknown'
      const existing = categoryMap.get(cat) || { categoryName: cat, activeCount: 0, completedCount: 0, totalCount: 0, overdueCount: 0, urgentCount: 0 }
      existing.completedCount += 1
      existing.totalCount += 1
      categoryMap.set(cat, existing)
    }

    // Build status distribution
    const statusMap: Record<string, number> = {
      'Pending': engineerItems.reduce((s, w) => s + (w.openCount || 0), 0),
      'In Progress': engineerItems.reduce((s, w) => s + (w.inProgressCount || 0), 0),
      'On Hold': engineerItems.reduce((s, w) => s + (w.onHoldCount || 0), 0),
      'Blocked': engineerItems.reduce((s, w) => s + (w.blockedCount || 0), 0),
      'Paused': engineerItems.reduce((s, w) => s + (w.pausedCount || 0), 0),
      'Pending TL': engineerItems.reduce((s, w) => s + (w.pendingTLApprovalCount || 0), 0),
      'Rejected': engineerItems.reduce((s, w) => s + (w.rejectedCount || 0), 0),
      'Cancelled': engineerItems.reduce((s, w) => s + (w.cancelledCount || 0), 0),
      'Completed': engineerItems.reduce((s, w) => s + (w.completedCount || 0), 0),
    }
    const totalStatusCount = Object.values(statusMap).reduce((s, c) => s + c, 0)

    // Build urgency list from active tasks
    const urgencyTasks: UrgencyBreakdownItem[] = allActiveTasks.map(t => {
      const engineer = engineerItems.find(w => (w.taskBreakdown ?? []).some(tb => tb.taskId === t.taskId))?.engineerName ?? 'Unknown'
      return {
        taskId: t.taskId,
        serialNumber: t.serialNumber,
        description: t.description,
        assignedEngineer: engineer,
        status: t.status,
        priority: t.priority,
        category: t.category,
        targetCompletionDate: t.targetCompletionDate ?? t.estimatedCompletionDate,
        daysRemaining: t.daysRemaining,
        isOverdue: t.isOverdue,
        urgencyLevel: getUrgencyLevel(t.daysRemaining, t.isOverdue),
        estimatedHours: t.estimatedHours
      }
    }).sort((a, b) => getUrgencySortOrder(a.urgencyLevel) - getUrgencySortOrder(b.urgencyLevel) || a.daysRemaining - b.daysRemaining)

    return {
      groupLabel: 'Accessible Engineers',
      accessibleEngineerCount: engineerItems.length,
      accessibleEngineerNames: engineerItems.map(w => w.engineerName),
      categoryDistribution: Array.from(categoryMap.values()).sort((a, b) => b.activeCount - a.activeCount),
      statusDistribution: Object.entries(statusMap)
        .filter(([, count]) => count > 0)
        .map(([name, count]) => ({
          statusName: name,
          count,
          percentage: totalStatusCount > 0 ? Math.round(count / totalStatusCount * 10000) / 100 : 0
        }))
        .sort((a, b) => b.count - a.count),
      urgencyPrioritizedTasks: urgencyTasks,
      engineerWorkloads: engineerItems,
      totalActiveTasks: engineerItems.reduce((s, w) => s + (w.activeCount || 0), 0),
      totalCompletedTasks: engineerItems.reduce((s, w) => s + (w.completedCount || 0), 0),
      totalAssignedTasks: engineerItems.reduce((s, w) => s + (w.handledCount || 0), 0),
      totalOverdueTasks: urgencyTasks.filter(u => u.isOverdue).length,
      totalUrgentTasks: urgencyTasks.filter(u => u.urgencyLevel === 'Critical' || u.urgencyLevel === 'High').length,
      averageWorkloadPercentage: 0
    }
  }

  function getUrgencyLevel(daysRemaining: number, isOverdue: boolean): string {
    if (isOverdue) return 'Overdue'
    if (daysRemaining <= 1) return 'Critical'
    if (daysRemaining <= 3) return 'High'
    if (daysRemaining <= 7) return 'Medium'
    return 'Low'
  }

  function getUrgencySortOrder(level: string): number {
    switch (level) {
      case 'Overdue': return 0
      case 'Critical': return 1
      case 'High': return 2
      case 'Medium': return 3
      case 'Low': return 4
      default: return 5
    }
  }

  // FIXED: Separate engineer-only items from team leaders and unassigned entries.
  const engineerOnlyItems = useMemo(() => {
    return items.filter((item) => {
      const name = (item.engineerName ?? '').toString().trim().toLowerCase()
      if (!name || name === 'unassigned' || name === 'unknown' || name === 'n/a') return false
      if (name.includes('team leader') || name.includes('teamleader') || name.includes('team_leader')) return false
      if (isTeamLeaderRole && user?.name && name === user.name.trim().toLowerCase()) return false
      return true
    })
  }, [items, isTeamLeaderRole, user?.name])

  const finalItems = items

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-start justify-between">
            <div className="text-black font-bold">Engineer Workload</div>
            <div className="text-xs text-muted-foreground">Loading...</div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-gray-500">Loading workload data...</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-start justify-between">
            <div className="text-black font-bold">Engineer Workload</div>
            <div className="text-xs text-red-600">Error</div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-red-600">{error}</div>
        </CardContent>
      </Card>
    )
  }

  if (finalItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-start justify-between">
            <div className="text-black font-bold">Engineer Workload</div>
            <div className="text-xs text-muted-foreground">No data</div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="text-sm text-gray-500">No engineers with assigned tasks found</div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ─── Use accessible summary data (from server or client-side fallback) ─────

  const summary = accessibleSummary ?? buildClientSideAccessibleSummary(engineerOnlyItems)
  const categoryDist = summary.categoryDistribution ?? []
  const statusDist = summary.statusDistribution ?? []
  const urgencyTasks = summary.urgencyPrioritizedTasks ?? []

  // ─── Chart rendering helpers ───────────────────────────────────────────────

  // Category chart colors (distinct, accessible palette)
  const CATEGORY_COLORS = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
    '#84cc16', '#e11d48', '#0ea5e9', '#d946ef', '#a3e635'
  ]

  // Status chart colors
  const STATUS_COLORS: Record<string, string> = {
    'Pending': '#f59e0b',
    'In Progress': '#3b82f6',
    'On Hold': '#8b5cf6',
    'Blocked': '#ef4444',
    'Paused': '#6b7280',
    'Pending TL': '#f97316',
    'Pending TL Approval': '#f97316',
    'Rejected': '#dc2626',
    'Cancelled': '#9ca3af',
    'Completed': '#22c55e'
  }

  // Urgency colors
  const URGENCY_COLORS: Record<string, string> = {
    'Overdue': '#dc2626',
    'Critical': '#ef4444',
    'High': '#f59e0b',
    'Medium': '#3b82f6',
    'Low': '#22c55e'
  }

  // ─── Category Distribution Chart (master-detail layout) ────────────────────
  //
  // Modern layout: a master list of categories (with active/completed bars and
  // badges) on the left, and a side panel on the right that shows the list of
  // engineers working in the currently selected category along with their per-
  // category task counts and a drill-down into the individual tasks.

  const renderCategoryChart = () => {
    if (categoryDist.length === 0) {
      return <div className="text-sm text-gray-500 py-4 text-center">No category data available</div>
    }

    // Build a map: categoryName -> list of engineers with their per-category
    // active/completed task counts and task lists. Derived from engineerOnlyItems.
    type EngineerCategoryDetail = {
      engineerName: string
      activeCount: number
      completedCount: number
      overdueCount: number
      urgentCount: number
      totalCount: number
      activeTasks: TaskBreakdownItem[]
      completedTasks: CompletedTaskBreakdownItem[]
    }

    const engineersByCategory = new Map<string, EngineerCategoryDetail[]>()
    for (const eng of engineerOnlyItems) {
      const catMap = new Map<string, EngineerCategoryDetail>()

      for (const task of eng.taskBreakdown ?? []) {
        const cat = task.category || 'Unknown'
        let entry = catMap.get(cat)
        if (!entry) {
          entry = {
            engineerName: eng.engineerName,
            activeCount: 0,
            completedCount: 0,
            overdueCount: 0,
            urgentCount: 0,
            totalCount: 0,
            activeTasks: [],
            completedTasks: [],
          }
          catMap.set(cat, entry)
        }
        entry.activeCount += 1
        entry.totalCount += 1
        if (task.isOverdue) entry.overdueCount += 1
        if (!task.isOverdue && task.daysRemaining >= 0 && task.daysRemaining <= 3) entry.urgentCount += 1
        entry.activeTasks.push(task)
      }

      for (const task of eng.completedTaskBreakdown ?? []) {
        const cat = task.category || 'Unknown'
        let entry = catMap.get(cat)
        if (!entry) {
          entry = {
            engineerName: eng.engineerName,
            activeCount: 0,
            completedCount: 0,
            overdueCount: 0,
            urgentCount: 0,
            totalCount: 0,
            activeTasks: [],
            completedTasks: [],
          }
          catMap.set(cat, entry)
        }
        entry.completedCount += 1
        entry.totalCount += 1
        entry.completedTasks.push(task)
      }

      for (const [cat, entry] of catMap.entries()) {
        const list = engineersByCategory.get(cat) ?? []
        list.push(entry)
        engineersByCategory.set(cat, list)
      }
    }

    // Sort engineers in each category by active count (desc) then total
    for (const [cat, list] of engineersByCategory.entries()) {
      list.sort((a, b) => (b.activeCount - a.activeCount) || (b.totalCount - a.totalCount) || a.engineerName.localeCompare(b.engineerName))
      engineersByCategory.set(cat, list)
    }

    const maxCatCount = Math.max(1, ...categoryDist.map(c => Math.max(c.activeCount, c.completedCount)))
    const barMaxWidth = 220

    // Select the first category with data as the default if none is selected,
    // or if the previously selected one is no longer present.
    const availableCategoryNames = categoryDist.map(c => c.categoryName)
    const effectiveSelected =
      selectedCategory && availableCategoryNames.includes(selectedCategory)
        ? selectedCategory
        : (availableCategoryNames[0] ?? null)

    const selectedEngineers = effectiveSelected ? (engineersByCategory.get(effectiveSelected) ?? []) : []
    const selectedCatInfo = effectiveSelected ? categoryDist.find(c => c.categoryName === effectiveSelected) : null
    const selectedColor = effectiveSelected
      ? CATEGORY_COLORS[availableCategoryNames.indexOf(effectiveSelected) % CATEGORY_COLORS.length]
      : '#3b82f6'

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* ── Master: Category list with bars ───────────────────────────── */}
        <div className="lg:col-span-5">
          <div className="text-xs font-semibold text-gray-600 mb-2">Categories</div>
          <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
            {categoryDist.map((cat, idx) => {
              const activeWidth = maxCatCount > 0 ? Math.max(cat.activeCount > 0 ? 4 : 0, (cat.activeCount / maxCatCount) * barMaxWidth) : 0
              const completedWidth = maxCatCount > 0 ? Math.max(cat.completedCount > 0 ? 4 : 0, (cat.completedCount / maxCatCount) * barMaxWidth) : 0
              const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
              const isSelected = effectiveSelected === cat.categoryName
              const engineerCount = (engineersByCategory.get(cat.categoryName) ?? []).length

              return (
                <button
                  key={cat.categoryName}
                  type="button"
                  onClick={() => setSelectedCategory(cat.categoryName)}
                  className={`w-full text-left p-2 rounded-md border transition-all ${
                    isSelected
                      ? 'bg-blue-50 border-blue-300 shadow-sm'
                      : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                  }`}
                  title={`View engineers for ${cat.categoryName}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-xs font-semibold text-gray-800 truncate" title={cat.categoryName}>
                        {cat.categoryName}
                      </span>
                    </div>
                    <span className="text-[10px] text-gray-500 whitespace-nowrap">
                      {engineerCount} {engineerCount === 1 ? 'engineer' : 'engineers'}
                    </span>
                  </div>
                  {/* Active bar */}
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <div
                      className="h-3 rounded-sm transition-all duration-300"
                      style={{ width: activeWidth, backgroundColor: color, opacity: 0.85 }}
                    />
                    {cat.activeCount > 0 && (
                      <span className="text-[10px] font-semibold text-gray-600">{cat.activeCount} active</span>
                    )}
                    {cat.overdueCount > 0 && (
                      <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">
                        {cat.overdueCount} overdue
                      </Badge>
                    )}
                    {cat.urgentCount > 0 && (
                      <Badge className="text-[9px] px-1 py-0 h-4 bg-amber-500 text-white">
                        {cat.urgentCount} urgent
                      </Badge>
                    )}
                  </div>
                  {/* Completed bar */}
                  <div className="flex items-center gap-1.5">
                    <div
                      className="h-2.5 rounded-sm transition-all duration-300"
                      style={{ width: completedWidth, backgroundColor: '#22c55e', opacity: 0.6 }}
                    />
                    {cat.completedCount > 0 && (
                      <span className="text-[10px] text-green-600">{cat.completedCount} done</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-500">
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-blue-500 opacity-85" /> Active</div>
            <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-green-500 opacity-60" /> Completed</div>
            <div className="text-[10px] text-gray-400 italic">Click a category to view engineers →</div>
          </div>
        </div>

        {/* ── Detail: Engineers working in the selected category ─────────── */}
        <div className="lg:col-span-7">
          {effectiveSelected && selectedCatInfo ? (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 border-b border-gray-200 bg-gradient-to-r from-slate-50 to-white">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: selectedColor }} />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-gray-900 truncate" title={effectiveSelected}>
                        {effectiveSelected}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        {selectedEngineers.length} {selectedEngineers.length === 1 ? 'engineer' : 'engineers'} · {selectedCatInfo.activeCount} active · {selectedCatInfo.completedCount} completed
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {selectedCatInfo.overdueCount > 0 && (
                      <Badge variant="destructive" className="text-[10px]">
                        {selectedCatInfo.overdueCount} overdue
                      </Badge>
                    )}
                    {selectedCatInfo.urgentCount > 0 && (
                      <Badge className="text-[10px] bg-amber-500 text-white">
                        {selectedCatInfo.urgentCount} urgent
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Engineer list */}
              <div className="max-h-[380px] overflow-y-auto">
                {selectedEngineers.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-gray-500">
                    No engineers currently working in this category.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100">
                    {selectedEngineers.map((eng) => {
                      const expandKey = `${effectiveSelected}::${eng.engineerName}`
                      const isExpanded = expandedCategoryEngineer === expandKey
                      const initials = eng.engineerName
                        .split(/\s+/)
                        .map(s => s.charAt(0).toUpperCase())
                        .slice(0, 2)
                        .join('')

                      return (
                        <li key={expandKey} className="hover:bg-slate-50/80 transition-colors">
                          <button
                            type="button"
                            className="w-full text-left px-4 py-2.5 flex items-center gap-3"
                            onClick={() => setExpandedCategoryEngineer(isExpanded ? null : expandKey)}
                            title={isExpanded ? 'Hide tasks' : 'Show tasks'}
                          >
                            {/* Avatar */}
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0"
                              style={{ backgroundColor: selectedColor }}
                            >
                              {initials || '?'}
                            </div>

                            {/* Name + counts */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-medium text-gray-900 truncate" title={eng.engineerName}>
                                  {eng.engineerName}
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {eng.activeCount > 0 && (
                                    <Badge className="text-[10px] bg-blue-100 text-blue-800 hover:bg-blue-100">
                                      {eng.activeCount} active
                                    </Badge>
                                  )}
                                  {eng.completedCount > 0 && (
                                    <Badge className="text-[10px] bg-green-100 text-green-800 hover:bg-green-100">
                                      {eng.completedCount} done
                                    </Badge>
                                  )}
                                  {eng.overdueCount > 0 && (
                                    <Badge variant="destructive" className="text-[10px]">
                                      {eng.overdueCount} overdue
                                    </Badge>
                                  )}
                                  {eng.urgentCount > 0 && (
                                    <Badge className="text-[10px] bg-amber-500 text-white hover:bg-amber-500">
                                      {eng.urgentCount} urgent
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <div className="text-[10px] text-gray-500 mt-0.5">
                                {eng.totalCount} total task{eng.totalCount === 1 ? '' : 's'} in this category · Click to {isExpanded ? 'hide' : 'view'} details
                              </div>
                            </div>
                          </button>

                          {/* Expanded task details */}
                          {isExpanded && (
                            <div className="px-4 pb-3 pt-1 bg-slate-50/60 border-t border-slate-100">
                              {eng.activeTasks.length > 0 && (
                                <div className="mb-2">
                                  <div className="text-[10px] font-semibold text-blue-800 mb-1 uppercase tracking-wide">
                                    Active Tasks ({eng.activeTasks.length})
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-[11px]">
                                      <thead>
                                        <tr className="bg-blue-100 text-blue-900">
                                          <th className="text-left px-1.5 py-1">Task ID</th>
                                          <th className="text-left px-1.5 py-1">Description</th>
                                          <th className="text-left px-1.5 py-1">Status</th>
                                          <th className="text-left px-1.5 py-1">Priority</th>
                                          <th className="text-left px-1.5 py-1">Target</th>
                                          <th className="text-right px-1.5 py-1">Days Left</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {[...eng.activeTasks]
                                          .sort((a, b) => a.daysRemaining - b.daysRemaining)
                                          .map((task, idx) => (
                                            <tr
                                              key={`cat-active-${task.taskId}-${idx}`}
                                              className={task.isOverdue ? 'bg-red-50' : task.daysRemaining >= 0 && task.daysRemaining <= 3 ? 'bg-amber-50' : 'bg-white'}
                                            >
                                              <td className="px-1.5 py-1 font-mono">{task.taskId}</td>
                                              <td className="px-1.5 py-1 max-w-[200px] truncate" title={task.description}>
                                                {task.description.length > 50 ? task.description.substring(0, 50) + '…' : task.description}
                                              </td>
                                              <td className="px-1.5 py-1">
                                                <Badge variant={task.isOverdue ? 'destructive' : 'secondary'} className="text-[9px]">
                                                  {task.status}
                                                </Badge>
                                              </td>
                                              <td className="px-1.5 py-1">{task.priority}</td>
                                              <td className="px-1.5 py-1">
                                                {task.targetCompletionDate
                                                  ? formatDate(task.targetCompletionDate)
                                                  : task.estimatedCompletionDate
                                                  ? formatDate(task.estimatedCompletionDate)
                                                  : 'N/A'}
                                              </td>
                                              <td
                                                className="text-right px-1.5 py-1 font-semibold"
                                                style={{
                                                  color: task.isOverdue
                                                    ? '#dc2626'
                                                    : task.daysRemaining >= 0 && task.daysRemaining <= 3
                                                    ? '#f59e0b'
                                                    : '#22c55e',
                                                }}
                                              >
                                                {task.isOverdue ? `${Math.abs(task.daysRemaining)}d late` : `${task.daysRemaining}d`}
                                              </td>
                                            </tr>
                                          ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {eng.completedTasks.length > 0 && (
                                <div>
                                  <div className="text-[10px] font-semibold text-green-800 mb-1 uppercase tracking-wide">
                                    Completed Tasks ({eng.completedTasks.length})
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-[11px]">
                                      <thead>
                                        <tr className="bg-green-100 text-green-900">
                                          <th className="text-left px-1.5 py-1">Task ID</th>
                                          <th className="text-left px-1.5 py-1">Description</th>
                                          <th className="text-left px-1.5 py-1">Completed</th>
                                          <th className="text-left px-1.5 py-1">On Time</th>
                                          <th className="text-right px-1.5 py-1">Days</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {eng.completedTasks.map((task, idx) => (
                                          <tr
                                            key={`cat-completed-${task.originalTaskId}-${task.completedTaskId}-${idx}`}
                                            className="bg-green-50"
                                          >
                                            <td className="px-1.5 py-1 font-mono">{task.originalTaskId}</td>
                                            <td className="px-1.5 py-1 max-w-[200px] truncate" title={task.description}>
                                              {task.description.length > 50 ? task.description.substring(0, 50) + '…' : task.description}
                                            </td>
                                            <td className="px-1.5 py-1">{formatDate(task.completedAt)}</td>
                                            <td className="px-1.5 py-1">
                                              <Badge variant={task.wasOnTime ? 'default' : 'destructive'} className="text-[9px]">
                                                {task.wasOnTime ? 'Yes' : 'No'}
                                              </Badge>
                                            </td>
                                            <td className="text-right px-1.5 py-1">{task.completionDays}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {eng.activeTasks.length === 0 && eng.completedTasks.length === 0 && (
                                <div className="text-[11px] text-gray-500 italic">No task details available.</div>
                              )}
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white border border-dashed border-gray-300 rounded-lg p-6 text-center text-xs text-gray-500">
              Select a category on the left to view the engineers working on it.
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Status Distribution Chart (donut-style horizontal summary) ────────────

  const renderStatusChart = () => {
    if (statusDist.length === 0) {
      return <div className="text-sm text-gray-500 py-4 text-center">No status data available</div>
    }

    const totalCount = statusDist.reduce((s, d) => s + d.count, 0)

    return (
      <div className="space-y-3">
        <div className="text-xs font-semibold text-gray-600 mb-2">Task Status Distribution</div>
        {/* Stacked horizontal bar */}
        <div className="w-full h-8 rounded-lg overflow-hidden flex" title={`Total: ${totalCount} tasks`}>
          {statusDist.map((s) => {
            const widthPct = totalCount > 0 ? (s.count / totalCount) * 100 : 0
            if (widthPct < 0.5) return null
            const color = STATUS_COLORS[s.statusName] ?? '#6b7280'
            return (
              <div
                key={s.statusName}
                className="h-full transition-all duration-300 relative group"
                style={{ width: `${widthPct}%`, backgroundColor: color }}
                title={`${s.statusName}: ${s.count} (${s.percentage}%)`}
              >
                {widthPct > 8 && (
                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white drop-shadow-sm">
                    {s.count}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {statusDist.map((s) => {
            const color = STATUS_COLORS[s.statusName] ?? '#6b7280'
            return (
              <div key={s.statusName} className="flex items-center gap-1">
                <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
                <span className="text-[10px] text-gray-600">{s.statusName}: <strong>{s.count}</strong> ({s.percentage}%)</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── Engineer Comparison Chart (grouped bars by engineer) ──────────────────

  const renderEngineerChart = () => {
    if (engineerOnlyItems.length === 0) {
      return <div className="text-sm text-gray-500 py-4 text-center">No engineer data available</div>
    }

    const maxCount = Math.max(1, ...engineerOnlyItems.map(it => Math.max(it.activeCount ?? 0, it.completedCount ?? 0)))
    const yTicks = computeNiceTicks(maxCount)
    const yMax = yTicks[yTicks.length - 1]

    const maxBars = engineerOnlyItems.length
    const subBarWidth = Math.max(20, Math.min(36, Math.floor(600 / Math.max(1, maxBars * 3))))
    const innerGap = 4
    const groupWidth = subBarWidth * 2 + innerGap
    const gap = Math.max(16, Math.min(40, Math.floor(120 / Math.max(1, maxBars))))

    const padding = { top: 28, right: 24, bottom: 100, left: 56 }
    const barAreaWidth = Math.max(400, maxBars * (groupWidth + gap) + gap)
    const barAreaHeight = 240
    const chartWidth = barAreaWidth + padding.left + padding.right
    const chartHeight = barAreaHeight + padding.top + padding.bottom

    const truncate = (s: string) => {
      if (!s) return 'Unknown'
      if (s.length <= 20) return s
      return s.slice(0, 19).trim() + '…'
    }

    const getActiveBarColor = (count: number, capacity?: number) => {
      const denom = capacity && capacity > 0 ? capacity : maxCount
      const ratio = denom > 0 ? Math.min(1, count / denom) : 0
      const hue = Math.round((1 - ratio) * 120)
      const saturation = 70
      const lightness = ratio > 0.75 ? 42 : 50
      return `hsl(${hue} ${saturation}% ${lightness}%)`
    }

    const completedBarColor = '#22c55e'
    const MIN_BAR_HEIGHT = 6

    const barH = (count: number) => {
      if (count <= 0) return 0
      const proportional = yMax > 0 ? (count / yMax) * barAreaHeight : 0
      return Math.max(MIN_BAR_HEIGHT, proportional)
    }

    return (
      <div className="bg-slate-50 rounded-lg p-4 overflow-x-auto">
        <svg width={chartWidth} height={chartHeight} role="img" aria-label="Engineer workload comparison chart">
          {yTicks.map((tick) => {
            const y = padding.top + barAreaHeight - (yMax > 0 ? (tick / yMax) * barAreaHeight : 0)
            return (
              <line key={`grid-${tick}`} x1={padding.left} x2={padding.left + barAreaWidth} y1={y} y2={y}
                stroke={tick === 0 ? '#94a3b8' : '#e2e8f0'} strokeWidth={tick === 0 ? 1 : 0.5} strokeDasharray={tick === 0 ? 'none' : '4 3'} />
            )
          })}
          <text x={14} y={padding.top + barAreaHeight / 2} transform={`rotate(-90 14 ${padding.top + barAreaHeight / 2})`} fontSize={11} fill="#475569" textAnchor="middle" fontWeight={600}>
            Number of Tasks
          </text>
          <line x1={padding.left} y1={padding.top} x2={padding.left} y2={padding.top + barAreaHeight} stroke="#94a3b8" strokeWidth={1} />
          <line x1={padding.left} y1={padding.top + barAreaHeight} x2={padding.left + barAreaWidth} y2={padding.top + barAreaHeight} stroke="#94a3b8" strokeWidth={1} />
          {yTicks.map((tick) => {
            const y = padding.top + barAreaHeight - (yMax > 0 ? (tick / yMax) * barAreaHeight : 0)
            return (
              <g key={`ytick-${tick}`}>
                <line x1={padding.left - 4} y1={y} x2={padding.left} y2={y} stroke="#94a3b8" strokeWidth={1} />
                <text x={padding.left - 8} y={y + 4} fontSize={10} fill="#475569" textAnchor="end" fontWeight={500}>{tick}</text>
              </g>
            )
          })}
          <text x={padding.left + barAreaWidth / 2} y={chartHeight - 8} fontSize={11} fill="#475569" textAnchor="middle" fontWeight={600}>
            Assigned Engineer
          </text>
          {engineerOnlyItems.map((it, idx) => {
            const groupX = padding.left + gap + idx * (groupWidth + gap)
            const activeCount = Number(it.activeCount ?? 0)
            const activeBarH = barH(activeCount)
            const activeBarY = padding.top + barAreaHeight - activeBarH
            const activeX = groupX
            const activeFill = getActiveBarColor(activeCount, it.capacity)
            const completedCount = Number(it.completedCount ?? 0)
            const completedBarH = barH(completedCount)
            const completedBarY = padding.top + barAreaHeight - completedBarH
            const completedX = groupX + subBarWidth + innerGap
            const labelX = groupX + groupWidth / 2
            const labelY = padding.top + barAreaHeight + 16
            const visibleLabel = truncate(it.engineerName ?? 'Unknown')

            return (
              <g key={String(it.engineerName) + '-' + idx}>
                <rect x={activeX} y={activeBarY} width={subBarWidth} height={activeBarH} fill={activeFill} rx={3}
                  style={{ cursor: 'pointer', transition: 'opacity 0.2s' }} opacity={0.92}
                  onClick={() => setExpandedEngineer(expandedEngineer === it.engineerName ? null : it.engineerName)}>
                  <title>{it.engineerName} — Active: {activeCount}</title>
                </rect>
                {activeCount > 0 && (
                  <text x={activeX + subBarWidth / 2} y={activeBarY - 5} fontSize={10} fill="#334155" textAnchor="middle" fontWeight={700}>{activeCount}</text>
                )}
                <rect x={completedX} y={completedBarY} width={subBarWidth} height={completedBarH} fill={completedBarColor} rx={3}
                  style={{ cursor: 'pointer', transition: 'opacity 0.2s' }} opacity={0.92}
                  onClick={() => setExpandedEngineer(expandedEngineer === it.engineerName ? null : it.engineerName)}>
                  <title>{it.engineerName} — Completed: {completedCount}</title>
                </rect>
                {completedCount > 0 && (
                  <text x={completedX + subBarWidth / 2} y={completedBarY - 5} fontSize={10} fill="#15803d" textAnchor="middle" fontWeight={700}>{completedCount}</text>
                )}
                <g transform={`rotate(-40 ${labelX} ${labelY})`}>
                  <text x={labelX} y={labelY} fontSize={10} fill="#334155" textAnchor="end" dominantBaseline="hanging" fontWeight={500}>
                    <title>{it.engineerName} — Active: {it.activeCount}, Completed: {it.completedCount}, Total: {it.handledCount}</title>
                    {visibleLabel}
                  </text>
                </g>
              </g>
            )
          })}
        </svg>
      </div>
    )
  }

  // Compute nice Y-axis ticks for clean, readable scale
  const computeNiceTicks = (maxVal: number): number[] => {
    if (maxVal <= 0) return [0]
    if (maxVal <= 5) {
      const ticks: number[] = []
      for (let i = 0; i <= maxVal; i++) ticks.push(i)
      return ticks
    }
    const rawStep = maxVal / 5
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
    const residual = rawStep / magnitude
    let niceStep: number
    if (residual <= 1.5) niceStep = 1 * magnitude
    else if (residual <= 3.5) niceStep = 2 * magnitude
    else if (residual <= 7.5) niceStep = 5 * magnitude
    else niceStep = 10 * magnitude
    niceStep = Math.max(1, Math.round(niceStep))
    const ticks: number[] = []
    for (let v = 0; v <= maxVal; v += niceStep) ticks.push(v)
    if (ticks[ticks.length - 1] < maxVal) ticks.push(ticks[ticks.length - 1] + niceStep)
    return ticks
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-start justify-between">
          <div className="text-black font-bold">Engineer Workload</div>
          <div className="text-xs text-muted-foreground">{finalItems.length ? `${finalItems.length} engineers` : 'No data'}</div>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {/* ─── Summary Cards — RENAMED: "Total Engineers" → "Accessible Engineers" ─── */}
        <div className="mb-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
          {/* RENAMED: "Total Engineers" → "Accessible Engineers" with descriptive names */}
          <div className="bg-blue-50 p-3 rounded border border-blue-100">
            <div className="font-semibold text-blue-800">Accessible Engineers</div>
            <div className="text-xl font-bold text-blue-900 mb-1.5">{summary.accessibleEngineerCount}</div>
            {/* Modern scrollable engineer name chips */}
            <div className="max-h-[120px] overflow-y-auto pr-1 scrollbar-thin">
              <div className="flex flex-wrap gap-1">
                {(summary.accessibleEngineerNames ?? []).map((name, i) => {
                  // Format name: "FirstName L." for compactness
                  const raw = (name ?? 'Unknown').trim()
                  const parts = raw.split(/\s+/)
                  let displayName = raw
                  if (parts.length >= 2) {
                    const firstName = parts[0]
                    const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase()
                    displayName = `${firstName} ${lastInitial}.`
                  }
                  if (displayName.length > 14) {
                    displayName = displayName.slice(0, 12).trim() + '…'
                  }
                  return (
                    <span
                      key={`eng-chip-${i}`}
                      className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] leading-tight font-medium whitespace-nowrap border border-blue-200/60 hover:bg-blue-200 transition-colors"
                      title={raw}
                    >
                      {displayName}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="bg-green-50 p-3 rounded border border-green-100">
            <div className="font-semibold text-green-800">Active Tasks</div>
            <div className="text-xl font-bold text-green-900">{summary.totalActiveTasks}</div>
          </div>
          <div className="bg-emerald-50 p-3 rounded border border-emerald-100">
            <div className="font-semibold text-emerald-800">Completed</div>
            <div className="text-xl font-bold text-emerald-900">{summary.totalCompletedTasks}</div>
          </div>
          <div className="bg-purple-50 p-3 rounded border border-purple-100">
            <div className="font-semibold text-purple-800">Total Assigned</div>
            <div className="text-xl font-bold text-purple-900">{summary.totalAssignedTasks}</div>
          </div>
          <div className="bg-red-50 p-3 rounded border border-red-100">
            <div className="font-semibold text-red-800">Overdue</div>
            <div className="text-xl font-bold text-red-900">{summary.totalOverdueTasks}</div>
          </div>
          <div className="bg-amber-50 p-3 rounded border border-amber-100">
            <div className="font-semibold text-amber-800">Urgent</div>
            <div className="text-xl font-bold text-amber-900">{summary.totalUrgentTasks}</div>
            <div className="text-[10px] text-amber-600">Due within 3 days</div>
          </div>
        </div>

        {/* ─── Chart View Switcher ─── */}
        <div className="mb-3 flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500">View:</span>
          {[
            { key: 'engineer' as ChartView, label: 'By Engineer' },
            { key: 'status' as ChartView, label: 'By Status' },
            { key: 'category' as ChartView, label: 'By Category' },
          ].map(({ key, label }) => (
            <Button
              key={key}
              variant={chartView === key ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7 px-3"
              onClick={() => setChartView(key)}
            >
              {label}
            </Button>
          ))}
        </div>

        {/* ─── Descriptive Chart Area ─── */}
        <div className="bg-slate-50 rounded-lg p-4 mb-4">
          {chartView === 'category' && renderCategoryChart()}
          {chartView === 'status' && renderStatusChart()}
          {chartView === 'engineer' && renderEngineerChart()}
        </div>

        {/* ─── Urgency-Prioritized Tasks (top 10) ─── */}
        {urgencyTasks.length > 0 && (
          <div className="mb-4">
            <h4 className="font-semibold mb-2 text-sm">Urgency-Prioritized Tasks</h4>
            <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0">
                  <tr className="border-b bg-gray-100">
                    <th className="text-left p-1.5">Urgency</th>
                    <th className="text-left p-1.5">Task ID</th>
                    <th className="text-left p-1.5">Description</th>
                    <th className="text-left p-1.5">Engineer</th>
                    <th className="text-left p-1.5">Category</th>
                    <th className="text-left p-1.5">Status</th>
                    <th className="text-left p-1.5">Priority</th>
                    <th className="text-left p-1.5">Target Date</th>
                    <th className="text-right p-1.5">Days Left</th>
                  </tr>
                </thead>
                <tbody>
                  {urgencyTasks.slice(0, 15).map((task, idx) => {
                    const urgencyColor = URGENCY_COLORS[task.urgencyLevel] ?? '#6b7280'
                    return (
                      <tr key={`urgency-${task.taskId}-${idx}`} className="border-b hover:bg-gray-50">
                        <td className="p-1.5">
                          <Badge
                            className="text-[9px] px-1.5 py-0 h-4 text-white font-semibold"
                            style={{ backgroundColor: urgencyColor }}
                          >
                            {task.urgencyLevel}
                          </Badge>
                        </td>
                        <td className="p-1.5 font-mono">{task.taskId}</td>
                        <td className="p-1.5 max-w-[200px] truncate" title={task.description}>
                          {task.description.length > 40 ? task.description.substring(0, 40) + '...' : task.description}
                        </td>
                        <td className="p-1.5 font-medium">{task.assignedEngineer}</td>
                        <td className="p-1.5">{task.category}</td>
                        <td className="p-1.5">
                          <Badge variant={task.isOverdue ? 'destructive' : 'secondary'} className="text-[9px]">
                            {task.status}
                          </Badge>
                        </td>
                        <td className="p-1.5">{task.priority}</td>
                        <td className="p-1.5">{task.targetCompletionDate ? formatDate(task.targetCompletionDate) : 'N/A'}</td>
                        <td className="text-right p-1.5 font-semibold" style={{ color: urgencyColor }}>
                          {task.isOverdue ? `${Math.abs(task.daysRemaining)}d late` : `${task.daysRemaining}d`}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {urgencyTasks.length > 15 && (
              <div className="text-[10px] text-gray-500 mt-1 text-right">
                Showing top 15 of {urgencyTasks.length} tasks
              </div>
            )}
          </div>
        )}

        {/* ─── Detailed Breakdown Table ─── */}
        <div className="mt-4">
          <h4 className="font-semibold mb-2">Detailed Breakdown</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Engineer</th>
                  <th className="text-right p-2">Pending</th>
                  <th className="text-right p-2">In Progress</th>
                  <th className="text-right p-2">On Hold</th>
                  <th className="text-right p-2">Blocked</th>
                  <th className="text-right p-2">Paused</th>
                  <th className="text-right p-2">Pending TL</th>
                  <th className="text-right p-2">Rejected</th>
                  <th className="text-right p-2 bg-blue-50 font-bold">Active Total</th>
                  <th className="text-right p-2">Cancelled</th>
                  <th className="text-right p-2 text-green-600">Completed</th>
                  <th className="text-right p-2 font-bold text-blue-600">Total Assigned</th>
                  <th className="text-center p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {finalItems.map((item, idx) => {
                  const expectedActiveTotal = (item.openCount || 0) + (item.inProgressCount || 0) +
                    (item.onHoldCount || 0) + (item.blockedCount || 0) + (item.pausedCount || 0) +
                    (item.pendingTLApprovalCount || 0) + (item.rejectedCount || 0)

                  return (
                  <React.Fragment key={idx}>
                    <tr className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium">{item.engineerName}</td>
                      <td className="text-right p-2">{item.openCount || 0}</td>
                      <td className="text-right p-2">{item.inProgressCount || 0}</td>
                      <td className="text-right p-2">{item.onHoldCount || 0}</td>
                      <td className="text-right p-2">{item.blockedCount || 0}</td>
                      <td className="text-right p-2">{item.pausedCount || 0}</td>
                      <td className="text-right p-2">{item.pendingTLApprovalCount || 0}</td>
                      <td className="text-right p-2 text-red-600">{item.rejectedCount || 0}</td>
                      <td className="text-right p-2 font-semibold bg-blue-50">{expectedActiveTotal}</td>
                      <td className="text-right p-2 text-gray-500">{item.cancelledCount || 0}</td>
                      <td className="text-right p-2 text-green-600">{item.completedCount || 0}</td>
                      <td className="text-right p-2 font-semibold text-blue-600">{item.handledCount || 0}</td>
                      <td className="text-center p-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedEngineer(expandedEngineer === item.engineerName ? null : item.engineerName)}
                        >
                          {expandedEngineer === item.engineerName ? 'Hide' : 'Details'}
                        </Button>
                      </td>
                    </tr>
                    
                    {/* Expanded detail view */}
                    {expandedEngineer === item.engineerName && (
                      <tr>
                        <td colSpan={13} className="p-4 bg-gray-50">
                          <div className="space-y-4">
                            {/* Active Tasks — filter out Completed and Cancelled from breakdown */}
                            {item.taskBreakdown && item.taskBreakdown.length > 0 && (() => {
                              const activeTasks = item.taskBreakdown.filter(task => {
                                const statusStr = String(task.status ?? '').toLowerCase().replace(/[\s_-]+/g, '')
                                const isCompleted = statusStr === 'completed' || statusStr === '2'
                                const isCancelled = statusStr === 'cancelled' || statusStr === 'canceled' || statusStr === '6'
                                return !isCompleted && !isCancelled
                              })

                              // Group active tasks by category for descriptive display
                              const tasksByCategory = activeTasks.reduce<Record<string, TaskBreakdownItem[]>>((acc, task) => {
                                const cat = task.category || 'Unknown'
                                if (!acc[cat]) acc[cat] = []
                                acc[cat].push(task)
                                return acc
                              }, {})

                              // Sort categories by urgency (most overdue/urgent first)
                              const sortedCategories = Object.entries(tasksByCategory).sort(([, tasksA], [, tasksB]) => {
                                const urgencyA = tasksA.filter(t => t.isOverdue).length * 100 + tasksA.filter(t => t.daysRemaining >= 0 && t.daysRemaining <= 3).length * 10
                                const urgencyB = tasksB.filter(t => t.isOverdue).length * 100 + tasksB.filter(t => t.daysRemaining >= 0 && t.daysRemaining <= 3).length * 10
                                return urgencyB - urgencyA
                              })

                              return activeTasks.length > 0 ? (
                              <div>
                                <h5 className="font-medium text-blue-800 mb-2">Active Tasks ({activeTasks.length}) — Grouped by Category</h5>
                                {sortedCategories.map(([category, catTasks]) => {
                                  const overdueInCat = catTasks.filter(t => t.isOverdue).length
                                  const urgentInCat = catTasks.filter(t => t.daysRemaining >= 0 && t.daysRemaining <= 3).length
                                  // Sort tasks within category by target date (most urgent first)
                                  const sortedTasks = [...catTasks].sort((a, b) => a.daysRemaining - b.daysRemaining)

                                  return (
                                    <div key={category} className="mb-3">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-xs font-semibold text-gray-700">{category}</span>
                                        <span className="text-[10px] text-gray-500">({catTasks.length} tasks)</span>
                                        {overdueInCat > 0 && <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4">{overdueInCat} overdue</Badge>}
                                        {urgentInCat > 0 && <Badge className="text-[9px] px-1 py-0 h-4 bg-amber-500 text-white">{urgentInCat} urgent</Badge>}
                                      </div>
                                      <div className="max-h-32 overflow-y-auto">
                                        <table className="w-full text-xs">
                                          <thead>
                                            <tr className="bg-blue-100">
                                              <th className="text-left p-1">Task ID</th>
                                              <th className="text-left p-1">Description</th>
                                              <th className="text-left p-1">Status</th>
                                              <th className="text-left p-1">Priority</th>
                                              <th className="text-left p-1">Target Date</th>
                                              <th className="text-right p-1">Days Left</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {sortedTasks.map((task, taskIdx) => (
                                              <tr key={`active-${task.taskId}-${taskIdx}`} className={task.isOverdue ? 'bg-red-50' : task.daysRemaining <= 3 && task.daysRemaining >= 0 ? 'bg-amber-50' : ''}>
                                                <td className="p-1">{task.taskId}</td>
                                                <td className="p-1">{task.description.length > 50 ? task.description.substring(0, 50) + '...' : task.description}</td>
                                                <td className="p-1">
                                                  <Badge variant={task.isOverdue ? 'destructive' : 'secondary'}>
                                                    {task.status}
                                                  </Badge>
                                                </td>
                                                <td className="p-1">{task.priority}</td>
                                                <td className="p-1">{task.targetCompletionDate ? formatDate(task.targetCompletionDate) : task.estimatedCompletionDate ? formatDate(task.estimatedCompletionDate) : 'N/A'}</td>
                                                <td className="text-right p-1 font-semibold" style={{ color: task.isOverdue ? '#dc2626' : task.daysRemaining <= 3 ? '#f59e0b' : '#22c55e' }}>
                                                  {task.isOverdue ? `${Math.abs(task.daysRemaining)}d late` : `${task.daysRemaining}d`}
                                                </td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                              ) : null
                            })()}
                            
                            {/* Show message if no active tasks */}
                            {(!item.taskBreakdown || item.taskBreakdown.length === 0) && (
                              <div>
                                <h5 className="font-medium text-blue-800 mb-2">Active Tasks (0)</h5>
                                <p className="text-sm text-gray-500">No active tasks found for this engineer.</p>
                              </div>
                            )}
                            
                            {/* Completed Tasks */}
                            {item.completedTaskBreakdown && item.completedTaskBreakdown.length > 0 && (
                              <div>
                                <h5 className="font-medium text-green-800 mb-2">Completed Tasks ({item.completedTaskBreakdown.length})</h5>
                                <div className="max-h-40 overflow-y-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="bg-green-100">
                                        <th className="text-left p-1">Task ID</th>
                                        <th className="text-left p-1">Description</th>
                                        <th className="text-left p-1">Category</th>
                                        <th className="text-left p-1">Completed</th>
                                        <th className="text-left p-1">On Time</th>
                                        <th className="text-left p-1">Days</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {item.completedTaskBreakdown.map((task, taskIdx) => (
                                        <tr key={`completed-${task.originalTaskId}-${task.completedTaskId}-${taskIdx}`} className="bg-green-50">
                                          <td className="p-1">{task.originalTaskId}</td>
                                          <td className="p-1">{task.description.length > 50 ? task.description.substring(0, 50) + '...' : task.description}</td>
                                          <td className="p-1">{task.category}</td>
                                          <td className="p-1">{formatDate(task.completedAt)}</td>
                                          <td className="p-1">
                                            <Badge variant={task.wasOnTime ? 'default' : 'destructive'}>
                                              {task.wasOnTime ? 'Yes' : 'No'}
                                            </Badge>
                                          </td>
                                          <td className="p-1">{task.completionDays}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                            
                            {/* Show message if no completed tasks */}
                            {(!item.completedTaskBreakdown || item.completedTaskBreakdown.length === 0) && (
                              <div>
                                <h5 className="font-medium text-green-800 mb-2">Completed Tasks (0)</h5>
                                <p className="text-sm text-gray-500">No completed tasks found for this engineer.</p>
                              </div>
                            )}
                            
                            {/* Performance Metrics */}
                            {item.metrics && (
                              <div>
                                <h5 className="font-medium text-purple-800 mb-2">Performance Metrics</h5>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                  <div className="bg-white p-2 rounded border">
                                    <div className="text-gray-600">Avg Completion</div>
                                    <div className="font-semibold">{item.metrics.averageTaskCompletionDays} days</div>
                                  </div>
                                  <div className="bg-white p-2 rounded border">
                                    <div className="text-gray-600">On-Time Rate</div>
                                    <div className="font-semibold">{item.metrics.onTimeCompletionRate}%</div>
                                  </div>
                                  <div className="bg-white p-2 rounded border">
                                    <div className="text-gray-600">Overdue Tasks</div>
                                    <div className="font-semibold text-red-600">{item.metrics.overdueTasks}</div>
                                  </div>
                                  <div className="bg-white p-2 rounded border">
                                    <div className="text-gray-600">Rating</div>
                                    <div className="font-semibold">{item.metrics.performanceRating}</div>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}