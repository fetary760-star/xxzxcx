/**
 * =====================================================================================
 * AMENDED v15 - CMT.Frontend/src/lib/workflow/useWorkflow.ts        (NEW FILE)
 * Copy to: CMT.Frontend/src/lib/workflow/useWorkflow.ts
 *
 * WHAT THIS FILE IS
 * -----------------
 * The React layer that binds the three mirrors you already amended together:
 *
 *   workflow-types.ts        (v11) - enums + request / response shapes
 *   workflow-api.ts          (v13) - the ONLY client for the amended endpoints
 *   workflow-permissions.ts  (v14) - server-first capability resolvers
 *   role-hierarchy.ts        (v12) - 16 roles, permissions, scopes
 *
 * WHY IT IS NEEDED
 * ----------------
 * Every amended component needs the SAME four things before it can render a single button:
 *   (1) the ACTOR  - GET /api/workflow/permissions/me, so `actorPermissions()` is the
 *       SERVER's effective list and never a locally re-derived guess;
 *   (2) the CATALOG - GET /api/workflow/catalog, so `canIDraft`, the step chain and the
 *       printed form numbers come from the authoritative routing definition;
 *   (3) the INSTANCE FACTS - `instanceFactsFrom()` over GET /api/workflow/forms/{id};
 *   (4) the ASSIGNEE POOL - real users with a NUMERIC id, filtered by
 *       `assignableCandidates()` / `delegatableCandidates()`.
 * Without a shared hook layer each screen re-implements these four fetches slightly
 * differently, and the client drifts from the server again - which is the exact defect
 * class the v11..v14 amendments were written to end.
 *
 * BINDING RULES
 *   (1) user ids are NUMBERS (C# long); folder / instance / submission ids are STRINGS
 *       (C# Guid). `normalizeCandidate()` below is the single place where a `<Select>`
 *       string is turned into the long the contract demands.
 *   (2) the SERVER IS THE AUTHORITY. These hooks never compute canIAct / canIAssign /
 *       canIDelegate / canISkip / canIDraft themselves; they hand the payload to the
 *       resolvers of workflow-permissions.ts, which prefer the server flag.
 *   (3) no hook throws. Every one exposes `{ data, loading, error, reload }` so a failed
 *       fetch DISABLES a control with a reason instead of blanking the screen.
 * =====================================================================================
 */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  getCompetencyMatrix,
  getFolderProgress,
  getFolderTableOfContents,
  getMyWorkflowPermissions,
  getToolEquivalencyMatrix,
  getWorkflowCatalog,
  getWorkflowForm,
  getWorkflowInbox,
  listExpiries,
  listFolderRevisions,
  listNotifications,
} from '@/lib/workflow/workflow-api'
import { WorkflowApiError } from '@/lib/workflow/workflow-transport'

import {
  workflowErrorMessage,
  type CatalogFormResponse,
  type CompetencyMatrixRowResponse,
  type ExpiryItemResponse,
  type FolderProgressResponse,
  type InboxItemResponse,
  type MyPermissionsResponse,
  type NotificationResponse,
  type RevisionResponse,
  type TableOfContentsResponse,
  type ToolEquivalencyRowResponse,
  type WorkflowInstanceResponse,
} from '@/lib/workflow/workflow-types'

import {
  actorFromMyPermissions,
  actorFromUser,
  catalogStepFacts,
  findCatalogForm,
  instanceFactsFrom,
  assignableCandidates as filterAssignable,
  delegatableCandidates as filterDelegatable,
  type CandidateUser,
  type InstanceFacts,
  type WorkflowActor,
} from '@/lib/workflow/workflow-permissions'

import { normalizeRole, functionalUnitOf, roleLabel } from '@/lib/role-hierarchy'

// =====================================================================================
// 1. GENERIC ASYNC STATE
// =====================================================================================

export interface AsyncState<T> {
  data: T
  loading: boolean
  error: string | null
  errorCode: string | null
  reload: () => Promise<void>
  setData: (next: T) => void
}

function messageOf(error: unknown): { message: string; code: string | null } {
  if (error instanceof WorkflowApiError) {
    return { message: error.message, code: error.errorCode }
  }
  if (error instanceof Error) return { message: error.message, code: null }
  return { message: workflowErrorMessage(null), code: null }
}

/**
 * One fetch primitive for every hook below. `enabled === false` keeps the hook mounted but
 * idle, which is what a component does while the folder id is still undefined.
 */
function useAsync<T>(
  loader: () => Promise<T>,
  fallback: T,
  deps: unknown[],
  enabled = true,
): AsyncState<T> {
  const [data, setData] = useState<T>(fallback)
  const [loading, setLoading] = useState<boolean>(enabled)
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  // Guards against a late answer overwriting a newer one after the deps changed.
  const requestRef = useRef(0)
  const loaderRef = useRef(loader)
  loaderRef.current = loader

  const run = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }
    const ticket = ++requestRef.current
    setLoading(true)
    setError(null)
    setErrorCode(null)
    try {
      const result = await loaderRef.current()
      if (ticket === requestRef.current) setData(result)
    } catch (caught) {
      if (ticket === requestRef.current) {
        const { message, code } = messageOf(caught)
        setError(message)
        setErrorCode(code)
        setData(fallback)
      }
    } finally {
      if (ticket === requestRef.current) setLoading(false)
    }
    // `fallback` is intentionally excluded: it is a literal in every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  useEffect(() => {
    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ...deps])

  return { data, loading, error, errorCode, reload: run, setData }
}

// =====================================================================================
// 2. THE ACTOR  (requirement #1)
// =====================================================================================

/** The minimal auth-store shape used as the OFFLINE fallback only. */
export interface FallbackUser {
  userId?: number | string | null
  id?: number | string | null
  role?: string | null
  shopId?: string | null
  departmentId?: string | null
  additionalPermissions?: string | null
  revokedPermissions?: string | null
}

export interface WorkflowActorState {
  actor: WorkflowActor | null
  permissions: MyPermissionsResponse | null
  /** True while the actor is still unknown - render skeletons, never enabled buttons. */
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /** Effective permission check, Admin short-circuit included. */
  has: (permission: string) => boolean
  /** Server list of form types the caller may draft (authoritative over the catalog). */
  draftableFormTypes: string[]
  roleLabelText: string
}

/**
 * Loads GET /api/workflow/permissions/me ONCE per screen.
 *
 * The `fallbackUser` argument is used ONLY when that call fails (offline, 502): the actor is
 * then rebuilt from the JWT claims already in the auth store, and the LOCAL
 * DEFAULT_PERMISSIONS matrix of role-hierarchy.ts fills in for the server list. That keeps
 * the UI explainable while degraded, and every action is still re-validated server side.
 */
export function useWorkflowActor(fallbackUser?: FallbackUser | null): WorkflowActorState {
  const state = useAsync<MyPermissionsResponse | null>(
    () => getMyWorkflowPermissions(),
    null,
    [],
    true,
  )

  const actor = useMemo<WorkflowActor | null>(() => {
    if (state.data) return actorFromMyPermissions(state.data)
    if (fallbackUser) return actorFromUser(fallbackUser)
    return null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data, fallbackUser?.userId, fallbackUser?.id, fallbackUser?.role, fallbackUser?.shopId])

  const has = useCallback(
    (permission: string) => {
      if (!actor) return false
      if (normalizeRole(actor.role) === 'Admin') return true
      if (Array.isArray(actor.permissions) && actor.permissions.length > 0) {
        return actor.permissions.includes(permission)
      }
      // Falls back to the local DEFAULT_PERMISSIONS matrix through actorPermissions().
      return false
    },
    [actor],
  )

  return {
    actor,
    permissions: state.data,
    loading: state.loading,
    error: state.error,
    reload: state.reload,
    has,
    draftableFormTypes: state.data?.draftableFormTypes ?? [],
    roleLabelText: roleLabel(actor?.role),
  }
}

// =====================================================================================
// 3. THE CATALOG  (the authoritative routing definition of every form)
// =====================================================================================

export interface WorkflowCatalogState {
  catalog: CatalogFormResponse[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /** The catalog row of one form type, or null when the server does not know it. */
  formOf: (formType?: string | null) => CatalogFormResponse | null
  /** The normalised step chain of one form type - used to preview a routing path. */
  stepsOf: (formType?: string | null) => ReturnType<typeof catalogStepFacts>
  /** Printed form number ("MNT-1420A"), server value preferred over the local fallback. */
  formNoOf: (formType?: string | null) => string
}

export function useWorkflowCatalog(): WorkflowCatalogState {
  const state = useAsync<CatalogFormResponse[]>(() => getWorkflowCatalog(), [], [], true)

  const formOf = useCallback(
    (formType?: string | null) => findCatalogForm(state.data, formType),
    [state.data],
  )

  const stepsOf = useCallback(
    (formType?: string | null) => catalogStepFacts(state.data, formType),
    [state.data],
  )

  const formNoOf = useCallback(
    (formType?: string | null) => formOf(formType)?.formNo ?? '',
    [formOf],
  )

  return {
    catalog: state.data,
    loading: state.loading,
    error: state.error,
    reload: state.reload,
    formOf,
    stepsOf,
    formNoOf,
  }
}

// =====================================================================================
// 4. ONE RUNNING INSTANCE  (requirement #3)
// =====================================================================================

export interface WorkflowInstanceState {
  instance: WorkflowInstanceResponse | null
  /** Normalised facts every rule of workflow-permissions.ts consumes. */
  facts: InstanceFacts | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /**
   * Applies the instance returned by an action WITHOUT a second round trip, then refreshes
   * in the background so the step table, signatures and capability flags stay authoritative.
   */
  applyInstance: (next: WorkflowInstanceResponse) => void
}

export function useWorkflowInstance(instanceId?: string | null): WorkflowInstanceState {
  const enabled = !!instanceId && instanceId.trim() !== ''

  const state = useAsync<WorkflowInstanceResponse | null>(
    () => getWorkflowForm(instanceId as string),
    null,
    [instanceId],
    enabled,
  )

  const facts = useMemo(() => (state.data ? instanceFactsFrom(state.data) : null), [state.data])

  const applyInstance = useCallback(
    (next: WorkflowInstanceResponse) => {
      state.setData(next)
      void state.reload()
    },
    [state],
  )

  return {
    instance: state.data,
    facts,
    loading: state.loading,
    error: state.error,
    reload: state.reload,
    applyInstance,
  }
}

// =====================================================================================
// 5. THE ASSIGNEE POOL  (requirements #4, #5)
// =====================================================================================

/**
 * Normalises whatever `/api/self-evaluation/users` returns into the CandidateUser shape the permission
 * matrix expects. THE ID IS FORCED TO A NUMBER HERE - this single conversion is what
 * prevents the "400 application/problem+json on the user endpoints" defect from coming back.
 */
export function normalizeCandidate(raw: Record<string, unknown>): CandidateUser | null {
  const rawId = raw.userId ?? raw.UserId ?? raw.id ?? raw.Id ?? raw.employeeUserId ?? raw.EmployeeUserId
  const parsed = typeof rawId === 'number' ? rawId : Number.parseInt(String(rawId ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null

  const role = (raw.role ?? raw.roleName ?? raw.Role ?? raw.RoleName ?? null) as string | null

  return {
    userId: parsed,
    role,
    shopId: (raw.shopId ?? raw.ShopId ?? null) as string | null,
    functionalUnit:
      (raw.functionalUnit ?? raw.FunctionalUnit) as string | null ?? functionalUnitOf(role),
    fullName: (raw.fullName ?? raw.FullName ?? raw.name ?? raw.Name ?? raw.userName ?? raw.UserName ?? null) as string | null,
    employeeNo: (raw.employeeNo ?? raw.EmployeeNo ?? raw.employeeNumber ?? raw.EmployeeNumber ?? null) as string | null,
    isActive:
      raw.isActive === undefined && raw.IsActive === undefined
        ? true
        : raw.isActive !== false && raw.IsActive !== false,
    isAvailable: (raw.isAvailable ?? raw.IsAvailable ?? null) as boolean | null,
    isAbsentNow: (raw.isAbsentNow ?? raw.IsAbsentNow ?? null) as boolean | null,
    openTickets: (raw.openTickets ?? raw.OpenTickets ?? null) as number | null,
    maxConcurrent: (raw.maxConcurrent ?? raw.MaxConcurrent ?? null) as number | null,
  }
}

async function fetchCandidateUsers(params: {
  shopId?: string | null
  role?: string | null
  functionalUnit?: string | null
  managerPool?: boolean
}): Promise<CandidateUser[]> {
  const search = new URLSearchParams()
  if (params.shopId) search.set('shopId', params.shopId)
  if (params.role) search.set('role', params.role)
  if (params.functionalUnit) search.set('functionalUnit', params.functionalUnit)
  if (params.managerPool) search.set('managerPool', 'true')
  search.set('isActive', 'true')
  search.set('pageSize', '500')
  const query = search.toString()

  const response = await fetch(`/api/self-evaluation/users${query ? `?${query}` : ''}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    credentials: 'include',
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new WorkflowApiError({
      status: response.status,
      message: 'The user directory could not be loaded, so no assignee can be offered.',
      errorCode: 'PERMISSION_DENIED',
    })
  }

  const payload: unknown = await response.json().catch(() => null)
  const rows: unknown[] = Array.isArray(payload)
    ? payload
    : ((payload as Record<string, unknown> | null)?.data as unknown[]) ??
      ((payload as Record<string, unknown> | null)?.items as unknown[]) ??
      ((payload as Record<string, unknown> | null)?.users as unknown[]) ??
      []

  return rows
    .filter((row): row is Record<string, unknown> => !!row && typeof row === 'object')
    .map(normalizeCandidate)
    .filter((user): user is CandidateUser => user !== null)
}

export interface CandidatePoolState {
  users: CandidateUser[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  /** Only the people the pending step may legitimately be ASSIGNED to. */
  assignableFor: (facts: InstanceFacts | null, stepNo?: number | null) => CandidateUser[]
  /** Only the people the actor may legitimately DELEGATE the pending step to. */
  delegatableFor: (
    actor: WorkflowActor | null,
    facts: InstanceFacts | null,
    stepNo?: number | null,
  ) => CandidateUser[]
}

export function useCandidateUsers(
  params: {
    shopId?: string | null
    role?: string | null
    functionalUnit?: string | null
    managerPool?: boolean
  } = {},
): CandidatePoolState {
  const state = useAsync<CandidateUser[]>(
    () => fetchCandidateUsers(params),
    [],
    [params.shopId, params.role, params.functionalUnit, params.managerPool],
    true,
  )

  const assignableFor = useCallback(
    (facts: InstanceFacts | null, stepNo?: number | null) => {
      if (!facts) return []
      return filterAssignable(facts, stepNo ?? facts.currentStepNo, state.data)
    },
    [state.data],
  )

  const delegatableFor = useCallback(
    (actor: WorkflowActor | null, facts: InstanceFacts | null, stepNo?: number | null) => {
      if (!actor || !facts) return []
      return filterDelegatable(actor, facts, state.data, stepNo)
    },
    [state.data],
  )

  return {
    users: state.data,
    loading: state.loading,
    error: state.error,
    reload: state.reload,
    assignableFor,
    delegatableFor,
  }
}

// =====================================================================================
// 6. FOLDER LAYER  (requirements #2, #11, #12)
// =====================================================================================

export function useTableOfContents(folderId?: string | null, refreshKey = 0) {
  const enabled = !!folderId && folderId.trim() !== ''
  return useAsync<TableOfContentsResponse | null>(
    () => getFolderTableOfContents(folderId as string),
    null,
    [folderId, refreshKey],
    enabled,
  )
}

export function useFolderProgress(folderId?: string | null) {
  const enabled = !!folderId && folderId.trim() !== ''
  return useAsync<FolderProgressResponse | null>(
    () => getFolderProgress(folderId as string),
    null,
    [folderId],
    enabled,
  )
}

export function useFolderRevisions(folderId?: string | null) {
  const enabled = !!folderId && folderId.trim() !== ''
  return useAsync<RevisionResponse[]>(
    () => listFolderRevisions(folderId as string),
    [],
    [folderId],
    enabled,
  )
}

export function useCompetencyMatrix(folderId?: string | null) {
  const enabled = !!folderId && folderId.trim() !== ''
  return useAsync<CompetencyMatrixRowResponse[]>(
    () => getCompetencyMatrix(folderId as string),
    [],
    [folderId],
    enabled,
  )
}

export function useToolEquivalencyMatrix(folderId?: string | null) {
  const enabled = !!folderId && folderId.trim() !== ''
  return useAsync<ToolEquivalencyRowResponse[]>(
    () => getToolEquivalencyMatrix(folderId as string),
    [],
    [folderId],
    enabled,
  )
}

// =====================================================================================
// 7. QUEUES, EXPIRIES, NOTIFICATIONS  (requirement #10)
// =====================================================================================

export interface InboxParams {
  scope?: 'mine' | 'shop' | 'all'
  pageSize?: number
  folderId?: string
  shopId?: string
  formType?: string
  includeUnitQueue?: boolean
  onlyNeedsAssignment?: boolean
  onlyOverdue?: boolean
}

export function useWorkflowInbox(
  params: InboxParams = {},
  options: { pollIntervalMs?: number } = {},
) {
  const key = JSON.stringify(params)
  const state = useAsync<InboxItemResponse[]>(() => getWorkflowInbox(params), [], [key], true)

  // Keep Pending Approvals and action sidebars current even when no SignalR workflow
  // event is emitted (for example after an approval from another browser session).
  useEffect(() => {
    const pollIntervalMs = options.pollIntervalMs ?? 10000
    if (pollIntervalMs <= 0) return
    const timer = window.setInterval(() => void state.reload(), pollIntervalMs)
    return () => window.clearInterval(timer)
  }, [options.pollIntervalMs, state.reload])

  return state
}

export function useExpiries(
  params: {
    folderId?: string | null
    shopId?: string | null
    withinDays?: number | null
    overdueOnly?: boolean | null
  } = {},
) {
  const key = JSON.stringify(params)
  return useAsync<ExpiryItemResponse[]>(() => listExpiries(params), [], [key], true)
}

export function useWorkflowNotifications(
  params: {
    unreadOnly?: boolean | null
    category?: string | null
    page?: number | null
    pageSize?: number | null
  } = {},
) {
  const key = JSON.stringify(params)
  return useAsync<NotificationResponse[]>(() => listNotifications(params), [], [key], true)
}

// =====================================================================================
// 8. ACTION RUNNER
//    Every mutating call in a component goes through this, so success / failure handling,
//    the toast text and the "N steps skipped" hint are identical everywhere.
// =====================================================================================

export interface ActionRunnerState {
  running: boolean
  lastError: string | null
  lastErrorCode: string | null
  /**
   * Runs one workflow mutation. Returns the payload on success and `null` on failure, so a
   * caller can simply `if (!result) return`.
   */
  run: <T>(
    action: () => Promise<T>,
    handlers?: {
      onSuccess?: (result: T) => void | Promise<void>
      onError?: (message: string, code: string | null) => void
    },
  ) => Promise<T | null>
}

export function useWorkflowAction(): ActionRunnerState {
  const [running, setRunning] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [lastErrorCode, setLastErrorCode] = useState<string | null>(null)

  const run = useCallback<ActionRunnerState['run']>(async (action, handlers) => {
    setRunning(true)
    setLastError(null)
    setLastErrorCode(null)
    try {
      const result = await action()
      await handlers?.onSuccess?.(result)
      return result
    } catch (caught) {
      const { message, code } = messageOf(caught)
      setLastError(message)
      setLastErrorCode(code)
      handlers?.onError?.(message, code)
      return null
    } finally {
      setRunning(false)
    }
  }, [])

  return { running, lastError, lastErrorCode, run }
}