// src/hooks/useRolePermissions.ts
// ---------------------------------------------------------------------------
// Centralized hook that reads the admin-configured role permission matrix
// from the SERVER-SIDE API and provides permission-checking functions.
//
// FIXED: Previously this hook read from localStorage only, which meant
// permissions assigned on one browser/PC were not visible on another.
// Now it fetches from GET /api/role-permissions (server-side database)
// and uses localStorage only as a fast cache for initial render.
//
// The RolePermissionsManager (Admin Dashboard → Role Permissions tab) saves
// to the backend via PUT /api/role-permissions, and this hook fetches from
// GET /api/role-permissions on mount and periodically.
//
// Admin and Director roles are NOT controlled by this matrix — they always
// have full permissions (as stated in the RolePermissionsManager UI).
// ---------------------------------------------------------------------------

import { useMemo, useSyncExternalStore, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth-context';
// SECURITY: the role permission matrix used to be cached in localStorage under
// 'cmt_role_permissions_matrix' — which exposed the internal authorisation
// logic to any script on the origin (pentest: Sensitive Data Exposure). It is
// now held in memory only.
import { secureAuthStore } from '@/lib/secure-auth-store';

// ─── Types (must stay in sync with RolePermissionsManager.tsx) ───────────────

export const PERMISSION_KEYS = [
  'delete_task',
  'delete_user',
  'reopen_task',
  'view_performance_metrics',
  'view_engineer_workload',
  'view_analytics',
  'mantenix_data',
  'transfers',
  'edit_user',
  'workload_adjustment',
  'create_task',
  'request_amendment',
] as const;

export type PermissionKey = typeof PERMISSION_KEYS[number];

export type RoleKey =
  | 'team_leader'
  | 'manager'
  | 'shop_tl'
  | 'engineer'
  | 'customer_personnel'
  | 'customer'
  | 'shop_manager';

export type PermissionMatrix = Record<RoleKey, Record<PermissionKey, boolean>>;

// ─── Default matrix (mirrors RolePermissionsManager defaults) ────────────────

export const DEFAULT_MATRIX: PermissionMatrix = {
  team_leader: {
    delete_task: true,
    delete_user: true,
    reopen_task: true,
    view_performance_metrics: true,
    view_engineer_workload: true,
    view_analytics: true,
    mantenix_data: true,
    transfers: true,
    edit_user: true,
    workload_adjustment: true,
    create_task: true,
    request_amendment: true,
  },
  manager: {
    delete_task: true,
    delete_user: true,
    reopen_task: false,
    view_performance_metrics: true,
    view_engineer_workload: true,
    view_analytics: true,
    mantenix_data: true,
    transfers: true,
    edit_user: true,
    workload_adjustment: false,
    create_task: false,
    request_amendment: false,
  },
  shop_tl: {
    delete_task: false,
    delete_user: false,
    reopen_task: false,
    view_performance_metrics: true,
    view_engineer_workload: true,
    view_analytics: true,
    mantenix_data: true,
    transfers: true,
    edit_user: false,
    workload_adjustment: false,
    create_task: false,
    request_amendment: false,
  },
  engineer: {
    delete_task: false,
    delete_user: false,
    reopen_task: false,
    view_performance_metrics: true,
    view_engineer_workload: true,
    view_analytics: true,
    mantenix_data: false,
    transfers: false,
    edit_user: false,
    workload_adjustment: true,
    create_task: false,
    request_amendment: true,
  },
  customer_personnel: {
    delete_task: false,
    delete_user: false,
    reopen_task: false,
    view_performance_metrics: true,
    view_engineer_workload: false,
    view_analytics: true,
    mantenix_data: false,
    transfers: false,
    edit_user: false,
    workload_adjustment: false,
    create_task: true,
    request_amendment: true,
  },
  customer: {
    delete_task: false,
    delete_user: false,
    reopen_task: false,
    view_performance_metrics: false,
    view_engineer_workload: false,
    view_analytics: true,
    mantenix_data: false,
    transfers: false,
    edit_user: false,
    workload_adjustment: false,
    create_task: false,
    request_amendment: false,
  },
  shop_manager: {
    delete_task: false,
    delete_user: false,
    reopen_task: false,
    view_performance_metrics: true,
    view_engineer_workload: true,
    view_analytics: true,
    mantenix_data: true,
    transfers: true,
    edit_user: false,
    workload_adjustment: false,
    create_task: false,
    request_amendment: false,
  },
};

export const STORAGE_KEY = 'cmt_role_permissions_matrix';

/** Custom event name dispatched by RolePermissionsManager on save/reset */
export const ROLE_PERMISSIONS_UPDATED_EVENT = 'rolePermissionsUpdated';

/** How often to re-fetch from the server (in milliseconds). Default: 2 minutes */
const REFRESH_INTERVAL_MS = 2 * 60 * 1000;

// ─── External store so every component re-renders on matrix change ───────────

let cachedMatrix: PermissionMatrix = DEFAULT_MATRIX;
let listeners: Set<() => void> = new Set();
let lastFetchTime = 0;
let isFetching = false;

function loadMatrixFromCache(): PermissionMatrix {
  // SECURITY: no longer reads from localStorage. The matrix is held in
  // memory by `secureAuthStore`; if nothing is there yet we fall back to
  // DEFAULT_MATRIX and let `fetchMatrixFromServer` refill it.
  try {
    const mem = secureAuthStore.getRolePermissionsMatrix() as Partial<PermissionMatrix> | null;
    if (!mem) return DEFAULT_MATRIX;
    const merged = { ...DEFAULT_MATRIX };
    for (const role of Object.keys(DEFAULT_MATRIX) as RoleKey[]) {
      if (mem[role]) {
        merged[role] = { ...DEFAULT_MATRIX[role], ...mem[role] };
      }
    }
    return merged;
  } catch {
    return DEFAULT_MATRIX;
  }
}

function emitChange() {
  listeners.forEach((l) => l());
}

/**
 * Fetch the role permission matrix from the server API and update the cache.
 * This is the key fix: permissions are now read from the server, not just localStorage.
 * 
 * FIXED: Gracefully handles 404 (endpoint not deployed yet) by silently falling back
 * to localStorage cache or defaults, without logging warnings that clutter the console.
 */
async function fetchMatrixFromServer(): Promise<void> {
  if (isFetching) return;
  isFetching = true;

  try {
    // Build headers with auth token for the request
    const headers: Record<string, string> = { 'Accept': 'application/json' };

    // SECURITY: read the bearer token from the in-memory store only; never
    // from localStorage. The HttpOnly session cookie is sent automatically
    // via `credentials: 'include'`.
    try {
      const token = secureAuthStore.getToken();
      if (token) {
        headers['Authorization'] = token.startsWith('Bearer') ? token : `Bearer ${token}`;
      }
    } catch {
      // ignore
    }

    const response = await fetch('/api/role-permissions', {
      method: 'GET',
      headers,
      credentials: 'include',
      cache: 'no-store',
    });

    if (!response.ok) {
      // 404 means the API route isn't available yet — silently use defaults
      // 401/403 means auth issue — also silently fall back
      // Only warn on unexpected errors (5xx)
      if (response.status >= 500) {
        console.warn('[useRolePermissions] Server error fetching permissions, status:', response.status);
      }
      return;
    }

    const data = await response.json();

    if (data && data.matrix) {
      // Merge server matrix with defaults to handle any missing keys
      const merged = { ...DEFAULT_MATRIX };
      for (const role of Object.keys(DEFAULT_MATRIX) as RoleKey[]) {
        if (data.matrix[role]) {
          merged[role] = { ...DEFAULT_MATRIX[role], ...data.matrix[role] };
        }
      }

      // Update in-memory cache ONLY (no localStorage — pentest remediation).
      cachedMatrix = merged;
      secureAuthStore.setRolePermissionsMatrix(merged);
      lastFetchTime = Date.now();
      emitChange();
    }
  } catch (err) {
    // Network errors (e.g., fetch failed) — silently fall back to cache/defaults
    // This prevents console noise when the server is temporarily unreachable
  } finally {
    isFetching = false;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  // Listen for the custom event dispatched by RolePermissionsManager on save
  const handleCustomEvent = () => {
    // When admin saves, immediately re-fetch from server to get the latest
    fetchMatrixFromServer();
  };

  // SECURITY: previously we also listened to the `storage` event to pick up
  // cross-tab localStorage changes to the permission matrix. Since the
  // matrix is no longer persisted to localStorage, this listener is removed;
  // cross-tab sync now happens via the periodic server fetch.

  window.addEventListener(ROLE_PERMISSIONS_UPDATED_EVENT, handleCustomEvent);

  return () => {
    listeners.delete(listener);
    window.removeEventListener(ROLE_PERMISSIONS_UPDATED_EVENT, handleCustomEvent);
  };
}

function getSnapshot(): PermissionMatrix {
  return cachedMatrix;
}

function getServerSnapshot(): PermissionMatrix {
  return DEFAULT_MATRIX;
}

// Initialize on module load (client-side only)
if (typeof window !== 'undefined') {
  // Load from localStorage first for instant render
  cachedMatrix = loadMatrixFromCache();
  // Then fetch from server in the background to get the latest
  fetchMatrixFromServer();
}

// ─── Roles that bypass the matrix (always have full permissions) ─────────────

const PRIVILEGED_ROLES = ['admin', 'director'];

// ─── All operational roles controlled by the matrix ──────────────────────────

const OPERATIONAL_ROLES: RoleKey[] = [
  'team_leader',
  'manager',
  'shop_tl',
  'engineer',
  'customer_personnel',
  'customer',
  'shop_manager',
];

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * useRolePermissions — reads the admin-configured role permission matrix
 * from the server-side API and returns boolean flags for the current user's permissions.
 *
 * On mount, it fetches from GET /api/role-permissions and caches in localStorage.
 * It also periodically refreshes to pick up changes made by other admins.
 *
 * Usage:
 * ```tsx
 * const { canDeleteTask, canViewEngineerWorkload } = useRolePermissions();
 * if (!canDeleteTask) return null; // hide delete button
 * ```
 */
export function useRolePermissions() {
  const { user } = useAuth();
  const matrix = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const userRole = (user?.role ?? '').toLowerCase().trim();

  // Periodic refresh from server
  useEffect(() => {
    // Fetch on mount if stale (more than REFRESH_INTERVAL_MS since last fetch)
    if (Date.now() - lastFetchTime > REFRESH_INTERVAL_MS) {
      fetchMatrixFromServer();
    }

    // Set up periodic refresh
    intervalRef.current = setInterval(() => {
      fetchMatrixFromServer();
    }, REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return useMemo(() => {
    /**
     * Admin and Director always have full permissions — they are not
     * controlled by this matrix (as stated in the RolePermissionsManager UI note).
     */
    const isPrivilegedRole = PRIVILEGED_ROLES.includes(userRole);

    /**
     * Check if the current user has a specific permission.
     */
    const hasPermission = (permission: PermissionKey): boolean => {
      if (isPrivilegedRole) return true;
      const rolePerms = matrix[userRole as RoleKey];
      if (!rolePerms) return false;
      return rolePerms[permission] ?? false;
    };

    /**
     * Check if a specific role has a specific permission (useful for
     * rendering permission state for other roles, e.g. in admin views).
     */
    const roleHasPermission = (role: string, permission: PermissionKey): boolean => {
      const normalizedRole = role.toLowerCase().trim();
      if (PRIVILEGED_ROLES.includes(normalizedRole)) return true;
      const rolePerms = matrix[normalizedRole as RoleKey];
      if (!rolePerms) return false;
      return rolePerms[permission] ?? false;
    };

    return {
      // ─── Convenience boolean flags for the current user ──────────────
      /** Can the current user delete tasks? */
      canDeleteTask: hasPermission('delete_task'),
      /** Can the current user delete users? */
      canDeleteUser: hasPermission('delete_user'),
      /** Can the current user reopen completed tasks? */
      canReopenTask: hasPermission('reopen_task'),
      /** Can the current user view performance metrics? */
      canViewPerformanceMetrics: hasPermission('view_performance_metrics'),
      /** Can the current user view engineer workload? */
      canViewEngineerWorkload: hasPermission('view_engineer_workload'),
      /** Can the current user view analytics? */
      canViewAnalytics: hasPermission('view_analytics'),
      /** Can the current user access Mantenix data? */
      canAccessMantenixData: hasPermission('mantenix_data'),
      /** Can the current user create/manage transfers? */
      canManageTransfers: hasPermission('transfers'),
      /** Can the current user edit user accounts? */
      canEditUser: hasPermission('edit_user'),
      /** Can the current user access workload adjustment? */
      canWorkloadAdjustment: hasPermission('workload_adjustment'),
      /** Can the current user create tasks? */
      canCreateTask: hasPermission('create_task'),
      /** Can the current user request amendments on completed tasks? */
      canRequestAmendment: hasPermission('request_amendment'),

      // ─── Generic checkers ────────────────────────────────────────────
      /** Check a specific permission for the current user */
      hasPermission,
      /** Check a specific permission for any role */
      roleHasPermission,

      // ─── Meta ────────────────────────────────────────────────────────
      /** Whether the current user is admin/director (bypasses matrix) */
      isPrivilegedRole,
      /** The full matrix (for debugging or admin views) */
      matrix,
      /** Current user role (normalized lowercase) */
      userRole,
    };
  }, [matrix, userRole]);
}

/**
 * Utility function (non-hook) for checking permissions outside of React components.
 * Reads from localStorage cache first, then falls back to defaults.
 * For real-time accuracy, prefer the useRolePermissions hook inside components.
 *
 * Usage:
 * ```ts
 * if (!checkRolePermission('engineer', 'delete_task')) {
 *   throw new Error('Permission denied');
 * }
 * ```
 */
export function checkRolePermission(role: string, permission: PermissionKey): boolean {
  const normalizedRole = role.toLowerCase().trim();
  if (PRIVILEGED_ROLES.includes(normalizedRole)) return true;

  const matrix = loadMatrixFromCache();
  const rolePerms = matrix[normalizedRole as RoleKey];
  if (!rolePerms) return false;
  return rolePerms[permission] ?? false;
}

/**
 * Force a refresh of the role permission matrix from the server.
 * Call this after saving permissions to ensure all components get the latest data.
 */
export function refreshRolePermissionsFromServer(): Promise<void> {
  return fetchMatrixFromServer();
}