'use client'
import React from 'react'
import { Filter, X, Edit, CheckCircle, XCircle, ArrowRight, RotateCcw, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface AmendmentFiltersProps {
  amendmentStatusFilter: string | null
  reopenedFilter: boolean
  onAmendmentStatusChange: (status: string | null) => void
  onReopenedFilterChange: (enabled: boolean) => void
  onClearFilters: () => void
  userRole?: string
  className?: string
}

/**
 * AmendmentFilters Component - FIXED to work with both active and completed tasks
 * Provides filtering options for amendment statuses and reopened tasks
 * Includes role-based filter suggestions
 */
export default function AmendmentFilters({
  amendmentStatusFilter,
  reopenedFilter,
  onAmendmentStatusChange,
  onReopenedFilterChange,
  onClearFilters,
  userRole = '',
  className = ''
}: AmendmentFiltersProps) {

  const canonicalRole = String(userRole).toLowerCase().replace(/[\s\-_]+/g, '_')
  
  // Amendment status options with icons and descriptions
  const amendmentStatuses = [
    {
      value: 'pending_tl',
      label: 'Pending TL Review',
      icon: Edit,
      color: 'text-yellow-700',
      bgColor: 'bg-yellow-50',
      borderColor: 'border-yellow-300',
      description: 'Amendment requests awaiting Team Leader review',
      relevantRoles: ['team_leader', 'task_owner', 'engineer']
    },
    {
      value: 'forwarded',
      label: 'Forwarded to Director',
      icon: ArrowRight,
      color: 'text-blue-700',
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-300',
      description: 'Amendment requests escalated to Director',
      relevantRoles: ['director', 'team_leader']
    },
    {
      value: 'approved',
      label: 'Approved',
      icon: CheckCircle,
      color: 'text-green-700',
      bgColor: 'bg-green-50',
      borderColor: 'border-green-300',
      description: 'Amendment requests that have been approved',
      relevantRoles: ['task_owner', 'engineer', 'team_leader', 'director']
    },
    {
      value: 'rejected',
      label: 'Rejected',
      icon: XCircle,
      color: 'text-red-700',
      bgColor: 'bg-red-50',
      borderColor: 'border-red-300',
      description: 'Amendment requests that have been rejected',
      relevantRoles: ['task_owner', 'engineer', 'team_leader', 'director']
    },
    {
      value: 'pending',
      label: 'All Pending',
      icon: Clock,
      color: 'text-amber-700',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-300',
      description: 'All pending amendment requests (TL + Director)',
      relevantRoles: ['team_leader', 'director']
    }
  ]

  // Filter statuses based on user role for better UX
  const relevantStatuses = amendmentStatuses.filter(status => 
    status.relevantRoles.includes(canonicalRole) || canonicalRole === ''
  )

  const hasActiveFilters = amendmentStatusFilter !== null || reopenedFilter

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Filter Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-600" />
          <h3 className="text-sm font-semibold text-gray-700">Amendment & Status Filters</h3>
        </div>
        {hasActiveFilters && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onClearFilters}
            className="text-xs text-gray-600 hover:text-gray-900"
          >
            <X className="h-3 w-3 mr-1" />
            Clear All
          </Button>
        )}
      </div>

      {/* Amendment Status Filters */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          Amendment Status
        </label>
        <div className="flex flex-wrap gap-2">
          {relevantStatuses.map((status) => {
            const Icon = status.icon
            const isActive = amendmentStatusFilter === status.value
            
            return (
              <button
                key={status.value}
                onClick={() => onAmendmentStatusChange(isActive ? null : status.value)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 hover:shadow-sm ${
                  isActive
                    ? `${status.bgColor} ${status.color} ${status.borderColor} border-2 shadow-sm`
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
                title={status.description}
              >
                <Icon className="h-3 w-3" />
                <span>{status.label}</span>
                {isActive && <CheckCircle className="h-3 w-3" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Reopened Tasks Filter */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
          Task Status
        </label>
        <button
          onClick={() => onReopenedFilterChange(!reopenedFilter)}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200 hover:shadow-sm ${
            reopenedFilter
              ? 'bg-amber-50 text-amber-700 border-amber-300 border-2 shadow-sm'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
          title="Show only tasks that have been reopened"
        >
          <RotateCcw className="h-3 w-3" />
          <span>Reopened Tasks Only</span>
          {reopenedFilter && <CheckCircle className="h-3 w-3" />}
        </button>
      </div>

      {/* Active Filters Summary */}
      {hasActiveFilters && (
        <div className="pt-3 border-t border-gray-200">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-600 font-medium">Active:</span>
            {amendmentStatusFilter && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {relevantStatuses.find(s => s.value === amendmentStatusFilter)?.label}
                <button
                  onClick={() => onAmendmentStatusChange(null)}
                  className="ml-1 hover:text-blue-900"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
            {reopenedFilter && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                Reopened Tasks
                <button
                  onClick={() => onReopenedFilterChange(false)}
                  className="ml-1 hover:text-amber-900"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )}
          </div>
        </div>
      )}

      {/* Role-Based Suggestions */}
      {canonicalRole && (
        <div className="pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-600">
            <span className="font-medium">Quick filters for {userRole}:</span>
            <div className="mt-2 space-y-1">
              {canonicalRole === 'team_leader' && (
                <p className="text-gray-500">
                  • Use "Pending TL Review" to see tasks requiring your approval
                </p>
              )}
              {canonicalRole === 'director' && (
                <p className="text-gray-500">
                  • Use "Forwarded to Director" to see escalated requests
                </p>
              )}
              {(canonicalRole === 'engineer' || canonicalRole === 'task_owner') && (
                <p className="text-gray-500">
                  • Use "Pending TL Review" to track your submitted amendment requests
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Helper function to get amendment status from filter value
 */
export function getAmendmentStatusFromFilter(filterValue: string | null): number | null {
  if (!filterValue) return null
  
  const statusMap: Record<string, number> = {
    'pending_tl': 0,
    'forwarded': 1,
    'approved': 2,
    'rejected': 3,
    'pending': -1 // Special case: both 0 and 1
  }
  
  return statusMap[filterValue] ?? null
}

/**
 * FIXED: Helper function to check if task matches amendment filter
 * Now works with both tasks that have amendment_request=true AND tasks from completed table
 */
export function matchesAmendmentFilter(
  task: any,
  filterValue: string | null
): boolean {
  // If no filter is active, show all tasks
  if (!filterValue) return true
  
  // If we are here, it means the backend has already filtered the tasks
  // based on the amendment_requests table. So we should trust the backend
  // and not filter out tasks on the frontend just because they might be missing
  // the amendment_request flag or status on the task object itself.
  // This is especially true for tasks where the amendment data is in a separate table
  // and might not be fully joined/mapped to the task object properties expected here.
  
  // However, if the task DOES have amendment status, we can verify it matches.
  // But we shouldn't be too strict if the data is missing, as the backend filter is the source of truth.
  
  const statusCode = getAmendmentStatusFromFilter(filterValue)
  const amendmentStatus = task.amendment_status ?? task.amendmentStatus ?? task.AmendmentStatus ?? null
  
  //(`Checking task ${task.task_id ?? task.taskId ?? task.TaskId}: amendment_status=${amendmentStatus}, filterValue=${filterValue}, statusCode=${statusCode}`)
  
  // If the task has no amendment status property, we assume it's a valid result from the backend query
  // and let it pass. The backend query joined with amendment_requests table, so if it's returned,
  // it must have matched the criteria in the database.
  if (amendmentStatus === null || amendmentStatus === undefined) {
    //(`Task ${task.task_id ?? task.taskId ?? task.TaskId} has no amendment status property - assuming backend match`)
    return true
  }
  
  if (statusCode === -1) {
    // "All Pending" - matches status 0 or 1
    const matches = amendmentStatus === 0 || amendmentStatus === 1
    //(`Task ${task.task_id ?? task.taskId ?? task.TaskId} "All Pending" check: ${matches}`)
    return matches
  }
  
  // Check if amendment_status matches the filter
  const matches = amendmentStatus === statusCode
  //(`Task ${task.task_id ?? task.taskId ?? task.TaskId} status match check: amendment_status=${amendmentStatus} === ${statusCode} = ${matches}`)
  return matches
}