/**
 * =====================================================================================
 * AMENDED v31 - THE LEDGER REACT BINDING  (NEW FILE)
 * Copy to: CMT.Frontend/src/lib/workflow/useSignatureLedger.ts
 *
 * WHAT THIS HOOK DOES
 * -------------------
 * Keeps the durable signature ledger of ONE form in sync, in two directions:
 *
 *   MIRROR (automatic)  every time the resolved workflow instance changes, every SETTLED
 *                       printed line is copied into `formData.signatureLedger`. The next
 *                       save / submit persists it inside FormDataJson, so the approval
 *                       survives even if the instance later fails to resolve, or if the
 *                       form is opened by somebody whose session cannot see the engine.
 *
 *   COMMIT (explicit)   `commitOnAction()` writes the LOGGED-IN user's own line for the
 *                       LEGACY approval path, where no FormWorkflowInstance exists and
 *                       there is therefore nothing to mirror. Call it from
 *                       `onStatusChange` of FormWorkflowFooter, i.e. AFTER the approve
 *                       request has already succeeded.
 *
 * WHY THE MIRROR IS NOT A LOOP
 * ----------------------------
 * The effect recomputes the merge and compares it with `isSameLedger()` BEFORE calling
 * `setFormData`. A no-op merge therefore never triggers a state update, so the effect
 * cannot re-enter. The functional `setFormData(prev => ...)` also re-reads the ledger from
 * `prev`, so two forms mounted at once can never clobber each other.
 *
 * WHY THE MIRROR DOES NOT AUTO-SAVE
 * ---------------------------------
 * Writing the ledger into local form state ONLY is deliberate. An automatic PUT on mount
 * would (a) fire a request for every form the user merely looks at, and (b) fight the
 * "Cannot update. Form must be in Draft or Returned status." guard on an approved form.
 * The ledger is persisted by the next legitimate save / submit, which is exactly when the
 * form is writable anyway. Until then it is still PRINTED, because the printed block reads
 * it from `formData` through `withLedgerValues()`.
 *
 * HARD RULE
 *   This hook NEVER invents an approval. `signedLedgerEntries()` only mirrors settled
 *   server rows, and `sessionLedgerEntry()` refuses to write over a settled server row.
 * =====================================================================================
 */
'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import { useCurrentSigner } from '@/lib/workflow/current-signer'
import {
  isSameLedger,
  mergeLedgerEntries,
  readSignatureLedger,
  sessionLedgerEntry,
  signedLedgerEntries,
  writeSignatureLedger,
  type SignatureLedgerEntry,
} from '@/lib/workflow/signature-ledger'
import type { WorkflowInstanceResponse } from '@/lib/workflow/workflow-types'

export interface UseSignatureLedgerArgs<T extends Record<string, unknown>> {
  /** The live form payload held by `useFormData()`. */
  formData: T
  /** The setter of `useFormData()`. */
  setFormData: Dispatch<SetStateAction<T>>
  /** The persisted FormSubmission.FormType, also the matrix key. */
  formType: string
  /** The resolved instance, from `useFormWorkflowInstance()`. May be null. */
  instance: WorkflowInstanceResponse | null | undefined
  /**
   * The printed line the LOGGED-IN user owns by role, from `useFormEditAuthority()`.
   * -1 when he owns none, in which case `commitOnAction()` is a no-op.
   */
  ownedSlotIndex: number
}

export interface UseSignatureLedgerState {
  /** The durable ledger. Feed it to `withLedgerValues(rows, ledger)`. */
  ledger: SignatureLedgerEntry[]
  /**
   * Freezes the logged-in user's own line, for the LEGACY approval path. Safe to call
   * unconditionally from `onStatusChange`: it refuses to write when the server already
   * recorded that line, when the signer owns no line, or when nothing changed.
   */
  commitOnAction: () => void
}

export function useSignatureLedger<T extends Record<string, unknown>>({
  formData,
  setFormData,
  formType,
  instance,
  ownedSlotIndex,
}: UseSignatureLedgerArgs<T>): UseSignatureLedgerState {
  const signer = useCurrentSigner()

  const ledger = useMemo(() => readSignatureLedger(formData), [formData])

  // The settled server lines of the CURRENT instance, recomputed only when it changes.
  const mirrored = useMemo(
    () => signedLedgerEntries(formType, instance ?? null),
    [formType, instance],
  )

  // Guards against re-running the merge for an instance revision already mirrored.
  const lastMirrorRef = useRef<string>('')

  useEffect(() => {
    if (mirrored.length === 0) return

    const fingerprint = JSON.stringify(
      mirrored.map(entry => [entry.slotIndex, entry.personName, entry.date, entry.stepNo]),
    )
    if (fingerprint === lastMirrorRef.current) return
    lastMirrorRef.current = fingerprint

    setFormData(previous => {
      const current = readSignatureLedger(previous)
      const next = mergeLedgerEntries(current, mirrored)
      // No change -> return the SAME object, so React bails out of the update entirely.
      if (isSameLedger(current, next)) return previous
      return writeSignatureLedger(previous, next)
    })
  }, [mirrored, setFormData])

  const commitOnAction = useCallback(() => {
    const entry = sessionLedgerEntry(formType, instance ?? null, signer, ownedSlotIndex)
    if (!entry) return

    setFormData(previous => {
      const current = readSignatureLedger(previous)
      const next = mergeLedgerEntries(current, [entry])
      if (isSameLedger(current, next)) return previous
      return writeSignatureLedger(previous, next)
    })
  }, [formType, instance, signer, ownedSlotIndex, setFormData])

  return { ledger, commitOnAction }
}