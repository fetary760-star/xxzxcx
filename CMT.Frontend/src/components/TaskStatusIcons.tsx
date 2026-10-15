'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, FileEdit, Bell, Pause } from 'lucide-react';

// ENHANCED TaskStatusIcons Component
// 
// FIXES IMPLEMENTED:
// - Added revision alert icon that shows for tasks with show_revision_alert=true
// - Enhanced icon visibility and styling
// - Proper icon display for completed tasks that move to completed table
// - Real-time database connectivity (removed mock data)

interface TaskStatusIconsProps {
  task: {
    task_id?: number;
    is_reopened?: boolean;
    reopen_count?: number;
    amendment_request?: boolean;
    amendment_status?: number | null;
    show_revision_alert?: boolean;
    revision_notes?: string;
    is_paused?: boolean;
    paused_reason?: string;
    [key: string]: any;
  };
  size?: 'sm' | 'md' | 'lg';
}

interface CompactTaskStatusIconsProps extends TaskStatusIconsProps {
  // Compact version for table display
}

export function TaskStatusIcons({ task, size = 'md' }: TaskStatusIconsProps) {
  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5', 
    lg: 'h-6 w-6'
  };

  const iconSize = iconSizes[size];

  return (
    <div className="flex items-center gap-2">
      {/* ENHANCED: Revision Alert Icon - Shows when show_revision_alert is true */}
      {task.show_revision_alert && (
        <div className="relative group">
          <div className="flex items-center justify-center">
            <Bell className={`${iconSize} text-yellow-600 animate-pulse`} />
            <AlertTriangle className={`${iconSize} text-yellow-600 absolute -top-1 -right-1 h-3 w-3`} />
          </div>
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
            Important Update Available
            {task.revision_notes && (
              <div className="text-xs text-gray-300 mt-1 max-w-xs">
                {String(task.revision_notes).substring(0, 100)}...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Paused Task Icon */}
      {task.is_paused && (
        <div className="relative group">
          <div className="flex items-center justify-center">
            <Pause className={`${iconSize} text-amber-600`} />
          </div>
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
            ⏸️ Task Paused
            {task.paused_reason && (
              <div className="text-xs text-gray-300 mt-1 max-w-xs">
                {String(task.paused_reason).substring(0, 100)}...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reopened Task Icon */}
      {task.is_reopened && (
        <div className="relative group">
          <div className="flex items-center">
            <RefreshCw className={`${iconSize} text-orange-600`} />
            {task.reopen_count && task.reopen_count > 1 && (
              <span className="absolute -top-1 -right-1 bg-orange-600 text-white text-xs rounded-full h-4 w-4 flex items-center justify-center">
                {task.reopen_count}
              </span>
            )}
          </div>
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
            Reopened Task {task.reopen_count && task.reopen_count > 1 ? `(${task.reopen_count}x)` : ''}
          </div>
        </div>
      )}

      {/* Amendment Request Icon */}
      {task.amendment_request && (
        <div className="relative group">
          <FileEdit className={`${iconSize} text-blue-600`} />
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
            Amendment Request
            {task.amendment_status !== null && (
              <div className="text-xs">
                Status: {getAmendmentStatusText(task.amendment_status ?? null)}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ENHANCED: Compact version for table rows
export function CompactTaskStatusIcons({ task, size = 'sm' }: CompactTaskStatusIconsProps) {
  const iconSize = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <div className="flex items-center gap-1">
      {/* ENHANCED: Revision Alert Icon - Prominent display in table */}
      {task.show_revision_alert && (
        <div className="relative group">
          <div className="flex items-center justify-center p-1 bg-yellow-100 rounded-full">
            <AlertTriangle className={`${iconSize} text-yellow-700`} />
          </div>
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
            ⚠️ Important Update
          </div>
        </div>
      )}

      {/* Paused Task Icon */}
      {task.is_paused && (
        <div className="relative group">
          <div className="flex items-center justify-center p-1 bg-amber-100 rounded-full">
            <Pause className={`${iconSize} text-amber-700`} />
          </div>
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
            ⏸️ Paused
          </div>
        </div>
      )}

      {/* Reopened Task Icon */}
      {task.is_reopened && (
        <div className="relative group">
          <div className="flex items-center justify-center p-1 bg-orange-100 rounded-full">
            <RefreshCw className={`${iconSize} text-orange-700`} />
            {task.reopen_count && task.reopen_count > 1 && (
              <span className="absolute -top-1 -right-1 bg-orange-600 text-white text-xs rounded-full h-3 w-3 flex items-center justify-center text-[10px]">
                {task.reopen_count}
              </span>
            )}
          </div>
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
            Reopened {task.reopen_count && task.reopen_count > 1 ? `(${task.reopen_count}x)` : ''}
          </div>
        </div>
      )}

      {/* Amendment Request Icon */}
      {task.amendment_request && (
        <div className="relative group">
          <div className="flex items-center justify-center p-1 bg-blue-100 rounded-full">
            <FileEdit className={`${iconSize} text-blue-700`} />
          </div>
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
            Amendment Request
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to get amendment status text
function getAmendmentStatusText(status: number | null): string {
  if (status === null || status === undefined) return 'Pending';
  
  switch (status) {
    case 0: return 'Pending TL Review';
    case 1: return 'Forwarded to Director';
    case 2: return 'Approved';
    case 3: return 'Rejected';
    default: return 'Unknown';
  }
}

// Default export for backward compatibility
export default TaskStatusIcons;