/**
 * =====================================================================================
 * AMENDED v28 — ITEM 14 / DELIVERABLE 2: THE AUTOMATIC NAME / DATE / SIGNATURE LAYER
 * Copy to: CMT.Frontend/src/lib/workflow/signature-blocks.ts   (REPLACES the v22 file)
 *
 * WHAT v22 GOT RIGHT (kept, byte for byte where possible)
 * ------------------------------------------------------
 *   - the PURE, NON-REACT projection of one WorkflowInstanceResponse into printed rows;
 *   - the frozen `signatures[]` stamp winning over `steps[]`;
 *   - a missing specimen NEVER being an error;
 *   - user ids as NUMBERS (C# long), entity ids as STRINGS (C# Guid);
 *   - role-matrix matching so two "Approved by:" lines never swap;
 *   - the FIXED matrix role title always printed under the name rule.
 *
 * THE ONE DEFECT v28 FIXES — AND IT IS THE REPORTED ONE
 * ----------------------------------------------------
 * You reported, correctly:
 *
 *   "The chain matrix -> blocks -> print -> cell/line -> SignatureBlock is internally sound,
 *    but nothing in it ever reads the logged-in user — every printed value depends on an
 *    already-executed workflow step, so 'Prepared By / Approved By' stay blank exactly."
 *
 * That is precisely the state of v22. `rowFromStep()` reads `step.actedByName` /
 * `stamp.personName`; `rowsForForm()` reads nothing else. So:
 *
 *   - a Shop Team Leader who OPENS MNT-1229B is the PREPARER of that sheet, but until the
 *     server records his draft step his "prepared  By:" line has no name, no date and no
 *     specimen  ->  the blank block of "TNA SYSTEM.png";
 *   - a Manager who opens the same sheet sees his own "Approved by:" line blank too;
 *   - requirement 14 asks for the opposite: "populate the 'Prepared By', 'Approved By' etc
 *     fields with the logged-in user's information".
 *
 * v28 therefore introduces a SECOND, CLEARLY SUBORDINATE source of facts:
 *
 *      current-signer.ts (the logged-in user)  ->  PrintedSignatureState.SelfFill
 *      workflow instance (steps + signatures)  ->  Signed / Pending / Skipped / Returned
 *
 * and a strict precedence: THE SERVER ALWAYS WINS. The moment the step is executed the frozen
 * stamp overwrites the provisional value, and the printed line becomes the legal record.
 *
 * FIVE HARD RULES OF THE PROVISIONAL FILL
 *   (1) IT IS A PREVIEW, NEVER A LEGAL STAMP. State is `SelfFill` (5), `isProvisional` is
 *       true, `isSigned` stays FALSE, and `signatureProgress()` never counts it as settled.
 *   (2) IT IS ROLE-GATED, NEVER POSITIONAL. A signer only fills a line whose
 *       `slot.expectedRoles` contains his canonical role. An STL can therefore never appear
 *       on "Mgr. Componenet Shop", and a Manager never on
 *       "TL. Component Engineering Support".
 *   (3) ONE LINE PER SIGNER. Only the FIRST eligible line is filled. MNT-1378 routes both
 *       "Reviewed By:" and "Approved By:" to the Inspector role; pre-stamping both would
 *       fake an approval that was never granted.
 *   (4) NEVER OVER A SETTLED LINE. Signed / Skipped / Returned lines are untouchable.
 *   (5) NEVER ON THE DEFAULT CHAIN. When `slot.expectedRoles` is empty the matrix cannot
 *       vouch for the line, so nothing is filled — a blank hard copy is always safer than a
 *       guessed name.
 *
 * WHY THE SIGNER ARRIVES AS A STRUCTURAL INTERFACE
 *   `current-signer.ts` is a `'use client'` React module. Importing it here would drag React
 *   and the auth context into the pure layer and rebuild exactly the circular-import defect
 *   documented in `workflow-types.ts` (AMENDMENT 1). `ProvisionalSignerLike` below is
 *   structurally identical to `ProvisionalSigner`, so `useCurrentSigner()` output is passed
 *   straight in with no adapter, and the folder PDF exporter can pass a plain object.
 *
 * BACKWARD COMPATIBILITY
 *   Every new parameter is the LAST one and OPTIONAL. `rowsForForm(formType, instance)`,
 *   `linesForForm(...)` and `autoFillLegacyRows(...)` keep their v22 behaviour when no signer
 *   is supplied, so no call site breaks while you roll the change out.
 * =====================================================================================
 */

import { normalizeRole, roleLabel, type OrgRole } from '@/lib/role-hierarchy'
import {
  SIGNATURE_BLOCK_ORDER,
  SIGNATURE_CAPTIONS,
  SignatureBlockType,
  WorkflowStepAction,
  WorkflowStepState,
  type FormSignatureResponse,
  type WorkflowInstanceResponse,
  type WorkflowStepResponse,
} from '@/lib/workflow/workflow-types'
import { formatSignatureDate, formatSignatureTimestamp } from '@/lib/workflow/signature-render'
import {
  SLOT_CAPTION_ALIASES,
  dateCaptionOfSlot,
  formSignatureConfig,
  geometryFor,
  roleCaptionOfSlot,
  signatureCaptionOfSlot,
  signatureSlotsFor,
  slotAcceptsAnyRole,
  slotAcceptsRole,
  type SignatureLineGeometry,
  type SignaturePrintStyle,
  type SignatureSlotDefinition,
} from '@/lib/workflow/signature-matrix'

// =====================================================================================
// 1. PRINTED STATE OF ONE SIGNATURE CELL
// =====================================================================================

export enum PrintedSignatureState {
  /** Step not reached: print the empty rule exactly like the unsigned hard copy. */
  Blank = 0,
  /** Step active / awaiting assignment: print who it waits for, in amber. */
  Pending = 1,
  /** Step executed: print name + role + date + specimen. THE LEGAL RECORD. */
  Signed = 2,
  /** Skip logic consumed the step. */
  Skipped = 3,
  /** Rejected / returned at this step. */
  Returned = 4,
  /**
   * AMENDED v28 — the line belongs to the LOGGED-IN USER by role and has not been executed
   * yet, so his name, today's UTC date and his specimen are printed PROVISIONALLY.
   *
   * Deliberately a NEW value (5) rather than a reuse of `Pending`:
   *   - `Pending` means "the server is waiting for somebody", and the cell prints
     *     "Awaiting <person>" — a completely different fact;
   *   - the numeric values 0..4 are already persisted in screenshots, tests and exports, so
   *     appending keeps every existing switch statement valid.
   */
  SelfFill = 5,
}

export const PRINTED_SIGNATURE_STATE_LABELS: Record<PrintedSignatureState, string> = {
  [PrintedSignatureState.Blank]: 'Not signed',
  [PrintedSignatureState.Pending]: 'Awaiting signature',
  [PrintedSignatureState.Signed]: 'Signed',
  [PrintedSignatureState.Skipped]: 'Skipped',
  [PrintedSignatureState.Returned]: 'Returned',
  [PrintedSignatureState.SelfFill]: 'To be signed by you',
}

/** Contrast-safe badges: dark text on a light background, never text on the same hue. */
export const PRINTED_SIGNATURE_STATE_CLASSES: Record<PrintedSignatureState, string> = {
  [PrintedSignatureState.Blank]: 'bg-slate-100 text-slate-700 border-slate-300',
  [PrintedSignatureState.Pending]: 'bg-amber-100 text-amber-900 border-amber-300',
  [PrintedSignatureState.Signed]: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  [PrintedSignatureState.Skipped]: 'bg-sky-100 text-sky-900 border-sky-300',
  [PrintedSignatureState.Returned]: 'bg-red-100 text-red-900 border-red-300',
  [PrintedSignatureState.SelfFill]: 'bg-indigo-100 text-indigo-900 border-indigo-300',
}

export function printedSignatureStateLabel(state?: PrintedSignatureState | null): string {
  if (state === undefined || state === null) {
    return PRINTED_SIGNATURE_STATE_LABELS[PrintedSignatureState.Blank]
  }
  return (
    PRINTED_SIGNATURE_STATE_LABELS[state] ??
    PRINTED_SIGNATURE_STATE_LABELS[PrintedSignatureState.Blank]
  )
}

export function printedSignatureStateClasses(state?: PrintedSignatureState | null): string {
  if (state === undefined || state === null) {
    return PRINTED_SIGNATURE_STATE_CLASSES[PrintedSignatureState.Blank]
  }
  return (
    PRINTED_SIGNATURE_STATE_CLASSES[state] ??
    PRINTED_SIGNATURE_STATE_CLASSES[PrintedSignatureState.Blank]
  )
}

// =====================================================================================
// 2. THE LOGGED-IN SIGNER, AS THE PURE LAYER SEES HIM   (AMENDED v28)
// =====================================================================================

/**
 * Structural mirror of `ProvisionalSigner` (current-signer.ts). Declared here so this module
 * stays React-free and importable by the folder PDF exporter and by unit tests.
 *
 * `canonicalRole` is the ONLY field used for matching. When it is null NOTHING is filled.
 */
export interface ProvisionalSignerLike {
  userId: number | null
  personName: string
  personRole: string
  canonicalRole: OrgRole | null
  personRoleLabel: string
  /** "YYYY-MM-DD" in UTC — identical in shape to a frozen server stamp. */
  today: string
  shopId?: string | null
  isResolved: boolean
}

/** True when the signer carries enough information to be printed on a rule. */
export function isUsableSigner(
  signer?: ProvisionalSignerLike | null,
): signer is ProvisionalSignerLike {
  return (
    !!signer &&
    signer.isResolved === true &&
    !!signer.canonicalRole &&
    !!(signer.personName ?? '').trim()
  )
}

// =====================================================================================
// 3. THE PRINTED ROW
// =====================================================================================

export interface PrintedSignatureRow {
  block: SignatureBlockType
  /** Caption to PRINT. The matrix (paper) caption wins — see `serverCaption`. */
  caption: string
  /** The catalog caption of the step, kept for tooltips / audit only. */
  serverCaption: string
  /** Owning step, so two "Approved by" lines never collide. */
  stepNo: number
  stepTitle: string

  /**
   * The FIXED role line printed UNDER the name rule — the POSITION the form is signed in,
   * pre-printed on the paper. NEVER the signer's own job title.
   */
  roleCaption: string

  /** C# long. The specimen lookup key. */
  userId: number | null
  /** Assigned user of the active workflow step, when the server has assigned one. */
  assignedToUserId: number | null
  personName: string
  personRole: string
  /** roleLabel(personRole) — TOOLTIPS / AUDIT ONLY, never the printed role line. */
  personRoleLabel: string

  /** Canonical roles the step is open to, for safe slot matching. */
  eligibleRoles: OrgRole[]
  /** Human list of those roles, e.g. "Shop Team Leader / Engineer". */
  eligibleRoleCaption: string

  /** "YYYY-MM-DD", UTC. Frozen server side when signed, today's UTC when provisional. */
  date: string
  /** "YYYY-MM-DD HH:mm UTC" for tooltips and the audit trail. */
  timestamp: string

  signatureHash: string

  state: PrintedSignatureState
  stateLabel: string

  isSigned: boolean
  isPending: boolean
  isSkipped: boolean
  isReturned: boolean
  /**
   * AMENDED v28 — true when the name / date / specimen come from the LOGGED-IN USER and not
   * from an executed step. Such a row is a PREVIEW: it is never counted as a signature and
   * is overwritten the instant the server records the real step.
   */
  isProvisional: boolean

  awaitingName: string
  awaitingUnit: string

  comments: string

  wasDelegated: boolean
  delegationReason: string
  skipReason: string

  /** True when the row came from a frozen stamp with no surviving step. */
  fromFrozenStamp: boolean
}

/** A blank row: the form prints a caption the instance has no step for. */
export function emptySignatureRow(
  block: SignatureBlockType,
  caption?: string,
  roleCaption = '',
): PrintedSignatureRow {
  return {
    block,
    caption: caption || SIGNATURE_CAPTIONS[block] || '',
    serverCaption: '',
    stepNo: 0,
    stepTitle: '',
    roleCaption,
    userId: null,
    assignedToUserId: null,
    personName: '',
    personRole: '',
    personRoleLabel: '',
    eligibleRoles: [],
    eligibleRoleCaption: '',
    date: '',
    timestamp: '',
    signatureHash: '',
    state: PrintedSignatureState.Blank,
    stateLabel: PRINTED_SIGNATURE_STATE_LABELS[PrintedSignatureState.Blank],
    isSigned: false,
    isPending: false,
    isSkipped: false,
    isReturned: false,
    isProvisional: false,
    awaitingName: '',
    awaitingUnit: '',
    comments: '',
    wasDelegated: false,
    delegationReason: '',
    skipReason: '',
    fromFrozenStamp: false,
  }
}

// =====================================================================================
// 4. CAPTION NORMALISATION
// =====================================================================================

/** "  Prepared  By: " -> "prepared by" */
export function normalizeCaption(label?: string | null): string {
  return (label ?? '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

const CAPTION_TO_BLOCK: Record<string, SignatureBlockType> = {
  'prepared by': SignatureBlockType.PreparedBy,
  prepared: SignatureBlockType.PreparedBy,
  'drafted by': SignatureBlockType.PreparedBy,
  'originated by': SignatureBlockType.PreparedBy,
  'raised by': SignatureBlockType.PreparedBy,
  'requested by': SignatureBlockType.PreparedBy,
  'submitted by': SignatureBlockType.PreparedBy,
  'self audited by': SignatureBlockType.PreparedBy,
  'audited by': SignatureBlockType.PreparedBy,

  'processed by': SignatureBlockType.ProcessedBy,
  processed: SignatureBlockType.ProcessedBy,
  'completed by': SignatureBlockType.ProcessedBy,
  'entered by': SignatureBlockType.ProcessedBy,
  'performed by': SignatureBlockType.ProcessedBy,

  'verified by': SignatureBlockType.VerifiedBy,
  verified: SignatureBlockType.VerifiedBy,
  verification: SignatureBlockType.VerifiedBy,
  'checked by': SignatureBlockType.VerifiedBy,
  'inspected by': SignatureBlockType.VerifiedBy,

  'reviewed by': SignatureBlockType.ReviewedBy,
  reviewed: SignatureBlockType.ReviewedBy,
  'review by': SignatureBlockType.ReviewedBy,
  'evaluated by': SignatureBlockType.ReviewedBy,

  'approved by': SignatureBlockType.ApprovedBy,
  approved: SignatureBlockType.ApprovedBy,
  approval: SignatureBlockType.ApprovedBy,
  'accepted by': SignatureBlockType.ApprovedBy,
  'authorized by': SignatureBlockType.ApprovedBy,
  'authorised by': SignatureBlockType.ApprovedBy,
  'concurred by': SignatureBlockType.ApprovedBy,

  'issued by': SignatureBlockType.IssuedBy,
  issued: SignatureBlockType.IssuedBy,
  'released by': SignatureBlockType.IssuedBy,

  'signed off by': SignatureBlockType.SignedOffBy,
  'sign off by': SignatureBlockType.SignedOffBy,
  'signed by': SignatureBlockType.SignedOffBy,
  'final sign off': SignatureBlockType.SignedOffBy,
  'final signature': SignatureBlockType.SignedOffBy,

  'endorsed by': SignatureBlockType.EndorsedBy,
  endorsed: SignatureBlockType.EndorsedBy,
  endorsement: SignatureBlockType.EndorsedBy,
}

/**
 * Resolves a PRINTED caption to its signature block, or null when the caption is not a
 * signature caption at all ("Remarks").
 *
 * Job-title captions such as "RESPONSIBLE DIRECTOR:" resolve through
 * `SLOT_CAPTION_ALIASES`, declared next to the rest of the printed data in the matrix.
 */
export function blockFromCaption(label?: string | null): SignatureBlockType | null {
  const key = normalizeCaption(label)
  if (!key) return null
  if (CAPTION_TO_BLOCK[key] !== undefined) return CAPTION_TO_BLOCK[key]
  if (SLOT_CAPTION_ALIASES[key] !== undefined) return SLOT_CAPTION_ALIASES[key]

  // Tolerate a trailing qualifier: "Approved by (Manager)" / "Prepared by STL".
  for (const alias of Object.keys(CAPTION_TO_BLOCK)) {
    if (key.startsWith(`${alias} `)) return CAPTION_TO_BLOCK[alias]
  }
  return null
}

// =====================================================================================
// 5. STATE DERIVATION
// =====================================================================================

const SIGNING_ACTIONS: WorkflowStepAction[] = [
  WorkflowStepAction.Created,
  WorkflowStepAction.Submitted,
  WorkflowStepAction.Verified,
  WorkflowStepAction.Reviewed,
  WorkflowStepAction.Approved,
  WorkflowStepAction.SignedOff,
  WorkflowStepAction.Endorsed,
  WorkflowStepAction.Amended,
]

function stateOfStep(step: WorkflowStepResponse): PrintedSignatureState {
  if (step.isSkipped || step.state === WorkflowStepState.Skipped) {
    return PrintedSignatureState.Skipped
  }
  if (step.state === WorkflowStepState.Rejected || step.state === WorkflowStepState.Returned) {
    return PrintedSignatureState.Returned
  }
  if (step.state === WorkflowStepState.Completed) return PrintedSignatureState.Signed
  if (step.actedAt && SIGNING_ACTIONS.includes(step.actionTaken)) {
    return PrintedSignatureState.Signed
  }
  if (
    step.state === WorkflowStepState.Active ||
    step.state === WorkflowStepState.AwaitingAssignment
  ) {
    return PrintedSignatureState.Pending
  }
  return PrintedSignatureState.Blank
}

/** The CANONICAL eligible roles of a step. */
function eligibleRolesOf(step: WorkflowStepResponse): OrgRole[] {
  const canonical = (step.eligibleRoles ?? [])
    .map(normalizeRole)
    .filter((role): role is OrgRole => role !== null)
  return Array.from(new Set(canonical))
}

/** "Shop Team Leader / Engineer" — informational, never the printed role line. */
function eligibleRoleCaptionOf(step: WorkflowStepResponse): string {
  const labels =
    step.eligibleRoleLabels && step.eligibleRoleLabels.length > 0
      ? step.eligibleRoleLabels
      : (step.eligibleRoles ?? []).map(roleLabel)
  return labels.filter(Boolean).join(' / ')
}

/**
 * AMENDED — user ids are NUMBERS (C# long), but a deployment that serialises Int64 as a
 * JSON string ("102") must NOT silently disable the specimen lookup. Parse both shapes,
 * exactly like `useSignatureImage` and `current-signer.ts` already do; a string id that
 * reached `positiveUserId` as `typeof value !== 'number'` used to yield null, which made
 * `AutoSignatureCell` keep the hook idle and print an empty rule — the other half of
 * "signatures not displayed".
 */
function positiveUserId(value?: number | string | null): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

// =====================================================================================
// 6. THE BUILDER
// =====================================================================================

/**
 * Exact stepNo match first. The same-block fallback is only allowed when exactly ONE stamp
 * of that block exists, otherwise a Manager stamp could be printed on the Special Team
 * Leader line of MNT-1229B.
 */
function frozenStampFor(
  signatures: FormSignatureResponse[],
  block: SignatureBlockType,
  stepNo: number,
): FormSignatureResponse | null {
  if (!Array.isArray(signatures) || signatures.length === 0) return null
  const exact = signatures.find(s => s.block === block && s.stepNo === stepNo)
  if (exact) return exact
  const sameBlock = signatures.filter(s => s.block === block)
  return sameBlock.length === 1 ? sameBlock[0] : null
}

function rowFromStep(
  step: WorkflowStepResponse,
  signatures: FormSignatureResponse[],
): PrintedSignatureRow {
  const state = stateOfStep(step)
  const stamp =
    state === PrintedSignatureState.Signed
      ? frozenStampFor(signatures, step.signatureBlock, step.stepNo)
      : null

  // RULE: the frozen stamp wins on facts; the step is the fallback.
  const userId = positiveUserId(stamp?.userId ?? step.actedByUserId)
  const personName = (stamp?.personName || step.actedByName || '').trim()
  const personRole = (stamp?.personRole || step.actedByRole || '').trim()
  const signedAtRaw = stamp?.signedAt || step.actedAt || ''

  const signed = state === PrintedSignatureState.Signed
  const pending = state === PrintedSignatureState.Pending

  return {
    block: step.signatureBlock,
    // The SERVER caption is NOT printed. `rowsForForm()` prints the paper caption.
    caption: SIGNATURE_CAPTIONS[step.signatureBlock] || '',
    serverCaption: (step.signatureCaption || stamp?.caption || '').trim(),
    stepNo: step.stepNo,
    stepTitle: step.title ?? '',

    // Filled by `rowsForForm()` from the matrix; the eligible list is only the fallback.
    roleCaption: '',

    userId,
    assignedToUserId: step.assignedToUserId ?? null,
    personName,
    personRole,
    personRoleLabel: personRole ? roleLabel(personRole) : '',

    eligibleRoles: eligibleRolesOf(step),
    eligibleRoleCaption: eligibleRoleCaptionOf(step),

    date: signed ? formatSignatureDate(signedAtRaw) : '',
    timestamp: signed ? formatSignatureTimestamp(signedAtRaw) : '',

    signatureHash: (stamp?.signatureHash ?? '').trim(),

    state,
    stateLabel: printedSignatureStateLabel(state),

    isSigned: signed,
    isPending: pending,
    isSkipped: state === PrintedSignatureState.Skipped,
    isReturned: state === PrintedSignatureState.Returned,
    isProvisional: false,

    awaitingName: pending ? (step.assignedToName ?? '').trim() : '',
    awaitingUnit: pending ? (step.assignmentUnit ?? '').trim() : '',

    comments: (step.comments ?? '').trim(),

    wasDelegated: !!step.wasDelegated,
    delegationReason: (step.delegationReason ?? '').trim(),
    skipReason: (step.skipReason ?? '').trim(),

    fromFrozenStamp: !!stamp,
  }
}

/** A row built from a frozen stamp with no matching step (amended / migrated records). */
function rowFromStamp(stamp: FormSignatureResponse): PrintedSignatureRow {
  const personRole = (stamp.personRole ?? '').trim()
  const canonical = normalizeRole(personRole)
  return {
    ...emptySignatureRow(stamp.block),
    serverCaption: (stamp.caption ?? '').trim(),
    stepNo: stamp.stepNo ?? 0,
    userId: positiveUserId(stamp.userId),
    personName: (stamp.personName ?? '').trim(),
    personRole,
    personRoleLabel: stamp.personRoleLabel || (personRole ? roleLabel(personRole) : ''),
    eligibleRoles: canonical ? [canonical] : [],
    date: formatSignatureDate(stamp.signedAt),
    timestamp: formatSignatureTimestamp(stamp.signedAt),
    signatureHash: (stamp.signatureHash ?? '').trim(),
    state: PrintedSignatureState.Signed,
    stateLabel: printedSignatureStateLabel(PrintedSignatureState.Signed),
    isSigned: true,
    fromFrozenStamp: true,
  }
}

function blockOrderIndex(block: SignatureBlockType): number {
  const index = SIGNATURE_BLOCK_ORDER.indexOf(block)
  return index < 0 ? SIGNATURE_BLOCK_ORDER.length : index
}

/**
 * THE ENTRY POINT of the raw projection: one workflow instance -> ordered printed rows.
 * Ordering is the real execution order (stepNo), then the canonical block order. Steps whose
 * signatureBlock is None (pure gate / assignment steps) print nothing and are dropped.
 */
export function buildSignatureRows(
  instance?: WorkflowInstanceResponse | null,
): PrintedSignatureRow[] {
  if (!instance) return []

  const signatures = Array.isArray(instance.signatures) ? instance.signatures : []
  const steps = Array.isArray(instance.steps) ? instance.steps : []

  const rows: PrintedSignatureRow[] = steps
    .filter(step => step.signatureBlock !== SignatureBlockType.None)
    .map(step => rowFromStep(step, signatures))

  for (const stamp of signatures) {
    if (stamp.block === SignatureBlockType.None) continue
    const covered = rows.some(row => row.block === stamp.block && row.stepNo === stamp.stepNo)
    if (!covered) rows.push(rowFromStamp(stamp))
  }

  // AMENDED v15 — repair ALREADY-SUBMITTED records. Forms submitted before the
  // backend started stamping the Draft step (StepNo 0) have no frozen "prepared
  // By:" stamp, so the preparer's name / date vanished for every non-preparer
  // viewer (the reported defect: kidus disappears once the Manager opens MNT-1229B).
  // The instance itself records the originator (originatorName / originatorRole /
  // submittedAt) as a FACT of the workflow, independent of who is viewing, so we
  // project it onto the unsigned Draft line. This is the recorded preparer, not a
  // provisional auto-fill, so it is rendered as a settled (locked) line for all
  // roles. New submissions freeze it server-side and this branch is a no-op.
  const draftRow = rows.find(row => row.stepNo === 0 && row.block === SignatureBlockType.PreparedBy)
  if (
    draftRow &&
    !draftRow.isSigned &&
    draftRow.state !== PrintedSignatureState.Skipped &&
    draftRow.state !== PrintedSignatureState.Returned &&
    !(draftRow.personName ?? '').trim() &&
    (instance.originatorName ?? '').trim()
  ) {
    const originatorRole = (instance.originatorRole ?? '').trim()
    draftRow.userId = positiveUserId(instance.originatorUserId)
    draftRow.personName = instance.originatorName.trim()
    draftRow.personRole = originatorRole
    draftRow.personRoleLabel = originatorRole ? roleLabel(originatorRole) : ''
    draftRow.date = formatSignatureDate(instance.submittedAt)
    draftRow.timestamp = formatSignatureTimestamp(instance.submittedAt)
    draftRow.state = PrintedSignatureState.Signed
    draftRow.stateLabel = printedSignatureStateLabel(PrintedSignatureState.Signed)
    draftRow.isSigned = true
    draftRow.isPending = false
  }

  return rows.sort((a, b) => {
    if (a.stepNo !== b.stepNo) return a.stepNo - b.stepNo
    return blockOrderIndex(a.block) - blockOrderIndex(b.block)
  })
}

// =====================================================================================
// 7. ROLE-MATRIX MATCHING
// =====================================================================================

/**
 * Matches the printed slots of a form to the executed rows of its instance.
 *
 * THREE PASSES, in this exact order:
 *   PASS 1 — SIGNED row whose ACTUAL signer role is accepted by the slot. This is what stops
 *            the two MNT-1229B "Approved by:" lines swapping.
 *   PASS 2 — UNSIGNED row whose ELIGIBLE ROLES intersect the slot (set membership, not
 *            substring), so the form shows WHO it is waiting for, on the right line.
 *   PASS 3 — printed order, for rows the matrix cannot disambiguate.
 */
export function matchRowsToSlots(
  slots: SignatureSlotDefinition[],
  autoRows: PrintedSignatureRow[] | null | undefined,
): Array<PrintedSignatureRow | null> {
  const available = Array.isArray(autoRows) ? [...autoRows] : []
  const used = new Set<PrintedSignatureRow>()
  const result: Array<PrintedSignatureRow | null> = slots.map(() => null)

  const take = (index: number, row: PrintedSignatureRow | undefined | null): boolean => {
    if (!row || used.has(row)) return false
    result[index] = row
    used.add(row)
    return true
  }

  // PASS 1 — signed rows, matched on the ACTUAL signer role.
  slots.forEach((entry, index) => {
    if (result[index]) return
    take(
      index,
      available.find(
        row =>
          !used.has(row) &&
          row.block === entry.block &&
          row.isSigned &&
          slotAcceptsRole(entry, row.personRole),
      ),
    )
  })

  // PASS 2 — unsigned rows, matched on the CANONICAL eligible roles of the step.
  slots.forEach((entry, index) => {
    if (result[index]) return
    if (entry.expectedRoles.length === 0) return
    take(
      index,
      available.find(
        row =>
          !used.has(row) &&
          row.block === entry.block &&
          !row.isSigned &&
          row.eligibleRoles.length > 0 &&
          slotAcceptsAnyRole(entry, row.eligibleRoles),
      ),
    )
  })

  // PASS 3 — printed order.
  slots.forEach((entry, index) => {
    if (result[index]) return
    take(index, available.find(row => !used.has(row) && row.block === entry.block))
  })

  return result
}

// =====================================================================================
// 8. THE PROVISIONAL FILL   (AMENDED v28 — THE FIX FOR THE BLANK BLOCK)
// =====================================================================================

/** States a provisional fill may NEVER overwrite: they are the recorded outcome. */
const SETTLED_STATES: PrintedSignatureState[] = [
  PrintedSignatureState.Signed,
  PrintedSignatureState.Skipped,
  PrintedSignatureState.Returned,
]

/**
 * True when a printed line MAY carry the logged-in user's provisional name / date / specimen.
 *
 * The three conditions are all necessary:
 *   1. the slot expects roles AND accepts this signer's canonical role  (RULE 2 + RULE 5);
 *   2. the line is not already settled                                  (RULE 4);
 *   3. when the step is Pending, the signer must actually be one of the roles the step is
 *      open to — a Manager must not pre-fill a line the server is holding for the Director.
 */
export function canFillProvisionally(
  slot: SignatureSlotDefinition | null | undefined,
  row: PrintedSignatureRow | null | undefined,
  signer?: ProvisionalSignerLike | null,
): boolean {
  if (!slot) return false
  if (!isUsableSigner(signer)) return false
  if (slot.expectedRoles.length === 0) return false
  if (!slot.expectedRoles.includes(signer.canonicalRole as OrgRole)) return false

  if (!row) return true
  if (SETTLED_STATES.includes(row.state)) return false
  if (row.isProvisional) return false

  if (row.state === PrintedSignatureState.Pending && row.eligibleRoles.length > 0) {
    return (
      row.assignedToUserId === signer.userId &&
      row.eligibleRoles.includes(signer.canonicalRole as OrgRole)
    )
  }

  return true
}

/**
 * Builds the PROVISIONAL row of one printed line: the logged-in user's name, his canonical
 * role (for tooltips only) and TODAY in UTC, on top of whatever the workflow already knows
 * about that step (stepNo, title, eligible roles, awaiting assignment).
 *
 * `isSigned` stays FALSE and `signatureHash` stays EMPTY: this is not a signature, it is the
 * preview of the one the user is about to give.
 */
export function provisionalRowFor(
  slot: SignatureSlotDefinition,
  signer: ProvisionalSignerLike,
  existing?: PrintedSignatureRow | null,
): PrintedSignatureRow {
  const base = existing ?? emptySignatureRow(slot.block, slot.caption, roleCaptionOfSlot(slot))

  return {
    ...base,
    block: slot.block,
    caption: slot.caption || base.caption,
    roleCaption: roleCaptionOfSlot(slot) || base.roleCaption,

    userId: signer.userId,
    personName: signer.personName,
    personRole: signer.personRole || (signer.canonicalRole ?? ''),
    personRoleLabel: signer.personRoleLabel,

    date: signer.today,
    timestamp: '',
    signatureHash: '',

    state: PrintedSignatureState.SelfFill,
    stateLabel: printedSignatureStateLabel(PrintedSignatureState.SelfFill),

    isSigned: false,
    isPending: false,
    isSkipped: false,
    isReturned: false,
    isProvisional: true,

    // A provisional line is the CURRENT user's own line, so "Awaiting somebody else" is
    // meaningless on it and must not be printed in the specimen cell.
    awaitingName: '',
    awaitingUnit: '',

    fromFrozenStamp: false,
  }
}

/**
 * Applies the provisional fill to a fully matched slot/row pair list.
 *
 * RULE 3 — ONE LINE PER SIGNER: only the FIRST eligible line is filled. MNT-1378 routes both
 * "Reviewed By:" and "Approved By:" to the Inspector role, and pre-stamping both would print
 * an approval that was never granted.
 *
 * Returns a NEW array; the input is never mutated.
 */
export function applyProvisionalFill(
  slots: SignatureSlotDefinition[],
  rows: Array<PrintedSignatureRow | null>,
  signer?: ProvisionalSignerLike | null,
): Array<PrintedSignatureRow | null> {
  if (!isUsableSigner(signer)) return rows

  const index = slots.findIndex((slot, i) => canFillProvisionally(slot, rows[i], signer))
  if (index < 0) return rows

  const next = [...rows]
  next[index] = provisionalRowFor(slots[index], signer, rows[index] ?? null)
  return next
}

/** The printed position the logged-in user is responsible for, or -1. */
export function provisionalFillIndex(
  formType?: string | null,
  instance?: WorkflowInstanceResponse | null,
  signer?: ProvisionalSignerLike | null,
): number {
  if (!isUsableSigner(signer)) return -1
  const slots = signatureSlotsFor(formType)
  const matched = matchRowsToSlots(slots, buildSignatureRows(instance))
  return slots.findIndex((slot, i) => canFillProvisionally(slot, matched[i], signer))
}

// =====================================================================================
// 9. THE FORM-LEVEL PROJECTION
// =====================================================================================

/**
 * THE FUNCTION EVERY FORM SHOULD USE. Returns ONE ROW PER PRINTED LINE of the hard copy, in
 * printed order:
 *
 *   - the caption is the VERBATIM caption of the paper original (matrix);
 *   - the role line is ALWAYS the FIXED matrix role title, signed or not;
 *   - name / date / specimen key are filled from the executed workflow;
 *   - AMENDED v28: the line that belongs to the LOGGED-IN USER by role is pre-filled with his
 *     name and today's UTC date when the step has not been executed yet;
 *   - a line nobody owns prints blank, exactly like the unsigned hard copy.
 *
 * `instance = null` (no draft started yet) is fully supported — and is exactly the case the
 * provisional fill exists for.
 */
export function rowsForForm(
  formType?: string | null,
  instance?: WorkflowInstanceResponse | null,
  signer?: ProvisionalSignerLike | null,
): PrintedSignatureRow[] {
  const slots = signatureSlotsFor(formType)
  const matched = applyProvisionalFill(slots, matchRowsToSlots(slots, buildSignatureRows(instance)), signer)

  return slots.map((entry, index) => {
    const row = matched[index]
    const matrixRole = roleCaptionOfSlot(entry)

    if (!row) return emptySignatureRow(entry.block, entry.caption, matrixRole)

    return {
      ...row,
      caption: entry.caption || row.caption,
      roleCaption: matrixRole || row.eligibleRoleCaption,
    }
  })
}

// =====================================================================================
// 10. THE PRINTED LINE
// =====================================================================================

/** One printed signature line: the DATA plus the resolved printed geometry. */
export interface PrintedSignatureLine {
  slot: SignatureSlotDefinition
  row: PrintedSignatureRow
  /** Verbatim paper caption, e.g. "prepared  By:". */
  caption: string
  /** FIXED role title printed UNDER the name rule. */
  roleCaption: string
  /** Inline caption of the specimen cell, e.g. "Signature:". */
  signatureCaption: string
  /** Inline caption of the date cell, e.g. "Date:". */
  dateCaption: string
  geometry: SignatureLineGeometry
}

export interface PrintedSignatureBlockModel {
  formType: string
  style: SignaturePrintStyle
  geometry: SignatureLineGeometry
  lines: PrintedSignatureLine[]
  progress: SignatureProgress
}

/**
 * Everything a component needs to PRINT the signature block of one form, in one call:
 * the print style, the default geometry, and every printed line with its caption, its role
 * title, its inline captions, its own geometry and its live workflow row.
 */
export function linesForForm(
  formType?: string | null,
  instance?: WorkflowInstanceResponse | null,
  signer?: ProvisionalSignerLike | null,
): PrintedSignatureBlockModel {
  const config = formSignatureConfig(formType)
  const rows = rowsForForm(formType, instance, signer)

  const lines: PrintedSignatureLine[] = config.lines.map((line, index) => ({
    slot: line.slot,
    row: rows[index] ?? emptySignatureRow(line.block, line.caption, line.roleCaption),
    caption: line.caption,
    roleCaption: line.roleCaption,
    signatureCaption: line.signatureCaption,
    dateCaption: line.dateCaption,
    geometry: line.geometry,
  }))

  return {
    formType: config.formType,
    style: config.style,
    geometry: config.geometry,
    lines,
    progress: signatureProgress(rows),
  }
}

// =====================================================================================
// 11. LOOKUPS
// =====================================================================================

export function findSignatureRow(
  rows: PrintedSignatureRow[] | null | undefined,
  block: SignatureBlockType,
  occurrence = 0,
): PrintedSignatureRow | null {
  if (!Array.isArray(rows)) return null
  return rows.filter(row => row.block === block)[occurrence] ?? null
}

export function findSignatureRowByCaption(
  rows: PrintedSignatureRow[] | null | undefined,
  caption?: string | null,
  occurrence = 0,
): PrintedSignatureRow | null {
  if (!Array.isArray(rows)) return null
  const block = blockFromCaption(caption)
  if (block === null) return null
  return findSignatureRow(rows, block, occurrence)
}

export function findSignatureRowByStep(
  rows: PrintedSignatureRow[] | null | undefined,
  stepNo: number,
): PrintedSignatureRow | null {
  if (!Array.isArray(rows)) return null
  return rows.find(row => row.stepNo === stepNo) ?? null
}

/**
 * Every distinct signer whose specimen must be fetched before printing / exporting.
 *
 * AMENDED v28: a PROVISIONAL row is included. The logged-in user's own specimen has to be
 * streamed too, otherwise his line would print his name but an empty signature cell — which
 * is exactly half of the reported symptom.
 */
export function signedUserIds(rows: PrintedSignatureRow[] | null | undefined): number[] {
  if (!Array.isArray(rows)) return []
  const ids = rows
    .filter(row => (row.isSigned || row.isProvisional) && row.userId)
    .map(row => row.userId as number)
  return Array.from(new Set(ids))
}

export interface SignatureProgress {
  total: number
  signed: number
  skipped: number
  pending: number
  outstanding: number
  percent: number
  /** "Approved by: — awaiting Sara N." for the header line of the form. */
  pendingCaption: string
  allSigned: boolean
  /** AMENDED v28 — lines pre-filled with the logged-in user's details, not yet signed. */
  provisional: number
}

export function signatureProgress(
  rows: PrintedSignatureRow[] | null | undefined,
): SignatureProgress {
  const list = Array.isArray(rows) ? rows : []
  const total = list.length
  const signed = list.filter(r => r.isSigned).length
  const skipped = list.filter(r => r.isSkipped).length
  const pending = list.filter(r => r.isPending).length
  // RULE 1: a provisional line is NOT a signature and must never be counted as settled.
  const provisional = list.filter(r => r.isProvisional).length
  const settled = signed + skipped
  const firstPending = list.find(r => r.isPending) ?? null

  let pendingCaption = ''
  if (firstPending) {
    const who =
      firstPending.awaitingName || firstPending.awaitingUnit || firstPending.roleCaption
    pendingCaption = who
      ? `${firstPending.caption} — awaiting ${who}`
      : `${firstPending.caption} — awaiting signature`
  }

  return {
    total,
    signed,
    skipped,
    pending,
    provisional,
    outstanding: Math.max(0, total - settled),
    percent: total === 0 ? 0 : Math.round((settled / total) * 100),
    pendingCaption,
    allSigned: total > 0 && settled === total,
  }
}

// =====================================================================================
// 12. LEGACY ROW AUTO-FILL — THE REASON NO FORM LAYOUT HAS TO BE REBUILT
//
//     Every controlled document already builds a `SignatureRow[]` for
//     FormDocumentChrome.SignatureBlock:
//
//         rows={[{ label: 'prepared  By:', role: 'Shop Team Leader / Engineer',
//                  name: data.preparedBy, date: data.preparedByDate }]}
//
//     Passing that array through `autoFillLegacyRows(rows, autoRows, formType, signer)`
//     attaches the matching printed row to each line, so the CAPTIONS, THE ORDER AND THE
//     GEOMETRY STAY EXACTLY AS PRINTED while Name / Signature / Date become automatic.
// =====================================================================================

/** The minimum shape `autoFillLegacyRows` needs — structurally equal to SignatureRow. */
export interface LegacySignatureRowLike {
  label: string
  role: string
  name: string
  date: string
  /**
   * OPTIONAL explicit block, for a printed caption that is a JOB TITLE
   * ("RESPONSIBLE DIRECTOR:") and therefore not resolvable from the caption text.
   */
  block?: SignatureBlockType
  /**
   * OPTIONAL per-row role hint. When a form prints the SAME caption twice it may pass the
   * canonical roles of each line here to disambiguate them explicitly.
   */
  expectedRoles?: string[]
}

export type AutoFilledRow<T extends LegacySignatureRowLike> = T & {
  /** Null when nothing (neither workflow nor signer) owns that caption. */
  signature: PrintedSignatureRow | null
  /** The matrix slot behind the printed line, so the caller can print its geometry. */
  slot: SignatureSlotDefinition | null
}

/**
 * Each legacy row becomes a slot:
 *   block         <- `row.block`, else `blockFromCaption(row.label)`
 *   expectedRoles <- `row.expectedRoles`, else the NEXT UNUSED matrix slot of that block,
 *                    else the matrix slot AT THE SAME PRINTED POSITION
 *   roleCaption   <- the matrix role title; `row.role` only as the last resort
 *
 * The slots are then resolved with `matchRowsToSlots()` and — AMENDED v28 — with
 * `applyProvisionalFill()`, so the logged-in user's own line is populated even before the
 * workflow has recorded anything. Passing `formType` is strongly recommended; without it the
 * function degrades to positional behaviour and no provisional fill happens at all (the
 * synthesised slots then carry no `expectedRoles`, and RULE 5 forbids guessing).
 */
export function autoFillLegacyRows<T extends LegacySignatureRowLike>(
  legacyRows: T[] | null | undefined,
  autoRows: PrintedSignatureRow[] | null | undefined,
  formType?: string | null,
  signer?: ProvisionalSignerLike | null,
): AutoFilledRow<T>[] {
  const legacy = Array.isArray(legacyRows) ? legacyRows : []
  if (legacy.length === 0) return []

  const matrixSlots = formType ? signatureSlotsFor(formType) : []
  const consumed = new Set<SignatureSlotDefinition>()

  const slots: SignatureSlotDefinition[] = legacy.map((row, index) => {
    const block = row.block ?? blockFromCaption(row.label) ?? SignatureBlockType.None

    // Explicit per-row hint wins over everything.
    const explicit = (row.expectedRoles ?? [])
      .map(normalizeRole)
      .filter((value): value is OrgRole => value !== null)

    if (explicit.length > 0) {
      return { block, caption: row.label, roleCaption: row.role ?? '', expectedRoles: explicit }
    }

    // Next unused matrix slot of the same block.
    const sameBlock = matrixSlots.find(entry => entry.block === block && !consumed.has(entry))
    if (sameBlock) {
      consumed.add(sameBlock)
      return {
        block,
        caption: row.label,
        roleCaption: sameBlock.roleCaption || row.role || '',
        expectedRoles: sameBlock.expectedRoles,
        geometry: sameBlock.geometry,
      }
    }

    // Positional fallback: the matrix slot printed at the same position.
    const positional = matrixSlots[index]
    if (positional && !consumed.has(positional)) {
      consumed.add(positional)
      return {
        block: block === SignatureBlockType.None ? positional.block : block,
        caption: row.label,
        roleCaption: positional.roleCaption || row.role || '',
        expectedRoles: positional.expectedRoles,
        geometry: positional.geometry,
      }
    }

    return { block, caption: row.label, roleCaption: row.role ?? '', expectedRoles: [] }
  })

  const matched = applyProvisionalFill(slots, matchRowsToSlots(slots, autoRows), signer)

  return legacy.map((row, index) => {
    const slot = slots[index] ?? null
    const signature = matched[index] ?? null
    return {
      ...row,
      slot,
      signature: signature
        ? {
            ...signature,
            caption: slot?.caption || signature.caption,
            // The printed role line is ALWAYS the matrix role title.
            roleCaption:
              roleCaptionOfSlot(slot) || row.role || signature.eligibleRoleCaption,
          }
        : null,
    }
  })
}

/**
 * The values a printed cell must show after the automatic layer has been applied.
 * `locked` is true once a real signature exists: a stamped name / date must never stay
 * editable, even while the form is in edit mode.
 */
export interface PrintedCellValues {
  name: string
  date: string
  roleCaption: string
  locked: boolean
  tooltip: string
  state: PrintedSignatureState
  stateLabel: string
  /** AMENDED v28 — the printed value is the logged-in user's preview, not a stamp. */
  provisional: boolean
}

/**
 * A row with a known non-blank state prints nothing in the Name / Date cells unless it is
 * Signed (the legal record) or SelfFill (the logged-in user's preview); only a Blank state
 * (step not reached, nobody owns the line) may still fall back to the typed draft value.
 *
 * A SKIPPED or RETURNED approval therefore never shows a name, which would otherwise read as
 * though the approval had been granted.
 */
export function printedCellValues(
  row: LegacySignatureRowLike,
  signature?: PrintedSignatureRow | null,
): PrintedCellValues {
  if (!signature) {
    return {
      name: row.name ?? '',
      date: row.date ?? '',
      roleCaption: row.role ?? '',
      locked: false,
      tooltip: '',
      state: PrintedSignatureState.Blank,
      stateLabel: printedSignatureStateLabel(PrintedSignatureState.Blank),
      provisional: false,
    }
  }

  const tooltipParts: string[] = []
  if (signature.stepTitle) tooltipParts.push(signature.stepTitle)
  if (signature.personRoleLabel) tooltipParts.push(`Signer role: ${signature.personRoleLabel}`)
  if (signature.timestamp) tooltipParts.push(signature.timestamp)
  if (signature.isProvisional) {
    tooltipParts.push(
      'Captured from your session — it becomes the recorded signature when you approve this form.',
    )
  }
  if (signature.wasDelegated && signature.delegationReason) {
    tooltipParts.push(`Delegated: ${signature.delegationReason}`)
  }
  if (signature.isSkipped && signature.skipReason) {
    tooltipParts.push(`Skipped: ${signature.skipReason}`)
  }
  if (signature.comments) tooltipParts.push(signature.comments)

  const mayUseTypedValue = signature.state === PrintedSignatureState.Blank
  const authoritative = signature.isSigned || signature.isProvisional

  return {
    name: authoritative
      ? signature.personName || row.name || ''
      : mayUseTypedValue
        ? row.name ?? ''
        : '',
    date: authoritative
      ? signature.date || row.date || ''
      : mayUseTypedValue
        ? row.date ?? ''
        : '',
    roleCaption: signature.roleCaption || row.role || '',
    // RULE 1: a provisional value stays EDITABLE. Only a recorded outcome locks the cell.
    locked: signature.isSigned || signature.isSkipped || signature.isReturned,
    tooltip: tooltipParts.join(' · '),
    state: signature.state,
    stateLabel: signature.stateLabel,
    provisional: signature.isProvisional,
  }
}

/** Re-exported so a form never has to import the matrix directly. */
export { dateCaptionOfSlot, geometryFor, signatureCaptionOfSlot }