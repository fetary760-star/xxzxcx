'use client'
import React from 'react'
import { RotateCcw, Edit, CheckCircle, XCircle, ArrowRight, AlertCircle } from 'lucide-react'
import ReopenedTaskBadge from './ReopenedTaskBadge'
import AmendmentStatusBadge from './AmendmentStatusBadge'

/**
 * TaskStatusLegend Component
 * Shows a legend/guide for the new task status indicators and icons
 * Helps users understand the meaning of different badges and icons
 */
export default function TaskStatusLegend() {
  return (
    <div className="bg-white border rounded-lg p-6 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Task Status Indicators Guide</h3>
        
        {/* Reopened Task Indicators */}
        <div className="space-y-3 mb-6">
          <h4 className="text-md font-medium text-gray-800 flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-amber-600" />
            Reopened Task Indicators
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded border">
              <ReopenedTaskBadge isReopened={true} reopenCount={1} />
              <span className="text-gray-700">Task has been reopened once</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-amber-50 rounded border">
              <ReopenedTaskBadge isReopened={true} reopenCount={3} />
              <span className="text-gray-700">Task reopened multiple times</span>
            </div>
          </div>
          <p className="text-xs text-gray-600">
            ↻ Circular arrow indicates tasks that have been moved back from "Completed" to "Pending" status
          </p>
        </div>

        {/* Amendment Status Indicators */}
        <div className="space-y-3">
          <h4 className="text-md font-medium text-gray-800 flex items-center gap-2">
            <Edit className="h-4 w-4 text-yellow-600" />
            Amendment Status Indicators
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-3 p-3 bg-yellow-50 rounded border">
              <AmendmentStatusBadge status={1} />
              <span className="text-gray-700">Amendment requested, pending approval</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded border">
              <AmendmentStatusBadge status={2} />
              <span className="text-gray-700">Amendment approved by Team Leader/Director</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-red-50 rounded border">
              <AmendmentStatusBadge status={3} />
              <span className="text-gray-700">Amendment rejected</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded border">
              <AmendmentStatusBadge status={4} />
              <span className="text-gray-700">Forwarded to Director for review</span>
            </div>
          </div>
          <p className="text-xs text-gray-600">
            ✏️ Edit icon for requests • ✓ Checkmark for approved • ✗ Cross for rejected • ↗️ Arrow for forwarded
          </p>
        </div>
      </div>

      {/* Role-Based Actions */}
      <div className="border-t pt-4">
        <h4 className="text-md font-medium text-gray-800 mb-3">Role-Based Actions</h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800">Engineer</span>
            <span className="text-gray-700">Can request amendments on completed tasks</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">Team Leader</span>
            <span className="text-gray-700">Can approve/reject amendments, reopen tasks, forward to Director</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800">Director</span>
            <span className="text-gray-700">Can approve/reject all amendments, reopen any task</span>
          </div>
        </div>
      </div>

      {/* Key Features */}
      <div className="border-t pt-4">
        <h4 className="text-md font-medium text-gray-800 mb-3">Key Enhancement Features</h4>
        <ul className="space-y-1 text-sm text-gray-700">
          <li>• Reopened tasks automatically move to "Pending" status in current tasks list</li>
          <li>• Amendment requests require approval from Team Leaders or Directors</li>
          <li>• All actions are logged for audit trail and compliance</li>
          <li>• Role-based permissions ensure proper workflow control</li>
          <li>• Visual indicators help identify task status at a glance</li>
        </ul>
      </div>
    </div>
  )
}