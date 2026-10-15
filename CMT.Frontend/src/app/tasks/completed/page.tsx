'use client'

/**
 * Completed Tasks page — AMENDED (full replacement file)
 * ---------------------------------------------------------------------------
 * 1) TARGET DAY/S DERIVATION
 *    The "Target Day/s" column is derived from the Category Target Days
 *    configuration under Target Durations. Every category has its own
 *    target days / hours / minutes, therefore:
 *
 *        targetDays = days + hours/24 + minutes/1440
 *
 *    The configuration is loaded from
 *        /api/management/target-days   (primary)
 *        /api/reference-data/target-days (fallback)
 *    and matched to each task by `category_id` first, then by `category_name`.
 *    The very same value drives:
 *      - the on-screen "Target Day/s" column,
 *      - the effective Target Completion Date (Task Assigned At + Target Day/s),
 *      - the Early / On-Time / Delayed classification,
 *      - every rate (Early Rate, On-Time Rate, Delayed Rate, Efficiency),
 *      - the exported Excel workbook.
 *
 * 2) DATE RANGE FILTER APPLIED TO THE EXPORT
 *        Start Date -> filters by "Task Assigned At"
 *        End Date   -> filters by "Task Assigned At"
 *    `displayedTasks` is produced by exactly ONE pipeline:
 *        raw -> normalize -> dedupe -> scopeTasksByRole (role structure)
 *            -> filterCompletedTasks (date range + engineer) -> search -> sort
 *    The Excel export receives `displayedTasks` itself, so the workbook can
 *    never contain extra records — neither for a single selected engineer nor
 *    for "All engineers".
 *
 * 3) RATE MODEL — AMENDED so this screen ALWAYS matches Performance Management
 *
 *    Performance Management (the accurate, authoritative view) classifies and
 *    rates every completed task like this, and this page now does EXACTLY the
 *    same, on exactly the same rows:
 *
 *      actual completion  = Engineer Completed At ?? Actual (TL approved)
 *                           Completion Date ?? TL Approval Date
 *      target completion  = effective (extension aware) Target Completion Date,
 *                           falling back to Task Assigned At + Category Target
 *                           Day/s
 *
 *      variance (UTC calendar days) = target day - actual day
 *          > 0  -> EARLY
 *          = 0  -> ON-TIME
 *          < 0  -> DELAYED
 *          no comparable target/actual -> ON-TIME (no deadline to breach)
 *
 *      => Completed = Early + On-Time + Delayed is GUARANTEED, so the counts
 *         can never disagree with the Performance Summary again (this is what
 *         produced "On-Time 16" here versus "On-Time 17" there).
 *
 *      Per task : Rate = (Target Date / Actual Completion Date and Time) x 100,
 *                 measured on the task timeline from the assignment date, i.e.
 *                 (Target Duration / Actual Duration) x 100.
 *      On-Time Rate = 100.00% when one or more tasks are completed exactly on
 *                 the target date/time; otherwise 0.00%.
 *      Early Rate = AVERAGE of the early task rates  -> always above 100%.
 *      Delay Rate = AVERAGE of the delayed task rates -> always below 100%.
 *      Efficiency = (Early Rate + Delay Rate + On-Time Rate) / 3, with an empty
 *                 category counted as a neutral 100%.
 *
 *    IMPORTANT AMENDMENT — the actual completion timestamp is NO LONGER
 *    re-derived from the comment history for ANY metric. That heuristic moved
 *    the actual completion date of several tasks, which shortened the measured
 *    duration and inflated the Early Rate / Efficiency on this screen only
 *    (707.93% / 289.26% instead of the authoritative 590.57% / 250.70%).
 *    Comments are still loaded and exported, but they only feed the Comment
 *    column now.
 *
 *    The restricted performance columns and the rate cards are rendered ONLY
 *    when `canViewPerformanceColumns(role)` is true (Team Leader / Director).
 * ---------------------------------------------------------------------------
 */

import '@/app/globals.css'
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Eye, Download, Search as SearchIcon, CheckCircle, RotateCcw, Edit,
  ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2, MessageSquare, CalendarRange, XCircle,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import TaskDetails from '@/components/TaskDetails'
import apiClient from '@/lib/api'
import ReopenTaskModal from '@/components/ReopenTaskModal'
import RequestAmendmentModal from '@/components/RequestAmendmentModal'
import AmendmentApprovalModal from '@/components/AmendmentApprovalModal'
import AmendmentStatusBadge from '@/components/AmendmentStatusBadge'
import ReopenedTaskBadge from '@/components/ReopenedTaskBadge'
import { useRolePermissions } from '@/hooks/useRolePermissions'
import { useTimezone } from '@/lib/timezone-context'

import {
  calculateTaskRates,
  canViewPerformanceColumns,
  canonicalizeRole,
  collectEngineerOptions,
  deduplicateCompletedTasks,
  filterCompletedTasks,
  formatDays,
  formatRate,
  getEffectiveTargetCompletion,
  getEngineerVarianceDays,
  getTargetDaysValue,
  getVarianceStart,
  isTargetExtended,
  normalizeCompletedTask,
  performanceBadgeClass,
  performanceLabel,
  scopeTasksByRole,
  type CommentsMap,
  type CompletedTaskFilterState,
} from '@/lib/completed-task-metrics'
import { exportCompletedTasksToExcel } from '@/lib/completed-task-export'

type CompletedSortField =
  | 'task_id' | 'serial_number' | 'part_number' | 'description' | 'po_number'
  | 'category_name' | 'assigned_engineer' | 'comment' | 'priority'
  | 'actual_completion_date' | 'target_completion_date' | 'creator_name' | 'shop_name'
type SortDirection = 'asc' | 'desc' | null

interface SortConfig {
  field: CompletedSortField | null
  direction: SortDirection
}

const STORAGE_KEY = 'requestedAmendments'
const SEEN_COMMENTS_KEY = 'completedTasksSeenComments'

/* ═══════════════════════════════════════════════════════════════════════════
 * AMENDED PERFORMANCE MODEL — IDENTICAL TO PERFORMANCE MANAGEMENT
 * ═══════════════════════════════════════════════════════════════════════════
 * Performance Management is the authoritative view, so this screen reproduces
 * its model exactly, on exactly the same task rows.
 *
 * TWO ROOT CAUSES OF THE OLD MISMATCH, BOTH FIXED HERE
 * ---------------------------------------------------------------------------
 * A) UNRECONCILED BUCKETS
 *    A completed task without a comparable target/actual date used to fall into
 *    NO bucket at all, so Early + On-Time + Delayed was 27 + 16 + 9 = 52 while
 *    Completed was 53. Performance Management counts such a task as ON-TIME
 *    (there is no deadline to breach), which is why it correctly reports 17
 *    On-Time tasks. `classifyTaskBucket` below applies the same rule, so
 *
 *        Completed === Early + On-Time + Delayed
 *
 *    is now guaranteed on this screen too.
 *
 * B) COMMENT-DERIVED COMPLETION TIMESTAMP
 *    This page used to re-derive "Engineer Completed At" from the comment
 *    history. That heuristic pulled the actual completion of several tasks
 *    EARLIER than the stored value, which shortened the measured duration and
 *    inflated the rates on this screen only (Early Rate 707.93% / Efficiency
 *    289.26% instead of the authoritative 590.57% / 250.70%).
 *    Metrics now use the SAME stored timestamps the Performance API uses:
 *
 *        Engineer Completed At -> Actual (TL approved) Completion Date
 *                              -> TL Approval Date
 *
 *    Comments are still loaded and exported; they only feed the Comment column.
 *
 * RATE FORMULAS (division-based, averaged — same as Performance Management)
 * ---------------------------------------------------------------------------
 *   Per task     : Rate = (Target Date / Actual Completion Date and Time) x 100,
 *                  measured on the task timeline from the assignment date.
 *   On-Time Rate = 100.00% when one or more tasks are completed exactly on the
 *                  target date/time; otherwise 0.00%.
 *   Early Rate   = AVERAGE of the early task rates   -> always above 100%.
 *   Delay Rate   = AVERAGE of the delayed task rates -> always below 100%.
 *   Efficiency   = (Early Rate + Delay Rate + On-Time Rate) / 3, with an empty
 *                  category counted as a neutral 100%.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Mutually exclusive bucket — `null` is never produced. */
type ReconciledBucket = 'early' | 'on_time' | 'delayed'

interface CompletedPerformanceSummary {
  /** Completed tasks in scope — always Early + On-Time + Delayed. */
  total: number
  earlyCount: number
  onTimeCount: number
  delayedCount: number
  /** Average days saved by the early tasks. */
  avgEarly: number
  /** Average days taken by the on-time tasks. */
  avgOnTime: number
  /** Average days late of the delayed tasks. */
  avgDelayed: number
  avgTargetDays: number
  avgEngineerVariance: number
  /** Count based shares (workload distribution). */
  earlyRate: number
  onTimeRate: number
  delayRate: number
  /** Average of the per-task early rates — above 100%. */
  totalEarlyRate: number
  /** 100.00% when at least one task landed exactly on target, else 0.00%. */
  totalOnTimeRate: number
  /** Average of the per-task delayed rates — below 100%. */
  totalDelayedRate: number
  /** (Early Rate + Delay Rate + On-Time Rate) / 3, empty bucket = 100%. */
  overallEfficiency: number
}

const EMPTY_COMPLETED_SUMMARY: CompletedPerformanceSummary = {
  total: 0, earlyCount: 0, onTimeCount: 0, delayedCount: 0,
  avgEarly: 0, avgOnTime: 0, avgDelayed: 0,
  avgTargetDays: 0, avgEngineerVariance: 0,
  earlyRate: 0, onTimeRate: 0, delayRate: 0,
  totalEarlyRate: 0, totalOnTimeRate: 0, totalDelayedRate: 0,
  overallEfficiency: 0,
}

/** Round to 2 decimals, guarding NaN / Infinity. */
const round2Rate = (value: number): number =>
  Number.isFinite(value) ? Math.round(value * 100) / 100 : 0

/** Arithmetic mean, rounded to 2 decimals. 0 for an empty list. */
const averageRate = (values: number[]): number =>
  values.length === 0 ? 0 : round2Rate(values.reduce((a, b) => a + b, 0) / values.length)

/**
 * FIX (A): reconciled classification.
 * A completed task that cannot be compared against a target date counts as
 * ON-TIME, exactly like Performance Management, so the three buckets always
 * add up to the Completed count.
 */
const classifyTaskBucket = (bucket: 'early' | 'on_time' | 'delayed' | null): ReconciledBucket =>
  bucket === 'early' ? 'early' : bucket === 'delayed' ? 'delayed' : 'on_time'

/**
 * THE single aggregation used by the count cards, the rate cards and the Excel
 * summary row of this screen — mathematically identical to the Performance
 * Summary for the same filters and date range.
 */
function buildCompletedPerformanceSummary(
  tasks: any[],
  targetDaysData: any[],
  enabled: boolean,
  resolveCompletedAt: (task: any) => string | null,
): CompletedPerformanceSummary {
  if (!enabled || !Array.isArray(tasks) || tasks.length === 0) {
    return { ...EMPTY_COMPLETED_SUMMARY }
  }

  const earlyDays: number[] = []
  const onTimeDays: number[] = []
  const delayedDays: number[] = []
  const earlyRates: number[] = []
  const delayedRates: number[] = []
  const targetDaysValues: number[] = []
  const actualDaysValues: number[] = []

  for (const task of tasks) {
    const completedAt = resolveCompletedAt(task)
    const breakdown = calculateTaskRates(task, targetDaysData, completedAt)
    const bucket = classifyTaskBucket(breakdown.bucket)
    const bucketValue = breakdown.bucketValue === null ? 0 : breakdown.bucketValue

    if (bucket === 'early') {
      earlyDays.push(bucketValue)
      // Early rate is ALWAYS above 100% — the earlier, the higher.
      if (breakdown.earlyRate !== null) earlyRates.push(Math.max(breakdown.earlyRate, 100))
    } else if (bucket === 'delayed') {
      delayedDays.push(bucketValue)
      // Delayed rate is ALWAYS below 100% — the later, the lower.
      if (breakdown.delayedRate !== null) delayedRates.push(Math.min(breakdown.delayedRate, 100))
    } else {
      onTimeDays.push(bucketValue)
    }

    if (breakdown.targetDurationDays !== null) targetDaysValues.push(breakdown.targetDurationDays)
    if (breakdown.actualDurationDays !== null) actualDaysValues.push(breakdown.actualDurationDays)
  }

  const total = tasks.length
  const earlyCount = earlyDays.length
  const onTimeCount = onTimeDays.length
  const delayedCount = delayedDays.length

  const share = (count: number) => (total > 0 ? round2Rate((count / total) * 100) : 0)

  // ─── Rate totals (division-based, averaged) ───────────────────────────────
  const totalOnTimeRate = onTimeCount > 0 ? 100 : 0
  const totalEarlyRate = averageRate(earlyRates)
  const totalDelayedRate = averageRate(delayedRates)

  // An empty category is neutral (100%), never a zero that drags the average down.
  const effEarly = earlyRates.length > 0 ? totalEarlyRate : 100
  const effDelayed = delayedRates.length > 0 ? totalDelayedRate : 100
  const effOnTime = onTimeCount > 0 ? totalOnTimeRate : 100
  const overallEfficiency = round2Rate((effEarly + effDelayed + effOnTime) / 3)

  return {
    total,
    earlyCount,
    onTimeCount,
    delayedCount,
    avgEarly: averageRate(earlyDays),
    avgOnTime: averageRate(onTimeDays),
    avgDelayed: averageRate(delayedDays),
    avgTargetDays: averageRate(targetDaysValues),
    avgEngineerVariance: averageRate(actualDaysValues),
    earlyRate: share(earlyCount),
    onTimeRate: totalOnTimeRate,
    delayRate: share(delayedCount),
    totalEarlyRate,
    totalOnTimeRate,
    totalDelayedRate,
    overallEfficiency,
  }
}

/** Persisted so the Performance page can reuse the very same date range. */
const SHARED_RANGE_KEY = 'cmtCompletedTasksDateRange'

export default function CompletedTasksPage(): JSX.Element {
  const { user } = useAuth()
  const { formatDateCustom } = useTimezone()

  const formatDate = useCallback((dateString?: string | null): string => {
    if (!dateString) return 'N/A'
    try {
      const formatted = formatDateCustom(dateString, { day: '2-digit', month: 'short', year: 'numeric' })
      if (!formatted || formatted === '—') return 'N/A'
      return formatted
    } catch {
      return 'N/A'
    }
  }, [formatDateCustom])

  const formatDateTime = useCallback((dateString?: string | null): string => {
    if (!dateString) return 'N/A'
    try {
      const formatted = formatDateCustom(dateString, {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: false,
      })
      if (!formatted || formatted === '—') return 'N/A'
      return formatted
    } catch {
      return 'N/A'
    }
  }, [formatDateCustom])

  const formatDateTimeForExport = useCallback((dateString?: string | null): string => {
    if (!dateString) return 'N/A'
    try {
      const formatted = formatDateCustom(dateString, {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
      })
      if (!formatted || formatted === '—') return 'N/A'
      return formatted
    } catch {
      return 'N/A'
    }
  }, [formatDateCustom])

  // ─── Data state ──────────────────────────────────────────────────────────
  const [tasks, setTasks] = useState<any[]>([])
  const [targetDaysData, setTargetDaysData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingExport, setLoadingExport] = useState(false)

  // ─── Filter state ────────────────────────────────────────────────────────
  const [fromDate, setFromDate] = useState<string>('')
  const [toDate, setToDate] = useState<string>('')
  const [selectedEngineer, setSelectedEngineer] = useState<string>('') // '' => all
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('completed_desc')
  const [showDuplicates, setShowDuplicates] = useState(false)
  const [dateRangeError, setDateRangeError] = useState<string | null>(null)

  const [reopenTaskFor, setReopenTaskFor] = useState<any | null>(null)
  const [amendmentTaskFor, setAmendmentTaskFor] = useState<any | null>(null)
  const [amendmentApprovalFor, setAmendmentApprovalFor] = useState<any | null>(null)
  const [selectedTask, setSelectedTask] = useState<any | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [requestedAmendments, setRequestedAmendments] = useState<Set<number>>(new Set())
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: null, direction: null })

  const [allCommentsMap, setAllCommentsMap] = useState<CommentsMap>({})
  const [loadingComments, setLoadingComments] = useState(false)
  const allCommentsMapRef = useRef<CommentsMap>({})
  const [commentsVersion, setCommentsVersion] = useState(0)

  useEffect(() => { allCommentsMapRef.current = allCommentsMap }, [allCommentsMap])

  const [commentsDialogOpen, setCommentsDialogOpen] = useState(false)
  const [commentsDialogTaskId, setCommentsDialogTaskId] = useState<number | null>(null)

  const [seenComments, setSeenComments] = useState<Set<number>>(() => {
    try {
      if (typeof window === 'undefined') return new Set<number>()
      const raw = localStorage.getItem(SEEN_COMMENTS_KEY)
      if (!raw) return new Set<number>()
      const arr = JSON.parse(raw)
      if (!Array.isArray(arr)) return new Set<number>()
      return new Set<number>(arr.map((n: any) => Number(n)).filter((n: number) => !Number.isNaN(n)))
    } catch {
      return new Set<number>()
    }
  })

  const [fieldDialogOpen, setFieldDialogOpen] = useState(false)
  const [fieldDialogData, setFieldDialogData] = useState<{ field: string; value: string; taskId: number } | null>(null)
  const [fieldExpanded, setFieldExpanded] = useState(false)

  const containerRef = useRef<HTMLDivElement | null>(null)

  // ─── Role resolution ─────────────────────────────────────────────────────
  const role = canonicalizeRole(user?.role ?? user?.roleDisplayName ?? user?.roleDisplay ?? '')
  const isTLorDirector = ['team_leader', 'director'].includes(role)
  /** The single gate for the restricted columns / rate cards. */
  const showPerformanceColumns = canViewPerformanceColumns(role)
  const { canReopenTask, canRequestAmendment: rbacCanRequestAmendment, isPrivilegedRole } = useRolePermissions()

  const isStatusCompleted = (s: any) => {
    if (s === null || s === undefined) return false
    if (typeof s === 'number') return s === 2
    const st = String(s).toLowerCase()
    return st === 'completed' || st === 'done'
  }

  const persistSeenComments = useCallback((s: Set<number>) => {
    try {
      if (typeof window === 'undefined') return
      localStorage.setItem(SEEN_COMMENTS_KEY, JSON.stringify(Array.from(s.values())))
    } catch (e) {
      console.error('Failed to persist seenComments', e)
    }
  }, [])

  const markCommentSeen = useCallback((taskId: number) => {
    setSeenComments(prev => {
      const copy = new Set(prev)
      copy.add(taskId)
      persistSeenComments(copy)
      return copy
    })
  }, [persistSeenComments])

  const loadRequestedAmendmentsFromStorage = useCallback(() => {
    try {
      if (typeof window === 'undefined') return new Set<number>()
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return new Set<number>()
      const arr = JSON.parse(raw)
      if (!Array.isArray(arr)) return new Set<number>()
      return new Set<number>(arr.map((n: any) => Number(n)).filter((n: number) => !Number.isNaN(n)))
    } catch {
      return new Set<number>()
    }
  }, [])

  const persistRequestedAmendmentsToStorage = useCallback((s: Set<number>) => {
    try {
      if (typeof window === 'undefined') return
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(s.values())))
    } catch (e) {
      console.error('Failed to persist requestedAmendments', e)
    }
  }, [])

  useEffect(() => {
    setRequestedAmendments(loadRequestedAmendmentsFromStorage())
  }, [loadRequestedAmendmentsFromStorage])

  // ─── Restore / persist the shared date range ─────────────────────────────
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      const raw = localStorage.getItem(SHARED_RANGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.fromDate === 'string') setFromDate(parsed.fromDate)
        if (typeof parsed.toDate === 'string') setToDate(parsed.toDate)
        if (typeof parsed.engineer === 'string') setSelectedEngineer(parsed.engineer)
      }
    } catch {
      /* ignore malformed storage */
    }
  }, [])

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return
      localStorage.setItem(SHARED_RANGE_KEY, JSON.stringify({
        fromDate, toDate, engineer: selectedEngineer,
      }))
    } catch {
      /* storage is optional */
    }
  }, [fromDate, toDate, selectedEngineer])

  // ─── Comments fetching ───────────────────────────────────────────────────
  const fetchAllCommentsForTasks = useCallback(async (taskList: any[]) => {
    if (!taskList || taskList.length === 0) return
    setLoadingComments(true)
    const commentsMap: CommentsMap = {}
    const BATCH_SIZE = 10

    for (let i = 0; i < taskList.length; i += BATCH_SIZE) {
      const batch = taskList.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(batch.map(async (t) => {
        const displayId = Number(t.task_id)
        if (!displayId) return { displayId, comments: [] as any[] }
        const completedTaskId = t.completed_task_id ?? null
        const originalTaskId = t.original_task_id ?? null

        const isEmpty = (data: any) =>
          !data ||
          (Array.isArray(data) && data.length === 0) ||
          (!Array.isArray(data) && (!data.comments || data.comments.length === 0) && (!data.data || data.data.length === 0))

        let data: any = null
        try { data = await apiClient.get(`/tasks/${displayId}/comments`) } catch { /* ignore */ }

        if (isEmpty(data) && completedTaskId) {
          try {
            const alt = await apiClient.get(`/tasks/completed/${completedTaskId}/comments`)
            if (!isEmpty(alt)) data = alt
          } catch { /* ignore */ }
        }
        if (isEmpty(data) && originalTaskId && Number(originalTaskId) !== displayId) {
          try {
            const alt = await apiClient.get(`/tasks/${originalTaskId}/comments`)
            if (!isEmpty(alt)) data = alt
          } catch { /* ignore */ }
        }
        if (!data) return { displayId, comments: [] as any[] }

        const list = Array.isArray(data) ? data : data?.comments ?? data?.data ?? []
        const normalized = list.map((c: any) => ({
          comment_id: c.comment_id ?? c.commentId ?? c.id,
          content: c.content ?? c.comment_text ?? c.commentText ?? '',
          author_name: c.author_name ?? c.authorName ?? 'System',
          created_at: c.created_at ?? c.createdAt ?? '',
          comment_type: c.comment_type ?? c.commentType ?? 'UserComment',
        }))
        return { displayId, comments: normalized }
      }))

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          const { displayId, comments } = result.value
          if (displayId && comments.length > 0) commentsMap[displayId] = comments
        }
      }
    }

    allCommentsMapRef.current = commentsMap
    setAllCommentsMap(commentsMap)
    setCommentsVersion(v => v + 1)
    setLoadingComments(false)
  }, [])

  // ─── Target Day/s configuration (Category Target Days) ───────────────────
  useEffect(() => {
    let mounted = true
    const loadTargetDays = async () => {
      const endpoints = ['/api/management/target-days', '/api/reference-data/target-days']
      for (const url of endpoints) {
        try {
          const res = await fetch(url, { credentials: 'include', headers: { Accept: 'application/json' }, cache: 'no-cache' })
          if (!res.ok) continue
          const body = await res.json().catch(() => null)
          const list = Array.isArray(body) ? body : body?.data ?? body?.targetDays ?? []
          if (Array.isArray(list) && list.length > 0) {
            if (mounted) setTargetDaysData(list)
            return
          }
        } catch (e) {
          console.warn(`[completed-tasks] target days load failed: ${url}`, e)
        }
      }
      if (mounted) setTargetDaysData([])
    }
    loadTargetDays()
    return () => { mounted = false }
  }, [])

  // ─── Load completed tasks ────────────────────────────────────────────────
  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const body = await apiClient.getCompletedTasks({ pageNumber: 1, pageSize: 10000 })
      const list: any[] = Array.isArray(body)
        ? body
        : ((body as any)?.tasks || (body as any)?.data || [])

      const normalized = deduplicateCompletedTasks(list.map(normalizeCompletedTask))
      setTasks(normalized)
      fetchAllCommentsForTasks(normalized)

      const storageSet = loadRequestedAmendmentsFromStorage()
      let changed = false
      for (const t of normalized) {
        if (t.amendment_request && storageSet.has(Number(t.task_id))) {
          storageSet.delete(Number(t.task_id))
          changed = true
        }
      }
      if (changed) {
        setRequestedAmendments(new Set(storageSet))
        persistRequestedAmendmentsToStorage(storageSet)
      }
    } catch (e) {
      console.error('Failed to load completed tasks', e)
      setError('Failed to load completed tasks')
    } finally {
      setLoading(false)
    }
  }, [fetchAllCommentsForTasks, loadRequestedAmendmentsFromStorage, persistRequestedAmendmentsToStorage])

  useEffect(() => { loadTasks() }, [loadTasks])

  // ─── Comments helpers ────────────────────────────────────────────────────
  const getCommentsArray = useCallback((taskId: number) => allCommentsMap[taskId] || [], [allCommentsMap])

  const getAllCommentsText = useCallback((taskId: number, fallback: string): string => {
    const list = allCommentsMap[taskId]
    if (list && list.length > 0) {
      return list
        .map(c => `[${c.author_name || 'Unknown'}]: ${(c.content || '').trim()}`)
        .join('\n')
    }
    return fallback || ''
  }, [allCommentsMap])

  const getAllCommentsTextStable = useCallback((taskId: number, fallback: string): string => {
    const list = allCommentsMapRef.current[taskId]
    if (list && list.length > 0) {
      return list
        .map(c => `[${c.author_name || 'Unknown'}]: ${(c.content || '').trim()}`)
        .join('\n')
    }
    return fallback || ''
  }, [])

  const getAllCommentsTextForExport = useCallback((taskId: number, fallback: string): string => {
    const list = allCommentsMapRef.current[taskId]
    if (list && list.length > 0) {
      return [...list]
        .sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime())
        .map((c) => {
          const dateStr = c.created_at ? formatDateTimeForExport(c.created_at) : ''
          const typeTag = c.comment_type && c.comment_type !== 'UserComment' ? ` (${c.comment_type})` : ''
          return `[${dateStr}] ${c.author_name || 'Unknown'}${typeTag}: ${(c.content || '').trim()}`
        })
        .join(' | ')
    }
    return fallback || ''
  }, [formatDateTimeForExport])

  /**
   * FIX (B): THE actual completion timestamp used by EVERY metric on this page.
   *
   * It uses ONLY the stored timestamps, in the very same priority order the
   * Performance API uses:
   *
   *     Engineer Completed At -> Actual (TL approved) Completion Date
   *                           -> TL Approval Date
   *
   * The previous comment-history heuristic (`deriveEngineerCompletedAt`) is
   * deliberately NOT used any more: it moved the actual completion of several
   * tasks earlier, shortened the measured duration and inflated the Early Rate
   * and Efficiency on this screen only. Comments are still fetched and
   * exported — they simply no longer influence any calculation.
   */
  const resolveEngineerCompletedAt = useCallback((task: any): string | null => (
    task?.engineer_completed_at ??
    task?.actual_completion_date ??
    task?.tl_approval_date ??
    null
  ), [])

  // ─── Single pipeline shared by the table AND the export ──────────────────
  const roleScopedTasks = useMemo(() => scopeTasksByRole(tasks, {
    role,
    userId: user?.userId ?? user?.id ?? user?.user_id,
    userName: user?.fullName ?? user?.full_name ?? user?.name ?? user?.username,
    shopId: user?.shopId ?? user?.shop_id,
  }), [tasks, role, user])

  const engineerOptions = useMemo(() => collectEngineerOptions(roleScopedTasks), [roleScopedTasks])

  /**
   * Active filters for the date range:
   *   fromDate -> "Task Assigned At" (assigned on or after this date)
   *   toDate   -> "Task Assigned At" (assigned on or before this date)
   */
  const activeFilters: CompletedTaskFilterState = useMemo(() => ({
    fromDate: fromDate || null,
    toDate: toDate || null,
    engineerNames: selectedEngineer ? [selectedEngineer] : [],
  }), [fromDate, toDate, selectedEngineer])

  useEffect(() => {
    if (fromDate && toDate && fromDate > toDate) {
      setDateRangeError('"Start Date" must be earlier than or equal to the "End Date".')
    } else {
      setDateRangeError(null)
    }
  }, [fromDate, toDate])

  const displayedTasks = useMemo(() => {
    let list = filterCompletedTasks(roleScopedTasks, activeFilters)

    if (!showDuplicates) list = list.filter(t => !t.is_duplicate)

    if (searchTerm && searchTerm.trim() !== '') {
      const q = searchTerm.trim().toLowerCase()
      list = list.filter((t) => {
        const taskId = String(t.task_id ?? '').toLowerCase()
        return (
          taskId.startsWith(q) ||
          `tc-${taskId}`.startsWith(q) ||
          String(t.serial_number ?? '').toLowerCase().startsWith(q) ||
          String(t.part_number ?? '').toLowerCase().startsWith(q) ||
          String(t.po_number ?? '').toLowerCase().startsWith(q)
        )
      })
    }

    const priorityScore = (p = '') => {
      const key = String(p).toLowerCase()
      if (key.includes('critical')) return 4
      if (key.includes('high')) return 3
      if (key.includes('medium')) return 2
      if (key.includes('low')) return 1
      return 0
    }
    const timeOf = (v?: string | null) => new Date(v || 0).getTime()

    if (sortConfig.field && sortConfig.direction) {
      const dir = sortConfig.direction === 'asc' ? 1 : -1
      list = [...list].sort((a, b) => {
        switch (sortConfig.field) {
          case 'task_id': return dir * (a.task_id - b.task_id)
          case 'serial_number': return dir * String(a.serial_number ?? '').localeCompare(String(b.serial_number ?? ''))
          case 'part_number': return dir * String(a.part_number ?? '').localeCompare(String(b.part_number ?? ''))
          case 'description': return dir * String(a.description ?? '').localeCompare(String(b.description ?? ''))
          case 'po_number': return dir * String(a.po_number ?? '').localeCompare(String(b.po_number ?? ''))
          case 'category_name': return dir * String(a.category_name ?? '').localeCompare(String(b.category_name ?? ''))
          case 'assigned_engineer': return dir * String(a.assigned_engineer ?? '').localeCompare(String(b.assigned_engineer ?? ''))
          case 'comment': return dir * getAllCommentsTextStable(Number(a.task_id), a.comments)
            .localeCompare(getAllCommentsTextStable(Number(b.task_id), b.comments))
          case 'priority': return dir * (priorityScore(a.priority_level_name) - priorityScore(b.priority_level_name))
          case 'actual_completion_date': return dir * (timeOf(a.actual_completion_date) - timeOf(b.actual_completion_date))
          case 'target_completion_date': return dir * (
            timeOf(getEffectiveTargetCompletion(a, targetDaysData)) -
            timeOf(getEffectiveTargetCompletion(b, targetDaysData))
          )
          case 'creator_name': return dir * String(a.creator_name ?? '').localeCompare(String(b.creator_name ?? ''))
          case 'shop_name': return dir * String(a.shop_name ?? '').localeCompare(String(b.shop_name ?? ''))
          default: return 0
        }
      })
    } else {
      list = [...list].sort((a, b) => {
        switch (sortBy) {
          case 'completed_asc': return timeOf(a.actual_completion_date) - timeOf(b.actual_completion_date)
          case 'priority_desc': return priorityScore(b.priority_level_name) - priorityScore(a.priority_level_name)
          case 'priority_asc': return priorityScore(a.priority_level_name) - priorityScore(b.priority_level_name)
          case 'completed_desc':
          default: return timeOf(b.actual_completion_date) - timeOf(a.actual_completion_date)
        }
      })
    }

    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleScopedTasks, activeFilters, showDuplicates, searchTerm, sortBy, sortConfig, commentsVersion, targetDaysData])

  const totalCompleted = displayedTasks.length
  const totalSeen = useMemo(
    () => displayedTasks.filter(t => seenComments.has(Number(t.task_id))).length,
    [displayedTasks, seenComments]
  )

  /**
   * The Performance Summary of this screen — computed from `displayedTasks`,
   * i.e. from the SAME task-level rows the table and the Excel export use,
   * with the SAME filters and date range, through the SAME reconciled buckets
   * and division-based averaged rates as Performance Management.
   *
   * Consequence: Completed = Early + On-Time + Delayed, and the Early Rate,
   * On-Time Rate, Delay Rate and Efficiency shown here are identical to the
   * Performance Summary for the same selection.
   */
  const summary = useMemo(
    () => buildCompletedPerformanceSummary(
      displayedTasks, targetDaysData, showPerformanceColumns, resolveEngineerCompletedAt,
    ),
    [displayedTasks, targetDaysData, showPerformanceColumns, resolveEngineerCompletedAt]
  )

  // ─── Export ──────────────────────────────────────────────────────────────
  const handleExportExcel = useCallback(async () => {
    if (dateRangeError) {
      alert(dateRangeError)
      return
    }
    if (!displayedTasks.length) {
      alert('No completed tasks match the selected filters — nothing to export.')
      return
    }
    setLoadingExport(true)
    try {
      if (loadingComments) {
        try { await fetchAllCommentsForTasks(displayedTasks) } catch { /* keep going */ }
      }
      const exported = exportCompletedTasksToExcel({
        tasks: displayedTasks,
        targetDaysData,
        // Intentionally EMPTY: the workbook must be rated from the stored
        // completion timestamps only, exactly like the summary above and like
        // Performance Management. The full comment history still reaches the
        // "Comments" column through `formatComments` below.
        commentsMap: {},
        role,
        currentUserName: user?.fullName ?? user?.name ?? user?.username ?? '',
        filters: activeFilters,
        formatDateTime: formatDateTimeForExport,
        formatComments: getAllCommentsTextForExport,
      })
      console.info(`[completed-tasks] exported ${exported} record(s) matching the selected filters`)
    } catch (e) {
      console.error('Export failed', e)
      alert('Failed to export the Excel file')
    } finally {
      setLoadingExport(false)
    }
  }, [
    dateRangeError, displayedTasks, loadingComments, fetchAllCommentsForTasks, targetDaysData,
    role, user, activeFilters, formatDateTimeForExport, getAllCommentsTextForExport,
  ])

  // ─── Misc handlers ───────────────────────────────────────────────────────
  const handleSort = (field: CompletedSortField) => {
    setSortConfig(prev => {
      if (prev.field === field) {
        if (prev.direction === 'asc') return { field, direction: 'desc' }
        if (prev.direction === 'desc') return { field: null, direction: null }
      }
      return { field, direction: 'asc' }
    })
  }

  const getSortIcon = (field: CompletedSortField) => {
    if (sortConfig.field !== field) return <ArrowUpDown className="h-4 w-4 ml-1 opacity-40" />
    if (sortConfig.direction === 'asc') return <ArrowUp className="h-4 w-4 ml-1 text-blue-600" />
    if (sortConfig.direction === 'desc') return <ArrowDown className="h-4 w-4 ml-1 text-blue-600" />
    return <ArrowUpDown className="h-4 w-4 ml-1 opacity-40" />
  }

  const clearFilters = () => {
    setFromDate('')
    setToDate('')
    setSelectedEngineer('')
    setSearchTerm('')
    setSortConfig({ field: null, direction: null })
  }

  const openDetailsForTask = (taskObj: any) => {
    setSelectedTask({ ...taskObj, is_completed_task: true })
    setDetailsOpen(true)
  }

  const getCreatorDisplay = (taskObj: any) => {
    if (!taskObj) return 'N/A'
    if (taskObj.creator_name && String(taskObj.creator_name).trim() !== '') return taskObj.creator_name
    if (taskObj.created_by) return String(taskObj.created_by)
    return 'N/A'
  }

  const handleAmendmentSuccess = useCallback((taskObj: any) => {
    if (taskObj?.task_id) {
      setRequestedAmendments(prev => {
        const copy = new Set(prev)
        copy.add(Number(taskObj.task_id))
        persistRequestedAmendmentsToStorage(copy)
        return copy
      })
    }
    setAmendmentTaskFor(null)
    loadTasks()
  }, [loadTasks, persistRequestedAmendmentsToStorage])

  const handleReopenSuccess = useCallback(() => {
    const reopenedTaskId = reopenTaskFor?.task_id
    setReopenTaskFor(null)
    if (reopenedTaskId) {
      setTasks(prev => prev.filter(t => Number(t.task_id) !== Number(reopenedTaskId)))
    }
    loadTasks()
  }, [loadTasks, reopenTaskFor])

  const canRequestAmendment = (taskObj: any) => {
    if (!rbacCanRequestAmendment && !isPrivilegedRole) return false
    if (requestedAmendments.has(Number(taskObj.task_id))) return false
    const amendmentStatus = Number(taskObj.amendment_status ?? 0)
    const amendmentRequest = Number(taskObj.amendment_request ?? 0)
    if (amendmentRequest === 0 && amendmentStatus === 0) return true
    return amendmentStatus === 3
  }

  const isAmendmentPendingTL = (taskObj: any) => {
    if (!taskObj) return false
    const req = Number(taskObj.amendment_request ?? 0)
    const status = Number(taskObj.amendment_status ?? 0)
    return req > 0 && (status === 0 || status === 1)
  }

  const truncateComment = (comment: string, maxLen = 60) => {
    if (!comment || comment.trim() === '') return '—'
    return comment.length <= maxLen ? comment : `${comment.substring(0, maxLen)}…`
  }

  const showFieldDialog = (field: string, value: string, taskId: number) => {
    setFieldExpanded(false)
    setFieldDialogData({ field, value: value ?? '', taskId })
    setFieldDialogOpen(true)
  }

  const FIELD_TRUNCATE = 200
  const renderFieldValue = (value: string) => {
    if (!value || value.length <= FIELD_TRUNCATE || fieldExpanded) {
      return <div className="break-words text-gray-700">{value || '—'}</div>
    }
    return (
      <div>
        <div className="break-words text-gray-700">{`${value.substring(0, FIELD_TRUNCATE)}…`}</div>
        <Button variant={'outline' as any} size="sm" className="mt-2" onClick={() => setFieldExpanded(true)}>Show Full</Button>
      </div>
    )
  }

  const columnCount = 12 + (showPerformanceColumns ? 7 : 0)

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl md:text-3xl font-semibold leading-tight">Completed Tasks</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {(role === 'shop_tl' || role === 'shop_manager') && 'Showing completed tasks from your shop only'}
              {role === 'engineer' && 'Showing completed tasks assigned to you'}
              {(role === 'customer' || role === 'customer_personnel') && 'Showing completed tasks you created'}
              {isTLorDirector && 'Showing all completed tasks within your scope'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-gray-700">
                {isTLorDirector ? (
                  <>
                    <span className="text-green-600 font-bold">{totalSeen}</span>
                    <span className="text-gray-400 mx-1">/</span>
                    <span className="font-bold">{totalCompleted}</span>
                    <span className="text-gray-500 ml-1 hidden sm:inline">checked</span>
                  </>
                ) : (
                  <>
                    <span className="font-bold">{totalCompleted}</span>
                    <span className="text-gray-500 ml-1 hidden sm:inline">
                      completed {totalCompleted === 1 ? 'task' : 'tasks'}
                    </span>
                  </>
                )}
              </span>
            </div>
            <Button
              onClick={handleExportExcel}
              disabled={loadingExport || !displayedTasks.length || !!dateRangeError}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              {loadingExport ? 'Exporting...' : 'Export Excel'}
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4">
          {error && <div className="text-sm text-red-600 mb-4">{error}</div>}
          {loading && <div className="text-sm text-gray-600">Loading completed tasks...</div>}

          {!loading && (
            <>
              {/* ─── FILTER BAR ─────────────────────────────────────────── */}
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 mb-4">
                <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-gray-700">
                  <CalendarRange className="h-4 w-4 text-blue-600" />
                  Export filters — the Excel file contains exactly the rows shown below
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                    Start Date (Task Assigned At)
                    <input
                      type="date"
                      value={fromDate}
                      max={toDate || undefined}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                    <span className="text-[10px] text-gray-400 mt-0.5">Tasks assigned from this date</span>
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                    End Date (Task Assigned At)
                    <input
                      type="date"
                      value={toDate}
                      min={fromDate || undefined}
                      onChange={(e) => setToDate(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                    />
                    <span className="text-[10px] text-gray-400 mt-0.5">Tasks assigned up to this date</span>
                  </label>

                  <label className="flex flex-col gap-1 text-xs font-medium text-gray-600">
                    Engineer
                    <select
                      value={selectedEngineer}
                      onChange={(e) => setSelectedEngineer(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-primary focus:outline-none"
                    >
                      <option value="">All engineers</option>
                      {engineerOptions.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </label>

                  <div className="flex items-end">
                    <Button
                      variant={'outline' as any}
                      onClick={clearFilters}
                      className="w-full flex items-center justify-center gap-2 !bg-transparent !hover:bg-transparent"
                    >
                      <XCircle className="h-4 w-4" />
                      Clear filters
                    </Button>
                  </div>
                </div>

                {dateRangeError && <div className="text-xs text-red-600 mt-2">{dateRangeError}</div>}

                <div className="text-xs text-gray-600 mt-2">
                  {fromDate || toDate
                    ? `Task Assigned At: ${fromDate || 'any'} → ${toDate || 'any'}`
                    : 'Date range: all dates'}
                  {' · '}
                  {selectedEngineer ? `Engineer: ${selectedEngineer}` : 'Engineer: all'}
                  {' · '}
                  <span className="font-semibold">{totalCompleted}</span> record{totalCompleted === 1 ? '' : 's'} will be exported
                </div>
                <div className="text-[11px] text-gray-500 mt-1">
                  Performance Management analyses this exact date range, so its Performance Summary
                  always matches the extracted Excel data.
                </div>
              </div>

              {/* ─── SEARCH + SORT ───────────────────────────────────────── */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search by Task ID, Serial Number, Part Number, or PO Number"
                      className="w-full border border-gray-200 rounded-lg px-10 py-3 shadow-sm focus:ring-2 focus:ring-primary focus:outline-none"
                      aria-label="Search completed tasks"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  <select
                    value={sortBy}
                    onChange={(e) => { setSortBy(e.target.value); setSortConfig({ field: null, direction: null }) }}
                    className="border rounded-lg px-3 py-2 shadow-sm"
                  >
                    <option value="completed_desc">Sort: Newest Completed</option>
                    <option value="completed_asc">Sort: Oldest Completed</option>
                    <option value="priority_desc">Sort: Priority (High → Low)</option>
                    <option value="priority_asc">Sort: Priority (Low → High)</option>
                  </select>

                  <button
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border ${showDuplicates ? 'bg-gray-100' : 'bg-white'}`}
                    onClick={() => setShowDuplicates(s => !s)}
                    aria-pressed={showDuplicates}
                    title="Toggle showing duplicate tasks"
                  >
                    {showDuplicates ? 'Duplicates: ON' : 'Show Duplicates'}
                  </button>
                </div>
              </div>

              {/* ─── COUNTS + AVERAGES (TL / Director only) ─────────────── */}
              {showPerformanceColumns && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-3">
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="text-xs text-gray-500">Avg Target Day/s</div>
                      <div className="text-lg font-bold text-gray-800">{summary.avgTargetDays.toFixed(2)}</div>
                    </div>
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                      <div className="text-xs text-green-700">Average of Early (days)</div>
                      <div className="text-lg font-bold text-green-800">{summary.avgEarly.toFixed(2)}</div>
                    </div>
                    <div className="rounded-lg border border-green-200 bg-white p-3">
                      <div className="text-xs text-gray-500">Early Tasks</div>
                      <div className="text-lg font-bold text-green-700">
                        {summary.earlyCount} <span className="text-xs font-normal text-gray-500">({formatRate(summary.earlyRate)})</span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                      <div className="text-xs text-blue-700">Average On-Time (days)</div>
                      <div className="text-lg font-bold text-blue-800">{summary.avgOnTime.toFixed(2)}</div>
                    </div>
                    <div className="rounded-lg border border-blue-200 bg-white p-3">
                      <div className="text-xs text-gray-500">On-Time Tasks</div>
                      <div className="text-lg font-bold text-blue-700">
                        {summary.onTimeCount} <span className="text-xs font-normal text-gray-500">({formatRate(summary.onTimeRate)})</span>
                      </div>
                    </div>
                    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <div className="text-xs text-red-700">Delayed Tasks</div>
                      <div className="text-lg font-bold text-red-800">
                        {summary.delayedCount}
                        <span className="text-xs font-normal text-gray-600 ml-1">
                          · avg {summary.avgDelayed.toFixed(2)} day(s)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* RATE TOTALS — identical to Performance Management */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="rounded-lg border border-green-300 bg-green-50 p-3">
                      <div className="text-xs text-green-700" title="Average of (Target Duration / Actual Early Completion Duration) × 100 — the earlier, the higher">
                        Early Rate
                      </div>
                      <div className="text-lg font-bold text-green-800">{formatRate(summary.totalEarlyRate)}</div>
                    </div>
                    <div className="rounded-lg border border-blue-300 bg-blue-50 p-3">
                      <div className="text-xs text-blue-700" title="100.00% when one or more tasks are completed exactly on the target date/time; otherwise 0.00%">
                        On-Time Rate
                      </div>
                      <div className="text-lg font-bold text-blue-800">{formatRate(summary.totalOnTimeRate)}</div>
                    </div>
                    <div className="rounded-lg border border-red-300 bg-red-50 p-3">
                      <div className="text-xs text-red-700" title="Average of (Target Duration / Actual Delayed Completion Duration) × 100 — the higher the delay, the lower the rate">
                        Delay Rate
                      </div>
                      <div className="text-lg font-bold text-red-800">{formatRate(summary.totalDelayedRate)}</div>
                    </div>
                    <div className="rounded-lg border border-purple-300 bg-purple-50 p-3">
                      <div className="text-xs text-purple-700" title="(Early Rate + Delay Rate + On-Time Rate) / 3, with an empty category counted as a neutral 100%">
                        Efficiency
                      </div>
                      <div className="text-lg font-bold text-purple-800">{formatRate(summary.overallEfficiency)}</div>
                    </div>
                  </div>
                </>
              )}

              {/* ─── TABLE ───────────────────────────────────────────────── */}
              <div className="completed-task-table-container" ref={containerRef}>
                <Table className="completed-task-table">
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('task_id')}>
                        <div className="flex items-center">Task ID{getSortIcon('task_id')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('serial_number')}>
                        <div className="flex items-center">Serial Number{getSortIcon('serial_number')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('part_number')}>
                        <div className="flex items-center">Part Number{getSortIcon('part_number')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('description')}>
                        <div className="flex items-center">Description{getSortIcon('description')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('po_number')}>
                        <div className="flex items-center">PO Number{getSortIcon('po_number')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('category_name')}>
                        <div className="flex items-center">Category{getSortIcon('category_name')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('assigned_engineer')}>
                        <div className="flex items-center">Engineer{getSortIcon('assigned_engineer')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('comment')}>
                        <div className="flex items-center">
                          <MessageSquare className="h-4 w-4 mr-1" />Comment{getSortIcon('comment')}
                        </div>
                      </TableHead>

                      {/* Restricted columns (TL / Director only) */}
                      {showPerformanceColumns && (
                        <>
                          <TableHead className="cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('target_completion_date')}>
                            <div className="flex items-center">Target Completion Date{getSortIcon('target_completion_date')}</div>
                          </TableHead>
                          <TableHead title="Derived from the Category Target Days under Target Durations">Target Day/s</TableHead>
                          <TableHead>Performance</TableHead>
                          <TableHead>Early / On-Time / Delayed (days)</TableHead>
                          <TableHead title="Early: Target/Actual x 100 (>100%) · On-Time: 100% · Delayed: Target/Actual x 100 (<100%)">Task Rate</TableHead>
                          <TableHead>Engineer Variance</TableHead>
                          <TableHead>Engineer Completed At</TableHead>
                        </>
                      )}

                      <TableHead className="cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('actual_completion_date')}>
                        <div className="flex items-center">Actual Completion{getSortIcon('actual_completion_date')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('creator_name')}>
                        <div className="flex items-center">Created By{getSortIcon('creator_name')}</div>
                      </TableHead>
                      <TableHead className="cursor-pointer hover:bg-gray-100 select-none" onClick={() => handleSort('shop_name')}>
                        <div className="flex items-center">Shop{getSortIcon('shop_name')}</div>
                      </TableHead>
                      <TableHead className="sticky-action-column">Actions</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {displayedTasks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={columnCount} className="text-center p-8 text-muted">
                          No completed tasks match the selected filters.
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayedTasks.map((taskObj: any) => {
                        const taskId = Number(taskObj.task_id)
                        const isSeen = seenComments.has(taskId)
                        const hasComment = taskObj.comments && String(taskObj.comments).trim() !== ''
                        const engineerCompletedAt = resolveEngineerCompletedAt(taskObj)
                        const breakdown = showPerformanceColumns
                          ? calculateTaskRates(taskObj, targetDaysData, engineerCompletedAt)
                          : null

                        return (
                          <TableRow
                            key={`${taskObj.task_id}-${taskObj.serial_number || ''}`}
                            className={`transition-colors hover:bg-gray-50 ${taskObj.show_revision_alert ? 'bg-yellow-50' : ''}`}
                          >
                            <TableCell className="font-medium align-top">
                              <div className="flex flex-col gap-2">
                                <span className="text-sm font-semibold">TC-{taskObj.task_id}</span>
                                <div className="flex flex-wrap gap-2 items-center">
                                  {taskObj.is_reopened && (
                                    <ReopenedTaskBadge isReopened={taskObj.is_reopened} reopenCount={taskObj.reopen_count} />
                                  )}
                                  {Number(taskObj.amendment_status) > 0 && (
                                    <AmendmentStatusBadge status={taskObj.amendment_status} />
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="align-top">
                              <span
                                className="text-sm cursor-pointer text-blue-700 hover:underline"
                                onClick={() => showFieldDialog('Serial Number', taskObj.serial_number, taskId)}
                              >
                                {taskObj.serial_number || <span className="text-gray-400">—</span>}
                              </span>
                            </TableCell>

                            <TableCell className="align-top">
                              <span
                                className="text-sm cursor-pointer text-blue-700 hover:underline"
                                onClick={() => showFieldDialog('Part Number', taskObj.part_number, taskId)}
                              >
                                {taskObj.part_number || <span className="text-gray-400">—</span>}
                              </span>
                            </TableCell>

                            <TableCell className="align-top max-w-md">
                              <div
                                className="text-sm text-gray-700 break-words cursor-pointer hover:text-blue-600"
                                onClick={() => showFieldDialog('Description', String(taskObj.description ?? ''), taskId)}
                              >
                                {taskObj.description || '—'}
                              </div>
                            </TableCell>

                            <TableCell className="align-top">
                              {taskObj.po_number ? (
                                <span
                                  className="text-sm cursor-pointer text-blue-700 hover:underline"
                                  onClick={() => showFieldDialog('PO Number', taskObj.po_number, taskId)}
                                >
                                  {taskObj.po_number}
                                </span>
                              ) : <span className="text-gray-400">—</span>}
                            </TableCell>

                            <TableCell className="align-top">
                              <div className="text-sm">{taskObj.category_name || '—'}</div>
                            </TableCell>

                            <TableCell className="align-top">
                              <div className="text-sm">{String(taskObj.assigned_engineer || '').replace(/,/g, ', ') || '—'}</div>
                            </TableCell>

                            <TableCell className="align-top">
                              {(() => {
                                const fetched = getCommentsArray(taskId)
                                const allText = getAllCommentsText(taskId, taskObj.comments)
                                const hasAny = allText.trim() !== ''
                                const count = fetched.length > 0 ? fetched.length : (hasComment ? 1 : 0)
                                return (
                                  <div className="flex items-start gap-2">
                                    <div
                                      className="text-sm text-gray-600 max-w-[200px] break-words cursor-pointer hover:text-blue-600"
                                      onClick={() => {
                                        if (hasAny) {
                                          setCommentsDialogTaskId(taskId)
                                          setCommentsDialogOpen(true)
                                        }
                                      }}
                                    >
                                      {hasAny ? (
                                        <>
                                          {truncateComment(allText, 80)}
                                          {count > 1 && (
                                            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                              {count}
                                            </span>
                                          )}
                                        </>
                                      ) : loadingComments ? (
                                        <span className="text-gray-400 italic">Loading...</span>
                                      ) : (
                                        <span className="text-gray-400 italic">No comment</span>
                                      )}
                                    </div>
                                    {isTLorDirector && hasAny && (
                                      <button
                                        onClick={() => markCommentSeen(taskId)}
                                        className={`flex-shrink-0 mt-0.5 ${isSeen ? 'text-green-600 cursor-default' : 'text-gray-300 hover:text-green-500'}`}
                                        title={isSeen ? 'Comment reviewed' : 'Mark as reviewed'}
                                        disabled={isSeen}
                                      >
                                        <CheckCircle2 className="h-5 w-5" />
                                      </button>
                                    )}
                                  </div>
                                )
                              })()}
                            </TableCell>

                            {/* Restricted cells (TL / Director only) */}
                            {showPerformanceColumns && breakdown && (
                              <>
                                <TableCell className="align-top">
                                  <div className="text-sm">
                                    {formatDateTime(getEffectiveTargetCompletion(taskObj, targetDaysData))}
                                  </div>
                                  {isTargetExtended(taskObj, targetDaysData) && (
                                    <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
                                      Extended
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="align-top">
                                  <div className="text-sm font-medium">{formatDays(getTargetDaysValue(taskObj, targetDaysData))}</div>
                                </TableCell>
                                <TableCell className="align-top">
                                  <span className={performanceBadgeClass(breakdown.bucket)}>{performanceLabel(breakdown.bucket)}</span>
                                </TableCell>
                                <TableCell className="align-top">
                                  <div className="text-sm">{formatDays(breakdown.bucketValue)}</div>
                                </TableCell>
                                <TableCell className="align-top">
                                  <div className={`text-sm font-semibold ${
                                    breakdown.bucket === 'early' ? 'text-green-700'
                                      : breakdown.bucket === 'delayed' ? 'text-red-700'
                                        : breakdown.bucket === 'on_time' ? 'text-blue-700' : 'text-gray-500'
                                  }`}>
                                    {breakdown.taskRate === null ? 'N/A' : formatRate(breakdown.taskRate)}
                                  </div>
                                </TableCell>
                                <TableCell className="align-top">
                                  <div className="text-sm">{formatDays(getEngineerVarianceDays(taskObj, engineerCompletedAt))}</div>
                                </TableCell>
                                <TableCell className="align-top">
                                  <div className="text-sm">{formatDateTime(engineerCompletedAt)}</div>
                                  <div className="text-xs text-gray-400">
                                    assigned: {formatDateTime(getVarianceStart(taskObj))}
                                  </div>
                                </TableCell>
                              </>
                            )}

                            <TableCell className="align-top">
                              <div className="text-sm">{formatDateTime(taskObj.actual_completion_date)}</div>
                            </TableCell>

                            <TableCell className="align-top">
                              <div className="text-sm">{getCreatorDisplay(taskObj)}</div>
                            </TableCell>

                            <TableCell className="align-top">
                              <div className="text-sm">{taskObj.shop_name || 'N/A'}</div>
                            </TableCell>

                            <TableCell className="sticky-action-column align-top p-3">
                              <div className="flex flex-wrap gap-2 items-center">
                                <Button onClick={() => openDetailsForTask(taskObj)} className="h-9 px-3 flex items-center gap-2" title="View Details">
                                  <Eye className="h-4 w-4" />
                                  <span className="hidden md:inline">Details</span>
                                </Button>

                                {isTLorDirector && isAmendmentPendingTL(taskObj) && (
                                  <Button
                                    onClick={() => setAmendmentApprovalFor(taskObj)}
                                    className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                    <span className="hidden sm:inline">Review Amendment</span>
                                  </Button>
                                )}

                                {canRequestAmendment(taskObj) && isStatusCompleted(taskObj.status) && (
                                  <Button
                                    onClick={() => setAmendmentTaskFor({
                                      task_id: taskObj.task_id,
                                      serial_number: taskObj.serial_number,
                                      created_by: taskObj.created_by,
                                    })}
                                    className="h-9 px-3 bg-yellow-600 hover:bg-yellow-700 text-white flex items-center gap-2"
                                  >
                                    <Edit className="h-4 w-4" />
                                    <span className="hidden sm:inline">Request Amendment</span>
                                  </Button>
                                )}

                                {canReopenTask && isStatusCompleted(taskObj.status) && (
                                  <Button
                                    onClick={() => setReopenTaskFor({
                                      task_id: taskObj.task_id,
                                      serial_number: taskObj.serial_number,
                                      assigned_engineer: taskObj.assigned_engineer,
                                    })}
                                    className="h-9 px-3 bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2"
                                  >
                                    <RotateCcw className="h-4 w-4" />
                                    <span className="hidden sm:inline">Reopen</span>
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        {/* ─── DIALOGS / MODALS ──────────────────────────────────────────── */}
        <Dialog open={detailsOpen} onOpenChange={(open) => { if (!open) { setDetailsOpen(false); setSelectedTask(null) } }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Task Details {selectedTask ? `TC-${selectedTask.task_id}` : ''}</DialogTitle>
            </DialogHeader>
            <div className="p-2">
              {selectedTask
                ? <TaskDetails taskId={selectedTask.task_id} task={selectedTask} />
                : <div className="text-sm text-gray-600">Loading task details...</div>}
            </div>
          </DialogContent>
        </Dialog>

        <ReopenTaskModal
          isOpen={!!reopenTaskFor}
          onClose={() => setReopenTaskFor(null)}
          task={reopenTaskFor}
          allEngineers={[]}
          onSuccess={handleReopenSuccess}
        />

        <RequestAmendmentModal
          isOpen={!!amendmentTaskFor}
          onClose={() => setAmendmentTaskFor(null)}
          task={amendmentTaskFor}
          onSuccess={() => handleAmendmentSuccess(amendmentTaskFor)}
        />

        <AmendmentApprovalModal
          isOpen={!!amendmentApprovalFor}
          onClose={() => setAmendmentApprovalFor(null)}
          task={amendmentApprovalFor}
          onSuccess={() => { setAmendmentApprovalFor(null); loadTasks() }}
        />

        <Dialog open={commentsDialogOpen} onOpenChange={(open) => { if (!open) { setCommentsDialogOpen(false); setCommentsDialogTaskId(null) } }}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                All Comments {commentsDialogTaskId ? `— TC-${commentsDialogTaskId}` : ''}
              </DialogTitle>
            </DialogHeader>
            <div className="p-2 space-y-4">
              {(() => {
                if (!commentsDialogTaskId) return <p className="text-gray-500 text-sm">No task selected.</p>
                const fetched = getCommentsArray(commentsDialogTaskId)
                const taskObj = tasks.find(t => Number(t.task_id) === commentsDialogTaskId)

                if (fetched.length > 0) {
                  return fetched.map((comment, idx) => (
                    <div key={comment.comment_id ?? `comment-${idx}`} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 text-xs font-bold">
                            {(comment.author_name || 'S').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{comment.author_name || 'System'}</p>
                          <p className="text-xs text-gray-500">{comment.created_at ? formatDate(comment.created_at) : '—'}</p>
                        </div>
                      </div>
                      <div className="mt-3 text-gray-700 text-sm whitespace-pre-line">{comment.content}</div>
                    </div>
                  ))
                }

                if (taskObj && String(taskObj.comments ?? '').trim() !== '') {
                  return (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <p className="font-medium text-gray-900 text-sm mb-2">Initial Comment</p>
                      <div className="text-gray-700 text-sm whitespace-pre-line">{taskObj.comments}</div>
                    </div>
                  )
                }

                return <p className="text-gray-500 text-sm text-center py-4">No comments found for this task.</p>
              })()}
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={fieldDialogOpen} onOpenChange={(open) => { setFieldDialogOpen(open); if (!open) { setFieldDialogData(null); setFieldExpanded(false) } }}>
          <DialogContent className="max-w-xl max-h-[70vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{fieldDialogData ? `${fieldDialogData.field} — TC-${fieldDialogData.taskId}` : ''}</DialogTitle>
            </DialogHeader>
            <div className="p-3">
              {fieldDialogData ? renderFieldValue(fieldDialogData.value) : <div className="text-gray-400">No data.</div>}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}