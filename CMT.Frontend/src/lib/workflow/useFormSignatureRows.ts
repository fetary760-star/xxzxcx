/**
 * =====================================================================================
 * AMENDED v28 — ITEM 14 / DELIVERABLE 4: THE REACT BINDING OF THE SIGNATURE LAYER
 * Copy to: CMT.Frontend/src/lib/workflow/useFormSignatureRows.ts   (REPLACES the v23 file)
 *
 * WHAT v23 FIXED (kept)
 * ---------------------
 * v19 called `autoFillLegacyRows(legacyRows, rows)` with NO `formType`, which discarded every
 * declarative fact of the hard copy at runtime: the verbatim caption, the fixed role title,
 * the expectedRoles disambiguation and the printed geometry. v23 threaded `formType` through
 * every hook and added `usePrintedSignatureLines()`.
 *
 * WHAT v28 ADDS — THE LOGGED-IN SIGNER
 * -----------------------------------
 * v23 was still 100% server-derived, so the reported symptom survived it:
 *
 *     "nothing in it ever reads the logged-in user — every printed value depends on an
 *      already-executed workflow step, so 'Prepared By / Approved By' stay blank exactly."
 *
 * Every hook here now resolves `useCurrentSigner()` BY DEFAULT and passes it down. This file
 * is the correct place for that call: it is already a `'use client'` React module, whereas
 * `signature-blocks.ts` / `signature-print.ts` must stay pure (importing the auth context
 * there would rebuild the circular-import defect documented in `workflow-types.ts`).
 *
 *   - `signer` is an OPTIONAL LAST parameter on every hook. Pass `null` EXPLICITLY to opt out
 *     (the folder PDF exporter does, because an export must contain recorded signatures only).
 *   - Omit it and the hook uses the current session — which is what makes the ~30 existing
 *     documents automatic with no edit at all.
 *
 * WHY THE PREFETCH CHANGED
 * -----------------------
 * `signedUserIds()` (v28) now also returns the PROVISIONAL signer's id, so the specimen of the
 * logged-in user is streamed and cached before the browser paints his own line. Without it his
 * line would print his name and date but an EMPTY signature cell — exactly half of the
 * reported defect.
 *
 * HARD RULE
 *   The rows are derived from `instance` + the session, never from local component state.
 *   After any approve / reject / skip / assign call, re-fetch the instance (`reload()` of
 *   `useFormWorkflowInstance`) and the whole signature block re-renders automatically, with
 *   the frozen server stamp replacing the provisional value. That is the "automatic" of the
 *   requirement.
 * =====================================================================================
 */

'use client'

import { useEffect, useMemo } from 'react'

import { useCurrentSigner } from '@/lib/workflow/current-signer'
import { resolveSignature } from '@/lib/workflow/signature-render'
import {
  autoFillLegacyRows,
  buildSignatureRows,
  findSignatureRow,
  findSignatureRowByCaption,
  findSignatureRowByStep,
  isUsableSigner,
  provisionalFillIndex,
  rowsForForm,
  signatureProgress,
  signedUserIds,
  type AutoFilledRow,
  type LegacySignatureRowLike,
  type PrintedSignatureRow,
  type ProvisionalSignerLike,
  type SignatureProgress,
} from '@/lib/workflow/signature-blocks'
import {
  printedInlineLines,
  printedLinesFromRows,
  printStyleOf,
  type FilledSignatureRowLike,
  type PrintedInlineLine,
  type SignaturePrintStyle,
} from '@/lib/workflow/signature-print'
import type { SignatureBlockType, WorkflowInstanceResponse } from '@/lib/workflow/workflow-types'

/**
 * `undefined` -> use the current session (the default that makes the existing forms work).
 * `null`      -> opt OUT of the provisional fill explicitly (folder PDF export).
 */
export type SignerArg = ProvisionalSignerLike | null | undefined

/**
 * Resolves the signer argument of every hook. `useCurrentSigner()` is called
 * UNCONDITIONALLY (React hook rules) and its result is simply discarded when the caller
 * opted out with an explicit `null`.
 */
function useResolvedSigner(signer: SignerArg): ProvisionalSignerLike | null {
  const sessionSigner = useCurrentSigner()
  if (signer === null) return null
  if (signer !== undefined) return signer
  return sessionSigner
}

// =====================================================================================
// 1. THE MAIN HOOK
// =====================================================================================

export interface FormSignatureLayer {
  /** Ordered printed rows of the form. Empty when no instance exists yet. */
  rows: PrintedSignatureRow[]
  /** Counters for the header line / the completion dashboard. */
  progress: SignatureProgress
  /** Row of a signature block, `occurrence` disambiguates repeated blocks. */
  rowFor: (block: SignatureBlockType, occurrence?: number) => PrintedSignatureRow | null
  /** Row of a PRINTED caption of the hard copy ("Approved By:"). */
  rowForCaption: (caption?: string | null, occurrence?: number) => PrintedSignatureRow | null
  /** Row of a routing step number. */
  rowForStep: (stepNo: number) => PrintedSignatureRow | null
  /** Distinct signers whose specimen has to be resolved (incl. the provisional one). */
  signerIds: number[]
  /** True while the form still has an outstanding signature. */
  hasOutstanding: boolean
}

/**
 * The RAW workflow rows of one instance. Deliberately NOT provisional: these rows are the
 * server's view and are consumed by the matching layer, which applies the signer afterwards.
 */
export function useFormSignatureRows(
  instance?: WorkflowInstanceResponse | null,
): FormSignatureLayer {
  const rows = useMemo(() => buildSignatureRows(instance), [instance])

  return useMemo<FormSignatureLayer>(() => {
    const progress = signatureProgress(rows)
    return {
      rows,
      progress,
      rowFor: (block, occurrence = 0) => findSignatureRow(rows, block, occurrence),
      rowForCaption: (caption, occurrence = 0) =>
        findSignatureRowByCaption(rows, caption, occurrence),
      rowForStep: stepNo => findSignatureRowByStep(rows, stepNo),
      signerIds: signedUserIds(rows),
      hasOutstanding: progress.outstanding > 0,
    }
  }, [rows])
}

/**
 * The MATRIX rows of one form: one row per PRINTED line, with the verbatim caption, the fixed
 * role title, the executed workflow values AND the logged-in user's provisional values.
 *
 * Use this when a screen needs the printed rows without the legacy `SignatureRow[]` plumbing
 * (for example the folder completion dashboard, or a read-only print preview).
 */
export function useFormPrintedRows(
  formType?: string | null,
  instance?: WorkflowInstanceResponse | null,
  signer?: SignerArg,
): PrintedSignatureRow[] {
  const resolved = useResolvedSigner(signer)
  return useMemo(() => rowsForForm(formType, instance, resolved), [formType, instance, resolved])
}

// =====================================================================================
// 2. THE ZERO-LAYOUT-CHANGE HOOK FOR EXISTING FORMS
// =====================================================================================

/**
 * Attaches the automatic name / date / signature to the `SignatureRow[]` a form ALREADY
 * builds.
 *
 *     const signatureRows = useAutoFilledSignatureRows(
 *       legacyRows,     // the array the form already declares
 *       instance,       // from useFormWorkflowInstance({ formSubmissionId, folderId })
 *       formType,       // 'tna' | 'periodic_self_audit' | '918_faa' | ...
 *     )
 *
 *     <SignatureBlock rows={signatureRows} editable={isEditing} formType={formType} />
 *
 * AMENDED v28: the logged-in signer is applied automatically, so the preparer / approver sees
 * his own name, today's UTC date and his specimen on HIS line even before the workflow has
 * recorded anything.
 */
export function useAutoFilledSignatureRows<T extends LegacySignatureRowLike>(
  legacyRows: T[],
  instance?: WorkflowInstanceResponse | null,
  formType?: string | null,
  signer?: SignerArg,
): AutoFilledRow<T>[] {
  const { rows } = useFormSignatureRows(instance)
  const resolved = useResolvedSigner(signer)
  return useMemo(
    () => autoFillLegacyRows(legacyRows, rows, formType, resolved),
    [legacyRows, rows, formType, resolved],
  )
}

/** Same as above when the caller already holds the derived rows. */
export function useAutoFilledRowsFrom<T extends LegacySignatureRowLike>(
  legacyRows: T[],
  autoRows: PrintedSignatureRow[],
  formType?: string | null,
  signer?: SignerArg,
): AutoFilledRow<T>[] {
  const resolved = useResolvedSigner(signer)
  return useMemo(
    () => autoFillLegacyRows(legacyRows, autoRows, formType, resolved),
    [legacyRows, autoRows, formType, resolved],
  )
}

// =====================================================================================
// 3. PRINTED LINES — everything a signature block needs, in ONE call
// =====================================================================================

/**
 * Legacy rows + instance + form type + session -> printed lines, captions, role titles,
 * inline captions and geometry all resolved. This is what a form should use when it renders
 * the signature block itself instead of going through `FormDocumentChrome.SignatureBlock`.
 */
export function usePrintedSignatureLines<T extends FilledSignatureRowLike>(
  legacyRows: T[],
  instance?: WorkflowInstanceResponse | null,
  formType?: string | null,
  prefetch = false,
  signer?: SignerArg,
): PrintedInlineLine<AutoFilledRow<T>>[] {
  const { rows } = useFormSignatureRows(instance)
  const resolved = useResolvedSigner(signer)

  const lines = useMemo(
    () => printedInlineLines(legacyRows, rows, formType, resolved),
    [legacyRows, rows, formType, resolved],
  )

  // Warm the specimens of the RESOLVED lines (recorded signers + the provisional one).
  const specimenRows = useMemo(
    () => lines.map(line => line.signature).filter((row): row is PrintedSignatureRow => !!row),
    [lines],
  )
  useSignatureSpecimenPrefetch(specimenRows, prefetch)

  return lines
}

/**
 * Rows that have ALREADY been through `useAutoFilledSignatureRows()` -> printed lines.
 * Used by `FormDocumentChrome.SignatureBlock`, which must NOT re-run the matching.
 */
export function usePrintedLinesFromRows<T extends FilledSignatureRowLike>(
  rows: T[],
  formType?: string | null,
  signer?: SignerArg,
): PrintedInlineLine<T>[] {
  const resolved = useResolvedSigner(signer)
  return useMemo(
    () => printedLinesFromRows(rows, formType, resolved),
    [rows, formType, resolved],
  )
}

/** The print style of a form type (Inline for every hard copy except the MNT-918 family). */
export function useSignaturePrintStyle(formType?: string | null): SignaturePrintStyle {
  return useMemo(() => printStyleOf(formType), [formType])
}

// =====================================================================================
// 4. "IS THIS FORM WAITING FOR ME?"   (NEW in v28)
// =====================================================================================

export interface CurrentSignerLineState {
  /** The resolved signer, or null when the session carries no usable role. */
  signer: ProvisionalSignerLike | null
  /** Printed position the logged-in user is responsible for, or -1. */
  slotIndex: number
  /** True when the logged-in user owns a printed line of this form. */
  isSignatory: boolean
  /** Convenience: his name, for a confirmation dialog ("Sign as Karim Nour?"). */
  personName: string
  /** Convenience: today's UTC date, identical to what will be printed. */
  today: string
}

/**
 * Tells a screen whether the LOGGED-IN USER owns a printed signature line of this form, and
 * which one. Use it to decide whether to show an "Approve / Sign" button, and to label it.
 *
 * It reuses the exact same gating as the printed fill (`canFillProvisionally`), so the button
 * can never appear on a form the user is not a signatory of.
 */
export function useCurrentSignerLine(
  formType?: string | null,
  instance?: WorkflowInstanceResponse | null,
  signer?: SignerArg,
): CurrentSignerLineState {
  const resolved = useResolvedSigner(signer)

  return useMemo(() => {
    const slotIndex = provisionalFillIndex(formType, instance, resolved)
    return {
      signer: resolved,
      slotIndex,
      isSignatory: isUsableSigner(resolved) && slotIndex >= 0,
      personName: resolved?.personName ?? '',
      today: resolved?.today ?? '',
    }
  }, [formType, instance, resolved])
}

// =====================================================================================
// 5. SPECIMEN PREFETCH  (print / folder PDF preview)
// =====================================================================================

/**
 * Warms the shared specimen cache of `signature-render.ts`. NEVER rejects: a specimen that
 * cannot be resolved simply prints as a typed name (rule 4 of the layer).
 */
export async function prefetchSignatureSpecimens(
  rows: PrintedSignatureRow[] | null | undefined,
): Promise<void> {
  const ids = signedUserIds(rows)
  if (ids.length === 0) return
  await Promise.all(ids.map(id => resolveSignature(id).catch(() => null)))
}

/**
 * Effect flavour of the prefetch. Mount it on any component that is about to be printed
 * or exported, so every specimen is already in the cache when the browser paints.
 */
export function useSignatureSpecimenPrefetch(
  rows: PrintedSignatureRow[] | null | undefined,
  enabled = true,
): void {
  const key = useMemo(() => signedUserIds(rows).join(','), [rows])

  useEffect(() => {
    if (!enabled || !key) return
    let cancelled = false
    void prefetchSignatureSpecimens(rows).then(() => {
      if (cancelled) return
    })
    return () => {
      cancelled = true
    }
    // `key` is the stable identity of the signer set; `rows` alone would re-run every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
}

/**
 * Warms the specimen of ONE user — used for the logged-in signer, whose id is known before any
 * workflow row exists. This is what guarantees his own line paints WITH his signature image
 * on the very first render of a brand-new form.
 */
export function useSignerSpecimenPrefetch(
  signer?: ProvisionalSignerLike | null,
  enabled = true,
): void {
  const userId = signer?.userId ?? null

  useEffect(() => {
    if (!enabled || !userId || userId <= 0) return
    void resolveSignature(userId).catch(() => null)
  }, [userId, enabled])
}