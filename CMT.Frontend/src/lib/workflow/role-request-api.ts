/**
 * =====================================================================================
 * ROLE-BASED APPROVAL REQUEST API — AMENDED v22
 * CMT.Frontend/src/lib/workflow/role-request-api.ts        (REPLACES the whole v21 file)
 * Copy to: CMT.Frontend/src/lib/workflow/role-request-api.ts
 *
 * WHAT THIS FILE IS
 * -----------------
 * The typed client + hooks behind the role-based request tracker:
 *
 *   - fetchRoleRequestSummary(roleKey) joins GET /api/workflow/inbox (scope=all) with
 *     GET /api/evaluation-folders, classifies every request into the FIVE standardized
 *     buckets of role-request-model.ts, and links each row to its ETA reference (the
 *     ATA chapter code, falling back to the form number) and Part Number of the
 *     owning evaluation folder.
 *
 *   - useRoleRequestSummary(roleKey) — mount-time fetch + manual refresh, so the
 *     sidebar counts stay light (no polling).
 *
 *   - useWorkflowInboxCounts(scope) — AMENDED v22: the ONE-call alternative backed by
 *     GET /api/workflow/inbox/counts (WorkflowInboxController -> WorkflowInboxQueryService).
 *     Returns Totals, Mine, and one block per sidebar role with the five counters each.
 *
 *   - useCreatorNotifications() — the notification centre for the ATA-record creator:
 *     "Once an action is completed, the system notifies the user who originally
 *     created the ATA record. Notifications are generated per table-of-contents item"
 *     — the backend emits one NotificationResponse per ToC item action; this hook
 *     lists them and marks them read through the 204 endpoint.
 *
 * WHAT v22 CHANGES vs v21  (the "Request counts unavailable" fix)
 * ---------------------------------------------------------------
 * The v21 file was CORRECT but every call it made 404-ed on the backend:
 *
 *     GET /api/workflow/inbox?scope=all&pageSize=500    404   (no inbox action existed)
 *     GET /api/evaluation-folders?pageSize=500          404   (no controller at all)
 *     -> useRoleRequestSummary set error -> the sidebar printed
 *        "Request counts unavailable — check the workflow service."
 *
 * The backend now serves BOTH routes (WorkflowInboxController + EvaluationFoldersController,
 * both NEW). This file is amended to exploit them fully and to degrade gracefully:
 *
 *   (1) ETA + Part Number now come PRIMARILY from the inbox row itself
 *       (ataChapterCode / etaReference / partNumber — the WorkflowInboxItem superset
 *       fields), so the dashboard no longer DEPENDS on the second folders call to
 *       label its columns;
 *   (2) the folder join became BEST-EFFORT: if GET /api/evaluation-folders ever fails
 *       again, the summary still renders from the inbox fields instead of killing the
 *       whole sidebar with an error banner;
 *   (3) the bucket classification prefers the SERVER-computed statusBucket (computed
 *       per calling user by WorkflowInboxQueryService) and falls back to the local
 *       classifyRequestStatus() when the field is absent (older backend build);
 *   (4) NEW useWorkflowInboxCounts() — one round trip for the whole sidebar when you
 *       want zero client-side classification.
 *
 * EXPORT SURFACE: every v21 export keeps its exact name and shape, so
 * RoleRequestSidebarCounters.tsx and ApprovalRequestTracker.tsx need NO changes.
 * =====================================================================================
 */

'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  getWorkflowInbox,
  getWorkflowInboxCounts,
  listEvaluationFolders,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/workflow/workflow-api'
import {
  REQUEST_BUCKET_ORDER,
  classifyRequestStatus,
  type RequestBucket,
  type RoleRequestRoleKey,
} from '@/lib/workflow/role-request-model'
import {
  ApprovalStatus,
  type InboxItemResponse,
  type NotificationResponse,
} from '@/lib/workflow/workflow-types'
import {
  toRequestBucket,
  type WorkflowInboxCountsResponse,
  type WorkflowInboxItemResponse,
} from '@/lib/workflow/workflow-inbox-types'

// =====================================================================================
// 1. ROW + SUMMARY SHAPES
// =====================================================================================

export interface RoleRequestRow {
  instanceId: string
  formType: string
  formNo: string
  title: string
  sectionTitle: string

  status: ApprovalStatus
  statusLabel: string
  bucket: RequestBucket

  stepNo: number
  stepTitle: string
  assigneeName: string
  isUnitQueue: boolean
  canIAct: boolean
  needsAssignment: boolean

  originatorName: string
  submittedAt?: string | null
  isOverdue: boolean

  evaluationFolderId?: string | null
  /**
   * The ETA reference the request is tracked against: the ATA chapter code of the
   * owning evaluation folder, falling back to the workflow form number (e.g. MNT-918A).
   */
  etaRef: string
  /** Part Number of the owning evaluation folder ("—" when the request is standalone). */
  partNumber: string
}

export interface RoleRequestSummary {
  roleKey: RoleRequestRoleKey
  rows: RoleRequestRow[]
  counts: Record<RequestBucket, number>
}

function emptyCounts(): Record<RequestBucket, number> {
  return { assigned: 0, pending: 0, reviewed: 0, completed: 0, rejected: 0 }
}

/**
 * AMENDED v22 - the row builder now consumes the WorkflowInboxItem SUPERSET (the real
 * answer of GET /api/workflow/inbox). Every base field keeps the InboxItemResponse name;
 * the sidebar additions are read with safe fallbacks so an older backend build that
 * returns the plain InboxItemResponse shape still renders (bucket falls back to
 * classifyRequestStatus, etaRef/partNumber fall back to the folder join / form number).
 */
function buildRow(item: WorkflowInboxItemResponse, roleKey: RoleRequestRoleKey): RoleRequestRow {
  // Server-computed bucket for the CALLING user; local classification as fallback.
  const serverBucket = toRequestBucket(item.statusBucket)
  const bucket: RequestBucket =
    serverBucket ?? classifyRequestStatus(item.status as ApprovalStatus, roleKey)

  const assigneeName = item.isUnitQueue
    ? item.assignmentUnit || ''
    : item.currentAssigneeName || ''

  return {
    instanceId: item.instanceId,
    formType: item.formType,
    formNo: item.formNo,
    title: item.title,
    sectionTitle: item.sectionTitle,
    status: item.status as ApprovalStatus,
    statusLabel: item.statusLabel,
    bucket,
    stepNo: item.stepNo,
    stepTitle: item.stepTitle,
    assigneeName,
    isUnitQueue: item.isUnitQueue,
    canIAct: item.canIAct,
    needsAssignment: item.needsAssignment,
    originatorName: item.originatorName,
    submittedAt: item.submittedAt ?? null,
    isOverdue: item.isOverdue,
    evaluationFolderId: item.evaluationFolderId ?? null,
    // AMENDED v22 - etaRef prefers the ATA chapter code carried by the inbox row
    // (ataChapterCode and its etaReference alias), then the folder join, then formNo.
    etaRef: '—',
    partNumber: '—',
  }
}

// =====================================================================================
// 2. THE SUMMARY FETCH
// =====================================================================================

/**
 * Joins the workflow inbox (every scope, so Completed/Rejected history is included)
 * with the evaluation folders, and classifies each request into the standardized
 * buckets from the given role's perspective.
 *
 * AMENDED v22 - the folders call is BEST-EFFORT. The inbox now carries ataChapterCode /
 * partNumber itself, so a folders outage degrades the join instead of failing the
 * sidebar — the exact regression that produced "Request counts unavailable".
 */
export async function fetchRoleRequestSummary(
  roleKey: RoleRequestRoleKey,
): Promise<RoleRequestSummary> {
  // The inbox is the PRIMARY source; if it fails the summary genuinely cannot exist.
  const inbox = await getWorkflowInbox({ scope: 'all', pageSize: 500 })
  const items = inbox as unknown as WorkflowInboxItemResponse[]

  // The folders join is SECONDARY: on failure folderById stays empty and every row
  // keeps the inbox-supplied ETA / Part Number.
  const folders = await listEvaluationFolders({ pageSize: 500 }).catch(() => [])
  const folderById = new Map(folders.map(f => [f.id, f]))

  const rows: RoleRequestRow[] = items.map(item => {
    const row = buildRow(item, roleKey)

    // (a) straight from the inbox row (WorkflowInboxItem superset fields);
    const ataFromInbox = ((item.ataChapterCode || item.etaReference || '') as string).trim()
    if (ataFromInbox) row.etaRef = ataFromInbox
    const partFromInbox = ((item.partNumber || '') as string).trim()
    if (partFromInbox) row.partNumber = partFromInbox

    // (b) folder join as the fallback / enrichment for older backend builds;
    const folder = row.evaluationFolderId ? folderById.get(row.evaluationFolderId) : undefined
    if (folder) {
      if (!ataFromInbox) {
        const ata = (folder.ataChapterCode || '').trim()
        if (ata) row.etaRef = ata
      }
      if (!partFromInbox) {
        const part = (folder.partNumber || '').trim()
        if (part) row.partNumber = part
      }
    }

    // (c) last resort: the workflow form number keeps the row identifiable.
    if (row.etaRef === '—' && item.formNo) row.etaRef = item.formNo

    return row
  })

  // Chase order: assigned first, then travelling, then rejected, then completed;
  // within a bucket, overdue first, then newest submission.
  rows.sort((a, b) => {
    const bucketDelta =
      REQUEST_BUCKET_ORDER.indexOf(a.bucket) - REQUEST_BUCKET_ORDER.indexOf(b.bucket)
    if (bucketDelta !== 0) return bucketDelta
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1
    return (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '')
  })

  const counts = emptyCounts()
  for (const row of rows) counts[row.bucket] += 1

  return { roleKey, rows, counts }
}

// =====================================================================================
// 3. HOOKS
// =====================================================================================

/** Mount-time summary fetch + manual refresh. Pass null to disable (role not tracked). */
export function useRoleRequestSummary(roleKey: RoleRequestRoleKey | null) {
  const [summary, setSummary] = useState<RoleRequestSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const refresh = useCallback(() => setRefreshTick(t => t + 1), [])

  useEffect(() => {
    if (!roleKey) return
    let cancelled = false
    let timer: number | undefined
    setLoading(true)
    setError(null)
    fetchRoleRequestSummary(roleKey)
      .then(result => {
        if (!cancelled) setSummary(result)
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load workflow requests')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    timer = window.setInterval(() => {
      fetchRoleRequestSummary(roleKey)
        .then(result => {
          if (!cancelled) setSummary(result)
        })
        .catch(() => {
          // Preserve the last good counter snapshot during a transient poll failure.
        })
    }, 10000)
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [roleKey, refreshTick])

  return { summary, loading, error, refresh }
}

export interface WorkflowInboxCountsState {
  counts: WorkflowInboxCountsResponse | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/**
 * AMENDED v22 - the ONE-call sidebar alternative.
 *
 * GET /api/workflow/inbox/counts answers Totals + Mine ("My Requests") + one block per
 * sidebar role (Director, Manager, Shop Team Leader, CAA Officer, QA Manager,
 * Documentation) with the five counters each, computed server-side by
 * WorkflowInboxQueryService. Use this when you want the sidebar to make a single round
 * trip and no client-side classification at all.
 */
export function useWorkflowInboxCounts(
  scope: 'mine' | 'shop' | 'all' = 'all',
  enabled: boolean = true,
): WorkflowInboxCountsState {
  const [counts, setCounts] = useState<WorkflowInboxCountsResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const refresh = useCallback(() => setRefreshTick(t => t + 1), [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let timer: number | undefined
    setLoading(true)
    setError(null)
    getWorkflowInboxCounts({ scope })
      .then(result => {
        if (!cancelled) setCounts(result)
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load request counts')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    timer = window.setInterval(() => {
      getWorkflowInboxCounts({ scope })
        .then(result => {
          if (!cancelled) setCounts(result)
        })
        .catch(() => {
          // Preserve the last good snapshot during a transient poll failure.
        })
    }, 10000)
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearInterval(timer)
    }
  }, [scope, enabled, refreshTick])

  return { counts, loading, error, refresh }
}

export interface CreatorNotificationsState {
  notifications: NotificationResponse[]
  unreadCount: number
  loading: boolean
  error: string | null
  refresh: () => void
  markRead: (notificationId: string) => Promise<void>
  markAllRead: () => Promise<void>
}

/**
 * The creator's notification centre. The backend generates one notification per
 * table-of-contents item action (assignment, approval, rejection, completion...);
 * this hook lists them newest-first and marks them read through the 204 endpoint.
 */
export function useCreatorNotifications(): CreatorNotificationsState {
  const [notifications, setNotifications] = useState<NotificationResponse[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const refresh = useCallback(() => setRefreshTick(t => t + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listNotifications({ pageSize: 200 })
      .then(list => {
        if (!cancelled) setNotifications(list)
      })
      .catch(err => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load notifications')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshTick])

  const markRead = useCallback(
    async (notificationId: string) => {
      await markNotificationRead(notificationId)
      setNotifications(prev =>
        prev.map(n => (n.id === notificationId ? { ...n, isRead: true } : n)),
      )
    },
    [],
  )

  const markAllRead = useCallback(async () => {
    await markAllNotificationsRead()
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
  }, [])

  const unreadCount = notifications.filter(n => !n.isRead).length

  return { notifications, unreadCount, loading, error, refresh, markRead, markAllRead }
}

// Re-export for convenience: ApprovalRequestTracker imports the type from here in v21.
export type { InboxItemResponse }