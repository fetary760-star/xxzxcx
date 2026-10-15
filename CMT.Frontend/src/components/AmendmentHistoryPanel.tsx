'use client'
import React, { useEffect, useState } from 'react'
import { Clock, User, MessageSquare, CheckCircle, XCircle, ArrowRight, Edit } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useTimezone } from '@/lib/timezone-context'

interface AmendmentHistoryItem {
  id: number
  task_id: number
  amendment_status: number
  amendment_decision: string
  amendment_comments: string
  reviewed_by: number
  reviewer_name: string
  reviewer_role: string
  reviewed_at: string
  created_at: string
}

interface AmendmentHistoryPanelProps {
  taskId: number
  className?: string
}

/**
 * AmendmentHistoryPanel Component
 * Displays complete timeline of amendment status changes with audit trail
 * Shows reviewer names, timestamps, decisions, and comments
 */
export default function AmendmentHistoryPanel({ 
  taskId, 
  className = '' 
}: AmendmentHistoryPanelProps) {
  
  const { formatDateTime: tzFormatDateTime } = useTimezone()
  const [history, setHistory] = useState<AmendmentHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadHistory = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const response = await fetch(`/api/tasks/${taskId}/amendment/review`)
        
        if (!response.ok) {
          throw new Error('Failed to load amendment history')
        }
        
        const data = await response.json()
        const historyList = Array.isArray(data) ? data : 
                           Array.isArray(data.review_history) ? data.review_history :
                           Array.isArray(data.data) ? data.data : []
        
        setHistory(historyList)
      } catch (err) {
        console.error('Error loading amendment history:', err)
        setError(err instanceof Error ? err.message : 'Failed to load amendment history')
      } finally {
        setLoading(false)
      }
    }
    
    if (taskId) {
      void loadHistory()
    }
  }, [taskId])

  const getStatusConfig = (status: number) => {
    switch (status) {
      case 0:
        return {
          icon: Edit,
          label: 'Amendment Requested',
          color: 'text-yellow-700',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-300'
        }
      case 1:
        return {
          icon: ArrowRight,
          label: 'Forwarded to Director',
          color: 'text-blue-700',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-300'
        }
      case 2:
        return {
          icon: CheckCircle,
          label: 'Approved',
          color: 'text-green-700',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-300'
        }
      case 3:
        return {
          icon: XCircle,
          label: 'Rejected',
          color: 'text-red-700',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-300'
        }
      default:
        return {
          icon: Clock,
          label: 'Unknown',
          color: 'text-gray-700',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-300'
        }
    }
  }

  // FIXED: Use reactive useTimezone() hook for timezone-aware formatting
  const formatDateTime = (dateString: string) => {
    const result = tzFormatDateTime(dateString)
    return result === '—' ? dateString : result
  }

  const formatRole = (role: string) => {
    return role
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  if (loading) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading amendment history...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`p-6 ${className}`}>
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (history.length === 0) {
    return (
      <div className={`p-6 ${className}`}>
        <div className="text-center text-gray-500">
          <Clock className="h-12 w-12 mx-auto mb-3 text-gray-400" />
          <p className="text-sm">No amendment history available for this task.</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Clock className="h-5 w-5 text-blue-600" />
        Amendment History Timeline
      </h3>

      <div className="space-y-4">
        {history.map((item, index) => {
          const config = getStatusConfig(item.amendment_status)
          const Icon = config.icon
          const isLast = index === history.length - 1

          return (
            <div key={item.id} className="relative">
              {/* Timeline connector line */}
              {!isLast && (
                <div 
                  className="absolute left-6 top-12 bottom-0 w-0.5 bg-gray-200"
                  style={{ height: 'calc(100% + 1rem)' }}
                />
              )}

              {/* History item card */}
              <div className={`relative flex gap-4 p-4 rounded-lg border-2 ${config.borderColor} ${config.bgColor}`}>
                {/* Status icon */}
                <div className={`flex-shrink-0 w-12 h-12 rounded-full ${config.bgColor} border-2 ${config.borderColor} flex items-center justify-center z-10`}>
                  <Icon className={`h-6 w-6 ${config.color}`} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className={`text-sm font-semibold ${config.color}`}>
                        {config.label}
                      </h4>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-600">
                        <User className="h-3 w-3" />
                        <span className="font-medium">{item.reviewer_name}</span>
                        <span className="text-gray-400">•</span>
                        <span>{formatRole(item.reviewer_role)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>{formatDateTime(item.reviewed_at || item.created_at)}</span>
                    </div>
                  </div>

                  {/* Comments */}
                  {item.amendment_comments && (
                    <div className="mt-3 p-3 bg-white rounded border border-gray-200">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">
                            {item.amendment_comments}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Decision badge */}
                  {item.amendment_decision && (
                    <div className="mt-2">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.color} border ${config.borderColor}`}>
                        Decision: {item.amendment_decision.charAt(0).toUpperCase() + item.amendment_decision.slice(1)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary footer */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <span>Total amendments: {history.length}</span>
          <span>Last updated: {formatDateTime(history[0]?.reviewed_at || history[0]?.created_at)}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * Compact version for use in modals or sidebars
 */
export function CompactAmendmentHistory({ taskId }: { taskId: number }) {
  return (
    <AmendmentHistoryPanel 
      taskId={taskId}
      className="max-h-96 overflow-y-auto"
    />
  )
}