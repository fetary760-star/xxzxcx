/**
 * =====================================================================================
 * AMENDED v31 - THE DURABLE SIGNATURE LEDGER  (NEW FILE)
 * Copy to: CMT.Frontend/src/lib/workflow/signature-ledger.ts
 *
 * WHY THIS FILE EXISTS - THE SECOND HALF OF DEFECT 1
 * -------------------------------------------------
 * WorkflowFormsController.cs restores the READ path, so as soon as the workflow engine has
 * recorded a step the printed line is rebuilt from FormWorkflowStep.ActedByName / ActedAt
 * and from the append-only FormSignature rows. That fixes every form whose approval really
 * goes through POST /api/workflow/forms/{instanceId}/approve.
 *
 * But part of your estate still approves through the LEGACY route
 *      POST /api/self-evaluation/forms/{id}/approve
 * (ApprovalWorkflowActions -> FormSubmissionController.Approve), which writes only the
 * SCALAR columns of FormSubmission:
 *
 *      ReviewedByUserId / ReviewedDate / ApprovedByUserId / ApprovedDate
 *
 * Those columns hold ONE value each. The Manager approval OVERWRITES the Team Leader
 * approval, and no FormWorkflowInstance exists at all, so there is nothing for the read
 * path to return. On those forms the audit trail is destroyed at the database level and no
 * amount of frontend work can recover it after the fact.
 *
 * This module closes that hole WITHOUT touching the database schema: every printed
 * signature line, once settled, is mirrored into an APPEND-ONLY ledger stored inside the
 * form's own FormDataJson, under the reserved key `signatureLedger`. FormDataJson is
 * already persisted verbatim by CreateFormSubmissionCommand / UpdateFormSubmissionCommand,
 * so the ledger travels with the form with no migration, no new table and no new endpoint.
 *
 * THE PRECEDENCE, IN ONE LINE  (extends the v28/v30 chain by ONE rung)
 *
 *      frozen stamp  >  executed step  >  DURABLE LEDGER  >  logged-in signer (provisional)
 *                                                        >  blank hard copy
 *
 * The ledger sits ABOVE the provisional fill and BELOW the server, which is exactly the
 * behaviour you asked for: "once approved, all previous approval details must remain
 * visible and carry over automatically to the next stage", while the server always wins
 * on facts.
 *
 * FOUR HARD RULES
 *   (1) APPEND-ONLY. `mergeLedgerEntries()` NEVER deletes an entry and never replaces a
 *       non-empty name with an empty one. A stage change can only ADD lines.
 *   (2) THE SERVER OUTRANKS THE SESSION. An entry with source 'workflow' replaces an entry
 *       with source 'session' for the same printed line; the reverse is refused.
 *   (3) ONLY SETTLED LINES ARE MIRRORED. A provisional preview is never written. A ledger
 *       entry therefore always represents something that really happened.
 *   (4) NO REACT HERE. Pure projection, reusable by the folder PDF exporter and by tests.
 *       The React binding lives in `useSignatureLedger.ts`.
 *
 * IDS: user ids are NUMBERS (C# long); entity ids are STRINGS (C# Guid).
 * =====================================================================================
 */

import {
  PrintedSignatureState,
  buildSignatureRows,
  matchRowsToSlots,
  type PrintedSignatureRow,
  type ProvisionalSignerLike,
} from '@/lib/workflow/signature-blocks'
import {
  roleCaptionOfSlot,
  signatureSlotsFor,
  type SignatureSlotDefinition,
} from '@/lib/workflow/signature-matrix'
import {
  SignatureBlockType,
  type WorkflowInstanceResponse,
} from '@/lib/workflow/workflow-types'

// =====================================================================================
// 1. THE RESERVED KEY
// =====================================================================================

/**
 * The key the ledger occupies inside FormDataJson.
 *
 * Deliberately a plain camelCase name and NOT a `__dunder`: the payload round-trips
 * through System.Text.Json on the server, and a leading underscore survives but reads as
 * an accident in a persisted audit record.
 *
 * NEVER declare a business field with this name on any form.
 */
export const SIGNATURE_LEDGER_KEY = 'signatureLedger'

// =====================================================================================
// 2. ONE LEDGER ENTRY
// =====================================================================================

/** Where a ledger entry came from. 'workflow' always outranks 'session'. */
export type SignatureLedgerSource = 'workflow' | 'session'

/**
 * ONE settled printed signature line, frozen for the life of the form.
 *
 * The shape is intentionally close to `FormSignatureResponse` so a future migration into a
 * real table is a straight column mapping.
 */
export interface SignatureLedgerEntry {
  /** Printed position inside FORM_SIGNATURE_MATRIX[formType], 0-based. The identity key. */
  slotIndex: number
  block: SignatureBlockType
  /** Verbatim paper caption, e.g. "Self-audited By:". */
  caption: string
  /** Fixed matrix role title printed under the name rule, e.g. "Team Leader". */
  roleCaption: string

  /** C# long. The specimen lookup key. Null when the deployment sent no id. */
  userId: number | null
  personName: string
  personRole: string
  personRoleLabel: string

  /** "YYYY-MM-DD", UTC. */
  date: string
  /** Owning workflow step, or 0 on the legacy path. */
  stepNo: number
  /** ISO instant the entry was written into the ledger. Audit only. */
  recordedAt: string
  source: SignatureLedgerSource
}

// =====================================================================================
// 3. READ / WRITE
// =====================================================================================

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function toInteger(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function toPositiveUserId(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

function toText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** Coerces one persisted row back into a typed entry, or null when it is unusable. */
function toEntry(value: unknown): SignatureLedgerEntry | null {
  if (!isRecord(value)) return null

  const slotIndex = toInteger(value.slotIndex, -1)
  if (slotIndex < 0) return null

  const personName = toText(value.personName)
  if (!personName) return null

  const source: SignatureLedgerSource = value.source === 'workflow' ? 'workflow' : 'session'

  return {
    slotIndex,
    block: toInteger(value.block, SignatureBlockType.None) as SignatureBlockType,
    caption: toText(value.caption),
    roleCaption: toText(value.roleCaption),
    userId: toPositiveUserId(value.userId),
    personName,
    personRole: toText(value.personRole),
    personRoleLabel: toText(value.personRoleLabel),
    date: toText(value.date),
    stepNo: toInteger(value.stepNo, 0),
    recordedAt: toText(value.recordedAt),
    source,
  }
}

/**
 * The ledger persisted on a form payload. NEVER throws: an absent, malformed or
 * partially-migrated value yields an empty ledger, and the form prints exactly as before.
 */
export function readSignatureLedger(
  formData: Record<string, unknown> | null | undefined,
): SignatureLedgerEntry[] {
  if (!isRecord(formData)) return []

  const raw = formData[SIGNATURE_LEDGER_KEY]
  if (!Array.isArray(raw)) return []

  const entries = raw
    .map(toEntry)
    .filter((entry): entry is SignatureLedgerEntry => entry !== null)

  return entries.sort((a, b) => a.slotIndex - b.slotIndex)
}

/** Returns a NEW form payload carrying `entries`. The input is never mutated. */
export function writeSignatureLedger<T extends Record<string, unknown>>(
  formData: T,
  entries: SignatureLedgerEntry[],
): T {
  return {
    ...formData,
    [SIGNATURE_LEDGER_KEY]: [...entries].sort((a, b) => a.slotIndex - b.slotIndex),
  }
}

/** The entry printed on one line, or null. */
export function ledgerEntryAt(
  ledger: SignatureLedgerEntry[] | null | undefined,
  slotIndex?: number | null,
): SignatureLedgerEntry | null {
  if (!Array.isArray(ledger)) return null
  if (typeof slotIndex !== 'number' || slotIndex < 0) return null
  return ledger.find(entry => entry.slotIndex === slotIndex) ?? null
}

// =====================================================================================
// 4. THE APPEND-ONLY MERGE  (RULE 1 + RULE 2)
// =====================================================================================

/**
 * Merges `incoming` into `existing` without ever losing a recorded line.
 *
 * For the same `slotIndex` the incoming entry replaces the existing one ONLY when:
 *   - the existing entry carries no name (a defensive, should-not-happen case), OR
 *   - the incoming entry is 'workflow' and the existing one is 'session'
 *     (the server outranks the session preview).
 *
 * Everything else is kept. A 'session' entry can therefore never downgrade a server
 * record, and no stage change can ever blank a previous approver.
 */
export function mergeLedgerEntries(
  existing: SignatureLedgerEntry[] | null | undefined,
  incoming: SignatureLedgerEntry[] | null | undefined,
): SignatureLedgerEntry[] {
  const merged = new Map<number, SignatureLedgerEntry>()

  for (const entry of Array.isArray(existing) ? existing : []) {
    merged.set(entry.slotIndex, entry)
  }

  for (const entry of Array.isArray(incoming) ? incoming : []) {
    if (!entry.personName.trim()) continue

    const current = merged.get(entry.slotIndex)
    if (!current) {
      merged.set(entry.slotIndex, entry)
      continue
    }

    if (!current.personName.trim()) {
      merged.set(entry.slotIndex, entry)
      continue
    }

    if (entry.source === 'workflow' && current.source !== 'workflow') {
      merged.set(entry.slotIndex, entry)
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.slotIndex - b.slotIndex)
}

/** True when two ledgers are byte-identical. Guards the React effect against a loop. */
export function isSameLedger(
  left: SignatureLedgerEntry[] | null | undefined,
  right: SignatureLedgerEntry[] | null | undefined,
): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? [])
}

// =====================================================================================
// 5. PROJECTION FROM THE WORKFLOW  (RULE 3)
// =====================================================================================

/** States that represent something that really happened and may be mirrored. */
const SETTLED_STATES: PrintedSignatureState[] = [
  PrintedSignatureState.Signed,
  PrintedSignatureState.Skipped,
  PrintedSignatureState.Returned,
]

function entryFrom(
  slot: SignatureSlotDefinition,
  slotIndex: number,
  row: PrintedSignatureRow,
  source: SignatureLedgerSource,
): SignatureLedgerEntry {
  return {
    slotIndex,
    block: slot.block,
    caption: slot.caption || row.caption,
    roleCaption: roleCaptionOfSlot(slot) || row.roleCaption,
    userId: row.userId,
    personName: row.personName,
    personRole: row.personRole,
    personRoleLabel: row.personRoleLabel,
    date: row.date,
    stepNo: row.stepNo,
    recordedAt: new Date().toISOString(),
    source,
  }
}

/**
 * Every SETTLED printed line of the instance, ready to be mirrored into the ledger.
 *
 * Only Signed lines carry a printable name, so Skipped / Returned lines are included only
 * when the server actually recorded an actor on them - otherwise there is nothing to
 * preserve and an empty entry would be noise.
 */
export function signedLedgerEntries(
  formType: string | null | undefined,
  instance: WorkflowInstanceResponse | null | undefined,
): SignatureLedgerEntry[] {
  if (!instance) return []

  const slots = signatureSlotsFor(formType)
  if (slots.length === 0) return []

  const matched = matchRowsToSlots(slots, buildSignatureRows(instance))
  const out: SignatureLedgerEntry[] = []

  slots.forEach((slot, slotIndex) => {
    const row = matched[slotIndex]
    if (!row) return
    if (!SETTLED_STATES.includes(row.state)) return
    if (!row.personName.trim()) return

    out.push(entryFrom(slot, slotIndex, row, 'workflow'))
  })

  return out
}

/**
 * The entry for the line the LOGGED-IN user just acted on, for the LEGACY approval path
 * where no FormWorkflowInstance exists and therefore nothing can be mirrored.
 *
 * Call it from `onStatusChange` of FormWorkflowFooter (see `useSignatureLedger`), i.e.
 * AFTER the approve request succeeded. It is the only place a 'session' entry is created,
 * and it is still not a legal stamp: the moment the workflow engine records the real step,
 * `signedLedgerEntries()` produces a 'workflow' entry for the same slot and RULE 2
 * replaces it.
 *
 * `ownedSlotIndex` comes from `useFormEditAuthority()`, which resolves it from the matrix
 * `expectedRoles` - so a Manager can never write himself onto the Team Leader line.
 */
export function sessionLedgerEntry(
  formType: string | null | undefined,
  instance: WorkflowInstanceResponse | null | undefined,
  signer: ProvisionalSignerLike | null | undefined,
  ownedSlotIndex: number,
): SignatureLedgerEntry | null {
  if (!signer || signer.isResolved !== true) return null
  if (!signer.personName.trim() || !signer.canonicalRole) return null
  if (typeof ownedSlotIndex !== 'number' || ownedSlotIndex < 0) return null

  const slots = signatureSlotsFor(formType)
  const slot = slots[ownedSlotIndex]
  if (!slot) return null

  // RULE 2 guard at the source: never write a session entry over a settled server line.
  const matched = matchRowsToSlots(slots, buildSignatureRows(instance ?? null))
  const existing = matched[ownedSlotIndex]
  if (existing && SETTLED_STATES.includes(existing.state)) return null

  return {
    slotIndex: ownedSlotIndex,
    block: slot.block,
    caption: slot.caption,
    roleCaption: roleCaptionOfSlot(slot),
    userId: signer.userId,
    personName: signer.personName,
    personRole: signer.personRole || signer.canonicalRole,
    personRoleLabel: signer.personRoleLabel,
    date: signer.today,
    stepNo: existing?.stepNo ?? 0,
    recordedAt: new Date().toISOString(),
    source: 'session',
  }
}

// =====================================================================================
// 6. THE ONE-LINE ADOPTION HELPER
// =====================================================================================

/** The minimum shape of a `FormDocumentChrome.SignatureRow` this helper needs. */
export interface LedgerAwareRow {
  slotIndex?: number
  name: string
  date: string
}

/**
 * Fills the `name` / `date` of every declared row from the ledger WHEN the row has no
 * value of its own, and returns a NEW array.
 *
 * This is the whole adoption cost of the ledger inside a controlled document:
 *
 *     const ledger = readSignatureLedger(formData)
 *     ...
 *     <SignatureBlock rows={withLedgerValues([ ...rows... ], ledger)} ... />
 *
 * WHY IT IS SAFE AGAINST THE SERVER
 * `printedCellValues()` in `signature-blocks.ts` only falls back to `row.name` / `row.date`
 * when the resolved state is `Blank` - i.e. when NOTHING is known about that line. A
 * Signed line prints the frozen stamp, a Pending line prints nothing, and a provisional
 * line prints the logged-in user. So injecting the ledger here can never overwrite a
 * server fact; it can only replace an empty rule with the approval that really happened.
 *
 * The typed draft still wins over the ledger, because a value the user is actively editing
 * must never be yanked out from under him.
 */
export function withLedgerValues<T extends LedgerAwareRow>(
  rows: T[] | null | undefined,
  ledger: SignatureLedgerEntry[] | null | undefined,
): T[] {
  const list = Array.isArray(rows) ? rows : []
  if (list.length === 0) return []
  if (!Array.isArray(ledger) || ledger.length === 0) return list

  return list.map(row => {
    const entry = ledgerEntryAt(ledger, row.slotIndex)
    if (!entry) return row

    const name = (row.name ?? '').trim() ? row.name : entry.personName
    const date = (row.date ?? '').trim() ? row.date : entry.date

    if (name === row.name && date === row.date) return row
    return { ...row, name, date }
  })
}