/**
 * =====================================================================================
 * AMENDED v20 — ITEM 3 (NEW FILE): THE MISSING WIRING LINK
 * Copy to: CMT.Frontend/src/lib/workflow/useFormWorkflowInstance.ts
 *
 * WHY THIS FILE IS THE MOST IMPORTANT ONE OF THE AMENDMENT
 * -------------------------------------------------------
 * v19 delivered a correct derivation layer and a correct printed cell, and yet EVERY form
 * still printed a blank signature column. The reason is structural, not cosmetic:
 *
 *   `useFormData()`  gives a form component  ->  formSubmissionId   (C# Guid of FormSubmission)
 *   `getWorkflowInstance()` needs            ->  instanceId         (C# Guid of FormWorkflowInstance)
 *
 * Those are DIFFERENT ENTITIES. No component had a way to get from the one it holds to the
 * one the signature layer needs, so `instance` was never passed, `autoFillLegacyRows()` always
 * took the "no signature" branch, and the automatic name / date / signature never rendered.
 *
 * WHAT THIS HOOK DOES
 * -------------------
 * Resolves the WorkflowInstanceResponse of the form the user is looking at, from whatever
 * identifier the screen happens to hold, through a documented FOUR-STEP CHAIN. Every step is
 * tolerated-failure: the hook NEVER throws and NEVER blocks the form. When nothing resolves,
 * `instance` is null and the form prints exactly as it printed before the amendment.
 *
 *   STEP 1 — an explicit `instanceId` (the ToC row already knows it: the
 *            `TableOfContentsItemResponse.formWorkflowInstanceId` field). Cheapest and exact.
 *   STEP 2 — `GET /api/workflow/forms?formSubmissionId={guid}`. This is the ONE small server
 *            addition the amendment asks for (see the integration guide). It is queried
 *            defensively: a 404 / 400 from a server that has not been redeployed is swallowed.
 *   STEP 3 — the Table of Contents of the folder. `TableOfContentsItemResponse` carries BOTH
 *            `formSubmissionId` and `formWorkflowInstanceId`, so when the screen knows the
 *            folder id the mapping is available with NO server change at all.
 *   STEP 4 — `GET /api/workflow/forms/{formSubmissionId}`, for deployments where the workflow
 *            instance is keyed by the submission id.
 *
 * HARD RULES
 *   (1) NEVER THROW. A signature block is decoration on a form that must stay usable.
 *   (2) THE INSTANCE IS THE ONLY SOURCE OF THE PRINTED SIGNATURES. After any approve /
 *       reject / skip / assign action the caller must call `reload()`, and the whole block
 *       re-renders. That is the "automatic" of the requirement.
 *   (3) ids: user ids are NUMBERS (C# long); submission / instance / folder ids are STRINGS
 *       (C# Guid).
 * =====================================================================================
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { getFolderTableOfContents, getWorkflowForm } from '@/lib/workflow/workflow-api'
import type { WorkflowInstanceResponse } from '@/lib/workflow/workflow-types'

// =====================================================================================
// 1. DEFENSIVE TRANSPORT
//    Deliberately NOT the shared transport: a miss must be silent here, whereas
//    `workflow-transport.ts` correctly raises WorkflowApiError for real calls.
// =====================================================================================

async function tryGetJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    })
    if (!response.ok || response.status === 204) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

function isGuidLike(value?: string | null): boolean {
  return !!value && value.trim().length > 0
}

/** Unwraps `{ data: … }` / `{ items: [ … ] }` / a bare array, which the API mixes. */
function firstInstanceOf(payload: unknown): WorkflowInstanceResponse | null {
  if (!payload || typeof payload !== 'object') return null

  const asRecord = payload as Record<string, unknown>
  if (typeof asRecord.id === 'string' && Array.isArray(asRecord.steps)) {
    return payload as WorkflowInstanceResponse
  }

  const candidates: unknown[] = Array.isArray(payload)
    ? payload
    : (asRecord.data as unknown[]) ?? (asRecord.items as unknown[]) ?? []

  const hit = candidates.find(
    row => !!row && typeof row === 'object' && typeof (row as Record<string, unknown>).id === 'string',
  )
  return (hit as WorkflowInstanceResponse | undefined) ?? null
}

// =====================================================================================
// 2. THE RESOLUTION CHAIN
// =====================================================================================

export interface ResolveInstanceArgs {
  /** Exact instance id when the screen already knows it (ToC row). */
  instanceId?: string | null
  /** The FormSubmission id every form component holds through `useFormData()`. */
  formSubmissionId?: string | null
  /** Folder id, which unlocks STEP 3 with no server change. */
  folderId?: string | null
}

export async function resolveFormWorkflowInstance(
  args: ResolveInstanceArgs,
): Promise<WorkflowInstanceResponse | null> {
  const { instanceId, formSubmissionId, folderId } = args

  // ---- STEP 1: exact instance id ------------------------------------------------------
  if (isGuidLike(instanceId)) {
    try {
      return await getWorkflowForm(instanceId as string)
    } catch {
      /* fall through */
    }
  }

  if (!isGuidLike(formSubmissionId)) return null
  const submissionId = (formSubmissionId as string).trim()

  // ---- STEP 2: lookup by submission id ------------------------------------------------
  const byQuery = await tryGetJson<unknown>(
    `/api/workflow/forms?formSubmissionId=${encodeURIComponent(submissionId)}`,
  )
  const queried = firstInstanceOf(byQuery)
  if (queried) return queried

  // ---- STEP 3: the Table of Contents already maps submission -> instance --------------
  if (isGuidLike(folderId)) {
    try {
      const toc = await getFolderTableOfContents(folderId as string)
      for (const section of toc.sections ?? []) {
        for (const item of section.items ?? []) {
          if (
            item.formSubmissionId === submissionId &&
            isGuidLike(item.formWorkflowInstanceId)
          ) {
            return await getWorkflowForm(item.formWorkflowInstanceId as string)
          }
        }
      }
    } catch {
      /* fall through */
    }
  }

  // ---- STEP 4: the submission id IS the instance key in some deployments --------------
  try {
    return await getWorkflowForm(submissionId)
  } catch {
    return null
  }
}

// =====================================================================================
// 3. THE HOOK
// =====================================================================================

export interface FormWorkflowInstanceState {
  instance: WorkflowInstanceResponse | null
  /** True while resolving. A form must render its captions during this, never a spinner. */
  loading: boolean
  /**
   * True when no instance could be resolved. NOT an error: it is the normal state of a form
   * whose draft has not been started through the workflow yet.
   */
  unresolved: boolean
  reload: () => Promise<void>
  /** Applies the instance an action returned, then refreshes in the background. */
  applyInstance: (next: WorkflowInstanceResponse) => void
}

/**
 * Resolves and keeps the workflow instance of ONE form in sync.
 *
 * Usage inside any existing controlled document:
 *
 *     const { instance, reload } = useFormWorkflowInstance({
 *       formSubmissionId,
 *       folderId: selectedATARecord?.evaluationFolderId,
 *     })
 *
 * and then pass `instance` to `useAutoFilledSignatureRows()`. Call `reload()` from
 * `onStatusChange` of `FormWorkflowFooter` so an approval immediately repaints the block.
 */
export function useFormWorkflowInstance(
  args: ResolveInstanceArgs,
): FormWorkflowInstanceState {
  const { instanceId, formSubmissionId, folderId } = args

  const [instance, setInstance] = useState<WorkflowInstanceResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [settled, setSettled] = useState(false)

  // Guards against a late answer overwriting a newer one after the ids changed.
  const requestRef = useRef(0)

  const load = useCallback(async () => {
    const ticket = ++requestRef.current

    if (!isGuidLike(instanceId) && !isGuidLike(formSubmissionId)) {
      setInstance(null)
      setLoading(false)
      setSettled(true)
      return
    }

    setLoading(true)
    // Do not keep rendering actions from an outdated step while the server
    // capabilities are being refreshed. A stale canIAct flag can otherwise
    // expose Reject/Approve for a step the backend no longer permits.
    setInstance(null)
    const resolved = await resolveFormWorkflowInstance({
      instanceId,
      formSubmissionId,
      folderId,
    })

    if (ticket !== requestRef.current) return
    setInstance(resolved)
    setLoading(false)
    setSettled(true)
  }, [instanceId, formSubmissionId, folderId])

  useEffect(() => {
    void load()
  }, [load])

  const applyInstance = useCallback(
    (next: WorkflowInstanceResponse) => {
      setInstance(next)
      void load()
    },
    [load],
  )

  return {
    instance,
    loading,
    unresolved: settled && instance === null,
    reload: load,
    applyInstance,
  }
}