'use client'

import React, { useEffect, useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import apiClient from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

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

export default function HoldRequestsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [holdRequests, setHoldRequests] = useState<HoldRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<number | null>(null)

  // Check if user is Team Leader
  const isTeamLeader = user?.role === 'team_leader' || user?.role === '0'

  useEffect(() => {
    // Wait for user data to load
    if (!user) {
      return
    }
    
    // Redirect unauthorized users BEFORE making any API calls
    if (!isTeamLeader) {
      setLoading(false)
      router.push('/unauthorized')
      return
    }
    
    // Only call API if user is confirmed as Team Leader
    loadHoldRequests()
  }, [user, isTeamLeader, router])

  const loadHoldRequests = async () => {
    // Never call API for non-Team Leaders
    if (!user || !isTeamLeader) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    
    //('[HoldRequestsPage] Loading hold requests...')
    
    try {
      const response = await apiClient.get('/task-holds/pending')
      
      //('[HoldRequestsPage] API response:', response)
      
      // Enhanced data normalization to handle multiple response structures
      let data = response?.holdRequests || response?.data || response || []
      
      // If data is wrapped in another object, unwrap it
      if (!Array.isArray(data) && data.holdRequests) {
        data = data.holdRequests
      } else if (!Array.isArray(data) && data.data) {
        data = data.data
      } else if (!Array.isArray(data) && data.payload) {
        data = data.payload
      }
      
      const requests = Array.isArray(data) ? data : []
      
      
      
      // Normalize each request object to handle field name variations
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
        actionTaken: req.actionTaken || req.ActionTaken || null
      }))
      
      //('[HoldRequestsPage] Sample normalized request:', normalizedRequests[0])
      
      setHoldRequests(normalizedRequests)
    } catch (err: any) {
      console.error('[HoldRequestsPage] Failed to load hold requests:', err)
      setError(err?.message || 'Failed to load hold requests')
    } finally {
      setLoading(false)
    }
  }

  const handleReview = async (holdRequestId: number, decision: 'approve' | 'reject', action?: string) => {
    setProcessingId(holdRequestId)
    setError(null)
    
    try {
      const payload: any = {
        Decision: decision,
        ReviewComments: decision === 'approve' ? 'Quick approval' : 'Quick rejection'
      }

      // FIXED: Use capital 'Action' to match backend validation requirements
      if (decision === 'approve' && action) {
        payload.Action = action
      }

      await apiClient.post(`/task-holds/${holdRequestId}/review`, payload)
      
      // Refresh the list
      await loadHoldRequests()
      
      // Trigger refresh event for sidebar badge
      window.dispatchEvent(new CustomEvent('hold-requests:refresh'))
      window.dispatchEvent(new CustomEvent('tasks:refresh'))
    } catch (err: any) {
      console.error('Failed to review hold request:', err)
      setError(err?.message || 'Failed to process review')
    } finally {
      setProcessingId(null)
    }
  }

  // Return null immediately for unauthorized users to prevent rendering
  if (!user || !isTeamLeader) {
    return null
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Hold Requests</h1>
            <p className="text-gray-600 mt-1">Review and approve/reject task hold requests from engineers</p>
          </div>
          <Button onClick={loadHoldRequests} variant="outline" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Clock className="h-4 w-4 mr-2" />}
            Refresh
          </Button>
        </div>

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

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
            <span className="ml-3 text-gray-600">Loading hold requests...</span>
          </div>
        ) : holdRequests.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Pending Hold Requests</h3>
              <p className="text-gray-600">All hold requests have been reviewed.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {holdRequests.map((request) => (
              <Card key={request.holdRequestId} className="border-l-4 border-l-orange-500">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg flex items-center gap-2">
                        Task TC-{request.taskId}
                        <Badge variant="outline" className="ml-2">
                          {request.status}
                        </Badge>
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

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Requested by:</span>
                      <span className="ml-2 font-medium">{request.requestedByEngineerName}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Requested at:</span>
                      <span className="ml-2 font-medium">
                        {new Date(request.holdRequestedDate).toLocaleString()}
                      </span>
                    </div>
                    {request.daysWorkedByEngineer > 0 && (
                      <div>
                        <span className="text-gray-500">Days worked:</span>
                        <span className="ml-2 font-medium">{request.daysWorkedByEngineer} days</span>
                      </div>
                    )}
                    {request.assignedDate && (
                      <div>
                        <span className="text-gray-500">Assigned date:</span>
                        <span className="ml-2 font-medium">
                          {new Date(request.assignedDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {request.status.toLowerCase() === 'pendingapproval' && (
                    <div className="flex gap-3 pt-4 border-t">
                      <Button
                        onClick={() => handleReview(request.holdRequestId, 'approve', 'transfer_to_tl')}
                        disabled={processingId === request.holdRequestId}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        {processingId === request.holdRequestId ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <CheckCircle className="h-4 w-4 mr-2" />
                        )}
                        Approve Hold
                      </Button>
                      <Button
                        onClick={() => handleReview(request.holdRequestId, 'reject')}
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
                    </div>
                  )}

                  {request.status.toLowerCase() !== 'pendingapproval' && (
                    <div className="pt-4 border-t">
                      <div className="flex items-center gap-2 text-sm">
                        {request.status.toLowerCase() === 'approved' ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="text-gray-500">
                          {request.status} by {request.reviewedByTlName || 'Team Lead'} on{' '}
                          {request.reviewDate ? new Date(request.reviewDate).toLocaleString() : 'N/A'}
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
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  )
}