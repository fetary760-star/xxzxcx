'use client'

import '@/app/globals.css'
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Eye, Download, Search as SearchIcon, CheckCircle, RotateCcw, Edit, ArrowUpDown, ArrowUp, ArrowDown, CheckCircle2, MessageSquare } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import TaskDetails from '@/components/TaskDetails'
import apiClient from '@/lib/api'
import ReopenTaskModal from '@/components/ReopenTaskModal'
import RequestAmendmentModal from '@/components/RequestAmendmentModal'
import AmendmentApprovalModal from '@/components/AmendmentApprovalModal'
import AmendmentStatusBadge from '@/components/AmendmentStatusBadge'
import ReopenedTaskBadge from '@/components/ReopenedTaskBadge'
import { useRolePermissions } from '@/hooks/useRolePermissions'

function canonicalizeRole(raw: any): string {
  if (raw === null || raw === undefined) return ''
  if (typeof raw === 'number') {
    const map: Record<string, string> = { 0: 'team_leader', 1: 'director', 2: 'engineer', 3: 'customer', 4: 'customer_personnel', 5: 'shop_tl', 6: 'manager', 7: 'admin', 8: 'shop_manager' }
    return map[String(raw)] ?? String(raw)
  }
  return String(raw).trim().toLowerCase().replace(/[\s\-_]+/g, '_')
}

import { useTimezone } from '@/lib/timezone-context'

function getPriorityBadgeClass(p?: any) {
  if (p === null || p === undefined) return 'inline-flex items-center bg-gray-200 text-gray-700 font-semibold px-2 py-1 rounded text-xs'
  const key = String(p).toLowerCase()
  if (key.includes('critical')) return 'inline-flex items-center bg-red-700 text-white font-semibold px-2 py-1 rounded text-xs'
  if (key.includes('high')) return 'inline-flex items-center bg-rose-500 text-white font-semibold px-2 py-1 rounded text-xs'
  if (key.includes('medium')) return 'inline-flex items-center bg-yellow-500 text-white font-semibold px-2 py-1 rounded text-xs'
  if (key.includes('low')) return 'inline-flex items-center bg-green-600 text-white font-semibold px-2 py-1 rounded text-xs'
  return 'inline-flex items-center bg-gray-200 text-gray-700 font-semibold px-2 py-1 rounded text-xs'
}

function humanizeStatus(s: any): string {
  if (s === null || s === undefined) return 'N/A'
  if (typeof s === 'number') {
    const map: Record<number, string> = {
      0: 'Pending',
      1: 'In Progress',
      2: 'Completed',
      3: 'Blocked',
      4: 'On Hold',
      5: 'Cancelled'
    }
    return map[s] ?? String(s)
  }
  const cleaned = String(s).toLowerCase().trim()
  if (cleaned === '') return 'N/A'
  if (cleaned.match(/completed|done|complete/)) return 'Completed'
  if (cleaned.match(/inprogress|in progress/)) return 'In Progress'
  if (cleaned.match(/pending/)) return 'Pending'
  if (cleaned.match(/blocked/)) return 'Blocked'
  if (cleaned.match(/onhold|on hold/)) return 'On Hold'
  if (cleaned.match(/cancelled|canceled/)) return 'Cancelled'
  return String(s).split(/[_\s-]+/).map((w:string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function parseAmendmentStatus(raw: any): number {
  if (raw === null || raw === undefined) return 0
  if (typeof raw === 'number' && !isNaN(raw)) return Number(raw)
  const v = String(raw).trim().toLowerCase()
  if (v === '') return 0
  if (v.includes('pending') && (v.includes('tl') || v.includes('review'))) return 0
  if (v.includes('forward') && v.includes('director')) return 1
  if (v.includes('approved') || v.includes('approve')) return 2
  if (v.includes('rejected') || v.includes('reject')) return 3
  const n = Number(raw)
  if (!isNaN(n)) return n
  return 0
}

// ─── Sorting types (same as TaskTable) ───
type CompletedSortField = 'task_id' | 'serial_number' | 'part_number' | 'description' | 'po_number' | 'category_name' | 'assigned_engineer' | 'comment' | 'priority' | 'actual_completion_date' | 'creator_name' | 'shop_name'
type SortDirection = 'asc' | 'desc' | null

interface SortConfig {
  field: CompletedSortField | null
  direction: SortDirection
}

// ─── Local storage keys ───
const STORAGE_KEY = 'requestedAmendments'
const SEEN_COMMENTS_KEY = 'completedTasksSeenComments'

export default function CompletedTasksPage(): JSX.Element {
  const { user } = useAuth()
  const { formatDateCustom } = useTimezone()
  const formatDate = (dateString?: string | null): string => {
    if (!dateString) return 'N/A'
    try {
      const formatted = formatDateCustom(dateString, { day: '2-digit', month: 'short', year: 'numeric' })
      if (!formatted || formatted === '—') return 'N/A'
      const parts = formatted.replace(',', '').split(' ')
      if (parts.length === 3) {
        const [month, day, year] = parts
        return `${day.padStart(2, '0')}/${month}/${year}`
      }
      return formatted
    } catch {
      return 'N/A'
    }
  }

  // CRITICAL FIX: Format date WITH time for Actual Completion timestamps
  const formatDateTime = (dateString?: string | null): string => {
    if (!dateString) return 'N/A'
    try {
      const formatted = formatDateCustom(dateString, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      if (!formatted || formatted === '—') return 'N/A'
      return formatted
    } catch {
      return 'N/A'
    }
  }

  const [tasks, setTasks] = useState<any[]>([])
  // NEW: Category Target Days configuration (from "Add New Target Duration").
  // Used to resolve the "Target Day/s" column and to classify each task as
  // Early / On-Time / Delayed.
  const [targetDaysData, setTargetDaysData] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingExport, setLoadingExport] = useState(false)

  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('completed_desc')
  const [showDuplicates, setShowDuplicates] = useState(false)

  const [reopenTaskFor, setReopenTaskFor] = useState<any | null>(null)
  const [amendmentTaskFor, setAmendmentTaskFor] = useState<any | null>(null)
  const [amendmentApprovalFor, setAmendmentApprovalFor] = useState<any | null>(null)

  const [selectedTask, setSelectedTask] = useState<any | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const [requestedAmendments, setRequestedAmendments] = useState<Set<number>>(new Set())

  // ─── Column sorting state (same pattern as TaskTable) ───
  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: null, direction: null })

  // ─── All comments map: keyed by task_id (display ID), value is array of comment objects ───
  const [allCommentsMap, setAllCommentsMap] = useState<Record<number, Array<{ comment_id?: number; content: string; author_name: string; created_at: string; comment_type?: string }>>>({})
  const [loadingComments, setLoadingComments] = useState(false)

  // ─── Stable ref for allCommentsMap to avoid search re-triggering on async comment load ───
  const allCommentsMapRef = useRef<Record<number, Array<{ comment_id?: number; content: string; author_name: string; created_at: string; comment_type?: string }>>>({})
  // Version counter: incremented once when comments finish loading, to trigger a single controlled re-filter
  const [commentsVersion, setCommentsVersion] = useState(0)

  // Keep the ref in sync with state
  useEffect(() => {
    allCommentsMapRef.current = allCommentsMap
  }, [allCommentsMap])

  // ─── Comments dialog state ───
  const [commentsDialogOpen, setCommentsDialogOpen] = useState(false)
  const [commentsDialogTaskId, setCommentsDialogTaskId] = useState<number | null>(null)

  // ─── Seen comments tracking (persisted in localStorage) ───
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

  // Field dialog states
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false)
  const [fieldDialogData, setFieldDialogData] = useState<{ field: string; value: string; taskId: number } | null>(null)
  const [fieldExpanded, setFieldExpanded] = useState(false)

  // Ref for scroll container
  const containerRef = useRef<HTMLDivElement | null>(null)
  const topScrollbarRef = useRef<HTMLDivElement | null>(null)
  const topScrollbarInnerRef = useRef<HTMLDivElement | null>(null)


  const role = canonicalizeRole(user?.role ?? user?.roleDisplayName ?? user?.roleDisplay ?? '')
  const userId = user?.userId ?? user?.id ?? user?.user_id
  const isTLorDirector = ['team_leader', 'director'].includes(role)
  const { canReopenTask, canRequestAmendment: rbacCanRequestAmendment, isPrivilegedRole } = useRolePermissions()

  const isStatusCompleted = (s: any) => {
    if (s === null || s === undefined) return false
    if (typeof s === 'number') return s === 2
    const st = String(s).toLowerCase()
    return st === 'completed' || st === 'done'
  }

  const normalizeTask = (t: any) => {
    const completedTaskId = t.completedTaskId ?? t.completed_task_id ?? t.CompletedTaskId ?? null
    const originalId = t.originalTaskId ?? t.original_task_id ?? t.OriginalTaskId ?? null
    
    const displayTaskId = originalId ?? completedTaskId ?? t.task_id ?? t.id ?? t.taskId ?? 0

    let shopName = t.shopName ?? t.shop_name ?? t.ShopName ?? ''
    if (!shopName || shopName === 'Unknown') {
      shopName = t.shop?.name ?? t.shop?.Name ?? t.shop?.shop_name ?? ''
    }
    if (!shopName || String(shopName).trim() === '') shopName = 'Unknown'

    const rawAmendmentRequest = t.amendmentRequest ?? t.amendment_request ?? t.AmendmentRequest ?? 0
    const amendmentRequestFlag = !!(rawAmendmentRequest === true || Number(rawAmendmentRequest) === 1)

    const rawAmendmentStatus = t.amendmentStatus ?? t.amendment_status ?? t.AmendmentStatus ?? null
    const amendmentStatusCode = parseAmendmentStatus(rawAmendmentStatus)

    // Extract comments from the task data
    const comments = t.comments ?? t.Comments ?? t.comment ?? t.Comment ?? ''

    return {
      task_id: Number(displayTaskId ?? 0),
      completed_task_id: completedTaskId,
      original_task_id: originalId,
      serial_number: t.serialNumber ?? t.serial_number ?? t.SerialNumber ?? '',
      part_number: t.partNumber ?? t.part_number ?? t.PartNumber ?? '',
            description: t.description ?? t.Description ?? '',
      po_number: t.poNumber ?? t.po_number ?? t.PoNumber ?? '',
      // NEW: keep the raw category id so "Target Day/s" can be resolved from
      // the Category Target Days configuration (Add New Target Duration).
      category_id: t.categoryId ?? t.category_id ?? t.CategoryId ?? t.category?.id ?? t.category?.categoryId ?? null,
      category_name: t.categoryName ?? t.category_name ?? t.CategoryName ?? '',
      status: t.status ?? t.Status ?? 'Completed',
      assigned_engineer: t.assignedEngineer ?? t.assigned_engineer ?? t.assigned ?? '',
      priority_level_name: t.priorityName ?? t.priority_level_name ?? t.priority ?? '',
      created_by: t.createdBy ?? t.created_by ?? t.creator_id ?? null,
      creator_name: t.createdByName ?? t.creator_name ?? t.created_by_name ?? t.creator ?? '',
      target_completion_date: t.targetCompletionDate ?? t.target_completion_date ?? t.TargetCompletionDate ?? t.target_completion ?? null,
      actual_completion_date: t.actualCompletionDate ?? t.actual_completion_date ?? t.ActualCompletionDate ?? t.actual_completion ?? t.completedAt ?? t.completed_at ?? t.CompletedAt ?? null,
      attachment_path: t.attachmentPath ?? t.attachment_path ?? t.attachment ?? null,
      amendment_request: amendmentRequestFlag ? 1 : 0,
      amendment_status: amendmentStatusCode,
      amendment_reason: t.amendmentReason ?? t.amendment_reason ?? '',
      show_revision_alert: Boolean(t.showRevisionAlert ?? t.show_revision_alert ?? 0),
      is_duplicate: !!(t.isDuplicate ?? t.is_duplicate),
      is_reopened: !!(t.isReopened ?? t.is_reopened),
      reopen_count: Number(t.reopenCount ?? t.reopen_count ?? 0),
      shop_id: t.shopId ?? t.shop_id ?? null,
      shop_name: shopName,
      created_at: t.created_at ?? t.createdAt ?? t.CreatedAt ?? t.taskCreatedAt ?? t.TaskCreatedAt ?? null,
      updated_at: t.updated_at ?? t.updatedAt ?? t.UpdatedAt ?? t.taskUpdatedAt ?? t.TaskUpdatedAt ?? null,
      // NEW: Capture "Task assigned at" timestamp so variance can be measured
      // from assignment time rather than creation time.
      task_assigned_at: t.task_assigned_at ?? t.taskAssignedAt ?? t.TaskAssignedAt ?? t.assigned_at ?? t.assignedAt ?? t.AssignedAt ?? null,
      comments: String(comments ?? ''),
      is_completed_task: true,
      // Pass through phone-related fields so TaskDetails can display them
      engineer_phone_number: t.engineerPhoneNumber ?? t.engineer_phone_number ?? t.EngineerPhoneNumber ?? t.assigned_engineer_phone ?? t.assignedEngineerPhone ?? null,
      creator_phone_number: t.creatorPhoneNumber ?? t.creator_phone_number ?? t.CreatorPhoneNumber ?? t.created_by_phone ?? t.createdByPhone ?? t.team_leader_phone ?? t.teamLeaderPhone ?? t.phoneExtension ?? t.phone_extension ?? t.PhoneExtension ?? t.phone_ext ?? null,
      phone_extension: t.phoneExtension ?? t.phone_extension ?? t.PhoneExtension ?? t.phone_ext ?? null,
      engineer_completed_at: t.engineerCompletedAt ?? t.engineer_completed_at ?? t.EngineerCompletedAt ?? null,
      raw: t
    }
  }

  // ─── Persist seen comments ───
  const persistSeenComments = useCallback((s: Set<number>) => {
    try {
      if (typeof window === 'undefined') return
      localStorage.setItem(SEEN_COMMENTS_KEY, JSON.stringify(Array.from(s.values())))
    } catch (e) {
      console.error('Failed to persist seenComments to storage', e)
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

  // ─── FIXED: Fetch all comments for each task using the SAME logic as TaskDetails ───
  const fetchAllCommentsForTasks = useCallback(async (taskList: any[]) => {
    if (!taskList || taskList.length === 0) return
    setLoadingComments(true)
    const commentsMap: Record<number, Array<{ comment_id?: number; content: string; author_name: string; created_at: string; comment_type?: string }>> = {}

    // Fetch comments in parallel with a concurrency limit to avoid overwhelming the server
    const BATCH_SIZE = 10
    for (let i = 0; i < taskList.length; i += BATCH_SIZE) {
      const batch = taskList.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async (t) => {
          const displayId = Number(t.task_id)
          if (!displayId || displayId === 0) return { displayId, comments: [] }

          const completedTaskId = t.completed_task_id ?? null
          const originalTaskId = t.original_task_id ?? null

          try {
            let data: any = null

            // STRATEGY 1: Use regular task comments endpoint with the original/display task ID
            try {
              data = await apiClient.get(`/tasks/${displayId}/comments`)
            } catch {}

            // STRATEGY 2: If regular endpoint returned nothing and we have a completed_task_id, try completed endpoint
            if ((!data || (Array.isArray(data) && data.length === 0) ||
                 (data && !Array.isArray(data) && (!data.comments || data.comments.length === 0) && (!data.data || data.data.length === 0)))
                && completedTaskId) {
              try {
                const completedData = await apiClient.get(`/tasks/completed/${completedTaskId}/comments`)
                if (completedData) {
                  const completedList = Array.isArray(completedData) ? completedData : completedData?.comments ?? completedData?.data ?? []
                  if (completedList.length > 0) {
                    data = completedData
                  }
                }
              } catch {}
            }

            // STRATEGY 3: If still nothing, try originalTaskId explicitly
            if ((!data || (Array.isArray(data) && data.length === 0) ||
                 (data && !Array.isArray(data) && (!data.comments || data.comments.length === 0) && (!data.data || data.data.length === 0)))
                && originalTaskId && Number(originalTaskId) !== displayId) {
              try {
                const origData = await apiClient.get(`/tasks/${originalTaskId}/comments`)
                if (origData) {
                  const origList = Array.isArray(origData) ? origData : origData?.comments ?? origData?.data ?? []
                  if (origList.length > 0) {
                    data = origData
                  }
                }
              } catch {}
            }

            if (!data) return { displayId, comments: [] }
            const commentsList = Array.isArray(data) ? data : data?.comments ?? data?.data ?? []
            const normalized = commentsList.map((c: any) => ({
              comment_id: c.comment_id ?? c.commentId ?? c.id,
              content: c.content ?? c.comment_text ?? c.commentText ?? '',
              author_name: c.author_name ?? c.authorName ?? 'System',
              created_at: c.created_at ?? c.createdAt ?? '',
              comment_type: c.comment_type ?? c.commentType ?? 'UserComment',
            }))
            return { displayId, comments: normalized }
          } catch {
            return { displayId, comments: [] }
          }
        })
      )

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          const { displayId, comments } = result.value
          if (displayId && comments.length > 0) {
            commentsMap[displayId] = comments
          }
        }
      }
    }

    allCommentsMapRef.current = commentsMap
    setAllCommentsMap(commentsMap)
    setCommentsVersion(v => v + 1)
    setLoadingComments(false)
  }, [])

  const loadRequestedAmendmentsFromStorage = useCallback(() => {
    try {
      if (typeof window === 'undefined') return new Set<number>()
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return new Set<number>()
      const arr = JSON.parse(raw)
      if (!Array.isArray(arr)) return new Set<number>()
      return new Set<number>(arr.map((n: any) => Number(n)).filter((n: number) => !Number.isNaN(n)))
    } catch (e) {
      console.error('Failed to load requestedAmendments from storage', e)
      return new Set<number>()
    }
  }, [])

  const persistRequestedAmendmentsToStorage = useCallback((s: Set<number>) => {
    try {
      if (typeof window === 'undefined') return
      const arr = Array.from(s.values())
      localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
    } catch (e) {
      console.error('Failed to persist requestedAmendments to storage', e)
    }
  }, [])

  useEffect(() => {
    const setFromStorage = loadRequestedAmendmentsFromStorage()
    setRequestedAmendments(setFromStorage)
  }, [loadRequestedAmendmentsFromStorage])

  // ─── NEW: Load Category Target Days (Target Day/s per category) ───
  // Tries the management endpoint first (TL/Director/Engineer) and falls back to
  // the reference-data endpoint, which is readable by customer/shop roles too.
  useEffect(() => {
    let mounted = true
    const loadTargetDays = async () => {
      const endpoints = ['/api/management/target-days', '/api/reference-data/target-days']
      for (const url of endpoints) {
        try {
          const res = await fetch(url, {
            credentials: 'include',
            headers: { Accept: 'application/json' },
            cache: 'no-cache',
          })
          if (!res.ok) continue
          const body = await res.json().catch(() => null)
          const list = Array.isArray(body) ? body : body?.data ?? body?.targetDays ?? []
          if (Array.isArray(list) && list.length > 0) {
            if (mounted) setTargetDaysData(list)
            return
          }
        } catch (e) {
          console.warn(`[completed-tasks] Failed to load target days from ${url}`, e)
        }
      }
      if (mounted) setTargetDaysData([])
    }
    loadTargetDays()
    return () => { mounted = false }
  }, [])

  const refreshTasks = useCallback(async () => {
    setLoading(true)
    try {
      // NOTE: The API route now handles multi-page fetching internally (up to 10,000 tasks).
      // We pass a large pageSize to signal intent, but the server-side route iterates all pages.
      const body = await apiClient.getCompletedTasks({ pageNumber: 1, pageSize: 10000 })
      
      let list: any[] = []
      if (Array.isArray(body)) {
        list = body
      } else if (body && typeof body === 'object') {
        list = (body as any).tasks || (body as any).data || []
      }

      const normalized = list.map(normalizeTask)

      // CRITICAL FIX: Deduplicate by task_id (display ID / originalTaskId).
      // When a task is reopened and completed again, multiple completed_task records
      // can share the same originalTaskId. Keep only the most recent entry per task_id.
      const deduplicatedMap = new Map<number, any>()
      for (const t of normalized) {
        const key = Number(t.task_id)
        if (key === 0) continue
        const existing = deduplicatedMap.get(key)
        if (!existing) {
          deduplicatedMap.set(key, t)
        } else {
          const existingDate = new Date(existing.actual_completion_date || 0).getTime()
          const newDate = new Date(t.actual_completion_date || 0).getTime()
          if (newDate > existingDate) {
            deduplicatedMap.set(key, t)
          } else if (newDate === existingDate) {
            const existingCtId = Number(existing.completed_task_id ?? 0)
            const newCtId = Number(t.completed_task_id ?? 0)
            if (newCtId > existingCtId) {
              deduplicatedMap.set(key, t)
            }
          }
        }
      }
      const deduplicated = Array.from(deduplicatedMap.values())

      setTasks(deduplicated)

      // Fetch all comments for each task in the background
      fetchAllCommentsForTasks(deduplicated)

      try {
        const storageSet = loadRequestedAmendmentsFromStorage()
        let changed = false
        for (const t of deduplicated) {
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
        console.error('Failed to reconcile requestedAmendments with backend', e)
      }
    } catch (e) {
      console.error('Failed to refresh tasks', e)
      setError('Failed to load completed tasks')
    } finally {
      setLoading(false)
    }
  }, [loadRequestedAmendmentsFromStorage, persistRequestedAmendmentsToStorage, fetchAllCommentsForTasks])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        // NOTE: The API route now handles multi-page fetching internally (up to 10,000 tasks).
        const body = await apiClient.getCompletedTasks({ pageNumber: 1, pageSize: 10000 })
        
        let list: any[] = []
        if (Array.isArray(body)) {
          list = body
        } else if (body && typeof body === 'object') {
          list = (body as any).tasks || (body as any).data || []
        }

        const normalized = list.map(normalizeTask)

        // CRITICAL FIX: Deduplicate by task_id (display ID / originalTaskId).
        // When a task is reopened and completed again, multiple completed_task records
        // can share the same originalTaskId. Keep only the most recent entry per task_id
        // (highest completed_task_id or latest actual_completion_date).
        const deduplicatedMap = new Map<number, any>()
        for (const t of normalized) {
          const key = Number(t.task_id)
          if (key === 0) continue
          const existing = deduplicatedMap.get(key)
          if (!existing) {
            deduplicatedMap.set(key, t)
          } else {
            // Keep the one with the later actual_completion_date, or higher completed_task_id
            const existingDate = new Date(existing.actual_completion_date || 0).getTime()
            const newDate = new Date(t.actual_completion_date || 0).getTime()
            if (newDate > existingDate) {
              deduplicatedMap.set(key, t)
            } else if (newDate === existingDate) {
              const existingCtId = Number(existing.completed_task_id ?? 0)
              const newCtId = Number(t.completed_task_id ?? 0)
              if (newCtId > existingCtId) {
                deduplicatedMap.set(key, t)
              }
            }
          }
        }
        const deduplicated = Array.from(deduplicatedMap.values())

        if (!mounted) return

        setTasks(deduplicated)

        // Fetch all comments for each task in the background
        fetchAllCommentsForTasks(deduplicated)

        try {
          const storageSet = loadRequestedAmendmentsFromStorage()
          let changed = false
          for (const t of deduplicated) {
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
          console.error('Failed to reconcile requestedAmendments with backend', e)
        }
      } catch (err: any) {
        console.error('Failed to load completed tasks', err)
        if (mounted) setError('Failed to load completed tasks')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [loadRequestedAmendmentsFromStorage, persistRequestedAmendmentsToStorage, fetchAllCommentsForTasks])

  // Scroll indicator logic - same as TaskTable
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const update = () => {
      if (!el) return
      if (el.scrollHeight > el.clientHeight + 1) {
        el.classList.add('has-scroll')
      } else {
        el.classList.remove('has-scroll')
      }
      const atBottom = Math.abs((el.scrollTop + el.clientHeight) - el.scrollHeight) < 2
      if (atBottom) {
        el.classList.add('scrolled-bottom')
      } else {
        el.classList.remove('scrolled-bottom')
      }
    }

    update()
    el.addEventListener('scroll', update)
    window.addEventListener('resize', update)

    return () => {
      el.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [tasks.length])

  // ─── Top horizontal scrollbar sync (same as TaskTable) ───
  useEffect(() => {
    const outerContainer = containerRef.current
    const topScrollbar = topScrollbarRef.current
    const topScrollbarInner = topScrollbarInnerRef.current
    if (!outerContainer || !topScrollbar || !topScrollbarInner) return

    // CRITICAL DOM NOTE: The shadcn <Table> component wraps the native <table>
    // in an internal div with its own `overflow-auto` style:
    //   .task-table-container (outerContainer)
    //     └── div.relative.w-full.overflow-auto  ← ACTUAL horizontal scroll element
    //           └── <table>
    // That internal wrapper absorbs the horizontal overflow, so scrolling must
    // be synced with IT — not with .task-table-container. Otherwise scrollLeft
    // has no effect because the outer container never actually overflows.
    const getScrollEl = (): HTMLElement => {
      const tableEl = outerContainer.querySelector('table')
      if (tableEl && tableEl.parentElement && tableEl.parentElement !== outerContainer) {
        return tableEl.parentElement as HTMLElement
      }
      return outerContainer
    }

    // Set the inner div width to the scrolling element's scrollWidth. Both the
    // top scrollbar and the actual scroll container will then have IDENTICAL
    // scroll ranges, which allows direct 1:1 scrollLeft copying between them.
    const syncWidth = () => {
      const scrollEl = getScrollEl()
      const sw = scrollEl.scrollWidth
      if (sw > 0) {
        topScrollbarInner.style.width = `${sw}px`
      }
    }
    const tableContainer = getScrollEl()

    // Initial sync with multiple delays to ensure table is fully rendered.
    // Tables may not have their final dimensions immediately after mount,
    // especially when data loads asynchronously.
    syncWidth()
    const raf1 = requestAnimationFrame(syncWidth)
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(syncWidth))
    const initialSyncTimeout = setTimeout(syncWidth, 100)
    const secondSyncTimeout = setTimeout(syncWidth, 300)
    const thirdSyncTimeout = setTimeout(syncWidth, 600)
    const fourthSyncTimeout = setTimeout(syncWidth, 1000)
    const fifthSyncTimeout = setTimeout(syncWidth, 2000)
    // Periodic check for the first 10 seconds to catch late renders
    const periodicSync = setInterval(syncWidth, 500)
    const periodicStop = setTimeout(() => clearInterval(periodicSync), 10000)

    // Observe table container for size changes
    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        syncWidth()
      })
      resizeObserver.observe(tableContainer)
      // Also observe the actual table element if present
      const tableEl = tableContainer.querySelector('table')
      if (tableEl) {
        resizeObserver.observe(tableEl)
      }
    }

    // Observe DOM mutations inside the table container (e.g., rows added/removed).
    // IMPORTANT: do NOT watch `style` attribute mutations — the sync logic itself
    // modifies `style.width` on the top scrollbar inner, which would otherwise
    // trigger an infinite observer loop.
    let mutationObserver: MutationObserver | null = null
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => {
        syncWidth()
      })
      mutationObserver.observe(tableContainer, {
        childList: true,
        subtree: true,
      })
    }

    // Also sync on window resize
    window.addEventListener('resize', syncWidth)

    // Synchronize horizontal scroll positions between top and bottom scrollbars
    // using requestAnimationFrame-based locking. When the user actively scrolls
    // one element, the opposite handler ignores the programmatic scroll event
    // that the sync triggers. Using rAF instead of a fixed setTimeout makes the
    // lock self-clearing on the next paint, which keeps continuous dragging
    // responsive in both directions without stuck guards.
    let isSyncing = false

    const onTopScroll = () => {
      if (isSyncing) return
      isSyncing = true
      tableContainer.scrollLeft = topScrollbar.scrollLeft
      requestAnimationFrame(() => { isSyncing = false })
    }

    const onBottomScroll = () => {
      if (isSyncing) return
      isSyncing = true
      topScrollbar.scrollLeft = tableContainer.scrollLeft
      requestAnimationFrame(() => { isSyncing = false })
    }

    topScrollbar.addEventListener('scroll', onTopScroll, { passive: true })
    tableContainer.addEventListener('scroll', onBottomScroll, { passive: true })

    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      clearTimeout(initialSyncTimeout)
      clearTimeout(secondSyncTimeout)
      clearTimeout(thirdSyncTimeout)
      clearTimeout(fourthSyncTimeout)
      clearTimeout(fifthSyncTimeout)
      clearInterval(periodicSync)
      clearTimeout(periodicStop)
      if (resizeObserver) resizeObserver.disconnect()
      if (mutationObserver) mutationObserver.disconnect()
      window.removeEventListener('resize', syncWidth)
      topScrollbar.removeEventListener('scroll', onTopScroll)
      tableContainer.removeEventListener('scroll', onBottomScroll)
    }
  }, [tasks.length])

  // ─── Column sorting handlers (same pattern as TaskTable) ───
  const handleSort = (field: CompletedSortField) => {
    setSortConfig(prev => {
      if (prev.field === field) {
        if (prev.direction === 'asc') {
          return { field, direction: 'desc' }
        } else if (prev.direction === 'desc') {
          return { field: null, direction: null }
        }
      }
      return { field, direction: 'asc' }
    })
  }

  const getSortIcon = (field: CompletedSortField) => {
    if (sortConfig.field !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-40" />
    }
    if (sortConfig.direction === 'asc') {
      return <ArrowUp className="h-4 w-4 ml-1 text-blue-600" />
    }
    if (sortConfig.direction === 'desc') {
      return <ArrowDown className="h-4 w-4 ml-1 text-blue-600" />
    }
    return <ArrowUpDown className="h-4 w-4 ml-1 opacity-40" />
  }

  // ─── Get all comments text for a task from the fetched comments map ───
  // FIXED: Use ref-based access for search filtering to avoid dependency-triggered re-renders.
  // The state-based version (getAllCommentsTextFromState) is used for rendering/sorting display,
  // while the ref-based version (getAllCommentsTextStable) is used inside the search filter.
  const getAllCommentsTextStable = useCallback((taskId: number, fallbackComment: string): string => {
    const fetchedComments = allCommentsMapRef.current[taskId]
    if (fetchedComments && fetchedComments.length > 0) {
      return fetchedComments
        .map((c) => {
          const author = c.author_name || 'Unknown'
          const content = (c.content || '').trim()
          return `[${author}]: ${content}`
        })
        .join('\n')
    }
    // Fall back to the initial comment from the task data
    return fallbackComment || ''
  }, [])

  // State-based version for rendering and sorting (reacts to allCommentsMap changes)
  const getAllCommentsText = useCallback((taskId: number, fallbackComment: string): string => {
    const fetchedComments = allCommentsMap[taskId]
    if (fetchedComments && fetchedComments.length > 0) {
      return fetchedComments
        .map((c) => {
          const author = c.author_name || 'Unknown'
          const content = (c.content || '').trim()
          return `[${author}]: ${content}`
        })
        .join('\n')
    }
    // Fall back to the initial comment from the task data
    return fallbackComment || ''
  }, [allCommentsMap])

  // Helper: Format date+time for CSV export using the user's selected timezone
  // NOTE: Defined here (before getAllCommentsTextForExport) to avoid "cannot access before initialization" error.
  const formatDateTimeForExport = useCallback((dateString?: string | null): string => {
    if (!dateString) return 'N/A'
    try {
      const d = new Date(dateString)
      if (isNaN(d.getTime())) return 'N/A'
      const formatted = formatDateCustom(dateString, {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      })
      if (!formatted || formatted === '—') return 'N/A'
      return formatted
    } catch {
      return 'N/A'
    }
  }, [formatDateCustom])

  // ENHANCED: Full comments text for CSV export — includes date/time and ALL comment types
  // Includes ALL comments: user comments, system comments, amendment comments, intervention comments, etc.
  const getAllCommentsTextForExport = useCallback((taskId: number, fallbackComment: string): string => {
    const fetchedComments = allCommentsMapRef.current[taskId]
    if (fetchedComments && fetchedComments.length > 0) {
      // Sort by created_at ascending (oldest first) for chronological order in CSV
      const sorted = [...fetchedComments].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime()
        const dateB = new Date(b.created_at || 0).getTime()
        return dateA - dateB
      })
      return sorted
        .map((c) => {
          const author = c.author_name || 'Unknown'
          const content = (c.content || '').trim()
          const dateStr = c.created_at ? formatDateTimeForExport(c.created_at) : ''
          const typeTag = c.comment_type && c.comment_type !== 'UserComment'
            ? ` (${c.comment_type})`
            : ''
          return `[${dateStr}] ${author}${typeTag}: ${content}`
        })
        .join(' | ')
    }
    // Fall back to the initial comment from the task data
    return fallbackComment || ''
  }, [formatDateTimeForExport])

  // ─── Get the comments array for a task ───
  const getCommentsArray = useCallback((taskId: number): Array<{ comment_id?: number; content: string; author_name: string; created_at: string; comment_type?: string }> => {
    return allCommentsMap[taskId] || []
  }, [allCommentsMap])

  const scopedTasks = tasks

  const displayedTasks = useMemo(() => {
    let list = scopedTasks.slice()

    if (!showDuplicates) list = list.filter(t => !t.is_duplicate)

    // FIXED: Search filtering uses the stable ref-based getAllCommentsTextStable
    // to prevent async comment loading from resetting/flickering search results.
    // The commentsVersion dependency ensures we re-filter once when comments finish loading,
    // but NOT on every intermediate state change of allCommentsMap.
   if (searchTerm && String(searchTerm).trim() !== '') {
  const q = searchTerm.trim().toLowerCase()
  list = list.filter(t => {
    const taskId = String(t.task_id ?? '').toLowerCase()
    const taskIdWithPrefix = `tc-${taskId}`
    const sn = String(t.serial_number ?? '').toLowerCase()
    const pn = String(t.part_number ?? '').toLowerCase()
    const po = String(t.po_number ?? '').toLowerCase()
    return (
      taskId.startsWith(q) ||
      taskIdWithPrefix.startsWith(q) ||
      sn.startsWith(q) ||
      pn.startsWith(q) ||
      po.startsWith(q) 
    )
  })
}

    // ─── Column header sorting takes priority over dropdown sorting ───
    if (sortConfig.field && sortConfig.direction) {
      const direction = sortConfig.direction === 'asc' ? 1 : -1
      const priorityScore = (p = '') => {
        const key = String(p).toLowerCase()
        if (key.includes('critical')) return 4
        if (key.includes('high')) return 3
        if (key.includes('medium')) return 2
        if (key.includes('low')) return 1
        return 0
      }

      list.sort((a, b) => {
        switch (sortConfig.field) {
          case 'task_id':
            return direction * (a.task_id - b.task_id)
          case 'serial_number':
            return direction * (String(a.serial_number ?? '').localeCompare(String(b.serial_number ?? '')))
          case 'part_number':
            return direction * (String(a.part_number ?? '').localeCompare(String(b.part_number ?? '')))
          case 'description':
            return direction * (String(a.description ?? '').localeCompare(String(b.description ?? '')))
          case 'po_number':
            return direction * (String(a.po_number ?? '').localeCompare(String(b.po_number ?? '')))
          case 'category_name':
            return direction * (String(a.category_name ?? '').localeCompare(String(b.category_name ?? '')))
          case 'assigned_engineer':
            return direction * (String(a.assigned_engineer ?? '').localeCompare(String(b.assigned_engineer ?? '')))
          case 'comment':
            return direction * (getAllCommentsTextStable(Number(a.task_id), a.comments).localeCompare(getAllCommentsTextStable(Number(b.task_id), b.comments)))
          case 'priority':
            return direction * (priorityScore(a.priority_level_name) - priorityScore(b.priority_level_name))
          case 'actual_completion_date':
            return direction * ((new Date(a.actual_completion_date || 0).getTime()) - (new Date(b.actual_completion_date || 0).getTime()))
          case 'creator_name':
            return direction * (String(a.creator_name ?? '').localeCompare(String(b.creator_name ?? '')))
          case 'shop_name':
            return direction * (String(a.shop_name ?? '').localeCompare(String(b.shop_name ?? '')))
          default:
            return 0
        }
      })
    } else {
      // Fallback to dropdown sort
      switch (sortBy) {
        case 'completed_asc':
          list.sort((a,b) => (new Date(a.actual_completion_date || 0).getTime()) - (new Date(b.actual_completion_date || 0).getTime()))
          break
        case 'priority_desc':
          list.sort((a,b) => {
            const order = ['critical','high','medium','low']
            const pa = String(a.priority_level_name ?? '').toLowerCase()
            const pb = String(b.priority_level_name ?? '').toLowerCase()
            const ia = order.findIndex(x => pa.includes(x))
            const ib = order.findIndex(x => pb.includes(x))
            if (ia === -1 && ib === -1) return pa.localeCompare(pb)
            return ia - ib
          })
          break
        case 'priority_asc':
          list.sort((a,b) => {
            const order = ['critical','high','medium','low']
            const pa = String(a.priority_level_name ?? '').toLowerCase()
            const pb = String(b.priority_level_name ?? '').toLowerCase()
            const ia = order.findIndex(x => pa.includes(x))
            const ib = order.findIndex(x => pb.includes(x))
            if (ia === -1 && ib === -1) return pa.localeCompare(pb)
            return ib - ia
          })
          break
        case 'completed_desc':
        default:
          list.sort((a,b) => (new Date(b.actual_completion_date || 0).getTime()) - (new Date(a.actual_completion_date || 0).getTime()))
          break
      }
    }

    return list
    // FIXED: Replaced allCommentsMap and getAllCommentsText with commentsVersion
    // commentsVersion only changes once when all comments finish loading,
    // preventing intermediate re-renders from disrupting active search results
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedTasks, searchTerm, sortBy, showDuplicates, sortConfig, commentsVersion])

  // ─── Computed counters ───
  const totalCompleted = displayedTasks.length
  const totalSeen = useMemo(() => {
    return displayedTasks.filter(t => seenComments.has(Number(t.task_id))).length
  }, [displayedTasks, seenComments])

  /**
   * FIXED: Export CSV using Data URI approach to avoid blob URL mixed content warnings on HTTP
   * ENHANCED: Status shows human-readable text, dates formatted with timezone, Category column added
   */

  // Helper: Convert status to human-readable text for CSV export
  const humanizeStatusForExport = (s: any): string => {
    if (s === null || s === undefined) return 'N/A'
    if (typeof s === 'number') {
      const map: Record<number, string> = {
        0: 'Pending',
        1: 'In Progress',
        2: 'Completed',
        3: 'Blocked',
        4: 'On Hold',
        5: 'Cancelled'
      }
      return map[s] ?? String(s)
    }
    const cleaned = String(s).toLowerCase().trim()
    if (cleaned === '') return 'N/A'
    if (cleaned.match(/completed|done|complete/)) return 'Completed'
    if (cleaned.match(/inprogress|in progress/)) return 'In Progress'
    if (cleaned.match(/pending/)) return 'Pending'
    if (cleaned.match(/blocked/)) return 'Blocked'
    if (cleaned.match(/onhold|on hold/)) return 'On Hold'
    if (cleaned.match(/cancelled|canceled/)) return 'Cancelled'
    return String(s).split(/[_\s-]+/).map((w:string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  // NOTE: formatDateTimeForExport has been moved above getAllCommentsTextForExport
  // to fix "Cannot access 'formatDateTimeForExport' before initialization" error.

  // Helper: Calculate variance between two dates. Returns a human-readable string.
  const calculateVarianceBetween = (startDate?: string | null, endDate?: string | null): string => {
    if (!startDate || !endDate) return 'N/A'
    try {
      const start = new Date(startDate)
      const end = new Date(endDate)
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'N/A'
      const diffMs = end.getTime() - start.getTime()
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      if (diffDays === 0) {
        return `${diffHours} hour${diffHours !== 1 ? 's' : ''}`
      }
      return `${diffDays} day${diffDays !== 1 ? 's' : ''}, ${diffHours} hour${diffHours !== 1 ? 's' : ''}`
    } catch {
      return 'N/A'
    }
  }

  /**
   * CRITICAL FIX: Derive engineer_completed_at from comments when the backend field is null.
   * This mirrors the same logic used in TaskDetails.tsx.
   *
   * IMPROVED DERIVATION LOGIC:
   *   1. task.engineer_completed_at (backend field) — but ONLY if it differs from actual_completion_date
   *   2. Derived from comments using multiple strategies (in priority order):
   *      a. Find "[COMPLETION APPROVED" or similar TL approval comment → use the non-system comment just before it
   *      b. Find the last comment authored by the assigned engineer (name match)
   *      c. Find any comment mentioning completion/status-change keywords
   *      d. If there are multiple comments, use the last non-system comment that is
   *         meaningfully before the TL approval timestamp (>= 30 seconds gap)
   *      e. If only one non-system comment exists and it's before TL approval, use it
   *   3. Fallback: if no distinct timestamp found, return null (NOT actual_completion_date)
   *      so that the CSV shows "N/A" rather than a misleading duplicate of TL Approved At.
   */
  const deriveEngineerCompletedAt = useCallback((task: any): string | null => {
    const tlApprovedTimestamp = task.actual_completion_date || null
    const tlTime = tlApprovedTimestamp ? new Date(tlApprovedTimestamp).getTime() : 0

    // 1. If the backend already provides it AND it differs from TL approved, use it
    if (task.engineer_completed_at) {
      if (!tlApprovedTimestamp) return task.engineer_completed_at
      const engTime = new Date(task.engineer_completed_at).getTime()
      // If they differ by more than 30 seconds, treat as distinct
      if (Math.abs(engTime - tlTime) > 30000) {
        return task.engineer_completed_at
      }
      // Otherwise fall through to comment-based derivation
    }

    const taskId = Number(task.task_id)
    const taskComments = allCommentsMapRef.current[taskId] || []

    if (taskComments.length === 0) {
      return null
    }

    // Sort comments by created_at ascending (oldest first)
    const sortedAsc = [...taskComments].sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime()
      const dateB = new Date(b.created_at || 0).getTime()
      return dateA - dateB
    })

    // Helper: check if a comment is a system/TL approval comment
    const isSystemApproval = (c: any): boolean => {
      const content = String(c.content ?? '').toUpperCase()
      return content.includes('[COMPLETION APPROVED') ||
             content.includes('[COMPLETION REJECTED') ||
             content.includes('[STATUS CHANGED') ||
             content.includes('[TASK APPROVED') ||
             content.includes('[TASK COMPLETED') ||
             content.includes('[APPROVED BY')
    }

    // Helper: check if a comment is a TL/system approval (broader match)
    const isTLApprovalComment = (c: any): boolean => {
      const content = String(c.content ?? '').toUpperCase()
      const cType = String(c.comment_type ?? '').toLowerCase()
      return content.includes('[COMPLETION APPROVED') ||
             content.includes('[TASK APPROVED') ||
             content.includes('[APPROVED BY') ||
             cType.includes('system') ||
             cType.includes('status')
    }

    // Helper: normalize engineer name for matching
    const engineerName = String(task.assigned_engineer ?? '').toLowerCase().trim()
    const engineerNameParts = engineerName
      .split(/[,\s]+/)
      .map(p => p.trim())
      .filter(p => p.length > 1)

    const isEngineerAuthor = (authorName: string): boolean => {
      if (!engineerName || engineerNameParts.length === 0) return false
      const author = authorName.toLowerCase().trim()
      // Check if any significant part of the engineer name appears in the author
      return engineerNameParts.some(part => author.includes(part)) ||
             author.includes(engineerName.split(',')[0].trim())
    }

    // Separate comments into categories
    const nonSystemComments = sortedAsc.filter(c => !isSystemApproval(c) && c.created_at)

    // STRATEGY A: Find "[COMPLETION APPROVED" or similar TL approval comment
    // → engineer completed = the non-system comment just before it
    const tlApprovalIdx = sortedAsc.findIndex((c) => {
      const content = String(c.content ?? '').toUpperCase()
      return content.includes('[COMPLETION APPROVED') ||
             content.includes('[TASK APPROVED') ||
             content.includes('[APPROVED BY')
    })

    if (tlApprovalIdx > 0) {
      // Walk backwards from the TL approval comment to find the engineer's comment
      for (let i = tlApprovalIdx - 1; i >= 0; i--) {
        const candidate = sortedAsc[i]
        if (!isSystemApproval(candidate) && candidate.created_at) {
          return candidate.created_at
        }
      }
    }

    // STRATEGY B: Find the last comment authored by the assigned engineer
    // This is the most reliable indicator — the engineer's last comment before TL approval
    if (engineerName) {
      for (let i = sortedAsc.length - 1; i >= 0; i--) {
        const c = sortedAsc[i]
        if (isSystemApproval(c)) continue
        const author = String(c.author_name ?? '').trim()
        if (isEngineerAuthor(author) && c.created_at) {
          const commentTime = new Date(c.created_at).getTime()
          // Accept if it's before TL approval or if there's no TL timestamp
          if (tlTime === 0 || commentTime <= tlTime + 30000) {
            return c.created_at
          }
        }
      }
    }

    // STRATEGY C: Find any comment mentioning completion keywords (not a system comment)
    const completionKeywords = ['completed', 'complete', 'done', 'finished', 'status changed to completed', 'marked as completed', 'task completed', 'work completed']
    for (let i = sortedAsc.length - 1; i >= 0; i--) {
      const c = sortedAsc[i]
      if (isSystemApproval(c) || isTLApprovalComment(c)) continue
      const content = String(c.content ?? '').toLowerCase()
      const mentionsCompletion = completionKeywords.some(kw => content.includes(kw))
      if (mentionsCompletion && c.created_at) {
        return c.created_at
      }
    }

    // STRATEGY D: Use the last non-system comment that is meaningfully before TL approval
    // (at least 30 seconds gap to ensure it's not the same event)
    if (nonSystemComments.length >= 1 && tlTime > 0) {
      for (let i = nonSystemComments.length - 1; i >= 0; i--) {
        const candidateTime = new Date(nonSystemComments[i].created_at).getTime()
        if (candidateTime < tlTime - 30000) {
          return nonSystemComments[i].created_at
        }
      }
    }

    // STRATEGY E: If there's exactly one non-system comment and no TL timestamp to compare,
    // use it as the engineer's completion time
    if (nonSystemComments.length === 1 && !tlApprovedTimestamp) {
      return nonSystemComments[0].created_at
    }

    // No distinct engineer timestamp found — return null so CSV shows "N/A"
    return null
  }, [])

  /**
   * Helper: pick the appropriate variance start timestamp.
   *
   * Variance is measured from "Task assigned at" (when an engineer was first
   * assigned to the task) rather than task creation. If the backend has not
   * populated task_assigned_at (e.g. legacy records), we fall back to
   * created_at so historical rows still render a sensible value.
   */
  const getVarianceStart = (task: any): string | null => {
    return (
      task.task_assigned_at ??
      task.taskAssignedAt ??
      task.TaskAssignedAt ??
      task.assigned_at ??
      task.assignedAt ??
      task.AssignedAt ??
      task.created_at ??
      null
    )
  }

  /**
   * Role-based variance calculation:
   * - Engineers: variance = engineer_completed_at - task_assigned_at
   *   (time from task assignment to when engineer marked it complete)
   * - Team Leaders & Directors: two variances:
   *   1. Engineer Variance   = engineer_completed_at   - task_assigned_at
   *   2. TL Approved Variance = actual_completion_date - task_assigned_at
   *
   * Falls back to created_at when task_assigned_at is missing.
   */
  const calculateEngineerVariance = (task: any): string => {
    const engineerCompletedAt = deriveEngineerCompletedAt(task)
    return calculateVarianceBetween(getVarianceStart(task), engineerCompletedAt)
  }

  const calculateTLApprovedVariance = (task: any): string => {
    return calculateVarianceBetween(getVarianceStart(task), task.actual_completion_date)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // NEW: Target Day/s + Early / On-Time / Delayed analysis
  //
  // "Target Day/s" comes from the Category Target Days configuration created in
  // "Add New Target Duration". A configured duration may contain days, hours and
  // minutes, so it is normalized into a decimal number of days (2 decimals) to
  // keep the column strictly numeric and comparable with the real duration.
  // ─────────────────────────────────────────────────────────────────────────────

  /** Resolve the configured target duration (in decimal days) for a task's category. */
  const getTargetDurationDays = (task: any): number | null => {
    if (!targetDaysData || targetDaysData.length === 0) return null

    const taskCategoryId = task.category_id ?? task.categoryId ?? task.CategoryId ?? null
    const taskCategoryName = String(task.category_name ?? '').trim().toLowerCase()

    const entry = targetDaysData.find((td: any) => {
      const tdCategoryId = td.category_id ?? td.categoryId ?? td.CategoryId ?? td.category?.id ?? null
      if (taskCategoryId !== null && taskCategoryId !== undefined && tdCategoryId !== null && tdCategoryId !== undefined) {
        if (String(tdCategoryId) === String(taskCategoryId)) return true
      }
      const tdName = String(
        td.category_name ?? td.categoryName ?? td.CategoryName ?? td.category?.name ?? ''
      ).trim().toLowerCase()
      return tdName !== '' && tdName === taskCategoryName
    })

    if (!entry) return null

    const days = Number(entry.target_days ?? entry.targetDays ?? entry.TargetDays ?? entry.days ?? 0) || 0
    const hours = Number(entry.target_hours ?? entry.targetHours ?? entry.TargetHours ?? 0) || 0
    const minutes = Number(entry.target_minutes ?? entry.targetMinutes ?? entry.TargetMinutes ?? 0) || 0

    const total = days + hours / 24 + minutes / 1440
    if (!isFinite(total) || total <= 0) return null
    return Math.round(total * 100) / 100
  }

  /** Target Day/s cell value — numeric string, or "N/A" when no target is configured. */
  const formatTargetDays = (task: any): string => {
    const target = getTargetDurationDays(task)
    return target === null ? 'N/A' : target.toFixed(2)
  }

  /** Elapsed time between two timestamps expressed as decimal days. */
  const durationInDays = (startDate?: string | null, endDate?: string | null): number | null => {
    if (!startDate || !endDate) return null
    const start = new Date(startDate).getTime()
    const end = new Date(endDate).getTime()
    if (isNaN(start) || isNaN(end)) return null
    return Math.round(((end - start) / (1000 * 60 * 60 * 24)) * 100) / 100
  }

  /**
   * Real duration the engineer took, in decimal days:
   *   Engineer Completed At − Task Assigned At
   */
  const getEngineerVarianceDays = (task: any): number | null => {
    return durationInDays(getVarianceStart(task), deriveEngineerCompletedAt(task))
  }

  /** Engineer Variance rendered as a plain numerical value (decimal days). */
  const getEngineerVarianceNumeric = (task: any): string => {
    const value = getEngineerVarianceDays(task)
    return value === null ? 'N/A' : value.toFixed(2)
  }

  // Tolerance (≈15 minutes) used to decide whether a task landed exactly on target.
  const ON_TIME_TOLERANCE_DAYS = 0.01

  /**
   * Classify a task against its category target:
   *   - early   → finished before the target; value = days saved (target − actual)
   *   - on_time → finished on target (within tolerance); value = actual days taken
   *   - delayed → finished after the target; value = days late (actual − target)
   * Returns bucket = null when the target or the engineer timestamp is unknown.
   */
  const classifyPerformance = (task: any): { bucket: 'early' | 'on_time' | 'delayed' | null; value: number | null } => {
    const target = getTargetDurationDays(task)
    const actual = getEngineerVarianceDays(task)
    if (target === null || actual === null) return { bucket: null, value: null }

    const delta = Math.round((actual - target) * 100) / 100
    if (delta < -ON_TIME_TOLERANCE_DAYS) return { bucket: 'early', value: Math.abs(delta) }
    if (delta > ON_TIME_TOLERANCE_DAYS) return { bucket: 'delayed', value: delta }
    return { bucket: 'on_time', value: Math.max(actual, 0) }
  }

  /**
   * Rate formatter used by every rate column.
   *
   * IMPORTANT: the value is NEVER clamped to 100%. A rate can legitimately go
   * above 100% when engineers finish well ahead of the configured target
   * (early performance beyond target), and that has to stay visible.
   */
  const formatRate = (rate: number | null | undefined): string => {
    const value = Number(rate ?? 0)
    if (!isFinite(value)) return '0.00%'
    return `${(Math.round(value * 100) / 100).toFixed(2)}%`
  }

  /**
   * R → W cells:
   *   R On-Time Rate | S On-Time Tasks
   *   T Delay Rate   | U Delayed Tasks
   *   V Early Rate   | W Early Tasks
   *
   * The classification itself comes from "Task Assigned At",
   * "Engineer Completed At" and "Target Day/s" (see classifyPerformance).
   * Each rate is expressed against the TOTAL number of completed tasks in the
   * export, so every row carries its own share of the overall rate
   * (100 / totalCompleted). Summing a rate column therefore reproduces exactly
   * the rate printed in the bottom SUMMARY row.
   */
  const performanceCells = (task: any, totalCompleted: number): string[] => {
    const perf = classifyPerformance(task)
    const share = totalCompleted > 0 ? 100 / totalCompleted : 0
    const rate = (bucket: 'early' | 'on_time' | 'delayed') =>
      formatRate(perf.bucket === bucket ? share : 0)
    const count = (bucket: 'early' | 'on_time' | 'delayed') => (perf.bucket === bucket ? '1' : '0')
    return [
      rate('on_time'), count('on_time'),
      rate('delayed'), count('delayed'),
      rate('early'), count('early'),
    ]
  }

  /** Single variance for engineer role (backward compat) */
  const calculateVariance = (task: any): string => {
    if (role === 'engineer') {
      return calculateEngineerVariance(task)
    }
    // TL, Director, and all other roles use actual_completion_date (TL approval date)
    return calculateTLApprovedVariance(task)
  }

  async function handleExportCsv() {
    setLoadingExport(true)
    try {
      if (!displayedTasks.length) {
        alert('No completed tasks to export.')
        return
      }

      // CRITICAL FIX: Ensure all comments are fully loaded before export so that
      // TL/Director roles see the same data as Engineer in the Comments column
      // and can correctly derive Engineer Completed At from comment history.
      // For Engineer role this typically already completes fast because they have
      // fewer tasks; for TL/Director the background fetch may still be in progress.
      if (loadingComments) {
        try {
          await fetchAllCommentsForTasks(displayedTasks)
        } catch (e) {
          console.warn('Comments preload before export failed; continuing with available data', e)
        }
      }
      
      // CSV column headers - role-based:
      // Engineers see: {EngineerName}'s Completed At + Variance
      // TL/Directors see: {EngineerName}'s Completed At + TL Approved At + Engineer Variance + TL Approved Variance
      const isTLorDirectorExport = ['team_leader', 'director'].includes(role)

      // Build dynamic engineer name header based on logged-in user for engineer role,
      // or generic "Engineer's Completed At" for TL/Director view
      const currentUserName = user?.fullName ?? user?.name ?? user?.username ?? user?.displayName ?? ''
      const engineerCompletedHeader = (!isTLorDirectorExport && currentUserName)
        ? `${currentUserName}'s Completed At`
        : "Engineer Completed At"

      // NEW: Added "Task Assigned At" column right after "Created At" so Variance
      // is auditable — the user can see the exact timestamp that is the start
      // of the variance calculation. This is added for BOTH engineer and
      // TL/Director exports and applies to ALL statuses (Hold, Pending,
      // In Progress, Blocked, Paused, Rejected, Completed).
      // UNIFIED COLUMN LAYOUT (identical for every role) so the spreadsheet
      // positions requested by the business are guaranteed:
      //   A Task ID              I Assigned Engineer   Q Target Day/s
      //   B Serial Number        J Priority            R On-Time Rate
      //   C Part Number          K Creator             S On-Time Tasks
      //   D Description          L Created At          T Delay Rate
      //   E PO Number            M Task Assigned At    U Delayed Tasks
      //   F Category             N Engineer Completed  V Early Rate
      //   G Comments             O TL Approved At      W Early Tasks
      //   H Status               P Engineer Variance   X TL Approved Variance
      //                                               Y Shop
      //                                               Z Total Capacity Efficiency
      const csvHeaders = [
        'Task ID',
        'Serial Number',
        'Part Number',
        'Description',
        'PO Number',
        'Category',
        'Comments',
        'Status',
        'Assigned Engineer',
        'Priority',
        'Creator',
        'Created At',
        'Task Assigned At',
        engineerCompletedHeader,
        'TL Approved At',
        'Engineer Variance',
        // Q — configured target duration for the task category
        'Target Day/s',
        // R → W — rate based performance against the configured target.
        // Every rate is measured against the TOTAL completed tasks exported.
        'On-Time Rate',
        'On-Time Tasks',
        'Delay Rate',
        'Delayed Tasks',
        'Early Rate',
        'Early Tasks',
        'TL Approved Variance',
        'Shop',
        // Z — (On-Time Rate + Delay Rate + Early Rate) / 3 — summary row only
        'Total Capacity Efficiency',
      ]

      // Denominator of every rate column: total completed tasks in this export.
      const totalCompletedForRates = displayedTasks.length

      const rows = displayedTasks.map((t) => {
        // CRITICAL FIX: Derive engineer_completed_at from comments when backend field is null
        const derivedEngineerCompleted = deriveEngineerCompletedAt(t)

        // NEW: Task Assigned At — this is the timestamp the engineer was
        // first assigned to the task. Used as the START of variance
        // calculation. Falls back to created_at when missing (legacy rows).
        const taskAssignedAt = getVarianceStart(t)

        const baseValues = [
          `TC-${t.task_id}`,
          t.serial_number ?? '',
          t.part_number ?? '',
          t.description ?? '',
          t.po_number ?? '',
          t.category_name ?? '',
          getAllCommentsTextForExport(Number(t.task_id), t.comments ?? ''),
          humanizeStatusForExport(t.status),
          t.assigned_engineer ?? '',
          t.priority_level_name ?? '',
          t.creator_name ?? '',
          formatDateTimeForExport(t.created_at),
          // NEW: Task Assigned At column — explicit start of variance
          formatDateTimeForExport(taskAssignedAt),
        ]
        baseValues.push(
          // N — engineer completion timestamp
          formatDateTimeForExport(derivedEngineerCompleted),
          // O — TL approval timestamp
          formatDateTimeForExport(t.actual_completion_date),
          // P — Engineer Variance as a plain numerical value (decimal days)
          getEngineerVarianceNumeric(t),
          // Q — Target Day/s from the Category Target Days configuration
          formatTargetDays(t),
        )
        // R → W — On-Time Rate / On-Time Tasks / Delay Rate / Delayed Tasks /
        //          Early Rate / Early Tasks (all vs total completed tasks)
        baseValues.push(...performanceCells(t, totalCompletedForRates))
        baseValues.push(
          // X — TL Approved Variance
          calculateTLApprovedVariance(t),
          // Y — Shop
          t.shop_name ?? '',
          // Z — Total Capacity Efficiency is a summary-only value
          '',
        )
        return baseValues.map(v => {
          const s = v === null || v === undefined ? '' : String(v)
          return `"${s.replace(/"/g, '""')}"`
        }).join(',')
      })

      // ─── SUMMARY ROW ───────────────────────────────────────────────────────
      // Aggregates the per-row classification so the user gets the real
      // "Average of Early / On-Time / Delayed" together with the task counts,
      // placed in the SAME columns (R → W) as the per-row values.
      const buckets: Record<'early' | 'on_time' | 'delayed', number[]> = {
        early: [],
        on_time: [],
        delayed: [],
      }
      for (const t of displayedTasks) {
        const perf = classifyPerformance(t)
        if (perf.bucket && perf.value !== null) {
          buckets[perf.bucket].push(perf.value)
        }
      }
      const averageOf = (values: number[]): string => {
        if (values.length === 0) return '0.00'
        const sum = values.reduce((acc, v) => acc + v, 0)
        return (Math.round((sum / values.length) * 100) / 100).toFixed(2)
      }

      // ─── RATES + TOTAL CAPACITY EFFICIENCY ────────────────────────────────
      // On-Time / Delay / Early Rate are all measured against the TOTAL number
      // of completed tasks, using Task Assigned At, Engineer Completed At and
      // the configured Target Day/s for the classification.
      const onTimeTaskCount = buckets.on_time.length
      const delayedTaskCount = buckets.delayed.length
      const earlyTaskCount = buckets.early.length
      const rateOf = (count: number): number =>
        totalCompletedForRates > 0 ? (count / totalCompletedForRates) * 100 : 0
      const onTimeRate = rateOf(onTimeTaskCount)
      const delayRate = rateOf(delayedTaskCount)
      const earlyRate = rateOf(earlyTaskCount)
      // Total Capacity Efficiency = (On-Time Rate + Delay Rate + Early Rate) / 3
      // Not clamped: strong early performance can push the value above 100%.
      const totalCapacityEfficiency = (onTimeRate + delayRate + earlyRate) / 3

      const summaryValues: string[] = [
        'SUMMARY', '', '', '', '', '', '', '', '', '', '', '', '', '', '',
        // P — average engineer variance across all classified tasks
        averageOf(
          displayedTasks
            .map(t => getEngineerVarianceDays(t))
            .filter((v): v is number => v !== null)
        ),
        // Q — average configured target duration
        averageOf(
          displayedTasks
            .map(t => getTargetDurationDays(t))
            .filter((v): v is number => v !== null)
        ),
        // R → W — rates vs total completed tasks + task counts
        formatRate(onTimeRate),
        String(onTimeTaskCount),
        formatRate(delayRate),
        String(delayedTaskCount),
        formatRate(earlyRate),
        String(earlyTaskCount),
        // X, Y
        '',
        '',
        // Z — Total Capacity Efficiency
        formatRate(totalCapacityEfficiency),
      ]
      const summaryRow = summaryValues
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')

      const csv = [csvHeaders.join(','), ...rows, summaryRow].join('\n')
      
      // FIXED: Use Data URI approach instead of blob URL to avoid mixed content warnings
      const BOM = '\uFEFF'
      const fullContent = BOM + csv
      const encodedContent = encodeURIComponent(fullContent)
      const dataUri = `data:text/csv;charset=utf-8,${encodedContent}`
      
      const a = document.createElement('a')
      a.href = dataUri
      a.download = `completed-tasks.csv`
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (err: any) {
      console.error('Export failed', err)
      alert('Failed to export CSV')
    } finally {
      setLoadingExport(false)
    }
  }

  const openDetailsForTask = (taskObj: any) => {
    const taskWithFlag = {
      ...taskObj,
      is_completed_task: true
    }
    setSelectedTask(taskWithFlag)
    setDetailsOpen(true)
  }

  const getCreatorDisplay = (taskObj: any) => {
    if (!taskObj) return 'N/A'
    if (taskObj.creator_name && String(taskObj.creator_name).trim() !== '') return taskObj.creator_name
    if (taskObj.created_by) return String(taskObj.created_by)
    return 'N/A'
  }

  const handleCloseAmendmentModal = useCallback(() => {
    setAmendmentTaskFor(null)
  }, [])

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
    refreshTasks()
  }, [refreshTasks, persistRequestedAmendmentsToStorage])

  const handleCloseReopenModal = useCallback(() => {
    setReopenTaskFor(null)
  }, [])

  const handleReopenSuccess = useCallback(() => {
    const reopenedTaskId = reopenTaskFor?.task_id
    setReopenTaskFor(null)
    
    // CRITICAL FIX: Immediately remove the reopened task from local state
    // so it disappears from the completed tasks table instantly
    if (reopenedTaskId) {
        setTasks(prev => prev.filter(t => Number(t.task_id) !== Number(reopenedTaskId)))
    }
    
    // Also refresh from API to ensure consistency
    refreshTasks()
}, [refreshTasks, reopenTaskFor])


  const handleCloseAmendmentApprovalModal = useCallback(() => {
    setAmendmentApprovalFor(null)
  }, [])

  const handleAmendmentApprovalSuccess = useCallback(() => {
    setAmendmentApprovalFor(null)
    refreshTasks()
  }, [refreshTasks])

  const canRequestAmendment = (taskObj: any) => {
    // FIXED: Use the RBAC permission matrix instead of hardcoded role checks.
    // Admin and Director (privileged roles) always bypass the matrix.
    // All other roles are controlled by the admin-configured permission for 'request_amendment'.
    if (!rbacCanRequestAmendment && !isPrivilegedRole) {
      return false
    }
    
    if (requestedAmendments.has(Number(taskObj.task_id))) {
      return false
    }
    
    const amendmentStatus = Number(taskObj.amendment_status ?? 0)
    const amendmentRequest = Number(taskObj.amendment_request ?? 0)
    
    if (amendmentRequest === 0 && amendmentStatus === 0) {
      return true
    }
    if (amendmentStatus === 3) {
      return true
    }
    return false
  }

  const isAmendmentPendingTL = (taskObj: any) => {
    if (!taskObj) return false
    const req = Number(taskObj.amendment_request ?? 0)
    const status = Number(taskObj.amendment_status ?? 0)
    return req > 0 && (status === 0 || status === 1)
  }

  // Truncate comment for display
  const truncateComment = (comment: string, maxLen = 60) => {
    if (!comment || comment.trim() === '') return '—'
    if (comment.length <= maxLen) return comment
    return comment.substring(0, maxLen) + '…'
  }

  // Handle open dialog for description, part number, category
  const showFieldDialog = (field: string, value: string, taskId: number) => {
    setFieldExpanded(false)
    setFieldDialogData({ field, value, taskId })
    setFieldDialogOpen(true)
  }

  // For dialog: handle expand/collapse if text is long
  const FIELD_TRUNCATE = 200
  const renderFieldValue = (value: string) => {
    if (!value || value.length <= FIELD_TRUNCATE || fieldExpanded) {
      return <div className="break-words text-gray-700">{value || '—'}</div>
    }
    return (
      <div>
        <div className="break-words text-gray-700">{value.substring(0, FIELD_TRUNCATE) + '…'}</div>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setFieldExpanded(true)}>Show Full</Button>
      </div>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl md:text-3xl font-semibold leading-tight">Completed Tasks</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {(role === 'shop_tl' || role === 'shop_manager') && 'Showing completed tasks from your shop only (tasks created by you and customer personnel you supervise)'}
              {role === 'engineer' && 'Showing completed tasks assigned to you'}
              {(role === 'customer' || role === 'customer_personnel') && 'Showing completed tasks you created'}
              {(role === 'team_leader' || role === 'director') && 'Showing all completed tasks'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Counter badge showing total completed and acknowledged - visible to ALL users */}
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
                    <span className="text-gray-500 ml-1 hidden sm:inline">completed {totalCompleted === 1 ? 'task' : 'tasks'}</span>
                  </>
                )}
              </span>
            </div>
            <Button onClick={handleExportCsv} disabled={loadingExport || !displayedTasks.length} className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              {loadingExport ? 'Exporting...' : 'Export CSV'}
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-md p-4">
          {error && <div className="text-sm text-red-600 mb-4">{error}</div>}
          {loading && <div className="text-sm text-gray-600">Loading completed tasks...</div>}

          {!loading && (
            <>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
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

                 <Button variant={'outline' as any} onClick={() => { setSearchTerm(''); }} className="hidden md:inline-flex">
                    Clear Search
                  </Button>

                <div className="flex flex-wrap items-center gap-2 md:gap-3">
                  <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setSortConfig({ field: null, direction: null }); }} className="border rounded-lg px-3 py-2 shadow-sm">
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

                  <div className="md:hidden w-full">
                    <div className="flex gap-2 mt-2">
                      <Button variant={'outline' as any} onClick={() => { setSearchTerm(''); }} className="flex-1">
                        Clear
                      </Button>
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
                </div>
              </div>

              {/* Updated table container with scrollbars matching TaskTable */}
              <div className="completed-table-scroll-wrapper">
                {/* Top horizontal scrollbar — synchronized with the bottom scrollbar */}
                <div className="top-horizontal-scrollbar" ref={topScrollbarRef}>
                  <div className="top-horizontal-scrollbar-inner" ref={topScrollbarInnerRef} />
                </div>

              <div className="completed-task-table-container" ref={containerRef}>
                <Table className="completed-task-table">
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead
                        className="cursor-pointer hover:bg-gray-100 select-none"
                        onClick={() => handleSort('task_id')}
                      >
                        <div className="flex items-center">
                          Task ID
                          {getSortIcon('task_id')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-gray-100 select-none"
                        onClick={() => handleSort('serial_number')}
                      >
                        <div className="flex items-center">
                          Serial Number
                          {getSortIcon('serial_number')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-gray-100 select-none"
                        onClick={() => handleSort('part_number')}
                      >
                        <div className="flex items-center">
                          Part Number
                          {getSortIcon('part_number')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-gray-100 select-none"
                        onClick={() => handleSort('description')}
                      >
                        <div className="flex items-center">
                          Description
                          {getSortIcon('description')}
                        </div>
                      </TableHead>
                                           <TableHead
                        className="cursor-pointer hover:bg-gray-100 select-none"
                        onClick={() => handleSort('po_number')}
                      >
                        <div className="flex items-center">
                          PO Number
                          {getSortIcon('po_number')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-gray-100 select-none"
                        onClick={() => handleSort('category_name')}
                      >
                        <div className="flex items-center">
                          Category
                          {getSortIcon('category_name')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-gray-100 select-none"
                        onClick={() => handleSort('assigned_engineer')}
                      >
                        <div className="flex items-center">
                          Engineer
                          {getSortIcon('assigned_engineer')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-gray-100 select-none"
                        onClick={() => handleSort('comment')}
                      >
                        <div className="flex items-center">
                          <MessageSquare className="h-4 w-4 mr-1" />
                          Comment
                          {getSortIcon('comment')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-gray-100 select-none"
                        onClick={() => handleSort('actual_completion_date')}
                      >
                        <div className="flex items-center">
                          Actual Completion
                          {getSortIcon('actual_completion_date')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-gray-100 select-none"
                        onClick={() => handleSort('creator_name')}
                      >
                        <div className="flex items-center">
                          Created By
                          {getSortIcon('creator_name')}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-gray-100 select-none"
                        onClick={() => handleSort('shop_name')}
                      >
                        <div className="flex items-center">
                          Shop
                          {getSortIcon('shop_name')}
                        </div>
                      </TableHead>
                      <TableHead className="sticky-action-column">Actions</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {displayedTasks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center p-8 text-muted">No completed tasks found.</TableCell>
                      </TableRow>
                    ) : (
                      displayedTasks.map((taskObj: any) => {
                        const taskId = Number(taskObj.task_id)
                        const isSeen = seenComments.has(taskId)
                        const hasComment = taskObj.comments && String(taskObj.comments).trim() !== ''

                        return (
                          <TableRow
                            key={String(taskObj.task_id) + '-' + String(taskObj.serial_number || '')}
                            className={`transition-colors hover:bg-gray-50 ${taskObj.show_revision_alert ? 'bg-yellow-50' : ''}`}
                          >
                            <TableCell className="font-medium align-top">
                              <div className="flex flex-col gap-2">
                                <span className="text-sm font-semibold">TC-{taskObj.task_id}</span>

                                <div className="flex flex-wrap gap-2 items-center">
                                  {taskObj.is_reopened && (
                                    <ReopenedTaskBadge
                                      isReopened={taskObj.is_reopened}
                                      reopenCount={taskObj.reopen_count}
                                    />
                                  )}
                                  {Number(taskObj.amendment_status) > 0 && (
                                    <AmendmentStatusBadge
                                      status={taskObj.amendment_status}
                                    />
                                  )}
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="align-top">
                              <div className="text-sm">
                                <span
                                  className="cursor-pointer text-blue-700 hover:underline"
                                  title="Click to expand Serial Number"
                                  onClick={() => showFieldDialog('Serial Number', taskObj.serial_number, taskId)}
                                >
                                  {taskObj.serial_number || <span className="text-gray-400">—</span>}
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="align-top">
                              <div className="text-sm">
                                <span
                                  className="cursor-pointer text-blue-700 hover:underline"
                                  title="Click to expand Part Number"
                                  onClick={() => showFieldDialog('Part Number', taskObj.part_number, taskId)}
                                >
                                  {taskObj.part_number || <span className="text-gray-400">—</span>}
                                </span>
                              </div>
                            </TableCell>

                            <TableCell className="align-top max-w-md">
                              <div
                                className="text-sm text-gray-700 max-w-xl break-words cursor-pointer hover:text-blue-600"
                                title="Click to expand Description"
                                onClick={() => showFieldDialog('Description', String(taskObj.description ?? ''), taskId)}
                                dangerouslySetInnerHTML={{ __html: String(taskObj.description ?? '').replace(/(?:\r\n|\r|\n)/g, '<br/>') }}
                              />
                            </TableCell>
                                                         <TableCell className="align-top">
                              <div className="text-sm">
                                {taskObj.po_number ? (
                                  <span
                                    className="cursor-pointer text-blue-700 hover:underline"
                                    title="Click to expand PO Number"
                                    onClick={() => showFieldDialog('PO Number', taskObj.po_number, taskId)}
                                  >
                                    {taskObj.po_number}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="align-top">
                              <div
                                className="text-sm cursor-pointer text-blue-700 hover:underline"
                                title="Click to expand Category"
                                onClick={() => showFieldDialog('Category', taskObj.category_name, taskId)}
                              >
                                {taskObj.category_name}
                              </div>
                            </TableCell>

                            <TableCell className="align-top">
                              <div className="text-sm">{String(taskObj.assigned_engineer || '').replace(/,/g, ', ')}</div>
                            </TableCell>

                            {/* ─── COMMENT COLUMN (ALL COMMENTS) ─── */}
                            <TableCell className="align-top">
                              {(() => {
                                const fetchedComments = getCommentsArray(taskId)
                                const allText = getAllCommentsText(taskId, taskObj.comments)
                                const hasAnyComment = allText.trim() !== ''
                                const commentCount = fetchedComments.length > 0 ? fetchedComments.length : (hasComment ? 1 : 0)

                                return (
                                  <div className="flex items-start gap-2">
                                    <div
                                      className="text-sm text-gray-600 max-w-[200px] break-words cursor-pointer hover:text-blue-600 transition-colors"
                                      title={hasAnyComment ? 'Click to view all comments' : 'No comment'}
                                      onClick={() => {
                                        if (hasAnyComment) {
                                          setCommentsDialogTaskId(taskId)
                                          setCommentsDialogOpen(true)
                                        }
                                      }}
                                    >
                                      {hasAnyComment ? (
                                        <>
                                          <span dangerouslySetInnerHTML={{ __html: String(truncateComment(allText, 80)).replace(/(?:\r\n|\r|\n)/g, '<br/>') }} />
                                          {commentCount > 1 && (
                                            <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                              {commentCount}
                                            </span>
                                          )}
                                        </>
                                      ) : loadingComments ? (
                                        <span className="text-gray-400 italic">Loading...</span>
                                      ) : (
                                        <span className="text-gray-400 italic">No comment</span>
                                      )}
                                    </div>
                                    {isTLorDirector && hasAnyComment && (
                                      <button
                                        onClick={() => markCommentSeen(taskId)}
                                        className={`flex-shrink-0 mt-0.5 transition-all ${
                                          isSeen
                                            ? 'text-green-600 cursor-default'
                                            : 'text-gray-300 hover:text-green-500 cursor-pointer'
                                        }`}
                                        title={isSeen ? 'Comment reviewed ✓' : 'Click to mark as reviewed'}
                                        disabled={isSeen}
                                      >
                                        <CheckCircle2 className={`h-5 w-5 ${isSeen ? 'fill-green-100' : ''}`} />
                                      </button>
                                    )}
                                    {isSeen && !isTLorDirector && (
                                      <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                                    )}
                                  </div>
                                )
                              })()}
                            </TableCell>
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
                                {isSeen && (
                                  <span className="inline-flex items-center text-green-600" title="Comment reviewed">
                                    <CheckCircle2 className="h-4 w-4" />
                                  </span>
                                )}

                                <Button onClick={() => openDetailsForTask(taskObj)} className="h-9 px-3 flex items-center gap-2" title="View Details">
                                  <Eye className="h-4 w-4" />
                                  <span className="hidden md:inline">Details</span>
                                </Button>

                                {isTLorDirector && isAmendmentPendingTL(taskObj) && (
                                  <Button
                                    onClick={() => setAmendmentApprovalFor(taskObj)}
                                    className="h-9 px-3 bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-2"
                                    title="Review amendment request - Forward to Director or Reject"
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                    <span className="hidden sm:inline">Review Amendment (TL)</span>
                                  </Button>
                                )}

                                {canRequestAmendment(taskObj) && isStatusCompleted(taskObj.status) && (
                                  <Button
                                    onClick={() => setAmendmentTaskFor({ task_id: taskObj.task_id, serial_number: taskObj.serial_number, created_by: taskObj.created_by })}
                                    className="h-9 px-3 bg-yellow-600 hover:bg-yellow-700 text-white flex items-center gap-2"
                                    title="Request Amendment"
                                  >
                                    <Edit className="h-4 w-4" />
                                    <span className="hidden sm:inline">Request Amendment</span>
                                  </Button>
                                )}

                                {canReopenTask && isStatusCompleted(taskObj.status) && (
                                  <Button
                                    onClick={() => setReopenTaskFor({ task_id: taskObj.task_id, serial_number: taskObj.serial_number, assigned_engineer: taskObj.assigned_engineer })}
                                    className="h-9 px-3 bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-2"
                                    title="Reopen and Reassign Task (moves to Pending status)"
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
              </div>
            </>
          )}
        </div>

        <Dialog open={detailsOpen} onOpenChange={(open) => { if (!open) { setDetailsOpen(false); setSelectedTask(null); } }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Task Details {selectedTask ? `TC-${selectedTask.task_id}` : ''}</DialogTitle>
            </DialogHeader>
            <div className="p-2">
              {selectedTask ? (
                <TaskDetails taskId={selectedTask.task_id} task={selectedTask} />
              ) : (
                <div className="text-sm text-gray-600">Loading task details...</div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <ReopenTaskModal
          isOpen={!!reopenTaskFor}
          onClose={handleCloseReopenModal}
          task={reopenTaskFor}
          allEngineers={[]}
          onSuccess={handleReopenSuccess}
        />

        <RequestAmendmentModal
          isOpen={!!amendmentTaskFor}
          onClose={handleCloseAmendmentModal}
          task={amendmentTaskFor}
          onSuccess={() => handleAmendmentSuccess(amendmentTaskFor)}
        />

        <AmendmentApprovalModal
          isOpen={!!amendmentApprovalFor}
          onClose={handleCloseAmendmentApprovalModal}
          task={amendmentApprovalFor}
          onSuccess={handleAmendmentApprovalSuccess}
        />

        {/* ─── COMMENTS DIALOG: Full view of all comments for a task ─── */}
        <Dialog open={commentsDialogOpen} onOpenChange={(open) => { if (!open) { setCommentsDialogOpen(false); setCommentsDialogTaskId(null); } }}>
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

                const fetchedComments = getCommentsArray(commentsDialogTaskId)
                const taskObj = tasks.find(t => Number(t.task_id) === commentsDialogTaskId)

                if (fetchedComments.length > 0) {
                  return fetchedComments.map((comment, idx) => (
                    <div key={comment.comment_id ?? `comment-${idx}`} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                            <span className="text-blue-600 text-xs font-bold">
                              {(comment.author_name || 'S').charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{comment.author_name || 'System'}</p>
                            <p className="text-xs text-gray-500">
                              {comment.created_at ? formatDate(comment.created_at) : '—'}
                            </p>
                          </div>
                        </div>
                        {String(comment.comment_type ?? '').toLowerCase().includes('intervention') && (
                          <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs">Intervention</span>
                        )}
                        {String(comment.comment_type ?? '').toLowerCase().includes('system') && (
                          <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">System</span>
                        )}
                      </div>
                      <div className="mt-3 text-gray-700 text-sm">
                        <div dangerouslySetInnerHTML={{ __html: (comment.content || '').replace(/\n/g, '<br/>') }} />
                      </div>
                    </div>
                  ))
                }

                // Fall back to showing the initial comment from the task data
                if (taskObj && taskObj.comments && String(taskObj.comments).trim() !== '') {
                  return (
                    <div className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center space-x-2 mb-3">
                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                          <span className="text-gray-600 text-xs font-bold">C</span>
                        </div>
                        <div>
                          <p className="font-medium text-gray-900 text-sm">Initial Comment</p>
                        </div>
                      </div>
                      <div className="text-gray-700 text-sm">
                        <div dangerouslySetInnerHTML={{ __html: String(taskObj.comments).replace(/\n/g, '<br/>') }} />
                      </div>
                    </div>
                  )
                }

                return <p className="text-gray-500 text-sm text-center py-4">No comments found for this task.</p>
              })()}
            </div>
          </DialogContent>
        </Dialog>

        {/* ─── FIELD DIALOG: Description, Part Number, Category ─── */}
        <Dialog open={fieldDialogOpen} onOpenChange={open => { setFieldDialogOpen(open); if (!open) setFieldDialogData(null); setFieldExpanded(false); }}>
          <DialogContent className="max-w-xl max-h-[70vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {fieldDialogData ? `${fieldDialogData.field} — TC-${fieldDialogData.taskId}` : ''}
              </DialogTitle>
            </DialogHeader>
            <div className="p-3">
              {fieldDialogData ? renderFieldValue(fieldDialogData.value) : <div className="text-gray-400">No data.</div>}
              {fieldDialogData && fieldExpanded && fieldDialogData.value.length > FIELD_TRUNCATE && (
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setFieldExpanded(false)}>Show Less</Button>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}