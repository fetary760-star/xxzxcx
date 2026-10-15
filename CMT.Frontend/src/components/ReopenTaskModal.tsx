'use client'
import React, { useEffect, useState } from 'react'
import { 
  DraggableDialog, 
  DraggableDialogContent, 
  DraggableDialogHeader, 
  DraggableDialogTitle 
} from '@/components/ui/draggable-dialog'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { secureAuthStore } from '@/lib/secure-auth-store'
import { RotateCcw, AlertCircle, History, Users, MessageSquare, Info } from 'lucide-react'

interface Props {
  isOpen: boolean
  onClose: () => void
  task: any | null
  allEngineers?: { user_id: number; full_name: string }[]
  onSuccess?: () => void
}

/**
 * ReopenTaskModal - DRAGGABLE VERSION
 * 
 * Features:
 * - Draggable by title bar
 * - Standardized sizing (modal-size-2xl)
 * - Smooth animations
 * - Enhanced visual hierarchy
 * - Better mobile responsiveness
 */
export default function ReopenTaskModal({ isOpen, onClose, task, allEngineers = [], onSuccess }: Props) {
  const { user } = useAuth()
  const [selectedEngineers, setSelectedEngineers] = useState<string[]>([])
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showConfirmation, setShowConfirmation] = useState(false)

  useEffect(() => {
    if (task) {
      setSelectedEngineers(task.assigned_engineer ? String(task.assigned_engineer).split(',').map((s:string) => s.trim()) : [])
      setComment('')
      setError(null)
      setShowConfirmation(false)
    }
  }, [task])

  if (!isOpen || !task) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    
    const trimmedComment = comment.trim()
    if (!trimmedComment) {
      setError('A detailed comment explaining the reason for reopening is mandatory for audit purposes.')
      return
    }
    
    if (trimmedComment.length < 10) {
      setError('Please provide a more detailed explanation (at least 10 characters).')
      return
    }
    
    if (!selectedEngineers.length) {
      setError('You must assign at least one engineer when reopening a task.')
      return
    }

    if (!showConfirmation) {
      setShowConfirmation(true)
      return
    }

    setLoading(true)
    try {
      const token = secureAuthStore.getToken()
      
      if (!token) {
        throw new Error('Authentication token not found. Please log in again.')
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }

      // Fixed: Use snake_case field names to match the backend API expectations
      const payload = {
        status: "Pending",
        reopen_comment: trimmedComment,
        assigned_engineer: selectedEngineers,
        reopened_by_role: user?.role || user?.roleDisplayName || 'Unknown',
        reopen_timestamp: new Date().toISOString(),
        previous_reopen_count: task.reopen_count || 0
      }

      const resp = await fetch(`/api/tasks/${encodeURIComponent(String(task.task_id))}/reopen`, {
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
        
        throw new Error(`Server returned ${resp.status}: ${resp.statusText}`)
      }

      if (!resp.ok) {
        if (resp.status === 401) {
          secureAuthStore.clearAll()
          window.location.href = '/login'
          return
        }
        
        const errorMessage = data?.error || data?.message || data?.Message || `HTTP ${resp.status}: ${resp.statusText}`
        throw new Error(errorMessage)
      }
      
      window.dispatchEvent(new CustomEvent('tasks:refresh'))
      window.dispatchEvent(new CustomEvent('amendments:refresh'))
      
      if (onSuccess) onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.message ?? 'Failed to reopen task. Please try again.')
    } finally {
      setLoading(false)
      setShowConfirmation(false)
    }
  }

  const handleCancel = () => {
    if (showConfirmation) {
      setShowConfirmation(false)
    } else {
      onClose()
    }
  }

  return (
    <DraggableDialog open={isOpen} onOpenChange={onClose}>
      <DraggableDialogContent className="modal-size-2xl" showMaximize>
        <DraggableDialogHeader className="modal-header-modern modal-header-warning">
          <div className="modal-title-group">
            <div className="modal-header-icon bg-amber-100">
              <RotateCcw className="h-5 w-5 text-amber-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <DraggableDialogTitle className="modal-title-modern">Reopen & Reassign Task</DraggableDialogTitle>
                {task.reopen_count > 0 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                    Previously reopened {task.reopen_count}x
                  </span>
                )}
              </div>
              <p className="modal-subtitle-modern">TC-{task.task_id} • SN: {task.serial_number ?? 'N/A'} • Drag to move</p>
            </div>
          </div>
        </DraggableDialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="modal-body-modern space-y-6">
            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200">
                <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800">Error</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            )}

            {showConfirmation && (
              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-yellow-800 mb-2">Confirm Task Reopening</h4>
                    <p className="text-sm text-yellow-700 mb-3">
                      You are about to reopen this completed task. This action will:
                    </p>
                    <ul className="text-sm text-yellow-700 space-y-1 mb-3 list-disc list-inside">
                      <li>Move the task back to "Pending" status</li>
                      <li>Increment the reopen count to {(task.reopen_count || 0) + 1}</li>
                      <li>Create a comprehensive audit trail entry</li>
                      <li>Assign the task to: {selectedEngineers.join(', ')}</li>
                      <li>Clear the completion date</li>
                    </ul>
                    <p className="text-sm text-yellow-700 font-medium">
                      Are you sure you want to proceed?
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <History className="w-4 h-4" />
                Task Information
              </h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Current Status:</span>
                  <span className="ml-2 text-gray-900">Completed</span>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Reopen Count:</span>
                  <span className="ml-2 text-gray-900">{task.reopen_count || 0}</span>
                </div>
                <div className="col-span-2">
                  <span className="font-medium text-gray-700">Description:</span>
                  <p className="mt-1 text-gray-900 text-sm">{task.description}</p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
              <h4 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
                <Info className="w-4 h-4" />
                Status Change Details
              </h4>
              <div className="text-sm text-amber-700 space-y-2">
                <p>This task will be moved from <strong>"Completed"</strong> to <strong>"Pending"</strong> status.</p>
                <p>The task will appear in the current active tasks list and be available for work.</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Reassign To Engineer(s) <span className="text-red-600">*</span>
              </label>
              <select
                multiple
                value={selectedEngineers}
                onChange={(e) => setSelectedEngineers(Array.from(e.target.selectedOptions).map(o => o.value))}
                className="w-full border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                required
                size={6}
              >
                {allEngineers.length ? (
                  allEngineers.map(eng => <option key={eng.user_id} value={eng.full_name}>{eng.full_name}</option>)
                ) : (
                  (task.assigned_engineer ? String(task.assigned_engineer).split(',').map((s:string) => s.trim()) : ['Unassigned']).map((name, idx) =>
                    <option key={idx} value={name}>{name}</option>
                  )
                )}
              </select>
              <p className="text-xs text-gray-600 mt-1">
                Hold Ctrl / Cmd to select multiple engineers. At least one engineer must be assigned.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Detailed Reason for Reopening <span className="text-red-600">*</span>
              </label>
              <textarea 
                className="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-amber-500 focus:border-transparent resize-vertical"
                style={{ minHeight: '120px' }}
                value={comment} 
                onChange={(e) => setComment(e.target.value)} 
                placeholder="Please provide a comprehensive explanation for why this completed task needs to be reopened..."
                required 
                minLength={10}
              />
              <div className="flex justify-between items-center mt-1">
                <div className="text-xs text-gray-600">
                  {comment.trim().length >= 10 && (
                    <span className="text-green-600">✓ Sufficient detail provided</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {comment.length}/500 characters
                </div>
              </div>
            </div>
          </div>

          <div className="modal-footer-modern">
            <Button 
              type="button"
              variant="ghost" 
              onClick={handleCancel} 
              disabled={loading}
            >
              {showConfirmation ? 'Back to Edit' : 'Cancel'}
            </Button>
            <Button 
              type="submit" 
              disabled={loading || !comment.trim() || comment.trim().length < 10 || !selectedEngineers.length}
              className={showConfirmation ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700'}
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Processing...
                </div>
              ) : showConfirmation ? (
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Confirm Reopen Task
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Reopen Task
                </div>
              )}
            </Button>
          </div>
        </form>
      </DraggableDialogContent>
    </DraggableDialog>
  )
}