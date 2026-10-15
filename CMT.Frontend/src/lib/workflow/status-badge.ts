/**
 * =====================================================================================
 * STANDARDIZED STATUS BADGE VOCABULARY — Table of Contents
 * CMT.Frontend/src/lib/workflow/status-badge.ts                              (NEW FILE)
 *
 * WHAT THIS FILE IS
 * -----------------
 * ONE standardized, color-coded status badge per Table-of-Contents form row, replacing the
 * previous coarse six-bucket lifecycle label. Every raw ApprovalStatus of workflow-types.ts
 * collapses into ONE of NINE standardized badges, and every badge is painted with the SAME
 * 6-tone corporate palette already defined there (STATUS_BADGE_TONE_CLASSES:
 * grey / amber / green / sky / red / orange):
 *
 *   Draft                    -> grey   (StatusBadgeTone.Neutral)
 *   Pending (any step)       -> amber  (StatusBadgeTone.InProgress)
 *   Approved                 -> green  (StatusBadgeTone.Success)
 *   Completed and locked     -> green  (StatusBadgeTone.Success)
 *   Rejected                 -> red    (StatusBadgeTone.Danger)
 *   Returned for correction  -> red    (StatusBadgeTone.Danger)
 *   Revoked                  -> red    (StatusBadgeTone.Danger)
 *   Expired                  -> orange (StatusBadgeTone.Expired)
 *   Skipped                  -> sky    (StatusBadgeTone.Muted)
 *
 * TWO SPECIAL ROWS never render an approval badge:
 *   CMM REV. STATUS (capability_self_evaluation) and TASK CARD (task_card) are integrated
 *   from an external system and do not go through the approval workflow; they render the
 *   distinct neutral "External source · No approval required" badge instead.
 *
 * The file also derives the two follow-up aggregates the ToC renders:
 *   - the standardized per-status counters of a section (tally + compact chips,
 *     e.g. "2 pending · 1 rejected · 4 approved"), and
 *   - the PRIMARY BLOCKING ROLE (which role is causing the hold-up), counted over the
 *     pending rows from the server-supplied step title / status label.
 *
 * NO JSX, NO hooks, NO fetch — safe in a Server or Client Component and unit-testable.
 * The server status / statusLabel remain the authority; this layer only standardizes
 * the vocabulary and the colour.
 * =====================================================================================
 */

import {
  ApprovalStatus,
  STATUS_BADGE_TONE_CLASSES,
  StatusBadgeTone,
  type TableOfContentsItemResponse,
} from '@/lib/workflow/workflow-types'

// =====================================================================================
// 1. THE STANDARDIZED BADGE VOCABULARY
// =====================================================================================

export type StandardStatusKey =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'returned'
  | 'revoked'
  | 'expired'
  | 'skipped'
  | 'completed_locked'
  /** A form the folder has not started yet (no API row / no workflow instance). */
  | 'not_started'
  /** An external-source row: never carries an approval status. */
  | 'external'

export interface StandardStatusBadge {
  key: StandardStatusKey
  /** The standardized label. ONE badge per row, ONE clear meaning. */
  label: string
  tone: StatusBadgeTone
  /** Tailwind classes straight from STATUS_BADGE_TONE_CLASSES — the corporate palette. */
  classes: string
  /** Attention bucket: rejected / returned / revoked / expired (drives "Needs attention"). */
  isAttention: boolean
  /** Counts towards folder completion (approved / completed_locked / skipped / external). */
  countsAsClosed: boolean
}

const TONE_OF_KEY: Record<StandardStatusKey, StatusBadgeTone> = {
  draft: StatusBadgeTone.Neutral,
  pending: StatusBadgeTone.InProgress,
  approved: StatusBadgeTone.Success,
  rejected: StatusBadgeTone.Danger,
  returned: StatusBadgeTone.Danger,
  revoked: StatusBadgeTone.Danger,
  expired: StatusBadgeTone.Expired,
  skipped: StatusBadgeTone.Muted,
  completed_locked: StatusBadgeTone.Success,
  not_started: StatusBadgeTone.Neutral,
  external: StatusBadgeTone.Neutral,
}

const LABEL_OF_KEY: Record<StandardStatusKey, string> = {
  draft: 'Draft',
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  returned: 'Returned for correction',
  revoked: 'Revoked',
  expired: 'Expired',
  skipped: 'Skipped',
  completed_locked: 'Completed & locked',
  not_started: 'Not started',
  external: 'External source · No approval required',
}

/** Compact labels for the section counter chips ("2 pending · 1 rejected · 4 approved"). */
const SHORT_LABEL_OF_KEY: Record<StandardStatusKey, string> = {
  draft: 'draft',
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
  returned: 'returned',
  revoked: 'revoked',
  expired: 'expired',
  skipped: 'skipped',
  completed_locked: 'completed & locked',
  not_started: 'not started',
  external: 'external',
}

const ATTENTION_KEYS: ReadonlySet<StandardStatusKey> = new Set([
  'rejected',
  'returned',
  'revoked',
  'expired',
])

const CLOSED_KEYS: ReadonlySet<StandardStatusKey> = new Set([
  'approved',
  'completed_locked',
  'skipped',
  'external',
])

/** The standardized badge of a key, painted with the corporate 6-tone palette. */
export function badgeFor(key: StandardStatusKey): StandardStatusBadge {
  const tone = TONE_OF_KEY[key]
  return {
    key,
    label: LABEL_OF_KEY[key],
    tone,
    classes: STATUS_BADGE_TONE_CLASSES[tone],
    isAttention: ATTENTION_KEYS.has(key),
    countsAsClosed: CLOSED_KEYS.has(key),
  }
}

/** Collapse ONE raw ApprovalStatus into its standardized badge key. */
export function standardStatusKeyOfStatus(
  status: ApprovalStatus | null | undefined,
): StandardStatusKey {
  if (status === null || status === undefined) return 'not_started'
  switch (status) {
    case ApprovalStatus.Draft:
      return 'draft'
    case ApprovalStatus.Approved:
      return 'approved'
    case ApprovalStatus.Rejected:
      return 'rejected'
    case ApprovalStatus.Returned:
      return 'returned'
    case ApprovalStatus.Revoked:
      return 'revoked'
    case ApprovalStatus.Expired:
      return 'expired'
    case ApprovalStatus.Skipped:
      return 'skipped'
    case ApprovalStatus.Completed:
    case ApprovalStatus.Locked:
      return 'completed_locked'
    default:
      // Every Pending* status of the 33-value enum funnels into ONE amber badge.
      return 'pending'
  }
}

/**
 * The standardized badge of ONE Table-of-Contents row.
 * isExpired overrides the raw status, because an approved form whose validity lapsed
 * must print as Expired (same rule as the lifecycle projection).
 */
export function standardStatusBadgeOf(
  row: TableOfContentsItemResponse | null | undefined,
): StandardStatusBadge {
  if (!row) return badgeFor('not_started')
  if (isExternalSourceFormType(row.formType)) return badgeFor('external')
  if (row.isExpired === true) return badgeFor('expired')
  return badgeFor(standardStatusKeyOfStatus(row.status))
}

// =====================================================================================
// 2. EXTERNAL-SOURCE HANDLING (DOCUMENTATION: CMM REV. STATUS + TASK CARD)
// =====================================================================================

/**
 * Form types integrated from an external system — no approval workflow, ever.
 * The raw status of these rows mirrors the source system and MUST NOT be rendered as
 * an approval / rejection state.
 */
export const EXTERNAL_SOURCE_FORM_TYPES: ReadonlySet<string> = new Set([
  'capability_self_evaluation', // CMM REV. STATUS (CMM proxy integration)
  'task_card', // TASK CARD (external task-card integration)
])

export function isExternalSourceFormType(formType?: string | null): boolean {
  return EXTERNAL_SOURCE_FORM_TYPES.has(String(formType ?? '').trim().toLowerCase())
}

/** Distinct neutral style of the external badge — grey family, dashed border. */
export const EXTERNAL_SOURCE_BADGE_CLASSES =
  'border-slate-300 border-dashed bg-slate-50 text-slate-600'

// =====================================================================================
// 3. SECTION-LEVEL STANDARDIZED COUNTERS
// =====================================================================================

export interface StandardStatusTally {
  total: number
  draft: number
  pending: number
  approved: number
  rejected: number
  returned: number
  revoked: number
  expired: number
  skipped: number
  completedLocked: number
  notStarted: number
  external: number
}

function emptyTally(): StandardStatusTally {
  return {
    total: 0,
    draft: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    returned: 0,
    revoked: 0,
    expired: 0,
    skipped: 0,
    completedLocked: 0,
    notStarted: 0,
    external: 0,
  }
}

/** Standardized per-status counters of any row list (a section, or the whole folder). */
export function standardTallyOf(
  rows: Array<TableOfContentsItemResponse | null | undefined>,
): StandardStatusTally {
  const tally = emptyTally()
  for (const row of rows) {
    tally.total += 1
    const key = standardStatusBadgeOf(row).key
    if (key === 'draft') tally.draft += 1
    else if (key === 'pending') tally.pending += 1
    else if (key === 'approved') tally.approved += 1
    else if (key === 'rejected') tally.rejected += 1
    else if (key === 'returned') tally.returned += 1
    else if (key === 'revoked') tally.revoked += 1
    else if (key === 'expired') tally.expired += 1
    else if (key === 'skipped') tally.skipped += 1
    else if (key === 'completed_locked') tally.completedLocked += 1
    else if (key === 'not_started') tally.notStarted += 1
    else if (key === 'external') tally.external += 1
  }
  return tally
}

export interface StandardTallyChip {
  key: StandardStatusKey
  label: string
  count: number
  classes: string
}

/** Chip order: what needs chasing first, then progress, then informational buckets. */
const CHIP_ORDER: StandardStatusKey[] = [
  'pending',
  'rejected',
  'returned',
  'revoked',
  'expired',
  'draft',
  'approved',
  'completed_locked',
  'skipped',
  'not_started',
]

/**
 * Compact per-status count chips of ONE tally, e.g.
 * "2 pending · 1 rejected · 4 approved". Empty buckets are dropped so the header stays
 * calm; the "closed" buckets (approved + completed_locked) are merged into ONE chip.
 */
export function chipsOfTally(tally: StandardStatusTally): StandardTallyChip[] {
  const closed = tally.approved + tally.completedLocked
  const chips: StandardTallyChip[] = []

  for (const key of CHIP_ORDER) {
    let count = 0
    if (key === 'draft') count = tally.draft
    else if (key === 'pending') count = tally.pending
    else if (key === 'approved') count = closed
    else if (key === 'rejected') count = tally.rejected
    else if (key === 'returned') count = tally.returned
    else if (key === 'revoked') count = tally.revoked
    else if (key === 'expired') count = tally.expired
    else if (key === 'skipped') count = tally.skipped
    else if (key === 'not_started') count = tally.notStarted

    if (count > 0) {
      chips.push({
        key,
        label: SHORT_LABEL_OF_KEY[key],
        count,
        classes: badgeFor(key).classes,
      })
    }
  }

  return chips
}

// =====================================================================================
// 4. APPROVER VISIBILITY + FOLLOW-UP LABELS PER PENDING ROW
// =====================================================================================

/**
 * "Pending Manager approval — Nour Adel"
 * Built from the SERVER label (statusLabel) plus the server assignee name — never from a
 * local status-to-text copy, so a new backend step keeps rendering correctly.
 */
export function pendingStepLabelOf(row: TableOfContentsItemResponse): string {
  const base = (row.statusLabel ?? '').trim() || 'Pending'
  const assignee = (row.currentAssigneeName ?? '').trim()
  return assignee ? `${base} — ${assignee}` : base
}

/** "3 / 7 steps", or an empty string when the server does not report step counts. */
export function stepProgressLabelOf(row: TableOfContentsItemResponse): string {
  const total = row.totalSteps ?? 0
  if (total <= 0) return ''
  const done = Math.min(row.completedSteps ?? 0, total)
  return `${done} / ${total} steps`
}

/** Step progress 0..100 for the mini bar on a pending row. */
export function stepProgressPercentOf(row: TableOfContentsItemResponse): number {
  const total = row.totalSteps ?? 0
  if (total <= 0) return 0
  const done = Math.min(row.completedSteps ?? 0, total)
  return Math.round((done / total) * 100)
}

/**
 * Standardized badge key of a row for the MINI PROGRESS BAR fill. Kept separate from
 * `standardStatusBadgeOf` so the bar colour can fall back to the pending tone even when
 * the badge itself is suppressed (e.g. an external-source row is never rendered with a bar).
 */
export function stepProgressToneKeyOf(
  row: TableOfContentsItemResponse | null | undefined,
): StandardStatusKey {
  if (!row) return 'not_started'
  if (isExternalSourceFormType(row.formType)) return 'external'
  if (row.isExpired === true) return 'expired'
  return standardStatusKeyOfStatus(row.status)
}

// =====================================================================================
// 5. THE PRIMARY BLOCKING ROLE (overall follow-up header)
// =====================================================================================

export interface BlockingRoleStats {
  /** The role label that holds the most pending steps, e.g. "Manager". */
  role: string
  /** How many pending rows wait on that role. */
  count: number
  /** Total pending rows. */
  pendingCount: number
  /** "Manager approval holds up 3 of 5 pending forms" (empty when nothing is pending). */
  label: string
}

const BLOCKING_STEP_HINTS: ReadonlyArray<{ pattern: RegExp; role: string }> = [
  { pattern: /\bfinal sign[- ]?off\b/i, role: 'Director' },
  { pattern: /\bdirector\b/i, role: 'Director' },
  { pattern: /\bqa\b/i, role: 'QA' },
  { pattern: /\bmanager\b/i, role: 'Manager' },
  { pattern: /\bshop manager\b/i, role: 'Shop Manager' },
  { pattern: /\bteam leader\b|\bstl\b/i, role: 'Shop Team Leader' },
  { pattern: /\bengineer\b/i, role: 'Engineer' },
  { pattern: /\bhr\b/i, role: 'HR' },
  { pattern: /\bdocumentation\b/i, role: 'Documentation Team' },
  { pattern: /\binspector\b/i, role: 'Inspector' },
  { pattern: /\btechnician\b/i, role: 'Technician' },
  { pattern: /\becaa\b|\bcaa\b/i, role: 'ECAA' },
  { pattern: /\bcertifying staff\b/i, role: 'Certifying Staff' },
  { pattern: /\brequester\b/i, role: 'Requester' },
  { pattern: /\bspecial team leader\b/i, role: 'Special Team Leader' },
]

/** Role that the current step title / status label of ONE pending row points at. */
function blockingRoleOfRow(row: TableOfContentsItemResponse): string {
  const haystack = `${row.currentStepTitle ?? ''} ${row.statusLabel ?? ''}`
  for (const hint of BLOCKING_STEP_HINTS) {
    if (hint.pattern.test(haystack)) return hint.role
  }
  return 'Unassigned'
}

/**
 * The PRIMARY blocking role: the role that holds the most pending steps right now.
 * Derived purely from the server labels of the pending rows — no local status copy.
 */
export function primaryBlockingRoleOf(
  rows: Array<TableOfContentsItemResponse | null | undefined>,
): BlockingRoleStats {
  const pending: TableOfContentsItemResponse[] = []
  const counts = new Map<string, number>()

  for (const row of rows) {
    if (!row) continue
    const key = standardStatusBadgeOf(row).key
    if (key !== 'pending') continue
    pending.push(row)
    const role = blockingRoleOfRow(row)
    counts.set(role, (counts.get(role) ?? 0) + 1)
  }

  let role = ''
  let count = 0
  for (const [candidateRole, candidateCount] of counts) {
    if (candidateCount > count) {
      role = candidateRole
      count = candidateCount
    }
  }

  return {
    role,
    count,
    pendingCount: pending.length,
    label:
      pending.length === 0
        ? ''
        : role
          ? `${role} approval holds up ${count} of ${pending.length} pending form${pending.length === 1 ? '' : 's'}`
          : `Assign ${pending.length} pending form${pending.length === 1 ? '' : 's'}`,
  }
}

// =====================================================================================
// 6. FOLLOW-UP BUCKETS  ("My pending actions" / "Needs attention")
// =====================================================================================

/** Forms whose pending step is owned by the calling user (server flag — never re-derived). */
export function myPendingActionsOf(
  rows: Array<TableOfContentsItemResponse | null | undefined>,
): TableOfContentsItemResponse[] {
  return rows.filter(
    (row): row is TableOfContentsItemResponse => row != null && row.canIAct === true,
  )
}

/** Rejected / returned / revoked / expired rows the originator must act on. */
export function needsAttentionOf(
  rows: Array<TableOfContentsItemResponse | null | undefined>,
): TableOfContentsItemResponse[] {
  return rows.filter(
    (row): row is TableOfContentsItemResponse =>
      row != null && standardStatusBadgeOf(row).isAttention,
  )
}

/** Remaining approvals = pending + attention rows still open. */
export function remainingApprovalsOf(
  rows: Array<TableOfContentsItemResponse | null | undefined>,
): number {
  return rows.filter(row => {
    if (!row) return false
    const key = standardStatusBadgeOf(row).key
    return key === 'pending' || standardStatusBadgeOf(row).isAttention
  }).length
}