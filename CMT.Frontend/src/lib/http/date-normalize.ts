/**
 * =====================================================================================
 * PHASE 1 — DELIVERABLE 1 (NEW FILE): THE DATE NORMALISER
 * Copy to: CMT.Frontend/src/lib/http/date-normalize.ts
 *
 * THE ACTUAL ROOT CAUSE OF THE 400 YOU PASTED
 * -------------------------------------------
 * The 400 body was:
 *
 *   "errors": {
 *     "command":     ["The command field is required."],
 *     "$.revDate":   ["The JSON value could not be converted to
 *                     System.Nullable`1[System.DateTime].
 *                     Path: $.revDate | LineNumber: 0 | BytePositionInLine: 129."]
 *   }
 *
 * The existing `payload-sanitize.ts` assumed the offending value was an EMPTY string
 * from an untouched <input type="date">. It is not. Every controlled document declares
 * its revision date as the PRINTED HARD-COPY LABEL, e.g. in ADForm.tsx:
 *
 *     const FORM_REV_DATE = 'MAR 11 2021'
 *     ...
 *     useFormData<FormData>(defaultData, { formType: 'ad', formNo: 'MNT-1420B',
 *                                          revNo: '01', revDate: FORM_REV_DATE })
 *
 * `useFormData` forwards that verbatim, so the wire body contains:
 *
 *     {"ataRecordId":"…","formType":"ad","formNo":"MNT-1420B","revNo":"01",
 *      "revDate":"MAR 11 2021", …}
 *                 ^^^^^^^^^^^^  byte position 129 — exactly what the backend reported
 *
 * `System.Text.Json` cannot convert "MAR 11 2021" to `DateTime?`. It ABORTS model
 * binding for the whole body, which is why ASP.NET *also* reports
 * "The command field is required." — that message is a SYMPTOM, not a second bug.
 * The empty-string sanitiser could never have fixed it, because the value was never
 * empty. This is why the 400 survived the previous amendment.
 *
 * The same label style is used by every other form, so the defect is systemic:
 *   ADForm.tsx                     'MAR 11 2021'
 *   SBForm.tsx                     FORM_REV_DATE
 *   ToolNeedAnalysisReportForm.tsx FORM_REV_DATE
 *   PeriodicSelfAuditForm.tsx      FORM_REV_DATE
 *   Form918FAA.tsx / Form918ACAA   FORM_REV_DATE
 *   InspectionProficiencyForm.tsx  FORM_REV_DATE
 *   CompetenceAssessmentForm.tsx   FORM_REV_DATE
 *   AuthorizationCertificateBlock  '15 January 2020'
 *
 * WHAT THIS MODULE DOES
 *   Converts a human printed date label into the one shape `System.Text.Json` always
 *   accepts for `DateTime?` — `YYYY-MM-DD` (or full ISO when a time is present) — and
 *   returns `null` when the value is blank or genuinely not a date.
 *
 * HARD RULES
 *   (1) A value that is ALREADY ISO is returned unchanged (no timezone shifting).
 *   (2) A date-only input produces a DATE-ONLY output. Never append "Z", because
 *       "2021-03-11T00:00:00Z" can render as 10 MAR in a negative-offset timezone.
 *   (3) Calendar validity is enforced: "FEB 30 2021" -> null, not 02 MAR.
 *   (4) NEVER THROW. Anything unrecognised returns null, and the caller then sends
 *       an explicit null, which `DateTime?` accepts.
 *   (5) The PRINTED label on the document is NOT changed. This module only touches the
 *       value on the WIRE. `FORM_REV_DATE` keeps rendering as "MAR 11 2021" on screen.
 * =====================================================================================
 */

/**
 * How a purely numeric slash / dot date is read when BOTH parts are <= 12 and therefore
 * ambiguous ("11/03/2021").
 *
 * 'DMY' -> 11 March 2021   (Ethiopian / EASA / ECAA document convention — the default)
 * 'MDY' -> 3 November 2021 (US convention)
 *
 * Unambiguous inputs ignore this setting: "25/12/2021" is always 25 December.
 */
export const SLASH_DATE_ORDER: 'DMY' | 'MDY' = 'DMY'

const MONTH_BY_NAME: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

/** Matches a value that is already an acceptable ISO date, with or without a time part. */
const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,7})?)?(Z|[+-]\d{2}:?\d{2})?$/

/** "MAR 11 2021" · "MAR 11, 2021" · "March 11 2021" */
const MONTH_FIRST = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\s*,?\s+(\d{4})$/
/** "11 MAR 2021" · "11-MAR-2021" · "11 March, 2021" */
const DAY_FIRST = /^(\d{1,2})(?:st|nd|rd|th)?[\s.\-/]+([A-Za-z]{3,9})\.?[\s.\-/]+,?\s*(\d{4})$/
/** "11/03/2021" · "11-03-2021" · "11.03.2021" */
const NUMERIC_SEPARATED = /^(\d{1,4})[\s.\-/](\d{1,2})[\s.\-/](\d{1,4})$/
/** "20210311" */
const COMPACT = /^(\d{4})(\d{2})(\d{2})$/

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value)
}

/** True only for a real calendar date, so 2021-02-30 is rejected. */
function isRealDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  if (year < 1900 || year > 2200) return false
  if (month < 1 || month > 12) return false
  if (day < 1 || day > 31) return false
  const probe = new Date(Date.UTC(year, month - 1, day))
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  )
}

function build(year: number, month: number, day: number): string | null {
  if (!isRealDate(year, month, day)) return null
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function monthFromName(raw: string): number | null {
  const key = raw.trim().toLowerCase().replace(/\.$/, '')
  return MONTH_BY_NAME[key] ?? null
}

/**
 * Converts one value into `YYYY-MM-DD` (or a full ISO string when the input carried a
 * time), or returns null.
 *
 * ACCEPTS
 *   'MAR 11 2021' · 'MAR 11, 2021' · 'March 11 2021'
 *   '11 MAR 2021' · '11-MAR-2021'  · '15 January 2020'
 *   '2021-03-11'  · '2021-03-11T08:30:00Z' (returned unchanged, rule 1)
 *   '11/03/2021'  · '11.03.2021' · '2021/03/11' · '20210311'
 *   a `Date` instance · an epoch number (ms or s)
 *
 * RETURNS null FOR
 *   '' · '   ' · null · undefined · 'N/A' · 'TBD' · 'MAR 11' · 'FEB 30 2021' · 'not a date'
 */
export function toIsoDateOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return build(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    // Values below 10^11 are far more likely to be seconds than milliseconds.
    const ms = Math.abs(value) < 1e11 ? value * 1000 : value
    const probe = new Date(ms)
    if (Number.isNaN(probe.getTime())) return null
    return build(probe.getUTCFullYear(), probe.getUTCMonth() + 1, probe.getUTCDate())
  }

  if (typeof value !== 'string') return null

  const text = value.trim().replace(/\s+/g, ' ')
  if (!text) return null

  // Explicit "no value" markers used on the hard copies.
  if (/^(n\/?a|na|nil|none|tbd|tba|-{1,3})$/i.test(text)) return null

  // Rule 1: already ISO — never touched, never timezone-shifted.
  if (ISO_DATE_ONLY.test(text)) return text
  if (ISO_DATE_TIME.test(text)) return text

  let match = MONTH_FIRST.exec(text)
  if (match) {
    const month = monthFromName(match[1])
    if (month === null) return null
    return build(Number(match[3]), month, Number(match[2]))
  }

  match = DAY_FIRST.exec(text)
  if (match) {
    const month = monthFromName(match[2])
    if (month === null) return null
    return build(Number(match[3]), month, Number(match[1]))
  }

  match = COMPACT.exec(text)
  if (match) {
    return build(Number(match[1]), Number(match[2]), Number(match[3]))
  }

  match = NUMERIC_SEPARATED.exec(text)
  if (match) {
    const first = Number(match[1])
    const middle = Number(match[2])
    const last = Number(match[3])

    // "2021/03/11" — a four digit leading group can only be the year.
    if (match[1].length === 4) return build(first, middle, last)
    // "11/03/2021" — a four digit trailing group is the year; order may be ambiguous.
    if (match[3].length === 4) {
      if (first > 12) return build(last, middle, first)   // day must come first
      if (middle > 12) return build(last, first, middle)  // day must come second
      return SLASH_DATE_ORDER === 'DMY'
        ? build(last, middle, first)
        : build(last, first, middle)
    }
    return null // two digit years are too ambiguous for a controlled document.
  }

  return null
}

/**
 * True when the value is a non-blank string that is NOT already ISO but IS convertible.
 * Used by the sanitiser to decide whether a rewrite is even needed.
 */
export function needsIsoNormalisation(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const text = value.trim()
  if (!text) return false
  if (ISO_DATE_ONLY.test(text) || ISO_DATE_TIME.test(text)) return false
  return toIsoDateOrNull(text) !== null
}

/** Convenience for form code: normalise, or fall back to null. Never throws. */
export function normaliseFormRevDate(value: unknown): string | null {
  try {
    return toIsoDateOrNull(value)
  } catch {
    return null
  }
}