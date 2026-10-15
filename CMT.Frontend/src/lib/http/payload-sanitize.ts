/**
 * =====================================================================================
 * PHASE 1 — DELIVERABLE 2 (AMENDED, REPLACES THE EXISTING FILE)
 * Copy to: CMT.Frontend/src/lib/http/payload-sanitize.ts
 *
 * WHAT CHANGED AND WHY
 * --------------------
 * The previous version only converted `""` -> `null`. That was necessary but NOT
 * sufficient, so your 400 survived it:
 *
 *     "$.revDate": "The JSON value could not be converted to Nullable<DateTime>.
 *                   Path: $.revDate | LineNumber: 0 | BytePositionInLine: 129."
 *
 * At byte 129 of the create-form body the value is not `""` — it is the PRINTED
 * hard-copy label `"MAR 11 2021"` that every form passes as `revDate`
 * (ADForm.tsx `const FORM_REV_DATE = 'MAR 11 2021'`). `System.Text.Json` cannot convert
 * it, binding aborts, and ASP.NET then also reports
 * "The command field is required." — one defect, two messages.
 *
 * THIS VERSION ADDS ONE RULE
 *     A nullable-DATE key whose value is a recognisable human date is rewritten to
 *     `YYYY-MM-DD`; a blank one still becomes `null`; anything unrecognisable becomes
 *     `null` instead of being forwarded as a value the backend must reject.
 *
 * IT ALSO EXPORTS THE NAME THE PROXY LOOKS FOR FIRST
 *     `route.ts` resolves `sanitizeRequestBodyText ?? sanitizeJsonBody`. Only the second
 *     existed, so the proxy logged
 *     "No body sanitiser export found …; forwarding the raw body … unchanged."
 *     Both names are now exported and point at the same implementation.
 *
 * THE EIGHT HARD RULES (six original, two new)
 *   (1) NEVER CHANGE A MEANINGFUL VALUE. `"0"`, `"false"`, `"N/A"` on a free-text key all
 *       survive untouched.
 *   (2) NEVER DROP A KEY. Only the VALUE may change, because EF Core treats an absent key
 *       ("leave the column alone") and an explicit null ("clear the column") differently.
 *   (3) FREE-TEXT STRINGS ARE NOT TOUCHED. `"description": ""` stays `""`.
 *   (4) NEVER THROW. Non-JSON, multipart or malformed bodies are forwarded byte-for-byte.
 *   (5) DEPTH-CAPPED recursion, so a hostile payload cannot hang the route.
 *   (6) IT IS A SAFETY NET, NOT A LICENCE.
 *   (7) NEW — A DATE VALUE IS RESHAPED, NEVER REINTERPRETED. An already-ISO value is
 *       returned untouched, and a date-only value never gains a time or a "Z", so no
 *       timezone can move it to the previous day.
 *   (8) NEW — `formDataJson` IS NEVER RECURSED INTO. It arrives as a STRING and stays a
 *       string, so the printed labels the forms keep inside it (`cmmRevDate`,
 *       `issueDate`, `preparedDate`, …) are preserved exactly as typed.
 * =====================================================================================
 */

import { needsIsoNormalisation, toIsoDateOrNull } from './date-normalize'

/** Recursion guard (rule 5). Real self-evaluation payloads are 3–4 levels deep. */
const MAX_DEPTH = 12

/**
 * Key SUFFIXES whose contract is a nullable DATE / DATE-TIME.
 * Compared against the normalised key, so `revDate`, `REV_DATE`, `preparedByDate`,
 * `calibrationDueDate`, `targetDate`, `signedAt`, `approvedOn` all match.
 */
const DATE_KEY_SUFFIXES = [
  'date',
  'dates',
  'dateutc',
  'datetime',
  'at',
  'aton',
  'on',
  'expiry',
  'expires',
  'expirydate',
  'duedate',
  'deadline',
  'timestamp',
] as const

/** Dates whose NAME does not end in a date-ish suffix. */
const DATE_KEY_EXACT = new Set([
  'revdate',
  'rev_date',
  'revisiondate',
  'revision_date',
  'issue',
  'issued',
  'effective',
  'effectivity',
  'nextrevision',
  'next_revision',
  'periodstart',
  'periodend',
  'validfrom',
  'validto',
  'validuntil',
  'trainingcompletion',
  'trainingcompletiondate',
  'calibrationdue',
  'lastcalibration',
])

/**
 * NEW (rule 7). Keys that LOOK like dates but whose backend contract is a `string`
 * DISPLAY LABEL, not `DateTime?`. Their `""` -> `null` behaviour is unchanged, but their
 * text is never reshaped, so "MAR 11 2021" keeps printing as "MAR 11 2021".
 *
 *   cmmRevDate      — ATARecord / DTO map it as a string label taken from the CMM portal
 *   formRevDate     — the controlled document's own printed revision label
 *   revDateLabel    — explicit label field used by the document chrome
 */
const DATE_LABEL_KEY_EXACT = new Set([
  'cmmrevdate',
  'cmm_rev_date',
  'cmmrevdatelabel',
  'formrevdate',
  'form_rev_date',
  'revdatelabel',
  'printedrevdate',
])

/**
 * Key SUFFIXES whose contract is a nullable NUMBER (`int?`, `long?`, `decimal?`).
 * `id` is deliberately INCLUDED: `assignedToUserId: ""` is exactly as fatal as `revDate: ""`.
 */
const NUMERIC_KEY_SUFFIXES = [
  'id',
  'ids',
  'no',
  'num',
  'number',
  'qty',
  'quantity',
  'count',
  'amount',
  'total',
  'version',
  'sequence',
  'seq',
  'stepno',
  'order',
  'index',
  'percent',
  'percentage',
  'score',
  'hours',
  'days',
  'months',
  'years',
  'tolerance',
  'weight',
  'length',
  'width',
  'height',
  'pressure',
  'temperature',
] as const

/**
 * Keys that LOOK numeric by suffix but are genuinely FREE TEXT on the controlled forms,
 * so `""` must survive as `""`. Every entry was taken from an actual hard copy.
 *
 *   MNT-1229B : "Mfg P/N", "Kit P/N", "ET P/N"   -> part NUMBERS are strings
 *   MNT-1420A : "SB No.", "SL No.", "SIL No."    -> alphanumeric ("A320-32-1234")
 *   MNT-1420B : "AD No."                         -> alphanumeric ("2019-08-12")
 *   MNT-918   : "Form No."                       -> "MNT-918"
 */
const TEXTUAL_KEY_EXACT = new Set([
  // AMENDED (department-create 400): free-text keys whose NAME ends in a dangerous
  // date/numeric suffix. 'description', 'reason' and 'revision' all end in "on", which
  // is in DATE_KEY_SUFFIXES, so the old heuristic rewrote "description": "" -> null
  // (the "[SELF-EVALUATION API] Normalised body of POST departments" log line) and the
  // backend's implicit [Required] then answered
  // 400 { "Description": ["The Description field is required."] }.
  // Worse, a NON-blank free text such as "Line maintenance" was also converted to null
  // by the date branch, silently destroying the value. These keys now short-circuit
  // both isNullableOnEmptyString() and isDateKey().
  'description', 'desc', 'reason', 'revision',
  'notes', 'note', 'comments', 'comment', 'remarks', 'remark',
  'partno', 'part_no', 'partnumber', 'part_number', 'pn',
  'mfgpn', 'mfg_pn', 'kitpn', 'kit_pn', 'etpn', 'et_pn',
  'serialno', 'serial_no', 'serialnumber',
  'sbno', 'sb_no', 'slno', 'sl_no', 'silno', 'sil_no',
  'adno', 'ad_no',
  'formno', 'form_no', 'formnumber',
  'documentno', 'document_no', 'docno', 'doc_no',
  'taskno', 'task_no', 'taskcardno', 'taskcard_no',
  'atano', 'ata_no', 'atachapter', 'atachaptercode',
  'toolno', 'tool_no',
  'acquisitioncode', 'usagecode',
  'model', 'manufacturer',
  'revno', 'rev_no', 'revisionno', 'revision_no',
  'phoneno', 'phone_no',
  'employeeno', 'employee_no', 'badgeno', 'badge_no',
])

/** Nullable GUID contracts. Empty string -> null, otherwise untouched. */
const GUID_KEY_EXACT = new Set([
  'folderid', 'folder_id',
  'formsubmissionid', 'formsubmission_id',
  'atarecordid', 'atarecord_id',
  'componentid', 'component_id',
  'shopid', 'shop_id',
  'departmentid', 'department_id',
  'signatureid', 'signature_id',
  'workflowinstanceid', 'instanceid',
  'stepid', 'step_id',
  'parentid',
  'assignedtouserid', 'delegatedtouserid', 'currentapproveruserid',
])

/**
 * NEW (rule 8). Keys whose VALUE is an opaque payload the sanitiser must not inspect.
 * `formDataJson` is a JSON document serialised INTO a string; rewriting anything inside it
 * would silently change what the document prints.
 */
const OPAQUE_KEY_EXACT = new Set([
  'formdatajson',
  'form_data_json',
  'payloadjson',
  'datajson',
  'snapshotjson',
  'signaturedataurl',
  'signaturebase64',
])

/** "  Rev_Date " -> "revdate". The single normal form of every key comparison. */
function normalizeKey(key: string): string {
  return key.replace(/[^\p{L}\p{N}]+/gu, '').toLowerCase()
}

function endsWithAny(key: string, suffixes: readonly string[]): boolean {
  return suffixes.some(suffix => key.endsWith(suffix))
}

/** True when the key's contract is a nullable DATE that may be reshaped to ISO. */
export function isDateKey(rawKey: string): boolean {
  const key = normalizeKey(rawKey)
  if (!key) return false
  if (DATE_LABEL_KEY_EXACT.has(key)) return false // rule 7
  if (TEXTUAL_KEY_EXACT.has(key)) return false
  if (DATE_KEY_EXACT.has(key)) return true
  return endsWithAny(key, DATE_KEY_SUFFIXES)
}

/** True when the value must be left completely alone (rule 8). */
export function isOpaqueKey(rawKey: string): boolean {
  return OPAQUE_KEY_EXACT.has(normalizeKey(rawKey))
}

/** True when `""` on this key must become `null` (rule 1: nullable contracts only). */
export function isNullableOnEmptyString(rawKey: string): boolean {
  const key = normalizeKey(rawKey)
  if (!key) return false

  // Rule 3 + the P/N reality of the hard copies: free text always wins over the heuristic.
  if (TEXTUAL_KEY_EXACT.has(key)) return false
  if (OPAQUE_KEY_EXACT.has(key)) return false

  if (DATE_LABEL_KEY_EXACT.has(key)) return true
  if (DATE_KEY_EXACT.has(key)) return true
  if (GUID_KEY_EXACT.has(key)) return true
  if (endsWithAny(key, DATE_KEY_SUFFIXES)) return true
  if (endsWithAny(key, NUMERIC_KEY_SUFFIXES)) return true

  return false
}

/** True for `""` and for a string that is only whitespace. */
function isBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === ''
}

/**
 * Recursively sanitises one parsed JSON value.
 *
 * WHAT IT CHANGES
 *   - `"revDate": "MAR 11 2021"`  -> `"revDate": "2021-03-11"`   <-- THE REPORTED 400
 *   - `"revDate": "15 January 2020"` -> `"revDate": "2020-01-15"`
 *   - `"revDate": ""` / `"   "`   -> `"revDate": null`
 *   - `"revDate": "TBD"`          -> `"revDate": null`  (unconvertible, so never sent raw)
 *   - `"qty": ""`                 -> `"qty": null`
 *   - `"assignedToUserId": ""`    -> `"assignedToUserId": null`
 *   - `NaN` / `Infinity`          -> `null`
 *   - `undefined`                 -> `null`
 *
 * WHAT IT NEVER CHANGES
 *   - `"revDate": "2021-03-11"`   (already ISO, rule 7)
 *   - `"cmmRevDate": "MAR 11 2021"` (display label, rule 7)
 *   - `"formDataJson": "{…}"`     (opaque, rule 8)
 *   - `"description": ""`, `"partNo": ""` (free text, rule 3)
 *   - `"qty": 0`, `false`         (meaningful values, rule 1)
 *   - the SET OF KEYS             (rule 2)
 */
export function sanitizeJsonValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return value

  if (Array.isArray(value)) {
    return value.map(item => (item === undefined ? null : sanitizeJsonValue(item, depth + 1)))
  }

  if (typeof value === 'number' && !Number.isFinite(value)) return null

  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const out: Record<string, unknown> = {}

    for (const [key, raw] of Object.entries(source)) {
      // Rule 8 — opaque payloads pass through untouched, and are NOT recursed into.
      if (isOpaqueKey(key)) {
        out[key] = raw === undefined ? null : raw
        continue
      }

      // Rule 2 — the KEY is always preserved, only the VALUE may change.
      if (isBlankString(raw) && isNullableOnEmptyString(key)) {
        out[key] = null
        continue
      }

      if (raw === undefined) {
        out[key] = null
        continue
      }

      // Rule 7 — the date fix that resolves the reported 400.
      if (typeof raw === 'string' && isDateKey(key)) {
        if (needsIsoNormalisation(raw)) {
          out[key] = toIsoDateOrNull(raw)
          continue
        }
        // Already ISO -> untouched. Unconvertible text -> null rather than a guaranteed 400.
        const iso = toIsoDateOrNull(raw)
        out[key] = iso
        continue
      }

      out[key] = sanitizeJsonValue(raw, depth + 1)
    }

    return out
  }

  return value
}

/**
 * Sanitises a RAW JSON request body.
 *
 * Returns the original text untouched when it is empty, when it is not JSON, or when the
 * rewrite fails (rule 4 — a multipart upload, a plain-text body or malformed JSON must be
 * forwarded byte-for-byte so the backend can produce its own accurate error).
 */
export function sanitizeJsonBody(text: string): string {
  if (!text) return text

  const trimmed = text.trim()
  if (!trimmed) return text
  if (trimmed[0] !== '{' && trimmed[0] !== '[') return text

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return text // Rule 4: not our problem, and not our right to rewrite.
  }

  try {
    const serialized = JSON.stringify(sanitizeJsonValue(parsed))
    return typeof serialized === 'string' ? serialized : text
  } catch {
    return text
  }
}

/**
 * CANONICAL EXPORT NAME. `src/app/api/self-evaluation/[...path]/route.ts` resolves
 * `sanitizeRequestBodyText ?? sanitizeJsonBody` at call time; exporting both means the
 * proxy stops logging "No body sanitiser export found".
 */
export const sanitizeRequestBodyText = sanitizeJsonBody

/**
 * Diagnostic helper: which keys WOULD be rewritten, for one parsed body.
 *
 *     console.log('[SANITISE]', rewrittenDateKeys(JSON.parse(text)))
 *     // -> ['revDate']   on the exact payload of your 400
 */
export function rewrittenDateKeys(value: unknown, depth = 0, prefix = ''): string[] {
  if (depth > MAX_DEPTH) return []

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => rewrittenDateKeys(item, depth + 1, `${prefix}[${index}]`))
  }

  if (value !== null && typeof value === 'object') {
    const out: string[] = []
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (isOpaqueKey(key)) continue
      if (typeof raw === 'string' && isDateKey(key) && needsIsoNormalisation(raw)) {
        out.push(`${path}: "${raw}" -> "${toIsoDateOrNull(raw)}"`)
        continue
      }
      out.push(...rewrittenDateKeys(raw, depth + 1, path))
    }
    return out
  }

  return []
}

/** Kept for backward compatibility with the previous diagnostic name. */
export function emptyNullableKeys(value: unknown, depth = 0, prefix = ''): string[] {
  if (depth > MAX_DEPTH) return []

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => emptyNullableKeys(item, depth + 1, `${prefix}[${index}]`))
  }

  if (value !== null && typeof value === 'object') {
    const out: string[] = []
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key
      if (isBlankString(raw) && isNullableOnEmptyString(key)) {
        out.push(path)
        continue
      }
      out.push(...emptyNullableKeys(raw, depth + 1, path))
    }
    return out
  }

  return []
}