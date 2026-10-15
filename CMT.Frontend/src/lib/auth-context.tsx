'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import apiClient from '@/lib/api'
// SECURITY: all sensitive auth state (token, refreshToken, user profile,
// director permissions) now lives in memory only. localStorage is no longer
// used for any of these values. See /lib/secure-auth-store.ts.
import { secureAuthStore } from '@/lib/secure-auth-store'

/**
 * Director permission flags — mirrors DirectorPermissionDto from the backend.
 * When the logged-in user is a Director, these are fetched from
 * GET /api/director-permissions/{userId} and stored alongside the User object.
 */
export interface DirectorPermissions {
  canViewWorkloadDashboard: boolean
  canViewPerformanceMetrics: boolean
  canViewAnalytics: boolean
  canViewEngineerWorkload: boolean
  canManageCategories: boolean
  canManagePriorities: boolean
  canManageTaskTypes: boolean
  canCreateTeamLeader: boolean
  canCreateManager: boolean
  canManageUsers: boolean
  canManageDepartments: boolean
  canManageShops: boolean
  canViewReports: boolean
  canExportData: boolean
  canManageSchedules: boolean
  canViewPendingTLApprovals: boolean
}

/** Default permissions — everything enabled (matches backend defaults for new directors). */
const DEFAULT_DIRECTOR_PERMISSIONS: DirectorPermissions = {
  canViewWorkloadDashboard: true,
  canViewPerformanceMetrics: true,
  canViewAnalytics: true,
  canViewEngineerWorkload: true,
  canManageCategories: true,
  canManagePriorities: true,
  canManageTaskTypes: true,
  canCreateTeamLeader: false,
  canCreateManager: true,
  canManageUsers: true,
  canManageDepartments: true,
  canManageShops: true,
  canViewReports: true,
  canExportData: true,
  canManageSchedules: true,
  canViewPendingTLApprovals: true,
}

interface User {
  userId: number
  id?: number
  user_id?: number
  fullName: string
  full_name?: string
  name?: string
  username: string
  email: string
  phoneNumber?: string | null
  phone_number?: string | null
  role: string
  role_name?: string
  roleName?: string
  roleDisplayName: string
  roleDisplay?: string
  profilePicturePath?: string | null
  shopId?: number
  shopName?: string
  shop_name?: string
  shop?: { name?: string; shop_name?: string }
  supervisorId?: number
  supervisorName?: string
  personnelType?: string | null
  personnel_type?: string | null
  isActive: boolean
  canCreateTeamLeader?: boolean
  can_create_team_leader?: boolean
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  isLoading: boolean
  isAuthenticated: boolean
  refreshUser: () => Promise<boolean>
  /** Granular permissions for Director users. null for non-director roles. */
  directorPermissions: DirectorPermissions | null
  /** Re-fetch director permissions from the backend */
  refreshDirectorPermissions: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isMounted, setIsMounted] = useState(false)
  const [directorPermissions, setDirectorPermissions] = useState<DirectorPermissions | null>(null)
  const router = useRouter()

  // FIX (session-persistence): On a hard reload the in-memory bearer token is
  // gone, but the HttpOnly `auth_token` cookie is still valid and the browser
  // attaches it automatically (credentials: 'include'). In that case
  // refreshUser() successfully rehydrates `user` via /api/auth/me even though
  // the bearer token state is still null. Requiring BOTH user AND token here
  // caused the "logged out on refresh" bug. We now treat the presence of a
  // hydrated user as proof of an authenticated session — the cookie carries
  // the credential on the wire.
  const isAuthenticated = !!user

  const safeToString = (value: any, fallback = ''): string => {
    if (value === undefined || value === null) return fallback
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    if (typeof value === 'object') {
      if (typeof value.name === 'string') return value.name
      if (typeof value.title === 'string') return value.title
      if (typeof value.label === 'string') return value.label
      if (typeof value.role === 'string') return value.role
      try {
        return JSON.stringify(value)
      } catch {
        return fallback
      }
    }
    return fallback
  }

  const normalizeUserData = (userData: any): User => {
    const rawRole =
      userData?.role ??
      userData?.role_name ??
      userData?.roleName ??
      userData?.role_id ??
      userData?.roleId ??
      undefined

    const roleStr = safeToString(rawRole, 'engineer').toLowerCase().trim()

    // Extract phone number from userData
    const phoneNumber =
      userData?.phoneNumber ??
      userData?.phone_number ??
      userData?.PhoneNumber ??
      null

    // Extract personnel type from userData
    const personnelType = 
      userData?.personnelType ?? 
      userData?.personnel_type ?? 
      userData?.PersonnelType ?? 
      null

    // Extract canCreateTeamLeader permission for Directors
    const canCreateTeamLeader = 
      userData?.canCreateTeamLeader ?? 
      userData?.can_create_team_leader ?? 
      userData?.CanCreateTeamLeader ?? 
      false

    const rawRoleDisplay =
      userData?.roleDisplayName ?? userData?.roleDisplay ?? userData?.roleName ?? rawRole
    let roleDisplayName = safeToString(rawRoleDisplay, '')
    
    // Handle admin role display
    if (roleStr === 'admin' || roleStr === 'administrator') {
      roleDisplayName = 'Admin'
    }
    // Handle shop_manager role display
    else if (roleStr === 'shop_manager' || roleStr === 'shopmanager') {
      roleDisplayName = 'Shop Manager'
    }
    // Handle customer_personnel role with personnel type to determine display name
    else if (roleStr === 'customer_personnel' && personnelType) {
      const normalizedType = personnelType.toLowerCase().trim()
      roleDisplayName = normalizedType === 'technician' ? 'Technician' :
                       normalizedType === 'tools_clerk' || normalizedType === 'toolsclerk' ? 'Tools Clerk' :
                       normalizedType === 'warranty_officer' ? 'Warranty Officer' :
                       'Customer Personnel'
    } else if (!roleDisplayName) {
      roleDisplayName = roleStr.charAt(0).toUpperCase() + roleStr.slice(1)
    }

    const fullName = userData?.fullName ?? userData?.full_name ?? userData?.name ?? 'Unknown User'

    const profilePicturePath =
      userData?.profilePicturePath ??
      userData?.profile_picture_path ??
      userData?.avatar ??
      userData?.avatarPath ??
      userData?.picture ??
      userData?.photo ??
      null

    const userId = userData?.userId ?? userData?.id ?? userData?.user_id ?? 0

    return {
      userId,
      id: userId,
      user_id: userId,
      fullName: safeToString(fullName, 'Unknown User'),
      full_name: safeToString(fullName, 'Unknown User'),
      name: safeToString(fullName, 'Unknown User'),
      username: safeToString(userData?.username ?? userData?.email ?? 'unknown', 'unknown'),
      email: safeToString(userData?.email ?? '', 'unknown@example.com'),
      phoneNumber,
      phone_number: phoneNumber,
      role: roleStr,
      role_name: roleStr,
      roleName: roleStr,
      roleDisplayName,
      roleDisplay: roleDisplayName,
      profilePicturePath,
      shopId: userData?.shopId ?? userData?.shop_id,
      shopName: userData?.shopName ?? userData?.shop_name,
      shop_name: userData?.shopName ?? userData?.shop_name,
      shop: userData?.shop,
      supervisorId: userData?.supervisorId ?? userData?.supervisor_id,
      supervisorName: userData?.supervisorName ?? userData?.supervisor_name,
      personnelType,
      personnel_type: personnelType,
      isActive: userData?.isActive !== false,
      canCreateTeamLeader,
      can_create_team_leader: canCreateTeamLeader
    }
  }

  // ---------------------------------------------------------------------------
  // Director Permissions helpers
  // ---------------------------------------------------------------------------

  /** Fetch director permissions from the backend and update state + localStorage */
  const fetchDirectorPermissions = useCallback(async (userId: number): Promise<DirectorPermissions | null> => {
    try {
      const response = await apiClient.get(`/director-permissions/${userId}`)
      if (!response) {
        if (process.env.NODE_ENV === 'development') {
          console.info('[AUTH] No director permissions returned, using defaults')
        }
        return DEFAULT_DIRECTOR_PERMISSIONS
      }

      const data = response.data || response

      const perms: DirectorPermissions = {
        canViewWorkloadDashboard: data.canViewWorkloadDashboard ?? true,
        canViewPerformanceMetrics: data.canViewPerformanceMetrics ?? true,
        canViewAnalytics: data.canViewAnalytics ?? true,
        canViewEngineerWorkload: data.canViewEngineerWorkload ?? true,
        canManageCategories: data.canManageCategories ?? true,
        canManagePriorities: data.canManagePriorities ?? true,
        canManageTaskTypes: data.canManageTaskTypes ?? true,
        canCreateTeamLeader: data.canCreateTeamLeader ?? false,
        canCreateManager: data.canCreateManager ?? true,
        canManageUsers: data.canManageUsers ?? true,
        canManageDepartments: data.canManageDepartments ?? true,
        canManageShops: data.canManageShops ?? true,
        canViewReports: data.canViewReports ?? true,
        canExportData: data.canExportData ?? true,
        canManageSchedules: data.canManageSchedules ?? true,
        canViewPendingTLApprovals: data.canViewPendingTLApprovals ?? true,
      }

      if (process.env.NODE_ENV === 'development') {
        console.info('[AUTH] Director permissions loaded:', perms)
      }

      // SECURITY: keep permissions in memory only; never persist to localStorage.
      secureAuthStore.setDirectorPermissions(perms)

      return perms
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('[AUTH] Failed to fetch director permissions, using defaults:', err)
      }
      return DEFAULT_DIRECTOR_PERMISSIONS
    }
  }, [])

  /** Public method: re-fetch director permissions (e.g. after admin updates them) */
  const refreshDirectorPermissions = useCallback(async () => {
    if (!user) return
    const role = user.role?.toLowerCase()
    if (role !== 'director') {
      setDirectorPermissions(null)
      return
    }
    const perms = await fetchDirectorPermissions(user.userId)
    setDirectorPermissions(perms)
  }, [user, fetchDirectorPermissions])

  // ---------------------------------------------------------------------------
  // Cookie / Token helpers (unchanged)
  // ---------------------------------------------------------------------------

  // SECURITY: the JS-readable `auth_token` cookie has been removed. The
  // backend now sets the auth token as an HttpOnly, Secure, SameSite=Strict
  // cookie which JavaScript cannot read. These helpers are intentionally
  // no-ops so existing call-sites keep compiling, but they NEVER write the
  // token to a JS-readable cookie or to localStorage.
  const setAuthCookie = (_authToken: string) => {
    // no-op — HttpOnly cookie is set by the backend AuthController on login.
  }

  const clearAuthCookies = () => {
    // Best-effort cleanup of any legacy JS-readable cookies that may still
    // exist from the previous vulnerable version of the app.
    try {
      const expireOptions = 'path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
      document.cookie = `auth_token=; ${expireOptions}`
      document.cookie = `authToken=; ${expireOptions}`
    } catch { /* ignore */ }
  }

  const getStoredToken = (): string | null => {
    // SECURITY: the token is kept in memory only. We never read it back from
    // localStorage or from a JS-readable cookie. If the in-memory copy is
    // gone (e.g. full page reload) the HttpOnly cookie is used automatically
    // by fetch via `credentials: 'include'`, and `refreshUser()` will repopulate
    // the in-memory user + permissions.
    return secureAuthStore.getToken()
  }

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // ---------------------------------------------------------------------------
  // refreshUser — also refreshes director permissions when applicable
  // ---------------------------------------------------------------------------

  const refreshUser = useCallback(async (): Promise<boolean> => {
    try {
      setIsLoading(true)
      const data = await apiClient.getCurrentUser()
      if (!data) {
        setUser(null)
        setToken(null)
        setDirectorPermissions(null)
        // SECURITY: clear in-memory auth state only. No localStorage writes.
        secureAuthStore.clearAll()
        return false
      }
      const normalized = normalizeUserData(data)
      setUser(normalized)
      // SECURITY: keep user profile in memory only; never persist to localStorage.
      secureAuthStore.setUser(normalized)

      // FIX (session-persistence): if refreshUser succeeded via the HttpOnly
      // cookie but we don't currently have an in-memory bearer token (full
      // page reload scenario), set a non-empty sentinel so any legacy code
      // that checks `!!token` continues to work. The real credential for
      // the wire is always the HttpOnly cookie carried by credentials:
      // 'include'. The sentinel is NEVER sent as a Bearer header because
      // apiClient.withAuth explicitly rejects 'cookie-session'.
      if (!secureAuthStore.getToken()) {
        setToken('cookie-session')
      }

      // Fetch director permissions if user is a director
      if (normalized.role === 'director') {
        const perms = await fetchDirectorPermissions(normalized.userId)
        setDirectorPermissions(perms)
      } else {
        setDirectorPermissions(null)
        secureAuthStore.setDirectorPermissions(null)
      }

      if (process.env.NODE_ENV === 'development') {
        console.info('[AUTH] Refreshed user from backend:', normalized.username, 'canCreateTeamLeader:', normalized.canCreateTeamLeader)
      }
      return true
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('[AUTH] Failed to refresh user (debug):', error)
      }
      return false
    } finally {
      setIsLoading(false)
    }
  }, [fetchDirectorPermissions])

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!isMounted) return

    if (process.env.NODE_ENV === 'development') {
      console.info('[AUTH] Initializing authentication state')
    }

    // SECURITY: previously we restored token + user from localStorage here.
    // That is the exact vulnerability called out in the pentest report, so
    // we removed it. Instead, on every mount we call the backend's /auth/me
    // endpoint: the browser automatically sends the HttpOnly session cookie,
    // and if the session is still valid the backend returns the current user
    // and we rebuild the in-memory state from the authoritative source.
    // If the session is not valid, the user stays logged out.

    // Best-effort cleanup of any legacy plaintext keys left over from the
    // vulnerable version of the app on this device.
    try {
      localStorage.removeItem('token')
      localStorage.removeItem('auth_token')
      localStorage.removeItem('authToken')
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      localStorage.removeItem('cmt_role_permissions_matrix')
      localStorage.removeItem('director_permissions')
      localStorage.removeItem('tl_permissions')
    } catch { /* ignore */ }

    // Attempt silent session restore via HttpOnly cookie.
    refreshUser()
      .then((ok) => {
        if (ok) {
          // If the backend also returned a bearer token in the body (for
          // non-cookie clients), apiClient.setToken will have cached it in
          // memory via secureAuthStore.
          const memToken = secureAuthStore.getToken()
          if (memToken) setToken(memToken)
        }
      })
      .catch(() => { /* ignore */ })
      .finally(() => setIsLoading(false))
  }, [isMounted, refreshUser])

  useEffect(() => {
    function onProfileUpdated() {
      if (process.env.NODE_ENV === 'development') {
        console.info('[AUTH] received profileUpdated event — refreshing user')
      }
      refreshUser().catch(() => {})
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('profileUpdated', onProfileUpdated)
      return () => window.removeEventListener('profileUpdated', onProfileUpdated)
    }
  }, [refreshUser])

  // Listen for director permission updates (e.g. admin changed them)
  useEffect(() => {
    function onPermissionsUpdated() {
      if (process.env.NODE_ENV === 'development') {
        console.info('[AUTH] received directorPermissionsUpdated event — refreshing permissions')
      }
      refreshDirectorPermissions().catch(() => {})
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('directorPermissionsUpdated', onPermissionsUpdated)
      return () => window.removeEventListener('directorPermissionsUpdated', onPermissionsUpdated)
    }
  }, [refreshDirectorPermissions])

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      if (process.env.NODE_ENV === 'development') {
        console.info('[AUTH] Attempting login for:', username)
      }

      const response = await apiClient.login({ username, password } as any)

      const userData = normalizeUserData(response.user)

      // SECURITY FIX: tokens and user profile are NEVER written to
      // localStorage anymore. The backend sets the auth token as an
      // HttpOnly, Secure, SameSite=Strict cookie on the login response.
      // We keep an in-memory copy of the bearer token solely so that this
      // tab can set the Authorization header for cross-origin calls where
      // cookies aren't used. Everything is lost on tab close / hard reload,
      // which is the intended behaviour.
      secureAuthStore.setToken(response.token)
      if (response.refreshToken) {
        secureAuthStore.setRefreshToken(response.refreshToken)
      }
      secureAuthStore.setUser(userData)

      setToken(response.token)
      apiClient.setToken(response.token)
      // No JS-readable cookie is set here anymore.
      setUser(userData)

      // Fetch director permissions right after login if user is a director
      if (userData.role === 'director') {
        const perms = await fetchDirectorPermissions(userData.userId)
        setDirectorPermissions(perms)
      } else {
        setDirectorPermissions(null)
        secureAuthStore.setDirectorPermissions(null)
      }

      if (process.env.NODE_ENV === 'development') {
        console.info('[AUTH] Login successful for user:', userData.username)
      }
      return true
    } catch (err: any) {
      const message =
        (err && (err.message || err.originalMessage)) ||
        (typeof err === 'string' ? err : null) ||
        'Cannot reach the server. Please try again later.'

      if (process.env.NODE_ENV === 'development') {
        console.debug('[AUTH] Login failed (debug):', { username, message, status: err?.status ?? null })
      }

      const cleanedError: any = new Error(message)
      if (err && err.status) cleanedError.status = err.status
      throw cleanedError
    }
  }

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------

  const logout = async () => {
    if (process.env.NODE_ENV === 'development') {
      console.info('[AUTH] Logging out')
    }

    try {
      await apiClient.logout()
      if (process.env.NODE_ENV === 'development') {
        console.info('[AUTH] Logout API call successful')
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[AUTH] Logout API call failed:', error)
      }
    } finally {
      // SECURITY: wipe in-memory auth state AND best-effort remove any
      // legacy plaintext keys that may have been left by an older version
      // of the app.
      secureAuthStore.clearAll()
      try {
        localStorage.removeItem('token')
        localStorage.removeItem('auth_token')
        localStorage.removeItem('authToken')
        localStorage.removeItem('accessToken')
        localStorage.removeItem('refreshToken')
        localStorage.removeItem('user')
        localStorage.removeItem('cmt_role_permissions_matrix')
        localStorage.removeItem('director_permissions')
        localStorage.removeItem('tl_permissions')
      } catch { /* ignore */ }

      setToken(null)
      apiClient.clearToken()
      clearAuthCookies()
      setUser(null)
      setDirectorPermissions(null)

      if (process.env.NODE_ENV === 'development') {
        console.info('[AUTH] Logout complete, redirecting to login')
      }
      router.push('/login')
    }
  }

  if (!isMounted) {
    return null
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isLoading,
        isAuthenticated,
        refreshUser,
        directorPermissions,
        refreshDirectorPermissions,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function useOptionalAuth() {
  return useContext(AuthContext)
}