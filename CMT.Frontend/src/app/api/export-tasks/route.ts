import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/serverAuth'

// FIXED: Export Tasks API - Proper CSV and Excel Generation
export async function GET(req: NextRequest) {
  try {
    // Require authentication and proper role
    const user = await requireRole(req, ['team_leader', 'director', 'shop_tl', 'customer_personnel', 'manager', 'shop_manager'])
    
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') || 'all'
    const format = searchParams.get('format') || 'csv' // csv or xlsx
    
    // Get tasks from backend API
    const API_BASE = process.env.CMT_API_BASE_URL || 'http://localhost:5000/api'
    const token = req.headers.get('authorization')?.replace('Bearer ', '') || ''
    
    const tasksResponse = await fetch(`${API_BASE}/tasks`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!tasksResponse.ok) {
      throw new Error('Failed to fetch tasks from backend')
    }
    
    const tasksData = await tasksResponse.json()
    const tasks = Array.isArray(tasksData) ? tasksData : (tasksData.tasks || tasksData.data || [])
    
    // Filter tasks by status if specified
    const filteredTasks = status === 'all' ? tasks : tasks.filter((t: any) => {
      const taskStatus = String(t.status || '').toLowerCase()
      return taskStatus === status.toLowerCase()
    })
    
    // Determine user role for role-based variance and column visibility
    const userRole = (user as any)?.role ?? (user as any)?.roleDisplayName ?? ''
    const normalizedRole = String(userRole).trim().toLowerCase().replace(/[\s\-_]+/g, '_')
    
    if (format === 'xlsx') {
      // Generate Excel-compatible HTML
      const excelContent = generateExcelContent(filteredTasks, normalizedRole)
      const filename = `tasks_export_${status.toLowerCase() === 'all' ? 'all' : status}_${new Date().toISOString().slice(0,10)}.xlsx`
      
      return new NextResponse(excelContent, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      })
    } else {
      // Generate CSV content
      const csvContent = generateCSVContent(filteredTasks, normalizedRole)
      const filename = `tasks_export_${status.toLowerCase() === 'all' ? 'all' : status}_${new Date().toISOString().slice(0,10)}.csv`
      
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`
        }
      })
    }
    
  } catch (error) {
    console.error('Export Tasks API Error:', error)
    return NextResponse.json(
      { error: 'Failed to export tasks', details: String(error) },
      { status: 500 }
    )
  }
}

/**
 * Calculate variance between two dates. Returns a human-readable string.
 */
function calculateVarianceBetween(startDate: any, endDate: any): string {
  if (!startDate || !endDate) return ''
  try {
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return ''
    const diffMs = end.getTime() - start.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    if (diffDays === 0) {
      return `${diffHours} hour${diffHours !== 1 ? 's' : ''}`
    }
    return `${diffDays} day${diffDays !== 1 ? 's' : ''}, ${diffHours} hour${diffHours !== 1 ? 's' : ''}`
  } catch {
    return ''
  }
}

/**
 * Engineer variance: engineer_completed_at - created_at
 */
function calculateEngineerVariance(task: any): string {
  const createdAt = task.createdAt || task.created_at
  const engineerCompletedAt = task.engineerCompletedAt || task.engineer_completed_at
  return calculateVarianceBetween(createdAt, engineerCompletedAt)
}

/**
 * TL Approved variance: actual_completion_date - created_at
 */
function calculateTLApprovedVariance(task: any): string {
  const createdAt = task.createdAt || task.created_at
  const actualCompletionDate = task.actualCompletionDate || task.actual_completion_date
  return calculateVarianceBetween(createdAt, actualCompletionDate)
}

/**
 * Role-based variance calculation (single value, for engineer role):
 * - Engineers: variance = engineer_completed_at - created_at
 * - Team Leaders & Directors: variance = actual_completion_date - created_at
 */
function calculateVariance(task: any, userRole: string): string {
  if (userRole === 'engineer') {
    return calculateEngineerVariance(task)
  }
  // TL, Director, and all other roles use actual_completion_date
  return calculateTLApprovedVariance(task)
}

function generateCSVContent(tasks: any[], userRole: string = ''): string {
  const isTLorDirector = ['team_leader', 'director'].includes(userRole)
  
  const headers = isTLorDirector
    ? [
        'Task ID', 'Serial Number', 'Part Number', 'PO Number', 'Description',
        'Category', 'Status', 'Assigned Engineer', 'Priority', 'Created By',
        'Created Date', 'Target Date', 'Engineer Completed At', 'TL Approved At',
        'Engineer Variance', 'TL Approved Variance'
      ]
    : [
        'Task ID', 'Serial Number', 'Part Number', 'PO Number', 'Description',
        'Category', 'Status', 'Assigned Engineer', 'Priority', 'Created By',
        'Created Date', 'Target Date', 'Engineer Completed At',
        'Variance'
      ]
  
  const csvRows = [headers.join(',')]
  
  tasks.forEach(task => {
    const createdAt = task.createdAt || task.created_at
    const targetDate = task.targetCompletionDate || task.target_completion_date
    const engineerCompletedAt = task.engineerCompletedAt || task.engineer_completed_at
    const actualCompletionDate = task.actualCompletionDate || task.actual_completion_date
    
    const baseRow = [
      `TC-${task.taskId || task.task_id || task.id}`,
      escapeCsvField(task.serialNumber || task.serial_number || ''),
      escapeCsvField(task.partNumber || task.part_number || ''),
      escapeCsvField(task.poNumber || task.po_number || ''),
      escapeCsvField(task.description || ''),
      escapeCsvField(task.categoryName || task.category_name || task.category || ''),
      escapeCsvField(normalizeStatus(task.status)),
      escapeCsvField(task.assignedEngineer || task.assigned_engineer || 'Unassigned'),
      escapeCsvField(task.priorityName || task.priority_name || task.priority || ''),
      escapeCsvField(task.createdByName || task.created_by_name || task.creator || ''),
      formatDate(createdAt),
      formatDate(targetDate),
      formatDate(engineerCompletedAt),
    ]
    
    if (isTLorDirector) {
      // TL/Director: include TL Approved At + both variances
      baseRow.push(
        formatDate(actualCompletionDate),
        escapeCsvField(calculateEngineerVariance(task)),
        escapeCsvField(calculateTLApprovedVariance(task)),
      )
    } else {
      // Engineer: single variance (engineer_completed_at - created_at)
      baseRow.push(
        escapeCsvField(calculateEngineerVariance(task))
      )
    }
    
    csvRows.push(baseRow.join(','))
  })
  
  return csvRows.join('\n')
}

function generateExcelContent(tasks: any[], userRole: string = ''): string {
  const isTLorDirector = ['team_leader', 'director'].includes(userRole)
  
  // Generate HTML table that Excel can import properly
  let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
th { background-color: #f2f2f2; font-weight: bold; }
</style>
</head>
<body>
<table>
<thead>
<tr>
<th>Task ID</th>
<th>Serial Number</th>
<th>Part Number</th>
<th>PO Number</th>
<th>Description</th>
<th>Category</th>
<th>Status</th>
<th>Assigned Engineer</th>
<th>Priority</th>
<th>Created By</th>
<th>Created Date</th>
<th>Target Date</th>
<th>Engineer Completed At</th>
${isTLorDirector ? '<th>TL Approved At</th><th>Engineer Variance</th><th>TL Approved Variance</th>' : '<th>Variance</th>'}
</tr>
</thead>
<tbody>`

  tasks.forEach(task => {
    const createdAt = task.createdAt || task.created_at
    const targetDate = task.targetCompletionDate || task.target_completion_date
    const engineerCompletedAt = task.engineerCompletedAt || task.engineer_completed_at
    const actualCompletionDate = task.actualCompletionDate || task.actual_completion_date
    
    html += `
<tr>
<td>TC-${task.taskId || task.task_id || task.id}</td>
<td>${escapeHtml(task.serialNumber || task.serial_number || '')}</td>
<td>${escapeHtml(task.partNumber || task.part_number || '')}</td>
<td>${escapeHtml(task.poNumber || task.po_number || '')}</td>
<td>${escapeHtml(task.description || '')}</td>
<td>${escapeHtml(task.categoryName || task.category_name || task.category || '')}</td>
<td>${escapeHtml(normalizeStatus(task.status))}</td>
<td>${escapeHtml(task.assignedEngineer || task.assigned_engineer || 'Unassigned')}</td>
<td>${escapeHtml(task.priorityName || task.priority_name || task.priority || '')}</td>
<td>${escapeHtml(task.createdByName || task.created_by_name || task.creator || '')}</td>
<td>${formatDate(createdAt)}</td>
<td>${formatDate(targetDate)}</td>
<td>${formatDate(engineerCompletedAt)}</td>
${isTLorDirector ? `<td>${formatDate(actualCompletionDate)}</td><td>${escapeHtml(calculateEngineerVariance(task))}</td><td>${escapeHtml(calculateTLApprovedVariance(task))}</td>` : `<td>${escapeHtml(calculateEngineerVariance(task))}</td>`}
</tr>`
  })

  html += `
</tbody>
</table>
</body>
</html>`

  return html
}

function escapeCsvField(field: string): string {
  if (!field) return ''
  
  const stringField = String(field)
  if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
    return `"${stringField.replace(/"/g, '""')}"`
  }
  return stringField
}

function escapeHtml(text: string): string {
  if (!text) return ''
  
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function normalizeStatus(status: any): string {
  if (status === null || status === undefined) return 'Pending'
  
  if (typeof status === 'number') {
    switch (status) {
      case 0: return 'Pending'
      case 1: return 'In Progress'
      case 2: return 'Completed'
      case 3: return 'Blocked'
      case 4: return 'On Hold'
      case 5: return 'Rejected'
      case 6: return 'Cancelled'
      case 7: return 'Paused'
      default: return 'Pending'
    }
  }
  
  return String(status)
}

function formatDate(dateString: any): string {
  if (!dateString) return ''
  
  try {
    const date = new Date(dateString)
    return date.toISOString().split('T')[0] // YYYY-MM-DD format
  } catch {
    return ''
  }
}