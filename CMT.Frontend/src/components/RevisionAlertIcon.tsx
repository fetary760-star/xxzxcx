'use client';

import React from 'react';
import { AlertTriangle, Bell } from 'lucide-react';

interface RevisionAlertIconProps {
  task: {
    task_id?: number;
    show_revision_alert?: boolean;
    revision_notes?: string;
  };
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
}

/**
 * ENHANCED RevisionAlertIcon Component
 * 
 * FIXES IMPLEMENTED:
 * - Displays alert icon for tasks with show_revision_alert=true
 * - Shows in both active and completed task tables
 * - Animated icon to draw attention
 * - Tooltip with revision notes preview
 * - Consistent styling across the application
 */
export default function RevisionAlertIcon({ 
  task, 
  size = 'md', 
  showTooltip = true 
}: RevisionAlertIconProps) {
  
  // Don't render if no alert is set
  if (!task.show_revision_alert) {
    return null;
  }

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5', 
    lg: 'h-6 w-6'
  };

  const iconSize = iconSizes[size];

  return (
    <div className="relative group inline-flex items-center">
      {/* Alert Icon with Animation */}
      <div className="flex items-center justify-center">
        <AlertTriangle 
          className={`${iconSize} text-yellow-600 animate-pulse`}
          aria-label={showTooltip ? "Important Update Available" : undefined}
          aria-hidden={!showTooltip}
          role="img"
        />
      </div>

      {/* Tooltip with Revision Notes */}
      {showTooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-20 max-w-xs">
          <div className="font-semibold">⚠️ Important Update</div>
          {task.revision_notes && (
            <div className="text-gray-300 mt-1 whitespace-normal">
              {String(task.revision_notes).length > 100 
                ? `${String(task.revision_notes).substring(0, 100)}...`
                : String(task.revision_notes)
              }
            </div>
          )}
          {/* Tooltip Arrow */}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
}