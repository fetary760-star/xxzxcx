/**
 * Utility functions for normalizing and formatting task statuses and priorities
 */

/**
 * Normalize status to human-readable format
 * Handles various status formats from backend (enum values, strings, etc.)
 */
export function normalizeStatus(status: any): string {
  if (status === null || status === undefined) return 'Unknown';
  
  const statusStr = String(status).toLowerCase().trim();
  
  // Handle enum numeric values (matching C# TaskStatus enum)
  if (statusStr === '0') return 'Pending';
  if (statusStr === '1') return 'In Progress';
  if (statusStr === '2') return 'Completed';
  if (statusStr === '3') return 'Blocked';
  if (statusStr === '4') return 'On Hold';
  if (statusStr === '5') return 'Rejected';
  if (statusStr === '6') return 'Cancelled';
  if (statusStr === '7') return 'Paused';
  if (statusStr === '8') return 'Pending TL Approval';
  
  // Handle string values
  if (statusStr.includes('pendingtlapproval') || statusStr.includes('pending_tl_approval') || statusStr.includes('pending tl approval')) return 'Pending TL Approval';
  if (statusStr.includes('paused')) return 'Paused';
  if (statusStr.includes('pending')) return 'Pending';
  if (statusStr.includes('progress') || statusStr.includes('inprogress')) return 'In Progress';
  if (statusStr.includes('completed') || statusStr.includes('complete')) return 'Completed';
  if (statusStr.includes('blocked')) return 'Blocked';
  if (statusStr.includes('hold') || statusStr.includes('onhold')) return 'On Hold';
  if (statusStr.includes('rejected')) return 'Rejected';
  if (statusStr.includes('cancel')) return 'Cancelled';
  
  // Return original if no match (capitalize first letter)
  return status.toString().charAt(0).toUpperCase() + status.toString().slice(1);
}

/**
 * Normalize priority to standard format (High, Medium, Low)
 */
export function normalizePriority(priority: any): string {
  if (priority === null || priority === undefined) return 'Unknown';
  
  const priorityStr = String(priority).toLowerCase().trim();
  
  // Handle numeric values
  if (priorityStr === '1' || priorityStr === 'high') return 'High';
  if (priorityStr === '2' || priorityStr === 'medium' || priorityStr === 'med') return 'Medium';
  if (priorityStr === '3' || priorityStr === 'low') return 'Low';
  
  // Handle string values
  if (priorityStr.includes('high') || priorityStr.includes('urgent')) return 'High';
  if (priorityStr.includes('medium') || priorityStr.includes('normal')) return 'Medium';
  if (priorityStr.includes('low')) return 'Low';
  
  // Return original if no match (capitalize first letter)
  return priority.toString().charAt(0).toUpperCase() + priority.toString().slice(1);
}

/**
 * Split and normalize engineer names from comma-separated string
 */
export function splitAndNormalizeEngineers(engineerString: string): string[] {
  if (!engineerString || engineerString.trim() === '') return ['Unassigned'];
  
  return engineerString
    .split(',')
    .map(name => name.trim())
    .filter(name => name.length > 0)
    .map(name => name || 'Unassigned');
}

/**
 * Get status color class for badges
 */
export function getStatusColorClass(status: string): string {
  const normalized = normalizeStatus(status);
  
  switch (normalized) {
    case 'Completed':
      return 'bg-green-100 text-green-800 border-green-200';
    case 'In Progress':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'Pending':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'Blocked':
      return 'bg-red-100 text-red-800 border-red-200';
    case 'On Hold':
      return 'bg-orange-100 text-orange-800 border-orange-200';
    case 'Paused':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'Rejected':
      return 'bg-gray-100 text-gray-800 border-gray-200';
    case 'Pending TL Approval':
      return 'bg-violet-100 text-violet-800 border-violet-200';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200';
  }
}

/**
 * Get priority color class for badges
 */
export function getPriorityColorClass(priority: string): string {
  const normalized = normalizePriority(priority);
  
  switch (normalized) {
    case 'High':
      return 'bg-red-100 text-red-700';
    case 'Medium':
      return 'bg-yellow-100 text-yellow-700';
    case 'Low':
      return 'bg-green-100 text-green-700';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

/**
 * Format delay days into human-readable text
 */
export function formatDelayText(delayDays: number): string {
  if (delayDays === 0) return 'On Time';
  if (delayDays > 0) return `+${delayDays}d late`;
  return `${Math.abs(delayDays)}d early`;
}

/**
 * Get delay status category
 */
export function getDelayStatus(delayDays: number): 'On Time' | 'Early Delivery' | 'Late Delivery' {
  if (delayDays === 0) return 'On Time';
  if (delayDays < 0) return 'Early Delivery';
  return 'Late Delivery';
}

/**
 * Get delay color class
 */
export function getDelayColorClass(delayDays: number): string {
  if (delayDays === 0) return 'bg-gray-100 text-gray-700';
  if (delayDays < 0) return 'bg-green-100 text-green-700';
  return 'bg-red-100 text-red-700';
}