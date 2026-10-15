// API configuration
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api'

// Import CSRF token utilities
import { getCsrfToken, clearCsrfToken } from './csrf'
// SECURITY: all auth tokens/user/permissions are kept in memory only.
// See /lib/secure-auth-store.ts for the remediation details.
import { secureAuthStore } from './secure-auth-store'

// Task Status enum
export enum TaskStatus {
  Pending = 0,
  InProgress = 1,
  Completed = 2,
  Blocked = 3,
  OnHold = 4,
  Rejected = 5,
  Cancelled = 6,
  Paused = 7,
  PendingTLApproval = 8,
}

// Helper function to convert status string to enum number
export function statusStringToEnum(status: string | number | TaskStatus): TaskStatus {
  if (typeof status === 'number') {
    return status as TaskStatus
  }
  const normalized = String(status).toLowerCase().replace(/[\s\-_]+/g, '')
  switch (normalized) {
    case 'pending': return TaskStatus.Pending
    case 'inprogress': return TaskStatus.InProgress
    case 'completed':
    case 'done': return TaskStatus.Completed
    case 'blocked': return TaskStatus.Blocked
    case 'onhold': return TaskStatus.OnHold
    case 'rejected': return TaskStatus.Rejected
    case 'cancelled':
    case 'canceled': return TaskStatus.Cancelled
    case 'paused': return TaskStatus.Paused
    case 'pendingtlapproval':
    case 'pendingtl':
    case 'pendingapproval': return TaskStatus.PendingTLApproval
    default: return TaskStatus.Pending
  }
}

// Helper function to convert enum number to status string
export function statusEnumToString(status: number | TaskStatus): string {
  switch (status) {
    case TaskStatus.Pending:
    case 0: return 'Pending'
    case TaskStatus.InProgress:
    case 1: return 'In Progress'
    case TaskStatus.Completed:
    case 2: return 'Completed'
    case TaskStatus.Blocked:
    case 3: return 'Blocked'
    case TaskStatus.OnHold:
    case 4: return 'On Hold'
    case TaskStatus.Rejected:
    case 5: return 'Rejected'
    case TaskStatus.Cancelled:
    case 6: return 'Cancelled'
    case TaskStatus.Paused:
    case 7: return 'Paused'
    case TaskStatus.PendingTLApproval:
    case 8: return 'Pending TL Approval'
    default: return 'Pending'
  }
}

// Task interface
export interface Task {
  taskId: number
  serialNumber?: string
  partNumber?: string
  poNumber?: string
  description: string
  categoryId: number
  subTypeId?: number
  requestTypeId?: number
  status?: TaskStatus
  comments?: string
  assignedEngineer?: string
  priorityId: number
  estimatedCompletionDate: string
  targetCompletionDate?: string
  attachmentPath?: string
  shopId?: number
  createdBy: number
}

export interface CreateTaskRequest {
  serialNumber?: string
  partNumber?: string
  poNumber?: string
  description: string
  categoryId: number
  subTypeId?: number
  requestTypeId?: number
  status?: TaskStatus
  comments?: string
  assignedEngineer?: string
  priorityId: number
  estimatedCompletionDate: string
  targetCompletionDate?: string
  attachmentPath?: string
  shopId?: number
  createdBy: number
}

export interface UpdateTaskRequest {
  serialNumber?: string
  partNumber?: string
  poNumber?: string
  description: string
  categoryId?: number
  subTypeId?: number
  requestTypeId?: number
  status: TaskStatus
  comments?: TaskStatus
  assignedEngineer?: string
  priorityId?: number
  estimatedCompletionDate?: string
  targetCompletionDate?: string
  actualCompletionDate?: string
  attachmentPath?: string
  shopId?: number
}

export interface TasksResponse {
  tasks: Task[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  userRole: string
  success: boolean
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  token: string
  refreshToken: string
  user: {
    id: number
    username: string
    email: string
    fullName: string
    role: string
  }
  expiresAt: string
}

// Profile and Settings interfaces
export interface UserProfile {
  userId: number
  username: string
  email: string
  fullName: string
  role: string
  status: string
  profilePicturePath?: string
  shopId?: number
  shopName?: string
  supervisorId?: number
  supervisorName?: string
  createdAt: string
  updatedAt: string
}

export interface UpdateProfileRequest {
  fullName?: string
  email?: string
  profilePicturePath?: string
}

export interface UserSettings {
  userId: number
  username: string
  email: string
  fullName: string
  role: string
  status: string
  shopId?: number
  shopName?: string
  supervisorId?: number
  supervisorName?: string
  emailNotifications: boolean
  taskReminders: boolean
  weeklyReports: boolean
  darkMode: boolean
  language: string
  timeZone: string
  canChangeRole: boolean
  canChangeShop: boolean
  canChangeSupervisor: boolean
}

export interface UpdateSettingsRequest {
  fullName?: string
  email?: string
  role?: string
  shopId?: number
  supervisorId?: number
  emailNotifications?: boolean
  taskReminders?: boolean
  weeklyReports?: boolean
  darkMode?: boolean
  language?: string
  timeZone?: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

// Shop interfaces
export interface Shop {
  id: number
  shop_id?: number
  shopId?: number
  name: string
  location?: string
  description?: string
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

export interface CreateShopRequest {
  name: string
  location?: string
  description?: string
  isActive?: boolean
}

export interface UpdateShopRequest {
  name?: string
  location?: string
  description?: string
  isActive?: boolean
}

// Task Update History interfaces
export interface TaskUpdateHistory {
  updateHistoryId: number
  taskId: number
  updatedByUserId: number
  updatedByUserName: string
  updatedByUserRole?: string
  updateType: string
  fieldName?: string
  oldValue?: string
  newValue?: string
  updateComment?: string
  ipAddress?: string
  updatedAt: string
  createdAt: string
}

// Hold Request interfaces
export interface HoldRequest {
  holdRequestId: number
  taskId: number
  taskDescription?: string
  serialNumber?: string
  requestedByEngineerId: number
  requestedByEngineerName: string
  holdReason: string
  daysWorkedByEngineer: number
  assignedDate?: string
  holdRequestedDate: string
  status: string
  reviewedByTlId?: number
  reviewedByTlName?: string
  reviewDate?: string
  reviewComments?: string
  daysTransferredToTl?: number
  actionTaken?: string
  createdAt: string
  updatedAt: string
}

export interface CreateHoldRequestRequest {
  holdReason: string
}

export interface ReviewHoldRequestRequest {
  decision: 'approve' | 'reject'
  action?: 'transfer_to_tl' | 'return_to_initiator' | 'maintain_status'
  reviewComments?: string
}

// Pause/Resume interfaces
export interface PauseTaskRequest {
  pauseReason: string
}

export interface ResumeTaskRequest {
  resumeComment?: string
}

export interface PauseResumeEvent {
  eventId: number
  eventType: 'Paused' | 'Resumed'
  eventDate: string
  reason?: string
  userId: number
  userName: string
  durationMinutes?: number
  durationFormatted?: string
}

export interface TaskPauseHistory {
  taskId: number
  taskDescription: string
  isPaused: boolean
  pausedAt?: string
  pausedReason?: string
  pausedByUserId?: number
  pausedByUserName?: string
  lastResumedAt?: string
  totalPausedDurationMinutes: number
  totalPausedDurationFormatted: string
  statusBeforePause?: string
  statusChangedAt?: string
  events: PauseResumeEvent[]
}

// Soft-deleted item interfaces (Admin only)
export interface SoftDeletedUser {
  userId: number
  username: string
  email: string
  fullName: string
  role: string
  roleDisplayName?: string
  shopId?: number
  shopName?: string
  isActive: boolean
  createdAt: string
  updatedAt?: string
  deletedAt?: string
  [k: string]: any
}

export interface SoftDeletedTask {
  taskId: number
  serialNumber?: string
  partNumber?: string
  poNumber?: string
  description?: string
  categoryId?: number
  categoryName?: string
  status?: string
  assignedEngineer?: string
  priorityId?: number
  priorityName?: string
  estimatedCompletionDate?: string
  targetCompletionDate?: string
  actualCompletionDate?: string
  shopId?: number
  shopName?: string
  createdBy?: number
  createdByName?: string
  createdAt?: string
  updatedAt?: string
  recordStatus?: string
  commentsCount?: number
  attachmentsCount?: number
  [k: string]: any
}

type MaybeJson = any

// List of expected validation error messages that should NOT be logged to console
const EXPECTED_VALIDATION_ERRORS = [
  'username already exists',
  'email already exists',
  'user already exists',
  'duplicate entry',
  'already in use',
  'already taken',
  'invalid request',
  'validation failed',
  'missing required fields',
  'shop assignment is required',
  'manager assignment is required',
  'personnel type is required',
  'file type not allowed',
  'allowed types:',
  'invalid file type',
  'file extension not supported',
]

export function isExpectedValidationError(message: string): boolean {
  if (!message) return false
  const lowerMessage = message.toLowerCase()
  return EXPECTED_VALIDATION_ERRORS.some(err => lowerMessage.includes(err))
}

/**
 * Read a cookie value by name. Returns null if not found or running server-side.
 * NOTE: HttpOnly cookies are NOT readable from JS — this helper only reads
 * the legacy non-HttpOnly "authToken" cookie (if any) as a last-resort
 * fallback. The primary auth path is the HttpOnly cookie sent automatically
 * by the browser via `credentials: 'include'`.
 */
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  try {
    const match = document.cookie
      .split('; ')
      .find(row => row.startsWith(`${name}=`))
    if (!match) return null
    const value = match.substring(name.length + 1)
    return value ? decodeURIComponent(value) : null
  } catch {
    return null
  }
}

/**
 * Get user-friendly error message based on error type
 */
function getUserFriendlyMessage(error: any, status?: number | string): string {
  const errorMessage = error?.message || error?.originalMessage || ''
  const errorBody = error?.body

  let bodyMessage = ''
  if (errorBody) {
    if (typeof errorBody === 'string') {
      bodyMessage = errorBody
    } else if (errorBody.message) {
      bodyMessage = errorBody.message
    } else if (errorBody.error) {
      bodyMessage = errorBody.error
    } else if (errorBody.detail) {
      bodyMessage = errorBody.detail
    }
  }

  if (bodyMessage && isExpectedValidationError(bodyMessage)) {
    return bodyMessage
  }

  if (status === 400) {
    return bodyMessage || errorMessage || 'Invalid request. Please check your input and try again.'
  }
  if (status === 401) {
    return 'Invalid username or password. Please try again.'
  }
  if (status === 403) {
    if (errorMessage.toLowerCase().includes('csrf') || bodyMessage.toLowerCase().includes('csrf')) {
      return 'Session expired. Please refresh the page and try again.'
    }
    return 'You do not have permission to perform this action.'
  }
  if (status === 404) {
    return 'The requested resource was not found.'
  }
  if (status === 500) {
    return 'Server error. Please try again later.'
  }

  if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('fetch failed') || errorMessage.includes('NetworkError')) {
    return 'Unable to connect to the server. Please check your connection and try again.'
  }

  if (bodyMessage && !bodyMessage.includes('Error') && !bodyMessage.includes('Exception')) {
    return bodyMessage
  }

  return 'Something went wrong. Please try again.'
}

async function parseResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  if (!res.ok) {
    const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null)
    const message = (body && (body.message || body.error)) || res.statusText || `HTTP ${res.status}`
    const err: any = new Error(message)
    err.status = res.status
    err.body = body
    throw err
  }
  if (res.status === 204 || res.status === 205) return undefined as unknown as T
  return isJson ? (await res.json()) as T : (await res.text()) as unknown as T
}

class ApiClient {
  private baseUrl: string

  constructor() {
    this.baseUrl = API_BASE_URL
    // SECURITY: do NOT read the access token from localStorage. Tokens are
    // delivered exclusively via HttpOnly cookie (set by the backend) plus
    // an in-memory copy held in `secureAuthStore` for the duration of the tab.
  }

  /**
   * In-memory token getter.
   *
   * FIX for "Authorization: Bearer null" 401 issue:
   * ------------------------------------------------
   * Previously this returned `secureAuthStore.getToken()` unconditionally.
   * On a full page reload, the in-memory store is empty even though the
   * HttpOnly `authToken` cookie is still valid. The withAuth() helper would
   * then serialize `Bearer null` and the backend would reject the request
   * with 401.
   *
   * Now we:
   *   1. Prefer the in-memory token (set during login / refresh).
   *   2. Fall back to the legacy non-HttpOnly `authToken` cookie if present
   *      (so that the app re-hydrates after a reload until /auth/me runs).
   *   3. Return null if nothing is available — in that case withAuth() will
   *      NOT attach an Authorization header, and the browser will rely on
   *      the HttpOnly cookie (sent automatically with credentials: 'include').
   */
  private get token(): string | null {
    const mem = secureAuthStore.getToken()
    if (mem) return mem
    // NOTE: the primary auth token is delivered as an HttpOnly cookie and is
    // NOT readable from JS. The following only catches any legacy non-HttpOnly
    // cookie that may still exist for older deployments. On modern deployments
    // this returns null and the request falls back to credentials: 'include',
    // which is what we want.
    const cookieTok = readCookie('authToken') || readCookie('auth_token')
    if (cookieTok && cookieTok !== 'null' && cookieTok !== 'undefined' && cookieTok !== 'cookie-session') {
      // Re-hydrate the in-memory store so subsequent calls are fast.
      try { secureAuthStore.setToken(cookieTok) } catch { /* ignore */ }
      return cookieTok
    }
    return null
  }

  setToken(token: string) {
    secureAuthStore.setToken(token)
  }

  clearToken() {
    secureAuthStore.setToken(null)
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('authToken')
        localStorage.removeItem('token')
        localStorage.removeItem('accessToken')
      } catch { /* ignore */ }
      try {
        // Clear legacy non-HttpOnly cookie. The HttpOnly cookie must be
        // cleared server-side via POST /api/auth/logout.
        document.cookie = 'auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
        document.cookie = 'authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT'
      } catch { /* ignore */ }
    }
    clearCsrfToken()
  }

  /**
   * Attach Authorization header ONLY when we have a real token.
   *
   * FIX: Never emit `Authorization: Bearer null` or `Bearer undefined`.
   * When the token is missing, we rely entirely on the HttpOnly `authToken`
   * cookie which the browser attaches automatically because every request
   * uses `credentials: 'include'`.
   */
  private withAuth(headers: Record<string, string> = {}) {
    const t = this.token
    if (
      typeof t === 'string' &&
      t.length > 0 &&
      t !== 'null' &&
      t !== 'undefined' &&
      t !== 'cookie-session' // sentinel used by auth-context on cookie-only sessions
    ) {
      return { ...headers, Authorization: `Bearer ${t}` }
    }
    // Do not set Authorization at all — cookie auth will take over.
    return headers
  }

  private async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const isClientSide = typeof window !== 'undefined'
    const url = isClientSide && !endpoint.startsWith('http') && !endpoint.startsWith('/api')
      ? `/api${endpoint}`
      : endpoint.startsWith('http')
        ? endpoint
        : `${this.baseUrl}${endpoint}`

    const incomingHeaders = options.headers || {}
    const headersRecord: Record<string, string> = {}

    if (incomingHeaders instanceof Headers) {
      incomingHeaders.forEach((v, k) => { headersRecord[k] = v })
    } else if (Array.isArray(incomingHeaders)) {
      incomingHeaders.forEach(([k, v]: any) => { headersRecord[k] = v })
    } else {
      Object.assign(headersRecord, incomingHeaders as Record<string, string>)
    }

    if (options.body !== undefined && !(options.body instanceof FormData)) {
      if (!headersRecord['Content-Type'] && !headersRecord['content-type']) {
        headersRecord['Content-Type'] = 'application/json'
      }
    }

    const method = (options.method || 'GET').toUpperCase()
    const needsCsrf = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)

    if (needsCsrf && isClientSide) {
      try {
        const csrfToken = await getCsrfToken()
        if (csrfToken) {
          headersRecord['X-CSRF-Token'] = csrfToken
          headersRecord['X-Requested-With'] = 'XMLHttpRequest'
        }
      } catch {
        // Silently handle CSRF token fetch errors
      }
    }

    const finalHeaders = this.withAuth(headersRecord as Record<string, string>)

    // FINAL SAFETY NET: strip any Authorization header whose value is the
    // string "Bearer null" / "Bearer undefined" / "Bearer " (empty token),
    // which is exactly the bug visible in the browser network tab.
    const authVal = (finalHeaders as any).Authorization || (finalHeaders as any).authorization
    if (authVal && /^Bearer\s+(null|undefined|)\s*$/i.test(String(authVal))) {
      delete (finalHeaders as any).Authorization
      delete (finalHeaders as any).authorization
    }

    const config: RequestInit = {
      ...options,
      headers: finalHeaders,
      credentials: 'include',
    }

    try {
      const response = await fetch(url, config)
      return await parseResponse<T>(response)
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw error
      }

      const status = error.status || 'unknown'
      const userFriendlyMessage = getUserFriendlyMessage(error, status)

      if (status === 403 && userFriendlyMessage.toLowerCase().includes('session expired')) {
        clearCsrfToken()
      }

      const cleanError: any = new Error(userFriendlyMessage)
      cleanError.status = status
      if (error.body) {
        cleanError.body = error.body
      }

      if (isExpectedValidationError(userFriendlyMessage)) {
        cleanError.isExpectedValidationError = true
      }

      const suppressRedirectHeader = (finalHeaders as any)?.['X-Suppress-Auth-Relogin'] || (finalHeaders as any)?.['X-Suppress-Auth-Redirect'] || (finalHeaders as any)?.['x-suppress-auth-redirect']

      // FIX (401 interceptor): before wiping auth state on a 401, try a
      // silent token refresh via /api/auth/refresh exactly once per request.
      // This protects against short-lived access tokens expiring in the
      // background while the HttpOnly refresh cookie is still valid.
      const alreadyRetried = (options as any).__authRetried === true
      const isRefreshEndpoint = typeof endpoint === 'string' && endpoint.includes('/auth/refresh')
      const isLoginEndpoint = typeof endpoint === 'string' && endpoint.includes('/auth/login')

      if (status === 401 && !alreadyRetried && !isRefreshEndpoint && !isLoginEndpoint) {
        const refreshed = await this.tryRefreshToken()
        if (refreshed) {
          return this.request<T>(endpoint, { ...options, __authRetried: true } as any)
        }
      }

      if (status === 401 && !suppressRedirectHeader) {
        this.clearToken()
        secureAuthStore.setUser(null)
        secureAuthStore.setDirectorPermissions(null)
      }

      throw cleanError
    }
  }

  /**
   * Attempt to refresh the session by calling the Next.js proxy
   * /api/auth/refresh. The browser automatically attaches the HttpOnly
   * refresh cookie via credentials: 'include'. If the backend returns a
   * new bearer token, we cache it in memory. On failure we return false
   * so the caller can fall back to clearing auth state.
   *
   * This helper is intentionally isolated from request() to avoid
   * infinite recursion.
   */
  private async tryRefreshToken(): Promise<boolean> {
    try {
      const isClientSide = typeof window !== 'undefined'
      if (!isClientSide) return false
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
      if (!res.ok) return false
      const data = await res.json().catch(() => null)
      const newTok = data?.token || data?.accessToken || data?.data?.token
      if (newTok && typeof newTok === 'string') {
        this.setToken(newTok)
      }
      return true
    } catch {
      return false
    }
  }

  // --- Auth helpers ---
  async login(credentialsOrUsername: LoginRequest | string, password?: string): Promise<LoginResponse> {
    const payload: LoginRequest =
      typeof credentialsOrUsername === 'string'
        ? { username: credentialsOrUsername, password: password || '' }
        : credentialsOrUsername

    try {
      const response = await this.request<any>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'X-Suppress-Auth-Redirect': 'true'
        }
      })

      if (response && response.success === false) {
        throw new Error(response.message || 'Login failed')
      }

      // FIX: Set the in-memory token IMMEDIATELY after a successful login so
      // that the very next API call (e.g. /notifications, /auth/me) sends a
      // proper `Authorization: Bearer <jwt>` instead of `Bearer null`.
      const tokenFromResponse =
        response?.token ||
        response?.accessToken ||
        response?.data?.token ||
        response?.data?.accessToken
      if (tokenFromResponse && typeof tokenFromResponse === 'string') {
        this.setToken(tokenFromResponse)
      }
      return response
    } catch (error: any) {
      const cleanError: any = new Error(error.message || 'Invalid username or password. Please try again.')
      cleanError.status = error.status
      throw cleanError
    }
  }

  async logout(): Promise<void> {
    try {
      await this.request('/auth/logout', {
        method: 'POST',
      })
    } catch {
      // Silently handle logout errors
    } finally {
      this.clearToken()
    }
  }

  async getCurrentUser(): Promise<MaybeJson> {
    return this.request('/auth/me')
  }

  async getUser(id?: number): Promise<MaybeJson> {
    if (!id || id === 0) {
      return this.getCurrentUser()
    }
    return this.request(`/users/${id}`)
  }

  // --- Profile Management ---
  async getMyProfile(): Promise<UserProfile> {
    return this.request<UserProfile>('/profile/me')
  }

  async getUserProfile(userId: number): Promise<UserProfile> {
    return this.request<UserProfile>(`/profile/${userId}`)
  }

  async updateMyProfile(profile: UpdateProfileRequest): Promise<UserProfile> {
    return this.request<UserProfile>('/profile/me', {
      method: 'PUT',
      body: JSON.stringify(profile),
    })
  }

  async uploadProfilePicture(file: File): Promise<{ profilePicturePath: string }> {
    const formData = new FormData()
    formData.append('file', file)

    const url = '/profile/me/profile-picture'
    const finalUrl = url.startsWith('http') ? url : `/api${url}`

    const headers = this.withAuth({})
    delete (headers as any)['Content-Type']

    try {
      const csrfToken = await getCsrfToken()
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken
        headers['X-Requested-With'] = 'XMLHttpRequest'
      }
    } catch {
      // Silently handle
    }

    // Strip "Bearer null" / "Bearer undefined" / empty Bearer just in case.
    const authVal = (headers as any).Authorization || (headers as any).authorization
    if (authVal && /^Bearer\s+(null|undefined|)\s*$/i.test(String(authVal))) {
      delete (headers as any).Authorization
      delete (headers as any).authorization
    }

    const response = await fetch(finalUrl, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    })

    try {
      return await parseResponse(response)
    } catch (err: any) {
      const userFriendlyMessage = getUserFriendlyMessage(err, err?.status)
      const cleanError: any = new Error(userFriendlyMessage)
      cleanError.status = err?.status
      if (isExpectedValidationError(userFriendlyMessage)) {
        cleanError.isExpectedValidationError = true
      }
      throw cleanError
    }
  }

  // --- Settings Management ---
  async getMySettings(): Promise<UserSettings> {
    return this.request<UserSettings>('/settings/me')
  }

  async getUserSettings(userId: number): Promise<UserSettings> {
    return this.request<UserSettings>(`/settings/${userId}`)
  }

  async updateMySettings(settings: UpdateSettingsRequest): Promise<UserSettings> {
    return this.request<UserSettings>('/settings/me', {
      method: 'PUT',
      body: JSON.stringify(settings),
    })
  }

  async changePassword(passwordData: ChangePasswordRequest): Promise<{ message: string }> {
    return this.request<{ message: string }>('/settings/me/change-password', {
      method: 'POST',
      body: JSON.stringify(passwordData),
    })
  }

  async getMyAuditLog(page = 1, pageSize = 50): Promise<any[]> {
    return this.request<any[]>(`/settings/me/audit-log?page=${page}&pageSize=${pageSize}`)
  }

  async getUserAuditLog(userId: number, page = 1, pageSize = 50): Promise<any[]> {
    return this.request<any[]>(`/settings/${userId}/audit-log?page=${page}&pageSize=${pageSize}`)
  }

  // --- Generic REST helpers ---
  async get<T = any>(path: string, signal?: AbortSignal) {
    try {
      return await this.request<T>(path, { method: 'GET', signal })
    } catch (err: any) {
      if (err.name === 'AbortError') {
        return null as unknown as T
      }
      if (err && (err.status === 404 || err.name === 'NetworkError' || err.name === 'TypeError')) {
        return null as unknown as T
      }
      throw err
    }
  }

  async post<T = any>(path: string, body?: any) {
    return this.request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  async put<T = any>(path: string, body?: any) {
    return this.request<T>(path, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  async patch<T = any>(path: string, body?: any) {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  async delete<T = any>(path: string) {
    return this.request<T>(path, { method: 'DELETE' })
  }

  // --- Task helpers ---
  async getTasks(params: {
    categoryId?: number
    status?: string
    searchQuery?: string
    priorityId?: number
    fromDate?: string
    toDate?: string
    pageNumber?: number
    pageSize?: number
  } = {}) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value.toString())
      }
    })
    const endpoint = `/tasks${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
    return this.get(endpoint)
  }

  async getCompletedTasks(params: Record<string, any> = {}) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value.toString())
      }
    })
    const endpoint = `/tasks/completed${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
    return this.get(endpoint)
  }

  async getTask(id: number) {
    try {
      return await this.request(`/tasks/${id}`, { method: 'GET' })
    } catch (err: any) {
      if (err && err.status === 404) {
        const error: any = new Error(`Task not found`)
        error.status = 404
        throw error
      }
      throw err
    }
  }

  async createTask(task: CreateTaskRequest) {
    const payload = {
      ...task,
      status: task.status !== undefined ? statusStringToEnum(task.status) : TaskStatus.Pending
    }
    return this.post('/tasks', payload)
  }

  async updateTask(id: number, task: UpdateTaskRequest) {
    const payload = {
      ...task,
      status: statusStringToEnum(task.status)
    }
    const sentStatusEnum = statusStringToEnum(task.status)
    const result = await this.put(`/tasks/${id}`, payload)

    try {
      const freshTask = await this.getTask(id)
      if (freshTask) {
        const base = (result != null && typeof result === 'object' && !Array.isArray(result)) ? result : {}
        return {
          ...base,
          ...freshTask,
          _sentStatus: sentStatusEnum,
          _originalResponse: result ?? null,
          _refetched: true,
        }
      }
    } catch {
      // If re-fetch fails, fall through to return original result
    }

    if (result != null && typeof result === 'object') {
      return { ...result, _sentStatus: sentStatusEnum }
    }
    return result
  }

  async updateTaskStatus(id: number, status: TaskStatus | string | number) {
    const statusEnum = statusStringToEnum(status)
    return this.patch(`/tasks/${id}/status`, { status: statusEnum })
  }

  async approveTaskCompletion(id: number, comment?: string, tlApprovedAt?: string) {
    return this.post(`/tasks/${id}/approve-completion`, {
      comment: comment || null,
      tlApprovedAt: tlApprovedAt || new Date().toISOString(),
    })
  }

  async rejectTaskCompletion(id: number, comment: string) {
    return this.post(`/tasks/${id}/reject-completion`, { comment })
  }

  async deleteTask(id: number) {
    return this.delete(`/tasks/${id}`)
  }

  async getTasksByUser(userId: number) {
    return this.get(`/tasks/user/${userId}`)
  }

  async getTasksByShop(shopId: number) {
    return this.get(`/tasks/shop/${shopId}`)
  }

  async checkTaskDuplicates(taskData: any) {
    return this.post('/tasks/check-duplicates', taskData)
  }

  async getTaskComments(taskId: number) {
    try {
      return await this.get(`/tasks/${taskId}/comments`)
    } catch (err: any) {
      if (err && err.status === 404) {
        try {
          return await this.get(`/tasks/completed/${taskId}/comments`)
        } catch {
          throw err
        }
      }
      throw err
    }
  }

  async getTaskUpdateHistory(taskId: number): Promise<TaskUpdateHistory[]> {
    try {
      const response = await this.get<TaskUpdateHistory[]>(`/tasks/${taskId}/update-history`)
      return Array.isArray(response) ? response : []
    } catch {
      return []
    }
  }

  async getRequestTypes() {
    return this.get('/reference-data/request-types')
  }

  // --- Pause/Resume helpers ---
  async pauseTask(taskId: number, request: PauseTaskRequest): Promise<{ success: boolean; message: string; pauseHistory: TaskPauseHistory }> {
    return this.post(`/tasks/${taskId}/pause`, request)
  }

  async resumeTask(taskId: number, request: ResumeTaskRequest = {}): Promise<{ success: boolean; message: string; pauseHistory: TaskPauseHistory }> {
    return this.post(`/tasks/${taskId}/resume`, request)
  }

  async getTaskPauseHistory(taskId: number): Promise<{ success: boolean; pauseHistory: TaskPauseHistory }> {
    try {
      const response = await this.get<any>(`/tasks/${taskId}/pause-history`)
      return response
    } catch {
      return { success: false, pauseHistory: { taskId, taskDescription: '', isPaused: false, totalPausedDurationMinutes: 0, totalPausedDurationFormatted: '0m', events: [] } }
    }
  }

  // --- Hold Request helpers ---
  async createHoldRequest(taskId: number, request: CreateHoldRequestRequest): Promise<HoldRequest> {
    return this.post(`/task-holds/tasks/${taskId}/request-hold`, request)
  }

  async reviewHoldRequest(holdRequestId: number, review: ReviewHoldRequestRequest): Promise<HoldRequest> {
    return this.post(`/task-holds/${holdRequestId}/review`, review)
  }

  async getPendingHoldRequests(): Promise<HoldRequest[]> {
    try {
      const response = await this.get<any>('/task-holds/pending')
      if (!response) return []
      if (Array.isArray(response)) return response
      if (Array.isArray(response.holdRequests)) return response.holdRequests
      if (Array.isArray(response.data)) return response.data
      return []
    } catch (err: any) {
      if (err && err.status === 403) {
        return []
      }
      throw err
    }
  }

  async getTaskHoldRequests(taskId: number): Promise<HoldRequest[]> {
    try {
      const response = await this.get<any>(`/task-holds/tasks/${taskId}`)
      if (!response) return []
      if (Array.isArray(response)) return response
      if (Array.isArray(response.holdRequests)) return response.holdRequests
      if (Array.isArray(response.data)) return response.data
      return []
    } catch {
      return []
    }
  }

  async getMyDateCounts(taskId?: number): Promise<any[]> {
    try {
      const endpoint = taskId ? `/task-holds/date-counts?taskId=${taskId}` : '/task-holds/date-counts'
      const response = await this.get<any>(endpoint)
      if (!response) return []
      if (Array.isArray(response)) return response
      if (Array.isArray(response.dateCounts)) return response.dateCounts
      if (Array.isArray(response.data)) return response.data
      return []
    } catch {
      return []
    }
  }

  async getUserDateCounts(userId: number, taskId?: number): Promise<any[]> {
    try {
      const endpoint = taskId
        ? `/task-holds/users/${userId}/date-counts?taskId=${taskId}`
        : `/task-holds/users/${userId}/date-counts`
      const response = await this.get<any>(endpoint)
      if (!response) return []
      if (Array.isArray(response)) return response
      if (Array.isArray(response.dateCounts)) return response.dateCounts
      if (Array.isArray(response.data)) return response.data
      return []
    } catch {
      return []
    }
  }

  async calculateDaysWorked(taskId: number, engineerId: number): Promise<number> {
    try {
      const response = await this.get<any>(`/task-holds/tasks/${taskId}/engineers/${engineerId}/days-worked`)
      if (typeof response === 'number') return response
      if (response && typeof response.daysWorked === 'number') return response.daysWorked
      if (response && typeof response.data === 'number') return response.data
      return 0
    } catch {
      return 0
    }
  }

  // --- Attachments helpers ---
  async getAttachments(taskId: number) {
    return this.get(`/tasks/${taskId}/attachments`)
  }

  async uploadAttachment(taskId: number, formData: FormData) {
    const url = `/tasks/${taskId}/attachments`
    const finalUrl = `/api${url}`

    const headers = this.withAuth({})
    delete (headers as any)['Content-Type']

    try {
      const csrfToken = await getCsrfToken()
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken
        headers['X-Requested-With'] = 'XMLHttpRequest'
      }
    } catch {
      // Silently handle
    }

    // Strip "Bearer null" / "Bearer undefined" / empty Bearer just in case.
    const authVal = (headers as any).Authorization || (headers as any).authorization
    if (authVal && /^Bearer\s+(null|undefined|)\s*$/i.test(String(authVal))) {
      delete (headers as any).Authorization
      delete (headers as any).authorization
    }

    const response = await fetch(finalUrl, {
      method: 'POST',
      headers,
      body: formData,
      credentials: 'include',
    })

    try {
      return await parseResponse(response)
    } catch (err: any) {
      const userFriendlyMessage = getUserFriendlyMessage(err, err?.status)
      const cleanError: any = new Error(userFriendlyMessage)
      cleanError.status = err?.status
      if (isExpectedValidationError(userFriendlyMessage)) {
        cleanError.isExpectedValidationError = true
      }
      throw cleanError
    }
  }

  // Reference data endpoints
  async getCategories() {
    return this.get('/reference-data/categories')
  }

  async getPriorities() {
    return this.get('/reference-data/priorities')
  }

  // --- Shop Management ---
  async getShops(): Promise<Shop[]> {
    try {
      const response = await this.get('/shops')
      if (Array.isArray(response)) {
        return response.map((shop: any) => ({
          ...shop,
          shop_id: shop.shop_id || shop.shopId || shop.id,
          id: shop.id || shop.shop_id || shop.shopId
        }))
      } else {
        return []
      }
    } catch (error: any) {
      throw error
    }
  }

  async createShop(shop: CreateShopRequest): Promise<Shop> {
    if (!shop.name || !shop.name.trim()) {
      throw new Error('Shop name is required')
    }

    const payload = {
      name: shop.name.trim(),
      location: shop.location?.trim() || '',
      description: shop.description?.trim() || '',
      isActive: shop.isActive !== undefined ? shop.isActive : true
    }

    return this.post('/shops', payload)
  }

  async updateShop(id: number, shop: UpdateShopRequest): Promise<Shop> {
    if (!shop.name || !shop.name.trim()) {
      throw new Error('Shop name is required')
    }

    const payload = {
      name: shop.name.trim(),
      location: shop.location?.trim() || '',
      description: shop.description?.trim() || '',
      isActive: shop.isActive !== undefined ? shop.isActive : true
    }

    return this.put(`/shops?id=${id}`, payload)
  }

  async deleteShop(id: number): Promise<void> {
    return this.delete(`/shops?id=${id}`)
  }

  async getUsers() {
    return this.get('/users')
  }

  // Notifications
  // FIX: Route via this.request() so Authorization/CSRF are set consistently
  // and "Bearer null" is never emitted. Accept optional query params so the
  // caller can pass `unreadOnly`, `pageNumber`, and `pageSize`.
  async getNotifications(params: { unreadOnly?: boolean; pageNumber?: number; pageSize?: number } = {}) {
    const searchParams = new URLSearchParams()
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value.toString())
      }
    })
    const endpoint = `/notifications${searchParams.toString() ? `?${searchParams.toString()}` : ''}`

    try {
      const data = await this.get<any>(endpoint)
      if (!data) return []
      if (Array.isArray(data)) return data
      if (Array.isArray(data.notifications)) return data.notifications
      if (Array.isArray(data.data)) return data.data
      if (data.data && Array.isArray(data.data.notifications)) return data.data.notifications
      return []
    } catch {
      return []
    }
  }

  async markNotificationRead(id: number) {
    try {
      return await this.post('/notifications', { notificationId: id })
    } catch {
      return { success: false, error: 'Request failed' }
    }
  }

  async markAllNotificationsRead() {
    try {
      return await this.post('/notifications', { markAll: true })
    } catch {
      return { success: false, error: 'Request failed' }
    }
  }

  // Task Transfer helpers
  async getTaskTransfers(taskId: number) {
    return this.get(`/tasks/${taskId}/transfers`)
  }

  async createTaskTransfer(taskId: number, payload: {
    from_shop_id: number
    to_shop_id: number
    transfer_comments?: string
  }) {
    return this.post(`/tasks/${taskId}/transfers`, payload)
  }

  async getTransfers() {
    return this.get('/transfers')
  }

  async createTransfer(payload: any) {
    return this.post('/transfers', payload)
  }

  async acceptTransfer(id: number) {
    return this.patch(`/transfers/${id}/accept`)
  }

  async rejectTransfer(id: number) {
    return this.patch(`/transfers/${id}/reject`)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SOFT-DELETE MANAGEMENT (Admin only)
  // ═══════════════════════════════════════════════════════════════════════

  /** Retrieve all soft-deleted (inactive) users */
  async getSoftDeletedUsers(): Promise<SoftDeletedUser[]> {
    try {
      const response = await this.get<any>('/admin/soft-deleted-users')
      if (!response) return []
      if (Array.isArray(response)) return response
      if (Array.isArray(response.data)) return response.data
      return []
    } catch (err: any) {
      if (err && err.status === 403) return []
      throw err
    }
  }

  /** Permanently hard-delete a soft-deleted user */
  async permanentlyDeleteUser(userId: number): Promise<{ message: string }> {
    return this.delete(`/admin/users/${userId}/permanent`)
  }

  /** Restore a soft-deleted user back to active */
  async restoreUser(userId: number): Promise<{ message: string }> {
    return this.post(`/admin/users/${userId}/restore`)
  }

  /** Retrieve all soft-deleted (inactive) tasks */
  async getSoftDeletedTasks(): Promise<SoftDeletedTask[]> {
    try {
      const response = await this.get<any>('/admin/soft-deleted-tasks')
      if (!response) return []
      if (Array.isArray(response)) return response
      if (Array.isArray(response.data)) return response.data
      return []
    } catch (err: any) {
      if (err && err.status === 403) return []
      throw err
    }
  }

  /** Permanently hard-delete a soft-deleted task and all related records */
  async permanentlyDeleteTask(taskId: number): Promise<{ message: string }> {
    return this.delete(`/admin/tasks/${taskId}/permanent`)
  }

  /** Restore a soft-deleted task back to active */
  async restoreTask(taskId: number): Promise<{ message: string }> {
    return this.post(`/admin/tasks/${taskId}/restore`)
  }
}

// Users API class for employee management
class UsersAPI {
  private apiClient: ApiClient

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient
  }

  async getUsers(params: { isActive?: boolean } = {}) {
    const searchParams = new URLSearchParams()
    if (params.isActive !== undefined) {
      searchParams.append('isActive', params.isActive.toString())
    }

    const endpoint = `/users${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
    return this.apiClient['request'] ? (this.apiClient as any).request(endpoint) : (this.apiClient as any).get(endpoint)
  }
}

export const apiClient = new ApiClient()
export const usersAPI = new UsersAPI(apiClient)

export const notificationsAPI = {
  async getNotifications(params: { unreadOnly?: boolean; pageNumber?: number; pageSize?: number } = {}) {
    const list = await apiClient.getNotifications(params)
    return { data: { data: Array.isArray(list) ? list : [] } }
  },
  async markAsRead(notificationId: number) {
    return apiClient.markNotificationRead(notificationId)
  },
  async markAllAsRead() {
    return apiClient.markAllNotificationsRead()
  }
}

export default apiClient