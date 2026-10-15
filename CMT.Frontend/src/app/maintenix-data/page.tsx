'use client'

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { useAuth } from '@/lib/auth-context'
import { useTLPermissions } from '@/lib/tl-permissions-context'
import { secureAuthStore } from '@/lib/secure-auth-store'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Search,
  RefreshCw,
  Loader2,
  Clock,
  CheckCircle2,
  BarChart3,
  Users,
  Wrench,
  Database,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Activity,
  Zap,
  Timer,
  AlertCircle,
  WifiOff,
  HardDrive,
  ServerCrash,
  Info,
  RotateCcw,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  type MaintenixTask,
  processMaintenixTasks,
  generateSummary,
  getCategoryColor,
  getCategoryIcon,
  getAllCategories,
  type TaskSummary,
} from '@/lib/maintenix-categorizer'

// Refresh interval options
const REFRESH_OPTIONS = [
  { label: 'Manual', value: 0 },
  { label: 'Every 5 min', value: 5 * 60 * 1000 },
  { label: 'Every 15 min', value: 15 * 60 * 1000 },
  { label: 'Every 30 min', value: 30 * 60 * 1000 },
  { label: 'Every 1 hr', value: 60 * 60 * 1000 },
]

// ─── Helper: Convert dd-MMM-yyyy to yyyy-MM-dd for <input type="date"> ───────
function maintenixDateToInputValue(mxDate: string): string {
  if (!mxDate) return ''
  const months: Record<string, string> = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
    JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
  }
  const parts = mxDate.split('-')
  if (parts.length !== 3) return ''
  const [dd, mmm, yyyy] = parts
  const mm = months[mmm.toUpperCase()] || '01'
  return `${yyyy}-${mm}-${dd}`
}

// ─── Helper: Convert yyyy-MM-dd from <input type="date"> to dd-MMM-yyyy ──────
function inputValueToMaintenixDate(inputVal: string): string {
  if (!inputVal) return ''
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  const [yyyy, mm, dd] = inputVal.split('-')
  const monthIdx = parseInt(mm, 10) - 1
  return `${dd}-${months[monthIdx]}-${yyyy}`
}

const PAGE_SIZE = 15

// ─── Default date range for Maintenix fetch ──────────────────────────────────
const DEFAULT_FROM_DATE = '21-FEB-2026'
const DEFAULT_END_DATE = '23-MAR-2026'

// ─── In-Memory Cache Helpers ─────────────────────────────────────────────────
// SECURITY FIX: Replaced localStorage-based cache with an in-memory Map to
// remove persistent browser storage exposure (security audit finding).
// Trade-off: cached Maintenix data no longer survives a full page reload.
// It still survives tab-local navigation within the SPA, which is the most
// common offline-fallback scenario during a single user session.
const CACHE_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

interface LocalCacheEntry {
  tasks: MaintenixTask[]
  fetchedAt: string
  dateRange: { from: string; to: string }
  cachedAt: number
}

// Module-level in-memory cache (lives for the lifetime of the JS module).
const inMemoryMaintenixCache: Map<string, LocalCacheEntry> = new Map()

function cacheKey(from: string, to: string): string {
  return `${from}__${to}`
}

function getLocalCache(from: string, to: string): LocalCacheEntry | null {
  const entry = inMemoryMaintenixCache.get(cacheKey(from, to))
  return entry ?? null
}

function setLocalCache(from: string, to: string, tasks: MaintenixTask[], fetchedAt: string): void {
  const entry: LocalCacheEntry = {
    tasks,
    fetchedAt,
    dateRange: { from, to },
    cachedAt: Date.now(),
  }
  inMemoryMaintenixCache.set(cacheKey(from, to), entry)

  // Keep only the 5 most recent entries to bound memory usage.
  if (inMemoryMaintenixCache.size > 5) {
    const sorted = Array.from(inMemoryMaintenixCache.entries()).sort(
      (a, b) => (a[1].cachedAt || 0) - (b[1].cachedAt || 0),
    )
    const toRemove = sorted.slice(0, inMemoryMaintenixCache.size - 5)
    for (const [k] of toRemove) {
      inMemoryMaintenixCache.delete(k)
    }
  }
}

function getAnyLocalCache(): LocalCacheEntry | null {
  if (inMemoryMaintenixCache.size === 0) return null
  let newest: LocalCacheEntry | null = null
  for (const entry of inMemoryMaintenixCache.values()) {
    if (!newest || (entry.cachedAt || 0) > (newest.cachedAt || 0)) {
      newest = entry
    }
  }
  return newest
}

// SECURITY: One-time cleanup of any legacy localStorage entries from previous
// app versions that persisted Maintenix data. Runs at module load so existing
// users are remediated on next visit.
if (typeof window !== 'undefined') {
  try {
    const legacyPrefix = 'maintenix_cache_'
    const legacyKeys = Object.keys(window.localStorage).filter(k => k.startsWith(legacyPrefix))
    for (const k of legacyKeys) {
      window.localStorage.removeItem(k)
    }
  } catch {
    // ignore
  }
}

function formatCacheAge(cachedAt: number): string {
  const diffMs = Date.now() - cachedAt
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h ago`
}

export default function MaintenixDataPage() {
  const { user } = useAuth()
  const { tlPermissions, isLoadingTLPermissions } = useTLPermissions()
  const router = useRouter()
  const userRoleNorm = (user?.role ?? '').toString().toLowerCase().replace(/[\s\-]+/g, '_')
  const isTL = userRoleNorm === 'team_leader' || userRoleNorm === 'teamleader'

  // TL permission guard
  useEffect(() => {
    if (isTL && !isLoadingTLPermissions && tlPermissions && !tlPermissions.canManageData) {
      router.replace('/dashboard')
    }
  }, [isTL, isLoadingTLPermissions, tlPermissions, router])

  const [tasks, setTasks] = useState<MaintenixTask[]>([])
  const [summary, setSummary] = useState<TaskSummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<string>('unknown')
  const [lastFetched, setLastFetched] = useState<string | null>(null)
  const [refreshInterval, setRefreshInterval] = useState<number>(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [engineerFilter, setEngineerFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortField, setSortField] = useState<string>('assigned_date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [currentPage, setCurrentPage] = useState(1)
  const [activeTab, setActiveTab] = useState('overview')

  const [fromDate, setFromDate] = useState<string>(DEFAULT_FROM_DATE)
  const [endDate, setEndDate] = useState<string>(DEFAULT_END_DATE)
  const [hasFetched, setHasFetched] = useState<boolean>(false)
  const [fetchedRange, setFetchedRange] = useState<{ from: string; to: string } | null>(null)
  const [isRevalidating, setIsRevalidating] = useState<boolean>(false)

  const [progressMessage, setProgressMessage] = useState<string>('')

  const [errorDetails, setErrorDetails] = useState<{
    errorCode?: string
    suggestions?: string[]
    serverStatus?: string
    cacheAgeMinutes?: number
  } | null>(null)
  const [retryCount, setRetryCount] = useState<number>(0)
  const [cacheInfo, setCacheInfo] = useState<{
    cachedAt: number
    dateRange: { from: string; to: string }
  } | null>(null)

  // Background poller timer
  const bgPollerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadFromLocalCache = useCallback(() => {
    const cached = getLocalCache(fromDate, endDate) || getAnyLocalCache()
    if (cached && cached.tasks && cached.tasks.length > 0) {
      const processed = processMaintenixTasks(cached.tasks)
      setTasks(processed)
      setSummary(generateSummary(processed))
      setDataSource('local_cache')
      setLastFetched(cached.fetchedAt)
      setCacheInfo({ cachedAt: cached.cachedAt, dateRange: cached.dateRange })
      setHasFetched(true)
      setFetchedRange(cached.dateRange)
      return true
    }
    return false
  }, [fromDate, endDate])

  /**
   * Apply the API response to state. Extracted so both the main fetch and the
   * silent background revalidation can share the same logic.
   */
  const applyApiResponse = useCallback((data: any, fromD: string, toD: string) => {
    if (!data || !data.success || !Array.isArray(data.tasks)) return false

    const processed = processMaintenixTasks(data.tasks)
    setTasks(processed)
    setSummary(generateSummary(processed))
    setDataSource(data.dataSource || 'unknown')
    setLastFetched(data.fetchedAt || new Date().toISOString())
    setHasFetched(true)
    setFetchedRange(data.dateRange || { from: fromD, to: toD })

    // Cache indicator handling
    if (
      data.dataSource === 'cached' ||
      data.dataSource === 'cached_revalidating' ||
      data.isStale
    ) {
      setCacheInfo({
        cachedAt: Date.now() - ((data.cacheAgeMinutes || 0) * 60000),
        dateRange: data.dateRange || { from: fromD, to: toD },
      })
    } else if (data.dataSource === 'live') {
      setCacheInfo(null)
      // SECURITY: Save to in-memory cache only (no persistent browser storage).
      setLocalCache(fromD, toD, data.tasks, data.fetchedAt || new Date().toISOString())
    }

    return true
  }, [])

  /**
   * Silent background revalidation. Runs without showing the loader or
   * overriding the table. If it returns fresh data we swap it in quietly.
   */
  const silentRevalidate = useCallback(async (fromD: string, toD: string) => {
    if (isRevalidating) return
    setIsRevalidating(true)
    try {
      const params = new URLSearchParams({ fromDate: fromD, endDate: toD, force: '1' })
      // SECURITY FIX: Use in-memory secure auth store instead of localStorage for tokens.
      // The HttpOnly cookie is also sent automatically via credentials: 'include'.
      const svToken = secureAuthStore.getToken()
      const svHeaders: Record<string, string> = {}
      if (svToken) svHeaders['Authorization'] = `Bearer ${svToken}`
      const res = await fetch(`/api/maintenix/fetch?${params.toString()}`, {
        headers: svHeaders,
        credentials: 'include',
      })
      const data = await res.json().catch(() => null)
      if (data && data.success && Array.isArray(data.tasks) && data.tasks.length > 0) {
        applyApiResponse(data, fromD, toD)
        // Only clear error if we got live fresh data
        if (data.dataSource === 'live') {
          setError(null)
          setErrorDetails(null)
        }
      }
    } catch {
      // Silent — background call. Keep existing data visible.
    } finally {
      setIsRevalidating(false)
    }
  }, [isRevalidating, applyApiResponse])

  const fetchData = useCallback(async (explicitTrigger = false) => {
    if (!explicitTrigger && hasFetched && fetchedRange?.from === fromDate && fetchedRange?.to === endDate) {
      return
    }

    setLoading(true)
    setError(null)
    setErrorDetails(null)
    setProgressMessage('Connecting to Maintenix server...')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5 * 60 * 1000)

    const progressTimer = setInterval(() => {
      setProgressMessage(prev => {
        if (prev.includes('Connecting')) return 'Authenticating with Maintenix...'
        if (prev.includes('Authenticating')) return 'Generating report (this may take 1-2 minutes)...'
        if (prev.includes('Generating report')) return 'Still generating report — Jasper is processing the data...'
        if (prev.includes('Still generating')) return 'Almost there — downloading report data...'
        return prev
      })
    }, 12000)

    try {
      const params = new URLSearchParams({
        source: 'auto',
        fromDate,
        endDate,
      })
      // SECURITY FIX: Use in-memory secure auth store instead of localStorage for tokens.
      // The HttpOnly cookie is also sent automatically via credentials: 'include'.
      const fdToken = secureAuthStore.getToken()
      const fdHeaders: Record<string, string> = {}
      if (fdToken) fdHeaders['Authorization'] = `Bearer ${fdToken}`
      const res = await fetch(`/api/maintenix/fetch?${params.toString()}`, {
        headers: fdHeaders,
        credentials: 'include',
        signal: controller.signal,
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        const errorCode = data?.errorCode || `HTTP_${res.status}`
        const suggestions = data?.suggestions || []
        const serverStatus = data?.serverStatus || 'error'

        // If the API returned cached data despite an error status, use it
        if (data?.success && Array.isArray(data?.tasks) && data.tasks.length > 0) {
          applyApiResponse(data, fromDate, endDate)
          setError(data.message || null)
          setErrorDetails({ errorCode, suggestions, serverStatus, cacheAgeMinutes: data.cacheAgeMinutes })
          return
        }

        const loadedFromCache = loadFromLocalCache()
        if (loadedFromCache) {
          setError(
            data?.message ||
            `Maintenix server returned an error (${errorCode}). Showing locally cached data instead.`
          )
          setErrorDetails({ errorCode, suggestions, serverStatus })
          return
        }

        throw {
          message: data?.message || `Failed to fetch: ${res.status}`,
          errorCode,
          suggestions,
          serverStatus,
        }
      }

      if (data?.success && Array.isArray(data.tasks)) {
        applyApiResponse(data, fromDate, endDate)
        setRetryCount(0)

        // If server returned stale-while-revalidate (cached_revalidating), the
        // backend is already refreshing. We don't show an error; we just hint
        // in the UI that a refresh is in flight.
        if (data.dataSource === 'cached_revalidating') {
          setIsRevalidating(true)
          setError(null)
          setErrorDetails({
            errorCode: 'CACHE_REVALIDATING',
            serverStatus: 'refreshing',
            cacheAgeMinutes: data.cacheAgeMinutes,
          })
        } else if (data.dataSource === 'cached' && data.message) {
          setError(null)
          setErrorDetails({
            errorCode: 'SERVED_FROM_CACHE',
            serverStatus: data.serverStatus || 'cached',
            cacheAgeMinutes: data.cacheAgeMinutes,
          })
        } else {
          setError(null)
          setErrorDetails(null)
        }
      } else {
        throw {
          message: data?.message || 'No data returned',
          errorCode: 'NO_DATA',
          suggestions: ['Try a different date range', 'Verify the Maintenix report is configured correctly'],
          serverStatus: 'no_data',
        }
      }
    } catch (err: any) {
      setRetryCount(prev => prev + 1)

      if (err.name === 'AbortError') {
        const loadedFromCache = loadFromLocalCache()
        const cacheMsg = loadedFromCache ? ' Showing locally cached data instead.' : ''
        setError(
          `The request timed out after 5 minutes. The Maintenix server may be under heavy load.${cacheMsg}`
        )
        setErrorDetails({
          errorCode: 'FRONTEND_TIMEOUT',
          suggestions: [
            'Try a smaller date range (e.g., 2 weeks)',
            'Try again during off-peak hours',
            'Wait a few minutes and retry',
          ],
          serverStatus: 'timeout',
        })
      } else if (err.errorCode) {
        setError(err.message)
        setErrorDetails({
          errorCode: err.errorCode,
          suggestions: err.suggestions || [],
          serverStatus: err.serverStatus || 'error',
        })
      } else {
        const errorMsg = err.message || 'Failed to fetch Maintenix data'

        if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError') || errorMsg.includes('fetch')) {
          const loadedFromCache = loadFromLocalCache()
          if (loadedFromCache) {
            setError('Network connection lost. Showing locally cached data.')
            setErrorDetails({
              errorCode: 'NETWORK_ERROR',
              suggestions: ['Check your internet connection', 'Try again when connected'],
              serverStatus: 'offline',
            })
            return
          }
        }

        if (errorMsg.includes('504') || errorMsg.includes('502') || errorMsg.includes('Failed to fetch')) {
          setError(
            'Unable to connect to the Maintenix server. This may be due to network restrictions, ' +
            'the server being temporarily unavailable, or a firewall blocking the connection.'
          )
          setErrorDetails({
            errorCode: 'CONNECTION_FAILED',
            suggestions: [
              'Verify the Maintenix server is accessible',
              'Check network/firewall settings',
              'Try again in a few minutes',
              'Contact IT support if the problem persists',
            ],
            serverStatus: 'unreachable',
          })
        } else if (errorMsg.includes('timed out') || errorMsg.includes('BUDGET_EXHAUSTED')) {
          setError('The Maintenix server is taking too long to generate the report.')
          setErrorDetails({
            errorCode: 'BUDGET_EXHAUSTED',
            suggestions: [
              'Reduce the date range to 2 weeks or less',
              'Try again during off-peak hours',
              'Wait 5 minutes and retry',
            ],
            serverStatus: 'slow',
          })
        } else {
          setError(errorMsg)
          setErrorDetails({
            errorCode: 'UNKNOWN',
            suggestions: ['Try again', 'Try a smaller date range', 'Contact IT support'],
            serverStatus: 'error',
          })
        }
      }
    } finally {
      clearTimeout(timeoutId)
      clearInterval(progressTimer)
      setLoading(false)
      setProgressMessage('')
    }
  }, [fromDate, endDate, hasFetched, fetchedRange, loadFromLocalCache, applyApiResponse])

  // Initial load
  useEffect(() => {
    if (!hasFetched) {
      fetchData(true)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresh
  useEffect(() => {
    if (refreshInterval <= 0) return
    const interval = setInterval(() => fetchData(true), refreshInterval)
    return () => clearInterval(interval)
  }, [refreshInterval, fetchData])

  /**
   * Continuous data extraction: if we are currently showing cached data, kick
   * off a silent background poll every 45s to try to upgrade the table to live
   * data. Stops automatically once live data is obtained.
   */
  useEffect(() => {
    // Clear any previous poller
    if (bgPollerRef.current) {
      clearInterval(bgPollerRef.current)
      bgPollerRef.current = null
    }

    const isCachedView =
      dataSource === 'cached' ||
      dataSource === 'cached_revalidating' ||
      dataSource === 'local_cache'

    if (!isCachedView || !hasFetched || !fetchedRange) return

    bgPollerRef.current = setInterval(() => {
      silentRevalidate(fetchedRange.from, fetchedRange.to)
    }, 45_000)

    return () => {
      if (bgPollerRef.current) {
        clearInterval(bgPollerRef.current)
        bgPollerRef.current = null
      }
    }
  }, [dataSource, hasFetched, fetchedRange, silentRevalidate])

  const handleFromDateChange = useCallback((inputVal: string) => {
    const mxDate = inputValueToMaintenixDate(inputVal)
    if (mxDate) {
      setFromDate(mxDate)
      setHasFetched(false)
    }
  }, [])

  const handleEndDateChange = useCallback((inputVal: string) => {
    const mxDate = inputValueToMaintenixDate(inputVal)
    if (mxDate) {
      setEndDate(mxDate)
      setHasFetched(false)
    }
  }, [])

  const engineers = useMemo(() => {
    const set = new Set(tasks.map(t => t.name).filter(Boolean))
    return Array.from(set).sort()
  }, [tasks])

  const categories = useMemo(() => {
    const set = new Set(tasks.map(t => t.category || 'Uncategorized'))
    return Array.from(set).sort()
  }, [tasks])

  const filteredTasks = useMemo(() => {
    let result = [...tasks]

    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        t =>
          (t.part_no || '').toLowerCase().includes(q) ||
          (t.serial_number || '').toLowerCase().includes(q) ||
          (t.name || '').toLowerCase().includes(q) ||
          (t.user_id || '').toLowerCase().includes(q) ||
          (t.task_detail || '').toLowerCase().includes(q) ||
          (t.part_description || '').toLowerCase().includes(q) ||
          (t.barcode || '').toLowerCase().includes(q) ||
          (t.location || '').toLowerCase().includes(q)
      )
    }

    if (categoryFilter !== 'all') {
      result = result.filter(t => t.category === categoryFilter)
    }

    if (engineerFilter !== 'all') {
      result = result.filter(t => t.name === engineerFilter)
    }

    if (statusFilter !== 'all') {
      result = result.filter(t => (t.status || '').toUpperCase() === statusFilter.toUpperCase())
    }

    result.sort((a, b) => {
      let aVal: any = (a as any)[sortField] ?? ''
      let bVal: any = (b as any)[sortField] ?? ''
      if (sortField === 'elapsed_days') {
        aVal = Number(aVal) || 0
        bVal = Number(bVal) || 0
      }
      if (typeof aVal === 'string') aVal = aVal.toLowerCase()
      if (typeof bVal === 'string') bVal = bVal.toLowerCase()
      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [tasks, searchQuery, categoryFilter, engineerFilter, statusFilter, sortField, sortDirection])

  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / PAGE_SIZE))
  const paginatedTasks = filteredTasks.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, categoryFilter, engineerFilter, statusFilter])

  const categoryChartData = useMemo(() => {
    if (!summary) return []
    return Object.entries(summary.byCategory)
      .map(([name, value]) => ({
        name,
        value,
        fill: getCategoryColor(name),
      }))
      .sort((a, b) => b.value - a.value)
  }, [summary])

  const engineerChartData = useMemo(() => {
    if (!summary) return []
    return Object.entries(summary.byEngineer)
      .map(([name, data]) => ({
        name: name.split(' ')[0],
        fullName: name,
        tasks: data.total,
        completed: data.completed,
        avgDays: parseFloat(data.avgElapsed.toFixed(1)),
      }))
      .sort((a, b) => b.tasks - a.tasks)
  }, [summary])

  const shopChartData = useMemo(() => {
    if (!summary) return []
    return Object.entries(summary.byShop)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }, [summary])

  const elapsedDistribution = useMemo(() => {
    const dist = { 'Same Day': 0, '1 Day': 0, '2 Days': 0, '3+ Days': 0 }
    tasks.forEach(t => {
      const d = t.elapsed_days || 0
      if (d === 0) dist['Same Day']++
      else if (d === 1) dist['1 Day']++
      else if (d === 2) dist['2 Days']++
      else dist['3+ Days']++
    })
    return Object.entries(dist).map(([name, value]) => ({ name, value }))
  }, [tasks])

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const handleExportCSV = () => {
    const headers = [
      'User ID', 'Name', 'Part No', 'S/N',
      'Assigned Date', 'Completed Date', 'Elapsed Time (Days)',
      'Status', 'Location', 'BARCODE', 'Task Detail', 'Part Description',
    ]
    const rows = filteredTasks.map(t => [
      t.user_id, t.name, t.part_no, t.serial_number,
      t.assigned_date, t.completed_date, t.elapsed_days,
      t.status, t.location, t.barcode, t.task_detail, t.part_description,
    ])
    const csv = [headers, ...rows]
      .map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `maintenix_tasks_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const PIE_COLORS = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444', '#F97316', '#14B8A6', '#6366F1', '#10B981', '#64748B']

  if (isTL && isLoadingTLPermissions) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <span className="ml-3 text-gray-600">Checking permissions...</span>
        </div>
      </MainLayout>
    )
  }

  if (isTL && tlPermissions && !tlPermissions.canManageData) {
    return null
  }

  // All 12 columns for the Data Table — fixed order as required.
  const DATA_COLUMNS: Array<{ key: string; label: string; className?: string }> = [
    { key: 'user_id', label: 'User ID' },
    { key: 'name', label: 'Name' },
    { key: 'part_no', label: 'Part No' },
    { key: 'serial_number', label: 'S/N' },
    { key: 'assigned_date', label: 'Assigned Date' },
    { key: 'completed_date', label: 'Completed Date' },
    { key: 'elapsed_days', label: 'Elapsed Time' },
    { key: 'status', label: 'Status' },
    { key: 'location', label: 'Location' },
    { key: 'barcode', label: 'BARCODE' },
    { key: 'task_detail', label: 'Task Detail' },
    { key: 'part_description', label: 'Part Description' },
  ]

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Database className="h-7 w-7 text-blue-600" />
              Maintenix Data Integration
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Engineering Requested Tasks — Auto-categorized from Maintenix
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <Badge
              variant={dataSource === 'live' ? 'default' : dataSource === 'cached' ? 'outline' : 'secondary'}
              className={`text-xs ${
                dataSource === 'live'
                  ? 'bg-green-100 text-green-800 border-green-300'
                  : dataSource === 'cached'
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : dataSource === 'cached_revalidating'
                      ? 'bg-blue-50 text-blue-800 border-blue-300'
                      : dataSource === 'local_cache'
                        ? 'bg-orange-50 text-orange-800 border-orange-300'
                        : ''
              }`}
            >
              {dataSource === 'live'
                ? '🟢 Live'
                : dataSource === 'cached'
                  ? '🟡 Server Cache'
                  : dataSource === 'cached_revalidating'
                    ? '🔵 Refreshing...'
                    : dataSource === 'local_cache'
                      ? '🟠 Local Cache'
                      : '📁 Static Data'}
            </Badge>

            {isRevalidating && dataSource !== 'live' && (
              <span className="text-xs text-blue-600 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Refreshing in background...
              </span>
            )}

            {lastFetched && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(lastFetched).toLocaleString()}
              </span>
            )}

            <Select
              value={String(refreshInterval)}
              onValueChange={v => setRefreshInterval(Number(v))}
            >
              <SelectTrigger className="w-36 h-8 text-xs">
                <SelectValue placeholder="Auto-refresh" />
              </SelectTrigger>
              <SelectContent>
                {REFRESH_OPTIONS.map(opt => (
                  <SelectItem key={opt.value} value={String(opt.value)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={() => fetchData(true)} disabled={loading} size="sm" variant="outline">
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Fetch Now
            </Button>

            <Button onClick={handleExportCSV} size="sm" variant="outline" disabled={filteredTasks.length === 0}>
              <Download className="h-4 w-4 mr-1" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* Maintenix Date Range Selection */}
        <Card className="border-blue-200 bg-blue-50/30">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
                <Database className="h-4 w-4" />
                Maintenix Data Fetch Range
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <label htmlFor="mx-from-date" className="text-xs font-medium text-gray-600 whitespace-nowrap">
                    From:
                  </label>
                  <Input
                    id="mx-from-date"
                    type="date"
                    value={maintenixDateToInputValue(fromDate)}
                    onChange={e => handleFromDateChange(e.target.value)}
                    className="h-8 w-40 text-xs"
                  />
                  <span className="text-xs text-gray-500 font-mono">{fromDate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <label htmlFor="mx-end-date" className="text-xs font-medium text-gray-600 whitespace-nowrap">
                    To:
                  </label>
                  <Input
                    id="mx-end-date"
                    type="date"
                    value={maintenixDateToInputValue(endDate)}
                    onChange={e => handleEndDateChange(e.target.value)}
                    className="h-8 w-40 text-xs"
                  />
                  <span className="text-xs text-gray-500 font-mono">{endDate}</span>
                </div>
                <Button
                  onClick={() => fetchData(true)}
                  disabled={loading}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
                  {hasFetched ? 'Re-Fetch Data' : 'Fetch Data'}
                </Button>
              </div>
              {fetchedRange && hasFetched && (
                <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-2 py-1">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>
                    Data loaded: {fetchedRange.from} → {fetchedRange.to}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cached Data Indicator */}
        {(dataSource === 'cached' || dataSource === 'cached_revalidating' || dataSource === 'local_cache') && cacheInfo && !error && (
          <div className={`rounded-md border p-3 ${
            dataSource === 'cached_revalidating'
              ? 'bg-blue-50 border-blue-200'
              : 'bg-amber-50 border-amber-200'
          }`}>
            <div className="flex items-center gap-2">
              {dataSource === 'cached_revalidating' ? (
                <Loader2 className="h-4 w-4 text-blue-600 flex-shrink-0 animate-spin" />
              ) : (
                <HardDrive className="h-4 w-4 text-amber-600 flex-shrink-0" />
              )}
              <div className="flex-1">
                <p className={`text-sm font-medium ${
                  dataSource === 'cached_revalidating' ? 'text-blue-800' : 'text-amber-800'
                }`}>
                  {dataSource === 'cached_revalidating'
                    ? `Showing cached data while refreshing from Maintenix in background`
                    : `Showing cached data${cacheInfo.cachedAt ? ` (${formatCacheAge(cacheInfo.cachedAt)})` : ''}`}
                </p>
                <p className={`text-xs mt-0.5 ${
                  dataSource === 'cached_revalidating' ? 'text-blue-600' : 'text-amber-600'
                }`}>
                  Date range: {cacheInfo.dateRange.from} → {cacheInfo.dateRange.to}.
                  {' '}Data will refresh automatically when Maintenix responds.
                </p>
              </div>
              <Button
                onClick={() => fetchData(true)}
                disabled={loading}
                size="sm"
                variant="outline"
                className={dataSource === 'cached_revalidating'
                  ? 'border-blue-300 text-blue-700 hover:bg-blue-100'
                  : 'border-amber-300 text-amber-700 hover:bg-amber-100'
                }
              >
                <RotateCcw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
                Retry Live
              </Button>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className={`rounded-md border p-4 ${
            tasks.length > 0
              ? 'bg-amber-50 border-amber-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-start gap-3">
              {tasks.length > 0 ? (
                <Info className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              ) : errorDetails?.serverStatus === 'unreachable' || errorDetails?.serverStatus === 'offline' ? (
                <WifiOff className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              ) : errorDetails?.serverStatus === 'slow' || errorDetails?.errorCode === 'BUDGET_EXHAUSTED' ? (
                <ServerCrash className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${tasks.length > 0 ? 'text-amber-800' : 'text-red-800'}`}>
                  {error}
                </p>

                {errorDetails?.suggestions && errorDetails.suggestions.length > 0 && tasks.length === 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-gray-600 mb-1">Suggestions:</p>
                    <ul className="text-xs text-gray-600 space-y-0.5">
                      {errorDetails.suggestions.map((s, i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <span className="text-gray-400">•</span>
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {retryCount > 0 && tasks.length === 0 && (
                  <p className="text-xs text-gray-500 mt-2">
                    Attempt {retryCount} failed.
                    {retryCount >= 3 && ' Consider trying a smaller date range or contacting IT support.'}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {tasks.length === 0 && (
                  <Button
                    onClick={() => fetchData(true)}
                    disabled={loading}
                    size="sm"
                    variant="outline"
                    className={tasks.length > 0
                      ? 'border-amber-300 text-amber-700 hover:bg-amber-100'
                      : 'border-red-300 text-red-700 hover:bg-red-100'
                    }
                  >
                    <RotateCcw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
                    Retry
                  </Button>
                )}
                {error && (
                  <Button
                    onClick={() => { setError(null); setErrorDetails(null) }}
                    size="sm"
                    variant="ghost"
                    className="text-gray-400 hover:text-gray-600 h-7 w-7 p-0"
                    title="Dismiss"
                  >
                    ×
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        {loading && tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-16 gap-4">
            <div className="flex items-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-3 text-gray-600">Fetching Maintenix data from {fromDate} to {endDate}...</span>
            </div>
            {progressMessage && (
              <div className="text-sm text-blue-600 animate-pulse">{progressMessage}</div>
            )}
            <div className="text-xs text-gray-400 max-w-md text-center">
              The Jasper report server may take 1-3 minutes to generate the Excel export.
              Please wait — the data will appear automatically.
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="overview" className="flex items-center gap-1">
                <BarChart3 className="h-4 w-4" /> Overview
              </TabsTrigger>
              <TabsTrigger value="engineer" className="flex items-center gap-1">
                <Users className="h-4 w-4" /> Engineer Performance
              </TabsTrigger>
              <TabsTrigger value="data" className="flex items-center gap-1">
                <Database className="h-4 w-4" /> Data Table
              </TabsTrigger>
            </TabsList>

            {/* ===== OVERVIEW TAB ===== */}
            <TabsContent value="overview" className="space-y-6">
              {summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  <Card className="border-l-4 border-l-blue-500">
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Total Tasks</p>
                          <p className="text-2xl font-bold text-gray-900">{summary.totalTasks}</p>
                        </div>
                        <Wrench className="h-8 w-8 text-blue-500 opacity-30" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-green-500">
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Completed</p>
                          <p className="text-2xl font-bold text-green-700">{summary.completedTasks}</p>
                        </div>
                        <CheckCircle2 className="h-8 w-8 text-green-500 opacity-30" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-purple-500">
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Categories</p>
                          <p className="text-2xl font-bold text-purple-700">{Object.keys(summary.byCategory).length}</p>
                        </div>
                        <Filter className="h-8 w-8 text-purple-500 opacity-30" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-orange-500">
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Avg. Elapsed</p>
                          <p className="text-2xl font-bold text-orange-700">{summary.avgElapsedDays.toFixed(1)}d</p>
                        </div>
                        <Timer className="h-8 w-8 text-orange-500 opacity-30" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-teal-500">
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Same Day</p>
                          <p className="text-2xl font-bold text-teal-700">{summary.sameDayCompletions}</p>
                        </div>
                        <Zap className="h-8 w-8 text-teal-500 opacity-30" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-l-4 border-l-red-500">
                    <CardContent className="pt-4 pb-3 px-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs text-gray-500 font-medium">Multi-Day</p>
                          <p className="text-2xl font-bold text-red-700">{summary.multiDayTasks}</p>
                        </div>
                        <Activity className="h-8 w-8 text-red-500 opacity-30" />
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Task Distribution by Category</CardTitle>
                    <CardDescription>Auto-categorized from task details and location</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoryChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={110}
                            paddingAngle={2}
                            dataKey="value"
                            label={({ name, value }) => `${name}: ${value}`}
                            labelLine={true}
                          >
                            {categoryChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill || PIE_COLORS[index % PIE_COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Completion Time Distribution</CardTitle>
                    <CardDescription>How quickly tasks are completed</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={elapsedDistribution}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Tasks by Shop/Location</CardTitle>
                  <CardDescription>Distribution across maintenance shops</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={shopChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={150} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="value" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Category Legend</CardTitle>
                  <CardDescription>Auto-categorization rules based on task keywords</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {getAllCategories().map(cat => (
                      <div
                        key={cat.category}
                        className="flex items-center gap-2 p-2 rounded-lg border hover:bg-gray-50 cursor-pointer transition-colors"
                        onClick={() => {
                          setCategoryFilter(cat.category)
                          setActiveTab('data')
                        }}
                      >
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                        <span className="text-sm">{cat.icon}</span>
                        <span className="text-xs font-medium text-gray-700">{cat.category}</span>
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {summary?.byCategory[cat.category] || 0}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ===== ENGINEER PERFORMANCE TAB ===== */}
            <TabsContent value="engineer" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Tasks per Engineer</CardTitle>
                    <CardDescription>Total tasks assigned and completed</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={engineerChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload
                                return (
                                  <div className="bg-white p-3 border rounded-lg shadow-lg">
                                    <p className="font-semibold text-sm">{data.fullName}</p>
                                    <p className="text-xs text-gray-600">Total: {data.tasks}</p>
                                    <p className="text-xs text-green-600">Completed: {data.completed}</p>
                                    <p className="text-xs text-orange-600">Avg: {data.avgDays}d</p>
                                  </div>
                                )
                              }
                              return null
                            }}
                          />
                          <Bar dataKey="tasks" fill="#3B82F6" name="Total Tasks" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="completed" fill="#10B981" name="Completed" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Average Completion Time</CardTitle>
                    <CardDescription>Average elapsed days per engineer</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={engineerChartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload
                                return (
                                  <div className="bg-white p-3 border rounded-lg shadow-lg">
                                    <p className="font-semibold text-sm">{data.fullName}</p>
                                    <p className="text-xs text-orange-600">Avg: {data.avgDays} days</p>
                                  </div>
                                )
                              }
                              return null
                            }}
                          />
                          <Bar dataKey="avgDays" fill="#F59E0B" name="Avg Days" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {summary &&
                  Object.entries(summary.byEngineer)
                    .sort(([, a], [, b]) => b.total - a.total)
                    .map(([name, data]) => {
                      const engTasks = tasks.filter(t => t.name === name)
                      const catBreakdown: Record<string, number> = {}
                      engTasks.forEach(t => {
                        const cat = t.category || 'Uncategorized'
                        catBreakdown[cat] = (catBreakdown[cat] || 0) + 1
                      })

                      return (
                        <Card key={name} className="hover:shadow-md transition-shadow">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-base flex items-center justify-between">
                              <span>{name}</span>
                              <Badge variant="secondary">{data.total} tasks</Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="bg-green-50 rounded-lg p-2">
                                <p className="text-lg font-bold text-green-700">{data.completed}</p>
                                <p className="text-[10px] text-green-600">Completed</p>
                              </div>
                              <div className="bg-orange-50 rounded-lg p-2">
                                <p className="text-lg font-bold text-orange-700">{data.avgElapsed.toFixed(1)}d</p>
                                <p className="text-[10px] text-orange-600">Avg Time</p>
                              </div>
                              <div className="bg-blue-50 rounded-lg p-2">
                                <p className="text-lg font-bold text-blue-700">
                                  {data.total > 0 ? ((data.completed / data.total) * 100).toFixed(0) : 0}%
                                </p>
                                <p className="text-[10px] text-blue-600">Rate</p>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-gray-500">Category Breakdown:</p>
                              {Object.entries(catBreakdown)
                                .sort(([, a], [, b]) => b - a)
                                .map(([cat, count]) => (
                                  <div key={cat} className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1">
                                      <span
                                        className="w-2 h-2 rounded-full inline-block"
                                        style={{ backgroundColor: getCategoryColor(cat) }}
                                      />
                                      {getCategoryIcon(cat)} {cat}
                                    </span>
                                    <span className="font-medium">{count}</span>
                                  </div>
                                ))}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
              </div>
            </TabsContent>

            {/* ===== DATA TABLE TAB ===== */}
            <TabsContent value="data" className="space-y-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search User ID, Name, Part No, S/N, BARCODE, Location, Description..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map(c => (
                      <SelectItem key={c} value={c}>
                        {getCategoryIcon(c)} {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={engineerFilter} onValueChange={setEngineerFilter}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="All Engineers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Engineers</SelectItem>
                    {engineers.map(e => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full md:w-36">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="COMPLETE">Complete</SelectItem>
                    <SelectItem value="IN PROGRESS">In Progress</SelectItem>
                    <SelectItem value="PENDING">Pending</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('')
                    setCategoryFilter('all')
                    setEngineerFilter('all')
                    setStatusFilter('all')
                  }}
                >
                  Clear
                </Button>
              </div>

              <div className="flex items-center justify-between text-sm text-gray-500">
                <span>
                  Showing {paginatedTasks.length} of {filteredTasks.length} tasks
                  {filteredTasks.length !== tasks.length && ` (filtered from ${tasks.length})`}
                </span>
                {isRevalidating && (
                  <span className="text-xs text-blue-600 flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Refreshing...
                  </span>
                )}
              </div>

              {/* Table with all 12 required columns */}
              <div className="bg-white rounded-lg border overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      {DATA_COLUMNS.map(col => (
                        <th
                          key={col.key}
                          className="px-3 py-2 text-left text-xs font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none whitespace-nowrap"
                          onClick={() => handleSort(col.key)}
                        >
                          <span className="flex items-center gap-1">
                            {col.label}
                            {sortField === col.key && (
                              <ArrowUpDown className="h-3 w-3 text-blue-600" />
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paginatedTasks.map((task, idx) => (
                      <tr key={`${task.barcode || 'row'}-${idx}`} className="hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 font-mono text-xs text-gray-700 whitespace-nowrap">
                          {task.user_id || '—'}
                        </td>
                        <td className="px-3 py-2 font-medium text-gray-900 whitespace-nowrap">
                          {task.name || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-700">
                          {task.part_no || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">
                          {task.serial_number || '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                          {task.assigned_date || '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">
                          {task.completed_date || '—'}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <Badge
                            variant={task.elapsed_days === 0 ? 'default' : task.elapsed_days <= 1 ? 'secondary' : 'destructive'}
                            className="text-xs"
                          >
                            {task.elapsed_days}d
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            variant={(task.status || '').toUpperCase() === 'COMPLETE' ? 'default' : 'secondary'}
                            className={`text-xs ${(task.status || '').toUpperCase() === 'COMPLETE' ? 'bg-green-100 text-green-800 hover:bg-green-200' : ''}`}
                          >
                            {task.status || '—'}
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 max-w-[180px] truncate" title={task.location}>
                          {task.location || '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-700 whitespace-nowrap" title={task.barcode}>
                          {task.barcode || '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px] truncate" title={task.task_detail}>
                          {task.task_detail || '—'}
                        </td>
                        <td className="px-3 py-2 text-xs text-gray-600 max-w-[200px] truncate" title={task.part_description}>
                          {task.part_description || '—'}
                        </td>
                      </tr>
                    ))}
                    {paginatedTasks.length === 0 && (
                      <tr>
                        <td colSpan={DATA_COLUMNS.length} className="px-3 py-8 text-center text-gray-500">
                          No tasks found matching your filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    Page {currentPage} of {totalPages}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let page: number
                      if (totalPages <= 5) {
                        page = i + 1
                      } else if (currentPage <= 3) {
                        page = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        page = totalPages - 4 + i
                      } else {
                        page = currentPage - 2 + i
                      }
                      return (
                        <Button
                          key={page}
                          variant={currentPage === page ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                          className="w-8 h-8 p-0"
                        >
                          {page}
                        </Button>
                      )
                    })}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </MainLayout>
  )
}