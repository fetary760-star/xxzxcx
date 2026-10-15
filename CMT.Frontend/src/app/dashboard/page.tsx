'use client'

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import apiClient from '@/lib/api'
import { secureAuthStore } from '@/lib/secure-auth-store'
import EngineerWorkload from '@/components/EngineerWorkload'
import RecentNotifications from '@/components/RecentNotifications'
import { useRolePermissions } from '@/hooks/useRolePermissions'
import { useTLPermissions } from '@/lib/tl-permissions-context'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Plus, Search, Loader2, X, TrendingUp, Clock, CheckCircle2, BarChart3 } from 'lucide-react'
import TaskTable from '@/components/TaskTable'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useRouter, useSearchParams } from 'next/navigation'
import CreateTaskForm from '@/components/CreateTaskForm'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  normalizeStatus, 
  normalizePriority, 
  splitAndNormalizeEngineers,
  getStatusColorClass,
  getPriorityColorClass,
  formatDelayText,
  getDelayStatus,
  getDelayColorClass
} from '@/utils/statusUtils'

// Types
interface Task {
  task_id: number
  serial_number: string
  part_number: string
  description: string
  status: 'Pending' | 'In Progress' | 'Completed' | 'Blocked' | 'On Hold' | string
  assigned_engineer: string
  priority_level_name: 'High' | 'Medium' | 'Low' | string
  creator_name: string
  created_by?: number
  target_completion_date?: string | null
  estimated_completion_date?: string | null
  actual_completion_date?: string | null
  created_at?: string | null
  attachment_path?: string
  is_duplicate?: boolean
  show_revision_alert?: boolean
  shop_id?: number
  [k: string]: any
}

interface DashboardMetrics {
  totalTasks: number
  tasksCompleted: number
  pendingTasks: number
  inProgressTasks: number
  overdueTasks: number
  completionRate: number
  avgDelayDays: number
  completionRateFormatted: string
  avgDelayFormatted: string
  userRole: string
  userShopId?: number
  userShopName?: string
  isRoleBasedView: boolean
  recentTasks: Array<{
    taskId: number
    description: string
    status: string
    createdByName: string
    createdAt: string
    completedAt?: string
    categoryName?: string
    priorityName?: string
    isCompleted: boolean
  }>
  taskStatusBreakdown: Record<string, number>
}

interface CategoryDistribution {
  categoryName: string
  totalTasks: number
  completedTasks: number
  completionRate: number
  engineerDistribution: Record<string, number>
}

interface AnalyticsData {
  type: 'completion' | 'delay' | 'completed' | 'pending'
  title: string
  description: string
  data: any
}

// Helper to canonicalize role strings
function canonicalizeRole(raw: any): string {
  if (!raw && raw !== 0) return ''
  if (typeof raw === 'number') {
    const map: Record<string, string> = { 0: 'team_leader', 1: 'director', 2: 'engineer', 3: 'customer', 4: 'customer_personnel', 5: 'shop_tl', 6: 'manager', 7: 'admin', 8: 'shop_manager' }
    return map[String(raw)] ?? String(raw)
  }
  return String(raw).trim().toLowerCase().replace(/[\s\-_]+/g, '_')
}

/**
 * Helper: get a valid bearer token for API calls.
 * Returns null if no usable token exists (the HttpOnly cookie will still
 * authenticate the request via credentials: 'include').
 * Filters out the 'cookie-session' sentinel which is not a real token.
 */
function getUsableBearerToken(authToken: string | null): string | null {
  if (!authToken || authToken === 'cookie-session') {
    // Fallback: check secureAuthStore in case it was updated after render
    const storeToken = secureAuthStore.getToken()
    if (storeToken && storeToken !== 'cookie-session') {
      return storeToken
    }
    return null
  }
  return authToken
}

// Dashboard Page Component
export default function DashboardPage(): JSX.Element {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [tasks, setTasks] = useState<Task[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('priority_desc');
  // SECURITY FIX: Use in-memory useState only (no localStorage persistence)
  // to avoid persistent browser storage exposure. This UI preference is
  // non-sensitive, but the security audit requires removing ALL
  // persistent localStorage writes from the app.
  const [showDuplicates, setShowDuplicates] = useState<boolean>(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedTasks, setSelectedTasks] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);

  // CRITICAL FIX: Add ref to track if component is mounted and authenticated
  const isMountedRef = useRef(false);
  const isAuthenticatedRef = useRef(false);
  // CRITICAL FIX: Track whether initial data load has completed successfully
  const hasLoadedOnceRef = useRef(false);

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

  useEffect(() => {
    // SECURITY FIX: Removed localStorage persistence of showDuplicates.
    // Using in-memory state only to avoid persistent browser storage exposure.
    try {
      window.dispatchEvent(new CustomEvent('tasks:filters', { detail: { searchQuery, statusFilter, sortBy, showDuplicates } }));
    } catch {}
  }, [showDuplicates, searchQuery, statusFilter, sortBy]);

  // include refreshUser and logout to recover or redirect on 401
  const { user, isAuthenticated, isLoading: authLoading, refreshUser, logout, directorPermissions, token: authToken } = useAuth();

  // CRITICAL FIX: Update refs when authentication state changes
  useEffect(() => {
    isMountedRef.current = true;
    isAuthenticatedRef.current = isAuthenticated;
    
    return () => {
      isMountedRef.current = false;
      isAuthenticatedRef.current = false;
    };
  }, [isAuthenticated]);

  const role = (user?.role ?? '').toString().toLowerCase().replace(/[\s\-_]+/g, '');
  const isLeaderOrDirector = role === 'teamleader' || role === 'team_leader' || role === 'director' || role === '0' || role === '1';

  // FIXED: Only use properties that exist on the User type
  const canonicalRole = canonicalizeRole(user?.role ?? '');
  const canCreateTasks = isLeaderOrDirector || canonicalRole === 'customer_personnel' || canonicalRole === 'customer' || canonicalRole === 'shop_tl';
  const canAssignEngineers = isLeaderOrDirector;

  // Use the admin-configured role permissions matrix instead of hardcoded role checks
  const { canDeleteTask: matrixCanDeleteTask, canViewEngineerWorkload, canViewPerformanceMetrics, canViewAnalytics } = useRolePermissions();
  const canDeleteTasks = () => matrixCanDeleteTask;

  // TL-specific granular permissions (only applies to Team Leader users)
  const { tlPermissions, isLoadingTLPermissions } = useTLPermissions();

  // ---------------------------------------------------------------------------
  // Unified permission helpers that combine:
  //   1. Role-based matrix permissions (useRolePermissions) — applies to all roles
  //   2. Director-specific granular permissions (directorPermissions) — for directors
  //   3. TL-specific granular permissions (tlPermissions) — for team leaders
  //
  // Logic:
  //   - For Directors: matrix always returns true (privileged), but director-specific
  //     permissions can restrict individual directors.
  //   - For Team Leaders: matrix may allow/deny, AND tl-specific permissions can
  //     further restrict individual TLs.
  //   - For all other roles: matrix permission is the single source of truth.
  // ---------------------------------------------------------------------------
  const isTeamLeaderRole = role === 'teamleader' || role === 'team_leader' || role === '0';
  const isDirectorRole = role === 'director' || role === '1';

  /** Whether the current user can view the performance-specific metric cards (Completion Rate, Avg. Delay).
   *  Task counts (Tasks Completed, Pending Tasks) are always visible regardless of this flag. */
  const effectiveCanViewPerformanceMetrics = useMemo(() => {
    // Director: check director-specific override
    if (isDirectorRole && directorPermissions && directorPermissions.canViewPerformanceMetrics === false) {
      return false;
    }
    // Team Leader: check TL-specific override (only if TL permissions are loaded)
    if (isTeamLeaderRole && tlPermissions && tlPermissions.canViewPerformanceMetrics === false) {
      return false;
    }
    // Fallback to role matrix
    return canViewPerformanceMetrics;
  }, [isDirectorRole, directorPermissions, isTeamLeaderRole, tlPermissions, canViewPerformanceMetrics]);

  /** Whether the current user can click metric cards to open analytics dialogs */
  const effectiveCanViewAnalytics = useMemo(() => {
    if (isDirectorRole && directorPermissions && directorPermissions.canViewAnalytics === false) {
      return false;
    }
    if (isTeamLeaderRole && tlPermissions && tlPermissions.canViewAnalytics === false) {
      return false;
    }
    return canViewAnalytics;
  }, [isDirectorRole, directorPermissions, isTeamLeaderRole, tlPermissions, canViewAnalytics]);

  /** Whether the current user can view the Engineer Workload sidebar */
  const effectiveCanViewEngineerWorkload = useMemo(() => {
    if (isDirectorRole && directorPermissions && directorPermissions.canViewEngineerWorkload === false) {
      return false;
    }
    if (isTeamLeaderRole && tlPermissions && tlPermissions.canViewEngineerWorkload === false) {
      return false;
    }
    return canViewEngineerWorkload;
  }, [isDirectorRole, directorPermissions, isTeamLeaderRole, tlPermissions, canViewEngineerWorkload]);

  // Role-scoped tasks
  const scopedTasks = useMemo(() => {
    if (!user) return tasks;
    const canonical = canonicalizeRole(user.role ?? '')
    if (canonical === 'engineer') {
      const name = user?.fullName ?? ''
      return tasks.filter(t => (t.assigned_engineer || '').split(',').map((s:string)=>s.trim()).includes(name))
    }
    if (canonical === 'customer' || canonical === 'customer_personnel') {
      const uid = Number(user?.userId ?? user?.id)
      return tasks.filter(t => Number(t.created_by) === uid || (t.creator_name && String(t.creator_name).toLowerCase().includes((user?.fullName ?? '').toLowerCase())))
    }
    if (canonical === 'shop_tl' || canonical === 'shop_manager') {
      const shopId = user?.shopId
      if (shopId) return tasks.filter(t => Number(t.shop_id) === Number(shopId))
      return tasks
    }
    return tasks
  }, [tasks, user])

  // Load dashboard metrics from backend API
  const loadDashboardMetrics = useCallback(async () => {
    // CRITICAL FIX: Check authentication before making API call
    if (!isAuthenticatedRef.current || !isMountedRef.current) {
      return;
    }

    setMetricsLoading(true);
    setError(null);

    // helper that performs fetch and handles 401 by trying a refresh and retrying once
    const fetchMetrics = async (): Promise<any | null> => {
      const headers: Record<string, string> = {
        'Accept': 'application/json',
      };
      // SECURITY FIX: Use getUsableBearerToken to avoid sending the
      // 'cookie-session' sentinel as a Bearer token. The HttpOnly cookie
      // is sent automatically via credentials: 'include' regardless.
      const usableToken = getUsableBearerToken(authToken);
      if (usableToken) {
        headers['Authorization'] = `Bearer ${usableToken}`;
      }

      const options: RequestInit = {
        method: 'GET',
        headers,
        credentials: 'include'
      };

      try {
        let response = await fetch('/api/dashboard', options);

        // If 401, try to refresh user / token then retry once
        if (response.status === 401) {
          // attempt refresh
          try {
            const refreshed = await refreshUser();
            if (refreshed) {
              // retry fetch once using updated in-memory token
              const retryHeaders: Record<string, string> = {
                'Accept': 'application/json',
              };
              const currentToken = getUsableBearerToken(secureAuthStore.getToken());
              if (currentToken) {
                retryHeaders['Authorization'] = `Bearer ${currentToken}`;
              }
              response = await fetch('/api/dashboard', {
                ...options,
                headers: retryHeaders
              });
            } else {
              // refresh failed: force logout + show friendly error
              setError('Authentication required. Please log in again.');
              try { await logout(); } catch {}
              return null;
            }
          } catch (refreshErr) {
            if (process.env.NODE_ENV === 'development') {
              console.debug('loadDashboardMetrics: refreshUser failed (debug):', refreshErr);
            }
            setError('Authentication required. Please log in again.');
            try { await logout(); } catch {}
            return null;
          }
        }

        if (!response.ok) {
          // user-friendly messages based on status
          if (response.status >= 500) {
            setError('Cannot reach the server. Please try again later.');
          } else if (response.status === 401) {
            // unexpected: ensure we've already attempted refresh; if still 401, log out
            setError('Authentication required. Please log in again.');
            try { await logout(); } catch {}
          } else {
            setError('Failed to load dashboard metrics from backend API.');
          }
          if (process.env.NODE_ENV === 'development') {
            try {
              const text = await response.text().catch(() => '<no body>');
              console.debug('loadDashboardMetrics: backend error (debug):', response.status, text);
            } catch {}
          }
          return null;
        }

        const metrics = await response.json();
        return metrics;
      } catch (err: any) {
        // network-level or other unexpected error
        if (process.env.NODE_ENV === 'development') {
          console.debug('loadDashboardMetrics: network/error (debug):', err);
        }
        setError('Cannot reach the server. Please try again later.');
        return null;
      }
    };

    try {
      const metrics = await fetchMetrics();

      // CRITICAL FIX: Check again before updating state
      if (!isAuthenticatedRef.current || !isMountedRef.current) {
        return;
      }

      if (!metrics) {
        // already set friendly error inside fetchMetrics
        // CRITICAL FIX: Do NOT reset dashboardMetrics to null if we previously
        // had valid data. This prevents the "zeros on refresh" issue when the
        // API call fails transiently during re-authentication.
        if (!hasLoadedOnceRef.current) {
          setDashboardMetrics(null);
        }
        return;
      }

      // Map backend response to frontend format
      const mappedMetrics: DashboardMetrics = {
        totalTasks: metrics.totalTasks || 0,
        tasksCompleted: metrics.tasksCompleted || 0,
        pendingTasks: metrics.pendingTasks || 0,
        inProgressTasks: metrics.inProgressTasks || 0,
        overdueTasks: metrics.overdueTasks || 0,
        completionRate: metrics.completionRate || 0,
        avgDelayDays: metrics.avgDelayDays || 0,
        completionRateFormatted: metrics.completionRateFormatted || `${(metrics.completionRate || 0).toFixed(2)}%`,
        avgDelayFormatted: metrics.avgDelayFormatted || `${(metrics.avgDelayDays || 0).toFixed(2)} days`,
        userRole: metrics.userRole || '',
        userShopId: metrics.userShopId,
        userShopName: metrics.userShopName,
        isRoleBasedView: metrics.isRoleBasedView || false,
        recentTasks: metrics.recentTasks || [],
        taskStatusBreakdown: metrics.taskStatusBreakdown || {}
      };
      
      setDashboardMetrics(mappedMetrics);
      // Mark that we have successfully loaded metrics at least once
      hasLoadedOnceRef.current = true;
    } catch (err: any) {
      // CRITICAL FIX: Only log error if still authenticated
      if (isAuthenticatedRef.current) {
        if (process.env.NODE_ENV === 'development') {
          console.debug('Failed to load dashboard metrics (debug):', err);
        }
        setError('Failed to load dashboard metrics from backend API.');
      }
      // CRITICAL FIX: Do NOT reset metrics to null if we had valid data before
      if (!hasLoadedOnceRef.current) {
        setDashboardMetrics(null);
      }
    } finally {
      if (isMountedRef.current) {
        setMetricsLoading(false);
      }
    }
  }, [authToken, refreshUser, logout]);

  // CRITICAL FIX: Enhanced useEffect with proper authentication checks.
  // This effect now also depends on `authToken` so that when the token
  // transitions from null/'cookie-session' to a real token after refreshUser()
  // completes, we re-fetch the metrics with proper authentication.
  useEffect(() => {
    // Don't fetch if auth is still loading or user is not authenticated
    if (authLoading || !isAuthenticated || !user) {
      return;
    }

    let mounted = true;
    const abortController = new AbortController();

    const load = async () => {
      // Double-check authentication before starting
      if (!isAuthenticatedRef.current || !mounted) {
        return;
      }

      setLoading(true);
      setError(null);
      
      try {
        await loadDashboardMetrics();

        // Check authentication again before fetching tasks
        if (!isAuthenticatedRef.current || !mounted) {
          return;
        }

        const res = await apiClient.getTasks().catch(() => []);
        
        // Check authentication after async operation
        if (!isAuthenticatedRef.current || !mounted) {
          return;
        }

        let list: any[] = [];
        if (Array.isArray(res)) list = res;
        else if (Array.isArray(res?.tasks)) list = res.tasks;
        else if (Array.isArray(res?.data)) list = res.data;
        else list = [];

        if (!mounted) return;
        const normalized = list.map((t: any) => ({
          task_id: Number(t.task_id ?? t.id ?? t.taskId ?? t.TaskId ?? 0),
          serial_number: t.serial_number ?? t.serialNumber ?? t.SerialNumber ?? '',
          part_number: t.part_number ?? t.partNumber ?? t.PartNumber ?? '',
          description: t.description ?? t.Description ?? t.details ?? '',
          // FIXED: Normalize status from raw numeric/string values to human-readable labels
          status: normalizeStatus(t.status ?? t.Status ?? t.taskStatus ?? 0),
          assigned_engineer: (t.assigned_engineer ?? t.assigned ?? t.assignedEngineer ?? t.AssignedEngineer ?? '').toString(),
          priority_level_name: t.priority_level_name ?? t.priority_name ?? t.priority ?? t.PriorityName ?? '',
          creator_name: t.creator_name ?? t.created_by_name ?? t.createdByName ?? t.CreatedByName ?? t.creator ?? '',
          created_by: t.created_by ?? t.createdBy ?? t.CreatedBy ?? t.creator_id ?? null,
          target_completion_date: t.target_completion_date ?? t.targetCompletionDate ?? t.TargetCompletionDate ?? null,
          estimated_completion_date: t.estimated_completion_date ?? t.estimatedCompletionDate ?? t.EstimatedCompletionDate ?? null,
          actual_completion_date: t.actual_completion_date ?? t.actualCompletionDate ?? t.ActualCompletionDate ?? null,
          created_at: t.created_at ?? t.createdAt ?? t.CreatedAt ?? t.TaskCreatedAt ?? new Date().toISOString(),
          updated_at: t.updated_at ?? t.updatedAt ?? t.UpdatedAt ?? t.TaskUpdatedAt ?? '',
          attachment_path: t.attachment_path ?? t.attachment ?? t.AttachmentPath ?? null,
          is_duplicate: !!(t.is_duplicate ?? t.IsDuplicate),
          show_revision_alert: !!(t.show_revision_alert ?? t.ShowRevisionAlert),
          shop_id: t.shop_id ?? t.shopId ?? t.ShopId ?? null,
          ...t
        })) as Task[];

        setTasks(normalized);
      } catch (err: any) {
        // Only log and set error if still authenticated
        if (isAuthenticatedRef.current && mounted) {
          if (process.env.NODE_ENV === 'development') {
            console.debug('Load error (debug)', err);
          }
          setError('Failed to load tasks. Check backend.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      mounted = false;
      abortController.abort();
    };
  }, [authLoading, isAuthenticated, user, loadDashboardMetrics]);

  useEffect(() => {
    const handleOpenCreateTask = (e: Event) => {
      try {
        if (!canCreateTasks) return
        setIsCreateTaskOpen(true)
        try { router.replace('/dashboard?openCreate=1') } catch {}
      } catch (err) {
        if (canCreateTasks) setIsCreateTaskOpen(true)
      }
    }

    window.addEventListener('openCreateTask', handleOpenCreateTask)
    return () => window.removeEventListener('openCreateTask', handleOpenCreateTask)
  }, [user, router, canCreateTasks])

  useEffect(() => {
    try {
      const val = searchParams?.get?.('openCreate')
      if (val === '1') {
        if (canCreateTasks) setIsCreateTaskOpen(true)
      }
    } catch {}
  }, [searchParams, user, canCreateTasks])

  useEffect(() => {
    if (!isCreateTaskOpen) {
      try {
        const val = searchParams?.get?.('openCreate')
        if (val === '1') {
          router.replace('/dashboard')
        }
      } catch {}
    }
  }, [isCreateTaskOpen, searchParams, router])

  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent('tasks:filters', { detail: { searchQuery, statusFilter, sortBy, showDuplicates } }));
    } catch {}
  }, [searchQuery, statusFilter, sortBy, showDuplicates]);

  // FIXED: Handler for Pending Tasks - Fetch from backend API to get correct data
  const handlePendingClick = async () => {
    // CRITICAL FIX: Check authentication before making API call
    if (!isAuthenticatedRef.current) {
      return;
    }

    try {
      // Fetch pending tasks analytics from backend API
      const pendingHeaders: Record<string, string> = { 'Accept': 'application/json' };
      const pendingToken = getUsableBearerToken(authToken);
      if (pendingToken) pendingHeaders['Authorization'] = `Bearer ${pendingToken}`;
      const response = await fetch('/api/analytics/pending-tasks', {
        method: 'GET',
        headers: pendingHeaders,
        credentials: 'include'
      });

      // CRITICAL FIX: Check authentication after fetch
      if (!isAuthenticatedRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch pending tasks analytics: ${response.status}`);
      }

      const backendData = await response.json();

      // Use backend data directly
      setAnalyticsData({
        type: 'pending',
        title: 'Pending Tasks Analysis',
        description: 'Comprehensive breakdown of all pending/active tasks requiring attention',
        data: {
          totalPending: backendData.totalPending || 0,
          overdue: backendData.overdue || 0,
          byStatus: backendData.byStatus || {},
          byPriority: backendData.byPriority || {},
          byEngineer: backendData.byEngineer || {},
          pendingTasks: (backendData.pendingTasks || []).map((item: any) => ({
            taskId: item.taskId,
            serialNumber: item.serialNumber || '',
            partNumber: item.partNumber || '',
            description: item.description || '',
            status: item.status || 'Unknown',
            priority: item.priority || 'N/A',
            engineer: item.engineer || 'Unassigned',
            targetDate: item.targetDate,
            createdAt: item.createdAt,
            isOverdue: item.isOverdue || false
          }))
        }
      });
      setAnalyticsOpen(true);
    } catch (error) {
      // Only handle error if still authenticated
      if (!isAuthenticatedRef.current) {
        return;
      }

      console.error('Error fetching pending tasks analytics:', error);
      
      // Fallback to local data if backend fails
      const pendingTasks = scopedTasks.filter(t => {
        const ns = normalizeStatus(t.status ?? 'Unknown').toLowerCase();
        return ns === 'pending' || ns === 'in progress' || ns === 'blocked' || ns === 'on hold';
      });

      const byStatus: Record<string, number> = {};
      pendingTasks.forEach(task => {
        const status = normalizeStatus(task.status || 'Unknown');
        byStatus[status] = (byStatus[status] || 0) + 1;
      });

      const byPriority: Record<string, number> = {};
      pendingTasks.forEach(task => {
        const priority = normalizePriority(task.priority_level_name || task.priority || 'Unknown');
        byPriority[priority] = (byPriority[priority] || 0) + 1;
      });

      const byEngineer: Record<string, number> = {};
      pendingTasks.forEach(task => {
        const engineers = splitAndNormalizeEngineers(task.assigned_engineer || 'Unassigned');
        engineers.forEach(engineer => {
          byEngineer[engineer] = (byEngineer[engineer] || 0) + 1;
        });
      });

      const now = new Date();
      const overdueTasks = pendingTasks.filter(t => {
        const targetDate = t.target_completion_date || t.estimated_completion_date;
        if (!targetDate) return false;
        return new Date(targetDate) < now;
      });

      setAnalyticsData({
        type: 'pending',
        title: 'Pending Tasks Analysis',
        description: 'Comprehensive breakdown of all pending/active tasks requiring attention',
        data: {
          totalPending: pendingTasks.length,
          overdue: overdueTasks.length,
          byStatus,
          byPriority,
          byEngineer,
          pendingTasks: pendingTasks.slice(0, 15).map(t => ({
            taskId: t.task_id,
            serialNumber: t.serial_number,
            partNumber: t.part_number,
            description: t.description,
            status: normalizeStatus(t.status || 'Unknown'),
            priority: normalizePriority(t.priority_level_name || t.priority || 'N/A'),
            engineer: (splitAndNormalizeEngineers(t.assigned_engineer || 'Unassigned')).join(', '),
            targetDate: t.target_completion_date || t.estimated_completion_date,
            createdAt: t.created_at,
            isOverdue: overdueTasks.some(ot => ot.task_id === t.task_id)
          }))
        }
      });
      setAnalyticsOpen(true);
    }
  }

  // Handler for Completion Rate - Fetch from backend API with category distribution
  const handleCompletionRateClick = async () => {
    // CRITICAL FIX: Check authentication
    if (!isAuthenticatedRef.current) {
      return;
    }

    try {
      // Fetch completion rate analytics from backend API
      const completionHeaders: Record<string, string> = { 'Accept': 'application/json' };
      const completionToken = getUsableBearerToken(authToken);
      if (completionToken) completionHeaders['Authorization'] = `Bearer ${completionToken}`;
      const response = await fetch('/api/analytics/completion-rate', {
        method: 'GET',
        headers: completionHeaders,
        credentials: 'include'
      });

      if (!isAuthenticatedRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch completion rate analytics: ${response.status}`);
      }

      const backendData = await response.json();

      // Use backend data with category distribution
      setAnalyticsData({
        type: 'completion',
        title: 'Completion Rate Analysis',
        description: 'Comprehensive breakdown of task completion metrics by category and engineer',
        data: {
          totalTasks: backendData.totalTasks || 0,
          completedTasks: backendData.completedTasks || 0,
          inProgressTasks: backendData.inProgressTasks || 0,
          pendingTasks: backendData.pendingTasks || 0,
          blockedTasks: backendData.blockedTasks || 0,
          onHoldTasks: backendData.onHoldTasks || 0,
          completionRate: backendData.completionRate || 0,
          statusBreakdown: backendData.statusBreakdown || {},
          categoryDistribution: backendData.categoryDistribution || {},
          completionTrend: (backendData.completionTrend || []).map((item: any) => ({
            taskId: item.taskId,
            serialNumber: item.serialNumber || '',
            partNumber: item.partNumber || '',
            description: item.description || '',
            date: item.date,
            engineer: item.engineer || 'Unassigned',
            priority: item.priority || 'N/A',
            delayDays: item.delayDays || 0
          }))
        }
      });
      setAnalyticsOpen(true);
    } catch (error) {
      if (!isAuthenticatedRef.current) {
        return;
      }

      console.error('Error fetching completion rate analytics:', error);
      
      // Fallback to basic display if backend fails
      if (!dashboardMetrics) return;

      const completedTasks = scopedTasks.filter(t => String(t.status).toLowerCase().includes('completed'));
      const inProgressTasks = scopedTasks.filter(t => String(t.status).toLowerCase().includes('progress'));
      const pendingTasks = scopedTasks.filter(t => String(t.status).toLowerCase().includes('pending'));
      const blockedTasks = scopedTasks.filter(t => String(t.status).toLowerCase().includes('blocked'));
      const onHoldTasks = scopedTasks.filter(t => String(t.status).toLowerCase().includes('hold'));
      
      const statusBreakdown: Record<string, number> = dashboardMetrics.taskStatusBreakdown || {};

      const completionTrend = completedTasks
        .filter(t => t.actual_completion_date || t.created_at)
        .sort((a, b) => {
          const dateA = new Date(a.actual_completion_date || a.created_at || 0).getTime();
          const dateB = new Date(b.actual_completion_date || b.created_at || 0).getTime();
          return dateB - dateA;
        })
        .slice(0, 10)
        .map(t => {
          let delayDays = 0;
          if (t.actual_completion_date && t.target_completion_date) {
            const actual = new Date(t.actual_completion_date);
            const target = new Date(t.target_completion_date);
            delayDays = Math.round((actual.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
          }
          return {
            taskId: t.task_id,
            serialNumber: t.serial_number,
            partNumber: t.part_number,
            description: t.description,
            date: t.actual_completion_date || t.created_at,
            engineer: t.assigned_engineer || 'Unassigned',
            priority: t.priority_level_name || 'N/A',
            delayDays
          };
        });

      setAnalyticsData({
        type: 'completion',
        title: 'Completion Rate Analysis',
        description: 'Comprehensive breakdown of task completion metrics across all statuses',
        data: {
          totalTasks: dashboardMetrics.totalTasks,
          completedTasks: dashboardMetrics.tasksCompleted,
          inProgressTasks: inProgressTasks.length,
          pendingTasks: pendingTasks.length,
          blockedTasks: blockedTasks.length,
          onHoldTasks: onHoldTasks.length,
          completionRate: dashboardMetrics.completionRate,
          statusBreakdown,
          categoryDistribution: {},
          completionTrend
        }
      });
      setAnalyticsOpen(true);
    }
  }

  // Handler for Avg Delay - Fetch from backend API
  const handleAvgDelayClick = async () => {
    if (!dashboardMetrics || !isAuthenticatedRef.current) return;

    try {
      // Fetch delay analytics from backend API
      const delayHeaders: Record<string, string> = { 'Accept': 'application/json' };
      const delayToken = getUsableBearerToken(authToken);
      if (delayToken) delayHeaders['Authorization'] = `Bearer ${delayToken}`;
      const response = await fetch('/api/analytics/avg-delay', {
        method: 'GET',
        headers: delayHeaders,
        credentials: 'include'
      });

      if (!isAuthenticatedRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch delay analytics: ${response.status}`);
      }

      const backendData = await response.json();

      // Map backend response to frontend format
      const delayBreakdown = (backendData.delayBreakdown || []).map((item: any) => ({
        taskId: item.taskId,
        serialNumber: item.serialNumber || '',
        partNumber: item.partNumber || '',
        description: item.description || '',
        delayDays: item.delayDays || 0,
        status: item.status || 'Unknown',
        actualDate: item.actualDate || '',
        targetDate: item.targetDate || '',
        engineer: item.engineer || 'Unassigned',
        priority: item.priority || 'N/A'
      }));

      setAnalyticsData({
        type: 'delay',
        title: 'Average Delay Analysis',
        description: 'Detailed breakdown of task completion timing relative to target dates',
        data: {
          avgDelayDays: backendData.avgDelayDays || 0,
          avgLateDelay: backendData.avgLateDelay || 0,
          avgEarlyDelivery: backendData.avgEarlyDelivery || 0,
          totalAnalyzed: backendData.totalAnalyzed || 0,
          onTime: backendData.onTime || 0,
          early: backendData.early || 0,
          late: backendData.late || 0,
          onTimePercentage: backendData.onTimePercentage || '0',
          earlyPercentage: backendData.earlyPercentage || '0',
          latePercentage: backendData.latePercentage || '0',
          delayBreakdown: delayBreakdown
        }
      });
      setAnalyticsOpen(true);
    } catch (error) {
      if (!isAuthenticatedRef.current) {
        return;
      }

      console.error('Error fetching delay analytics:', error);
      // Fallback to empty data
      setAnalyticsData({
        type: 'delay',
        title: 'Average Delay Analysis',
        description: 'Detailed breakdown of task completion timing relative to target dates',
        data: {
          avgDelayDays: dashboardMetrics.avgDelayDays || 0,
          avgLateDelay: 0,
          avgEarlyDelivery: 0,
          totalAnalyzed: 0,
          onTime: 0,
          early: 0,
          late: 0,
          onTimePercentage: '0',
          earlyPercentage: '0',
          latePercentage: '0',
          delayBreakdown: []
        }
      });
      setAnalyticsOpen(true);
    }
  }

  // Handler for Tasks Completed - Fetch from backend API
  const handleTasksCompletedClick = async () => {
    if (!dashboardMetrics || !isAuthenticatedRef.current) return;

    try {
      // Fetch tasks completed analytics from backend API
      const completedHeaders: Record<string, string> = { 'Accept': 'application/json' };
      const completedToken = getUsableBearerToken(authToken);
      if (completedToken) completedHeaders['Authorization'] = `Bearer ${completedToken}`;
      const response = await fetch('/api/analytics/tasks-completed', {
        method: 'GET',
        headers: completedHeaders,
        credentials: 'include'
      });

      if (!isAuthenticatedRef.current) {
        return;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch tasks completed analytics: ${response.status}`);
      }

      const backendData = await response.json();

      // Map backend response to frontend format
      const byPriority: Record<string, number> = backendData.byPriority || {};
      const byEngineer: Record<string, number> = backendData.byEngineer || {};
      const priorityStats: Record<string, { completed: number; total: number; rate: number }> = backendData.priorityStats || {};
      
      const recentCompletions = (backendData.recentCompletions || []).map((item: any) => ({
        taskId: item.taskId,
        serialNumber: item.serialNumber || '',
        partNumber: item.partNumber || '',
        description: item.description || '',
        completedDate: item.completedDate || item.actualCompletionDate,
        engineer: item.engineer || item.assignedEngineer || 'Unassigned',
        priority: item.priority || item.priorityName || 'N/A',
        createdDate: item.createdDate || item.createdAt
      }));

      setAnalyticsData({
        type: 'completed',
        title: 'Tasks Completed Analysis',
        description: 'Comprehensive breakdown of completed tasks by priority, engineer, and timeline',
        data: {
          totalCompleted: backendData.totalCompleted || dashboardMetrics.tasksCompleted,
          byPriority,
          byEngineer,
          priorityStats,
          recentCompletions
        }
      });
      setAnalyticsOpen(true);
    } catch (error) {
      if (!isAuthenticatedRef.current) {
        return;
      }

      console.error('Error fetching tasks completed analytics:', error);
      
      // Fallback to local data if backend fails
      const completedTasks = scopedTasks.filter(t => String(t.status).toLowerCase().includes('completed'));
      
      const byPriority: Record<string, number> = {};
      completedTasks.forEach(task => {
        const priority = normalizePriority(task.priority_level_name || task.priority || 'Unknown');
        byPriority[priority] = (byPriority[priority] || 0) + 1;
      });

      const byEngineer: Record<string, number> = {};
      completedTasks.forEach(task => {
        const engineers = splitAndNormalizeEngineers(task.assigned_engineer || 'Unassigned');
        engineers.forEach(engineer => {
          byEngineer[engineer] = (byEngineer[engineer] || 0) + 1;
        });
      });

      const priorityStats: Record<string, { completed: number; total: number; rate: number }> = {};
      ['High', 'Medium', 'Low'].forEach(priority => {
        const total = scopedTasks.filter(t => normalizePriority(t.priority_level_name || t.priority || '') === priority).length;
        const completed = completedTasks.filter(t => normalizePriority(t.priority_level_name || t.priority || '') === priority).length;
        if (total > 0) {
          priorityStats[priority] = {
            completed,
            total,
            rate: (completed / total) * 100
          };
        }
      });

      const recentCompletions = completedTasks
        .filter(t => t.actual_completion_date || t.created_at)
        .sort((a, b) => {
          const dateA = new Date(a.actual_completion_date || a.created_at || 0).getTime();
          const dateB = new Date(b.actual_completion_date || b.created_at || 0).getTime();
          return dateB - dateA;
        })
        .slice(0, 10)
        .map(t => ({
          taskId: t.task_id,
          serialNumber: t.serial_number,
          partNumber: t.part_number,
          description: t.description,
          completedDate: t.actual_completion_date || t.created_at,
          engineer: t.assigned_engineer || 'Unassigned',
          priority: t.priority_level_name || 'N/A',
          createdDate: t.created_at
        }));

      setAnalyticsData({
        type: 'completed',
        title: 'Tasks Completed Analysis',
        description: 'Comprehensive breakdown of completed tasks by priority, engineer, and timeline',
        data: {
          totalCompleted: dashboardMetrics.tasksCompleted,
          byPriority,
          byEngineer,
          priorityStats,
          recentCompletions
        }
      });
      setAnalyticsOpen(true);
    }
  }

  // Use backend metrics directly - NO fallback calculations
  // CRITICAL FIX: Show loading indicator instead of zeros when metrics haven't loaded yet
  const displayMetrics = dashboardMetrics || {
    totalTasks: 0,
    tasksCompleted: 0,
    pendingTasks: 0,
    completionRate: 0,
    avgDelayDays: 0,
    completionRateFormatted: '—',
    avgDelayFormatted: '—'
  };

  // Non-destructive runtime cleanup
  useEffect(() => {
    if (!analyticsOpen) return;
    const t = setTimeout(() => {
      try {
        const root = document.querySelector('.analytics-dialog-root') || document.querySelector('[role="dialog"]');
        if (!root) return;
        const buttons = Array.from(root.querySelectorAll('button'));
        const iconButtons = buttons.filter(b => !!b.querySelector('svg'));
        if (iconButtons.length > 1) {
          iconButtons.forEach(b => {
            if (!b.classList.contains('analytics-close-btn')) {
              (b as HTMLElement).style.display = 'none';
            } else {
              (b as HTMLElement).style.display = '';
            }
          });
        }
      } catch (err) {}
    }, 40);

    return () => clearTimeout(t);
  }, [analyticsOpen]);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {error && (
              <div className="rounded-md bg-red-50 p-3">
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}

            {/* Metrics row — all 4 cards are always rendered in a 4-column grid with actual data.
                - Completion Rate, Avg. Delay, Tasks Completed & Pending Tasks: always fully visible
                - Analytics click-through on all cards: always enabled */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {(metricsLoading && !dashboardMetrics) || isLoadingTLPermissions ? (
                <div className="col-span-4 flex items-center justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <span className="ml-2">Loading metrics...</span>
                </div>
              ) : (
                <>
                  {/* Completion Rate — always displayed with actual data, always clickable */}
                  <button
                    type="button"
                    onClick={handleCompletionRateClick}
                    className="metric-card metric-completion group transition-all hover:shadow-lg cursor-pointer"
                    aria-label="Completion Rate — click to view analytics"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="title">Completion</div>
                      <BarChart3 className="h-5 w-5 text-blue-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="value">{displayMetrics.completionRateFormatted}</div>
                    <div className="note">Click for detailed analytics</div>
                  </button>

                  {/* Avg. Delay — always displayed with actual data, always clickable */}
                  <button
                    type="button"
                    onClick={handleAvgDelayClick}
                    className="metric-card metric-avgdelay group transition-all hover:shadow-lg cursor-pointer"
                    aria-label="Average delay — click to view analytics"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="title">Avg. Delay</div>
                      <Clock className="h-5 w-5 text-orange-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="value">{displayMetrics.avgDelayFormatted}</div>
                    <div className="note">Click for detailed analytics</div>
                  </button>

                  {/* Tasks Completed — always clickable */}
                  <button
                    type="button"
                    onClick={handleTasksCompletedClick}
                    className="metric-card metric-completed group transition-all hover:shadow-lg cursor-pointer"
                    aria-label="Tasks Completed — click to view analytics"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="title">Tasks Completed</div>
                      <CheckCircle2 className="h-5 w-5 text-green-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="value">{displayMetrics.tasksCompleted}</div>
                    <div className="note">Click for detailed analytics</div>
                  </button>

                  {/* Pending Tasks — always clickable */}
                  <button
                    type="button"
                    onClick={handlePendingClick}
                    className="metric-card metric-pending group transition-all hover:shadow-lg cursor-pointer"
                    aria-label="Pending Tasks — click to view analytics"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="title">Pending Tasks</div>
                      <TrendingUp className="h-5 w-5 text-red-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="value">{displayMetrics.pendingTasks}</div>
                    <div className="note">Click to view pending tasks</div>
                  </button>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-center">
              <div className="flex items-center gap-4 col-span-2">
               
              </div>
              <div className="relative flex-1 md:col-span-2" />
            </div>

            {/* Task table */}
            <div id="task-table" className="bg-white rounded shadow p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  {/* REPLACED: the "Select all tasks" checkbox/label removed and replaced by the two logos as requested */}
                  <div className="flex items-center gap-3">
                    <img src="https://cdn.imgbin.com/18/13/16/imgbin-ethiopian-airlines-flight-logo-business-business-6fvk0fGfDtxUuLSkpNq6weQLi.jpg" alt="Logo" className="h-20 w-auto md:h-25"  />
                    <a
                     
                    >
                      <img src="https://portal.ethiopianairlines.com/default/Ops/MRO/Comp_Maint/Com_MaintSup/Production/Shared%20Documents/WEEKLY%20PERFORMANCE%20REPORT/AVIONICS_WEEKLY_PERFORMANCE_REPORT/CMT%20Eng%20Task%20Management/Image%20CMT%20Eng%20Task%20Management/Image.png" alt="CMT Eng @ Santa" className="h-20 w-auto md:h-25" />
                    </a>
                  </div>
                </div>

                <div>
                  <Dialog open={isCreateTaskOpen} onOpenChange={setIsCreateTaskOpen}>
                    <DialogTrigger asChild>
                      <Button className="flex items-center" disabled={!canCreateTasks}>
                        <Plus className="h-4 w-4 mr-2" /> Create Task
                      </Button>
                    </DialogTrigger>

                    <DialogContent className="max-w-2xl">
                      <DialogHeader><DialogTitle>Create New Task</DialogTitle></DialogHeader>
                      <CreateTaskForm onClose={() => setIsCreateTaskOpen(false)} onTaskCreated={(newTask: any) => {
                        const t: Task = {
                          task_id: Number(newTask.task_id ?? newTask.id ?? newTask.taskId ?? newTask.TaskId ?? 0),
                          serial_number: newTask.serial_number ?? newTask.serialNumber ?? newTask.SerialNumber ?? '',
                          part_number: newTask.part_number ?? newTask.partNumber ?? newTask.PartNumber ?? '',
                          description: newTask.description ?? newTask.Description ?? newTask.details ?? '',
                          status: newTask.status ?? newTask.Status ?? 'Pending',
                          assigned_engineer: newTask.assigned_engineer ?? newTask.assigned ?? newTask.AssignedEngineer ?? '',
                          priority_level_name: newTask.priority_level_name ?? newTask.priority ?? newTask.PriorityName ?? '',
                          creator_name: newTask.creator_name ?? newTask.created_by_name ?? newTask.CreatedByName ?? '',
                          target_completion_date: newTask.target_completion_date ?? newTask.target_date ?? newTask.TargetCompletionDate ?? null,
                          created_at: newTask.created_at ?? newTask.createdAt ?? newTask.CreatedAt ?? new Date().toISOString(),
                          updated_at: newTask.updated_at ?? newTask.updatedAt ?? newTask.UpdatedAt ?? '',
                          attachment_path: newTask.attachment_path ?? newTask.attachmentPath ?? newTask.AttachmentPath ?? null,
                          is_duplicate: !!(newTask.is_duplicate ?? newTask.IsDuplicate),
                          show_revision_alert: !!(newTask.show_revision_alert ?? newTask.ShowRevisionAlert),
                        };
                        setTasks((prev) => [t, ...prev]);
                        try { window.dispatchEvent(new CustomEvent('tasks:refresh')) } catch {}
                        loadDashboardMetrics();
                      }} canAssign={canAssignEngineers} />
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 md:gap-3 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input placeholder="Search by Serial Number, Part Number, PO Number, or Task ID" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
                </div>

                <Button onClick={() => { setSearchQuery(''); setStatusFilter('all'); }} variant="outline">Clear Search</Button>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="All status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Blocked">Blocked</SelectItem>
                    <SelectItem value="On Hold">On Hold</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                    <SelectItem value="Paused">Paused</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sortBy} onValueChange={setSortBy as any}>
                  <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Sort By" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="priority_desc">Priority (High to Low)</SelectItem>
                    <SelectItem value="priority_asc">Priority (Low to High)</SelectItem>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="oldest">Oldest First</SelectItem>
                  </SelectContent>
                </Select>

                <Button variant={'outline' as any} onClick={() => setShowDuplicates((s) => !s)}>
                  {showDuplicates ? 'Duplicates: ON' : 'Show Duplicates'}
                </Button>
              </div>

              <TaskTable />
            </div>
          </div>

          <aside className="space-y-6">
            {/* Engineer Workload — gated by effectiveCanViewEngineerWorkload which
                combines role matrix + director-specific + TL-specific permissions */}
            {effectiveCanViewEngineerWorkload && <EngineerWorkload />}
            <RecentNotifications />
          </aside>
        </div>
      </div>

     {/* Analytics Dialog */}
      <Dialog open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
        <DialogContent className="analytics-dialog-root max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between text-xl">
              <span>{analyticsData?.title}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setAnalyticsOpen(false)}
                className="analytics-close-btn ml-3 p-1 rounded-md hover:bg-gray-100 focus:outline-none"
                aria-label="Close analytics dialog"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
            <DialogDescription className="text-base">{analyticsData?.description}</DialogDescription>
          </DialogHeader>

          {analyticsData && (
            <div className="space-y-6 mt-4">
              {analyticsData.type === 'completion' && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card className="border-2 border-green-200 bg-green-50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-green-700">Completed</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-green-700">{analyticsData.data.completedTasks}</div>
                        <p className="text-xs text-green-600 mt-1">Successfully finished</p>
                      </CardContent>
                    </Card>
                    <Card className="border-2 border-blue-200 bg-blue-50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-blue-700">Completion Rate</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-blue-700">{analyticsData.data.completionRate.toFixed(1)}%</div>
                        <p className="text-xs text-blue-600 mt-1">Overall success rate</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* NEW: Category Distribution with Engineer Breakdown */}
                  {analyticsData.data.categoryDistribution && Object.keys(analyticsData.data.categoryDistribution).length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Distribution by Category & Engineer</CardTitle>
                        <CardDescription>Task distribution across categories with engineer workload breakdown</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {Object.entries(analyticsData.data.categoryDistribution).map(([categoryName, categoryData]: [string, any]) => (
                            <div key={categoryName} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                                  <span className="font-semibold text-gray-900 text-lg">{categoryName}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm text-gray-600">{categoryData.completionRate.toFixed(1)}%</span>
                                  <span className="text-sm font-semibold bg-blue-100 text-blue-700 px-3 py-1 rounded-full">
                                    {categoryData.totalTasks} tasks
                                  </span>
                                </div>
                              </div>
                              
                              {/* Engineer distribution for this category */}
                              {Object.keys(categoryData.engineerDistribution).length > 0 && (
                                <div className="ml-6 mt-3 space-y-2">
                                  <div className="text-sm font-medium text-gray-600 mb-2">Engineers:</div>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {Object.entries(categoryData.engineerDistribution)
                                      .sort(([, a], [, b]) => (b as number) - (a as number))
                                      .map(([engineer, count]) => {
                                        const percentage = ((count as number) / categoryData.totalTasks * 100).toFixed(1);
                                        return (
                                          <div key={engineer} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
                                            <span className="text-sm text-gray-700">{engineer}</span>
                                            <div className="flex items-center gap-2">
                                              <span className="text-xs text-gray-500">{percentage}%</span>
                                              <span className="text-xs font-semibold bg-gray-200 px-2 py-0.5 rounded">{count as number}</span>
                                            </div>
                                          </div>
                                        );
                                      })}
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {analyticsData.data.completionTrend.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Recent Completions</CardTitle>
                        <CardDescription>Latest {analyticsData.data.completionTrend.length} completed tasks with timing details</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {analyticsData.data.completionTrend.map((item: any) => (
                            <div key={item.taskId} className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{item.serialNumber}</span>
                                  <span className="text-xs text-gray-500">{item.partNumber}</span>
                                </div>
                                <div className="font-medium text-sm text-gray-900 mb-1">{item.description}</div>
                                <div className="flex items-center gap-3 text-xs text-gray-600">
                                  <span>👤 {item.engineer}</span>
                                  <span>📅 {new Date(item.date).toLocaleDateString()}</span>
                                  <span className={`px-2 py-0.5 rounded ${getPriorityColorClass(item.priority)}`}>
                                    {item.priority} Priority
                                  </span>
                                </div>
                              </div>
                              <span className={`ml-3 px-3 py-1 rounded-full text-sm font-semibold whitespace-nowrap ${getDelayColorClass(item.delayDays)}`}>
                                {formatDelayText(item.delayDays)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {analyticsData.type === 'delay' && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card className="border-2 border-orange-200 bg-orange-50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-orange-700">Overall Avg Delay</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-orange-700">{analyticsData.data.avgDelayDays.toFixed(1)}d</div>
                        <p className="text-xs text-orange-600 mt-1">All completed tasks</p>
                      </CardContent>
                    </Card>
                    <Card className="border-2 border-gray-200">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-gray-700">On Time</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-gray-700">{analyticsData.data.onTime}</div>
                        <p className="text-xs text-gray-600 mt-1">{analyticsData.data.onTimePercentage}% of total</p>
                      </CardContent>
                    </Card>
                    <Card className="border-2 border-green-200 bg-green-50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-green-700">Early Delivery</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-green-700">{analyticsData.data.early}</div>
                        <p className="text-xs text-green-600 mt-1">{analyticsData.data.earlyPercentage}% • Avg {analyticsData.data.avgEarlyDelivery.toFixed(1)}d early</p>
                      </CardContent>
                    </Card>
                    <Card className="border-2 border-red-200 bg-red-50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-red-700">Late Delivery</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-red-700">{analyticsData.data.late}</div>
                        <p className="text-xs text-red-600 mt-1">{analyticsData.data.latePercentage}% • Avg +{analyticsData.data.avgLateDelay.toFixed(1)}d late</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Detailed Delay Analysis</CardTitle>
                      <CardDescription>
                        Showing {analyticsData.data.delayBreakdown.length} of {analyticsData.data.totalAnalyzed} completed tasks with target dates
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {analyticsData.data.delayBreakdown.map((item: any) => (
                          <div key={item.taskId} className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{item.serialNumber}</span>
                                <span className="text-xs text-gray-500">{item.partNumber}</span>
                              </div>
                              <div className="font-medium text-sm text-gray-900 mb-2">{item.description}</div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-500">Target:</span>
                                  <span className="ml-1 font-medium">{item.targetDate}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Actual:</span>
                                  <span className="ml-1 font-medium">{item.actualDate}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Engineer:</span>
                                  <span className="ml-1 font-medium">{item.engineer}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Priority:</span>
                                  <span className={`ml-1 px-2 py-0.5 rounded ${getPriorityColorClass(item.priority)}`}>
                                    {item.priority}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="ml-4 text-right">
                              <div className={`text-2xl font-bold ${
                                item.delayDays > 0 ? 'text-red-600' : 
                                item.delayDays < 0 ? 'text-green-600' : 
                                'text-gray-600'
                              }`}>
                                {item.delayDays > 0 ? `+${item.delayDays}` : item.delayDays}d
                              </div>
                              <div className={`text-xs font-medium mt-1 px-2 py-1 rounded ${
                                item.status === 'Late Delivery' ? 'bg-red-100 text-red-700' :
                                item.status === 'Early Delivery' ? 'bg-green-100 text-green-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {item.status}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              {analyticsData.type === 'completed' && (
                <>
                  <Card className="border-2 border-green-200 bg-green-50">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm text-green-700">Total Completed Tasks</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-4xl font-bold text-green-700">{analyticsData.data.totalCompleted}</div>
                      <p className="text-sm text-green-600 mt-2">Successfully finished tasks across all priorities and engineers</p>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Completion by Priority</CardTitle>
                        <CardDescription>Distribution and completion rates by priority level</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {Object.keys(analyticsData.data.priorityStats).length > 0 ? (
                            Object.entries(analyticsData.data.priorityStats).map(([priority, stats]: [string, any]) => (
                              <div key={priority} className="p-3 border rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                  <span className={`font-semibold ${
                                    priority === 'High' ? 'text-red-600' :
                                    priority === 'Medium' ? 'text-yellow-600' :
                                    'text-green-600'
                                  }`}>{priority} Priority</span>
                                  <span className="text-sm font-bold text-gray-700">{stats.rate.toFixed(1)}%</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                  <span>{stats.completed} completed</span>
                                  <span>•</span>
                                  <span>{stats.total} total</span>
                                </div>
                                <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                                  <div 
                                    className={`h-2 rounded-full ${
                                      priority === 'High' ? 'bg-red-500' :
                                      priority === 'Medium' ? 'bg-yellow-500' :
                                      'bg-green-500'
                                    }`}
                                    style={{ width: `${stats.rate}%` }}
                                  />
                                </div>
                              </div>
                            ))
                          ) : (
                            Object.entries(analyticsData.data.byPriority).length > 0 ? (
                              Object.entries(analyticsData.data.byPriority)
                                .sort(([, a], [, b]) => (b as number) - (a as number))
                                .map(([priority, count]) => {
                                  const percentage = ((count as number) / analyticsData.data.totalCompleted * 100).toFixed(1);
                                  return (
                                    <div key={priority} className="p-3 border rounded-lg">
                                      <div className="flex items-center justify-between mb-2">
                                        <span className={`font-semibold ${
                                          priority === 'High' ? 'text-red-600' :
                                          priority === 'Medium' ? 'text-yellow-600' :
                                          'text-green-600'
                                        }`}>{priority} Priority</span>
                                        <span className="text-sm font-bold text-gray-700">{percentage}%</span>
                                      </div>
                                      <div className="flex items-center gap-2 text-sm text-gray-600">
                                        <span>{count as number} completed tasks</span>
                                      </div>
                                    </div>
                                  );
                                })
                            ) : (
                              <p className="text-sm text-gray-500 text-center py-4">No priority data available</p>
                            )
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Completion by Engineer</CardTitle>
                        <CardDescription>Top performers ranked by completed tasks</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 max-h-80 overflow-y-auto">
                          {Object.keys(analyticsData.data.byEngineer).length > 0 ? (
                            Object.entries(analyticsData.data.byEngineer)
                              .sort(([, a], [, b]) => (b as number) - (a as number))
                              .map(([engineer, count], index) => {
                                const percentage = ((count as number) / analyticsData.data.totalCompleted * 100).toFixed(1);
                                return (
                                  <div key={engineer} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                                    <div className="flex items-center gap-3">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                        index === 0 ? 'bg-yellow-100 text-yellow-700' :
                                        index === 1 ? 'bg-gray-100 text-gray-700' :
                                        index === 2 ? 'bg-orange-100 text-orange-700' :
                                        'bg-blue-50 text-blue-600'
                                      }`}>
                                        #{index + 1}
                                      </div>
                                      <span className="font-medium text-gray-900">{engineer}</span>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      <span className="text-sm text-gray-600">{percentage}%</span>
                                      <span className="text-sm font-semibold bg-green-100 text-green-700 px-3 py-1 rounded-full">
                                        {count as number} tasks
                                      </span>
                                    </div>
                                  </div>
                                );
                              })
                          ) : (
                            <p className="text-sm text-gray-500 text-center py-4">No engineer data available</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {analyticsData.data.recentCompletions.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Recent Completions</CardTitle>
                        <CardDescription>Latest {analyticsData.data.recentCompletions.length} completed tasks with full details</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {analyticsData.data.recentCompletions.map((item: any) => (
                            <div key={item.taskId} className="flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{item.serialNumber}</span>
                                  <span className="text-xs text-gray-500">{item.partNumber}</span>
                                </div>
                                <div className="font-medium text-sm text-gray-900 mb-2">{item.description}</div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                  <div>
                                    <span className="text-gray-500">Completed:</span>
                                    <span className="ml-1 font-medium">{new Date(item.completedDate).toLocaleDateString()}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Created:</span>
                                    <span className="ml-1 font-medium">{new Date(item.createdDate).toLocaleDateString()}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Engineer:</span>
                                    <span className="ml-1 font-medium">{item.engineer}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500">Priority:</span>
                                    <span className={`ml-1 px-2 py-0.5 rounded ${getPriorityColorClass(item.priority)}`}>
                                      {item.priority}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {analyticsData.type === 'pending' && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <Card className="border-2 border-orange-200 bg-orange-50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-orange-700">Total Pending</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-orange-700">{analyticsData.data.totalPending}</div>
                        <p className="text-xs text-orange-600 mt-1">Active tasks requiring attention</p>
                      </CardContent>
                    </Card>
                    <Card className="border-2 border-red-200 bg-red-50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-red-700">Overdue</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-red-700">{analyticsData.data.overdue}</div>
                        <p className="text-xs text-red-600 mt-1">Past target date</p>
                      </CardContent>
                    </Card>
                    <Card className="border-2 border-blue-200 bg-blue-50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm text-blue-700">On Track</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-3xl font-bold text-blue-700">{analyticsData.data.totalPending - analyticsData.data.overdue}</div>
                        <p className="text-xs text-blue-600 mt-1">Within target timeline</p>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">By Status</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {Object.entries(analyticsData.data.byStatus)
                            .sort(([, a], [, b]) => (b as number) - (a as number))
                            .map(([status, count]) => (
                              <div key={status} className="flex items-center justify-between p-2 border rounded">
                                <span className="text-sm font-medium">{status}</span>
                                <span className="text-sm font-bold bg-gray-100 px-2 py-1 rounded">{count as number}</span>
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">By Priority</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {Object.entries(analyticsData.data.byPriority)
                            .sort(([, a], [, b]) => (b as number) - (a as number))
                            .map(([priority, count]) => (
                              <div key={priority} className="flex items-center justify-between p-2 border rounded">
                                <span className={`text-sm font-medium ${
                                  priority === 'High' ? 'text-red-600' :
                                  priority === 'Medium' ? 'text-yellow-600' :
                                  'text-green-600'
                                }`}>{priority}</span>
                                <span className="text-sm font-bold bg-gray-100 px-2 py-1 rounded">{count as number}</span>
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">By Engineer</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 max-h-60 overflow-y-auto">
                          {Object.entries(analyticsData.data.byEngineer)
                            .sort(([, a], [, b]) => (b as number) - (a as number))
                            .slice(0, 10)
                            .map(([engineer, count]) => (
                              <div key={engineer} className="flex items-center justify-between p-2 border rounded">
                                <span className="text-sm font-medium truncate">{engineer}</span>
                                <span className="text-sm font-bold bg-gray-100 px-2 py-1 rounded">{count as number}</span>
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Pending Tasks Details</CardTitle>
                      <CardDescription>Showing up to 15 pending tasks with full information</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {analyticsData.data.pendingTasks.map((item: any) => (
                          <div key={item.taskId} className={`flex items-start justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors ${
                            item.isOverdue ? 'border-red-300 bg-red-50' : ''
                          }`}>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded">{item.serialNumber}</span>
                                <span className="text-xs text-gray-500">{item.partNumber}</span>
                                {item.isOverdue && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-semibold">OVERDUE</span>}
                              </div>
                              <div className="font-medium text-sm text-gray-900 mb-2">{item.description}</div>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                  <span className="text-gray-500">Status:</span>
                                  <span className="ml-1 font-medium">{item.status}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Priority:</span>
                                  <span className={`ml-1 px-2 py-0.5 rounded ${getPriorityColorClass(item.priority)}`}>
                                    {item.priority}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Engineer:</span>
                                  <span className="ml-1 font-medium">{item.engineer}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Target:</span>
                                  <span className="ml-1 font-medium">{item.targetDate ? new Date(item.targetDate).toLocaleDateString() : 'Not set'}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}