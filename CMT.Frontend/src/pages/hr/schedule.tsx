'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import WorkloadDashboard from '@/components/WorkloadDashboard'
import SchedulePreview from '@/components/SchedulePreview'
import { useAuth } from '@/lib/auth-context'
import {
  EAT_SCHEDULE_CONFIG,
  calculateNetWorkHours,
  calculateTaskCapacity,
  detectDuplicateCategories,
  isWorkingDay,
  getWorkingDays,
  type ScheduleConfig,
  type BreakConfig,
  type LeaveEntry,
  type LeaveType,
  type WeekendAmendment,
  type DuplicateCategoryAlert,
  type TaskCapacity,
  type TaskInput,
} from '@/lib/scheduler'

/**
 * HR Scheduler page - Enhanced with EAT timezone, break management,
 * leave deductions, weekend amendments, duplicate detection, capacity calculator,
 * role-based workload matrix, and performance integration.
 *
 * Role protected on client: team_leader, director, shop_tl only.
 *
 * FIXES APPLIED:
 * - Issue 6: Leave & Weekend Amendments now persisted to localStorage
 * - Issue 7: Task Capacity Calculator fetches actual tasks from API
 * - Issue 8: Duplicate Detection fetches actual tasks from API
 * - Issue 9: Performance Tab correctly maps backend EngineerPerformanceDto fields
 */

function canonicalizeRole(raw: any): string {
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'number') {
    const map: Record<string, string> = { 0: 'team_leader', 1: 'director', 2: 'engineer', 3: 'customer', 4: 'customer_personnel', 5: 'shop_tl' }
    return map[String(raw)] ?? String(raw)
  }
  return String(raw).trim().toLowerCase().replace(/[\s\-_]+/g, '_')
}

type TabKey = 'config' | 'capacity' | 'duplicates' | 'leave' | 'weekend' | 'workload' | 'performance'

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'config', label: 'Schedule Config', icon: '⚙️' },
  { key: 'capacity', label: 'Task Capacity', icon: '📊' },
  { key: 'duplicates', label: 'Duplicate Detection', icon: '⚠️' },
  { key: 'leave', label: 'Leave Management', icon: '🏖️' },
  { key: 'weekend', label: 'Weekend Amendments', icon: '📅' },
  { key: 'workload', label: 'Workload Matrix', icon: '📈' },
  { key: 'performance', label: 'Performance Flow', icon: '🎯' },
]

async function fetchTasksForScheduler(
  token: string | null,
  engineers: Array<{ id: string | number; name: string }>
): Promise<TaskInput[]> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers['Authorization'] = `Bearer ${token}`
    const res = await fetch('/api/tasks', { credentials: 'include', headers })
    if (!res.ok) return []
    const data = await res.json()
    const tasks = Array.isArray(data) ? data : data?.tasks ?? data?.data ?? []
    return tasks.map((t: any) => {
      const engName = t.assignedEngineer ?? t.assigned_engineer ?? ''
      const matchedEng = engineers.find(e =>
        String(e.name).toLowerCase() === String(engName).toLowerCase()
      )
      return {
        task_id: t.taskId ?? t.task_id ?? t.id,
        estimated_hours: t.estimatedHours ?? t.estimated_hours ?? 8,
        assigned_user_id: matchedEng ? matchedEng.id : (t.assignedEngineerId ?? t.assigned_engineer_id ?? null),
        category_id: t.categoryId ?? t.category_id,
        category_name: t.categoryName ?? t.category_name,
        description: t.description,
        status: t.status,
        planned_start_date: t.plannedStartDate ?? t.planned_start_date ?? null,
        planned_end_date: t.plannedEndDate ?? t.planned_end_date ?? null,
        priority: t.priorityId ?? t.priority_id ?? 1,
      } as TaskInput
    })
  } catch {
    return []
  }
}

export default function HRSchedulePage() {
  const { user, token } = useAuth()
  const router = useRouter()
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('config')

  useEffect(() => {
    const r = canonicalizeRole(user?.role ?? user?.roleDisplayName ?? user?.role_name ?? '')
    setIsAuthorized(['team_leader', 'director', 'shop_tl'].includes(r))
  }, [user])

  const [start, setStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
  })
  const [end, setEnd] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(0); return d.toISOString().slice(0, 10)
  })
  const [loading, setLoading] = useState(false)
  const [scheduleEntries, setScheduleEntries] = useState<any[]>([])
  const [analysis, setAnalysis] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<any>(null)

  // Schedule Config State
  const [scheduleConfig, setScheduleConfig] = useState<ScheduleConfig>({ ...EAT_SCHEDULE_CONFIG })
  const [configSaved, setConfigSaved] = useState(false)
  const netHours = useMemo(() => calculateNetWorkHours(scheduleConfig), [scheduleConfig])

  const updateBreak = (index: number, field: keyof BreakConfig, value: string | number) => {
    const newBreaks = [...scheduleConfig.breaks]
    newBreaks[index] = { ...newBreaks[index], [field]: value }
    const totalBreakMinutes = newBreaks.reduce((sum, b) => sum + b.durationMinutes, 0)
    setScheduleConfig(prev => ({
      ...prev, breaks: newBreaks, totalBreakMinutes,
      netWorkHoursPerDay: calculateNetWorkHours({ ...prev, breaks: newBreaks }),
    }))
  }

  const handleSaveConfig = () => {
    try {
      localStorage.setItem('cmt_schedule_config', JSON.stringify(scheduleConfig))
      setConfigSaved(true)
      setTimeout(() => setConfigSaved(false), 3000)
    } catch { /* silently handle */ }
  }

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cmt_schedule_config')
      if (saved) {
        const parsed = JSON.parse(saved)
        setScheduleConfig({ ...EAT_SCHEDULE_CONFIG, ...parsed })
      }
    } catch { /* use defaults */ }
  }, [])

  // Task Capacity State
  const [capacityDate, setCapacityDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [capacityEngineerId, setCapacityEngineerId] = useState<string>('')
  const [capacityResult, setCapacityResult] = useState<TaskCapacity | null>(null)
  const [capacityLoading, setCapacityLoading] = useState(false)
  const [engineers, setEngineers] = useState<Array<{ id: string | number; name: string }>>([])
  const [loadingEngineers, setLoadingEngineers] = useState(false)

  useEffect(() => {
    const loadEngineers = async () => {
      setLoadingEngineers(true)
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`

        // Try the lightweight by-role endpoint first (much faster than /api/users)
        let engineerList: Array<{ id: string | number; name: string }> = []

        try {
          const byRoleRes = await fetch('/api/users/by-role/engineer', { credentials: 'include', headers })
          if (byRoleRes.ok) {
            const data = await byRoleRes.json()
            const usersList = Array.isArray(data) ? data : data?.users ?? data?.data ?? []
            engineerList = usersList.map((u: any) => ({
              id: u.userId ?? u.user_id ?? u.id,
              name: u.fullName ?? u.full_name ?? u.name ?? 'Unknown',
            }))
          }
        } catch { /* by-role failed, try fallback */ }

        // Fallback to /api/users if by-role returned nothing
        if (engineerList.length === 0) {
          try {
            const res = await fetch('/api/users', { credentials: 'include', headers })
            if (res.ok) {
              const data = await res.json()
              const usersList = Array.isArray(data) ? data : data?.users ?? data?.data ?? []
              engineerList = usersList
                .filter((u: any) => {
                  const role = String(u.role ?? u.role_name ?? u.roleName ?? '').toLowerCase()
                  return role === 'engineer' || role === '2'
                })
                .map((u: any) => ({
                  id: u.userId ?? u.user_id ?? u.id,
                  name: u.fullName ?? u.full_name ?? u.name ?? 'Unknown',
                }))
            }
          } catch { /* silently handle */ }
        }

        setEngineers(engineerList)
      } catch { /* silently handle */ }
      finally { setLoadingEngineers(false) }
    }
    if (isAuthorized) loadEngineers()
  }, [isAuthorized, token])

  // FIX Issue 7: Fetch real tasks for capacity calculation
  const handleCalculateCapacity = async () => {
    if (!capacityEngineerId) return
    setCapacityLoading(true)
    try {
      const allTasks = await fetchTasksForScheduler(token, engineers)
      const engineerTasks = allTasks.filter(t => String(t.assigned_user_id) === capacityEngineerId)
      const engineer = engineers.find(e => String(e.id) === capacityEngineerId)
      const result = calculateTaskCapacity(
        capacityEngineerId, engineer?.name ?? 'Unknown', capacityDate,
        engineerTasks,
        leaveEntries.filter(l => String(l.user_id) === capacityEngineerId),
        weekendAmendments.filter(wa => String(wa.user_id) === capacityEngineerId),
        scheduleConfig
      )
      setCapacityResult(result)
    } catch { /* silently handle */ }
    finally { setCapacityLoading(false) }
  }

  // Duplicate Detection State
  const [dupEngineerId, setDupEngineerId] = useState<string>('')
  const [dupCategoryId, setDupCategoryId] = useState<string>('')
  const [dupCategoryName, setDupCategoryName] = useState<string>('')
  const [duplicateAlert, setDuplicateAlert] = useState<DuplicateCategoryAlert | null>(null)
  const [dupChecked, setDupChecked] = useState(false)
  const [dupLoading, setDupLoading] = useState(false)
  const [categories, setCategories] = useState<Array<{ id: number; name: string }>>([])

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (token) headers['Authorization'] = `Bearer ${token}`
        const res = await fetch('/api/management/categories', { credentials: 'include', headers })
        if (res.ok) {
          const data = await res.json()
          const catList = Array.isArray(data) ? data : data?.categories ?? data?.data ?? []
          setCategories(catList.map((c: any) => ({
            id: c.category_id ?? c.categoryId ?? c.id,
            name: c.category_name ?? c.categoryName ?? c.name ?? 'Unknown',
          })))
        }
      } catch { /* silently handle */ }
    }
    if (isAuthorized) loadCategories()
  }, [isAuthorized, token])

  // FIX Issue 8: Fetch real tasks for duplicate detection
  const handleCheckDuplicates = async () => {
    if (!dupEngineerId || !dupCategoryId) return
    setDupLoading(true)
    setDupChecked(false)
    try {
      const allTasks = await fetchTasksForScheduler(token, engineers)
      const engineer = engineers.find(e => String(e.id) === dupEngineerId)
      const category = categories.find(c => String(c.id) === dupCategoryId)
      const alert = detectDuplicateCategories(
        allTasks, dupEngineerId, Number(dupCategoryId),
        category?.name ?? dupCategoryName, engineer?.name ?? 'Unknown', scheduleConfig
      )
      setDuplicateAlert(alert)
      setDupChecked(true)
    } catch { /* silently handle */ }
    finally { setDupLoading(false) }
  }

  // Leave Management State - FIX Issue 6: localStorage persistence
  const [leaveEntries, setLeaveEntries] = useState<LeaveEntry[]>([])
  const [newLeave, setNewLeave] = useState<Partial<LeaveEntry>>({ leave_type: 'vacation', hours_per_day: null })

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cmt_leave_entries')
      if (saved) setLeaveEntries(JSON.parse(saved))
    } catch { /* use empty defaults */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem('cmt_leave_entries', JSON.stringify(leaveEntries)) } catch { /* silently */ }
  }, [leaveEntries])

  const handleAddLeave = () => {
    if (!newLeave.user_id || !newLeave.start_date || !newLeave.end_date) return
    const entry: LeaveEntry = {
      user_id: newLeave.user_id!, start_date: newLeave.start_date!, end_date: newLeave.end_date!,
      leave_type: (newLeave.leave_type as LeaveType) ?? 'vacation',
      hours_per_day: newLeave.hours_per_day ?? null, reason: newLeave.reason,
    }
    setLeaveEntries(prev => [...prev, entry])
    setNewLeave({ leave_type: 'vacation', hours_per_day: null })
  }

  const handleRemoveLeave = (index: number) => {
    setLeaveEntries(prev => prev.filter((_, i) => i !== index))
  }

  // Weekend Amendment State - FIX Issue 6: localStorage persistence
  const [weekendAmendments, setWeekendAmendments] = useState<WeekendAmendment[]>([])
  const [newAmendment, setNewAmendment] = useState<Partial<WeekendAmendment>>({ work_hours: 8 })

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cmt_weekend_amendments')
      if (saved) setWeekendAmendments(JSON.parse(saved))
    } catch { /* use empty defaults */ }
  }, [])

  useEffect(() => {
    try { localStorage.setItem('cmt_weekend_amendments', JSON.stringify(weekendAmendments)) } catch { /* silently */ }
  }, [weekendAmendments])

  const handleAddAmendment = () => {
    if (!newAmendment.user_id || !newAmendment.date) return
    const d = new Date(newAmendment.date + 'T00:00:00')
    const dayOfWeek = d.getDay()
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      setError('Weekend amendments can only be added for Saturday or Sunday.')
      return
    }
    const entry: WeekendAmendment = {
      user_id: newAmendment.user_id!, date: newAmendment.date!,
      work_hours: newAmendment.work_hours ?? 8,
      category_id: newAmendment.category_id, reason: newAmendment.reason,
    }
    setWeekendAmendments(prev => [...prev, entry])
    setNewAmendment({ work_hours: 8 })
    setError(null)
  }

  const handleRemoveAmendment = (index: number) => {
    setWeekendAmendments(prev => prev.filter((_, i) => i !== index))
  }

  // Performance State - FIX Issue 9: Correct field mapping
  const [performanceData, setPerformanceData] = useState<any>(null)
  const [loadingPerformance, setLoadingPerformance] = useState(false)

  const loadPerformanceData = async () => {
    setLoadingPerformance(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch(`/api/performance?startDate=${start}&endDate=${end}`, {
        credentials: 'include', headers,
      })
      if (res.ok) {
        const data = await res.json()
        let engineersList: any[] = []
        if (Array.isArray(data)) engineersList = data
        else if (data?.summary_table_data && Array.isArray(data.summary_table_data)) engineersList = data.summary_table_data
        else if (data?.engineers && Array.isArray(data.engineers)) engineersList = data.engineers
        else if (data?.data && Array.isArray(data.data)) engineersList = data.data

        const totalEngineers = engineersList.length
        const totalCompleted = engineersList.reduce((s: number, e: any) => s + (e.completedTasksCount ?? e.CompletedTasksCount ?? 0), 0)
        const totalOnTime = engineersList.reduce((s: number, e: any) => s + (e.onTimeCompletedCount ?? e.OnTimeCompletedCount ?? 0), 0)
        const totalDelayDays = engineersList.reduce((s: number, e: any) => s + (e.totalDelayDays ?? e.TotalDelayDays ?? 0), 0)
        const avgOnTimeRate = totalEngineers > 0
          ? engineersList.reduce((s: number, e: any) => s + (e.onTimeRate ?? e.OnTimeRate ?? 0), 0) / totalEngineers
          : 0
        const avgDelay = totalEngineers > 0 ? totalDelayDays / totalEngineers : 0
        const scheduleAdherence = totalCompleted > 0 ? Math.round(totalOnTime / totalCompleted * 100) : 0
        const utilizationImpact = analysis?.team?.team_utilization_percent ?? 0

        setPerformanceData({
          scheduleAdherence, onTimeRate: Math.round(avgOnTimeRate * 10) / 10,
          avgDelay: Math.round(avgDelay * 10) / 10, utilizationImpact,
          engineers: engineersList, totalCompleted, totalOnTime, totalDelayDays,
        })
      }
    } catch { /* silently handle */ }
    finally { setLoadingPerformance(false) }
  }

  // Schedule Generation
  async function generate() {
    setError(null); setLoading(true); setDebugInfo(null)
    try {
      const resp = await fetch('/api/schedule/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          start, end, defaultWorkHours: scheduleConfig.netWorkHoursPerDay,
          leaves: leaveEntries, weekendAmendments,
        })
      })
      if (!resp.ok) { const errorText = await resp.text(); throw new Error(`API Error (${resp.status}): ${errorText}`) }
      const data = await resp.json()
      if (!data.ok) throw new Error(data?.error || 'Schedule generation failed')

      setScheduleEntries(data.scheduleEntries || [])
      setDebugInfo({
        tasksCount: data.tasksCount, usersCount: data.usersCount,
        scheduledEntries: data.scheduleEntries?.length || 0,
        unscheduledTasks: data.unscheduled?.length || 0,
        netWorkHoursPerDay: scheduleConfig.netWorkHoursPerDay,
        timezone: scheduleConfig.timezone,
      })

      if (data.scheduleEntries && data.perUserTotals) {
        const users = Object.values(data.perUserTotals).map((p: any) => ({
          user_id: p.user_id, full_name: p.full_name,
          work_hours_per_day: scheduleConfig.netWorkHoursPerDay
        }))
        const analysisResp = await fetch('/api/schedule/analysis', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduleEntries: data.scheduleEntries, users, start, end,
            defaultWorkHours: scheduleConfig.netWorkHoursPerDay,
          })
        })
        if (analysisResp.ok) {
          const analysisData = await analysisResp.json()
          setAnalysis(analysisData)
        }
      }
    } catch (err: any) { setError(String(err?.message || err)) }
    finally { setLoading(false) }
  }

  if (isAuthorized === null) return null

  if (!isAuthorized) {
    return (
      <div className="p-6">
        <div className="bg-white p-6 rounded shadow">
          <h2 className="text-lg font-semibold mb-2">Access denied</h2>
          <p className="text-sm text-muted-foreground">
            The Scheduler & Workload Analysis tool is available only to Team Leaders, Directors and Shop Team Leaders.
          </p>
        </div>
      </div>
    )
  }

  const handleGoBack = () => {
    try {
      // If there's browser history, go back; otherwise navigate to dashboard
      if (window.history.length > 1) {
        router.back()
      } else {
        router.push('/dashboard')
      }
    } catch {
      router.push('/dashboard')
    }
  }

  return (
    <div className="p-6">
      {/* Page Header with Back Button */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <button
            onClick={handleGoBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-colors"
            aria-label="Go back"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>
            Back
          </button>
          <div>
            <h1 className="text-2xl font-semibold">HR Scheduler & Workload Preview</h1>
            <p className="text-sm text-gray-500">
              EAT (UTC+3) • Mon-Fri {scheduleConfig.workStartTime} - {scheduleConfig.workEndTime} • Net {netHours.toFixed(1)}h/day
            </p>
          </div>
        </div>
        <button
          onClick={handleGoBack}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-gray-600 rounded-md shadow-sm hover:bg-gray-700 transition-colors"
          aria-label="Exit scheduler"
        >
          Exit
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-1 mb-4 border-b">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3 py-2 text-sm font-medium rounded-t transition-colors ${
              activeTab === tab.key
                ? 'bg-white border border-b-white -mb-px text-blue-600'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Schedule Configuration */}
      {activeTab === 'config' && (
        <div className="space-y-4">
          <div className="bg-white rounded shadow p-4">
            <h3 className="font-semibold mb-3">EAT Schedule Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Timezone</label>
                <input type="text" value={scheduleConfig.timezone} readOnly className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-600" />
                <span className="text-xs text-gray-400">UTC+{scheduleConfig.timezoneOffset}</span>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Work Start Time</label>
                <input type="time" value={scheduleConfig.workStartTime} onChange={(e) => setScheduleConfig(prev => ({ ...prev, workStartTime: e.target.value }))} className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Work End Time</label>
                <input type="time" value={scheduleConfig.workEndTime} onChange={(e) => setScheduleConfig(prev => ({ ...prev, workEndTime: e.target.value }))} className="w-full border rounded px-3 py-2" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Working Days</label>
                <div className="flex flex-wrap gap-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => (
                    <label key={day} className="flex items-center gap-1 text-sm">
                      <input type="checkbox" checked={scheduleConfig.workDays.includes(idx)}
                        onChange={(e) => {
                          const newDays = e.target.checked ? [...scheduleConfig.workDays, idx] : scheduleConfig.workDays.filter(d => d !== idx)
                          const newDaysOff = [0, 1, 2, 3, 4, 5, 6].filter(d => !newDays.includes(d))
                          setScheduleConfig(prev => ({ ...prev, workDays: newDays.sort(), daysOff: newDaysOff }))
                        }} className="rounded" />
                      {day}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Days Off</label>
                <div className="flex flex-wrap gap-2">
                  {scheduleConfig.daysOff.map(d => (
                    <span key={d} className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Daily Breaks</label>
              <div className="space-y-2">
                {scheduleConfig.breaks.map((brk, idx) => (
                  <div key={idx} className="flex items-center gap-3 bg-gray-50 p-2 rounded">
                    <input type="text" value={brk.name} onChange={(e) => updateBreak(idx, 'name', e.target.value)} className="border rounded px-2 py-1 text-sm flex-1" placeholder="Break name" />
                    <input type="time" value={brk.startTime} onChange={(e) => updateBreak(idx, 'startTime', e.target.value)} className="border rounded px-2 py-1 text-sm w-28" />
                    <div className="flex items-center gap-1">
                      <input type="number" value={brk.durationMinutes} onChange={(e) => updateBreak(idx, 'durationMinutes', Number(e.target.value))} className="border rounded px-2 py-1 text-sm w-16" min={5} max={120} />
                      <span className="text-xs text-gray-500">min</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-blue-50 rounded">
              <div><div className="text-xs text-gray-500">Gross Hours/Day</div><div className="text-lg font-semibold">{scheduleConfig.grossWorkHoursPerDay}h</div></div>
              <div><div className="text-xs text-gray-500">Total Break Time</div><div className="text-lg font-semibold">{scheduleConfig.totalBreakMinutes}min</div></div>
              <div><div className="text-xs text-gray-500">Net Work Hours/Day</div><div className="text-lg font-semibold text-green-600">{netHours.toFixed(1)}h</div></div>
              <div><div className="text-xs text-gray-500">Net Hours/Week</div><div className="text-lg font-semibold text-blue-600">{(netHours * scheduleConfig.workDays.length).toFixed(1)}h</div></div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={handleSaveConfig} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">Save Configuration</button>
              <button onClick={() => setScheduleConfig({ ...EAT_SCHEDULE_CONFIG })} className="px-4 py-2 border rounded hover:bg-gray-50 text-sm">Reset to Defaults</button>
              {configSaved && <span className="text-sm text-green-600 self-center">✓ Configuration saved!</span>}
            </div>
          </div>
          <div className="bg-white rounded shadow p-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <label className="block"><div className="text-sm text-gray-500">Start</div><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="border rounded px-2 py-1 w-full" /></label>
            <label className="block"><div className="text-sm text-gray-500">End</div><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="border rounded px-2 py-1 w-full" /></label>
            <div className="col-span-2 flex gap-2 justify-end">
              <button className="px-3 py-1 border rounded text-sm hover:bg-gray-50" onClick={() => { setScheduleEntries([]); setAnalysis(null); setDebugInfo(null) }} disabled={loading}>Clear</button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm" onClick={generate} disabled={loading}>{loading ? 'Generating…' : 'Generate Schedule'}</button>
            </div>
          </div>
          {error && <div className="bg-red-50 border border-red-200 rounded p-4"><div className="text-sm text-red-800 font-medium">Error:</div><div className="text-sm text-red-600 mt-1">{error}</div></div>}
          {debugInfo && (
            <div className="bg-blue-50 border border-blue-200 rounded p-4">
              <div className="text-sm text-blue-800 font-medium">Generation Summary (EAT):</div>
              <div className="text-sm text-blue-600 mt-1">
                Found {debugInfo.tasksCount} tasks and {debugInfo.usersCount} users. Generated {debugInfo.scheduledEntries} schedule entries. Net work hours/day: {debugInfo.netWorkHoursPerDay}h ({debugInfo.timezone}).
                {debugInfo.unscheduledTasks > 0 && ` ${debugInfo.unscheduledTasks} tasks could not be fully scheduled.`}
              </div>
            </div>
          )}
          {analysis && <WorkloadDashboard per_user={analysis.per_user} team={analysis.team} fairness={analysis.fairness} />}
          <div className="mt-4"><SchedulePreview entries={scheduleEntries} /></div>
        </div>
      )}

      {/* TAB: Task Capacity Calculator */}
      {activeTab === 'capacity' && (
        <div className="space-y-4">
          <div className="bg-white rounded shadow p-4">
            <h3 className="font-semibold mb-3">Task Capacity Calculator</h3>
            <p className="text-sm text-gray-500 mb-4">Check available time for an engineer on a specific date. Fetches actual task assignments from the database.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Engineer</label>
                <select value={capacityEngineerId} onChange={(e) => setCapacityEngineerId(e.target.value)} className="w-full border rounded px-3 py-2">
                  <option value="">Select engineer...</option>
                  {engineers.map(e => <option key={String(e.id)} value={String(e.id)}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Date</label>
                <input type="date" value={capacityDate} onChange={(e) => setCapacityDate(e.target.value)} className="w-full border rounded px-3 py-2" />
              </div>
              <div className="flex items-end">
                <button onClick={handleCalculateCapacity} disabled={!capacityEngineerId || capacityLoading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm">
                  {capacityLoading ? 'Loading…' : 'Calculate Capacity'}
                </button>
              </div>
            </div>
            {capacityResult && (
              <div className="border rounded p-4 bg-gray-50">
                <h4 className="font-medium mb-3">
                  Capacity for {capacityResult.engineer_name} on {capacityResult.date}
                  {capacityResult.is_weekend && <span className="ml-2 px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">Weekend</span>}
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-white p-3 rounded border"><div className="text-xs text-gray-500">Gross Hours</div><div className="text-xl font-semibold">{capacityResult.gross_hours}h</div></div>
                  <div className="bg-white p-3 rounded border"><div className="text-xs text-gray-500">Break Hours</div><div className="text-xl font-semibold text-orange-600">-{capacityResult.break_hours}h</div></div>
                  <div className="bg-white p-3 rounded border"><div className="text-xs text-gray-500">Leave Hours</div><div className="text-xl font-semibold text-red-600">-{capacityResult.leave_hours}h</div></div>
                  <div className="bg-white p-3 rounded border border-green-200"><div className="text-xs text-gray-500">Net Available</div><div className="text-xl font-semibold text-green-600">{capacityResult.net_available_hours}h</div></div>
                  <div className="bg-white p-3 rounded border"><div className="text-xs text-gray-500">Already Assigned</div><div className="text-xl font-semibold text-blue-600">{capacityResult.assigned_hours}h</div></div>
                  <div className="bg-white p-3 rounded border border-purple-200"><div className="text-xs text-gray-500">Remaining Capacity</div><div className="text-xl font-semibold text-purple-600">{capacityResult.remaining_capacity}h</div></div>
                  {capacityResult.is_weekend && <div className="bg-white p-3 rounded border border-orange-200"><div className="text-xs text-gray-500">Weekend Amendment</div><div className="text-xl font-semibold text-orange-600">{capacityResult.weekend_amendment_hours}h</div></div>}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Duplicate Category Detection */}
      {activeTab === 'duplicates' && (
        <div className="space-y-4">
          <div className="bg-white rounded shadow p-4">
            <h3 className="font-semibold mb-3">Duplicate Category Detection</h3>
            <p className="text-sm text-gray-500 mb-4">Check if an engineer already has tasks in a specific category. Fetches actual task data from the database.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Engineer</label>
                <select value={dupEngineerId} onChange={(e) => { setDupEngineerId(e.target.value); setDupChecked(false) }} className="w-full border rounded px-3 py-2">
                  <option value="">Select engineer...</option>
                  {engineers.map(e => <option key={String(e.id)} value={String(e.id)}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select value={dupCategoryId} onChange={(e) => { setDupCategoryId(e.target.value); const cat = categories.find(c => String(c.id) === e.target.value); setDupCategoryName(cat?.name ?? ''); setDupChecked(false) }} className="w-full border rounded px-3 py-2">
                  <option value="">Select category...</option>
                  {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={handleCheckDuplicates} disabled={!dupEngineerId || !dupCategoryId || dupLoading} className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50 text-sm">
                  {dupLoading ? 'Checking…' : 'Check for Duplicates'}
                </button>
              </div>
            </div>
            {dupChecked && duplicateAlert === null && dupEngineerId && dupCategoryId && (
              <div className="bg-green-50 border border-green-200 rounded p-3"><div className="text-sm text-green-700">✅ No duplicate category assignments found. Safe to assign.</div></div>
            )}
            {duplicateAlert && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
                <div className="text-sm text-yellow-800 font-medium mb-2">{duplicateAlert.message}</div>
                {duplicateAlert.existing_tasks.length > 0 && (
                  <div className="mt-2">
                    <div className="text-xs text-gray-600 mb-1">Existing tasks in this category:</div>
                    <table className="w-full text-xs">
                      <thead><tr className="bg-yellow-100"><th className="p-1 text-left">Task ID</th><th className="p-1 text-left">Description</th><th className="p-1 text-left">Status</th></tr></thead>
                      <tbody>
                        {duplicateAlert.existing_tasks.map((t, i) => (
                          <tr key={i} className="border-t"><td className="p-1">{t.task_id}</td><td className="p-1">{t.description ?? '-'}</td><td className="p-1">{t.status ?? '-'}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Leave Management */}
      {activeTab === 'leave' && (
        <div className="space-y-4">
          <div className="bg-white rounded shadow p-4">
            <h3 className="font-semibold mb-3">Leave / Absence Hour Deduction</h3>
            <p className="text-sm text-gray-500 mb-4">Manage vacation, sick leave, training hours deductions. Data is persisted locally.</p>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 mb-4 items-end">
              <div>
                <label className="block text-xs font-medium mb-1">Engineer</label>
                <select value={String(newLeave.user_id ?? '')} onChange={(e) => setNewLeave(prev => ({ ...prev, user_id: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm">
                  <option value="">Select...</option>
                  {engineers.map(e => <option key={String(e.id)} value={String(e.id)}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Type</label>
                <select value={newLeave.leave_type ?? 'vacation'} onChange={(e) => setNewLeave(prev => ({ ...prev, leave_type: e.target.value as LeaveType }))} className="w-full border rounded px-2 py-1 text-sm">
                  <option value="vacation">Vacation</option><option value="sick_leave">Sick Leave</option><option value="training">Training</option><option value="personal">Personal</option><option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Start Date</label>
                <input type="date" value={newLeave.start_date ?? ''} onChange={(e) => setNewLeave(prev => ({ ...prev, start_date: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">End Date</label>
                <input type="date" value={newLeave.end_date ?? ''} onChange={(e) => setNewLeave(prev => ({ ...prev, end_date: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Hours/Day (blank=full)</label>
                <input type="number" value={newLeave.hours_per_day ?? ''} onChange={(e) => setNewLeave(prev => ({ ...prev, hours_per_day: e.target.value ? Number(e.target.value) : null }))} className="w-full border rounded px-2 py-1 text-sm" placeholder="Full day" min={0} max={24} step={0.5} />
              </div>
              <div>
                <button onClick={handleAddLeave} disabled={!newLeave.user_id || !newLeave.start_date || !newLeave.end_date} className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm w-full">Add Leave</button>
              </div>
            </div>
            {leaveEntries.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-4">No leave entries added yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="p-2 text-left">Engineer</th><th className="p-2 text-left">Type</th><th className="p-2 text-left">Start</th><th className="p-2 text-left">End</th><th className="p-2 text-left">Hours/Day</th><th className="p-2 text-center">Actions</th></tr></thead>
                  <tbody>
                    {leaveEntries.map((entry, idx) => {
                      const eng = engineers.find(e => String(e.id) === String(entry.user_id))
                      return (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          <td className="p-2">{eng?.name ?? entry.user_id}</td>
                          <td className="p-2 capitalize">{entry.leave_type.replace(/_/g, ' ')}</td>
                          <td className="p-2">{entry.start_date}</td><td className="p-2">{entry.end_date}</td>
                          <td className="p-2">{entry.hours_per_day ?? 'Full day'}</td>
                          <td className="p-2 text-center"><button onClick={() => handleRemoveLeave(idx)} className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600">Remove</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Weekend Amendments */}
      {activeTab === 'weekend' && (
        <div className="space-y-4">
          <div className="bg-white rounded shadow p-4">
            <h3 className="font-semibold mb-3">Saturday / Sunday Amendment Controls</h3>
            <p className="text-sm text-gray-500 mb-4">Amend weekend day-off schedules. Only Saturday and Sunday dates are accepted. Data is persisted locally.</p>
            {error && <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 text-sm text-red-700">{error}</div>}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-4 items-end">
              <div>
                <label className="block text-xs font-medium mb-1">Engineer</label>
                <select value={String(newAmendment.user_id ?? '')} onChange={(e) => setNewAmendment(prev => ({ ...prev, user_id: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm">
                  <option value="">Select...</option>
                  {engineers.map(e => <option key={String(e.id)} value={String(e.id)}>{e.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Weekend Date</label>
                <input type="date" value={newAmendment.date ?? ''} onChange={(e) => setNewAmendment(prev => ({ ...prev, date: e.target.value }))} className="w-full border rounded px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Work Hours</label>
                <input type="number" value={newAmendment.work_hours ?? 8} onChange={(e) => setNewAmendment(prev => ({ ...prev, work_hours: Number(e.target.value) }))} className="w-full border rounded px-2 py-1 text-sm" min={1} max={15} step={0.5} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Category (optional)</label>
                <select value={String(newAmendment.category_id ?? '')} onChange={(e) => setNewAmendment(prev => ({ ...prev, category_id: e.target.value ? Number(e.target.value) : undefined }))} className="w-full border rounded px-2 py-1 text-sm">
                  <option value="">Any category</option>
                  {categories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <button onClick={handleAddAmendment} disabled={!newAmendment.user_id || !newAmendment.date} className="px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50 text-sm w-full">Add Amendment</button>
              </div>
            </div>
            {weekendAmendments.length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-4">No weekend amendments added yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50"><tr><th className="p-2 text-left">Engineer</th><th className="p-2 text-left">Date</th><th className="p-2 text-left">Day</th><th className="p-2 text-left">Work Hours</th><th className="p-2 text-left">Category</th><th className="p-2 text-center">Actions</th></tr></thead>
                  <tbody>
                    {weekendAmendments.map((amendment, idx) => {
                      const eng = engineers.find(e => String(e.id) === String(amendment.user_id))
                      const cat = categories.find(c => c.id === amendment.category_id)
                      const d = new Date(amendment.date + 'T00:00:00')
                      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()]
                      return (
                        <tr key={idx} className="border-t hover:bg-gray-50">
                          <td className="p-2">{eng?.name ?? amendment.user_id}</td>
                          <td className="p-2">{amendment.date}</td>
                          <td className="p-2"><span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">{dayName}</span></td>
                          <td className="p-2">{amendment.work_hours}h</td>
                          <td className="p-2">{cat?.name ?? 'Any'}</td>
                          <td className="p-2 text-center"><button onClick={() => handleRemoveAmendment(idx)} className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600">Remove</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Workload Matrix */}
      {activeTab === 'workload' && (
        <div className="space-y-4">
          <div className="bg-white rounded shadow p-4">
            <h3 className="font-semibold mb-3">Role-Based Workload Matrix Dashboard</h3>
            <p className="text-sm text-gray-500 mb-4">Generate and display matrices based on engineer roles reflecting available working hours, utilization rates, fairness metrics (Gini coefficient, standard deviation), and equity management.</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-4">
              <label className="block"><div className="text-sm text-gray-500">Start</div><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="border rounded px-2 py-1 w-full" /></label>
              <label className="block"><div className="text-sm text-gray-500">End</div><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="border rounded px-2 py-1 w-full" /></label>
              <div className="col-span-2 flex gap-2 justify-end">
                <button className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm" onClick={generate} disabled={loading}>{loading ? 'Generating…' : 'Generate Workload Matrix'}</button>
              </div>
            </div>
            {analysis ? (
              <WorkloadDashboard per_user={analysis.per_user} team={analysis.team} fairness={analysis.fairness} />
            ) : (
              <div className="text-sm text-gray-500 text-center py-8">Click "Generate Workload Matrix" to view the role-based workload analysis.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Performance Flow */}
      {activeTab === 'performance' && (
        <div className="space-y-4">
          <div className="bg-white rounded shadow p-4">
            <h3 className="font-semibold mb-3">Performance Flow Integration</h3>
            <p className="text-sm text-gray-500 mb-4">Shows how schedule adherence impacts performance metrics, on-time completion rates, and delay tracking with the modern standard flow.</p>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end mb-4">
              <label className="block"><div className="text-sm text-gray-500">Start</div><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="border rounded px-2 py-1 w-full" /></label>
              <label className="block"><div className="text-sm text-gray-500">End</div><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="border rounded px-2 py-1 w-full" /></label>
              <div className="col-span-2 flex gap-2 justify-end">
                <button className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm" onClick={loadPerformanceData} disabled={loadingPerformance}>{loadingPerformance ? 'Loading…' : 'Load Performance Data'}</button>
              </div>
            </div>
            <div className="bg-gray-50 rounded p-4 mb-4">
              <h4 className="font-medium mb-3">Schedule → Performance Flow</h4>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <div className="px-3 py-2 bg-blue-100 text-blue-800 rounded">📅 Schedule Config</div>
                <span className="text-gray-400">→</span>
                <div className="px-3 py-2 bg-green-100 text-green-800 rounded">📊 Task Assignment</div>
                <span className="text-gray-400">→</span>
                <div className="px-3 py-2 bg-yellow-100 text-yellow-800 rounded">⏱️ Target Days</div>
                <span className="text-gray-400">→</span>
                <div className="px-3 py-2 bg-purple-100 text-purple-800 rounded">✅ Completion</div>
                <span className="text-gray-400">→</span>
                <div className="px-3 py-2 bg-red-100 text-red-800 rounded">🎯 Performance Metrics</div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-blue-50 p-4 rounded border border-blue-200">
                <div className="text-sm text-blue-600">Schedule Adherence</div>
                <div className="text-2xl font-bold text-blue-800">{performanceData?.scheduleAdherence ?? '—'}%</div>
                <div className="text-xs text-blue-500">Tasks completed within scheduled time</div>
              </div>
              <div className="bg-green-50 p-4 rounded border border-green-200">
                <div className="text-sm text-green-600">On-Time Rate</div>
                <div className="text-2xl font-bold text-green-800">{performanceData?.onTimeRate ?? '—'}%</div>
                <div className="text-xs text-green-500">Tasks completed before target date</div>
              </div>
              <div className="bg-orange-50 p-4 rounded border border-orange-200">
                <div className="text-sm text-orange-600">Avg Delay</div>
                <div className="text-2xl font-bold text-orange-800">{performanceData?.avgDelay ?? '—'} days</div>
                <div className="text-xs text-orange-500">Average delay for overdue tasks</div>
              </div>
              <div className="bg-purple-50 p-4 rounded border border-purple-200">
                <div className="text-sm text-purple-600">Utilization Impact</div>
                <div className="text-2xl font-bold text-purple-800">{performanceData?.utilizationImpact ?? '—'}%</div>
                <div className="text-xs text-purple-500">Schedule utilization vs performance</div>
              </div>
            </div>
            <div className="bg-white border rounded p-4">
              <h4 className="font-medium mb-2">EAT Schedule Impact on Performance</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="font-medium text-gray-700">Daily Capacity</div>
                  <div className="text-gray-500">{scheduleConfig.netWorkHoursPerDay}h net work hours per day ({scheduleConfig.workStartTime} - {scheduleConfig.workEndTime} EAT)</div>
                </div>
                <div>
                  <div className="font-medium text-gray-700">Weekly Capacity</div>
                  <div className="text-gray-500">{(scheduleConfig.netWorkHoursPerDay * scheduleConfig.workDays.length).toFixed(1)}h per week ({scheduleConfig.workDays.length} working days)</div>
                </div>
                <div>
                  <div className="font-medium text-gray-700">Break Deductions</div>
                  <div className="text-gray-500">{scheduleConfig.totalBreakMinutes}min daily ({scheduleConfig.breaks.map(b => b.name).join(', ')})</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}