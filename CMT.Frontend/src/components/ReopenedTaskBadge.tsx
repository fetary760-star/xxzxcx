'use client'
import React from 'react'
import { RotateCcw } from 'lucide-react'

interface ReopenedTaskBadgeProps {
  isReopened?: boolean
  reopenCount?: number
  className?: string
}

/**
 * ReopenedTaskBadge Component
 * Displays indicator for tasks that have been reopened with circular arrow icon (↻)
 * Aligned with existing global.css styling and database schema
 */
export default function ReopenedTaskBadge({ 
  isReopened = false, 
  reopenCount = 0, 
  className = '' 
}: ReopenedTaskBadgeProps) {
  
  if (!isReopened && reopenCount === 0) {
    return null
  }

  const count = Math.max(reopenCount, isReopened ? 1 : 0)
  const displayText = count > 1 ? `Reopened (${count}x)` : 'Reopened'

  return (
    <span 
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border bg-amber-100 text-amber-800 border-amber-300 ${className}`}
      title={`This task has been reopened ${count > 1 ? count + ' times' : 'once'} - moved back to Pending status`}
      style={{
        fontSize: '12px',
        fontWeight: '600',
        borderRadius: '12px',
        padding: '2px 8px',
        background: '#fef3c7',
        color: '#92400e',
        border: '1px solid #f59e0b'
      }}
    >
      <RotateCcw className="h-3 w-3" style={{ width: '12px', height: '12px' }} />
      <span>{displayText}</span>
    </span>
  )
}