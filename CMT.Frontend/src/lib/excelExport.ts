import { secureAuthStore } from '@/lib/secure-auth-store'
import { getStoredTimezone } from '@/lib/timezone-context'
import { exportToExcel } from '@/utils/excelExport'

/**
 * Excel Export Utility for CMT Task Management (Active / All task tables)
 * ---------------------------------------------------------------------------
 * AMENDED — date/time, variance and additional reason columns
 *
 * PREVIOUS FIX (kept)
 *   The sheet is exported as a real .xlsx workbook through `exportToExcel`
 *   (the exact helper the Completed Tasks export uses), and every text cell is
 *   flattened with `sanitizeCellText` so embedded line breaks can no longer
 *   inflate the row height.
 *
 * THIS AMENDMENT
 *   1. "Target Date" and "Created At" now render BOTH date and time, using the
 *      same pattern as the Completed Tasks export
 *      (e.g. "01/Apr/2026, 2:26:52 PM"): day 2-digit, month short, year
 *      numeric, hour/minute/second with AM-PM, resolved in the user's
 *      configured timezone.
 *   2. "Variance (days)" is no longer a loose sentence such as "3 days".
 *      It follows the Completed Tasks export convention (`formatDays`):
 *      a plain number with two decimals, or "N/A" when it cannot be derived.
 *   3. Three new columns are exported with their data:
 *        - "Shop"            -> task shop name
 *        - "On Hold Reason"  -> reason captured on the task hold request
 *        - "Paused Reason"   -> reason captured when the task was paused
 * ---------------------------------------------------------------------------
 */

interface Task {
  task_id?: number;
  taskId?: number;
  id?: number;
  serial_number?: string;
  serialNumber?: string;
  part_number?: string;
  partNumber?: string;
  po_number?: string;
  poNumber?: string;
  description?: string;
  category_name?: string;
  categoryName?: string;
  status?: string;
  assigned_engineer?: string;
  assignedEngineer?: string;
  priority_level_name?: string;
  priority_name?: string;
  priorityName?: string;
  creator_name?: string;
  creatorName?: string;
  created_by_name?: string;
  target_completion_date?: string | null;
  targetCompletionDate?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  shop_name?: string | null;
  shopName?: string | null;
  on_hold_reason?: string | null;
  hold_reason?: string | null;
  is_paused?: boolean;
  paused_reason?: string | null;
  pausedReason?: string | null;
  is_duplicate?: boolean;
  isDuplicate?: boolean;
  duplicate_justification?: string;
  duplicateJustification?: string;
  is_reopened?: boolean;
  isReopened?: boolean;
  reopen_count?: number;
  reopenCount?: number;
  reopen_reason?: string;
  reopenReason?: string;
  amendment_request?: boolean;
  amendmentRequest?: boolean;
  amendment_status?: number | null;
  amendmentStatus?: number | null;
  comments?: string;
  [key: string]: any;
}

/**
 * Column order of the exported task sheet.
 *
 * "Shop" sits next to the ownership columns, while the two new reason columns
 * are grouped with the other reason/justification columns at the end.
 */
export const ACTIVE_TASK_EXPORT_COLUMNS = [
  'Task ID',
  'Serial Number',
  'Part Number',
  'PO Number',
  'Description',
  'Category',
  'Status',
  'Assigned Engineer',
  'Priority',
  'Created By',
  'Shop',
  'Target Date',
  'Created At',
  'Variance (days)',
  'Is Duplicate',
  'Duplicate Justification',
  'Is Reopened',
  'Reopen Reason',
  'On Hold Reason',
  'Paused Reason',
] as const;

/**
 * Hard cap for a single cell. Long paragraphs are the reason rows used to
 * explode vertically, so anything past this limit is trimmed.
 */
const MAX_CELL_LENGTH = 500;

/**
 * Normalize task field - handles multiple possible field name formats
 */
function getTaskField(task: Task, ...fieldNames: string[]): any {
  for (const fieldName of fieldNames) {
    if (task[fieldName] !== undefined && task[fieldName] !== null) {
      return task[fieldName];
    }
  }
  return null;
}

/**
 * Flatten a value into a single-line, whitespace-normalized cell.
 *
 * This is THE fix for the reported formatting issue: removing embedded line
 * breaks stops Excel from wrapping the cell and inflating the row height.
 */
export function sanitizeCellText(value: unknown, fallback: string = 'N/A'): string {
  if (value === null || value === undefined) return fallback;

  const text = String(value)
    // Hard line breaks typed by users -> single space
    .replace(/\r\n|\r|\n/g, ' ')
    // Tabs / vertical tabs / form feeds -> single space
    .replace(/[\t\v\f]/g, ' ')
    // Non-breaking spaces behave like text and widen columns -> plain space
    .replace(/\u00a0/g, ' ')
    // Collapse runs of whitespace left behind by the replacements above
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!text) return fallback;

  return text.length > MAX_CELL_LENGTH
    ? `${text.slice(0, MAX_CELL_LENGTH - 1)}…`
    : text;
}

/**
 * Format a timestamp as date **and** time, mirroring the Completed Tasks
 * export (`formatDateTimeForExport` on the Completed Tasks page).
 *
 * Example: "01/Apr/2026, 2:26:52 PM"
 *
 * The user's configured timezone (Settings → Timezone) is honoured, exactly as
 * the Completed Tasks workbook does, so both exports agree on the wall clock.
 */
export function formatDateTimeForExport(dateString?: string | null): string {
  if (!dateString) return 'N/A';

  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'N/A';

  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  };

  try {
    return date.toLocaleString('en-US', { ...options, timeZone: getStoredTimezone() });
  } catch {
    try {
      return date.toLocaleString('en-US', options);
    } catch {
      return 'N/A';
    }
  }
}

/**
 * Normalize status value
 */
function normalizeStatus(status: any): string {
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
      default: return 'Pending';
    }
  }

  return String(status);
}

/**
 * Variance in days between "Created At" and "Target Date".
 *
 * Formatted like the Completed Tasks export's `formatDays` helper: a plain
 * two-decimal number (no "day/days" suffix), or "N/A" when either endpoint is
 * missing or unparsable.
 */
function calculateVariance(createdAt: any, targetDate: any): string {
  if (!createdAt || !targetDate) return 'N/A';
  try {
    const createdDate = new Date(createdAt);
    const targetDateObj = new Date(targetDate);
    if (isNaN(createdDate.getTime()) || isNaN(targetDateObj.getTime())) return 'N/A';
    const diffMs = targetDateObj.getTime() - createdDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (!isFinite(diffDays)) return 'N/A';
    return diffDays.toFixed(2);
  } catch {
    return 'N/A';
  }
}

/** Resolve the shop name across every casing the API may return. */
function resolveShopName(task: Task): string | null {
  const direct = getTaskField(task, 'shop_name', 'shopName', 'ShopName', 'shop_name_display');
  if (direct && String(direct).trim() !== '') return String(direct);

  const nested = task.shop?.name ?? task.shop?.Name ?? task.Shop?.Name ?? task.Shop?.name ?? null;
  if (nested && String(nested).trim() !== '') return String(nested);

  return null;
}

/** Resolve the hold reason recorded on the task's hold request. */
function resolveOnHoldReason(task: Task): string | null {
  return getTaskField(
    task,
    'on_hold_reason', 'onHoldReason', 'OnHoldReason',
    'hold_reason', 'holdReason', 'HoldReason'
  );
}

/** Resolve the reason captured when the task was paused. */
function resolvePausedReason(task: Task): string | null {
  return getTaskField(task, 'paused_reason', 'pausedReason', 'PausedReason');
}

/**
 * Build one workbook row. Every text column goes through `sanitizeCellText`
 * so no cell can carry a line break into Excel.
 */
function buildTaskExportRow(task: Task): Record<string, unknown> {
  const taskId = getTaskField(task, 'task_id', 'taskId', 'TaskId', 'id');

  const description = getTaskField(task, 'description', 'Description');
  const categoryName = getTaskField(task, 'category_name', 'categoryName', 'CategoryName', 'category');
  const assignedEngineer = getTaskField(task, 'assigned_engineer', 'assignedEngineer', 'AssignedEngineer', 'assigned');
  const priority = getTaskField(task, 'priority_level_name', 'priority_name', 'priorityName', 'PriorityName', 'priority');
  const creatorName = getTaskField(task, 'creator_name', 'creatorName', 'CreatedByName', 'created_by_name', 'createdByName');
  const targetDate = getTaskField(task, 'target_completion_date', 'targetCompletionDate', 'TargetCompletionDate');
  const createdAt = getTaskField(task, 'created_at', 'createdAt', 'CreatedAt', 'TaskCreatedAt');
  const isDuplicate = getTaskField(task, 'is_duplicate', 'isDuplicate', 'IsDuplicate') || false;
  const isReopened = getTaskField(task, 'is_reopened', 'isReopened', 'IsReopened') || false;

  return {
    'Task ID': taskId ? `TC-${taskId}` : 'TC-undefined',
    'Serial Number': sanitizeCellText(getTaskField(task, 'serial_number', 'serialNumber', 'SerialNumber')),
    'Part Number': sanitizeCellText(getTaskField(task, 'part_number', 'partNumber', 'PartNumber')),
    'PO Number': sanitizeCellText(getTaskField(task, 'po_number', 'poNumber', 'PoNumber')),
    'Description': sanitizeCellText(description),
    'Category': sanitizeCellText(categoryName),
    'Status': sanitizeCellText(normalizeStatus(getTaskField(task, 'status', 'Status')), 'Pending'),
    'Assigned Engineer': sanitizeCellText(
      assignedEngineer ? String(assignedEngineer).replace(/,/g, ', ') : null,
      'Unassigned'
    ),
    'Priority': sanitizeCellText(priority),
    'Created By': sanitizeCellText(creatorName),
    'Shop': sanitizeCellText(resolveShopName(task)),
    // Date AND time, matching the Completed Tasks export.
    'Target Date': formatDateTimeForExport(targetDate),
    'Created At': formatDateTimeForExport(createdAt),
    // Two-decimal day count, matching the Completed Tasks export.
    'Variance (days)': calculateVariance(createdAt, targetDate),
    'Is Duplicate': isDuplicate ? 'Yes' : 'No',
    'Duplicate Justification': sanitizeCellText(
      getTaskField(task, 'duplicate_justification', 'duplicateJustification', 'DuplicateJustification')
    ),
    'Is Reopened': isReopened ? 'Yes' : 'No',
    'Reopen Reason': sanitizeCellText(getTaskField(task, 'reopen_reason', 'reopenReason', 'ReopenReason')),
    'On Hold Reason': sanitizeCellText(resolveOnHoldReason(task)),
    'Paused Reason': sanitizeCellText(resolvePausedReason(task)),
  };
}

/**
 * Build the full sheet payload (columns + rows) without downloading it.
 * Exposed for reuse / testing.
 */
export function buildTaskExportRows(tasks: Task[]): {
  columns: string[]
  rows: Array<Record<string, unknown>>
} {
  return {
    columns: [...ACTIVE_TASK_EXPORT_COLUMNS],
    rows: (tasks ?? []).map(buildTaskExportRow),
  };
}

/**
 * Export tasks to a real .xlsx workbook using the SAME helper (and therefore
 * the same column sizing) as the Completed Tasks export.
 */
export async function exportTasksToExcel(
  tasks: Task[],
  filename: string = 'tasks_export',
  sheetName: string = 'Tasks'
): Promise<void> {
  try {
    if (!tasks || tasks.length === 0) {
      throw new Error('No tasks to export');
    }

    const { columns, rows } = buildTaskExportRows(tasks);
    const datedFilename = `${filename}_${new Date().toISOString().split('T')[0]}`;

    // `exportToExcel` builds the worksheet, applies the shared auto-width
    // column sizing (capped at 40 chars) and triggers the download.
    exportToExcel(rows, datedFilename, sheetName, columns);
  } catch (error) {
    console.error('Failed to export tasks to Excel:', error);
    throw new Error('Failed to export tasks. Please try again.');
  }
}

/**
 * Normalize a single task object to ensure all fields are accessible
 */
function normalizeTaskObject(rawTask: any): Task {
  if (!rawTask) return {} as Task;

  const normalized: Task = {
    task_id: getTaskField(rawTask, 'task_id', 'taskId', 'id'),
    serial_number: getTaskField(rawTask, 'serial_number', 'serialNumber'),
    part_number: getTaskField(rawTask, 'part_number', 'partNumber'),
    po_number: getTaskField(rawTask, 'po_number', 'poNumber'),
    description: getTaskField(rawTask, 'description', 'Description'),
    category_name: getTaskField(rawTask, 'category_name', 'categoryName', 'CategoryName', 'category'),
    status: normalizeStatus(getTaskField(rawTask, 'status', 'Status')),
    assigned_engineer: getTaskField(rawTask, 'assigned_engineer', 'assignedEngineer', 'AssignedEngineer', 'assigned'),
    priority_level_name: getTaskField(rawTask, 'priority_level_name', 'priority_name', 'priorityName', 'PriorityName', 'priority'),
    creator_name: getTaskField(rawTask, 'creator_name', 'creatorName', 'CreatedByName', 'created_by_name', 'createdByName'),
    // Shop / On Hold / Paused data for the newly added export columns.
    shop_name: resolveShopName(rawTask),
    on_hold_reason: resolveOnHoldReason(rawTask),
    is_paused: Boolean(getTaskField(rawTask, 'is_paused', 'isPaused', 'IsPaused') || false),
    paused_reason: resolvePausedReason(rawTask),
    target_completion_date: getTaskField(rawTask, 'target_completion_date', 'targetCompletionDate', 'TargetCompletionDate'),
    created_at: getTaskField(rawTask, 'created_at', 'createdAt', 'CreatedAt', 'TaskCreatedAt'),
    updated_at: getTaskField(rawTask, 'updated_at', 'updatedAt', 'UpdatedAt', 'TaskUpdatedAt'),
    is_duplicate: getTaskField(rawTask, 'is_duplicate', 'isDuplicate', 'IsDuplicate') || false,
    duplicate_justification: getTaskField(rawTask, 'duplicate_justification', 'duplicateJustification', 'DuplicateJustification'),
    is_reopened: getTaskField(rawTask, 'is_reopened', 'isReopened', 'IsReopened') || false,
    reopen_count: getTaskField(rawTask, 'reopen_count', 'reopenCount', 'ReopenCount') || 0,
    reopen_reason: getTaskField(rawTask, 'reopen_reason', 'reopenReason', 'ReopenReason'),
    amendment_request: getTaskField(rawTask, 'amendment_request', 'amendmentRequest', 'AmendmentRequest') || false,
    amendment_status: getTaskField(rawTask, 'amendment_status', 'amendmentStatus', 'AmendmentStatus'),
    comments: getTaskField(rawTask, 'comments', 'Comments')
  };

  return normalized;
}

/**
 * Fetch the selected tasks and export them with the shared .xlsx formatting.
 */
export async function fetchAndExportTasks(
  taskIds: number[],
  filename: string = 'Active_tasks',
  sheetName: string = 'Active Tasks'
): Promise<void> {
  try {
    if (taskIds.length === 0) {
      throw new Error('No tasks selected for export');
    }

    // Fetch each task individually to ensure we get all selected tasks
    const taskPromises = taskIds.map(async (taskId) => {
      try {
        const response = await fetch(`/api/tasks/${taskId}`, {
          headers: {
            'Authorization': `Bearer ${secureAuthStore.getToken() || ''}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          console.warn(`Failed to fetch task ${taskId}: ${response.status}`);
          return null;
        }

        const data = await response.json();

        // Handle different response formats
        let taskData = data;
        if (data.task) {
          taskData = data.task;
        } else if (data.data) {
          taskData = data.data;
        } else if (Array.isArray(data) && data.length > 0) {
          taskData = data[0];
        }

        // Normalize the task object
        return normalizeTaskObject(taskData);
      } catch (error) {
        console.warn(`Error fetching task ${taskId}:`, error);
        return null;
      }
    });

    const taskResults = await Promise.all(taskPromises);

    // Filter out null results (failed fetches)
    const selectedTasks: Task[] = taskResults.filter((task): task is Task => task !== null && task.task_id !== undefined);

    if (selectedTasks.length === 0) {
      throw new Error('No tasks found to export. Please ensure the selected tasks exist.');
    }

    await exportTasksToExcel(selectedTasks, filename, sheetName);

  } catch (error) {
    console.error('Error fetching and exporting tasks:', error);
    throw error;
  }
}

/**
 * Export tasks that are ALREADY loaded in the table (no extra API calls).
 *
 * Used by the "Export All" action: the task list page already holds every row
 * it is displaying, so exporting them directly avoids firing hundreds of
 * per-task requests. Formatting is identical to the Completed Tasks workbook.
 */
export async function exportLoadedTasksToExcel(
  rawTasks: any[],
  filename: string = 'Active_tasks_All',
  sheetName: string = 'Active Tasks'
): Promise<void> {
  if (!rawTasks || rawTasks.length === 0) {
    throw new Error('No tasks to export');
  }

  const normalized = rawTasks
    .map(rawTask => normalizeTaskObject(rawTask))
    .filter(task => task.task_id !== undefined && task.task_id !== null);

  if (normalized.length === 0) {
    throw new Error('No tasks to export');
  }

  await exportTasksToExcel(normalized, filename, sheetName);
}