'use client'
import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { CheckCircle, XCircle, ArrowRight, AlertCircle, Edit, FileText, User, Clock } from 'lucide-react'
import { addCsrfHeader } from '@/lib/csrf'
import { secureAuthStore } from '@/lib/secure-auth-store'

interface Props {
  isOpen: boolean
  onClose: () => void
  task: any | null
  onSuccess?: () => void
}

/**
 * AmendmentApprovalModal - FIXED VERSION
 *
 * CRITICAL RULES:
 * - Team Leaders: can ONLY Forward to Director OR Reject (NOT Approve directly)
 * - Directors: can ONLY Approve OR Reject (NOT Forward)
 * - Engineers/Customer personnel cannot access this modal (UI guards in parent)
 *
 * This modal posts to /api/tasks/{id}/amendment/review with:
 * { amendment_status, amendment_decision, amendment_comments, reviewed_by, reviewed_at, reviewer_role }
 */
export default function AmendmentApprovalModal({ isOpen, onClose, task, onSuccess }: Props) {
  const { user } = useAuth()
  const [decision, setDecision] = useState<'approve' | 'reject' | 'forward' | ''>('')
  const [comments, setComments] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Role checking
  const userRole = user?.role ?? user?.roleDisplayName ?? user?.roleDisplay ?? ''
  const canonicalRole = String(userRole).toLowerCase().replace(/[\s\-_]+/g, '_')
  const isTeamLeader = canonicalRole === 'team_leader'
  const isDirector = canonicalRole === 'director'
  const canApprove = isTeamLeader || isDirector

  useEffect(() => {
    if (task && isOpen) {
      setDecision('')
      setComments('')
      setError(null)
    }
  }, [task, isOpen])

  if (!isOpen || !task) return null

  if (!canApprove) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
        <div className="bg-white shadow-lg rounded-lg max-w-md w-full p-6">
          <div className="flex items-center gap-3 mb-4">
            <XCircle className="w-8 h-8 text-red-600" />
            <h3 className="text-lg font-semibold">Access Denied</h3>
          </div>
          <p className="text-gray-600 mb-4">
            You don't have permission to approve amendment requests. Only Team Leaders and Directors can review amendments.
          </p>
          <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-4">
            <p className="text-sm text-blue-700">
              <strong>Your Role:</strong> {userRole || 'Unknown'}<br />
              <strong>Required Roles:</strong> Team Leader, Director
            </p>
          </div>
          <Button onClick={onClose} className="w-full">Close</Button>
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    
    if (!decision) {
      setError('Please select an action.')
      return
    }

    // CRITICAL: Validate role-based decisions
    if (isTeamLeader && decision === 'approve') {
      setError('Team Leaders cannot approve amendments directly. Please forward to Director or reject.')
      return
    }

    if (isDirector && decision === 'forward') {
      setError('Directors cannot forward amendments. Please approve or reject.')
      return
    }

    const trimmedComments = comments.trim()
    if (!trimmedComments) {
      setError('Comments are required to document your decision.')
      return
    }

    if (trimmedComments.length < 5) {
      setError('Comments must be at least 5 characters long.')
      return
    }

    setLoading(true)
    try {
      const token = secureAuthStore.getToken()
      
      if (!token) {
        throw new Error('Authentication token not found. Please log in again.')
      }

      // Prepare base headers
      let headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }

      // Add CSRF token to headers
      headers = await addCsrfHeader(headers)

      // Map decision to amendment status (DTO enum: PendingTLReview=0, ForwardedToDirector=1, Approved=2, Rejected=3)
      let amendmentStatus: number
      switch (decision) {
        case 'approve':
          amendmentStatus = 2 // Approved
          break
        case 'reject':
          amendmentStatus = 3 // Rejected
          break
        case 'forward':
          amendmentStatus = 1 // Forwarded to Director
          break
        default:
          throw new Error('Invalid decision selected')
      }

      const payload = {
        amendment_status: amendmentStatus,
        amendment_decision: decision,
        amendment_comments: trimmedComments,
        reviewed_by: user?.userId ?? user?.id ?? user?.user_id,
        reviewed_at: new Date().toISOString(),
        reviewer_role: canonicalRole,
        reviewer_name: user?.full_name || user?.username || 'Unknown Reviewer',
        review_metadata: {
          user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
          timestamp: new Date().toISOString()
        }
      }

      //('Submitting amendment review:', payload)

      const resp = await fetch(`/api/tasks/${encodeURIComponent(String(task.task_id))}/amendment/review`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        credentials: 'include'
      })

      let data;
      const contentType = resp.headers.get('content-type');
      
      if (contentType && contentType.includes('application/json')) {
        data = await resp.json()
      } else {
        const text = await resp.text()
        
        if (resp.status === 401) {
          secureAuthStore.clearAll()
          window.location.href = '/login'
          return
        }
        
        // Try to extract a meaningful message from the non-JSON response text
        const friendlyMessage = text?.trim() || `Request failed (status ${resp.status}). Please try again.`
        throw new Error(friendlyMessage)
      }

      if (!resp.ok) {
        if (resp.status === 401) {
          secureAuthStore.clearAll()
          window.location.href = '/login'
          return
        }
        
        // Extract the user-friendly error message from the API response
        const errorMessage = data?.error || data?.message || data?.Message || `Request failed (status ${resp.status}). Please try again.`
        throw new Error(errorMessage)
      }

      // success: refresh UI
      window.dispatchEvent(new CustomEvent('tasks:refresh'))
      window.dispatchEvent(new CustomEvent('amendments:refresh'))
      window.dispatchEvent(new CustomEvent('notifications:refresh'))
      
      if (onSuccess) onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to process amendment review. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getDecisionIcon = () => {
    switch (decision) {
      case 'approve': return <CheckCircle className="w-5 h-5 text-green-600" />
      case 'reject': return <XCircle className="w-5 h-5 text-red-600" />
      case 'forward': return <ArrowRight className="w-5 h-5 text-blue-600" />
      default: return <Edit className="w-5 h-5 text-gray-600" />
    }
  }

  const getDecisionColor = () => {
    switch (decision) {
      case 'approve': return 'from-green-50 to-emerald-50'
      case 'reject': return 'from-red-50 to-rose-50'
      case 'forward': return 'from-blue-50 to-indigo-50'
      default: return 'from-gray-50 to-slate-50'
    }
  }

  const getDecisionText = () => {
    switch (decision) {
      case 'approve': return 'Approve Amendment'
      case 'reject': return 'Reject Amendment'
      case 'forward': return 'Forward to Director'
      default: return 'Submit Review'
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black bg-opacity-50 overflow-y-auto">
      <div className="bg-white shadow-lg rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto my-8">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className={`p-4 border-b flex justify-between items-center bg-gradient-to-r ${getDecisionColor()}`}>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-white rounded-full shadow-sm">
                {getDecisionIcon()}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Review Amendment Request</h3>
                <p className="text-sm text-gray-600">TC-{task.task_id} - {task.serial_number ?? 'N/A'}</p>
              </div>
            </div>
            <button 
              type="button" 
              className="text-gray-600 hover:text-gray-800 text-xl transition-colors" 
              onClick={onClose}
            >
              ×
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* Error Display */}
            {error && (
              <div className="flex items-start gap-3 text-red-700 bg-red-50 p-4 rounded-lg border border-red-200">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <strong>Error:</strong> {error}
                </div>
              </div>
            )}

            {/* Task Information */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Task Details
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Task ID:</span>
                  <span className="ml-2 text-gray-900">TC-{task.task_id}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Serial Number:</span>
                  <span className="ml-2 text-gray-900">{task.serial_number ?? 'N/A'}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Status:</span>
                  <span className="ml-2 text-gray-900">{task.status ?? 'N/A'}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Assigned Engineer:</span>
                  <span className="ml-2 text-gray-900">{task.assigned_engineer ?? 'Unassigned'}</span>
                </div>
                <div className="col-span-2">
                  <span className="font-medium text-gray-700">Description:</span>
                  <p className="mt-1 text-gray-900">{task.description ?? 'N/A'}</p>
                </div>
                {task.amendment_reason && (
                  <div className="col-span-2">
                    <span className="font-medium text-gray-700">Amendment Reason:</span>
                    <p className="mt-1 text-gray-900 bg-yellow-50 p-3 rounded border border-yellow-200">
                      {task.amendment_reason}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Decision Selection */}
            <div>
              <label className="block text-sm font-medium mb-3 text-gray-700">
                Your Decision <span className="text-red-600">*</span>
              </label>
              <div className="space-y-3">
                {/* CRITICAL: Team Leaders can ONLY see Forward and Reject */}
                {isTeamLeader && (
                  <>
                    {/* Forward Option (Team Leaders only) */}
                    <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-blue-50 transition-colors group">
                      <input
                        type="radio"
                        name="decision"
                        value="forward"
                        checked={decision === 'forward'}
                        onChange={(e) => setDecision(e.target.value as any)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <ArrowRight className="w-5 h-5 text-blue-600" />
                      <div>
                        <div className="font-medium text-gray-900">↗️ Forward to Director</div>
                        <div className="text-sm text-gray-600">Escalate this amendment request to Director level for final decision</div>
                      </div>
                    </label>

                    {/* Reject Option */}
                    <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-red-50 transition-colors group">
                      <input
                        type="radio"
                        name="decision"
                        value="reject"
                        checked={decision === 'reject'}
                        onChange={(e) => setDecision(e.target.value as any)}
                        className="text-red-600 focus:ring-red-500"
                      />
                      <XCircle className="w-5 h-5 text-red-600" />
                      <div>
                        <div className="font-medium text-gray-900">✗ Reject Amendment</div>
                        <div className="text-sm text-gray-600">Deny the amendment request with explanation</div>
                      </div>
                    </label>
                  </>
                )}

                {/* CRITICAL: Directors can ONLY see Approve and Reject */}
                {isDirector && (
                  <>
                    {/* Approve Option (Directors only) */}
                    <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-green-50 transition-colors group">
                      <input
                        type="radio"
                        name="decision"
                        value="approve"
                        checked={decision === 'approve'}
                        onChange={(e) => setDecision(e.target.value as any)}
                        className="text-green-600 focus:ring-green-500"
                      />
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <div>
                        <div className="font-medium text-gray-900">✓ Approve Amendment</div>
                        <div className="text-sm text-gray-600">Grant the amendment request and allow changes to the task</div>
                      </div>
                    </label>

                    {/* Reject Option */}
                    <label className="flex items-center gap-3 p-4 border rounded-lg cursor-pointer hover:bg-red-50 transition-colors group">
                      <input
                        type="radio"
                        name="decision"
                        value="reject"
                        checked={decision === 'reject'}
                        onChange={(e) => setDecision(e.target.value as any)}
                        className="text-red-600 focus:ring-red-500"
                      />
                      <XCircle className="w-5 h-5 text-red-600" />
                      <div>
                        <div className="font-medium text-gray-900">✗ Reject Amendment</div>
                        <div className="text-sm text-gray-600">Deny the amendment request with explanation</div>
                      </div>
                    </label>
                  </>
                )}
              </div>
            </div>

            {/* Comments */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">
                Review Comments <span className="text-red-600">*</span>
              </label>
              <textarea 
                className="w-full border border-gray-300 rounded-lg p-3 h-32 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical" 
                value={comments} 
                onChange={(e) => setComments(e.target.value)} 
                placeholder="Please provide detailed comments explaining your decision. This will be part of the audit trail and visible to the requester..."
                required 
                minLength={5}
              />
              <div className="flex justify-between items-center mt-1">
                <p className="text-xs text-gray-500">
                  Comments are required for audit and documentation purposes (minimum 5 characters)
                </p>
                <p className="text-xs text-gray-500">
                  {comments.length} characters
                </p>
              </div>
            </div>

            {/* Role Information */}
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-blue-800 mb-2">Review Authority:</p>
                  <p className="text-blue-700 mb-2">
                    You are reviewing this amendment as a <strong>{isDirector ? 'Director' : 'Team Leader'}</strong>. 
                    Your decision will be recorded in the audit trail and the requester will be notified.
                  </p>
                  {isTeamLeader && (
                    <p className="text-blue-700">
                      As a Team Leader, you can forward complex amendments to the Director or reject simple ones. You cannot approve amendments directly.
                    </p>
                  )}
                  {isDirector && (
                    <p className="text-blue-700">
                      As a Director, you have final authority to approve or reject all amendment requests.
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Timestamp Information */}
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Clock className="w-4 h-4" />
                <span>
                  Reviewing as: <strong>{user?.full_name || user?.username || 'Unknown User'}</strong> 
                  on {new Date().toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
            <Button 
              variant="ghost" 
              onClick={onClose} 
              disabled={loading}
              className="px-6"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !decision || !comments.trim() || comments.trim().length < 5} 
              className={`px-6 ${
                decision === 'approve' ? 'bg-green-600 hover:bg-green-700 text-white' :
                decision === 'reject' ? 'bg-red-600 hover:bg-red-700 text-white' :
                decision === 'forward' ? 'bg-blue-600 hover:bg-blue-700 text-white' :
                'bg-gray-600 hover:bg-gray-700 text-white'
              }`}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {getDecisionIcon()}
                  {getDecisionText()}
                </div>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}