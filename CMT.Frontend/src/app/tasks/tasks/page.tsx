'use client'

import '@/app/globals.css'
import React, { useEffect, useState, useCallback } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Plus, Filter, Search, RotateCcw, Edit, Info } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import TaskTable from '@/components/TaskTable'
import CreateTaskDialog from '@/components/CreateTaskDialog'
import TaskStatusLegend from '@/components/TaskStatusLegend'
import apiClient from '@/lib/api'

/** Normalize raw status (numeric or string) to a human-readable label */
function normalizeTaskStatus(status: any): string {
  if (status === null || status === undefined) return 'Pending';
  if (typeof status === 'number') {
    switch (status) {
      case 0: return 'Pending';
      case 1: return 'In Progress';
      case 2: return 'Completed';
      case 3: return 'Blocked';
      case 4: return 'On Hold';
      case 5: return 'Rejected';
      case 6: return 'Cancelled';
      case 7: return 'Paused';
      case 8: return 'Pending TL Approval';
      default: return 'Pending';
    }
  }
  const s = String(status).toLowerCase().replace(/[_\s-]+/g, '');
  switch (s) {
    case 'pending': return 'Pending';
    case 'inprogress': return 'In Progress';
    case 'completed': return 'Completed';
    case 'blocked': return 'Blocked';
    case 'onhold': return 'On Hold';
    case 'rejected': return 'Rejected';
    case 'cancelled': return 'Cancelled';
    case 'paused': return 'Paused';
    case 'pendingtlapproval':
    case 'pendingtl':
    case 'pendingapproval': return 'Pending TL Approval';
    default: return 'Pending';
  }
}

/**
 * Enhanced Main Tasks Page
 * 
 * Features:
 * - Enhanced TaskTable with reopened task indicators
 * - Amendment status badges
 * - Status legend/guide for new indicators
 * - Improved filtering and search
 * - Real data integration (no mock data)
 */

export default function TasksPage(): JSX.Element {
  const { user } = useAuth()
  
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [legendOpen, setLegendOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showDuplicates, setShowDuplicates] = useState(false)

  const loadTasks = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await apiClient.getTasks()
      const list: any[] = Array.isArray(res) ? res : (Array.isArray((res as any)?.data) ? (res as any).data : (Array.isArray((res as any)?.tasks) ? (res as any)?.tasks : []))
      
      // Filter out completed tasks for main tasks page
      const activeTasks = list.filter(t => {
        const status = t.status ?? t.Status ?? t.taskStatus ?? 0
        // Exclude completed tasks (status 2 or 'Completed')
        if (typeof status === 'number') return status !== 2
        const statusStr = String(status).toLowerCase()
        return statusStr !== 'completed' && statusStr !== 'done'
      })
      
      // FIXED: Ensure each task has a unique identifier for React keys
      // FIXED: Normalize status values so filtering works correctly
      const tasksWithIds = activeTasks.map((task, index) => ({
        ...task,
        // Normalize status from raw numeric/string to human-readable label
        status: normalizeTaskStatus(task.status ?? task.Status ?? task.taskStatus ?? 0),
        // Ensure task has a proper ID
        task_id: task.task_id || task.id || task.taskId || index + 1,
        // Add a unique key for React rendering
        _uniqueId: `task-${task.task_id || task.id || task.taskId || index}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
      }))
      
      // CRITICAL FIX: Merge with pending optimistic updates.
      // When an engineer updates a task (e.g., marks as Completed → backend sets PendingTLApproval),
      // the backend's list endpoint may not return the task anymore due to its own RBAC filtering.
      // We merge any optimistically-updated tasks that are missing from the fresh list.
      setTasks(prevTasks => {
        if (tasksWithIds.length > 0) {
          // Backend returned tasks - merge with any optimistic updates not in the new list
          const newTaskIds = new Set(tasksWithIds.map(t => Number(t.task_id || t.id || t.taskId)))
          const optimisticTasks = prevTasks.filter(t => {
            const tid = Number(t.task_id || t.id || t.taskId)
            // Keep optimistic tasks that are NOT in the new list AND were recently updated
            return !newTaskIds.has(tid) && t._optimistic === true
          })
          
          if (optimisticTasks.length > 0) {
            console.log(`🔄 [Tasks Page] Merging ${optimisticTasks.length} optimistic tasks with ${tasksWithIds.length} backend tasks`)
            return [...tasksWithIds, ...optimisticTasks]
          }
          return tasksWithIds
        }
        
        // Backend returned 0 tasks - check if we had tasks before (possible backend RBAC issue)
        // Keep existing tasks if they were recently updated optimistically
        const optimisticTasks = prevTasks.filter(t => t._optimistic === true)
        if (optimisticTasks.length > 0) {
          console.log(`⚠️ [Tasks Page] Backend returned 0 tasks but we have ${optimisticTasks.length} optimistic tasks - preserving them`)
          return optimisticTasks
        }
        
        return tasksWithIds
      })
    } catch (err: any) {
      console.error('Failed to load tasks:', err)
      setError('Failed to load tasks from backend')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTasks()
  }, [loadTasks])

  // Listen for task refresh events and optimistic task updates
  useEffect(() => {
    function onRefresh(e: Event) {
      const customEvent = e as CustomEvent
      const updatedTask = customEvent?.detail?.updatedTask
      
      // CRITICAL FIX: If the refresh event includes an updated task,
      // optimistically update it in the local state BEFORE fetching from backend.
      // This prevents the task from "vanishing" when the backend's list endpoint
      // doesn't return it due to RBAC filtering (e.g., after status change to PendingTLApproval).
      if (updatedTask) {
        const taskId = Number(updatedTask.taskId ?? updatedTask.task_id ?? updatedTask.id ?? updatedTask.TaskId)
        if (taskId > 0) {
          const normalizedStatus = normalizeTaskStatus(updatedTask.status ?? updatedTask.Status ?? updatedTask.taskStatus ?? 0)
          const isCompleted = normalizedStatus === 'Completed'
          
          if (!isCompleted) {
            setTasks(prevTasks => {
              const existingIndex = prevTasks.findIndex(t => {
                const tid = Number(t.task_id || t.id || t.taskId)
                return tid === taskId
              })
              
              const optimisticTask = {
                ...updatedTask,
                status: normalizedStatus,
                task_id: taskId,
                _uniqueId: `task-${taskId}-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
                _optimistic: true, // Mark as optimistically updated
              }
              
              if (existingIndex >= 0) {
                // Update existing task in place
                const newTasks = [...prevTasks]
                newTasks[existingIndex] = { ...prevTasks[existingIndex], ...optimisticTask }
                console.log(`🔄 [Tasks Page] Optimistically updated task ${taskId} to status: ${normalizedStatus}`)
                return newTasks
              } else {
                // Task not in list yet (e.g., just changed status) - add it
                console.log(`🔄 [Tasks Page] Optimistically added task ${taskId} with status: ${normalizedStatus}`)
                return [optimisticTask, ...prevTasks]
              }
            })
          }
        }
      }
      
      // Still fetch from backend to get the latest data
      void loadTasks() 
    }
    window.addEventListener('tasks:refresh', onRefresh)
    return () => { 
      window.removeEventListener('tasks:refresh', onRefresh) 
    }
  }, [loadTasks])

  const handleCreateTask = () => {
    setCreateDialogOpen(true)
  }

  const handleTaskCreated = () => {
    setCreateDialogOpen(false)
    void loadTasks()
  }

  const applyFilters = () => {
    // Dispatch custom event to TaskTable with filter parameters
    window.dispatchEvent(new CustomEvent('tasks:filters', {
      detail: {
        searchQuery,
        statusFilter,
        showDuplicates,
        focusSearch: false
      }
    }))
  }

  const clearFilters = () => {
    setSearchQuery('')
    setStatusFilter('all')
    setShowDuplicates(false)
    
    // Dispatch clear filters event
    window.dispatchEvent(new CustomEvent('tasks:filters', {
      detail: {
        searchQuery: '',
        statusFilter: 'all',
        showDuplicates: false,
        focusSearch: false
      }
    }))
  }

  const userRole = user?.role ?? user?.roleDisplayName ?? user?.roleDisplay ?? ''
  const canonicalRole = String(userRole).toLowerCase().replace(/[\s\-_]+/g, '_')
  const canCreateTasks = ['team_leader', 'director', 'customer_personnel', 'customer'].includes(canonicalRole)

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Enhanced Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-gray-900">Current Tasks</h2>
            <p className="text-sm text-gray-600 mt-1">
              Active tasks with enhanced status tracking and reopened task indicators
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              variant="outline" 
              onClick={() => setLegendOpen(true)}
              className="flex items-center gap-2"
            >
              <Info className="h-4 w-4" />
              Status Guide
            </Button>
            
            {canCreateTasks && (
              <Button onClick={handleCreateTask} className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Create Task
              </Button>
            )}
          </div>
        </div>

        {/* Enhanced Filters Section */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-col lg:flex-row gap-4 items-stretch lg:items-center">
            {/* Search Input */}
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by part number, PO number, or task ID"
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Status Filter */}
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Blocked">Blocked</option>
              <option value="On Hold">On Hold</option>
              <option value="Rejected">Rejected</option>
              <option value="Paused">Paused</option>
              <option value="Pending TL Approval">Pending TL Approval</option>
            </select>

            {/* Show Duplicates Toggle */}
            <button
              onClick={() => setShowDuplicates(!showDuplicates)}
              className={`px-3 py-2 border rounded-lg transition-colors ${
                showDuplicates 
                  ? 'bg-gray-200 border-gray-400 text-gray-800' 
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
            >
              {showDuplicates ? 'Hide Duplicates' : 'Show Duplicates'}
            </button>

            {/* Filter Actions */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={applyFilters} className="flex items-center gap-2">
                <Filter className="h-4 w-4" />
                Apply
              </Button>
              <Button variant="ghost" onClick={clearFilters}>
                Clear
              </Button>
            </div>
          </div>

          {/* Filter Summary */}
          {(searchQuery || statusFilter !== 'all' || showDuplicates) && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex flex-wrap gap-2 items-center text-sm">
                <span className="text-gray-600">Active filters:</span>
                {searchQuery && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    Search: &quot;{searchQuery}&quot;
                  </span>
                )}
                {statusFilter !== 'all' && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    Status: {statusFilter}
                  </span>
                )}
                {showDuplicates && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    Including Duplicates
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Enhanced Task Table */}
        <div className="bg-white rounded-lg shadow">
          {error && (
            <div className="p-4 border-b border-red-200 bg-red-50">
              <div className="text-red-700 text-sm">{error}</div>
            </div>
          )}
          
          <div className="p-4">
            <TaskTable 
              tasks={tasks} 
              showCompleted={false}
              userRole={userRole}
            />
          </div>
        </div>

        {/* Create Task Dialog */}
        <CreateTaskDialog 
          open={createDialogOpen} 
          onOpenChange={setCreateDialogOpen}
          onTaskCreated={handleTaskCreated}
        />

        {/* Status Legend Dialog */}
        <Dialog open={legendOpen} onOpenChange={setLegendOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-blue-600" />
                Task Status Indicators Guide
              </DialogTitle>
            </DialogHeader>
            <TaskStatusLegend />
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  )
}