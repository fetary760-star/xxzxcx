
/**
 * =====================================================================================
 * AMENDMENT v18 - PHASE 1 (FRONTEND), ITEM 2
 * CMT.Frontend/src/lib/workflow/useEvaluationFolder.ts                         (NEW FILE)
 *
 * WHAT THIS FILE IS
 * -----------------
 * The ONE place that answers "which EvaluationFolder does the selected ATA record belong
 * to?". Every workflow surface (ToC panel, folder progress, sign-off chain) needs a
 * folderId: string (C# Guid) and today NOTHING on the client can produce one.
 *
 * WHY IT IS NEEDED AND WHY IT DOES NOT CALL AN ENDPOINT
 * ----------------------------------------------------
 * Phase 1 is frontend-only. The folder-provisioning endpoint
 * (POST /api/evaluation-folders) is Phase 2. Two wrong ways to bridge the gap, both
 * explicitly rejected here:
 *   - fabricating a Guid  -> the ToC endpoint answers 404 and the screen shows a
 *                            transport failure that is actually a client bug;
 *   - reusing ataRecord.id -> an ATARecord Guid is NOT an EvaluationFolder Guid. The
 *                            server would answer 404/INSTANCE_NOT_FOUND for the same
 *                            reason.
 * So the hook reports UNPROVISIONED and the ToC renders from the PRINTED tree. The
 * offline appearance comes from the printed structure, never from fabricated statuses.
 *
 * PHASE 2 MIGRATION: when the endpoint exists, replace the body of `resolve()` with the
 * real call. Every consumer keeps working because the return shape does not change.
 * =====================================================================================
 */

'use client'

import { useMemo } from 'react'

export interface EvaluationFolderIdentity {
  /** C# Guid of the folder, or null while it has not been provisioned. */
  folderId: string | null
  /** True only when a real folder Guid is available and workflow calls may be made. */
  provisioned: boolean
  /** Operator-facing reason, rendered as the unprovisioned notice. */
  reason: string
}

/** The minimum shape this hook needs; ATARecordDto satisfies it. */
export interface FolderBearingRecord {
  id?: string | null
  evaluationFolderId?: string | null
  ataChapterCode?: string | null
  partNumber?: string | null
  authority?: string | null
  formSubmissions?: Array<{
    id: string
    formType: string
    formNo: string
    approvalStatus: number
  }>
}

const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A Guid that is syntactically valid AND not the all-zero sentinel. */
export function isUsableFolderId(value?: string | null): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed === '' || trimmed === '00000000-0000-0000-0000-000000000000') return false
  return GUID_RE.test(trimmed)
}

export function useEvaluationFolder(
  record?: FolderBearingRecord | null,
): EvaluationFolderIdentity {
  return useMemo<EvaluationFolderIdentity>(() => {
    if (!record) {
      return {
        folderId: null,
        provisioned: false,
        reason: 'Select an ATA record to open its evaluation folder.',
      }
    }

    const candidate = record.evaluationFolderId
    if (isUsableFolderId(candidate)) {
      return { folderId: (candidate as string).trim(), provisioned: true, reason: '' }
    }

    return {
      folderId: null,
      provisioned: false,
      reason:
        'No evaluation folder has been provisioned for this ATA record yet. Existing form ' +
        'statuses remain visible below; drafting and sign-off become available once the ' +
        'folder exists.',
    }
  }, [record])
}