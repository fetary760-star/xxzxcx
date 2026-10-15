'use client';

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Eye, Edit, Trash2, AlertTriangle, Paperclip, Download, Filter, Copy, FileEdit, ArrowUpDown, ArrowUp, ArrowDown, Pause, Play, CheckCircle, XCircle, UserX, X, CalendarClock, AlertOctagon } from 'lucide-react';
import BulkActions from '@/components/TaskManagement/BulkActions';
import apiClient from '@/lib/api';
import AttachmentsModal from './AttachmentsModal';
import UpdateTaskModal from './UpdateTaskModal';
import TaskDetailsModal from '@/components/TaskDetailsModal';
import ReopenedTaskBadge from './ReopenedTaskBadge';
import AmendmentStatusBadge from './AmendmentStatusBadge';
import TaskStatusIcons, { CompactTaskStatusIcons } from './TaskStatusIcons';
import AmendmentFilters, { matchesAmendmentFilter } from './AmendmentFilters';
import AlertDetailsModal from './AlertDetailsModal';
import { useAuth } from '@/lib/auth-context';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { fetchAndExportTasks, exportLoadedTasksToExcel } from '@/lib/excelExport';

// Task type (matching fields used in database schema)
type Task = {
  task_id: number;
  completed_task_id?: number;
  serial_number?: string;
  part_number?: string;
  po_number?: string;
  description?: string;
  category_id?: number;
  category_name?: string;
  status?: string;
  assigned_engineer?: string;
  priority_id?: number;
  priority_level_name?: string;
  priority_name?: string;
  created_by?: number;
  creator_name?: string;
  target_completion_date?: string | null;
  created_at?: string | null;
  attachment_path?: string | null;
  attachments_count?: number;
  is_duplicate?: boolean;
  duplicate_justification?: string;
  show_revision_alert?: boolean;
  is_reopened?: boolean;
  reopen_count?: number;
  reopen_reason?: string;
  reopened_at?: string | null;
  reopened_by?: number;
  amendment_request?: boolean;
  amendment_status?: number | null;
  amendment_reviewed_by_tl_id?: number | null;
  amendment_reviewed_by_director_id?: number | null;
  final_status?: string;
  is_archived?: boolean;
  shop_id?: number | null;
  shop_name?: string | null;
  comments?: string;
  // BUG FIX: status_changed_at for overdue synchronization with pause/hold timestamps
  status_changed_at?: string | null;
  statusChangedAt?: string | null;
  StatusChangedAt?: string | null;
  // NEW: Task Assigned At — timestamp when an engineer was first assigned to
  // this task (via UpdateTaskModal). Sourced from TaskDto.AssignedAt.
  // Passed through to TaskDetails so the Timeline section can display it.
  task_assigned_at?: string | null;
  taskAssignedAt?: string | null;
  TaskAssignedAt?: string | null;
  _uniqueKey?: string;
  [k: string]: any;
};

interface TaskTableProps {
  tasks?: Task[];
  showCompleted?: boolean;
  userRole?: string;
}

type SortField = 'task_id' | 'serial_number' | 'part_number' | 'description' | 'po_number' | 'category_name' | 'status' | 'assigned_engineer' | 'priority' | 'creator_name' | 'target_completion_date' | 'created_at' | 'attachments_count' | 'shop_name';
type SortDirection = 'asc' | 'desc' | null;

interface SortConfig {
  field: SortField | null;
  direction: SortDirection;
}

import { useTimezone } from '@/lib/timezone-context';

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
      case 8: return 'Pending TL Approval';
      default: return 'Pending';
    }
  }
  
  const statusStr = String(status).toLowerCase().replace(/[_\s-]+/g, '');
  switch (statusStr) {
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

function normalizeRole(raw: any): string {
  if (!raw && raw !== 0) return ''
  if (typeof raw === 'number') {
    const map: Record<string, string> = { 0: 'team_leader', 1: 'director', 2: 'engineer', 3: 'customer', 4: 'customer_personnel', 5: 'shop_tl', 6: 'manager', 7: 'admin', 8: 'shop_manager' }
    return map[String(raw)] ?? String(raw)
  }
  return String(raw).trim().toLowerCase().replace(/[\s\-_]+/g, '_')
}

function normalizeDuplicateField(task: any): boolean {
  const duplicateFields = [
    task.is_duplicate,
    task.isDuplicate, 
    task.IsDuplicate,
    task.duplicate,
    task.Duplicate,
    task.is_Duplicate,
    task.Is_Duplicate
  ];
  
  const result = duplicateFields.some(field => 
    field === true || 
    field === 'true' || 
    field === 1 || 
    field === '1' ||
    (typeof field === 'string' && field.toLowerCase() === 'true')
  );
  
  return result;
}

let keyCounter = 0;
function generateUniqueTaskKey(task: Task, index: number): string {
  keyCounter++;
  
  const taskId = task.task_id || task.id || task.taskId;
  const timestamp = Date.now();
  
  if (taskId && taskId > 0) {
    return `task-${taskId}-${keyCounter}`;
  }
  
  const fallbackKey = [
    task.serial_number || '',
    task.part_number || '',
    task.description?.slice(0, 10) || '',
    index,
    timestamp,
    keyCounter
  ].join('-').replace(/[^a-zA-Z0-9-]/g, '');
  
  return `task-fallback-${fallbackKey}`;
}

/**
 * FIXED: Download file using Data URI approach to avoid blob URL mixed content warnings
 * This method converts the blob to a base64 data URI which doesn't trigger security warnings
 */
async function downloadFileWithDataUri(blob: Blob, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        const dataUri = reader.result as string;
        const link = document.createElement('a');
        link.href = dataUri;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(blob);
  });
}

export default function TaskTable({ tasks: propTasks, showCompleted = false, userRole = '' }: TaskTableProps): JSX.Element {
  const { user } = useAuth();
  const { formatDateCustom } = useTimezone();
  const formatDate = (dateString?: string | null): string => {
    if (!dateString) return 'N/A';
    try {
      const formatted = formatDateCustom(dateString, { day: '2-digit', month: 'short', year: 'numeric' });
      if (!formatted || formatted === '—') return 'N/A';
      // Convert "Jan 01, 2026" format to "01/Jan/2026"
      const parts = formatted.replace(',', '').split(' ');
      if (parts.length === 3) {
        const [month, day, year] = parts;
        return `${day.padStart(2, '0')}/${month}/${year}`;
      }
      return formatted;
    } catch {
      return 'N/A';
    }
  };
  const [tasks, setTasks] = useState<Task[]>(propTasks || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'priority_desc'|'priority_asc'|'newest'|'oldest'>('priority_desc');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const [sortConfig, setSortConfig] = useState<SortConfig>({ field: null, direction: null });

  const [amendmentStatusFilter, setAmendmentStatusFilter] = useState<string | null>(null);
  const [reopenedFilter, setReopenedFilter] = useState(false);
  const [showAmendmentFilters, setShowAmendmentFilters] = useState(false);

  // Unassigned tasks filter — driven by sidebar "Unassigned Tasks" nav link (?filter=unassigned)
  const [unassignedFilter, setUnassignedFilter] = useState<boolean>(false);

  // Due date filter — driven by sidebar "Due Soon" / "Overdue" filter buttons
  const [dueFilter, setDueFilter] = useState<string | null>(null);

  const [selectedTasks, setSelectedTasks] = useState<number[]>([]);
  const [attachmentsOpenFor, setAttachmentsOpenFor] = useState<number | null>(null);
  const [updateOpenFor, setUpdateOpenFor] = useState<number | null>(null);
  const [currentUpdateInitial, setCurrentUpdateInitial] = useState<any>(null);
  const [detailsOpenFor, setDetailsOpenFor] = useState<number | null>(null);
  const [detailsTaskData, setDetailsTaskData] = useState<Task | null>(null);
  const [downloadingAttachment, setDownloadingAttachment] = useState<number | null>(null);

  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [selectedAlertType, setSelectedAlertType] = useState<'revision' | 'reopened' | 'duplicate' | 'amendment' | null>(null);
  const [selectedAlertTask, setSelectedAlertTask] = useState<Task | null>(null);

  // Field dialog states (same pattern as completed tasks page)
  const [fieldDialogOpen, setFieldDialogOpen] = useState(false);
  const [fieldDialogData, setFieldDialogData] = useState<{ field: string; value: string; taskId: number } | null>(null);
  const [fieldExpanded, setFieldExpanded] = useState(false);

  // SECURITY FIX: Use in-memory useState only (no localStorage persistence)
  // to avoid persistent browser storage exposure. This UI preference is
  // non-sensitive, but the security audit requires removing ALL
  // persistent localStorage writes from the app.
  const [showDuplicates, setShowDuplicates] = useState<boolean>(false);

  // SECURITY: One-time cleanup of any legacy localStorage entry from previous
  // app versions. This ensures the audit finding is fully remediated for
  // existing users on next load.
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('tasks_show_duplicates');
      }
    } catch {}
  }, []);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const topScrollbarRef = useRef<HTMLDivElement | null>(null);
  const topScrollbarInnerRef = useRef<HTMLDivElement | null>(null);


  const currentUserRole = normalizeRole(user?.role ?? user?.role_name ?? user?.roleName ?? '');

  // Use the admin-configured role permissions matrix instead of hardcoded role checks
  const { canDeleteTask, canViewAnalytics } = useRolePermissions();
  const canDeleteTasks = canDeleteTask;
 
  const canSeeAlerts = ['engineer', 'team_leader', 'director', 'admin', 'manager', 'shop_tl', 'shop_manager'].includes(currentUserRole);

  useEffect(() => {
    if (propTasks) {
      keyCounter = 0;
      const tasksWithKeys = propTasks.map((task, index) => ({
        ...task,
        // FIXED: Normalize status when receiving propTasks so filtering works correctly
        // Without this, raw numeric statuses (0, 1, 3, 4, 5) won't match human-readable filter values
        status: normalizeStatus(task.status ?? (task as any).Status ?? (task as any).taskStatus ?? 0),
        _uniqueKey: generateUniqueTaskKey(task, index)
      }));
      // Filter out "Pending TL Approval" tasks from the main dashboard view for ALL users.
      // These tasks are only visible on the dedicated Pending TL Approvals page.
      const filtered = showCompleted
        ? tasksWithKeys
        : tasksWithKeys.filter(t => t.status !== 'Pending TL Approval');
      setTasks(filtered);
    }
  }, [propTasks, showCompleted, user]);

  const loadTasks = useCallback(async () => {
    if (propTasks) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      
      if (amendmentStatusFilter) {
        params.append('amendmentStatusFilter', amendmentStatusFilter);
      }
      if (reopenedFilter) {
        params.append('reopenedFilter', 'true');
      }
      
      if (statusFilter && statusFilter !== 'all') {
        params.append('status', statusFilter);
      }
      
      const queryString = params.toString();
      const endpoint = queryString ? `/tasks?${queryString}` : '/tasks';
      
      // FIX: Use apiClient which properly handles Authorization headers and CSRF tokens
      const data = await apiClient.get(endpoint);
      if (!data) {
        setTasks([]);
        return;
      }
      const list: any[] = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : (Array.isArray(data?.tasks) ? data.tasks : []));
      
      keyCounter = 0;
      
      const normalized = list.map((t: any, index: number) => {
        const rawStatus = t.status ?? t.Status ?? t.taskStatus ?? 0;
        const normalizedStatus = normalizeStatus(rawStatus);
        
        const attachmentPath = t.attachment_path ?? t.attachmentPath ?? t.AttachmentPath ?? t.attachment ?? null;
        let attachmentsCount = t.attachments_count ?? t.attachmentsCount ?? t.AttachmentsCount ?? 0;
        
        if (attachmentsCount === 0 && attachmentPath && attachmentPath.trim() !== '' && attachmentPath !== 'null') {
          attachmentsCount = 1;
        }
        
        if (Array.isArray(t.attachments) && t.attachments.length > 0) {
          attachmentsCount = Math.max(attachmentsCount, t.attachments.length);
        } else if (Array.isArray(t.Attachments) && t.Attachments.length > 0) {
          attachmentsCount = Math.max(attachmentsCount, t.Attachments.length);
        }
        
        const isReopenedFromDB = Boolean(t.is_reopened ?? t.isReopened ?? t.IsReopened ?? false);
        const isReopenedFromComments = Boolean(t.comments?.includes('[REOPENED by') || t.Comments?.includes('[REOPENED by'));
        const isReopened = isReopenedFromDB || isReopenedFromComments;
        
        const reopenCount = Number(t.reopen_count ?? t.reopenCount ?? t.ReopenCount ?? 0);
        const reopenReason = t.reopen_reason ?? t.reopenReason ?? t.ReopenReason ?? null;
        const reopenedAt = t.reopened_at ?? t.reopenedAt ?? t.ReopenedAt ?? null;
        const reopenedBy = t.reopened_by ?? t.reopenedBy ?? t.ReopenedBy ?? null;
        
        const amendmentRequest = Boolean(t.amendment_request ?? t.amendmentRequest ?? t.AmendmentRequest ?? false);
        const amendmentStatus = t.amendment_status ?? t.amendmentStatus ?? t.AmendmentStatus ?? null;
        const amendmentReviewedBy = t.amendment_reviewed_by_tl_id ?? t.amendmentReviewedByTlId ?? t.AmendmentReviewedByTlId ?? null;
        const amendmentReviewedByDirector = t.amendment_reviewed_by_director_id ?? t.amendmentReviewedByDirectorId ?? t.AmendmentReviewedByDirectorId ?? null;
        const finalStatus = t.final_status ?? t.finalStatus ?? t.FinalStatus ?? null;
        
        const isDuplicate = normalizeDuplicateField(t);
        const duplicateJustification = t.duplicate_justification ?? t.duplicateJustification ?? t.DuplicateJustification ?? null;
        
        const isArchived = Boolean(t.is_archived ?? t.isArchived ?? t.IsArchived ?? false);

        let extractedShopName = null;
        if (t.ShopName && String(t.ShopName).trim() !== '') {
          extractedShopName = t.ShopName;
        } else if (t.shopName && String(t.shopName).trim() !== '') {
          extractedShopName = t.shopName;
        } else if (t.shop_name && String(t.shop_name).trim() !== '') {
          extractedShopName = t.shop_name;
        } else if (t.shop?.name && String(t.shop.name).trim() !== '') {
          extractedShopName = t.shop.name;
        } else if (t.Shop?.Name && String(t.Shop.Name).trim() !== '') {
          extractedShopName = t.Shop.Name;
        }
        
        const extractedShopId = t.shop_id ?? t.shopId ?? t.ShopId ?? t.shop?.id ?? t.Shop?.Id ?? null;
        
        const completedTaskId = t.completed_task_id ?? t.completedTaskId ?? t.CompletedTaskId ?? null;
        
        const normalizedTask: Task = {
          task_id: Number(t.task_id ?? t.id ?? t.taskId ?? t.TaskId ?? 0),
          completed_task_id: completedTaskId,
          serial_number: t.serial_number ?? t.serialNumber ?? t.SerialNumber ?? '',
          part_number: t.part_number ?? t.partNumber ?? t.PartNumber ?? t.part ?? '',
          po_number: t.po_number ?? t.poNumber ?? t.PoNumber ?? t.po ?? '',
          description: t.description ?? t.details ?? t.Description ?? '',
          category_id: t.category_id ?? t.categoryId ?? t.CategoryId ?? undefined,
          category_name: t.category_name ?? t.category ?? t.categoryName ?? t.CategoryName ?? '',
          status: normalizedStatus,
          assigned_engineer: t.assigned_engineer ?? t.assigned ?? t.assignedEngineer ?? t.AssignedEngineer ?? '',
          priority_id: t.priority_id ?? t.priorityId ?? t.PriorityId ?? undefined,
          priority_level_name: t.priority_level_name ?? t.priority_name ?? t.priorityName ?? t.PriorityName ?? t.priority ?? '',
          priority_name: t.priority_name ?? t.priorityName ?? t.PriorityName ?? t.priority_level_name ?? t.priority ?? '',
          created_by: t.created_by ?? t.createdBy ?? t.CreatedBy ?? null,
          creator_name: t.creator_name ?? t.created_by_name ?? t.createdByName ?? t.CreatedByName ?? t.creator ?? '',
          target_completion_date: t.target_completion_date ?? t.targetCompletionDate ?? t.TargetCompletionDate ?? null,
          created_at: t.created_at ?? t.createdAt ?? t.CreatedAt ?? null,
          attachment_path: attachmentPath,
          attachments_count: attachmentsCount,
          is_duplicate: isDuplicate,
          duplicate_justification: duplicateJustification,
          show_revision_alert: !!(t.show_revision_alert ?? t.showRevisionAlert ?? t.ShowRevisionAlert),
          is_reopened: isReopened,
          reopen_count: reopenCount > 0 ? reopenCount : (isReopenedFromComments ? 1 : 0),
          reopen_reason: reopenReason,
          reopened_at: reopenedAt,
          reopened_by: reopenedBy,
          amendment_request: amendmentRequest,
          amendment_status: amendmentStatus,
          amendment_reviewed_by_tl_id: amendmentReviewedBy,
          amendment_reviewed_by_director_id: amendmentReviewedByDirector,
          final_status: finalStatus,
          is_archived: isArchived,
          shop_id: extractedShopId,
          shop_name: extractedShopName,
          comments: t.comments ?? t.Comments ?? '',
          // BUG FIX: Capture status_changed_at for overdue calculations in dueIndicator
          status_changed_at: t.status_changed_at ?? t.statusChangedAt ?? t.StatusChangedAt ?? null,
          // NEW: Capture Task Assigned At so TaskDetails Timeline can display it
          // when this task object is forwarded via TaskDetailsModal.
          // Source: TaskDto.AssignedAt (set by TaskController on first engineer assignment).
          task_assigned_at: t.task_assigned_at ?? t.taskAssignedAt ?? t.TaskAssignedAt ?? t.assigned_at ?? t.assignedAt ?? t.AssignedAt ?? null,
          _uniqueKey: generateUniqueTaskKey({ task_id: Number(t.task_id ?? t.id ?? t.taskId ?? t.TaskId ?? 0) } as Task, index)
        };
        
        return normalizedTask;
      }) as Task[];

      const filtered = (amendmentStatusFilter || reopenedFilter)
        ? normalized.filter(t => !t.is_archived)
        : (showCompleted 
            ? normalized.filter(t => t.status === 'Completed' && !t.is_archived)
            : normalized.filter(t => {
                if (t.is_archived) return false;
                if (t.status === 'Completed') return false;
                // Filter out "Pending TL Approval" tasks from the main dashboard for ALL users.
                // These tasks are only visible on the dedicated Pending TL Approvals page.
                if (t.status === 'Pending TL Approval') return false;
                // Show ALL other statuses including Rejected, Cancelled, Paused
                return true;
              }));
      
      setTasks(filtered);
    } catch (err: any) {
      // Friendly UI message for network/server problems. Keep full technical details out of the console in production.
      const isNetworkError = err?.message?.toLowerCase?.().includes('failed to fetch') || err instanceof TypeError;
      const status = err?.status ? Number(err.status) : undefined;
      const userMessage = isNetworkError || (status && status >= 500)
        ? 'Cannot reach the server. Please try again later.'
        : 'Failed to load tasks. Please try again.';
      setError(userMessage);

      if (process.env.NODE_ENV === 'development') {
        // show full details only in dev environment
        console.debug('Frontend TaskTable - Error loading tasks (debug):', err);
      }
    } finally {
      setLoading(false);
    }
  }, [propTasks, showCompleted, amendmentStatusFilter, reopenedFilter, statusFilter, user]);

  useEffect(() => { 
    if (!propTasks) {
      void loadTasks(); 
    }
  }, [loadTasks, propTasks]);

  useEffect(() => {
    function onRefresh() { void loadTasks(); }
    window.addEventListener('tasks:refresh', onRefresh);
    return () => { window.removeEventListener('tasks:refresh', onRefresh); };
  }, [loadTasks]);

  useEffect(() => {
    function onFilters(e: Event) {
      const detail = (e as CustomEvent)?.detail || {};
      if (typeof detail.searchQuery === 'string') setSearchQuery(detail.searchQuery);
      if (typeof detail.statusFilter === 'string') setStatusFilter(detail.statusFilter);
      if (typeof detail.sortBy === 'string') setSortBy(detail.sortBy as any);
      if (typeof detail.showDuplicates === 'boolean') setShowDuplicates(detail.showDuplicates);
      if (typeof detail.priorityFilter === 'string') setPriorityFilter(detail.priorityFilter);
      if (typeof detail.categoryFilter === 'string') setCategoryFilter(detail.categoryFilter);
      if (typeof detail.unassignedFilter === 'boolean') setUnassignedFilter(detail.unassignedFilter);
      setPage(1);
      if (detail.focusSearch) searchInputRef.current?.focus();
    }
    window.addEventListener('tasks:filters', onFilters as EventListener);
    return () => window.removeEventListener('tasks:filters', onFilters as EventListener);
  }, []);

  // Listen for sidebar status filter clicks
  useEffect(() => {
    function onSidebarStatusFilter(e: Event) {
      const detail = (e as CustomEvent)?.detail || {};
      if (typeof detail.statusFilter === 'string') {
        setStatusFilter(detail.statusFilter);
        setPage(1);
      }
    }
    window.addEventListener('sidebar:status-filter', onSidebarStatusFilter as EventListener);
    return () => window.removeEventListener('sidebar:status-filter', onSidebarStatusFilter as EventListener);
  }, []);

  // Listen for sidebar due filter clicks
  useEffect(() => {
    function onSidebarDueFilter(e: Event) {
      const detail = (e as CustomEvent)?.detail || {};
      if (typeof detail.dueFilter === 'string') {
        setDueFilter(detail.dueFilter === 'all' ? null : detail.dueFilter);
        // Clear status filter when due filter is activated
        if (detail.dueFilter !== 'all') setStatusFilter('all');
        setPage(1);
      }
    }
    window.addEventListener('sidebar:due-filter', onSidebarDueFilter as EventListener);
    return () => window.removeEventListener('sidebar:due-filter', onSidebarDueFilter as EventListener);
  }, []);

  // Sync Unassigned filter from the URL query (?filter=unassigned) — driven by sidebar link.
  // FIX (Bug #2): Also watch window.location.search changes at regular intervals to detect
  // client-side navigation triggered by router.push(). When Next.js router.push() is called
  // with a different query string but same pathname, it updates the URL but neither
  // popstate nor any other event fires. We poll the URL to catch this case so the
  // "Unassigned Tasks" sidebar link works immediately on first click.
  useEffect(() => {
    let lastSearch = typeof window !== 'undefined' ? window.location.search : '';

    const syncFromUrl = () => {
      if (typeof window === 'undefined') return;
      try {
        const params = new URLSearchParams(window.location.search);
        const filter = params.get('filter');
        setUnassignedFilter(filter === 'unassigned');
        // Reset to page 1 when the filter is toggled via URL
        setPage(1);
      } catch {
        // noop
      }
    };

    // Initial sync
    syncFromUrl();

    // Poll URL for changes to catch Next.js router.push navigation within the same pathname
    const urlPollInterval = setInterval(() => {
      if (typeof window === 'undefined') return;
      const currentSearch = window.location.search;
      if (currentSearch !== lastSearch) {
        lastSearch = currentSearch;
        syncFromUrl();
      }
    }, 150);

    window.addEventListener('popstate', syncFromUrl);
    // Also listen to custom events that the app can dispatch on client-side nav
    window.addEventListener('url:changed', syncFromUrl as EventListener);
    window.addEventListener('sidebar:navigate', syncFromUrl as EventListener);

    return () => {
      clearInterval(urlPollInterval);
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('url:changed', syncFromUrl as EventListener);
      window.removeEventListener('sidebar:navigate', syncFromUrl as EventListener);
    };
  }, []);

  const clearUnassignedFilter = useCallback(() => {
    setUnassignedFilter(false);
    setPage(1);
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('filter');
        window.history.replaceState({}, '', url.toString());
        // Notify any listeners that the URL changed
        window.dispatchEvent(new CustomEvent('url:changed'));
      } catch {
        // noop
      }
    }
  }, []);

  const handleSort = (field: SortField) => {
    setSortConfig(prev => {
      if (prev.field === field) {
        if (prev.direction === 'asc') {
          return { field, direction: 'desc' };
        } else if (prev.direction === 'desc') {
          return { field: null, direction: null };
        }
      }
      return { field, direction: 'asc' };
    });
    setPage(1);
  };

  const getSortIcon = (field: SortField) => {
    if (sortConfig.field !== field) {
      return <ArrowUpDown className="h-4 w-4 ml-1 opacity-40" />;
    }
    if (sortConfig.direction === 'asc') {
      return <ArrowUp className="h-4 w-4 ml-1 text-blue-600" />;
    }
    if (sortConfig.direction === 'desc') {
      return <ArrowDown className="h-4 w-4 ml-1 text-blue-600" />;
    }
    return <ArrowUpDown className="h-4 w-4 ml-1 opacity-40" />;
  };

  const filteredSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = tasks.filter(t => {
      // FIXED: When showDuplicates is OFF (default), hide duplicate tasks.
      // When showDuplicates is ON, show all tasks including duplicates.
      // Previously this was inverted: `showDuplicates && !t.is_duplicate` which
      // hid ALL non-duplicate tasks when showDuplicates was true.
      if (!showDuplicates && t.is_duplicate) return false;
      
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter && String(priorityFilter).trim() !== '' && String(t.priority_level_name ?? t.priority_name).trim().toLowerCase() !== String(priorityFilter).trim().toLowerCase()) return false;
      if (categoryFilter && String(categoryFilter).trim() !== '' && String(t.category_name).trim().toLowerCase() !== String(categoryFilter).trim().toLowerCase()) return false;

      // Unassigned filter: show only tasks without an assigned engineer
      if (unassignedFilter) {
        const assigned = String(t.assigned_engineer ?? '').trim().toLowerCase();
        const isUnassigned = !assigned || assigned === 'unassigned' || assigned === 'null' || assigned === 'undefined' || assigned === 'n/a';
        if (!isUnassigned) return false;
      }

      // Due date filter: show only tasks that are due soon or overdue
      if (dueFilter) {
        const terminalStatuses = ['Completed', 'Cancelled', 'Rejected', 'Pending TL Approval'];
        if (terminalStatuses.includes(t.status ?? '')) return false;
        if (t.is_archived) return false;

        const rawTarget = t.target_completion_date;
        if (!rawTarget) return false; // No target date = not due/overdue

        const targetDate = new Date(rawTarget);
        targetDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diff = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (dueFilter === 'overdue' && diff >= 0) return false;
        if (dueFilter === 'due_soon' && (diff < 0 || diff > 3)) return false;
      }

      if (amendmentStatusFilter) {
         if (propTasks && !matchesAmendmentFilter(t, amendmentStatusFilter)) return false;
      }
      
      if (reopenedFilter && !t.is_reopened) return false;
      
      if (!q) return true;
      return (
        (t.serial_number ?? '').toLowerCase().includes(q) ||
        (t.part_number ?? '').toLowerCase().includes(q) ||
        (t.po_number ?? '').toLowerCase().includes(q) ||
        String(t.task_id ?? '').toLowerCase().includes(q)
      );
    });

    const score = (p = '') => (p === 'Critical' ? 4 : p === 'High' ? 3 : p === 'Medium' ? 2 : p === 'Low' ? 1 : 0);
    
    let sorted = [...filtered];

    if (sortConfig.field && sortConfig.direction) {
      sorted = sorted.sort((a, b) => {
        const field = sortConfig.field!;
        const direction = sortConfig.direction === 'asc' ? 1 : -1;

        switch (field) {
          case 'task_id':
            return direction * (a.task_id - b.task_id);
          
          case 'serial_number':
            return direction * ((a.serial_number ?? '').localeCompare(b.serial_number ?? ''));
          
          case 'part_number':
            return direction * ((a.part_number ?? '').localeCompare(b.part_number ?? ''));
          
      case 'po_number':
        return direction * ((a.po_number ?? '').localeCompare(b.po_number ?? ''));

          case 'description':
            return direction * ((a.description ?? '').localeCompare(b.description ?? ''));
          
          case 'category_name':
            return direction * ((a.category_name ?? '').localeCompare(b.category_name ?? ''));
          
          case 'status':
            return direction * ((a.status ?? '').localeCompare(b.status ?? ''));
          
          case 'assigned_engineer':
            return direction * ((a.assigned_engineer ?? '').localeCompare(b.assigned_engineer ?? ''));
          
          case 'priority':
            return direction * (score(a.priority_level_name ?? a.priority_name) - score(b.priority_level_name ?? b.priority_name));
          
          case 'creator_name':
            return direction * ((a.creator_name ?? '').localeCompare(b.creator_name ?? ''));
          
          case 'target_completion_date':
            const dateA = a.target_completion_date ? new Date(a.target_completion_date).getTime() : 0;
            const dateB = b.target_completion_date ? new Date(b.target_completion_date).getTime() : 0;
            return direction * (dateA - dateB);
          
          case 'created_at':
            const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
            const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
            return direction * (createdA - createdB);
          
          case 'attachments_count':
            return direction * ((a.attachments_count ?? 0) - (b.attachments_count ?? 0));
          
          case 'shop_name':
            return direction * ((a.shop_name ?? '').localeCompare(b.shop_name ?? ''));
          
          default:
            return 0;
        }
      });
    } else {
      sorted = sorted.sort((a, b) => {
        if (sortBy === 'priority_desc') return score(b.priority_level_name ?? b.priority_name) - score(a.priority_level_name ?? a.priority_name);
        if (sortBy === 'priority_asc') return score(a.priority_level_name ?? a.priority_name) - score(b.priority_level_name ?? b.priority_name);
        if (sortBy === 'newest') return (new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
        if (sortBy === 'oldest') return (new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime());
        return 0;
      });
    }

    return sorted;
  }, [tasks, searchQuery, statusFilter, sortBy, showDuplicates, priorityFilter, categoryFilter, amendmentStatusFilter, reopenedFilter, unassignedFilter, dueFilter, propTasks, sortConfig]);

  const total = filteredSorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { if (page > totalPages) setPage(1); }, [totalPages, page]);
  const pageItems = filteredSorted.slice((page-1)*pageSize, page*pageSize);

  const toggleSelectTask = (id: number, selected: boolean) => {
    setSelectedTasks(prev => selected ? Array.from(new Set([...prev, id])) : prev.filter(x => x !== id));
  };
  const selectAllOnPage = (selected: boolean) => {
    if (selected) setSelectedTasks(prev => Array.from(new Set([...prev, ...pageItems.map(i => i.task_id)])));
    else setSelectedTasks(prev => prev.filter(id => !pageItems.some(pi => pi.task_id === id)));
  };

  const deleteTask = async (id: number) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      // FIX: Always use apiClient.deleteTask which properly handles
      // Authorization headers and CSRF tokens for DELETE requests
      await apiClient.deleteTask(id);
      setTasks(prev => prev.filter(t => t.task_id !== id));
      setSelectedTasks(prev => prev.filter(x => x !== id));
    } catch (err: any) {
      console.error(err);
      // Show the user-friendly error message from the API client
      const message = err?.message || 'Failed to delete task';
      alert(message);
    }
  };

  const deleteSelected = async () => {
    const ids = [...selectedTasks];
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} selected tasks?`)) return;
    try {
      // FIX: Always use apiClient.deleteTask for proper auth + CSRF handling
      await Promise.all(ids.map(id => apiClient.deleteTask(id)));
      setTasks(prev => prev.filter(t => !ids.includes(t.task_id)));
      setSelectedTasks([]);
    } catch (err: any) {
      console.error(err);
      const message = err?.message || 'Failed to delete some tasks';
      alert(message);
    }
  };

  const exportSelected = async (ids: number[]) => {
    try {
      await fetchAndExportTasks(ids, 'Active_tasks_Selected');
      alert(`Successfully exported ${ids.length} tasks to Excel`);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export tasks. Please try again.');
    }
  };

  // Export EVERY task currently listed (all rows matching the active filters/search,
  // not just the selected ones and not just the current page).
  const exportAllTasks = async () => {
    try {
      if (filteredSorted.length === 0) {
        alert('There are no tasks to export.');
        return;
      }
      await exportLoadedTasksToExcel(filteredSorted, 'Active_tasks_All');
      alert(`Successfully exported ${filteredSorted.length} tasks to Excel`);
    } catch (error) {
      console.error('Export all failed:', error);
      alert('Failed to export tasks. Please try again.');
    }
  };

  const archiveSelected = async (ids: number[]) => {
    try {
      // FIX: Use apiClient which properly handles CSRF tokens and Authorization headers
      await apiClient.post('/tasks/bulk-archive', { taskIds: ids });

      setTasks(prev => prev.filter(t => !ids.includes(t.task_id)));
      setSelectedTasks([]);
      
      alert(`Successfully archived ${ids.length} tasks`);
      
      void loadTasks();
    } catch (error: any) {
      console.error('Archive failed:', error);
      alert(error?.message || 'Failed to archive tasks. Please try again.');
    }
  };

  // BUG FIX: dueIndicator now accepts taskStatus and the full task object to properly
  // handle overdue indicators for non-active statuses.
  //
  // Logic:
  // - Completed, Cancelled, Rejected, Pending TL Approval: Always suppress overdue bar.
  // - Paused, On Hold: Check if the deadline had already passed BEFORE the status change.
  //   If the task was already overdue when it was paused/put on hold, still show overdue.
  //   If the deadline hadn't passed yet when the status changed, suppress overdue.
  const TERMINAL_STATUSES = ['Completed', 'Cancelled', 'Rejected', 'Pending TL Approval'];
  const SUSPENDED_STATUSES = ['Paused', 'OnHold', 'On Hold'];

  function dueIndicator(target?: string | null, taskStatus?: string | null, task?: Task | null) {
    if (!target) return { label: 'N/A', className: 'text-gray-600', status: 'none' as const };

    // Terminal statuses: always suppress overdue indicators
    if (taskStatus && TERMINAL_STATUSES.includes(taskStatus)) {
      if (taskStatus === 'Completed') return { label: 'Completed', className: 'text-green-600', status: 'ok' as const };
      if (taskStatus === 'Cancelled') return { label: 'Cancelled', className: 'text-gray-500', status: 'none' as const };
      if (taskStatus === 'Rejected') return { label: 'Rejected', className: 'text-gray-500', status: 'none' as const };
      if (taskStatus === 'Pending TL Approval') return { label: 'Pending Approval', className: 'text-gray-500', status: 'none' as const };
    }

    // Suspended statuses (Paused, On Hold): check if deadline passed before the status change
    if (taskStatus && SUSPENDED_STATUSES.includes(taskStatus)) {
      const targetDate = new Date(target);
      targetDate.setHours(0, 0, 0, 0);

      // Try to get the status change timestamp from the task object
      const statusChangedAtRaw = task?.status_changed_at ?? task?.statusChangedAt ?? task?.StatusChangedAt ?? null;
      
      if (statusChangedAtRaw) {
        const statusChangedDate = new Date(statusChangedAtRaw);
        statusChangedDate.setHours(0, 0, 0, 0);

        // If the deadline was BEFORE the status change date, the task was already overdue
        // when it was paused/put on hold — show the overdue indicator
        if (targetDate.getTime() < statusChangedDate.getTime()) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const diff = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const statusLabel = taskStatus === 'Paused' ? 'Paused' : 'On Hold';
          if (diff < 0) {
            return { label: `${Math.abs(diff)}d overdue (${statusLabel})`, className: 'text-red-600', status: 'overdue' as const };
          }
        }
      } else {
        // No statusChangedAt available — fall back to comparing deadline vs today.
        // If the deadline has already passed, we still show overdue since we can't
        // determine when the status was changed. This is the safer default.
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (targetDate.getTime() < today.getTime()) {
          const diff = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const statusLabel = taskStatus === 'Paused' ? 'Paused' : 'On Hold';
          return { label: `${Math.abs(diff)}d overdue (${statusLabel})`, className: 'text-red-600', status: 'overdue' as const };
        }
      }

      // Deadline hadn't passed when the task was suspended — suppress overdue
      if (taskStatus === 'Paused') return { label: 'Paused', className: 'text-blue-600', status: 'none' as const };
      return { label: 'On Hold', className: 'text-orange-600', status: 'none' as const };
    }

    const t = new Date(target);
    const today = new Date();
    t.setHours(0,0,0,0);
    today.setHours(0,0,0,0);
    const diff = Math.ceil((t.getTime() - today.getTime()) / (1000*60*60*24));
    if (diff < 0) return { label: `${Math.abs(diff)}d overdue`, className: 'text-red-600', status: 'overdue' as const };
    if (diff <= 3) return { label: `Due in ${diff}d`, className: 'text-yellow-700', status: 'soon' as const };
    return { label: `In ${diff}d`, className: 'text-green-600', status: 'ok' as const };
  }

  function getDueBarClass(target?: string | null, taskStatus?: string | null, task?: Task | null) {
    const d = dueIndicator(target, taskStatus, task);
    switch (d.status) {
      case 'overdue': return 'bg-red-500';
      case 'soon': return 'bg-yellow-400';
      case 'ok': return 'bg-green-500';
      default: return 'bg-transparent';
    }
  }

  const getStatusBadgeClass = (s?: any) => {
    const key = String(s ?? '').toLowerCase();
    switch (key) {
      case 'pending':
        return 'inline-flex items-center bg-yellow-100 text-yellow-700 font-semibold px-2 py-1 rounded text-xs';
      case 'in progress':
      case 'in_progress':
        return 'inline-flex items-center bg-blue-100 text-blue-700 font-semibold px-2 py-1 rounded text-xs';
      case 'completed':
        return 'inline-flex items-center bg-green-100 text-green-700 font-semibold px-2 py-1 rounded text-xs';
      case 'blocked':
        return 'inline-flex items-center bg-red-100 text-red-700 font-semibold px-2 py-1 rounded text-xs';
      case 'on hold':
      case 'on_hold':
        return 'inline-flex items-center bg-purple-100 text-purple-700 font-semibold px-2 py-1 rounded text-xs';
      case 'paused':
        return 'inline-flex items-center bg-amber-100 text-amber-700 font-semibold px-2 py-1 rounded text-xs';
      case 'rejected':
        return 'inline-flex items-center bg-gray-100 text-gray-700 font-semibold px-2 py-1 rounded text-xs';
      case 'pending tl approval':
      case 'pending_tl_approval':
      case 'pendingtlapproval':
        return 'inline-flex items-center bg-orange-100 text-orange-700 font-semibold px-2 py-1 rounded text-xs border border-orange-300';
      default:
        return 'inline-flex items-center bg-gray-100 text-gray-700 font-semibold px-2 py-1 rounded text-xs';
    }
  };

  const getPriorityBadgeClass = (p?: any) => {
    if (p === null || p === undefined) return 'inline-flex items-center bg-gray-200 text-gray-700 font-semibold px-2 py-1 rounded text-xs';
    const key = String(p).toLowerCase();
    if (key.includes('critical')) return 'inline-flex items-center bg-red-700 text-white font-semibold px-2 py-1 rounded text-xs';
    if (key.includes('high')) return 'inline-flex items-center bg-rose-500 text-white font-semibold px-2 py-1 rounded text-xs';
    if (key.includes('medium')) return 'inline-flex items-center bg-yellow-500 text-white font-semibold px-2 py-1 rounded text-xs';
    if (key.includes('low')) return 'inline-flex items-center bg-green-600 text-white font-semibold px-2 py-1 rounded text-xs';
    return 'inline-flex items-center bg-gray-200 text-gray-700 font-semibold px-2 py-1 rounded text-xs';
  };

  const getCategoryTagClass = () => 'inline-flex items-center bg-blue-50 text-blue-800 underline underline-offset-2 font-medium px-2 py-1 rounded text-xs';

  const toggleStatusFilter = (s?: any) => {
    const key = String(s ?? '').trim();
    const normalized = key === '' ? 'all' : key;
    const newFilter = statusFilter === normalized ? 'all' : normalized;
    setStatusFilter(newFilter);
    // Clear due filter when activating a status filter
    if (newFilter !== 'all') {
      setDueFilter(null);
    }
    setPage(1);
    // Sync status filter and due filter back to sidebar
    try {
      window.dispatchEvent(new CustomEvent('tasks:filters', {
        detail: { statusFilter: newFilter, dueFilter: newFilter !== 'all' ? 'all' : undefined }
      }));
    } catch { /* noop */ }
  };

  const togglePriorityFilter = (p?: any) => {
    const key = String(p ?? '').trim();
    if (!key) return;
    if (priorityFilter && String(priorityFilter).trim().toLowerCase() === key.toLowerCase()) {
      setPriorityFilter(null);
    } else {
      setPriorityFilter(key);
    }
    setPage(1);
  };

  const toggleCategoryFilter = (c?: any) => {
    const key = String(c ?? '').trim();
    if (!key) return;
    if (categoryFilter && String(categoryFilter).trim().toLowerCase() === String(c ?? '').toLowerCase()) {
      setCategoryFilter(null);
    } else {
      setCategoryFilter(key);
    }
    setPage(1);
  };

  const clearAmendmentFilters = () => {
    setAmendmentStatusFilter(null);
    setReopenedFilter(false);
    setPage(1);
    if (!propTasks) {
      void loadTasks();
    }
  };

  const handleAmendmentStatusChange = (status: string | null) => {
    setAmendmentStatusFilter(status);
    setPage(1);
    if (!propTasks) {
      void loadTasks();
    }
  };

  const handleReopenedFilterChange = (enabled: boolean) => {
    setReopenedFilter(enabled);
    setPage(1);
    if (!propTasks) {
      void loadTasks();
    }
  };

  const hasAttachments = (task: Task): boolean => {
    if (task.attachments_count !== undefined && task.attachments_count !== null && task.attachments_count > 0) {
      return true;
    }
    if (task.attachment_path && task.attachment_path.trim() !== '' && task.attachment_path !== 'null') {
      return true;
    }
    return false;
  };

  const getAttachmentCount = (task: Task): number => {
    if (task.attachments_count !== undefined && task.attachments_count !== null && task.attachments_count > 0) {
      return task.attachments_count;
    }
    if (task.attachment_path && task.attachment_path.trim() !== '' && task.attachment_path !== 'null') {
      return 1;
    }
    return 0;
  };

  /**
   * FIXED: Download attachment using Data URI approach to avoid blob URL mixed content warnings
   */
  const openAttachment = async (task: Task) => {
    const attachmentCount = getAttachmentCount(task);
    
    if (attachmentCount > 1) {
      setAttachmentsOpenFor(task.task_id);
      return;
    }
    
    setDownloadingAttachment(task.task_id);
    
    try {
      const isCompletedTask = task.status === 'Completed' && task.completed_task_id;
      const attachmentsEndpoint = isCompletedTask 
        ? `/api/completed-tasks/${task.completed_task_id}/attachments`
        : `/api/tasks/${task.task_id}/attachments`;
      
      const response = await fetch(attachmentsEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch attachment: ${response.status}`);
      }
      
      const attachmentsData = await response.json();
      
      const normalizeList = (raw: any): any[] => {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw;
        if (Array.isArray(raw.recordset)) return raw.recordset;
        if (Array.isArray(raw.attachments)) return raw.attachments;
        if (Array.isArray(raw.data)) return raw.data;
        if (typeof raw === 'object') return [raw];
        return [];
      };
      
      const attachmentsList = normalizeList(attachmentsData);
      
      if (attachmentsList.length === 0) {
        throw new Error('No attachment data available');
      }
      
      const attachment = attachmentsList[0];
      const attachmentId = attachment.attachment_id ?? attachment.id ?? attachment.attachmentId;
      
      if (!attachmentId) {
        throw new Error('No attachment ID found');
      }
      
      const downloadEndpoint = isCompletedTask
        ? `/api/completed-tasks/${task.completed_task_id}/attachments/${attachmentId}/download`
        : `/api/tasks/${task.task_id}/attachments/${attachmentId}/download`;
      
      const downloadResponse = await fetch(downloadEndpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      
      if (!downloadResponse.ok) {
        throw new Error(`Download failed: ${downloadResponse.status}`);
      }
      
      const blob = await downloadResponse.blob();
      
      let filename = attachment.file_name ?? attachment.fileName ?? `attachment_${attachmentId}`;
      const contentDisposition = downloadResponse.headers.get('Content-Disposition');
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
        if (filenameMatch) {
          filename = filenameMatch[1].replace(/['"]/g, '');
        }
      }
      
      // FIXED: Use Data URI approach instead of blob URL to avoid mixed content warnings
      await downloadFileWithDataUri(blob, filename);
      
    } catch (err) {
      console.error('Failed to download attachment:', err);
      setAttachmentsOpenFor(task.task_id);
    } finally {
      setDownloadingAttachment(null);
    }
  };

  const handleAlertClick = (task: Task, alertType: 'revision' | 'reopened' | 'duplicate' | 'amendment') => {
    setSelectedAlertTask(task);
    setSelectedAlertType(alertType);
    setAlertModalOpen(true);
  };

  // Approve/Reject completion for "Pending TL Approval" tasks
  const canApproveCompletion = ['team_leader', 'director', 'admin', 'manager'].includes(currentUserRole);

  const [approvingTaskId, setApprovingTaskId] = useState<number | null>(null);
  const [rejectingTaskId, setRejectingTaskId] = useState<number | null>(null);

  const handleApproveCompletion = async (taskId: number) => {
    if (!confirm('Are you sure you want to approve this task completion?')) return;
    setApprovingTaskId(taskId);
    try {
      // FIX: Use apiClient which properly handles CSRF tokens and Authorization headers
      // Previously used raw fetch() which did not include the X-CSRF-Token header,
      // causing the backend to return 403 "CSRF validation failed"
      await apiClient.approveTaskCompletion(taskId);
      // Refresh tasks
      void loadTasks();
      window.dispatchEvent(new Event('tasks:refresh'));
    } catch (err: any) {
      console.error('Failed to approve completion:', err);
      alert(err?.message || 'Failed to approve task completion');
    } finally {
      setApprovingTaskId(null);
    }
  };

  const handleRejectCompletion = async (taskId: number) => {
    const reason = prompt('Please provide a reason for rejecting this completion:');
    if (reason === null) return; // User cancelled
    if (!reason.trim()) {
      alert('A rejection reason is required.');
      return;
    }
    setRejectingTaskId(taskId);
    try {
      // FIX: Use apiClient which properly handles CSRF tokens and Authorization headers
      // Previously used raw fetch() which did not include the X-CSRF-Token header,
      // causing the backend to return 403 "CSRF validation failed"
      await apiClient.rejectTaskCompletion(taskId, reason.trim());
      // Refresh tasks
      void loadTasks();
      window.dispatchEvent(new Event('tasks:refresh'));
    } catch (err: any) {
      console.error('Failed to reject completion:', err);
      alert(err?.message || 'Failed to reject task completion');
    } finally {
      setRejectingTaskId(null);
    }
  };

  // Handle open dialog for description, part number, category (same as completed tasks page)
  const showFieldDialog = (field: string, value: string, taskId: number) => {
    setFieldExpanded(false);
    setFieldDialogData({ field, value, taskId });
    setFieldDialogOpen(true);
  };

  // For dialog: handle expand/collapse if text is long
  const FIELD_TRUNCATE = 200;
  const renderFieldValue = (value: string) => {
    if (!value || value.length <= FIELD_TRUNCATE || fieldExpanded) {
      return <div className="break-words text-gray-700">{value || '—'}</div>;
    }
    return (
      <div>
        <div className="break-words text-gray-700">{value.substring(0, FIELD_TRUNCATE) + '…'}</div>
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setFieldExpanded(true)}>Show Full</Button>
      </div>
    );
  };

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      if (!el) return;
      if (el.scrollHeight > el.clientHeight + 1) {
        el.classList.add('has-scroll');
      } else {
        el.classList.remove('has-scroll');
      }
      const atBottom = Math.abs((el.scrollTop + el.clientHeight) - el.scrollHeight) < 2;
      if (atBottom) {
        el.classList.add('scrolled-bottom');
      } else {
        el.classList.remove('scrolled-bottom');
      }
    };

    update();
    el.addEventListener('scroll', update);
    window.addEventListener('resize', update);

    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [pageItems.length, tasks.length]);

  // ─── Top scrollbar synchronization with bottom scrollbar ───
  // FIX (Bug #1): Top scrollbar implementation.
  // The top scrollbar must:
  //   1. Have width matching its viewport (parent container's width) for the scrollbar to be visible
  //   2. Contain an inner div whose width matches the table's full scrollWidth so the scrollbar
  //      thumb can move across the entire scrollable range
  //   3. Sync bidirectionally with the table container's horizontal scroll
  //   4. Only be visible when the table content overflows horizontally
  useEffect(() => {
    const outerContainer = containerRef.current;
    const topScrollbar = topScrollbarRef.current;
    const topScrollbarInner = topScrollbarInnerRef.current;
    if (!outerContainer || !topScrollbar || !topScrollbarInner) return;

    // CRITICAL DOM NOTE: The shadcn <Table> component wraps the native <table>
    // in an internal div with its own `overflow-auto` style:
    //   .task-table-container (outerContainer)
    //     └── div.relative.w-full.overflow-auto  ← ACTUAL horizontal scroll element
    //           └── <table>
    // That internal wrapper absorbs the horizontal overflow, so scrolling must
    // be synced with IT — not with .task-table-container. Otherwise scrollLeft
    // has no effect because the outer container never actually overflows.
    const getScrollEl = (): HTMLElement => {
      const tableEl = outerContainer.querySelector('table');
      if (tableEl && tableEl.parentElement && tableEl.parentElement !== outerContainer) {
        return tableEl.parentElement as HTMLElement;
      }
      return outerContainer;
    };

    // Set the inner div width to the scrolling element's scrollWidth. Both the
    // top scrollbar and the actual scroll container will then have IDENTICAL
    // scroll ranges, which allows direct 1:1 scrollLeft copying between them.
    const syncWidth = () => {
      const scrollEl = getScrollEl();
      const sw = scrollEl.scrollWidth;
      if (sw > 0) {
        topScrollbarInner.style.width = `${sw}px`;
      }
    };
    const tableContainer = getScrollEl();

    // Initial sync with multiple delays to ensure table is fully rendered.
    // Tables may not have their final dimensions immediately after mount,
    // especially when data loads asynchronously.
    syncWidth();
    const raf1 = requestAnimationFrame(syncWidth);
    const raf2 = requestAnimationFrame(() => requestAnimationFrame(syncWidth));
    const initialSyncTimeout = setTimeout(syncWidth, 100);
    const secondSyncTimeout = setTimeout(syncWidth, 300);
    const thirdSyncTimeout = setTimeout(syncWidth, 600);
    const fourthSyncTimeout = setTimeout(syncWidth, 1000);
    const fifthSyncTimeout = setTimeout(syncWidth, 2000);
    // Periodic check for the first 10 seconds to catch late renders
    const periodicSync = setInterval(syncWidth, 500);
    const periodicStop = setTimeout(() => clearInterval(periodicSync), 10000);

    // Observe table container for size changes (e.g., columns added/removed, data loaded)
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        syncWidth();
      });
      resizeObserver.observe(tableContainer);
      // Also observe the actual table element if present
      const tableEl = tableContainer.querySelector('table');
      if (tableEl) {
        resizeObserver.observe(tableEl);
      }
    }

    // Observe DOM mutations inside the table container (e.g., rows added/removed).
    // IMPORTANT: do NOT watch `style` attribute mutations — the sync logic itself
    // modifies `style.width` on the top scrollbar inner, which would otherwise
    // trigger an infinite observer loop.
    let mutationObserver: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined') {
      mutationObserver = new MutationObserver(() => {
        syncWidth();
      });
      mutationObserver.observe(tableContainer, {
        childList: true,
        subtree: true,
      });
    }

    // Also sync on window resize
    window.addEventListener('resize', syncWidth);

    // Synchronize horizontal scroll positions between top and bottom scrollbars
    // using requestAnimationFrame-based locking. When the user actively scrolls
    // one element, the opposite handler ignores the programmatic scroll event
    // that the sync triggers. Using rAF instead of a fixed setTimeout makes the
    // lock self-clearing on the next paint, which keeps continuous dragging
    // responsive in both directions without stuck guards.
    let isSyncing = false;

    const onTopScroll = () => {
      if (isSyncing) return;
      isSyncing = true;
      tableContainer.scrollLeft = topScrollbar.scrollLeft;
      requestAnimationFrame(() => { isSyncing = false; });
    };

    const onBottomScroll = () => {
      if (isSyncing) return;
      isSyncing = true;
      topScrollbar.scrollLeft = tableContainer.scrollLeft;
      requestAnimationFrame(() => { isSyncing = false; });
    };

    topScrollbar.addEventListener('scroll', onTopScroll, { passive: true });
    tableContainer.addEventListener('scroll', onBottomScroll, { passive: true });

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(initialSyncTimeout);
      clearTimeout(secondSyncTimeout);
      clearTimeout(thirdSyncTimeout);
      clearTimeout(fourthSyncTimeout);
      clearTimeout(fifthSyncTimeout);
      clearInterval(periodicSync);
      clearTimeout(periodicStop);
      if (resizeObserver) resizeObserver.disconnect();
      if (mutationObserver) mutationObserver.disconnect();
      window.removeEventListener('resize', syncWidth);
      topScrollbar.removeEventListener('scroll', onTopScroll);
      tableContainer.removeEventListener('scroll', onBottomScroll);
    };
  }, [pageItems.length, tasks.length]);

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {unassignedFilter && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-amber-100 text-amber-700">
              <UserX className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-amber-900">Showing Unassigned Tasks</div>
              <div className="text-xs text-amber-700">
                {filteredSorted.length} task{filteredSorted.length === 1 ? '' : 's'} without an assigned engineer. Click the <strong>Edit</strong> action on any row to assign an engineer.
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={clearUnassignedFilter}
            className="flex items-center gap-1.5 bg-white hover:bg-amber-100 border-amber-300 text-amber-800"
            title="Clear Unassigned filter"
          >
            <X className="h-4 w-4" />
            Clear Filter
          </Button>
        </div>
      )}

      {statusFilter !== 'all' && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-100 text-blue-700">
              <Filter className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-blue-900">Filtered by Status: {statusFilter}</div>
              <div className="text-xs text-blue-700">
                {filteredSorted.length} task{filteredSorted.length === 1 ? '' : 's'} with status &ldquo;{statusFilter}&rdquo;. Click a status badge in the table or use the sidebar to change filters.
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toggleStatusFilter(statusFilter)}
            className="flex items-center gap-1.5 bg-white hover:bg-blue-100 border-blue-300 text-blue-800"
            title="Clear status filter"
          >
            <X className="h-4 w-4" />
            Clear Filter
          </Button>
        </div>
      )}

      {dueFilter && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-orange-100 text-orange-700">
              {dueFilter === 'overdue' ? <AlertOctagon className="h-5 w-5" /> : <CalendarClock className="h-5 w-5" />}
            </div>
            <div>
              <div className="text-sm font-semibold text-orange-900">
                {dueFilter === 'overdue' ? 'Showing Overdue Tasks' : 'Showing Due Soon Tasks'}
              </div>
              <div className="text-xs text-orange-700">
                {filteredSorted.length} task{filteredSorted.length === 1 ? '' : 's'} {dueFilter === 'overdue' ? 'past their target completion date' : 'due within 3 days'}. Use the sidebar to change filters.
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDueFilter(null);
              setPage(1);
              // Sync back to sidebar
              try {
                window.dispatchEvent(new CustomEvent('tasks:filters', {
                  detail: { dueFilter: 'all' }
                }));
              } catch { /* noop */ }
            }}
            className="flex items-center gap-1.5 bg-white hover:bg-orange-100 border-orange-300 text-orange-800"
            title="Clear due filter"
          >
            <X className="h-4 w-4" />
            Clear Filter
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <BulkActions 
            selectedItems={selectedTasks} 
            totalItems={filteredSorted.length} 
            onDeleteSelected={deleteSelected}
            onExportSelected={exportSelected}
            onExportAll={exportAllTasks}
            onArchiveSelected={archiveSelected}
            onSelectAll={() => selectAllOnPage(true)} 
            onClearSelection={() => setSelectedTasks([])} 
            itemType="tasks"
            canDelete={canDeleteTasks}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant={showAmendmentFilters ? "default" : "outline"}
            size="sm"
            onClick={() => setShowAmendmentFilters(!showAmendmentFilters)}
            className="flex items-center gap-2"
          >
            <Filter className="h-4 w-4" />
            Amendment Filters
            {(amendmentStatusFilter || reopenedFilter) && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-blue-600 text-white">
                {(amendmentStatusFilter ? 1 : 0) + (reopenedFilter ? 1 : 0)}
              </span>
            )}
          </Button>
        </div>
      </div>

      {showAmendmentFilters && (
        <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
          <AmendmentFilters
            amendmentStatusFilter={amendmentStatusFilter}
            reopenedFilter={reopenedFilter}
            onAmendmentStatusChange={handleAmendmentStatusChange}
            onReopenedFilterChange={handleReopenedFilterChange}
            onClearFilters={clearAmendmentFilters}
            userRole={userRole}
          />
        </div>
      )}

      <div className="table-scroll-wrapper">
        {/* Top horizontal scrollbar — synchronized with the bottom scrollbar.
            The outer div has fixed height and overflow-x:auto so its scrollbar renders.
            The inner div is sized to match the table's full scrollWidth so scrolling the thumb
            moves across the entire horizontal content range. */}
        <div className="top-horizontal-scrollbar" ref={topScrollbarRef} aria-label="Top horizontal scrollbar">
          <div className="top-horizontal-scrollbar-inner" ref={topScrollbarInnerRef} />
        </div>

        <div className="task-table-container" ref={containerRef}>
          <Table className="task-table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-1" />
              <TableHead className="w-12">
                <Checkbox
                  checked={pageItems.length > 0 && pageItems.every(i => selectedTasks.includes(i.task_id))}
                  onCheckedChange={(val) => selectAllOnPage(!!val)}
                />
              </TableHead>

              <TableHead 
                className="cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => handleSort('task_id')}
              >
                <div className="flex items-center">
                  Task ID
                  {getSortIcon('task_id')}
                </div>
              </TableHead>

              <TableHead 
                className="cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => handleSort('serial_number')}
              >
                <div className="flex items-center">
                  Serial Number
                  {getSortIcon('serial_number')}
                </div>
              </TableHead>
              
              <TableHead 
                className="cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => handleSort('part_number')}
              >
                <div className="flex items-center">
                  Part Number
                  {getSortIcon('part_number')}
                </div>
              </TableHead>
              
              <TableHead 
                className="cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => handleSort('description')}
              >
                <div className="flex items-center">
                  Description
                  {getSortIcon('description')}
                </div>
              </TableHead>

              <TableHead 
  className="cursor-pointer hover:bg-gray-50 select-none"
  onClick={() => handleSort('po_number')}
>
  <div className="flex items-center">
    PO Number
    {getSortIcon('po_number')}
  </div>
</TableHead>
              
              <TableHead 
                className="cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => handleSort('category_name')}
              >
                <div className="flex items-center">
                  Category
                  {getSortIcon('category_name')}
                </div>
              </TableHead>
              
              <TableHead 
                className="cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => handleSort('assigned_engineer')}
              >
                <div className="flex items-center">
                  Assigned Engineer
                  {getSortIcon('assigned_engineer')}
                </div>
              </TableHead>
              
              <TableHead 
                className="cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => handleSort('shop_name')}
              >
                <div className="flex items-center">
                  Shop
                  {getSortIcon('shop_name')}
                </div>
              </TableHead>
              
              <TableHead 
                className="cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => handleSort('creator_name')}
              >
                <div className="flex items-center">
                  Created By
                  {getSortIcon('creator_name')}
                </div>
              </TableHead>
              
              <TableHead 
                className="cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => handleSort('target_completion_date')}
              >
                <div className="flex items-center">
                  Target Date
                  {getSortIcon('target_completion_date')}
                </div>
              </TableHead>
              
              <TableHead 
                className="cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => handleSort('created_at')}
              >
                <div className="flex items-center">
                  Created At
                  {getSortIcon('created_at')}
                </div>
              </TableHead>
              
              <TableHead 
                className="cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => handleSort('attachments_count')}
              >
                <div className="flex items-center">
                  Attachment
                  {getSortIcon('attachments_count')}
                </div>
              </TableHead>
              
              <TableHead 
                className="cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center">
                  Status
                  {getSortIcon('status')}
                </div>
              </TableHead>
              
              {canSeeAlerts && <TableHead>Alerts</TableHead>}
              
              <TableHead 
                className="cursor-pointer hover:bg-gray-50 select-none"
                onClick={() => handleSort('priority')}
              >
                <div className="flex items-center">
                  Priority
                  {getSortIcon('priority')}
                </div>
              </TableHead>
              
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={18} className="text-center py-8">Loading...</TableCell>
              </TableRow>
            ) : pageItems.length === 0 ? (
              <TableRow>
                <TableCell colSpan={18} className="text-center py-8 text-gray-500">
                  {(amendmentStatusFilter || reopenedFilter || showDuplicates) ? (
                    <>
                      No tasks found matching the current filters.
                      <div className="mt-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => {
                            clearAmendmentFilters();
                            setShowDuplicates(false);
                          }}
                        >
                          Clear All Filters
                        </Button>
                      </div>
                    </>
                  ) : (
                    'No tasks found.'
                  )}
                </TableCell>
              </TableRow>
            ) : pageItems.map((task, index) => {
              const due = dueIndicator(task.target_completion_date ?? undefined, task.status, task);
              const barClass = getDueBarClass(task.target_completion_date ?? undefined, task.status, task);
              const statusLabel = task.status ?? 'Pending';
              const priorityDisplay = task.priority_level_name ?? task.priority_name ?? 'N/A';
              const taskHasAttachments = hasAttachments(task);
              const attachmentCount = getAttachmentCount(task);
              const isDownloading = downloadingAttachment === task.task_id;
              
              const uniqueKey = task._uniqueKey || `task-${task.task_id}-${index}-${Date.now()}`;
              
              const isSelected = selectedTasks.includes(task.task_id);

              return (
                <TableRow 
                  key={uniqueKey} 
                  className={`${task.show_revision_alert ? 'bg-yellow-50' : ''} ${task.is_duplicate ? 'bg-red-50 border-l-4 border-l-red-500' : ''} ${isSelected ? 'row-selected' : ''}`}
                >
                  <TableCell className="p-0">
                    <div className={`${barClass} h-full w-1`} style={{ minHeight: 48 }} />
                  </TableCell>

                  <TableCell className={isSelected ? 'checkbox-cell-selected' : ''}>
                    <Checkbox checked={selectedTasks.includes(task.task_id)} onCheckedChange={(checked) => toggleSelectTask(task.task_id, !!checked)} />
                  </TableCell>

                  <TableCell className="font-medium">
                    <span>{`TC-${task.task_id}`}</span>
                    {task.show_revision_alert && <AlertTriangle className="h-4 w-4 text-yellow-600 inline ml-1" />}
                  </TableCell>

                  <TableCell>
                    <div className="truncate-with-tooltip" data-full-text={task.serial_number ?? 'N/A'}>
                      {task.serial_number ?? 'N/A'}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div
                      className="truncate-with-tooltip cursor-pointer text-blue-700 hover:underline"
                      data-full-text={task.part_number ?? 'N/A'}
                      title="Click to expand Part Number"
                      onClick={() => showFieldDialog('Part Number', task.part_number ?? 'N/A', task.task_id)}
                    >
                      {task.part_number ?? 'N/A'}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <div
                      className="truncate-with-tooltip cursor-pointer hover:text-blue-600"
                      data-full-text={task.description}
                      title="Click to expand Description"
                      onClick={() => showFieldDialog('Description', String(task.description ?? ''), task.task_id)}
                    >
                      {task.description}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="truncate-with-tooltip" data-full-text={task.po_number ?? 'N/A'}>
                      {task.po_number ?? 'N/A'}
                    </div>
                  </TableCell>
                  
                  <TableCell>
                    <button
                      onClick={() => showFieldDialog('Category', task.category_name ?? 'N/A', task.task_id)}
                      title="Click to expand Category"
                      className={`text-left ${getCategoryTagClass()} cursor-pointer`}
                    >
                      {task.category_name ?? 'N/A'}
                    </button>
                  </TableCell>
                  
                  <TableCell>
                    <div className="truncate-with-tooltip" data-full-text={task.assigned_engineer || 'Unassigned'}>
                      {task.assigned_engineer || 'Unassigned'}
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="text-sm">{task.shop_name || 'N/A'}</div>
                  </TableCell>
                  
                  <TableCell>
                    <div className="truncate-with-tooltip" data-full-text={task.creator_name ?? 'N/A'}>
                      {task.creator_name ?? 'N/A'}
                    </div>
                  </TableCell>
                  
                  <TableCell className={due.className}>
                    {formatDate(task.target_completion_date)}
                    <div className="text-xs">{due.label}</div>
                  </TableCell>
                  
                  <TableCell>{formatDate(task.created_at)}</TableCell>

                  <TableCell>
                    {taskHasAttachments ? (
                      <button 
                        className="flex items-center gap-1.5 text-blue-600 hover:text-blue-800 transition-colors hover:underline p-1.5 rounded hover:bg-blue-50" 
                        onClick={() => openAttachment(task)}
                        disabled={isDownloading}
                        title={attachmentCount > 1 ? `View ${attachmentCount} attachments` : "Download attachment"}
                      >
                        <Paperclip className="h-4 w-4" />
                        {isDownloading ? (
                          <span className="text-xs font-medium">Downloading...</span>
                        ) : attachmentCount > 1 ? (
                          <span className="text-xs font-medium">({attachmentCount})</span>
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                      </button>
                    ) : (
                      <button 
                        className="flex items-center gap-1.5 text-gray-400 hover:text-blue-600 transition-colors p-1.5 rounded hover:bg-blue-50" 
                        onClick={() => setAttachmentsOpenFor(task.task_id)}
                        title="Add attachments"
                      >
                        <Paperclip className="h-4 w-4" />
                        <span className="text-xs">Add</span>
                      </button>
                    )}
                  </TableCell>

                  <TableCell>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={() => toggleStatusFilter(statusLabel)}
                        title={`Filter by status: ${statusLabel}`}
                        className="cursor-pointer"
                      >
                        <span className={getStatusBadgeClass(statusLabel)}>
                          {statusLabel === 'Paused' && <Pause className="h-3 w-3 inline mr-1" />}
                          {statusLabel}
                        </span>
                      </button>
                      <div className="flex flex-wrap gap-1">
                        <CompactTaskStatusIcons task={task} />
                      </div>
                    </div>
                  </TableCell>

                  {canSeeAlerts && (
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {task.show_revision_alert && (
                          <button
                            onClick={() => handleAlertClick(task, 'revision')}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 hover:bg-yellow-200 transition-colors cursor-pointer"
                            title="Click to view revision alert details"
                          >
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Alert
                          </button>
                        )}
                        {task.is_reopened && (
                          <button
                            onClick={() => handleAlertClick(task, 'reopened')}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 transition-colors cursor-pointer"
                            title="Click to view reopened task details"
                          >
                            Reopened
                          </button>
                        )}
                        {task.amendment_request && (
                          <button
                            onClick={() => handleAlertClick(task, 'amendment')}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 hover:bg-blue-200 transition-colors cursor-pointer"
                            title="Click to view amendment request details"
                          >
                            <FileEdit className="h-3 w-3 mr-1" />
                            Amendment
                          </button>
                        )}
                        {task.is_duplicate && (
                          <button
                            onClick={() => handleAlertClick(task, 'duplicate')}
                            className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors cursor-pointer border border-amber-200"
                            title="Click to view duplicate task details"
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Duplicate
                          </button>
                        )}
                      </div>
                    </TableCell>
                  )}

                  <TableCell>
                    <button
                      onClick={() => togglePriorityFilter(priorityDisplay)}
                      title={`Filter by priority: ${priorityDisplay}`}
                      className={priorityFilter && String(priorityFilter).toLowerCase() === String(priorityDisplay).toLowerCase() ? 'ring-2 ring-offset-1 ring-yellow-200 rounded' : ''}
                    >
                      <span className={getPriorityBadgeClass(priorityDisplay)}>{priorityDisplay}</span>
                    </button>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        title="View Details" 
                        onClick={() => { 
                          setDetailsTaskData(task);
                          setDetailsOpenFor(task.task_id); 
                        }} 
                        className="btn-action"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>

                      <Button variant="ghost" size="sm" onClick={() => { setCurrentUpdateInitial(task); setUpdateOpenFor(task.task_id); }} title="Update" className="btn-action">
                        <Edit className="h-4 w-4" />
                      </Button>

                      {/* Approve/Reject buttons for Pending TL Approval status */}
                      {canApproveCompletion && statusLabel === 'Pending TL Approval' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Approve Completion"
                            onClick={() => handleApproveCompletion(task.task_id)}
                            disabled={approvingTaskId === task.task_id}
                            className="btn-action text-green-600 hover:text-green-800 hover:bg-green-50"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Reject Completion"
                            onClick={() => handleRejectCompletion(task.task_id)}
                            disabled={rejectingTaskId === task.task_id}
                            className="btn-action text-red-600 hover:text-red-800 hover:bg-red-50"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </>
                      )}

                      {canDeleteTasks && (
                        <button
                          onClick={() => deleteTask(task.task_id)}
                          type="button"
                          title="Delete"
                          className="flex items-center justify-center bg-red-600 hover:bg-red-700 border-none text-white transition-all font-semibold px-2.5 py-2 rounded-lg shadow-sm ml-1"
                          style={{ minWidth: 38, minHeight: 38, boxShadow: '0 2px 8px rgba(244,78,78,0.11)', border: '2px solid #f65c5c' }}
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        </div>
      </div>

      <div className="flex items-center justify-between task-table-pagination">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p-1))}>Prev</Button>
          <span className="text-sm">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p+1))}>Next</Button>
        </div>
        <div className="text-sm text-muted">{Math.min((page-1)*pageSize + 1, total)} - {Math.min(page*pageSize, total)} of {total}</div>
      </div>

      <AttachmentsModal open={!!attachmentsOpenFor} onOpenChange={(open) => { if (!open) setAttachmentsOpenFor(null); }} taskId={attachmentsOpenFor} canUpload={true} />

      <UpdateTaskModal open={!!updateOpenFor} onOpenChange={(open) => { if (!open) setUpdateOpenFor(null); }} taskId={updateOpenFor} initial={currentUpdateInitial} onSaved={() => { void loadTasks(); }} />

      <TaskDetailsModal 
        open={!!detailsOpenFor} 
        onOpenChange={(open) => { 
          if (!open) {
            setDetailsOpenFor(null);
            setDetailsTaskData(null);
          }
        }} 
        taskId={detailsOpenFor}
        task={detailsTaskData}
      />

      <AlertDetailsModal
        open={alertModalOpen}
        onOpenChange={setAlertModalOpen}
        alertType={selectedAlertType}
        task={selectedAlertTask}
      />

      {/* ─── FIELD DIALOG: Part Number, Description, Category (same as completed tasks page) ─── */}
      <Dialog open={fieldDialogOpen} onOpenChange={open => { setFieldDialogOpen(open); if (!open) setFieldDialogData(null); setFieldExpanded(false); }}>
        <DialogContent className="max-w-xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {fieldDialogData ? `${fieldDialogData.field} — TC-${fieldDialogData.taskId}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="p-3">
            {fieldDialogData ? renderFieldValue(fieldDialogData.value) : <div className="text-gray-400">No data.</div>}
            {fieldDialogData && fieldExpanded && fieldDialogData.value.length > FIELD_TRUNCATE && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setFieldExpanded(false)}>Show Less</Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}