'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import apiClient from '@/lib/api'
// SECURITY: Team Leader permissions used to be cached in localStorage under
// 'tl_permissions' — which exposed internal authorisation logic to any
// script on the origin (pentest: Sensitive Data Exposure). They are now
// held in memory only.
import { secureAuthStore } from '@/lib/secure-auth-store'

/**
 * Team Leader permission flags — mirrors the Director permission model
 * but applied to Team Leaders. When the logged-in user is a Team Leader,
 * these are fetched from GET /api/tl-permissions/{userId} and stored
 * alongside the User object.
 *
 * By default, all TL permissions are TRUE (unrestricted).
 * Directors/Admins can selectively restrict individual TLs.
 */
export interface TeamLeaderPermissions {
  // Dashboard & Analytics
  canViewPerformanceMetrics: boolean
  canViewEngineerWorkload: boolean
  canViewAnalytics: boolean
  canManageData: boolean // Maintenix Data access

  // Granular per-card metric visibility
  /** Controls visibility of the "Completion Rate" metric card */
  canViewCompletionRate: boolean
  /** Controls visibility of the "Avg. Delay" metric card */
  canViewAvgDelay: boolean
  /** Controls visibility of the "Tasks Completed" metric card */
  canViewTasksCompleted: boolean
  /** Controls visibility of the "Pending Tasks" metric card */
  canViewPendingTasks: boolean

  // NEW: Controls visibility of completed tasks in task tables & analytics
  /** Controls whether completed tasks are visible in task tables and analytics routes */
  canViewCompletedTasks: boolean

  // Task Management
  canManageCategories: boolean
  canManagePriorities: boolean
  canManageTaskTypes: boolean

  // User Management
  canCreateTeamLeaders: boolean
  canCreateManagers: boolean
  canManageUsers: boolean

  // Reports & Data
  canViewReports: boolean
  canExportData: boolean

  // Schedule & Planning
  canManageSchedules: boolean

  // Workload & Task Creation (Director-controlled for TL)
  /** Controls visibility of the "Workload Adjustment" sidebar item for this Team Leader */
  canWorkloadAdjustment: boolean
  /** Controls visibility of the "Create Task" sidebar item for this Team Leader */
  canCreateTask: boolean
}

/** Default permissions — everything enabled (unrestricted by default). */
export const DEFAULT_TL_PERMISSIONS: TeamLeaderPermissions = {
  canViewPerformanceMetrics: true,
  canViewEngineerWorkload: true,
  canViewAnalytics: true,
  canManageData: true,

  // Granular per-card metric visibility (default: all visible)
  canViewCompletionRate: true,
  canViewAvgDelay: true,
  canViewTasksCompleted: true,
  canViewPendingTasks: true,

  // Completed tasks visibility (default: visible)
  canViewCompletedTasks: true,

  canManageCategories: true,
  canManagePriorities: true,
  canManageTaskTypes: true,

  canCreateTeamLeaders: true,
  canCreateManagers: true,
  canManageUsers: true,

  canViewReports: true,
  canExportData: true,

  canManageSchedules: true,

  // Workload & Task Creation (default: enabled)
  canWorkloadAdjustment: true,
  canCreateTask: true,
}

interface TLPermissionsContextType {
  /** Granular permissions for Team Leader users. null for non-TL roles. */
  tlPermissions: TeamLeaderPermissions | null
  /** Whether permissions are still loading */
  isLoadingTLPermissions: boolean
  /** Re-fetch TL permissions from the backend */
  refreshTLPermissions: () => Promise<void>
}

/** Default context value used when provider hasn't mounted yet (avoids hook-count mismatches). */
const DEFAULT_CONTEXT: TLPermissionsContextType = {
  tlPermissions: null,
  isLoadingTLPermissions: true,
  refreshTLPermissions: async () => {},
}

const TLPermissionsContext = createContext<TLPermissionsContextType>(DEFAULT_CONTEXT)

export function TLPermissionsProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth()
  const [tlPermissions, setTlPermissions] = useState<TeamLeaderPermissions | null>(null)
  const [isLoadingTLPermissions, setIsLoadingTLPermissions] = useState(false)

  const userRole = (user?.role ?? '').toLowerCase().trim()
  const isTeamLeader = userRole === 'team_leader' || userRole === 'teamleader'
  const userId = (user as any)?.userId ?? (user as any)?.user_id ?? (user as any)?.id ?? 0

  /** Fetch TL permissions from the backend and update state + localStorage */
  const fetchTLPermissions = useCallback(async (uid: number): Promise<TeamLeaderPermissions | null> => {
    try {
      const response = await apiClient.get(`/tl-permissions/${uid}`)
      if (!response) {
        if (process.env.NODE_ENV === 'development') {
          console.info('[TL-PERMS] No TL permissions returned, using defaults')
        }
        return DEFAULT_TL_PERMISSIONS
      }

      const data = response.data || response

      const perms: TeamLeaderPermissions = {
        canViewPerformanceMetrics: data.canViewPerformanceMetrics ?? true,
        canViewEngineerWorkload: data.canViewEngineerWorkload ?? true,
        canViewAnalytics: data.canViewAnalytics ?? true,
        canManageData: data.canManageData ?? true,

        // Granular per-card metric visibility
        canViewCompletionRate: data.canViewCompletionRate ?? true,
        canViewAvgDelay: data.canViewAvgDelay ?? true,
        canViewTasksCompleted: data.canViewTasksCompleted ?? true,
        canViewPendingTasks: data.canViewPendingTasks ?? true,

        // NEW: Completed tasks visibility
        canViewCompletedTasks: data.canViewCompletedTasks ?? true,

        canManageCategories: data.canManageCategories ?? true,
        canManagePriorities: data.canManagePriorities ?? true,
        canManageTaskTypes: data.canManageTaskTypes ?? true,

        canCreateTeamLeaders: data.canCreateTeamLeaders ?? true,
        canCreateManagers: data.canCreateManagers ?? true,
        canManageUsers: data.canManageUsers ?? true,

        canViewReports: data.canViewReports ?? true,
        canExportData: data.canExportData ?? true,

        canManageSchedules: data.canManageSchedules ?? true,

        // Workload & Task Creation
        canWorkloadAdjustment: data.canWorkloadAdjustment ?? true,
        canCreateTask: data.canCreateTask ?? true,
      }

      if (process.env.NODE_ENV === 'development') {
        console.info('[TL-PERMS] Team Leader permissions loaded:', perms)
      }

      // SECURITY: keep permissions in memory only; never persist to localStorage.
      secureAuthStore.setTlPermissions(perms)

      return perms
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('[TL-PERMS] Failed to fetch TL permissions, using defaults:', err)
      }
      return DEFAULT_TL_PERMISSIONS
    }
  }, [])

  /** Public method: re-fetch TL permissions */
  const refreshTLPermissions = useCallback(async () => {
    if (!user || !isTeamLeader) {
      setTlPermissions(null)
      return
    }
    setIsLoadingTLPermissions(true)
    try {
      const perms = await fetchTLPermissions(userId)
      setTlPermissions(perms)
    } finally {
      setIsLoadingTLPermissions(false)
    }
  }, [user, isTeamLeader, userId, fetchTLPermissions])

  // Load permissions when user changes
  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || !user) {
      setTlPermissions(null)
      return
    }

    if (!isTeamLeader) {
      setTlPermissions(null)
      secureAuthStore.setTlPermissions(null)
      // Best-effort cleanup of any legacy plaintext copy on this device.
      try { localStorage.removeItem('tl_permissions') } catch {}
      return
    }

    // SECURITY: restore from in-memory store only (never localStorage) for
    // fast render; the live permissions are fetched from the backend below.
    const mem = secureAuthStore.getTlPermissions() as TeamLeaderPermissions | null
    if (mem) {
      setTlPermissions(mem)
    }

    // Fetch fresh permissions from backend
    setIsLoadingTLPermissions(true)
    fetchTLPermissions(userId).then(perms => {
      setTlPermissions(perms)
      setIsLoadingTLPermissions(false)
    }).catch(() => {
      setIsLoadingTLPermissions(false)
    })
  }, [isAuthLoading, isAuthenticated, user, isTeamLeader, userId, fetchTLPermissions])

  // Listen for TL permission updates (e.g. admin/director changed them)
  useEffect(() => {
    function onPermissionsUpdated() {
      if (process.env.NODE_ENV === 'development') {
        console.info('[TL-PERMS] received tlPermissionsUpdated event — refreshing permissions')
      }
      refreshTLPermissions().catch(() => {})
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('tlPermissionsUpdated', onPermissionsUpdated)
      return () => window.removeEventListener('tlPermissionsUpdated', onPermissionsUpdated)
    }
  }, [refreshTLPermissions])

  return (
    <TLPermissionsContext.Provider
      value={{
        tlPermissions,
        isLoadingTLPermissions,
        refreshTLPermissions,
      }}
    >
      {children}
    </TLPermissionsContext.Provider>
  )
}

export function useTLPermissions() {
  return useContext(TLPermissionsContext)
}