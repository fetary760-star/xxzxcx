'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import apiClient from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import {
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  MessageSquare,
  User,
  Calendar,
  FileText,
  Paperclip,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import HoldRequestReviewModal from '@/components/HoldRequestReviewModal'

// ─── Hold Request Types ───
interface HoldRequest {
  holdRequestId: number
  taskId: number
  serialNumber: string
  taskDescription: string
  requestedByEngineerId: number
  requestedByEngineerName: string
  holdReason: string
  daysWorkedByEngineer: number
  assignedDate?: string
  holdRequestedDate: string
  status: string
  reviewedByTlId?: number
  reviewedByTlName?: string
  reviewDate?: string
  reviewComments?: string
  actionTaken?: string
}

// ─── Comment Type ───
interface TaskComment {
  comment_id?: number
  content: string
  author_name: string
  created_at: string
  comment_type?: string
}

// ─── Pending TL Approval Task Types ───
interface PendingTask {
  task_id: number
  serial_number: string
  part_number: string
  po_number: string
  description: string
  category_name: string
  assigned_engineer: string
  priority_level_name: string
  creator_name: string
  created_by?: number
  target_completion_date?: string | null
  created_at?: string | null
  shop_name?: string | null
  attachments_count?: number
  comments?: string
}

type FilterStatus = 'all' | 'pending' | 'approved' | 'rejected'

function normalizeStatus(status: any): string {
  if (status === null || status === undefined) return 'Pending'
  if (typeof status === 'number') {
    switch (status) {
      case 0: return 'Pending'
      case 1: return 'In Progress'
      case 2: return 'Completed'
      case 3: return 'Blocked'
      case 4: return 'On Hold'
      case 5: return 'Rejected'
      case 6: return 'Cancelled'
      case 7: return 'Paused'
      case 8: return 'Pending TL Approval'
      default: return 'Pending'
    }
  }
  const statusStr = String(status).toLowerCase().replace(/[_\s-]+/g, '')
  if (statusStr.includes('pendingtlapproval') || statusStr === 'pendingtl' || statusStr === 'pendingapproval') return 'Pending TL Approval'
  return String(status)
}

function canonicalizeRole(raw: any): string {
  if (!raw && raw !== 0) return ''
  if (typeof raw === 'number') {
    const map: Record<string, string> = { 0: 'team_leader', 1: 'director', 2: 'engineer', 3: 'customer', 4: 'customer_personnel', 5: 'shop_tl', 6: 'manager', 7: 'admin', 8: 'shop_manager' }
    return map[String(raw)] ?? String(raw)
  }
  return String(raw).trim().toLowerCase().replace(/[\s\-_]+/g, '_')
}

export default function PendingTLApprovalsPage() {
  const router = useRouter()
  const { user, directorPermissions } = useAuth()

  // ─── Hold Requests State (Director only) ───
  const [holdRequests, setHoldRequests] = useState<HoldRequest[]>([])
  const [holdLoading, setHoldLoading] = useState(true)

  // ─── Pending TL Approval Tasks State ───
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([])
  const [tasksLoading, setTasksLoading] = useState(true)

  const [error, setError] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('pending')
  const [directorNote, setDirectorNote] = useState<Record<number, string>>({})
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState<HoldRequest | null>(null)

  // Approve/Reject task states
  const [approvingTaskId, setApprovingTaskId] = useState<number | null>(null)
  const [rejectingTaskId, setRejectingTaskId] = useState<number | null>(null)

  // Active tab
  const [activeTab, setActiveTab] = useState('tasks')

  // ─── Comments state ───
  const [allCommentsMap, setAllCommentsMap] = useState<Record<number, TaskComment[]>>({})
  const [loadingComments, setLoadingComments] = useState(false)

  // ─── Comments dialog state ───
  const [commentsDialogOpen, setCommentsDialogOpen] = useState(false)
  const [commentsDialogTaskId, setCommentsDialogTaskId] = useState<number | null>(null)

  // ─── Approve dialog state ───
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [approveDialogTaskId, setApproveDialogTaskId] = useState<number | null>(null)
  const [approveComment, setApproveComment] = useState('')

  const userRole = canonicalizeRole(user?.role ?? '')
  const isDirector = userRole === 'director'
  const isTeamLeader = userRole === 'team_leader'
  const isAdmin = userRole === 'admin'
  // Non-privileged roles (engineer, customer_personnel, etc.) can view their own pending tasks
  const isPrivilegedRole = isTeamLeader || isAdmin || isDirector

  // Access: team_leader, director (with permission), admin, and any authenticated user
  // (non-privileged users will only see tasks they created or are assigned to)
  const hasAccess =
    isTeamLeader ||
    isAdmin ||
    (isDirector && directorPermissions?.canViewPendingTLApprovals !== false) ||
    !!user

  useEffect(() => {
    if (!user) return
    if (!hasAccess) {
      router.push('/unauthorized')
      return
    }
    loadAll()
  }, [user, hasAccess, router])

  const loadAll = useCallback(async () => {
    if (!user || !hasAccess) return
    await Promise.all([loadPendingTasks(), isDirector ? loadHoldRequests() : Promise.resolve()])
  }, [user, hasAccess, isDirector])

  // ─── Fetch comments for all pending tasks ───
  const fetchAllCommentsForTasks = useCallback(async (taskList: PendingTask[]) => {
    if (!taskList || taskList.length === 0) return
    setLoadingComments(true)
    const commentsMap: Record<number, TaskComment[]> = {}

    const BATCH_SIZE = 10
    for (let i = 0; i < taskList.length; i += BATCH_SIZE) {
      const batch = taskList.slice(i, i + BATCH_SIZE)
      const results = await Promise.allSettled(
        batch.map(async (t) => {
          const taskId = Number(t.task_id)
          if (!taskId || taskId === 0) return { taskId, comments: [] as TaskComment[] }

          try {
            let data: any = null

            // Try regular task comments endpoint
            try {
              data = await apiClient.get(`/tasks/${taskId}/comments`)
            } catch {}

            if (!data) return { taskId, comments: [] as TaskComment[] }
            const commentsList = Array.isArray(data) ? data : data?.comments ?? data?.data ?? []
            const normalized: TaskComment[] = commentsList.map((c: any) => ({
              comment_id: c.comment_id ?? c.commentId ?? c.id,
              content: c.content ?? c.comment_text ?? c.commentText ?? '',
              author_name: c.author_name ?? c.authorName ?? 'System',
              created_at: c.created_at ?? c.createdAt ?? '',
              comment_type: c.comment_type ?? c.commentType ?? 'UserComment',
            }))
            return { taskId, comments: normalized }
          } catch {
            return { taskId, comments: [] as TaskComment[] }
          }
        })
      )

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          const { taskId, comments } = result.value
          if (taskId && comments.length > 0) {
            commentsMap[taskId] = comments
          }
        }
      }
    }

    setAllCommentsMap(commentsMap)
    setLoadingComments(false)
  }, [])

  // ─── Get all comments text for a task ───
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
    return fallbackComment || ''
  }, [allCommentsMap])

  // ─── Get the comments array for a task ───
  const getCommentsArray = useCallback((taskId: number): TaskComment[] => {
    return allCommentsMap[taskId] || []
  }, [allCommentsMap])

  // Truncate comment for display
  const truncateComment = (comment: string, maxLen = 60) => {
    if (!comment || comment.trim() === '') return '—'
    if (comment.length <= maxLen) return comment
    return comment.substring(0, maxLen) + '…'
  }

  // ─── Load tasks with PendingTLApproval status ───
  const loadPendingTasks = async () => {
    setTasksLoading(true)
    setError(null)
    try {
      const response = await apiClient.get('/tasks?status=PendingTLApproval')
      let list: any[] = []
      if (Array.isArray(response)) list = response
      else if (Array.isArray(response?.tasks)) list = response.tasks
      else if (Array.isArray(response?.data)) list = response.data

      const normalized = list
        .filter((t: any) => {
          const s = normalizeStatus(t.status ?? t.Status ?? t.taskStatus ?? 0)
          return s === 'Pending TL Approval'
        })
        .map((t: any) => ({
          task_id: Number(t.task_id ?? t.id ?? t.taskId ?? t.TaskId ?? 0),
          serial_number: t.serial_number ?? t.serialNumber ?? t.SerialNumber ?? '',
          part_number: t.part_number ?? t.partNumber ?? t.PartNumber ?? '',
          po_number: t.po_number ?? t.poNumber ?? t.PoNumber ?? '',
          description: t.description ?? t.details ?? t.Description ?? '',
          category_name: t.category_name ?? t.categoryName ?? t.CategoryName ?? '',
          assigned_engineer: t.assigned_engineer ?? t.assignedEngineer ?? t.AssignedEngineer ?? '',
          priority_level_name: t.priority_level_name ?? t.priority_name ?? t.priorityName ?? t.PriorityName ?? '',
          creator_name: t.creator_name ?? t.created_by_name ?? t.createdByName ?? t.CreatedByName ?? '',
          created_by: Number(t.created_by ?? t.createdBy ?? t.CreatedBy ?? 0),
          target_completion_date: t.target_completion_date ?? t.targetCompletionDate ?? null,
          created_at: t.created_at ?? t.createdAt ?? t.CreatedAt ?? t.TaskCreatedAt ?? null,
          updated_at: t.updated_at ?? t.updatedAt ?? t.UpdatedAt ?? t.TaskUpdatedAt ?? null,
          shop_name: t.shop_name ?? t.shopName ?? t.ShopName ?? null,
          attachments_count: t.attachments_count ?? t.attachmentsCount ?? 0,
          comments: t.comments ?? t.Comments ?? t.comment ?? t.Comment ?? '',
        }))

      // For non-privileged roles (engineer, customer_personnel, etc.),
      // only show tasks they created or are assigned to
      const filteredForRole = isPrivilegedRole
        ? normalized
        : normalized.filter((t) => {
            const currentUserId = Number(user?.userId ?? user?.id ?? 0)
            // Check if user is the creator
            if (t.created_by && t.created_by === currentUserId) return true
            // Check if user is the assigned engineer
            const currentFullName = (user?.fullName || '').trim().toLowerCase()
            if (currentFullName && t.assigned_engineer) {
              const engineers = t.assigned_engineer.split(',').map((s: string) => s.trim().toLowerCase())
              if (engineers.includes(currentFullName)) return true
            }
            return false
          })

      setPendingTasks(filteredForRole)

      // Fetch all comments for each task in the background
      fetchAllCommentsForTasks(normalized)
    } catch (err: any) {
      console.error('[PendingTLApprovalsPage] Failed to load pending tasks:', err)
      setError(err?.message || 'Failed to load pending approval tasks')
    } finally {
      setTasksLoading(false)
    }
  }

  // ─── Load hold requests (Director only) ───
  const loadHoldRequests = async () => {
    setHoldLoading(true)
    try {
      const response = await apiClient.get('/task-holds/pending')
      let data = response?.holdRequests || response?.data || response || []
      if (!Array.isArray(data) && data.holdRequests) data = data.holdRequests
      else if (!Array.isArray(data) && data.data) data = data.data
      else if (!Array.isArray(data) && data.payload) data = data.payload

      const requests = Array.isArray(data) ? data : []
      const normalizedRequests = requests.map((req: any) => ({
        holdRequestId: req.holdRequestId || req.HoldRequestId || req.hold_request_id || 0,
        taskId: req.taskId || req.TaskId || req.task_id || 0,
        serialNumber: req.serialNumber || req.SerialNumber || req.serial_number || '',
        taskDescription: req.taskDescription || req.TaskDescription || req.description || '',
        requestedByEngineerId: req.requestedByEngineerId || req.RequestedByEngineerId || 0,
        requestedByEngineerName: req.requestedByEngineerName || req.RequestedByEngineerName || 'Unknown',
        holdReason: req.holdReason || req.HoldReason || req.reason || 'No reason provided',
        daysWorkedByEngineer: req.daysWorkedByEngineer || req.DaysWorkedByEngineer || 0,
        assignedDate: req.assignedDate || req.AssignedDate || null,
        holdRequestedDate: req.holdRequestedDate || req.HoldRequestedDate || new Date().toISOString(),
        status: req.status || req.Status || 'PendingApproval',
        reviewedByTlId: req.reviewedByTlId || req.ReviewedByTlId || null,
        reviewedByTlName: req.reviewedByTlName || req.ReviewedByTlName || null,
        reviewDate: req.reviewDate || req.ReviewDate || null,
        reviewComments: req.reviewComments || req.ReviewComments || null,
        actionTaken: req.actionTaken || req.ActionTaken || null,
      }))

      setHoldRequests(normalizedRequests)
    } catch (err: any) {
      console.error('[PendingTLApprovalsPage] Failed to load hold requests:', err)
    } finally {
      setHoldLoading(false)
    }
  }

  // ─── Open Approve Dialog ───
  const openApproveDialog = (taskId: number) => {
    setApproveDialogTaskId(taskId)
    setApproveComment('')
    setApproveDialogOpen(true)
  }

  // ─── Confirm Approve Task Completion ───
  const confirmApproveTask = async () => {
    if (approveDialogTaskId === null) return
    const taskId = approveDialogTaskId
    setApproveDialogOpen(false)
    setApprovingTaskId(taskId)
    setError(null)
    try {
      await apiClient.post(`/tasks/${taskId}/approve-completion`, { comment: approveComment.trim() || null })
      // Refresh
      await loadPendingTasks()
      window.dispatchEvent(new Event('tasks:refresh'))
      window.dispatchEvent(new CustomEvent('pending-tl-approvals:refresh'))
    } catch (err: any) {
      console.error('Failed to approve completion:', err)
      setError(err?.message || 'Failed to approve task completion')
    } finally {
      setApprovingTaskId(null)
      setApproveDialogTaskId(null)
      setApproveComment('')
    }
  }

  // ─── Reject Task Completion ───
  const handleRejectTask = async (taskId: number) => {
    const reason = prompt('Please provide a reason for rejecting this completion:')
    if (reason === null) return
    if (!reason.trim()) {
      alert('A rejection reason is required.')
      return
    }
    setRejectingTaskId(taskId)
    setError(null)
    try {
      await apiClient.post(`/tasks/${taskId}/reject-completion`, { Comment: reason.trim() })
      // Refresh
      await loadPendingTasks()
      window.dispatchEvent(new Event('tasks:refresh'))
      window.dispatchEvent(new CustomEvent('pending-tl-approvals:refresh'))
    } catch (err: any) {
      console.error('Failed to reject completion:', err)
      setError(err?.message || 'Failed to reject task completion')
    } finally {
      setRejectingTaskId(null)
    }
  }

  // ─── Hold Request Review ───
  const handleHoldReview = async (
    holdRequestId: number,
    decision: 'approve' | 'reject',
    action?: string
  ) => {
    setProcessingId(holdRequestId)
    setError(null)
    try {
      const payload: any = {
        Decision: decision,
        ReviewComments:
          directorNote[holdRequestId] ||
          (decision === 'approve' ? 'Director approval' : 'Director rejection'),
      }
      if (decision === 'approve' && action) {
        payload.Action = action
      }
      await apiClient.post(`/task-holds/${holdRequestId}/review`, payload)
      setDirectorNote((prev) => {
        const updated = { ...prev }
        delete updated[holdRequestId]
        return updated
      })
      await loadHoldRequests()
      window.dispatchEvent(new CustomEvent('hold-requests:refresh'))
      window.dispatchEvent(new CustomEvent('tasks:refresh'))
      window.dispatchEvent(new CustomEvent('pending-tl-approvals:refresh'))
    } catch (err: any) {
      console.error('Failed to review hold request:', err)
      setError(err?.message || 'Failed to process review')
    } finally {
      setProcessingId(null)
    }
  }

  const handleReviewModalClick = (request: HoldRequest) => {
    setSelectedRequest(request)
    setReviewModalOpen(true)
  }

  const handleReviewSuccess = () => {
    setReviewModalOpen(false)
    setSelectedRequest(null)
    loadHoldRequests()
    window.dispatchEvent(new CustomEvent('hold-requests:refresh'))
    window.dispatchEvent(new CustomEvent('tasks:refresh'))
    window.dispatchEvent(new CustomEvent('pending-tl-approvals:refresh'))
  }

  const handleDirectorNoteChange = (holdRequestId: number, note: string) => {
    setDirectorNote((prev) => ({ ...prev, [holdRequestId]: note }))
  }

  // ─── Filtering ───
  const filteredTasks = pendingTasks.filter((task) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      task.description.toLowerCase().includes(q) ||
      task.serial_number.toLowerCase().includes(q) ||
      task.part_number.toLowerCase().includes(q) ||
      task.assigned_engineer.toLowerCase().includes(q) ||
      task.creator_name.toLowerCase().includes(q) ||
      String(task.task_id).includes(q) ||
      getAllCommentsText(task.task_id, task.comments || '').toLowerCase().includes(q)
    )
  })

  const filteredHoldRequests = holdRequests.filter((request) => {
    if (filterStatus !== 'all') {
      const status = request.status.toLowerCase().replace(/[\s_-]/g, '')
      if (filterStatus === 'pending' && status !== 'pendingapproval' && status !== 'pending') return false
      if (filterStatus === 'approved' && status !== 'approved') return false
      if (filterStatus === 'rejected' && status !== 'rejected') return false
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      return (
        request.taskDescription.toLowerCase().includes(query) ||
        request.serialNumber.toLowerCase().includes(query) ||
        request.requestedByEngineerName.toLowerCase().includes(query) ||
        request.holdReason.toLowerCase().includes(query) ||
        String(request.taskId).includes(query)
      )
    }
    return true
  })

  const pendingHoldCount = holdRequests.filter((r) => {
    const s = r.status.toLowerCase().replace(/[\s_-]/g, '')
    return s === 'pendingapproval' || s === 'pending'
  }).length

  const getHoldStatusBadge = (status: string) => {
    const s = status.toLowerCase().replace(/[\s_-]/g, '')
    switch (s) {
      case 'pendingapproval':
      case 'pending':
        return (
          <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
            <Clock className="h-3 w-3 mr-1" />
            Pending Approval
          </Badge>
        )
      case 'approved':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        )
      case 'rejected':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        )
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const getPriorityBadgeClass = (p?: string) => {
    if (!p) return 'bg-gray-200 text-gray-700'
    const key = p.toLowerCase()
    if (key.includes('critical')) return 'bg-red-700 text-white'
    if (key.includes('high')) return 'bg-rose-500 text-white'
    if (key.includes('medium')) return 'bg-yellow-500 text-white'
    if (key.includes('low')) return 'bg-green-600 text-white'
    return 'bg-gray-200 text-gray-700'
  }

  const formatDate = (dateString?: string | null): string => {
    if (!dateString) return 'N/A'
    try {
      const d = new Date(dateString)
      const day = String(d.getDate()).padStart(2, '0')
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const month = months[d.getMonth()]
      const year = d.getFullYear()
      return `${day}/${month}/${year}`
    } catch {
      return 'N/A'
    }
  }

  if (!user || !hasAccess) {
    return null
  }

  const loading = tasksLoading || holdLoading

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Pending TL Approvals</h1>
            <p className="text-gray-600 mt-1">
              {isPrivilegedRole
                ? 'Review and approve/reject task completions and hold requests pending Team Leader approval.'
                : 'Track your tasks that are pending Team Leader approval.'}
            </p>
          </div>
          <Button onClick={loadAll} variant="outline" disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="bg-orange-100 p-2 rounded-full">
                <Clock className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">{pendingTasks.length}</div>
                <div className="text-sm text-gray-600">Tasks Pending Approval</div>
              </div>
            </CardContent>
          </Card>
          {isDirector && (
            <Card className="border-l-4 border-l-yellow-500">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="bg-yellow-100 p-2 rounded-full">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-yellow-600">{pendingHoldCount}</div>
                  <div className="text-sm text-gray-600">Hold Requests Pending</div>
                </div>
              </CardContent>
            </Card>
          )}
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-full">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {pendingTasks.length + (isDirector ? pendingHoldCount : 0)}
                </div>
                <div className="text-sm text-gray-600">
                  {isPrivilegedRole ? 'Total Items Requiring Action' : 'Total Items Awaiting Review'}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search Bar */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by task ID, description, engineer name, serial number, part number, or comment..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-md bg-red-50 p-4">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-red-400" />
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Tabs: Tasks Pending Approval + Hold Requests (Director only) */}
        {isDirector ? (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="tasks" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Task Completions
                {pendingTasks.length > 0 && (
                  <Badge variant="destructive" className="ml-1 bg-orange-500 text-white">
                    {pendingTasks.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="holds" className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Hold Requests
                {pendingHoldCount > 0 && (
                  <Badge variant="destructive" className="ml-1 bg-yellow-500 text-white">
                    {pendingHoldCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tasks" className="mt-4">
              {renderPendingTasksSection()}
            </TabsContent>

            <TabsContent value="holds" className="mt-4">
              {/* Hold Request Filter */}
              <div className="flex items-center gap-2 mb-4">
                <Filter className="h-4 w-4 text-gray-500" />
                <div className="flex gap-1">
                  {(['all', 'pending', 'approved', 'rejected'] as FilterStatus[]).map((status) => (
                    <Button
                      key={status}
                      variant={filterStatus === status ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilterStatus(status)}
                      className="capitalize"
                    >
                      {status}
                    </Button>
                  ))}
                </div>
              </div>
              {renderHoldRequestsSection()}
            </TabsContent>
          </Tabs>
        ) : (
          // Team Leader / Admin: only show pending tasks
          renderPendingTasksSection()
        )}
      </div>

      {/* Review Modal */}
      <HoldRequestReviewModal
        isOpen={reviewModalOpen}
        onClose={() => {
          setReviewModalOpen(false)
          setSelectedRequest(null)
        }}
        holdRequest={selectedRequest}
        onSuccess={handleReviewSuccess}
      />

      {/* ─── APPROVE COMPLETION DIALOG ─── */}
      <Dialog open={approveDialogOpen} onOpenChange={(open) => { if (!open) { setApproveDialogOpen(false); setApproveDialogTaskId(null); setApproveComment(''); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Approve Task Completion {approveDialogTaskId ? `— TC-${approveDialogTaskId}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-600">
              Are you sure you want to approve this task completion? The task will be moved to Completed Tasks.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Comment (optional)
              </label>
              <textarea
                value={approveComment}
                onChange={(e) => setApproveComment(e.target.value)}
                placeholder="Add a comment for this approval (optional)..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none bg-white"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => { setApproveDialogOpen(false); setApproveDialogTaskId(null); setApproveComment(''); }}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmApproveTask}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Confirm Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              const taskObj = pendingTasks.find(t => Number(t.task_id) === commentsDialogTaskId)

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
    </MainLayout>
  )

  // ─── Render: Pending Task Completions ───
  function renderPendingTasksSection() {
    if (tasksLoading) {
      return (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <span className="ml-3 text-gray-600">Loading pending task completions...</span>
        </div>
      )
    }

    if (filteredTasks.length === 0) {
      return (
        <Card>
          <CardContent className="p-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery ? 'No Matching Tasks' : 'No Tasks Pending Approval'}
            </h3>
            <p className="text-gray-600">
              {searchQuery
                ? 'Try adjusting your search criteria.'
                : 'All engineer task completions have been reviewed. Great job!'}
            </p>
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="grid gap-4">
        {filteredTasks.map((task) => {
          const taskId = Number(task.task_id)
          const allText = getAllCommentsText(taskId, task.comments || '')
          const hasAnyComment = allText.trim() !== ''
          const fetchedComments = getCommentsArray(taskId)
          const commentCount = fetchedComments.length > 0 ? fetchedComments.length : ((task.comments && String(task.comments).trim() !== '') ? 1 : 0)

          return (
            <Card key={task.task_id} className="border-l-4 border-l-orange-500 hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5 text-gray-500" />
                      Task TC-{task.task_id}
                      <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                        <Clock className="h-3 w-3 mr-1" />
                        Pending TL Approval
                      </Badge>
                      <span className={`inline-flex items-center font-semibold px-2 py-0.5 rounded text-xs ${getPriorityBadgeClass(task.priority_level_name)}`}>
                        {task.priority_level_name || 'N/A'}
                      </span>
                    </CardTitle>
                    {task.serial_number && (
                      <div className="flex items-center gap-2 text-sm mt-1 text-muted-foreground">
                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                          {task.serial_number}
                        </span>
                        {task.part_number && (
                          <span className="text-gray-500">• Part: {task.part_number}</span>
                        )}
                        {task.po_number && (
                          <span className="text-gray-500">• PO: {task.po_number}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Description */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Description</h4>
                  <p className="text-sm text-gray-900">{task.description || 'No description'}</p>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <div>
                      <span className="text-gray-500 block text-xs">Assigned Engineer</span>
                      <span className="font-medium">{task.assigned_engineer || 'Unassigned'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <div>
                      <span className="text-gray-500 block text-xs">Created By</span>
                      <span className="font-medium">{task.creator_name || 'N/A'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <div>
                      <span className="text-gray-500 block text-xs">Target Date</span>
                      <span className="font-medium">{formatDate(task.target_completion_date)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <div>
                      <span className="text-gray-500 block text-xs">Created At</span>
                      <span className="font-medium">{formatDate(task.created_at)}</span>
                    </div>
                  </div>
                  {task.category_name && (
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <div>
                        <span className="text-gray-500 block text-xs">Category</span>
                        <span className="font-medium">{task.category_name}</span>
                      </div>
                    </div>
                  )}
                  {task.shop_name && (
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <div>
                        <span className="text-gray-500 block text-xs">Shop</span>
                        <span className="font-medium">{task.shop_name}</span>
                      </div>
                    </div>
                  )}
                  {(task.attachments_count ?? 0) > 0 && (
                    <div className="flex items-center gap-2">
                      <Paperclip className="h-4 w-4 text-gray-400" />
                      <div>
                        <span className="text-gray-500 block text-xs">Attachments</span>
                        <span className="font-medium">{task.attachments_count}</span>
                      </div>
                    </div>
                  )}
                  {/* ─── Comment field in details grid ─── */}
                  <div className="flex items-start gap-2 col-span-2">
                    <MessageSquare className="h-4 w-4 text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <span className="text-gray-500 block text-xs">Comment</span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-medium text-sm ${hasAnyComment ? 'cursor-pointer hover:text-blue-600 transition-colors' : 'text-gray-400 italic'}`}
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
                            'Loading...'
                          ) : (
                            'No comment'
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Info Banner */}
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm text-orange-800">
                  {isPrivilegedRole ? (
                    <><strong>Engineer marked this task as completed.</strong> Please review and approve to move it to Completed Tasks, or reject to send it back to In Progress.</>
                  ) : (
                    <><strong>This task is pending Team Leader approval.</strong> You will be notified once it has been reviewed.</>
                  )}
                </div>

                {/* Action Buttons — Only for privileged roles (TL, Director, Admin) */}
                {isPrivilegedRole && (
                  <div className="flex gap-3 pt-4 border-t">
                    <Button
                      onClick={() => openApproveDialog(task.task_id)}
                      disabled={approvingTaskId === task.task_id || rejectingTaskId === task.task_id}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    >
                      {approvingTaskId === task.task_id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      Approve Completion
                    </Button>
                    <Button
                      onClick={() => handleRejectTask(task.task_id)}
                      disabled={approvingTaskId === task.task_id || rejectingTaskId === task.task_id}
                      variant="destructive"
                      className="flex-1"
                    >
                      {rejectingTaskId === task.task_id ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      Reject — Send Back
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }

  // ─── Render: Hold Requests (Director only) ───
  function renderHoldRequestsSection() {
    if (holdLoading) {
      return (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          <span className="ml-3 text-gray-600">Loading hold requests...</span>
        </div>
      )
    }

    if (filteredHoldRequests.length === 0) {
      return (
        <Card>
          <CardContent className="p-12 text-center">
            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery || filterStatus !== 'pending'
                ? 'No Matching Requests'
                : 'No Pending Hold Requests'}
            </h3>
            <p className="text-gray-600">
              {searchQuery || filterStatus !== 'pending'
                ? 'Try adjusting your search or filter criteria.'
                : 'All hold requests have been reviewed by Team Leaders.'}
            </p>
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="grid gap-4">
        {filteredHoldRequests.map((request) => {
          const isPending =
            request.status.toLowerCase().replace(/[\s_-]/g, '') === 'pendingapproval' ||
            request.status.toLowerCase().replace(/[\s_-]/g, '') === 'pending'

          return (
            <Card
              key={request.holdRequestId}
              className={`border-l-4 ${
                isPending
                  ? 'border-l-orange-500'
                  : request.status.toLowerCase() === 'approved'
                    ? 'border-l-green-500'
                    : 'border-l-red-500'
              }`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5 text-gray-500" />
                      Task TC-{request.taskId}
                      {getHoldStatusBadge(request.status)}
                    </CardTitle>
                    {request.serialNumber && (
                      <div className="flex items-center gap-2 text-sm mt-1 text-muted-foreground">
                        <span className="font-mono bg-gray-100 px-2 py-0.5 rounded">
                          {request.serialNumber}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Description</h4>
                  <p className="text-sm text-gray-900">{request.taskDescription}</p>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Hold Reason</h4>
                  <p className="text-sm text-gray-900 bg-yellow-50 p-3 rounded border border-yellow-200">
                    {request.holdReason}
                  </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-400" />
                    <div>
                      <span className="text-gray-500 block text-xs">Requested by</span>
                      <span className="font-medium">{request.requestedByEngineerName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-400" />
                    <div>
                      <span className="text-gray-500 block text-xs">Requested at</span>
                      <span className="font-medium">
                        {new Date(request.holdRequestedDate).toLocaleString()}
                      </span>
                    </div>
                  </div>
                  {request.daysWorkedByEngineer > 0 && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <div>
                        <span className="text-gray-500 block text-xs">Days worked</span>
                        <span className="font-bold text-blue-600">
                          {request.daysWorkedByEngineer} days
                        </span>
                      </div>
                    </div>
                  )}
                  {request.assignedDate && (
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      <div>
                        <span className="text-gray-500 block text-xs">Assigned date</span>
                        <span className="font-medium">
                          {new Date(request.assignedDate).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {isPending && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <MessageSquare className="h-4 w-4 text-blue-600" />
                      <h4 className="text-sm font-medium text-blue-800">
                        Director Directive (Optional)
                      </h4>
                    </div>
                    <textarea
                      value={directorNote[request.holdRequestId] || ''}
                      onChange={(e) =>
                        handleDirectorNoteChange(request.holdRequestId, e.target.value)
                      }
                      placeholder="Provide specific instructions or directives for this request..."
                      className="w-full px-3 py-2 text-sm border border-blue-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white"
                      rows={2}
                    />
                  </div>
                )}

                {isPending && (
                  <div className="flex gap-3 pt-4 border-t">
                    <Button
                      onClick={() =>
                        handleHoldReview(request.holdRequestId, 'approve', 'transfer_to_tl')
                      }
                      disabled={processingId === request.holdRequestId}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    >
                      {processingId === request.holdRequestId ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      Approve Hold
                    </Button>
                    <Button
                      onClick={() => handleHoldReview(request.holdRequestId, 'reject')}
                      disabled={processingId === request.holdRequestId}
                      variant="destructive"
                      className="flex-1"
                    >
                      {processingId === request.holdRequestId ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      Reject Hold
                    </Button>
                    <Button
                      onClick={() => handleReviewModalClick(request)}
                      disabled={processingId === request.holdRequestId}
                      variant="outline"
                      className="flex-1"
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Detailed Review
                    </Button>
                  </div>
                )}

                {!isPending && (
                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-2 text-sm">
                      {request.status.toLowerCase() === 'approved' ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      <span className="text-gray-500">
                        {request.status} by {request.reviewedByTlName || 'Team Lead'} on{' '}
                        {request.reviewDate
                          ? new Date(request.reviewDate).toLocaleString()
                          : 'N/A'}
                      </span>
                    </div>
                    {request.reviewComments && (
                      <p className="text-sm text-gray-600 mt-2 bg-gray-50 p-2 rounded">
                        {request.reviewComments}
                      </p>
                    )}
                    {request.actionTaken && (
                      <p className="text-sm text-gray-600 mt-1">
                        <span className="font-medium">Action:</span> {request.actionTaken}
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }
}