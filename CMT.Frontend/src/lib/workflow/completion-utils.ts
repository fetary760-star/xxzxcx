/**
 * =====================================================================================
 * AMENDED v17 — PHASE 1 (FRONTEND) — CMT.Frontend/src/lib/workflow/completion-utils.ts
 * Copy to: CMT.Frontend/src/lib/workflow/completion-utils.ts                 (NEW FILE)
 *
 * WHAT THIS FILE IS
 * -----------------
 * The PURE (React-free, fetch-free) rule layer that requirements #10..#14 were missing.
 * v11..v16 already gave the client:
 *
 *   workflow-types.ts        (v11) — enums + every request / response shape
 *   workflow-api.ts          (v13) — the ONLY client for the amended endpoints
 *   workflow-permissions.ts  (v14) — server-first capability resolvers
 *   useWorkflow.ts           (v15) — the React binding of the three above
 *   signature-render.ts      (v16) — specimen resolver for the printed signature cell
 *
 * ...but NOTHING that turns those payloads into the five deliverables of Phase 1:
 *
 *   #10 expiry buckets + notification grouping   -> expiryBucketOf / groupExpiries /
 *                                                   groupNotifications
 *   #11 completion tracking + PDF               -> remainingBySection / completionSummary /
 *                                                   triggerBrowserDownload / reportFileName
 *   #12 revision cycle + competency monitoring  -> twoYearDueDate / revisionState /
 *                                                   competencyState / calibrationState
 *   #13 name + date + signature auto-fill       -> buildSignatureRows  (THE CORE ONE)
 *   #14 final sign-off + lock                   -> signOffChainOf / folderLockState
 *
 * WHY #13 LIVES HERE AND NOT IN A COMPONENT
 * -----------------------------------------
 * Requirement #13 says the "Prepared by / Reviewed by / Approved by / Dates" block must be
 * filled "on each existed location accordingly on each form ... while maintaining the
 * existing form structures without modifying their layouts".
 * That means NO form file may compute its own signature rows: MNT-1420A, MNT-1420B,
 * MNT-1229B, MNT-1378, MNT-922C, MNT-918, MNT-918A and MNT-1325 all print the SAME block,
 * only with different captions and a different number of rows. `buildSignatureRows()` is
 * therefore the single projection of
 *
 *     WorkflowInstanceResponse.steps[]  (who OWNS each signature slot, in printed order)
 *   + WorkflowInstanceResponse.signatures[]  (who ACTUALLY signed, frozen server side)
 *
 * into one ordered row list. A step whose SignatureBlock is `None` never prints
 * (assignment / gate steps), and a step that has not been executed yet prints an EMPTY
 * cell instead of disappearing — which is what keeps the printed geometry identical to the
 * paper form before and after approval.
 *
 * THREE BINDING RULES (identical to WorkflowApiContracts.cs)
 *   (1) every USER id is a number (C# long); folder / instance / submission / expiry /
 *       notification ids are strings (C# Guid).
 *   (2) the SERVER is the authority. Nothing here re-derives canIAct / canIAssign /
 *       canISkip / canIAmend / canIDraft; the flags are only READ.
 *   (3) approval stamps are frozen in UTC server side, so every date printed by this file
 *       is rendered from the UTC instant verbatim — never converted to a local zone.
 *       Two approvers of the same form must never appear to have signed on different days.
 * =====================================================================================
 */

import {
  ApprovalStatus,
  RevisionTrigger,
  SignatureBlockType,
  WorkflowStepState,
  countsAsComplete,
  signatureCaption,
  type CompetencyMatrixRowResponse,
  type ExpiryItemResponse,
  type FolderProgressResponse,
  type FolderSummaryResponse,
  type FormSignatureResponse,
  type NotificationResponse,
  type RevisionResponse,
  type TableOfContentsItemResponse,
  type ToolEquivalencyRowResponse,
  type WorkflowInstanceResponse,
  type WorkflowStepResponse,
} from '@/lib/workflow/workflow-types'

// =====================================================================================
// 0. UTC DATE HELPERS  (never local time — see binding rule 3)
// =====================================================================================

function toUtcDate(value?: string | null): Date | null {
  if (!value) return null
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value}Z`
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "2026-08-28" — the printed date cell of every signature block and every table. */
export function utcDate(value?: string | null): string {
  const date = toUtcDate(value)
  return date ? date.toISOString().slice(0, 10) : ''
}

/** "2026-08-28 09:14 UTC" — tooltips and the audit trail. */
export function utcTimestamp(value?: string | null): string {
  const date = toUtcDate(value)
  if (!date) return ''
  const iso = date.toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

/** Whole days from `now` to `value`. Negative = already in the past. */
export function daysUntil(value?: string | null, now: Date = new Date()): number | null {
  const date = toUtcDate(value)
  if (!date) return null
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.ceil((date.getTime() - now.getTime()) / msPerDay)
}

/** "in 42 days" / "12 days overdue" / "today". */
export function dueLabel(value?: string | null, now: Date = new Date()): string {
  const days = daysUntil(value, now)
  if (days === null) return '—'
  if (days === 0) return 'today'
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`
  const overdue = Math.abs(days)
  return `${overdue} day${overdue === 1 ? '' : 's'} overdue`
}

// =====================================================================================
// 1. REQUIREMENT #13 — THE PRINTED SIGNATURE BLOCK
// =====================================================================================

/**
 * One printed signature cell. `WorkflowSignatureBlock.tsx` renders exactly this shape, so
 * a form file never touches steps or signatures itself.
 */
export interface PrintedSignatureRow {
  /** Stable React key: the step that OWNS the slot. */
  stepNo: number
  block: SignatureBlockType
  /** "Prepared by", "Reviewed by", "Approved by", "Endorsed by", ... */
  caption: string
  /** Printed role caption underneath the name ("Shop Team Leader"). Raw role value. */
  role: string
  /** Printed role label already resolved by the API when present. */
  roleLabel: string
  /** Empty until the step is executed. */
  personName: string
  /** C# long. 0 when the slot is still empty — never send 0 to an endpoint. */
  userId: number
  /** "2026-08-28" or empty. */
  date: string
  /** Full UTC instant for the tooltip. */
  signedAt: string
  /** Server integrity marker of the executed step. */
  signatureHash: string
  /** True once the step was executed and the stamp is frozen. */
  isSigned: boolean
  /** True when the step was skipped — the cell prints "Skipped", not a blank. */
  isSkipped: boolean
  /** Step title, used as the cell tooltip so the reader knows which routing step it is. */
  stepTitle: string
}

function signatureOfStep(
  signatures: FormSignatureResponse[] | undefined,
  step: WorkflowStepResponse,
): FormSignatureResponse | null {
  if (!signatures || signatures.length === 0) return null
  return (
    signatures.find(s => s.stepNo === step.stepNo) ??
    signatures.find(s => s.block === step.signatureBlock) ??
    null
  )
}

/**
 * THE projection of requirement #13. Deterministic, ordered by `stepNo`, so the printed
 * order of the block is the EXECUTION order of the chain — which is what the paper forms
 * show ("Prepared by" first, "Approved by" last).
 *
 * A step is included when it owns a signature slot (`signatureBlock !== None`). Assignment
 * and Gate steps are therefore silently excluded, and the block never grows a row that the
 * paper form does not have.
 */
export function buildSignatureRows(
  instance?: WorkflowInstanceResponse | null,
): PrintedSignatureRow[] {
  if (!instance) return []

  const steps = instance.steps ?? []
  const signatures = instance.signatures ?? []

  return steps
    .filter(step => step.signatureBlock !== SignatureBlockType.None)
    .slice()
    .sort((a, b) => a.stepNo - b.stepNo)
    .map<PrintedSignatureRow>(step => {
      const stamp = signatureOfStep(signatures, step)
      const executed =
        step.state === WorkflowStepState.Completed ||
        (!!stamp && !!stamp.signedAt && stamp.signedAt.trim() !== '')
      const skipped = step.isSkipped === true || step.state === WorkflowStepState.Skipped

      const rawUserId = stamp?.userId ?? step.actedByUserId ?? 0
      const userId = typeof rawUserId === 'number' && rawUserId > 0 ? rawUserId : 0
      const signedAt = stamp?.signedAt || step.actedAt || ''

      return {
        stepNo: step.stepNo,
        block: step.signatureBlock,
        caption: stamp?.caption || step.signatureCaption || signatureCaption(step.signatureBlock),
        role: stamp?.personRole || step.actedByRole || (step.eligibleRoles?.[0] ?? ''),
        roleLabel: stamp?.personRoleLabel || step.eligibleRoleLabels?.[0] || '',
        personName: executed ? stamp?.personName || step.actedByName || '' : '',
        userId: executed ? userId : 0,
        date: executed ? utcDate(signedAt) : '',
        signedAt: executed ? signedAt : '',
        signatureHash: stamp?.signatureHash ?? '',
        isSigned: executed && !skipped,
        isSkipped: skipped,
        stepTitle: step.title ?? '',
      }
    })
}

/** True when every printed slot carries a frozen stamp (or was legitimately skipped). */
export function signatureBlockComplete(rows: PrintedSignatureRow[]): boolean {
  if (rows.length === 0) return false
  return rows.every(row => row.isSigned || row.isSkipped)
}

/** "3 of 5 signatures applied" — the caption of the printed block header. */
export function signatureBlockProgress(rows: PrintedSignatureRow[]): string {
  const applied = rows.filter(row => row.isSigned).length
  return `${applied} of ${rows.length} signature${rows.length === 1 ? '' : 's'} applied`
}

// =====================================================================================
// 2. REQUIREMENT #10 — EXPIRY BUCKETS AND NOTIFICATION GROUPING
// =====================================================================================

/** Warning window used when the caller does not pass one. Mirrors the server default. */
export const EXPIRY_WARNING_DAYS = 30

export type ExpiryBucket = 'expired' | 'warning' | 'valid'

export const EXPIRY_BUCKET_LABELS: Record<ExpiryBucket, string> = {
  expired: 'Expired',
  warning: 'Expiring soon',
  valid: 'Valid',
}

/** Light background + dark text, never same-on-same (contrast rule). */
export const EXPIRY_BUCKET_CLASSES: Record<ExpiryBucket, string> = {
  expired: 'bg-red-100 text-red-900 border-red-300',
  warning: 'bg-amber-100 text-amber-900 border-amber-300',
  valid: 'bg-emerald-100 text-emerald-900 border-emerald-300',
}

/**
 * Prefers the SERVER facts (`isExpired`, `isInWarningWindow`) and only falls back to
 * `daysRemaining` / `expiresAt` when a cached row does not carry them.
 */
export function expiryBucketOf(
  item: ExpiryItemResponse,
  warningDays: number = EXPIRY_WARNING_DAYS,
  now: Date = new Date(),
): ExpiryBucket {
  if (item.isExpired) return 'expired'
  if (item.isInWarningWindow) return 'warning'

  const days =
    typeof item.daysRemaining === 'number' ? item.daysRemaining : daysUntil(item.expiresAt, now)
  if (days === null) return 'valid'
  if (days < 0) return 'expired'
  return days <= warningDays ? 'warning' : 'valid'
}

export interface ExpiryGroups {
  expired: ExpiryItemResponse[]
  warning: ExpiryItemResponse[]
  valid: ExpiryItemResponse[]
  /** expired + warning — everything the notification centre must surface. */
  actionable: ExpiryItemResponse[]
}

/** Sorted most-urgent-first inside every bucket. */
export function groupExpiries(
  items: ExpiryItemResponse[],
  warningDays: number = EXPIRY_WARNING_DAYS,
  now: Date = new Date(),
): ExpiryGroups {
  const groups: ExpiryGroups = { expired: [], warning: [], valid: [], actionable: [] }

  const byUrgency = (a: ExpiryItemResponse, b: ExpiryItemResponse) => {
    const left = toUtcDate(a.expiresAt)?.getTime() ?? Number.MAX_SAFE_INTEGER
    const right = toUtcDate(b.expiresAt)?.getTime() ?? Number.MAX_SAFE_INTEGER
    return left - right
  }

  for (const item of items) {
    groups[expiryBucketOf(item, warningDays, now)].push(item)
  }

  groups.expired.sort(byUrgency)
  groups.warning.sort(byUrgency)
  groups.valid.sort(byUrgency)
  groups.actionable = [...groups.expired, ...groups.warning]

  return groups
}

/** Human label of the tracked entity ("Training verification — Karim Nour"). */
export function expiryTitleOf(item: ExpiryItemResponse): string {
  const tracked = (item.trackedItem ?? '').trim()
  const entity = (item.entityType ?? '').trim()
  if (tracked && entity) return `${entity} — ${tracked}`
  return tracked || entity || 'Tracked item'
}

/** Notification centre grouping: unread first, then newest first. */
export function sortNotifications(items: NotificationResponse[]): NotificationResponse[] {
  return [...items].sort((a, b) => {
    if (a.isRead !== b.isRead) return a.isRead ? 1 : -1
    const left = toUtcDate(b.createdAt)?.getTime() ?? 0
    const right = toUtcDate(a.createdAt)?.getTime() ?? 0
    return left - right
  })
}

export function unreadCount(items: NotificationResponse[]): number {
  return items.reduce((total, item) => (item.isRead ? total : total + 1), 0)
}

/** Category -> Tailwind classes. Unknown categories fall back to slate. */
export const NOTIFICATION_CATEGORY_CLASSES: Record<string, string> = {
  Assignment: 'bg-violet-100 text-violet-900 border-violet-300',
  Approval: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  Rejection: 'bg-red-100 text-red-900 border-red-300',
  Expiry: 'bg-orange-100 text-orange-900 border-orange-300',
  Amendment: 'bg-sky-100 text-sky-900 border-sky-300',
  Revision: 'bg-indigo-100 text-indigo-900 border-indigo-300',
  Completion: 'bg-teal-100 text-teal-900 border-teal-300',
}

export function notificationCategoryClasses(category?: string | null): string {
  if (!category) return 'bg-slate-100 text-slate-800 border-slate-300'
  return (
    NOTIFICATION_CATEGORY_CLASSES[category] ?? 'bg-slate-100 text-slate-800 border-slate-300'
  )
}

// =====================================================================================
// 3. REQUIREMENT #11 — COMPLETION TRACKING AND THE PDF REPORT
// =====================================================================================

export interface CompletionSummary {
  totalItems: number
  approvedItems: number
  skippedItems: number
  pendingItems: number
  expiredItems: number
  /** Server value when present, otherwise recomputed. Always 0..100 integer. */
  completionPercent: number
  isComplete: boolean
  isLocked: boolean
  reportAvailable: boolean
  reportGeneratedAt: string
  /** Mandatory forms still blocking the final sign-off. */
  remainingItems: TableOfContentsItemResponse[]
  /** True when only ONE mandatory task is left — drives the "last approver" hint. */
  isLastTaskPending: boolean
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}

/** Normalises GET /api/evaluation-folders/{id}/progress into one render-ready shape. */
export function completionSummary(
  progress?: FolderProgressResponse | null,
): CompletionSummary {
  if (!progress) {
    return {
      totalItems: 0,
      approvedItems: 0,
      skippedItems: 0,
      pendingItems: 0,
      expiredItems: 0,
      completionPercent: 0,
      isComplete: false,
      isLocked: false,
      reportAvailable: false,
      reportGeneratedAt: '',
      remainingItems: [],
      isLastTaskPending: false,
    }
  }

  const total = progress.totalItems ?? 0
  const closed = (progress.approvedItems ?? 0) + (progress.skippedItems ?? 0)
  const percent =
    typeof progress.completionPercent === 'number' && progress.completionPercent > 0
      ? clampPercent(progress.completionPercent)
      : clampPercent(total > 0 ? (closed / total) * 100 : 0)

  const remaining = progress.remainingItems ?? []

  return {
    totalItems: total,
    approvedItems: progress.approvedItems ?? 0,
    skippedItems: progress.skippedItems ?? 0,
    pendingItems: progress.pendingItems ?? 0,
    expiredItems: progress.expiredItems ?? 0,
    completionPercent: percent,
    isComplete: progress.isComplete === true,
    isLocked: progress.isLocked === true,
    reportAvailable: progress.reportAvailable === true,
    reportGeneratedAt: progress.reportGeneratedAt ?? '',
    remainingItems: remaining,
    isLastTaskPending: remaining.length === 1,
  }
}

export interface RemainingSection {
  sectionCode: string
  sectionTitle: string
  sectionOrder: number
  items: TableOfContentsItemResponse[]
  /** Rows the CALLING user personally owns — rendered first with a "Your action" badge. */
  mineCount: number
}

/**
 * Groups the blocking items by Table of Contents section, in the printed ToC order, so the
 * progress dashboard reads like the folder itself instead of like a flat list.
 */
export function remainingBySection(
  items: TableOfContentsItemResponse[],
): RemainingSection[] {
  const map = new Map<string, RemainingSection>()

  for (const item of items) {
    const key = item.sectionCode || 'UNSECTIONED'
    const existing = map.get(key)
    if (existing) {
      existing.items.push(item)
      if (item.canIAct) existing.mineCount += 1
      continue
    }
    map.set(key, {
      sectionCode: key,
      sectionTitle: item.sectionTitle || key,
      sectionOrder: item.sectionOrder ?? Number.MAX_SAFE_INTEGER,
      items: [item],
      mineCount: item.canIAct ? 1 : 0,
    })
  }

  return Array.from(map.values())
    .sort((a, b) => a.sectionOrder - b.sectionOrder)
    .map(section => ({
      ...section,
      items: section.items
        .slice()
        .sort((a, b) => (a.itemOrder ?? 0) - (b.itemOrder ?? 0)),
    }))
}

/** Fallback file name when the API does not supply one. */
export function reportFileName(folder?: FolderSummaryResponse | null): string {
  const code = (folder?.folderCode || folder?.id || 'evaluation-folder').replace(
    /[^A-Za-z0-9._-]+/g,
    '-',
  )
  const revision = folder?.revisionNumber ? `-rev${folder.revisionNumber}` : ''
  return `${code}${revision}-self-evaluation.pdf`
}

/**
 * Opens the consolidated PDF. The URL ALWAYS comes from the API
 * (`FolderReportResponse.downloadUrl`, or `WORKFLOW_ROUTES.folderReport(folderId)`); a
 * storage path is never built here, mirroring the security invariant of signature-api.ts.
 */
export function triggerBrowserDownload(url: string, fileName?: string): void {
  if (typeof document === 'undefined' || !url) return
  const anchor = document.createElement('a')
  anchor.href = url
  if (fileName) anchor.download = fileName
  anchor.rel = 'noopener'
  anchor.target = '_blank'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

// =====================================================================================
// 4. REQUIREMENT #12 — TWO-YEAR REVISION CYCLE AND COMPETENCY MONITORING
// =====================================================================================

/** The standard cycle length of an evaluation folder. */
export const REVISION_CYCLE_MONTHS = 24

/** `from` + 24 months, as an ISO date string. */
export function twoYearDueDate(from?: string | null): string {
  const base = toUtcDate(from) ?? new Date()
  const due = new Date(base.getTime())
  due.setUTCMonth(due.getUTCMonth() + REVISION_CYCLE_MONTHS)
  return due.toISOString().slice(0, 10)
}

export type RevisionState = 'overdue' | 'due-soon' | 'current' | 'unknown'

export const REVISION_STATE_LABELS: Record<RevisionState, string> = {
  overdue: 'Revision overdue',
  'due-soon': 'Revision due soon',
  current: 'Within the two-year cycle',
  unknown: 'No revision due date recorded',
}

export const REVISION_STATE_CLASSES: Record<RevisionState, string> = {
  overdue: 'bg-red-100 text-red-900 border-red-300',
  'due-soon': 'bg-amber-100 text-amber-900 border-amber-300',
  current: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  unknown: 'bg-slate-100 text-slate-800 border-slate-300',
}

export function revisionState(
  folder?: FolderSummaryResponse | null,
  warningDays = 90,
  now: Date = new Date(),
): RevisionState {
  const days = daysUntil(folder?.revisionDueDate, now)
  if (days === null) return 'unknown'
  if (days < 0) return 'overdue'
  return days <= warningDays ? 'due-soon' : 'current'
}

/** Options rendered by the "Raise revision" form, in the order of requirement #12. */
export const REVISION_TRIGGER_OPTIONS: ReadonlyArray<{
  value: RevisionTrigger
  label: string
  /** What the operator must type into `triggerReference`. */
  referenceHint: string
}> = [
  {
    value: RevisionTrigger.TwoYearCycle,
    label: 'Standard two-year cycle',
    referenceHint: 'Cycle reference (optional)',
  },
  {
    value: RevisionTrigger.CmmRevised,
    label: 'CMM revised',
    referenceHint: 'CMM number and new revision, e.g. 25-21-05 Rev 14',
  },
  {
    value: RevisionTrigger.ComponentMaintenanceTaskRevised,
    label: 'Component Maintenance Task revised',
    referenceHint: 'Task reference',
  },
  {
    value: RevisionTrigger.TaskCardRevised,
    label: 'Task Card revised',
    referenceHint: 'Task Card number',
  },
  { value: RevisionTrigger.Manual, label: 'Raised manually', referenceHint: 'Justification reference' },
]

/** Newest revision first. */
export function sortRevisions(items: RevisionResponse[]): RevisionResponse[] {
  return [...items].sort((a, b) => (b.revisionNumber ?? 0) - (a.revisionNumber ?? 0))
}

export type CompetencyState = 'expired' | 'expiring' | 'eligible' | 'not-eligible' | 'unknown'

export const COMPETENCY_STATE_LABELS: Record<CompetencyState, string> = {
  expired: 'Training expired',
  expiring: 'Training expiring',
  eligible: 'Eligible',
  'not-eligible': 'Not eligible',
  unknown: 'No completion date',
}

export const COMPETENCY_STATE_CLASSES: Record<CompetencyState, string> = {
  expired: 'bg-red-100 text-red-900 border-red-300',
  expiring: 'bg-amber-100 text-amber-900 border-amber-300',
  eligible: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  'not-eligible': 'bg-slate-100 text-slate-800 border-slate-300',
  unknown: 'bg-slate-100 text-slate-800 border-slate-300',
}

/** Individual competency monitoring (training completion dates) of requirement #12. */
export function competencyState(
  row: CompetencyMatrixRowResponse,
  warningDays: number = EXPIRY_WARNING_DAYS,
  now: Date = new Date(),
): CompetencyState {
  if (row.isExpired) return 'expired'
  if (!row.trainingCompletedDate) return 'unknown'

  const days =
    typeof row.daysRemaining === 'number'
      ? row.daysRemaining
      : daysUntil(row.trainingExpiryDate, now)

  if (days !== null && days < 0) return 'expired'
  if (days !== null && days <= warningDays) return 'expiring'
  return row.isEligible ? 'eligible' : 'not-eligible'
}

export type CalibrationState = 'overdue' | 'due-soon' | 'in-calibration' | 'not-tracked'

export const CALIBRATION_STATE_LABELS: Record<CalibrationState, string> = {
  overdue: 'Calibration overdue',
  'due-soon': 'Calibration due soon',
  'in-calibration': 'In calibration',
  'not-tracked': 'No calibration tracked',
}

export const CALIBRATION_STATE_CLASSES: Record<CalibrationState, string> = {
  overdue: 'bg-red-100 text-red-900 border-red-300',
  'due-soon': 'bg-amber-100 text-amber-900 border-amber-300',
  'in-calibration': 'bg-emerald-100 text-emerald-900 border-emerald-300',
  'not-tracked': 'bg-slate-100 text-slate-800 border-slate-300',
}

/** Tool equivalency matrix monitoring of requirement #12. */
export function calibrationState(
  row: ToolEquivalencyRowResponse,
  warningDays: number = EXPIRY_WARNING_DAYS,
  now: Date = new Date(),
): CalibrationState {
  if (row.calibrationOverdue) return 'overdue'
  if (!row.calibrationDueDate) return 'not-tracked'
  const days = daysUntil(row.calibrationDueDate, now)
  if (days === null) return 'not-tracked'
  if (days < 0) return 'overdue'
  return days <= warningDays ? 'due-soon' : 'in-calibration'
}

// =====================================================================================
// 5. REQUIREMENT #14 — THE FINAL SIGN-OFF CHAIN AND THE LOCK
// =====================================================================================

export interface SignOffChainStep {
  stepNo: number
  title: string
  /** Raw role of the tier that owns the step. */
  role: string
  roleLabel: string
  state: WorkflowStepState
  stateLabel: string
  personName: string
  date: string
  /** True for the step the folder is waiting on right now. */
  isCurrent: boolean
  /** Server flag — never recomputed. */
  canIAct: boolean
}

/**
 * The role hierarchy of the folder sign-off instance, in execution order, so the panel can
 * render "Shop Team Leader -> Manager -> Director" as a timeline and highlight the tier the
 * folder is waiting on.
 */
export function signOffChainOf(
  instance?: WorkflowInstanceResponse | null,
): SignOffChainStep[] {
  if (!instance) return []
  return (instance.steps ?? [])
    .slice()
    .sort((a, b) => a.stepNo - b.stepNo)
    .map<SignOffChainStep>(step => ({
      stepNo: step.stepNo,
      title: step.title ?? '',
      role: step.assignedToRole || step.actedByRole || (step.eligibleRoles?.[0] ?? ''),
      roleLabel: step.eligibleRoleLabels?.[0] ?? '',
      state: step.state,
      stateLabel: step.stateLabel ?? '',
      personName: step.actedByName || step.assignedToName || '',
      date: utcDate(step.actedAt),
      isCurrent: step.stepNo === instance.currentStepNo,
      canIAct: step.canIAct === true,
    }))
}

export type FolderLockState = 'open' | 'awaiting-sign-off' | 'completed' | 'locked'

export const FOLDER_LOCK_LABELS: Record<FolderLockState, string> = {
  open: 'Open — tasks still pending',
  'awaiting-sign-off': 'Awaiting final sign-off',
  completed: 'Completed',
  locked: 'Completed and locked',
}

export const FOLDER_LOCK_CLASSES: Record<FolderLockState, string> = {
  open: 'bg-amber-100 text-amber-900 border-amber-300',
  'awaiting-sign-off': 'bg-violet-100 text-violet-900 border-violet-300',
  completed: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  locked: 'bg-slate-200 text-slate-900 border-slate-400',
}

/**
 * Requirement #14: the folder is locked ONLY after the whole role hierarchy has signed.
 * The lock is what makes an amendment (#10) or a revision (#12) the only way to change data.
 */
export function folderLockState(
  folder?: FolderSummaryResponse | null,
  progress?: FolderProgressResponse | null,
): FolderLockState {
  if (folder?.isLocked || progress?.isLocked) return 'locked'
  if (folder?.status === ApprovalStatus.Locked) return 'locked'
  if (folder?.isComplete || progress?.isComplete || folder?.status === ApprovalStatus.Completed) {
    return 'completed'
  }

  const summary = completionSummary(progress)
  const mandatoryClosed = summary.totalItems > 0 && summary.remainingItems.length === 0
  if (mandatoryClosed || folder?.status === ApprovalStatus.PendingFinalSignOff) {
    return 'awaiting-sign-off'
  }
  return 'open'
}

/**
 * The one gate the final sign-off button must respect BEFORE a request is sent, so the user
 * never sees MANDATORY_FORMS_PENDING as a surprise toast.
 */
export function signOffBlockers(
  progress?: FolderProgressResponse | null,
): { blocked: boolean; reason: string } {
  const summary = completionSummary(progress)

  if (summary.isLocked) {
    return { blocked: true, reason: 'The folder is already signed off and locked.' }
  }
  if (summary.totalItems === 0) {
    return { blocked: true, reason: 'The Table of Contents has not been generated yet.' }
  }
  if (summary.remainingItems.length > 0) {
    const count = summary.remainingItems.length
    return {
      blocked: true,
      reason: `${count} mandatory form${count === 1 ? '' : 's'} still open, so the folder cannot be signed off.`,
    }
  }
  if (summary.expiredItems > 0) {
    return {
      blocked: true,
      reason: `${summary.expiredItems} tracked item${summary.expiredItems === 1 ? '' : 's'} expired and must be amended first.`,
    }
  }
  return { blocked: false, reason: '' }
}

/** Progress-bar width class-free helper (inline style is used, so no arbitrary class). */
export function percentWidth(percent: number): string {
  return `${clampPercent(percent)}%`
}

/** Counts every closed Table of Contents row the same way the server does. */
export function closedItemCount(items: TableOfContentsItemResponse[]): number {
  return items.reduce((total, item) => (countsAsComplete(item.status) ? total + 1 : total), 0)
}