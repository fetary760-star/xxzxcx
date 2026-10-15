'use client'

import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import apiClient from '@/lib/api'

/* ─────────────────────────── Types ─────────────────────────── */

interface AdjustmentRequest {
  adjustmentRequestId: number
  taskId: number
  taskDescription: string
  serialNumber: string
  partNumber: string
  assignedEngineer: string
  requesterId: number
  requesterName: string
  originalEstimatedHours: number
  /** Additional hours requested (already converted to hours) */
  requestedEstimatedHours: number
  /** New total if fully approved: original + requested additional */
  newTotalEstimatedHours: number
  /** Raw value the engineer entered (before unit conversion) */
  requestedRawValue: number
  requestUnit: string // "hours" or "days"
  requestReason: string
  status: string
  reviewedByTlId: number | null
  reviewerName: string | null
  tlReviewDate: string | null
  tlReviewComments: string | null
  /** Approved additional hours (already converted to hours) */
  approvedEstimatedHours: number | null
  previousTargetCompletionDate: string | null
  newTargetCompletionDate: string | null
  createdAt: string
  updatedAt: string
}

interface TaskOption {
  taskId: number
  description: string
  serialNumber?: string
  partNumber?: string
  estimatedHours?: number
}

/* ─────────────────────────── Helpers ─────────────────────────── */

const ROLE_MAP: Record<string, string> = {
  '0': 'team_leader',
  '1': 'director',
  '2': 'engineer',
  '3': 'customer',
  '4': 'customer_personnel',
  '5': 'shop_tl',
  '6': 'manager',
  '7': 'admin',
  '8': 'shop_manager',
}

function canonicalizeRole(raw: any): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'number') return ROLE_MAP[String(raw)] ?? String(raw)
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase()
    if (ROLE_MAP[s]) return ROLE_MAP[s]
    return s.replace(/[\s\-_]+/g, '_')
  }
  if (Array.isArray(raw)) return canonicalizeRole(raw[0])
  if (typeof raw === 'object') {
    if (raw.role) return canonicalizeRole(raw.role)
    if (raw.roleName) return canonicalizeRole(raw.roleName)
    if (raw.role_name) return canonicalizeRole(raw.role_name)
    if (raw.name) return canonicalizeRole(raw.name)
    return ''
  }
  return ''
}

function statusBadge(status: string) {
  const s = status?.toLowerCase() || ''
  if (s.includes('pending')) return 'bg-yellow-100 text-yellow-800'
  if (s.includes('approved') || s === 'approved') return 'bg-green-100 text-green-800'
  if (s.includes('rejected') || s === 'rejected') return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-800'
}

function statusLabel(status: string) {
  const s = status?.toLowerCase() || ''
  if (s.includes('pending')) return 'Pending Review'
  if (s.includes('approved') || s === 'approved') return 'Approved'
  if (s.includes('rejected') || s === 'rejected') return 'Rejected'
  return status || 'Unknown'
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—'
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

/* ─────────────────────────── Component ─────────────────────────── */

export default function WorkloadAdjustmentPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth()

  const userRole = useMemo(() => {
    if (!user) return ''
    const raw = (user as any).role ?? (user as any).roleName ?? (user as any).role_name ?? user
    return canonicalizeRole(raw)
  }, [user])

  const userId = useMemo(() => {
    if (!user) return 0
    return (user as any).userId ?? (user as any).user_id ?? (user as any).id ?? 0
  }, [user])

  const isEngineer = userRole === 'engineer'
  const isTeamLeader = userRole === 'team_leader'
  const isDirector = userRole === 'director'
  const canReview = isTeamLeader || isDirector

  // ─── State ───
  const [requests, setRequests] = useState<AdjustmentRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Create form state (engineer)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [tasks, setTasks] = useState<TaskOption[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<number | ''>('')
  const [requestedValue, setRequestedValue] = useState<string>('')
  const [requestUnit, setRequestUnit] = useState<'hours' | 'days'>('hours')
  const [requestReason, setRequestReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // EAT schedule constant for display conversion
  // IMPORTANT: This constant is used ONLY for display on the frontend.
  // The backend performs the actual conversion (days × 7.25 = hours).
  // The frontend sends the RAW value (e.g., 2 days) and the unit ("days").
  // The backend then converts: 2 × 7.25 = 14.5 additional hours.
  const NET_WORK_HOURS_PER_DAY = 7.25

  // Review modal state (TL)
  const [reviewingRequest, setReviewingRequest] = useState<AdjustmentRequest | null>(null)
  const [reviewDecision, setReviewDecision] = useState<'approve' | 'reject'>('approve')
  const [reviewComments, setReviewComments] = useState('')
  const [approvedValue, setApprovedValue] = useState<string>('')
  const [approvedUnit, setApprovedUnit] = useState<'hours' | 'days'>('hours')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // ─── Data fetching ───
  const fetchRequests = useCallback(async () => {
    if (!isAuthenticated || !user) return
    setLoading(true)
    setError(null)

    try {
      let data: any
      if (canReview) {
        // TL/Director: fetch all pending + optionally all
        if (statusFilter === 'pending') {
          data = await apiClient.get('/workload-adjustment/pending')
        } else {
          // For "all" view, fetch pending first, then we show all
          data = await apiClient.get('/workload-adjustment/pending')
        }
      } else if (isEngineer && userId) {
        // Engineer: fetch own requests
        data = await apiClient.get(`/workload-adjustment/engineer/${userId}`)
      }

      if (!data) {
        setRequests([])
        return
      }

      // Parse response shape: { success, data, total_count } or array
      let list: AdjustmentRequest[] = []
      if (Array.isArray(data)) {
        list = data
      } else if (Array.isArray(data.data)) {
        list = data.data
      } else if (data.payload && Array.isArray(data.payload)) {
        list = data.payload
      }

      setRequests(list)
    } catch (err: any) {
      console.error('[WorkloadAdjustment] Error fetching requests:', err)
      setError(err?.message || 'Failed to load workload adjustment requests')
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, user, canReview, isEngineer, userId, statusFilter])

  const fetchEngineerTasks = useCallback(async () => {
    if (!isEngineer || !userId) return
    setLoadingTasks(true)
    try {
      // Fetch tasks assigned to this engineer that are active (not completed)
      const data = await apiClient.get(`/tasks?status=InProgress&pageSize=200`)
      let tasksList: any[] = []
      if (Array.isArray(data)) {
        tasksList = data
      } else if (Array.isArray(data?.tasks)) {
        tasksList = data.tasks
      } else if (Array.isArray(data?.data)) {
        tasksList = data.data
      }

      // Also fetch pending tasks
      try {
        const pendingData = await apiClient.get(`/tasks?status=Pending&pageSize=200`)
        let pendingList: any[] = []
        if (Array.isArray(pendingData)) {
          pendingList = pendingData
        } else if (Array.isArray(pendingData?.tasks)) {
          pendingList = pendingData.tasks
        } else if (Array.isArray(pendingData?.data)) {
          pendingList = pendingData.data
        }
        tasksList = [...tasksList, ...pendingList]
      } catch {
        // Ignore pending fetch errors
      }

      // Map to TaskOption
      const options: TaskOption[] = tasksList.map((t: any) => ({
        taskId: t.taskId ?? t.task_id ?? t.TaskId ?? t.id,
        description: t.description ?? t.Description ?? '',
        serialNumber: t.serialNumber ?? t.serial_number ?? t.SerialNumber ?? '',
        partNumber: t.partNumber ?? t.part_number ?? t.PartNumber ?? '',
        estimatedHours: t.adjustedEstimatedHours ?? t.estimatedHours ?? t.estimated_hours ?? t.EstimatedHours ?? 0,
      }))

      setTasks(options)
    } catch (err: any) {
      console.error('[WorkloadAdjustment] Error fetching tasks:', err)
    } finally {
      setLoadingTasks(false)
    }
  }, [isEngineer, userId])

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      fetchRequests()
      if (isEngineer) {
        fetchEngineerTasks()
      }
    }
  }, [authLoading, isAuthenticated, fetchRequests, isEngineer, fetchEngineerTasks])

  // ─── Create request handler (Engineer) ───
  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedTaskId || !requestedValue || !requestReason.trim()) {
      setError('Please fill in all required fields')
      return
    }

    if (requestReason.trim().length < 10) {
      setError('Reason must be at least 10 characters')
      return
    }

    // Frontend validation: ensure the value is valid
    const rawValue = parseFloat(requestedValue)
    if (isNaN(rawValue) || rawValue <= 0) {
      setError('Please enter a valid positive number')
      return
    }

    // Capture current unit at validation time
    const currentUnit = requestUnit

    setSubmitting(true)
    setError(null)
    setSuccessMsg(null)

    try {
      // ═══════════════════════════════════════════════════════════════════════
      // IMPORTANT: The value represents ADDITIONAL time needed.
      //
      // When requestUnit is "hours":
      //   - Send the raw value as-is. The backend uses it directly as additional hours.
      //   - Example: user enters 10 hours → send requestedEstimatedHours: 10
      //
      // When requestUnit is "days":
      //   - Send the raw value as-is (in days). The backend converts days × 7.25.
      //   - Example: user enters 2 days → send requestedEstimatedHours: 2
      //   - Backend converts: 2 × 7.25 = 14.5 additional hours
      // ═══════════════════════════════════════════════════════════════════════
      const payload = {
        taskId: Number(selectedTaskId),
        requestedEstimatedHours: rawValue,  // RAW value, NO conversion
        requestUnit: currentUnit,           // "hours" or "days"
        requestReason: requestReason.trim(),
      }

      const result = await apiClient.post('/workload-adjustment', payload)

      if (result?.success === false) {
        throw new Error(result.message || 'Failed to create request')
      }

      setSuccessMsg('Workload adjustment request submitted successfully!')
      setShowCreateForm(false)
      setSelectedTaskId('')
      setRequestedValue('')
      setRequestUnit('hours')
      setRequestReason('')
      fetchRequests()
    } catch (err: any) {
      // Extract the most useful error message from the response
      const backendMsg =
        err?.body?.message ||
        err?.body?.error ||
        err?.body?.detail ||
        err?.body?.title ||
        (typeof err?.body === 'string' ? err.body : null)
      const displayMsg = backendMsg || err?.message || 'Failed to submit workload adjustment request'
      setError(displayMsg)
    } finally {
      setSubmitting(false)
    }
  }

  // ─── Review handler (TL) ───
  const handleReview = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!reviewingRequest) return

    setReviewSubmitting(true)
    setError(null)
    setSuccessMsg(null)

    try {
      const payload: any = {
        decision: reviewDecision,
        reviewComments: reviewComments.trim() || null,
      }

      // ═══════════════════════════════════════════════════════════════════════
      // CRITICAL: Send the RAW approved ADDITIONAL value WITHOUT conversion.
      // The backend converts based on approvedUnit (days × 7.25 = hours).
      // ═══════════════════════════════════════════════════════════════════════
      if (reviewDecision === 'approve' && approvedValue) {
        const rawApproved = parseFloat(approvedValue)
        payload.approvedEstimatedHours = rawApproved  // RAW additional value, NO conversion
        payload.approvedUnit = approvedUnit            // "hours" or "days"
      }

      const result = await apiClient.put(
        `/workload-adjustment/${reviewingRequest.adjustmentRequestId}/review`,
        payload
      )

      if (result?.success === false) {
        throw new Error(result.message || 'Failed to review request')
      }

      setSuccessMsg(
        reviewDecision === 'approve'
          ? 'Request approved successfully! Target completion date has been updated.'
          : 'Request rejected.'
      )
      setReviewingRequest(null)
      setReviewDecision('approve')
      setReviewComments('')
      setApprovedValue('')
      setApprovedUnit('hours')
      fetchRequests()
    } catch (err: any) {
      // Extract the most useful error message from the response
      const backendMsg =
        err?.body?.message ||
        err?.body?.error ||
        err?.body?.detail ||
        err?.body?.title ||
        (typeof err?.body === 'string' ? err.body : null)
      const displayMsg = backendMsg || err?.message || 'Failed to review request'
      setError(displayMsg)
    } finally {
      setReviewSubmitting(false)
    }
  }

  // ─── Selected task info ───
  const selectedTask = useMemo(() => {
    if (!selectedTaskId) return null
    return tasks.find((t) => t.taskId === Number(selectedTaskId)) || null
  }, [selectedTaskId, tasks])

  // ─── Filtered requests ───
  const filteredRequests = useMemo(() => {
    if (statusFilter === 'all') return requests
    return requests.filter((r) => {
      const s = r.status?.toLowerCase() || ''
      if (statusFilter === 'pending') return s.includes('pending')
      if (statusFilter === 'approved') return s.includes('approved') || s === 'approved'
      if (statusFilter === 'rejected') return s.includes('rejected') || s === 'rejected'
      return true
    })
  }, [requests, statusFilter])

  // ─── Permission guard ───
  if (!authLoading && isAuthenticated && !isEngineer && !canReview) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <div className="text-6xl">🔒</div>
            <h2 className="text-xl font-semibold text-gray-800">Access Denied</h2>
            <p className="text-gray-600 max-w-md">
              You do not have permission to view workload adjustments.
              This feature is available for Engineers and Team Leaders.
            </p>
          </div>
        </div>
      </MainLayout>
    )
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Workload Adjustment</h2>
            <p className="text-sm text-gray-500 mt-1">
              {isEngineer
                ? 'Request additional hours or days for tasks when more time is needed'
                : 'Review and manage workload adjustment requests from engineers'}
            </p>
          </div>
          <div className="flex gap-2 items-center">
            {isEngineer && (
              <button
                onClick={() => {
                  setShowCreateForm(!showCreateForm)
                  setError(null)
                  setSuccessMsg(null)
                }}
                className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90"
              >
                {showCreateForm ? 'Cancel' : '+ New Request'}
              </button>
            )}
            <button
              onClick={() => fetchRequests()}
              className="px-3 py-2 border rounded bg-white hover:bg-gray-50"
              disabled={loading}
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Success / Error messages */}
        {successMsg && (
          <div className="rounded bg-green-50 border border-green-200 p-3 text-sm text-green-700 flex items-center justify-between">
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="text-green-700 hover:text-green-900 font-bold">×</button>
          </div>
        )}
        {error && (
          <div className="rounded bg-red-50 border border-red-200 p-3 text-sm text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900 font-bold">×</button>
          </div>
        )}

        {/* ─── Create Request Form (Engineer) ─── */}
        {isEngineer && showCreateForm && (
          <div className="bg-white rounded shadow p-6">
            <h3 className="font-medium text-lg mb-4">New Workload Adjustment Request</h3>
            <p className="text-sm text-gray-500 mb-4">
              Request additional hours or days for a task. Specify how much <strong>extra</strong> time you need.
            </p>
            <form onSubmit={handleCreateRequest} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Task <span className="text-red-500">*</span>
                  </label>
                  {loadingTasks ? (
                    <div className="w-full border rounded p-2 text-sm text-gray-500">Loading tasks...</div>
                  ) : (
                    <select
                      value={selectedTaskId}
                      onChange={(e) => setSelectedTaskId(e.target.value ? Number(e.target.value) : '')}
                      className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      required
                    >
                      <option value="">Select a task...</option>
                      {tasks.map((t) => (
                        <option key={t.taskId} value={t.taskId}>
                          #{t.taskId} — {t.description?.substring(0, 60) || 'No description'}
                          {t.serialNumber ? ` (S/N: ${t.serialNumber})` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {selectedTask && (
                    <div className="mt-2 text-xs text-gray-500 space-y-1">
                      {selectedTask.serialNumber && <div>Serial: {selectedTask.serialNumber}</div>}
                      {selectedTask.partNumber && <div>Part: {selectedTask.partNumber}</div>}
                      {selectedTask.estimatedHours !== undefined && (
                        <div>Current Estimated Hours: <strong>{selectedTask.estimatedHours}h</strong></div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Additional {requestUnit === 'days' ? 'Days' : 'Hours'} Needed <span className="text-red-500">*</span>
                  </label>
                  {/* Unit toggle */}
                  <div className="flex gap-2 mb-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRequestUnit('hours')
                        setRequestedValue('')
                      }}
                      className={`px-3 py-1 rounded text-xs border ${
                        requestUnit === 'hours'
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Hours
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRequestUnit('days')
                        setRequestedValue('')
                      }}
                      className={`px-3 py-1 rounded text-xs border ${
                        requestUnit === 'days'
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      Days
                    </button>
                  </div>
                  <input
                    type="number"
                    step={requestUnit === 'days' ? '0.5' : '0.5'}
                    min="0.5"
                    max="500"
                    value={requestedValue}
                    onChange={(e) => setRequestedValue(e.target.value)}
                    className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder={requestUnit === 'days' ? 'e.g. 2 (additional working days)' : 'e.g. 10 (additional hours)'}
                    required
                  />
                  {/* Conversion display — for information only, NOT sent to backend */}
                  {requestedValue && requestUnit === 'days' && (
                    <div className="mt-1 text-xs text-gray-500">
                      = {(parseFloat(requestedValue) * NET_WORK_HOURS_PER_DAY).toFixed(2)} additional hours
                      <span className="text-gray-400 ml-1">(1 day = {NET_WORK_HOURS_PER_DAY}h net)</span>
                    </div>
                  )}
                  {selectedTask && requestedValue && (() => {
                    const currentHours = selectedTask.estimatedHours || 0
                    const additionalHours = requestUnit === 'days'
                      ? parseFloat(requestedValue) * NET_WORK_HOURS_PER_DAY
                      : parseFloat(requestedValue)
                    const newTotal = currentHours + additionalHours
                    if (isNaN(additionalHours) || additionalHours <= 0) return null
                    return (
                      <div className="mt-2 text-xs space-y-1">
                        <div className="text-blue-600">
                          Requested: <strong>+{requestUnit === 'days' ? `${parseFloat(requestedValue)} day${parseFloat(requestedValue) !== 1 ? 's' : ''} (${additionalHours.toFixed(1)}h)` : `${additionalHours.toFixed(1)}h`}</strong>
                        </div>
                        <div className="text-gray-600">
                          New total estimated: {currentHours}h → <strong>{newTotal.toFixed(1)}h</strong>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Reason for Additional Time <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={requestReason}
                  onChange={(e) => setRequestReason(e.target.value)}
                  className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  rows={4}
                  placeholder="Explain why additional time is needed (minimum 10 characters)..."
                  minLength={10}
                  maxLength={2000}
                  required
                />
                <div className="text-xs text-gray-400 mt-1">{requestReason.length}/2000 characters</div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-primary text-white rounded hover:bg-primary/90 disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false)
                    setError(null)
                  }}
                  className="px-4 py-2 border rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ─── Filter bar ─── */}
        <div className="bg-white rounded shadow p-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Filter by Status:</label>
            <div className="flex gap-2">
              {['all', 'pending', 'approved', 'rejected'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-3 py-1 rounded text-sm border ${
                    statusFilter === s
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <div className="ml-auto text-sm text-gray-500">
              {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* ─── Requests Table ─── */}
        <div className="bg-white rounded shadow p-4">
          <h3 className="font-medium mb-3">
            {canReview ? 'Workload Adjustment Requests' : 'My Adjustment Requests'}
          </h3>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mr-2"></div>
              <span className="text-sm text-gray-500">Loading requests...</span>
            </div>
          )}

          {!loading && filteredRequests.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">📋</div>
              <p>No workload adjustment requests found.</p>
              {isEngineer && (
                <p className="text-sm mt-1">Click &quot;+ New Request&quot; to submit one.</p>
              )}
            </div>
          )}

          {!loading && filteredRequests.length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">ID</th>
                    <th className="p-2 text-left">Task</th>
                    {canReview && <th className="p-2 text-left">Requester</th>}
                    <th className="p-2 text-left">Current Hrs</th>
                    <th className="p-2 text-left">Additional Requested</th>
                    <th className="p-2 text-left">New Total</th>
                    <th className="p-2 text-left">Target Date</th>
                    <th className="p-2 text-left">Reason</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Submitted</th>
                    {canReview && <th className="p-2 text-left">Actions</th>}
                    {!canReview && <th className="p-2 text-left">Review</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((req) => {
                    const additionalHours = req.requestedEstimatedHours
                    const newTotal = req.newTotalEstimatedHours ?? (req.originalEstimatedHours + additionalHours)
                    const isPending = req.status?.toLowerCase().includes('pending')

                    // Display the raw value with unit for clarity
                    const rawDisplay = req.requestedRawValue
                      ? (req.requestUnit === 'days'
                          ? `${req.requestedRawValue} day(s)`
                          : `${req.requestedRawValue}h`)
                      : `${additionalHours}h`

                    return (
                      <tr key={req.adjustmentRequestId} className="border-t hover:bg-gray-50">
                        <td className="p-2 font-mono text-xs">{req.adjustmentRequestId}</td>
                        <td className="p-2">
                          <div className="font-medium">#{req.taskId}</div>
                          <div className="text-xs text-gray-500 max-w-xs truncate">
                            {req.taskDescription || '—'}
                          </div>
                          {req.serialNumber && (
                            <div className="text-xs text-gray-400">S/N: {req.serialNumber}</div>
                          )}
                        </td>
                        {canReview && (
                          <td className="p-2">{req.requesterName || `User #${req.requesterId}`}</td>
                        )}
                        <td className="p-2">{req.originalEstimatedHours}h</td>
                        <td className="p-2 font-medium">
                          <span className="text-orange-600">+{additionalHours}h</span>
                          {req.requestUnit === 'days' && req.requestedRawValue > 0 && (
                            <div className="text-xs text-gray-400">
                              ({req.requestedRawValue} day{req.requestedRawValue !== 1 ? 's' : ''})
                            </div>
                          )}
                        </td>
                        <td className="p-2 font-medium">{newTotal}h</td>
                        <td className="p-2 text-xs">
                          {req.previousTargetCompletionDate && req.newTargetCompletionDate ? (
                            <div>
                              <div className="text-gray-400 line-through">{formatDate(req.previousTargetCompletionDate)}</div>
                              <div className="text-green-600 font-medium">{formatDate(req.newTargetCompletionDate)}</div>
                            </div>
                          ) : req.status?.toLowerCase().includes('pending') ? (
                            <span className="text-gray-400">Pending approval</span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="p-2">
                          <div className="max-w-xs truncate text-xs" title={req.requestReason}>
                            {req.requestReason}
                          </div>
                        </td>
                        <td className="p-2">
                          <span className={`px-2 py-1 rounded text-xs ${statusBadge(req.status)}`}>
                            {statusLabel(req.status)}
                          </span>
                        </td>
                        <td className="p-2 text-xs">{formatDate(req.createdAt)}</td>
                        {canReview && (
                          <td className="p-2">
                            {isPending ? (
                              <button
                                onClick={() => {
                                  setReviewingRequest(req)
                                  setReviewDecision('approve')
                                  setReviewComments('')
                                  // Pre-fill with the requested additional value
                                  setApprovedValue(String(req.requestedRawValue || req.requestedEstimatedHours))
                                  setApprovedUnit(req.requestUnit === 'days' ? 'days' : 'hours')
                                  setError(null)
                                  setSuccessMsg(null)
                                }}
                                className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                              >
                                Review
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">
                                {req.reviewerName ? `By ${req.reviewerName}` : 'Reviewed'}
                              </span>
                            )}
                          </td>
                        )}
                        {!canReview && (
                          <td className="p-2 text-xs">
                            {req.reviewerName && (
                              <div>By: {req.reviewerName}</div>
                            )}
                            {req.tlReviewDate && (
                              <div>{formatDate(req.tlReviewDate)}</div>
                            )}
                            {req.tlReviewComments && (
                              <div className="text-gray-500 max-w-xs truncate" title={req.tlReviewComments}>
                                {req.tlReviewComments}
                              </div>
                            )}
                            {req.approvedEstimatedHours != null && (
                              <div className="text-green-600 font-medium">
                                Approved: +{req.approvedEstimatedHours}h additional
                              </div>
                            )}
                            {req.newTargetCompletionDate && (
                              <div className="text-blue-600 text-xs mt-1">
                                📅 New target: {formatDate(req.newTargetCompletionDate)}
                              </div>
                            )}
                            {!req.reviewerName && !req.tlReviewDate && (
                              <span className="text-gray-400">Awaiting review</span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ─── Review Modal (TL/Director) ─── */}
      {reviewingRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Review Workload Adjustment Request</h3>
                <button
                  onClick={() => setReviewingRequest(null)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  &times;
                </button>
              </div>

              {/* Request details */}
              <div className="bg-gray-50 rounded p-4 mb-4 space-y-2">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Task:</span>{' '}
                    <span className="font-medium">#{reviewingRequest.taskId}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Requester:</span>{' '}
                    <span className="font-medium">{reviewingRequest.requesterName}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Current Estimated Hours:</span>{' '}
                    <span className="font-medium">{reviewingRequest.originalEstimatedHours}h</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Additional Requested:</span>{' '}
                    <span className="font-medium text-orange-600">
                      +{reviewingRequest.requestedEstimatedHours}h
                      {reviewingRequest.requestUnit === 'days' && reviewingRequest.requestedRawValue > 0 && (
                        <span className="text-gray-400 font-normal ml-1">
                          (submitted as {reviewingRequest.requestedRawValue} day{reviewingRequest.requestedRawValue !== 1 ? 's' : ''})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">New Total if Approved:</span>{' '}
                    <span className="font-medium text-blue-600">
                      {(reviewingRequest.originalEstimatedHours + reviewingRequest.requestedEstimatedHours).toFixed(1)}h
                    </span>
                  </div>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">Description:</span>{' '}
                  <span>{reviewingRequest.taskDescription || '—'}</span>
                </div>
                {reviewingRequest.serialNumber && (
                  <div className="text-sm">
                    <span className="text-gray-500">Serial Number:</span>{' '}
                    <span>{reviewingRequest.serialNumber}</span>
                  </div>
                )}
                <div className="text-sm">
                  <span className="text-gray-500">Reason:</span>
                  <p className="mt-1 bg-white rounded p-2 border text-gray-700">
                    {reviewingRequest.requestReason}
                  </p>
                </div>
                <div className="text-sm">
                  <span className="text-gray-500">Submitted:</span>{' '}
                  <span>{formatDate(reviewingRequest.createdAt)}</span>
                </div>
              </div>

              {/* Review form */}
              <form onSubmit={handleReview} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Decision</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="decision"
                        value="approve"
                        checked={reviewDecision === 'approve'}
                        onChange={() => setReviewDecision('approve')}
                        className="text-green-600"
                      />
                      <span className="text-sm font-medium text-green-700">Approve</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="decision"
                        value="reject"
                        checked={reviewDecision === 'reject'}
                        onChange={() => setReviewDecision('reject')}
                        className="text-red-600"
                      />
                      <span className="text-sm font-medium text-red-700">Reject</span>
                    </label>
                  </div>
                </div>

                {reviewDecision === 'approve' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">
                        Approved Additional {approvedUnit === 'days' ? 'Days' : 'Hours'}
                        <span className="text-gray-400 font-normal ml-1">(leave as-is for full approval)</span>
                      </label>
                      {/* Unit toggle for TL */}
                      <div className="flex gap-2 mb-2">
                        <button
                          type="button"
                          onClick={() => setApprovedUnit('hours')}
                          className={`px-3 py-1 rounded text-xs border ${
                            approvedUnit === 'hours'
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          Hours
                        </button>
                        <button
                          type="button"
                          onClick={() => setApprovedUnit('days')}
                          className={`px-3 py-1 rounded text-xs border ${
                            approvedUnit === 'days'
                              ? 'bg-blue-500 text-white border-blue-500'
                              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          Days
                        </button>
                      </div>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        max="500"
                        value={approvedValue}
                        onChange={(e) => setApprovedValue(e.target.value)}
                        className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder={approvedUnit === 'days' ? 'e.g. 2 (additional working days)' : 'e.g. 10 (additional hours)'}
                      />
                      {/* Conversion display — for information only */}
                      {approvedValue && approvedUnit === 'days' && (
                        <div className="mt-1 text-xs text-gray-500">
                          = {(parseFloat(approvedValue) * 7.25).toFixed(2)} additional hours
                          <span className="text-gray-400 ml-1">(1 day = 7.25h net)</span>
                        </div>
                      )}
                      {approvedValue && (() => {
                        const approvedAdditionalHours = approvedUnit === 'days'
                          ? parseFloat(approvedValue) * 7.25
                          : parseFloat(approvedValue)
                        const requestedAdditionalHours = reviewingRequest.requestedEstimatedHours
                        if (Math.abs(approvedAdditionalHours - requestedAdditionalHours) > 0.01) {
                          return (
                            <div className="text-xs text-orange-600 mt-1">
                              Partial approval: +{approvedAdditionalHours.toFixed(1)}h instead of requested +{requestedAdditionalHours}h
                            </div>
                          )
                        }
                        return null
                      })()}
                    </div>

                    {/* Target date impact preview */}
                    <div className="bg-blue-50 rounded p-3 text-sm">
                      <div className="font-medium text-blue-800 mb-1">📅 Target Completion Date Impact</div>
                      <p className="text-blue-700 text-xs">
                        When approved, the task&apos;s target completion date will be extended
                        by the approved additional hours, using the EAT schedule (7.25 net hours/day,
                        weekends excluded).
                      </p>
                      {approvedValue && (() => {
                        const approvedAdditionalHours = approvedUnit === 'days'
                          ? parseFloat(approvedValue) * 7.25
                          : parseFloat(approvedValue)
                        if (approvedAdditionalHours > 0) {
                          const newTotal = reviewingRequest.originalEstimatedHours + approvedAdditionalHours
                          return (
                            <div className="mt-1 space-y-1">
                              <p className="text-blue-800 text-xs font-medium">
                                Approved additional: +{approvedUnit === 'days' ? `${parseFloat(approvedValue)} day${parseFloat(approvedValue) !== 1 ? 's' : ''} (${approvedAdditionalHours.toFixed(1)}h)` : `${approvedAdditionalHours.toFixed(1)}h`}
                              </p>
                              <p className="text-blue-700 text-xs">
                                New total estimated hours: {reviewingRequest.originalEstimatedHours}h → {newTotal.toFixed(1)}h
                              </p>
                            </div>
                          )
                        }
                        return null
                      })()}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">Review Comments</label>
                  <textarea
                    value={reviewComments}
                    onChange={(e) => setReviewComments(e.target.value)}
                    className="w-full border rounded p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    placeholder="Optional comments about your decision..."
                    maxLength={2000}
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={reviewSubmitting}
                    className={`px-4 py-2 text-white rounded disabled:opacity-50 ${
                      reviewDecision === 'approve'
                        ? 'bg-green-600 hover:bg-green-700'
                        : 'bg-red-600 hover:bg-red-700'
                    }`}
                  >
                    {reviewSubmitting
                      ? 'Submitting...'
                      : reviewDecision === 'approve'
                      ? 'Approve Request'
                      : 'Reject Request'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewingRequest(null)}
                    className="px-4 py-2 border rounded hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}