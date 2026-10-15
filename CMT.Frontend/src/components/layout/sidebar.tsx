'use client'

import React, { useMemo, useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { useAuth, DirectorPermissions } from '@/lib/auth-context'
import { useRolePermissions, PermissionKey } from '@/hooks/useRolePermissions'
import { useTLPermissions, TeamLeaderPermissions } from '@/lib/tl-permissions-context'
import { getProfilePictureUrl, getInitials } from '@/lib/profile-picture-utils'
import apiClient from '@/lib/api'
import {
  Home,
  CheckCircle,
  ArrowLeftRight,
  Plus,
  TrendingUp,
  Users,
  FileText,
  ClipboardList,
  HelpCircle,
  LogOut,
  Plane,
  ChevronLeft,
  ChevronRight,
  Target,
  Tag,
  List,
  Clock,
  Calendar,
  User,
  Settings,
  LayoutDashboard,
  AlertCircle,
  Shield,
  Database,
  Scale,
  UserX,
  Filter,
  AlertTriangle,
  Pause,
  XCircle,
  Timer,
  Hourglass,
  Eye,
  EyeOff,
  CalendarClock,
  AlertOctagon,
} from 'lucide-react'

/**
 * Sidebar (single vertical). Uses router.push for navigation to guarantee client navigation.
 * FIXED: Added Admin role support with proper display and navigation
 * FIXED: Director permissions now control sidebar item visibility
 *
 * Each nav item can optionally declare a `directorPermissionKey` which maps to
 * a boolean field on DirectorPermissions. When the logged-in user is a Director,
 * the item is only shown if that permission is true (or if no key is specified).
 */

const ROLE_MAP: Record<string, string> = {
  '0': 'team_leader',
  '1': 'director',
  '2': 'engineer',
  '3': 'customer',
  '4': 'customer_personnel',
  '5': 'shop_tl',
  '6': 'manager',
  '7': 'admin',
  '8': 'shop_manager',
}

interface NavItem {
  name: string
  href: string
  icon: any
  roles: string[]
  badge?: boolean
  /**
   * Optional key into DirectorPermissions.
   * When the user is a Director and this key is set, the item is only shown
   * if directorPermissions[key] === true.
   */
  directorPermissionKey?: keyof DirectorPermissions
  /**
   * Optional key into the admin-configured role permission matrix.
   * For non-privileged roles (not admin/director), the item is only shown
   * if the matrix grants this permission to the user's role.
   */
  matrixPermissionKey?: PermissionKey
  /**
   * Optional key into TeamLeaderPermissions.
   * When the user is a Team Leader and this key is set, the item is only shown
   * if tlPermissions[key] === true.
   */
  tlPermissionKey?: keyof TeamLeaderPermissions
}

const SELF_EVALUATION_ROLES = [
  'admin', 'administrator', 'system_admin', 'special_admin', 'specialadmin',
  'director', 'dir', 'department_director',
  'special_team_leader', 'specialteamleader', 'special_tl', 'specialtl',
  'manager', 'mgr', 'manager_role',
  'shop_manager', 'shopmanager',
  'team_leader', 'teamleader', 'shop_tl', 'shopteamleader', 'shop_team_leader', 'stl',
  'engineer', 'technician', 'certifying_staff', 'certifyingstaff',
  'qa_personnel', 'qapersonnel', 'qa_manager', 'qamanager',
  'ecaa_personnel', 'ecaapersonnel', 'ecaa', 'ecaa_team', 'ecaa_staff',
  'inspector',
  'documentation_team_leader', 'documentationteamleader',
  'documentation_clerk', 'documentationclerk',
  'hr_specialist', 'hrspecialist', 'hr_manager', 'hrmanager',
  'customer_personnel', 'customer'
]

const NAV_ITEMS: NavItem[] = [
  { name: 'Admin Dashboard', href: '/admin-dashboard', icon: Shield, roles: ['admin'] },
  { name: 'Current Tasks', href: '/dashboard', icon: Home, roles: ['engineer','team_leader','director','customer_personnel','shop_tl','manager','shop_manager'] },
  { name: 'Unassigned Tasks', href: '/dashboard?filter=unassigned', icon: UserX, roles: ['team_leader','director','customer_personnel','shop_tl','manager','shop_manager'], badge: true },
  { name: 'Completed Tasks', href: '/tasks/completed', icon: CheckCircle, roles: ['engineer','team_leader','director','customer_personnel','customer','shop_tl','manager','shop_manager'] },
  { name: 'Hold Requests', href: '/hold-requests', icon: Clock, roles: ['team_leader'], badge: true },
  { name: 'Pending TL Approvals', href: '/pending-tl-approvals', icon: AlertCircle, roles: ['team_leader', 'director', 'engineer', 'customer_personnel', 'shop_tl', 'manager', 'shop_manager'], badge: true, directorPermissionKey: 'canViewPendingTLApprovals' },
  { name: 'Transfers', href: '/transfers', icon: ArrowLeftRight, roles: ['engineer','team_leader','director','shop_tl','customer_personnel','manager','shop_manager'], matrixPermissionKey: 'transfers' },
  { name: 'Create Task', href: '/tasks/create', icon: Plus, roles: ['team_leader','director','customer_personnel'], matrixPermissionKey: 'create_task', tlPermissionKey: 'canCreateTask' },
  { name: 'Performance', href: '/performance', icon: TrendingUp, roles: ['team_leader','director','manager','shop_tl','engineer','customer_personnel','shop_manager'], directorPermissionKey: 'canViewPerformanceMetrics', matrixPermissionKey: 'view_performance_metrics', tlPermissionKey: 'canViewPerformanceMetrics' },
  { name: 'Self Evaluation', href: '/self-evaluation', icon: ClipboardList, roles: SELF_EVALUATION_ROLES },
  { name: 'Reports', href: '/reports', icon: FileText, roles: ['team_leader','director','manager'], directorPermissionKey: 'canViewReports', tlPermissionKey: 'canViewReports' },
    { name: 'Eng Status Report', href: '/status-report', icon: ClipboardList, roles: ['team_leader','director'], directorPermissionKey: 'canViewReports', tlPermissionKey: 'canViewReports' },
  { name: 'Scheduler & Workload', href: '/hr/schedule', icon: Calendar, roles: ['team_leader','director','shop_tl','manager','shop_manager'], directorPermissionKey: 'canManageSchedules', tlPermissionKey: 'canManageSchedules' },
  { name: 'Employees', href: '/employees', icon: Users, roles: ['team_leader'], tlPermissionKey: 'canManageUsers' },
  { name: 'Maintenix Data', href: '/maintenix-data', icon: Database, roles: ['team_leader','director','manager','shop_tl','engineer','customer_personnel','shop_manager'], directorPermissionKey: 'canViewAnalytics', matrixPermissionKey: 'mantenix_data', tlPermissionKey: 'canManageData' },
  { name: 'Workload Adjustment', href: '/workload-adjustment', icon: Scale, roles: ['engineer','team_leader','director'], badge: true, matrixPermissionKey: 'workload_adjustment', tlPermissionKey: 'canWorkloadAdjustment' },
]

const MANAGEMENT_ITEMS: NavItem[] = [
  { name: 'Manage Users', href: '/management/users', icon: Users, roles: ['team_leader','director','shop_tl','manager','shop_manager'], directorPermissionKey: 'canManageUsers', tlPermissionKey: 'canManageUsers' },
  { name: 'TL Scopes', href: '/management/tl-scopes', icon: Shield, roles: ['director'], directorPermissionKey: 'canManageUsers' },
  { name: 'TL Permissions', href: '/management/tl-permissions', icon: Shield, roles: ['director','admin'], directorPermissionKey: 'canManageUsers' },
  { name: 'Manage Categories', href: '/management/categories', icon: Tag, roles: ['team_leader','director'], directorPermissionKey: 'canManageCategories', tlPermissionKey: 'canManageCategories' },
  { name: 'Manage Sub Types', href: '/management/subtypes', icon: List, roles: ['team_leader','director'], directorPermissionKey: 'canManageTaskTypes', tlPermissionKey: 'canManageTaskTypes' },
  { name: 'Manage Request Types', href: '/management/request-types', icon: FileText, roles: ['team_leader','director'], directorPermissionKey: 'canManageTaskTypes', tlPermissionKey: 'canManageTaskTypes' },
  { name: 'Manage Priorities', href: '/management/priorities', icon: Target, roles: ['team_leader','director'], directorPermissionKey: 'canManagePriorities', tlPermissionKey: 'canManagePriorities' },
  { name: 'Category Target Duration', href: '/management/target-days', icon: Clock, roles: ['team_leader','director'], directorPermissionKey: 'canManageCategories', tlPermissionKey: 'canManageCategories' },
]

const PROFILE_ITEMS: NavItem[] = [
  { name: 'Profile', href: '/profile', icon: User, roles: ['engineer','team_leader','director','customer_personnel','customer','shop_tl','manager','admin','shop_manager'] },
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['engineer','team_leader','director','customer_personnel','customer','shop_tl','manager','admin','shop_manager'] },
]

interface StatusFilterItem {
  name: string
  icon: any
  dotColor: string
}

const STATUS_FILTER_ITEMS: StatusFilterItem[] = [
  { name: 'Pending', icon: Hourglass, dotColor: 'bg-yellow-400' },
  { name: 'In Progress', icon: Timer, dotColor: 'bg-blue-400' },
  { name: 'Blocked', icon: AlertTriangle, dotColor: 'bg-red-400' },
  { name: 'On Hold', icon: Pause, dotColor: 'bg-purple-400' },
  { name: 'Paused', icon: Pause, dotColor: 'bg-amber-400' },
  { name: 'Rejected', icon: XCircle, dotColor: 'bg-gray-400' },
  { name: 'Cancelled', icon: XCircle, dotColor: 'bg-gray-500' },
]

interface DueFilterItem {
  name: string
  icon: any
  dotColor: string
  filterKey: string
}

const DUE_FILTER_ITEMS: DueFilterItem[] = [
  { name: 'Due Soon (≤3 days)', icon: CalendarClock, dotColor: 'bg-orange-400', filterKey: 'due_soon' },
  { name: 'Overdue', icon: AlertOctagon, dotColor: 'bg-red-500', filterKey: 'overdue' },
]

function canonicalizeRole(raw: any): string {
  if (raw === undefined || raw === null) return ''
  if (typeof raw === 'number') return ROLE_MAP[String(raw)] ?? String(raw)
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase()
    if (ROLE_MAP[s]) return ROLE_MAP[s]
    return s.replace(/[\s\-_]+/g, '_')
  }
  if (Array.isArray(raw)) return canonicalizeRole(raw[0])
  if (typeof raw === 'object') {
    if (raw.role) return canonicalizeRole(raw.role)
    if (raw.roleName) return canonicalizeRole(raw.roleName)
    if (raw.role_name) return canonicalizeRole(raw.role_name)
    if (raw.name) return canonicalizeRole(raw.name)
    try { return canonicalizeRole(JSON.stringify(raw)) } catch { return '' }
  }
  return ''
}

function titleCaseLabel(raw?: string) {
  if (!raw) return ''
  const s = String(raw)
    .replace(/[\-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s.split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

export default function Sidebar({ className }: { className?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, logout, isLoading, isAuthenticated, directorPermissions } = useAuth()
  const { hasPermission, isPrivilegedRole } = useRolePermissions()
  const [collapsed, setCollapsed] = useState(false)
  const [pendingHoldRequests, setPendingHoldRequests] = useState(0)
  const [pendingTLApprovals, setPendingTLApprovals] = useState(0)
  const [pendingWorkloadAdjustments, setPendingWorkloadAdjustments] = useState(0)
  const [unassignedTasksCount, setUnassignedTasksCount] = useState(0)
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({})
  const [activeStatusFilter, setActiveStatusFilter] = useState<string | null>(null)
  // SECURITY FIX: Use in-memory useState only (no localStorage persistence)
  // to avoid persistent browser storage exposure. This UI preference is
  // non-sensitive, but the security audit requires removing ALL
  // persistent localStorage writes from the app.
  const [filtersVisible, setFiltersVisible] = useState<boolean>(true)
  const [dueCounts, setDueCounts] = useState<Record<string, number>>({ due_soon: 0, overdue: 0 })
  const [activeDueFilter, setActiveDueFilter] = useState<string | null>(null)

  // SECURITY: One-time cleanup of any legacy localStorage entry from previous
  // app versions. This ensures the audit finding is fully remediated for
  // existing users on next load.
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem('sidebar_filters_visible')
      }
    } catch { /* ignore */ }
  }, [])

  const userRole = useMemo(() => {
    if (!user) return ''
    const raw = (user as any).role ?? (user as any).roleName ?? (user as any).role_name ?? (user as any).roleDisplayName ?? user
    return canonicalizeRole(raw)
  }, [user])

  const isTeamLeader = userRole === 'team_leader'
  const isDirector = userRole === 'director'

  // Enhanced role display with Admin support
  const roleLabel = useMemo(() => {
    if (!user) return ''
    const u: any = user
    
    // Handle Admin role
    if (userRole === 'admin' || userRole === 'administrator') {
      return 'Admin'
    }
    
    // Handle Shop Manager role
    if (userRole === 'shop_manager' || userRole === 'minimanager') {
      return 'Shop Manager'
    }
    
    // For customer_personnel role, check personnel type with all possible field name variations
    if (userRole === 'customer_personnel') {
      const personnelType = 
        u.personnelType ?? 
        u.personnel_type ?? 
        u.PersonnelType ?? 
        u.PERSONNEL_TYPE ??
        u.personneltype ??
        u.personelType ??
        u.personel_type ??
        null
      
      if (process.env.NODE_ENV === 'development') {
        console.log('[SIDEBAR] Customer Personnel detected:', {
          role: userRole,
          personnelType,
          allUserFields: Object.keys(u)
        })
      }
      
      if (personnelType) {
        const normalizedType = String(personnelType).toLowerCase().trim()
        if (process.env.NODE_ENV === 'development') {
          console.log('[SIDEBAR] Normalized personnelType:', normalizedType)
        }
        
        if (normalizedType === 'technician') {
          return 'Technician'
        }
        if (normalizedType === 'tools_clerk' || normalizedType === 'toolsclerk' || normalizedType === 'tools clerk') {
          return 'Tools Clerk'
        }
        if (normalizedType === 'warranty_officer' || normalizedType === 'warrantyofficer' || normalizedType === 'warranty officer') {
          return 'Warranty Officer'
      }
      }
      
      return 'Customer Personnel'
    }
    
    // For other roles, use the existing logic
    const rawCandidate =
      u.roleDisplayName ??
      u.roleName ??
      u.role_name ??
      u.role ??
      u.role_label ??
      u.roleLabel ??
      ''
    if (rawCandidate === undefined || rawCandidate === null || rawCandidate === '') {
      return titleCaseLabel(userRole)
    }
    if (typeof rawCandidate === 'number') {
      const mapped = ROLE_MAP[String(rawCandidate)] ?? String(rawCandidate)
      return titleCaseLabel(mapped)
    }
    return titleCaseLabel(String(rawCandidate))
  }, [user, userRole])

  useEffect(() => {
    if (isLoading || !isAuthenticated || !user || !isTeamLeader) {
      return
    }

    const fetchPendingCount = async () => {
      try {
        const response = await apiClient.get('/task-holds/pending')
        const data = response?.holdRequests || response?.data || response || []
        const requests = Array.isArray(data) ? data : []
        setPendingHoldRequests(requests.length)
      } catch (err: any) {
        setPendingHoldRequests(0)
      }
    }

    fetchPendingCount()

    const interval = setInterval(fetchPendingCount, 30000)

    const handleRefresh = () => fetchPendingCount()
    window.addEventListener('tasks:refresh', handleRefresh)
    window.addEventListener('hold-requests:refresh', handleRefresh)

    return () => {
      clearInterval(interval)
      window.removeEventListener('tasks:refresh', handleRefresh)
      window.removeEventListener('hold-requests:refresh', handleRefresh)
    }
  }, [isTeamLeader, isLoading, isAuthenticated, user])

  // Fetch pending TL approval count for Directors, Team Leaders, and other roles
  // For TL/Director: shows all pending TL approval tasks + hold requests (director only)
  // For other roles (engineer, customer_personnel, etc.): shows only tasks they created or are assigned to
  useEffect(() => {
    const isTLOrDirector = isTeamLeader || (isDirector && directorPermissions?.canViewPendingTLApprovals !== false)
    // For non-TL/Director roles, we still fetch but filter to only their own tasks
    const isOtherRole = !isTeamLeader && !isDirector && !!userRole
    if (isLoading || !isAuthenticated || !user || (!isTLOrDirector && !isOtherRole)) {
      return
    }

    const fetchPendingTLCount = async () => {
      try {
        let holdCount = 0
        let pendingTaskCount = 0

        // Fetch hold requests count (for directors)
        if (isDirector) {
          try {
            const holdResponse = await apiClient.get('/task-holds/pending')
            const holdData = holdResponse?.holdRequests || holdResponse?.data || holdResponse || []
            const holdRequests = Array.isArray(holdData) ? holdData : []
            holdCount = holdRequests.length
          } catch {
            holdCount = 0
          }
        }

        // Fetch tasks with PendingTLApproval status
        try {
          const tasksResponse = await apiClient.get('/tasks?status=PendingTLApproval')
          let tasksList: any[] = []
          if (Array.isArray(tasksResponse)) tasksList = tasksResponse
          else if (Array.isArray(tasksResponse?.tasks)) tasksList = tasksResponse.tasks
          else if (Array.isArray(tasksResponse?.data)) tasksList = tasksResponse.data

          if (isTLOrDirector) {
            // TL/Director see all pending TL approval tasks
            pendingTaskCount = tasksList.length
          } else {
            // Other roles: only count tasks they created or are assigned to
            const currentUserId = Number(user.userId ?? user.id)
            const currentFullName = (user.fullName || '').trim().toLowerCase()
            pendingTaskCount = tasksList.filter((t: any) => {
              const createdBy = Number(t.created_by ?? t.createdBy ?? t.CreatedBy ?? 0)
              if (createdBy && createdBy === currentUserId) return true
              const assignedEngineer = String(t.assigned_engineer ?? t.assignedEngineer ?? t.AssignedEngineer ?? '')
              if (currentFullName && assignedEngineer) {
                const engineers = assignedEngineer.split(',').map((s: string) => s.trim().toLowerCase())
                if (engineers.includes(currentFullName)) return true
              }
              return false
            }).length
          }
        } catch {
          pendingTaskCount = 0
        }

        setPendingTLApprovals(holdCount + pendingTaskCount)
      } catch (err: any) {
        setPendingTLApprovals(0)
      }
    }

    fetchPendingTLCount()

    const interval = setInterval(fetchPendingTLCount, 30000)

    const handleRefresh = () => fetchPendingTLCount()
    window.addEventListener('tasks:refresh', handleRefresh)
    window.addEventListener('hold-requests:refresh', handleRefresh)
    window.addEventListener('pending-tl-approvals:refresh', handleRefresh)

    return () => {
      clearInterval(interval)
      window.removeEventListener('tasks:refresh', handleRefresh)
      window.removeEventListener('hold-requests:refresh', handleRefresh)
      window.removeEventListener('pending-tl-approvals:refresh', handleRefresh)
    }
  }, [isTeamLeader, isDirector, isLoading, isAuthenticated, user, directorPermissions, userRole])

  // Fetch pending workload adjustment count for Team Leaders and Directors
  useEffect(() => {
    const canView = isTeamLeader || isDirector
    if (isLoading || !isAuthenticated || !user || !canView) {
      return
    }

    const fetchPendingAdjustments = async () => {
      try {
        const response = await apiClient.get('/workload-adjustment/pending')
        let count = 0
        if (response) {
          if (typeof response.total_count === 'number') {
            count = response.total_count
          } else if (Array.isArray(response.data)) {
            count = response.data.length
          } else if (Array.isArray(response)) {
            count = response.length
          }
        }
        setPendingWorkloadAdjustments(count)
      } catch {
        setPendingWorkloadAdjustments(0)
      }
    }

    fetchPendingAdjustments()

    const interval = setInterval(fetchPendingAdjustments, 30000)

    const handleRefresh = () => fetchPendingAdjustments()
    window.addEventListener('workload-adjustment:refresh', handleRefresh)

    return () => {
      clearInterval(interval)
      window.removeEventListener('workload-adjustment:refresh', handleRefresh)
    }
  }, [isTeamLeader, isDirector, isLoading, isAuthenticated, user])

  // Fetch unassigned task count for Team Leaders, Directors, Shop TLs, Managers, and Shop Managers
  useEffect(() => {
    const canViewUnassigned = ['team_leader', 'director', 'shop_tl', 'manager', 'shop_manager'].includes(userRole)
    if (isLoading || !isAuthenticated || !user || !canViewUnassigned) {
      return
    }

    const fetchUnassignedCount = async () => {
      try {
        const response = await apiClient.get('/tasks')
        let tasksList: any[] = []
        if (Array.isArray(response)) tasksList = response
        else if (Array.isArray(response?.tasks)) tasksList = response.tasks
        else if (Array.isArray(response?.data)) tasksList = response.data

        const unassigned = tasksList.filter((t: any) => {
          // Exclude completed, cancelled, rejected, archived, and pending TL approval from the unassigned count
          const rawStatus = t.status ?? t.Status ?? t.taskStatus ?? 0
          const statusStr = String(rawStatus).toLowerCase().replace(/[_\s-]+/g, '')
          const isTerminal =
            statusStr === 'completed' || statusStr === '2' ||
            statusStr === 'cancelled' || statusStr === 'canceled' || statusStr === '6' ||
            statusStr === 'rejected' || statusStr === '5' ||
            statusStr === 'pendingtlapproval' || statusStr === 'pendingtl' || statusStr === '8'
          if (isTerminal) return false

          const isArchived = Boolean(t.is_archived ?? t.isArchived ?? t.IsArchived ?? false)
          if (isArchived) return false

          const assigned = String(t.assigned_engineer ?? t.assignedEngineer ?? t.AssignedEngineer ?? '').trim().toLowerCase()
          return !assigned || assigned === 'unassigned' || assigned === 'null' || assigned === 'undefined' || assigned === 'n/a'
        }).length

        setUnassignedTasksCount(unassigned)
      } catch {
        setUnassignedTasksCount(0)
      }
    }

    fetchUnassignedCount()

    const interval = setInterval(fetchUnassignedCount, 30000)

    const handleRefresh = () => fetchUnassignedCount()
    window.addEventListener('tasks:refresh', handleRefresh)
    window.addEventListener('unassigned-tasks:refresh', handleRefresh)

    return () => {
      clearInterval(interval)
      window.removeEventListener('tasks:refresh', handleRefresh)
      window.removeEventListener('unassigned-tasks:refresh', handleRefresh)
    }
  }, [userRole, isLoading, isAuthenticated, user])

  // Fetch task status counts and due/overdue counts for the Status Filters section
  useEffect(() => {
    if (isLoading || !isAuthenticated || !user) {
      return
    }

    const fetchStatusCounts = async () => {
      try {
        const response = await apiClient.get('/tasks')
        let tasksList: any[] = []
        if (Array.isArray(response)) tasksList = response
        else if (Array.isArray(response?.tasks)) tasksList = response.tasks
        else if (Array.isArray(response?.data)) tasksList = response.data

        const counts: Record<string, number> = {}
        STATUS_FILTER_ITEMS.forEach(item => { counts[item.name] = 0 })

        let dueSoonCount = 0
        let overdueCount = 0
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const terminalStatuses = ['Completed', 'Cancelled', 'Rejected', 'Pending TL Approval']

        tasksList.forEach((t: any) => {
          const rawStatus = t.status ?? t.Status ?? t.taskStatus ?? 0
          let statusStr: string
          if (typeof rawStatus === 'number') {
            const numMap: Record<number, string> = { 0: 'Pending', 1: 'In Progress', 2: 'Completed', 3: 'Blocked', 4: 'On Hold', 5: 'Rejected', 6: 'Cancelled', 7: 'Paused', 8: 'Pending TL Approval' }
            statusStr = numMap[rawStatus] ?? 'Pending'
          } else {
            statusStr = String(rawStatus).trim()
          }
          if (counts[statusStr] !== undefined) {
            counts[statusStr]++
          }

          // Compute due soon / overdue counts
          // Skip terminal statuses and archived tasks
          if (terminalStatuses.includes(statusStr)) return
          const isArchived = Boolean(t.is_archived ?? t.isArchived ?? t.IsArchived ?? false)
          if (isArchived) return

          const rawTarget = t.target_completion_date ?? t.targetCompletionDate ?? t.TargetCompletionDate ?? null
          if (!rawTarget) return

          const targetDate = new Date(rawTarget)
          targetDate.setHours(0, 0, 0, 0)
          const diff = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

          if (diff < 0) {
            overdueCount++
          } else if (diff <= 3) {
            dueSoonCount++
          }
        })

        setStatusCounts(counts)
        setDueCounts({ due_soon: dueSoonCount, overdue: overdueCount })
      } catch {
        // silently fail — counts will remain at 0
      }
    }

    fetchStatusCounts()

    const interval = setInterval(fetchStatusCounts, 30000)

    const handleRefresh = () => fetchStatusCounts()
    window.addEventListener('tasks:refresh', handleRefresh)

    return () => {
      clearInterval(interval)
      window.removeEventListener('tasks:refresh', handleRefresh)
    }
  }, [isLoading, isAuthenticated, user])

  // Sync activeStatusFilter and activeDueFilter from TaskTable when user clicks a status badge in the table
  useEffect(() => {
    const handleFilterSync = (e: Event) => {
      const detail = (e as CustomEvent)?.detail || {}
      if (typeof detail.statusFilter === 'string') {
        setActiveStatusFilter(detail.statusFilter === 'all' ? null : detail.statusFilter)
      }
      if (typeof detail.dueFilter === 'string') {
        setActiveDueFilter(detail.dueFilter === 'all' ? null : detail.dueFilter)
      }
    }
    window.addEventListener('tasks:filters', handleFilterSync as EventListener)
    return () => { window.removeEventListener('tasks:filters', handleFilterSync as EventListener) }
  }, [])

  // Handle clicking a status filter in the sidebar
  const handleStatusFilterClick = (statusName: string) => {
    const newFilter = activeStatusFilter === statusName ? null : statusName
    setActiveStatusFilter(newFilter)
    // Clear due filter when switching to status filter
    if (newFilter) setActiveDueFilter(null)
    // Dispatch events for TaskTable to listen to
    try {
      window.dispatchEvent(new CustomEvent('sidebar:status-filter', {
        detail: { statusFilter: newFilter || 'all' }
      }))
      // Also clear the due filter in TaskTable if we're activating a status filter
      if (newFilter) {
        window.dispatchEvent(new CustomEvent('sidebar:due-filter', {
          detail: { dueFilter: 'all' }
        }))
      }
    } catch { /* noop */ }
  }

  // Handle clicking a due filter in the sidebar
  const handleDueFilterClick = (filterKey: string) => {
    const newFilter = activeDueFilter === filterKey ? null : filterKey
    setActiveDueFilter(newFilter)
    // Clear status filter when switching to due filter
    if (newFilter) setActiveStatusFilter(null)
    // Dispatch events for TaskTable to listen to
    try {
      window.dispatchEvent(new CustomEvent('sidebar:due-filter', {
        detail: { dueFilter: newFilter || 'all' }
      }))
      // Also clear the status filter in TaskTable if we're activating a due filter
      if (newFilter) {
        window.dispatchEvent(new CustomEvent('sidebar:status-filter', {
          detail: { statusFilter: 'all' }
        }))
      }
    } catch { /* noop */ }
  }

  /**
   * Determine if a nav item should be visible for the current user.
   * 1. First check the role-based filter.
   * 2. If the user is a Director AND the item declares a directorPermissionKey,
   *    additionally check that the corresponding permission is true.
   * 3. For non-privileged roles (not admin/director), if the item declares a
   *    matrixPermissionKey, check the admin-configured role permission matrix.
   */
  // Access TL permissions from context
  const { tlPermissions } = useTLPermissions()

  const isItemVisible = (item: NavItem) => {
    if (!userRole) return false

    // Step 1: Role check
    const normalizedRoles = item.roles.map(r => canonicalizeRole(r))
    if (!normalizedRoles.includes(userRole)) return false

    // Step 2: Director granular permission check
    if (isDirector && item.directorPermissionKey && directorPermissions) {
      const allowed = directorPermissions[item.directorPermissionKey]
      if (!allowed) {
        return false
      }
    }

    // Step 3: Team Leader granular permission check
    if (isTeamLeader && item.tlPermissionKey && tlPermissions) {
      const allowed = tlPermissions[item.tlPermissionKey]
      if (!allowed) {
        return false
      }
    }

    // Step 4: Matrix-based permission check for non-privileged roles
    // Admin and Director bypass the matrix (handled by isPrivilegedRole in the hook).
    // For all other roles, if the item has a matrixPermissionKey, check the matrix.
    if (!isPrivilegedRole && item.matrixPermissionKey) {
      if (!hasPermission(item.matrixPermissionKey)) {
        return false
      }
    }

    return true
  }

  const visibleNav = useMemo(() => {
    if (isLoading) return []
    if (!isAuthenticated) return []
    return NAV_ITEMS.filter(item => isItemVisible(item))
  }, [userRole, isLoading, isAuthenticated, directorPermissions, tlPermissions])

  const visibleManagement = useMemo(() => {
    if (isLoading) return []
    if (!isAuthenticated) return []
    return MANAGEMENT_ITEMS.filter(item => isItemVisible(item))
  }, [userRole, isLoading, isAuthenticated, directorPermissions, tlPermissions])

  const visibleProfile = useMemo(() => {
    if (isLoading) return []
    if (!isAuthenticated) return []
    return PROFILE_ITEMS.filter(item => isItemVisible(item))
  }, [userRole, isLoading, isAuthenticated, directorPermissions, tlPermissions])

  const navigate = (href: string) => {
    try {
      router.push(href)
      // FIX (Bug #2): Notify listeners (e.g., TaskTable) that the URL has changed.
      // When navigating from /dashboard -> /dashboard?filter=unassigned, Next.js
      // router.push() does NOT fire popstate and the page does not re-mount
      // (same pathname). Without this signal, the TaskTable would not pick up
      // the new ?filter=unassigned query on the first click.
      // We dispatch a custom event on the next tick so the URL is updated first.
      if (typeof window !== 'undefined') {
        setTimeout(() => {
          try {
            window.dispatchEvent(new CustomEvent('url:changed', { detail: { href } }))
            window.dispatchEvent(new CustomEvent('sidebar:navigate', { detail: { href } }))
          } catch {
            // noop
          }
        }, 0)
      }
    } catch {
      window.location.href = href
    }
  }

  // Display "RoleLabel (Full Name)" format
  const roleAndNameDisplay = useMemo(() => {
    const fullName = (user as any)?.fullName ?? (user as any)?.name ?? ''
    
    if (roleLabel && fullName) {
      const display = `${roleLabel} (${fullName})`
      return display
    }
    if (roleLabel) return roleLabel
    if (fullName) return fullName
    return 'User'
  }, [roleLabel, user])

  return (
    <aside className={cn('flex flex-col h-screen bg-gradient-to-b from-[#5E8F4D] to-[#48723C] text-white', collapsed ? 'w-20' : 'w-64', className)}>
      <div className="flex items-center justify-between px-4 h-16 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-1 rounded-full">
            <Plane className="h-6 w-6 text-white" />
          </div>
          {!collapsed && (
            <div>
              <div className="font-bold">Ethiopia Airlines</div>
              <div className="text-xs text-white/80">CMT Task Management</div>
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setCollapsed(s => !s)} className="text-white/90">
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2 py-4">
        <nav className="space-y-2">
          {visibleNav.map(item => {
            const Icon = item.icon
            const active = pathname === item.href
            const showBadge =
              (item.badge && item.name === 'Hold Requests' && pendingHoldRequests > 0) ||
              (item.badge && item.name === 'Pending TL Approvals' && pendingTLApprovals > 0) ||
              (item.badge && item.name === 'Workload Adjustment' && pendingWorkloadAdjustments > 0 && (isTeamLeader || isDirector)) ||
              (item.badge && item.name === 'Unassigned Tasks' && unassignedTasksCount > 0)
            const badgeCount =
              item.name === 'Hold Requests' ? pendingHoldRequests :
              item.name === 'Pending TL Approvals' ? pendingTLApprovals :
              item.name === 'Workload Adjustment' ? pendingWorkloadAdjustments :
              item.name === 'Unassigned Tasks' ? unassignedTasksCount : 0

            if (item.name === 'Create Task') {
              return (
                <div key={item.href} className={cn('flex items-center gap-3 px-3 py-2 rounded hover:bg-white/10', active && 'bg-white/20')}>
                  <Icon className="h-5 w-5" />
                  {!collapsed && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        navigate('/dashboard?openCreate=1')
                      }}
                      className="font-medium text-left w-full"
                      aria-label="Create Task"
                      title="Create Task"
                    >
                      {item.name}
                    </button>
                  )}
                </div>
              )
            }

            return (
              <button
                key={item.href}
                onClick={() => navigate(item.href)}
                className={cn('w-full text-left flex items-center justify-between gap-3 px-3 py-2 rounded hover:bg-white/10', active && 'bg-white/20')}
                aria-current={active ? 'page' : undefined}
              >
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5" />
                  {!collapsed && <span className="font-medium">{item.name}</span>}
                </div>
                {showBadge && !collapsed && (
                  <Badge 
                    variant="destructive" 
                    className="ml-auto bg-red-500 text-white hover:bg-red-600"
                  >
                    {badgeCount}
                  </Badge>
                )}
              </button>
            )
          })}

          {/* ─── Status Filters Section (with hide/unhide toggle) ─── */}
          {!collapsed && (
            <div className="mt-6 px-1">
              <div className="px-3 text-xs uppercase text-white/70 mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="h-3 w-3" />
                  Filters
                </div>
                <button
                  onClick={() => setFiltersVisible(v => !v)}
                  className="flex items-center gap-1 text-white/50 hover:text-white/90 transition-colors"
                  title={filtersVisible ? 'Hide filters' : 'Show filters'}
                >
                  {filtersVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {filtersVisible && (
                <div className="space-y-0.5">
                  {STATUS_FILTER_ITEMS.map(item => {
                    const count = statusCounts[item.name] ?? 0
                    const isActive = activeStatusFilter === item.name
                    return (
                      <button
                        key={item.name}
                        onClick={() => handleStatusFilterClick(item.name)}
                        className={cn(
                          'w-full text-left flex items-center justify-between gap-2 px-3 py-1.5 rounded text-sm transition-all',
                          isActive
                            ? 'bg-white/25 ring-1 ring-white/40'
                            : 'hover:bg-white/10'
                        )}
                        title={`Filter by ${item.name}${count > 0 ? ` (${count} tasks)` : ''}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={cn('h-2 w-2 rounded-full flex-shrink-0', item.dotColor)} />
                          <span className={cn('truncate', isActive ? 'font-semibold' : 'font-medium')}>{item.name}</span>
                        </div>
                        {count > 0 && (
                          <span className={cn(
                            'text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 min-w-[24px] text-center',
                            isActive ? 'bg-white/30 text-white font-bold' : 'bg-white/15 text-white/80'
                          )}>
                            {count}
                          </span>
                        )}
                      </button>
                    )
                  })}

                  {/* ─── Due / Overdue Filters ─── */}
                  <div className="pt-2 mt-2 border-t border-white/10">
                    <div className="px-3 text-[10px] uppercase text-white/50 mb-1">Due Date</div>
                    {DUE_FILTER_ITEMS.map(item => {
                      const count = dueCounts[item.filterKey] ?? 0
                      const isActive = activeDueFilter === item.filterKey
                      return (
                        <button
                          key={item.filterKey}
                          onClick={() => handleDueFilterClick(item.filterKey)}
                          className={cn(
                            'w-full text-left flex items-center justify-between gap-2 px-3 py-1.5 rounded text-sm transition-all',
                            isActive
                              ? 'bg-white/25 ring-1 ring-white/40'
                              : 'hover:bg-white/10'
                          )}
                          title={`Filter by ${item.name}${count > 0 ? ` (${count} tasks)` : ''}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={cn('h-2 w-2 rounded-full flex-shrink-0', item.dotColor)} />
                            <span className={cn('truncate', isActive ? 'font-semibold' : 'font-medium')}>{item.name}</span>
                          </div>
                          {count > 0 && (
                            <span className={cn(
                              'text-xs px-1.5 py-0.5 rounded-full flex-shrink-0 min-w-[24px] text-center',
                              isActive ? 'bg-white/30 text-white font-bold' : 'bg-white/15 text-white/80'
                            )}>
                              {count}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {(activeStatusFilter || activeDueFilter) && (
                    <button
                      onClick={() => {
                        if (activeStatusFilter) handleStatusFilterClick(activeStatusFilter)
                        if (activeDueFilter) handleDueFilterClick(activeDueFilter)
                      }}
                      className="w-full text-left flex items-center gap-2 px-3 py-1.5 rounded text-xs text-white/60 hover:text-white/90 hover:bg-white/10 transition-all"
                      title="Clear all filters"
                    >
                      <XCircle className="h-3 w-3" />
                      Clear Filter
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {collapsed && (
            <div className="mt-4 flex flex-col items-center gap-1">
              {STATUS_FILTER_ITEMS.map(item => {
                const count = statusCounts[item.name] ?? 0
                const isActive = activeStatusFilter === item.name
                if (count === 0) return null
                return (
                  <button
                    key={item.name}
                    onClick={() => handleStatusFilterClick(item.name)}
                    className={cn(
                      'relative flex items-center justify-center w-8 h-8 rounded transition-all',
                      isActive ? 'bg-white/25 ring-1 ring-white/40' : 'hover:bg-white/10'
                    )}
                    title={`${item.name} (${count})`}
                  >
                    <span className={cn('h-2.5 w-2.5 rounded-full', item.dotColor)} />
                    <span className="absolute -top-1 -right-1 text-[10px] bg-white/25 rounded-full min-w-[16px] text-center leading-[16px]">
                      {count > 99 ? '99+' : count}
                    </span>
                  </button>
                )
              })}
              {DUE_FILTER_ITEMS.map(item => {
                const count = dueCounts[item.filterKey] ?? 0
                const isActive = activeDueFilter === item.filterKey
                if (count === 0) return null
                return (
                  <button
                    key={item.filterKey}
                    onClick={() => handleDueFilterClick(item.filterKey)}
                    className={cn(
                      'relative flex items-center justify-center w-8 h-8 rounded transition-all',
                      isActive ? 'bg-white/25 ring-1 ring-white/40' : 'hover:bg-white/10'
                    )}
                    title={`${item.name} (${count})`}
                  >
                    <span className={cn('h-2.5 w-2.5 rounded-full', item.dotColor)} />
                    <span className="absolute -top-1 -right-1 text-[10px] bg-white/25 rounded-full min-w-[16px] text-center leading-[16px]">
                      {count > 99 ? '99+' : count}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {visibleManagement.length > 0 && (
            <>
              {!collapsed && <div className="mt-6 px-3 text-xs uppercase text-white/70">Management</div>}
              <div className="mt-2 space-y-1">
                {visibleManagement.map(m => {
                  const Icon = m.icon
                  const active = pathname === m.href
                  return (
                    <button
                      key={m.href}
                      onClick={() => navigate(m.href)}
                      className={cn('w-full text-left flex items-center gap-3 px-3 py-2 rounded hover:bg-white/10', active && 'bg-white/20')}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon className="h-5 w-5" />
                      {!collapsed && <span className="font-medium">{m.name}</span>}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {visibleProfile.length > 0 && (
            <>
              {!collapsed && <div className="mt-6 px-3 text-xs uppercase text-white/70">Account</div>}
              <div className="mt-2 space-y-1">
                {visibleProfile.map(p => {
                  const Icon = p.icon
                  const active = pathname === p.href
                  return (
                    <button
                      key={p.href}
                      onClick={() => navigate(p.href)}
                      className={cn('w-full text-left flex items-center gap-3 px-3 py-2 rounded hover:bg-white/10', active && 'bg-white/20')}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon className="h-5 w-5" />
                      {!collapsed && <span className="font-medium">{p.name}</span>}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </nav>

        <div className="mt-6 border-t border-white/10 pt-4 px-3">
          <button onClick={() => navigate('/help')} className="w-full text-left flex items-center gap-3 py-2 hover:bg-white/10 rounded">
            <HelpCircle className="h-5 w-5" />
            {!collapsed && <span>Help</span>}
          </button>

          <button onClick={() => logout()} className="w-full text-left flex items-center gap-3 py-2 hover:bg-white/10 rounded mt-2">
            <LogOut className="h-5 w-5" />
            {!collapsed && <span>Logout</span>}
          </button>
        </div>
      </ScrollArea>

      <div className="p-3 border-t border-white/10">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage 
              src={getProfilePictureUrl((user as any)?.profilePicturePath)} 
              alt="Profile"
            />
            <AvatarFallback>{getInitials((user as any)?.fullName)}</AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div>
              <div className="text-sm font-medium">{roleAndNameDisplay}</div>
              <div className="text-xs text-white/60">CMT Task Management V1.S.1</div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}