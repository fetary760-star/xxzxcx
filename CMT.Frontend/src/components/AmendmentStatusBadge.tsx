'use client'
import React from 'react'
import { CheckCircle, XCircle, Edit, ArrowRight, AlertCircle, RotateCcw, Clock } from 'lucide-react'

interface EnhancedAmendmentStatusBadgeProps {
  status: number | string | null | undefined
  requestType?: string
  reopenCount?: number
  className?: string
  showLabel?: boolean
  showTooltip?: boolean
}

/**
 * Enhanced Amendment Status Badge Component
 * Displays amendment request status with standardized icons and comprehensive status tracking
 * 
 * Standardized Icons:
 * ✏️ (Edit icon) - Amendment Requested
 * ✓ (CheckCircle) - Amendment Approved  
 * ✗ (XCircle) - Amendment Rejected
 * ↗️ (ArrowRight) - Forwarded to Director
 * ⚠️ (AlertCircle) - Various alert states
 * 🔄 (RotateCcw) - Reopened tasks
 * 🕐 (Clock) - Pending states
 */
export default function EnhancedAmendmentStatusBadge({ 
  status, 
  requestType = 'Amendment',
  reopenCount = 0,
  className = '', 
  showLabel = true,
  showTooltip = true
}: EnhancedAmendmentStatusBadgeProps) {
  
  if (status === null || status === undefined) {
    return null
  }

  // Normalize status to handle both enum values and string values
  const normalizeStatus = (status: number | string): string => {
    if (typeof status === 'number') {
      switch (status) {
        case 0: return 'Pending TL Review'
        case 1: return 'Forwarded to Director'
        case 2: return 'Approved'
        case 3: return 'Rejected'
        default: return 'Unknown'
      }
    }
    return String(status)
  }

  const normalizedStatus = normalizeStatus(status)

  // Enhanced status configuration with standardized icons
  const statusConfig: Record<string, {
    icon: any,
    label: string,
    shortLabel: string,
    bgColor: string,
    textColor: string,
    borderColor: string,
    description: string,
    priority: 'low' | 'medium' | 'high' | 'critical',
    iconSymbol: string
  }> = {
    'Pending TL Review': {
      icon: Edit,
      iconSymbol: '✏️',
      label: 'Amendment Requested',
      shortLabel: 'Requested',
      bgColor: '#fff2cc',
      textColor: '#ad8d2a',
      borderColor: '#f59e0b',
      description: 'Amendment request pending Team Leader review',
      priority: 'medium'
    },
    'Forwarded to Director': {
      icon: ArrowRight,
      iconSymbol: '↗️',
      label: 'Forwarded to Director',
      shortLabel: 'Forwarded',
      bgColor: '#dbeafe',
      textColor: '#1d4ed8',
      borderColor: '#3b82f6',
      description: 'Amendment request forwarded to Director for review',
      priority: 'high'
    },
    'Approved': {
      icon: CheckCircle,
      iconSymbol: '✓',
      label: 'Amendment Approved',
      shortLabel: 'Approved',
      bgColor: '#dcfce7',
      textColor: '#166534',
      borderColor: '#22c55e',
      description: 'Amendment request has been approved',
      priority: 'low'
    },
    'Rejected': {
      icon: XCircle,
      iconSymbol: '✗',
      label: 'Amendment Rejected',
      shortLabel: 'Rejected',
      bgColor: '#fee2e2',
      textColor: '#dc2626',
      borderColor: '#ef4444',
      description: 'Amendment request has been rejected',
      priority: 'low'
    },
    'Reopen': {
      icon: RotateCcw,
      iconSymbol: '🔄',
      label: 'Task Reopened',
      shortLabel: 'Reopened',
      bgColor: '#fef3c7',
      textColor: '#92400e',
      borderColor: '#f59e0b',
      description: 'Task has been reopened for additional work',
      priority: 'medium'
    },
    'Cancelled': {
      icon: AlertCircle,
      iconSymbol: '⚠️',
      label: 'Amendment Cancelled',
      shortLabel: 'Cancelled',
      bgColor: '#f3f4f6',
      textColor: '#6b7280',
      borderColor: '#9ca3af',
      description: 'Amendment request has been cancelled',
      priority: 'low'
    },
    'Pending': {
      icon: Clock,
      iconSymbol: '🕐',
      label: 'Pending Review',
      shortLabel: 'Pending',
      bgColor: '#fef3c7',
      textColor: '#92400e',
      borderColor: '#f59e0b',
      description: 'Request is pending review',
      priority: 'medium'
    }
  }

  // Handle special cases for reopen actions
  const effectiveStatus = requestType === 'Reopen' ? 'Reopen' : normalizedStatus
  const config = statusConfig[effectiveStatus] || statusConfig['Pending']
  
  const Icon = config.icon
  const displayLabel = showLabel ? config.label : config.shortLabel

  // Add reopen count to label if applicable
  const finalLabel = requestType === 'Reopen' && reopenCount > 0 
    ? `${displayLabel} (${reopenCount}x)`
    : displayLabel

  const badgeElement = (
    <span 
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all duration-200 hover:shadow-sm ${className}`}
      style={{
        fontSize: '12px',
        fontWeight: '600',
        borderRadius: '12px',
        padding: '2px 8px',
        background: config.bgColor,
        color: config.textColor,
        border: `1px solid ${config.borderColor}`,
        cursor: showTooltip ? 'help' : 'default'
      }}
      title={showTooltip ? `${config.iconSymbol} ${config.description}` : undefined}
    >
      <Icon className="h-3 w-3 flex-shrink-0" style={{ width: '12px', height: '12px' }} />
      {showLabel && <span className="truncate max-w-24">{finalLabel}</span>}
    </span>
  )

  return badgeElement
}

/**
 * Helper function to get amendment status text based on database enum or string
 */
export function getEnhancedAmendmentStatusText(status: number | string | null | undefined): string {
  if (status === null || status === undefined) {
    return 'No Amendment'
  }

  if (typeof status === 'number') {
    const statusMap = {
      0: 'Amendment Requested ✏️',
      1: 'Forwarded to Director ↗️', 
      2: 'Amendment Approved ✓',
      3: 'Amendment Rejected ✗'
    }
    return statusMap[status as keyof typeof statusMap] || 'Unknown Status'
  }

  // Add icons to string statuses
  const statusWithIcons: Record<string, string> = {
    'Pending TL Review': 'Amendment Requested ✏️',
    'Forwarded to Director': 'Forwarded to Director ↗️',
    'Approved': 'Amendment Approved ✓',
    'Rejected': 'Amendment Rejected ✗',
    'Reopen': 'Task Reopened 🔄',
    'Cancelled': 'Amendment Cancelled ⚠️',
    'Pending': 'Pending Review 🕐'
  }

  return statusWithIcons[String(status)] || String(status)
}

/**
 * Helper function to check if amendment is pending
 */
export function isEnhancedAmendmentPending(status: number | string | null | undefined): boolean {
  if (typeof status === 'number') {
    return status === 0 || status === 1
  }
  if (typeof status === 'string') {
    return status === 'Pending TL Review' || status === 'Forwarded to Director'
  }
  return false
}

/**
 * Helper function to check if amendment is resolved
 */
export function isEnhancedAmendmentResolved(status: number | string | null | undefined): boolean {
  if (typeof status === 'number') {
    return status === 2 || status === 3
  }
  if (typeof status === 'string') {
    return status === 'Approved' || status === 'Rejected'
  }
  return false
}

/**
 * Helper function to get status priority level
 */
export function getAmendmentStatusPriority(status: number | string | null | undefined): 'low' | 'medium' | 'high' | 'critical' {
  if (status === null || status === undefined) return 'low'
  
  if (typeof status === 'number') {
    switch (status) {
      case 1: return 'high' // Forwarded to Director
      case 0: return 'medium' // Pending TL Review
      default: return 'low'
    }
  }
  
  if (typeof status === 'string') {
    switch (status) {
      case 'Forwarded to Director': return 'high'
      case 'Pending TL Review': return 'medium'
      case 'Reopen': return 'medium'
      default: return 'low'
    }
  }
  
  return 'low'
}

/**
 * Helper function to get standardized icon symbol for status
 */
export function getAmendmentStatusIcon(status: number | string | null | undefined): string {
  if (status === null || status === undefined) return ''
  
  if (typeof status === 'number') {
    const iconMap = {
      0: '✏️', // Amendment Requested
      1: '↗️', // Forwarded to Director
      2: '✓',  // Amendment Approved
      3: '✗'   // Amendment Rejected
    }
    return iconMap[status as keyof typeof iconMap] || '❓'
  }
  
  const statusIconMap: Record<string, string> = {
    'Pending TL Review': '✏️',
    'Forwarded to Director': '↗️',
    'Approved': '✓',
    'Rejected': '✗',
    'Reopen': '🔄',
    'Cancelled': '⚠️',
    'Pending': '🕐'
  }
  
  return statusIconMap[String(status)] || '❓'
}

/**
 * Compact version for use in tables or tight spaces
 */
export function CompactAmendmentStatusBadge({ 
  status, 
  requestType, 
  reopenCount,
  className = '' 
}: EnhancedAmendmentStatusBadgeProps) {
  return (
    <EnhancedAmendmentStatusBadge 
      status={status}
      requestType={requestType}
      reopenCount={reopenCount}
      className={className}
      showLabel={false}
      showTooltip={true}
    />
  )
}

/**
 * Icon-only version showing just the standardized icon symbol
 */
export function IconOnlyAmendmentStatus({ 
  status,
  className = '',
  size = 'md'
}: {
  status: number | string | null | undefined,
  className?: string,
  size?: 'sm' | 'md' | 'lg'
}) {
  const icon = getAmendmentStatusIcon(status)
  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base', 
    lg: 'text-lg'
  }
  
  if (!icon) return null
  
  return (
    <span 
      className={`${sizeClasses[size]} ${className}`}
      title={getEnhancedAmendmentStatusText(status)}
    >
      {icon}
    </span>
  )
}