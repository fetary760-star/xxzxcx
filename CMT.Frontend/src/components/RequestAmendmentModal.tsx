'use client'
import React, { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { Edit, AlertCircle, FileText, User, Calendar } from 'lucide-react'
import { 
  DraggableDialog, 
  DraggableDialogContent, 
  DraggableDialogHeader, 
  DraggableDialogTitle 
} from '@/components/ui/draggable-dialog'
import { getCsrfToken } from '@/lib/csrf'
import { secureAuthStore } from '@/lib/secure-auth-store'

interface Props {
  isOpen: boolean
  onClose: (() => void) | undefined
  task: any | null
  onSuccess?: ((data?: any) => void) | undefined
}

/**
 * RequestAmendmentModal - FIXED VERSION
 *
 * CRITICAL CHANGES:
 * - Removed Team Leader's "Create and immediately forward to Director" option
 * - Team Leaders now submit amendment requests like engineers
 * - Team Leaders must use the separate review modal to forward requests
 * - Only Engineers, Customer Personnel, and Team Leaders can request amendments
 * - Added CSRF token support for security
 */
export default function RequestAmendmentModal({ isOpen, onClose, task, onSuccess }: Props) {
  const { user } = useAuth()
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const userRole = user?.role ?? user?.roleDisplayName ?? user?.roleDisplay ?? ''
  const canonicalRole = String(userRole).toLowerCase().replace(/[\s\-_]+/g, '_')
  const canRequestAmendment = ['engineer', 'customer_personnel', 'team_leader'].includes(canonicalRole)

  useEffect(() => {
    if (task && isOpen) {
      setReason('')
      setError(null)
    }
  }, [task, isOpen])

  if (!isOpen || !task) return null

  function safeCall(fn: any, ...args: any[]) {
    if (typeof fn !== 'function') {
      return
    }
    try {
      return fn(...args)
    } catch (cbErr) {
      console.error('Callback error:', cbErr)
    }
  }

  function getAuthToken(): string | null {
    return secureAuthStore.getToken()
  }

  if (!canRequestAmendment) {
    return (
      <DraggableDialog open={isOpen} onOpenChange={() => safeCall(onClose)}>
        <DraggableDialogContent className="max-w-md">
          <DraggableDialogHeader>
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-8 h-8 text-red-600" />
              <DraggableDialogTitle>Access Denied</DraggableDialogTitle>
            </div>
          </DraggableDialogHeader>
          <div className="p-6">
            <p className="text-gray-600 mb-4">
              You don't have permission to request amendments. Only Engineers, Team Leaders and Customer Personnel can request amendments on completed tasks.
            </p>
            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg mb-4">
              <p className="text-sm text-blue-700">
                <strong>Your Role:</strong> {userRole || 'Unknown'}<br />
                <strong>Required Roles:</strong> Engineer, Team Leader, Customer Personnel
              </p>
            </div>
            <Button onClick={() => safeCall(onClose)} className="w-full">Close</Button>
          </div>
        </DraggableDialogContent>
      </DraggableDialog>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    
    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      return setError('Please enter a detailed reason for the amendment request.')
    }

    if (trimmedReason.length < 10) {
      return setError('Amendment reason must be at least 10 characters long.')
    }

    setLoading(true)
    try {
      const token = getAuthToken()
      const csrfToken = await getCsrfToken()
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
      
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken
      }

      const payload = {
        AmendmentReason: trimmedReason
      }

      const resp = await fetch(`/api/tasks/${encodeURIComponent(String(task.task_id))}/request-amendment`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        credentials: 'include'
      })

      if (!resp.ok) {
        let errorMessage = 'Failed to request amendment'

        try {
          const contentType = resp.headers.get('content-type')
          if (contentType && contentType.includes('application/json')) {
            const errorData = await resp.json()
            errorMessage = errorData?.error || errorData?.message || errorData?.Message || errorMessage
          } else {
            const errorText = await resp.text()
            errorMessage = errorText || errorMessage
          }
        } catch (parseError) {
          errorMessage = `Request failed with status ${resp.status}`
        }

        setError(errorMessage)
        return
      }

      const data = await resp.json()

      // Normal flow: created amendment request (Pending TL Review)
      window.dispatchEvent(new CustomEvent('tasks:refresh'))
      window.dispatchEvent(new CustomEvent('amendments:refresh'))

      if (data.success || resp.status === 200 || resp.status === 201) {
        safeCall(onSuccess, data)
        safeCall(onClose)
      } else {
        const amendment = data?.amendment ?? data?.payload ?? data
        safeCall(onSuccess, amendment)
        safeCall(onClose)
      }
    } catch (err: any) {
      const message = err?.message ?? 'Request failed. Please try again.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <DraggableDialog open={isOpen} onOpenChange={() => safeCall(onClose)}>
      <DraggableDialogContent className="max-w-2xl" showMaximize>
        <form onSubmit={handleSubmit}>
          <DraggableDialogHeader className="p-4 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 bg-blue-100 rounded-full">
                <Edit className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <DraggableDialogTitle>Request Amendment</DraggableDialogTitle>
                <p className="text-sm text-gray-600">TC-{task.task_id} - {task.serial_number ?? 'N/A'} • Drag to move</p>
              </div>
            </div>
          </DraggableDialogHeader>

          <div className="p-6 space-y-6">
            {error && (
              <div className="flex items-start gap-3 text-red-700 bg-red-50 p-4 rounded-lg border border-red-200">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <strong>Error:</strong> {error}
                </div>
              </div>
            )}

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
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700">
                Reason for Amendment <span className="text-red-600">*</span>
              </label>
              <textarea 
                className="w-full border border-gray-300 rounded-lg p-3 h-40 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical" 
                value={reason} 
                onChange={(e) => setReason(e.target.value)} 
                placeholder="Please provide a detailed explanation for why this amendment is needed..."
                required 
                minLength={10}
              />
              <div className="flex justify-between items-center mt-1">
                <p className="text-xs text-gray-500">
                  Minimum 10 characters required
                </p>
                <p className="text-xs text-gray-500">
                  {reason.length} characters
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg">
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-semibold text-blue-800 mb-2">Amendment Process:</p>
                  <ul className="text-blue-700 space-y-1 list-disc list-inside">
                    <li>Your request will be sent to the Team Leader for review</li>
                    <li>Team Leader can forward to Director or reject the request</li>
                    <li>If forwarded, Director will make the final decision (approve or reject)</li>
                    <li>If approved, you'll be able to edit the task</li>
                    <li>All actions are logged for audit purposes</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="w-4 h-4" />
                <span>
                  Requesting as: <strong>{user?.full_name || user?.username || 'Unknown User'}</strong> 
                  ({canonicalRole.replace('_', ' ').toUpperCase()})
                </span>
              </div>
            </div>
          </div>

          <div className="p-4 border-t bg-gray-50 flex justify-end gap-3">
            <Button 
              variant="ghost" 
              onClick={() => safeCall(onClose)} 
              disabled={loading}
              className="px-6"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !reason.trim() || reason.trim().length < 10}
              className="px-6 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Submitting...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Edit className="w-4 h-4" />
                  Submit Amendment Request
                </div>
              )}
            </Button>
          </div>
        </form>
      </DraggableDialogContent>
    </DraggableDialog>
  )
}