/**
 * datetime-utils.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * LAYER 1 — THE ONLY PLACE WHERE A TIMESTAMP IS PARSED OR CONVERTED.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * REPORTED DEFECT
 *   Task Details → Timeline
 *       Task Assigned At  : Aug 21, 2026 at 9:05:53 AM GMT+3
 *       Target Completion : Aug 21, 2026 at 9:05:00 AM GMT+3   ← BEFORE assignment
 *   Update Task → Status & Timeline
 *       Task Assigned At  : Aug 21, 2026 at 9:05:53 AM GMT+3
 *       Target Completion : 08/21/2026 09:35 AM                ← assigned + 30 min
 *
 * TWO INDEPENDENT ROOT CAUSES
 *
 *   (A) STRING PARSING — the .NET API serializes some columns WITHOUT a
 *       timezone designator:
 *
 *           "2026-08-21T06:05:53Z"          → parsed as UTC        (correct)
 *           "2026-08-21T06:05:00"           → parsed as LOCAL time (WRONG)
 *           "2026-08-21 06:05:00.1234567"   → SQL style, 7 digits  (WRONG/NaN)
 *
 *       A designator-less value is therefore shifted by the browser offset
 *       relative to a value that has "Z". Two fields of the same task end up
 *       on two different clocks, which is exactly how Target Completion can
 *       render BEFORE Task Assigned At.
 *       → FIX: `normalizeToIso()` treats "no offset" as UTC (what the backend
 *         actually stores) and returns a real ISO-8601 UTC string.
 *
 *   (B) TWO CLOCKS — the READ path formatted the instant in the user's
 *       SELECTED timezone (Intl + Africa/Addis_Ababa = GMT+3), while the WRITE
 *       path (`<input type="datetime-local">`) built/parsed the value with
 *       `getHours()` / `new Date(...)`, i.e. in the BROWSER timezone (usually
 *       UTC on a hosted machine). Editing a task silently shifted the stored
 *       value by the offset difference (3 h in the report).
 *       → FIX: `toDateTimeInputInZone()` / `fromZonedInput()` convert between
 *         "UTC instant" and "wall clock inside an IANA timezone" WITHOUT ever
 *         consulting the browser clock.
 *
 * CONTRACT ENFORCED BY THIS MODULE
 *   • Storage / transport   → always UTC ISO-8601 with an explicit "Z".
 *   • Display              → always the user's SELECTED timezone.
 *   • Form input / output  → always the user's SELECTED timezone.
 *   • Comparisons / maths  → always epoch milliseconds of normalized values.
 *
 * Nothing in this file imports React, so it can be used by pages, components,
 * Next.js route handlers and plain utilities alike.
 */

/* ═════════════════════════════ constants ═════════════════════════════════ */

/** Fallback timezone for the whole app (East Africa Time, GMT+3). */
export const DEFAULT_TIME_ZONE = 'Africa/Addis_Ababa'

/** Matches a trailing "Z" or a "+hh:mm" / "-hhmm" UTC offset. */
const HAS_TZ_DESIGNATOR = /(z|[+-]\d{2}:?\d{2})$/i

/** Matches a date-only value such as "2026-08-21". */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Matches a "naked" date-time value with NO timezone designator, e.g.
 * "2026-08-21T06:05:53", "2026-08-21 06:05:53.1234567", "2026-08-21T06:05".
 */
export const NAKED_DATETIME =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/

/** "YYYY-MM-DD[THH:mm[:ss[.fff]]]" — a wall clock with no offset information. */
const WALL_CLOCK =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/

/** `default(DateTime)` in .NET — means "no value", never a real timestamp. */
const DOTNET_DEFAULT_PREFIX = '0001-01-01'

const pad2 = (n: number) => String(n).padStart(2, '0')

/* ═════════════════════════ 1. normalization (read) ═══════════════════════ */

/**
 * Normalize ANY backend timestamp into a real ISO-8601 UTC string ("...Z").
 * Returns `null` when the value is empty, a .NET default, or unparseable.
 *
 *   "2026-08-21T06:05:53Z"        → "2026-08-21T06:05:53.000Z"
 *   "2026-08-21T06:05:53"         → "2026-08-21T06:05:53.000Z"  (assumed UTC)
 *   "2026-08-21 06:05:53.1234567" → "2026-08-21T06:05:53.123Z"
 *   "2026-08-21"                  → "2026-08-21T00:00:00.000Z"
 *   "0001-01-01T00:00:00"         → null
 */
export function normalizeToIso(
  input?: string | number | Date | null
): string | null {
  if (input === null || input === undefined || input === '') return null

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input.toISOString()
  }

  if (typeof input === 'number') {
    const fromNumber = new Date(input)
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber.toISOString()
  }

  let raw = String(input).trim()
  const lowered = raw.toLowerCase()
  if (raw === '' || lowered === 'null' || lowered === 'undefined' || lowered === 'n/a') {
    return null
  }

  // .NET default DateTime → "no value".
  if (raw.startsWith(DOTNET_DEFAULT_PREFIX)) return null

  // Date only → midnight UTC (never local midnight, which would shift the day).
  if (DATE_ONLY.test(raw)) {
    const dateOnly = new Date(`${raw}T00:00:00Z`)
    return Number.isNaN(dateOnly.getTime()) ? null : dateOnly.toISOString()
  }

  // SQL Server style "yyyy-MM-dd HH:mm:ss" → ISO separator.
  if (raw.includes(' ') && !raw.includes('T')) {
    raw = raw.replace(' ', 'T')
  }

  // .NET can emit 7 fractional digits; JS accepts only 3.
  raw = raw.replace(/(\.\d{3})\d+/, '$1')

  // THE ACTUAL FIX: no offset means the backend gave us UTC.
  if (!HAS_TZ_DESIGNATOR.test(raw)) {
    raw = `${raw}Z`
  }

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()

  // Last resort: pre-formatted display strings ("Aug 21, 2026 9:05:53 AM").
  const fallback = new Date(String(input))
  return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString()
}

/** Normalized `Date` object (UTC-safe) or `null`. */
export function parseTimestamp(
  input?: string | number | Date | null
): Date | null {
  const iso = normalizeToIso(input)
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

/** Normalized epoch milliseconds or `null`. Use this for EVERY comparison. */
export function timestampMs(
  input?: string | number | Date | null
): number | null {
  const d = parseTimestamp(input)
  return d ? d.getTime() : null
}

/** True when the value is a usable timestamp (not empty, not a .NET default). */
export function hasTimestamp(input?: string | number | Date | null): boolean {
  return timestampMs(input) !== null
}

/**
 * True when both values describe the same instant at minute precision.
 * Used to decide whether a Target Completion really changed before PUTting it.
 */
export function isSameInstant(
  a?: string | number | Date | null,
  b?: string | number | Date | null
): boolean {
  const ms1 = timestampMs(a)
  const ms2 = timestampMs(b)
  if (ms1 === null || ms2 === null) return ms1 === ms2
  return Math.floor(ms1 / 60000) === Math.floor(ms2 / 60000)
}

/* ═══════════════════ 2. timezone core (Intl, DST-correct) ════════════════ */

/** Wall-clock fields of an instant, as seen inside a specific IANA timezone. */
export interface ZonedParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/**
 * Break a UTC instant into its wall-clock fields inside `timeZone`.
 * `Intl` is the only DST-correct source available in the browser.
 */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(date)

    const read = (type: string) =>
      Number(parts.find((p) => p.type === type)?.value ?? 'NaN')

    const year = read('year')
    const month = read('month')
    const day = read('day')
    let hour = read('hour')
    const minute = read('minute')
    const second = read('second')

    if ([year, month, day, hour, minute, second].some((v) => Number.isNaN(v))) {
      throw new Error('unparsable parts')
    }
    // Some engines emit "24" for midnight.
    if (hour === 24) hour = 0

    return { year, month, day, hour, minute, second }
  } catch {
    // Invalid timezone id → degrade to the browser clock rather than crash.
    return {
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      day: date.getDate(),
      hour: date.getHours(),
      minute: date.getMinutes(),
      second: date.getSeconds(),
    }
  }
}

/**
 * Offset of `timeZone` at the given instant, in milliseconds
 * (Africa/Addis_Ababa → +10800000). DST-correct because it comes from Intl.
 */
export function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const p = getZonedParts(date, timeZone)
  const wallClockAsUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second
  )
  // formatToParts has second precision: drop ms from both sides.
  const instantWithoutMs = date.getTime() - date.getMilliseconds()
  return wallClockAsUtc - instantWithoutMs
}

/** Argument-swapped alias kept for existing call sites. */
export function timeZoneOffsetMs(timeZone: string, date: Date): number {
  return getTimeZoneOffsetMs(date, timeZone)
}

/** Short timezone label, e.g. "GMT+3" for Africa/Addis_Ababa. */
export function getTimeZoneAbbreviation(timeZone: string, date?: Date): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'short',
    }).formatToParts(date ?? new Date())
    return parts.find((p) => p.type === 'timeZoneName')?.value || timeZone
  } catch {
    return timeZone
  }
}

/** The browser's own IANA timezone (used only as a display default). */
export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIME_ZONE
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

/* ═══════════ 3. read path: UTC instant → form input in a timezone ════════ */

/**
 * UTC instant (or any raw API string) → "YYYY-MM-DDTHH:mm" expressed in
 * `timeZone`, ready for `<input type="datetime-local">`.
 * The control therefore shows EXACTLY what the Timeline renders.
 */
export function toDateTimeInputInZone(
  input: string | number | Date | null | undefined,
  timeZone: string
): string {
  const d = parseTimestamp(input)
  if (!d) return ''
  const p = getZonedParts(d, timeZone)
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`
}

/** Same rule with seconds, for `<input type="datetime-local" step="1">`. */
export function toDateTimeSecondsInputInZone(
  input: string | number | Date | null | undefined,
  timeZone: string
): string {
  const d = parseTimestamp(input)
  if (!d) return ''
  const p = getZonedParts(d, timeZone)
  return (
    `${p.year}-${pad2(p.month)}-${pad2(p.day)}` +
    `T${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`
  )
}

/** READ PATH for `<input type="date">` — same rule, date part only. */
export function toDateInputInZone(
  input: string | number | Date | null | undefined,
  timeZone: string
): string {
  const value = toDateTimeInputInZone(input, timeZone)
  return value ? value.slice(0, 10) : ''
}

/** "now" as a `datetime-local` value inside `timeZone`. */
export function nowDateTimeInputInZone(timeZone: string): string {
  return toDateTimeInputInZone(new Date(), timeZone)
}

/* ═══════════ 4. write path: form input in a timezone → UTC instant ═══════ */

/**
 * Interpret a wall-clock string as being typed INSIDE `timeZone` and return the
 * real UTC instant it denotes.
 *
 *   fromZonedInput('2026-08-21T09:35', 'Africa/Addis_Ababa')
 *     → 2026-08-21T06:35:00.000Z
 *
 * The offset is resolved twice so values sitting on a DST boundary (where the
 * offset before and after the instant differ) converge on the correct value.
 * A value that already carries an explicit offset is returned unchanged as an
 * absolute instant, which makes re-submitting an untouched form idempotent.
 */
export function fromZonedInput(
  value: string | number | Date | null | undefined,
  timeZone: string
): Date | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  if (typeof value === 'number') {
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const raw = String(value).trim()
  if (raw === '') return null
  if (raw.startsWith(DOTNET_DEFAULT_PREFIX)) return null

  const match = WALL_CLOCK.exec(raw)
  if (!match) {
    // Already an absolute instant ("...Z" / "+03:00") or a display string.
    const iso = normalizeToIso(raw)
    if (!iso) return null
    const absolute = new Date(iso)
    return Number.isNaN(absolute.getTime()) ? null : absolute
  }

  const [, y, mo, d, hh = '00', mi = '00', ss = '00'] = match
  const wallClockAsUtc = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(hh),
    Number(mi),
    Number(ss)
  )
  if (Number.isNaN(wallClockAsUtc)) return null

  let instant = wallClockAsUtc - getTimeZoneOffsetMs(new Date(wallClockAsUtc), timeZone)
  instant = wallClockAsUtc - getTimeZoneOffsetMs(new Date(instant), timeZone)

  const result = new Date(instant)
  return Number.isNaN(result.getTime()) ? null : result
}

/** WRITE PATH used by every form: zoned wall clock → UTC ISO string for the API. */
export function toUtcIsoFromZonedInput(
  value: string | number | Date | null | undefined,
  timeZone: string
): string | null {
  const d = fromZonedInput(value, timeZone)
  return d ? d.toISOString() : null
}

/** "YYYY-MM-DD" typed in `timeZone` → UTC Date anchored at 00:00 of that day. */
export function fromZonedDateInput(
  value: string | null | undefined,
  timeZone: string
): Date | null {
  const raw = (value ?? '').toString().trim()
  if (!raw) return null
  return fromZonedInput(raw.length <= 10 ? `${raw}T00:00:00` : raw, timeZone)
}

/* ═══════════════════ 5. calendar arithmetic in a timezone ════════════════ */

/** Midnight of the calendar day of `input`, computed inside `timeZone`. */
export function startOfDayInZone(
  input: string | number | Date | null | undefined,
  timeZone: string
): Date | null {
  const d = parseTimestamp(input ?? new Date())
  if (!d) return null
  const p = getZonedParts(d, timeZone)
  return fromZonedInput(
    `${p.year}-${pad2(p.month)}-${pad2(p.day)}T00:00:00`,
    timeZone
  )
}

/** End of the calendar day of `input` (23:59:59.999), computed in `timeZone`. */
export function endOfDayInZone(
  input: string | number | Date | null | undefined,
  timeZone: string
): Date | null {
  const start = startOfDayInZone(input, timeZone)
  if (!start) return null
  const nextDayParts = getZonedParts(
    new Date(start.getTime() + 86400000 + 3600000),
    timeZone
  )
  const nextStart = fromZonedInput(
    `${nextDayParts.year}-${pad2(nextDayParts.month)}-${pad2(nextDayParts.day)}T00:00:00`,
    timeZone
  )
  return nextStart
    ? new Date(nextStart.getTime() - 1)
    : new Date(start.getTime() + 86399999)
}

/**
 * Whole-day difference (`to` − `from`) counted on the calendar of `timeZone`.
 * Keeps "Nd overdue" / "Due in Nd" badges stable regardless of browser clock.
 */
export function dayDiffInZone(
  from: string | number | Date | null | undefined,
  to: string | number | Date | null | undefined,
  timeZone: string
): number | null {
  const a = startOfDayInZone(from, timeZone)
  const b = startOfDayInZone(to, timeZone)
  if (!a || !b) return null
  return Math.round((b.getTime() - a.getTime()) / 86400000)
}

/* ══════════════════════ 6. display formatting helpers ════════════════════ */

/** "Aug 21, 2026" in `timeZone`. */
export function formatDateInZone(
  input: string | number | Date | null | undefined,
  timeZone: string,
  emptyText = '—'
): string {
  const d = parseTimestamp(input)
  if (!d) return emptyText
  try {
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone,
    })
  } catch {
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }
}

/** "Aug 21, 2026 at 9:05:53 AM GMT+3" in `timeZone`. */
export function formatDateTimeInZone(
  input: string | number | Date | null | undefined,
  timeZone: string,
  emptyText = '—'
): string {
  const d = parseTimestamp(input)
  if (!d) return emptyText
  try {
    const dateStr = d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone,
    })
    const timeStr = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZone,
    })
    return `${dateStr} at ${timeStr} ${getTimeZoneAbbreviation(timeZone, d)}`
  } catch {
    return d.toLocaleString('en-US')
  }
}

/** Arbitrary `Intl` options, always pinned to `timeZone`. */
export function formatCustomInZone(
  input: string | number | Date | null | undefined,
  timeZone: string,
  options?: Intl.DateTimeFormatOptions,
  emptyText = '—'
): string {
  const d = parseTimestamp(input)
  if (!d) return emptyText
  try {
    return d.toLocaleString('en-US', { ...options, timeZone })
  } catch {
    return d.toLocaleString('en-US', options)
  }
}

/** "21/Aug/2026" in `timeZone` — the compact table format. */
export function formatDateShortInZone(
  input: string | number | Date | null | undefined,
  timeZone: string,
  emptyText = 'N/A'
): string {
  const d = parseTimestamp(input)
  if (!d) return emptyText
  const p = getZonedParts(d, timeZone)
  const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${pad2(p.day)}/${MONTHS[p.month - 1]}/${p.year}`
}

/* ═════════════════════════ 7. duration helpers ═══════════════════════════ */

/** Elapsed time between two timestamps, as decimal days (2 dp). */
export function durationInDays(
  start?: string | number | Date | null,
  end?: string | number | Date | null
): number | null {
  const a = timestampMs(start)
  const b = timestampMs(end)
  if (a === null || b === null) return null
  return Math.round(((b - a) / 86400000) * 100) / 100
}

/** Human readable "x day(s), y hour(s)" difference for variance columns. */
export function humanizeDuration(
  start?: string | number | Date | null,
  end?: string | number | Date | null
): string {
  const a = timestampMs(start)
  const b = timestampMs(end)
  if (a === null || b === null) return 'N/A'
  const diffMs = b - a
  const negative = diffMs < 0
  const abs = Math.abs(diffMs)
  const days = Math.floor(abs / 86400000)
  const hours = Math.floor((abs % 86400000) / 3600000)
  const text =
    days === 0
      ? `${hours} hour${hours !== 1 ? 's' : ''}`
      : `${days} day${days !== 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''}`
  return negative ? `-${text}` : text
}

/** "2 days 3 hours 15 minutes" from a raw millisecond duration. */
export function formatDurationMs(totalMs: number): string {
  if (!totalMs || totalMs <= 0) return ''
  const abs = Math.abs(totalMs)
  const days = Math.floor(abs / 86400000)
  const hours = Math.floor((abs % 86400000) / 3600000)
  const minutes = Math.floor((abs % 3600000) / 60000)
  const parts: string[] = []
  if (days > 0) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours > 0) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (minutes > 0) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  if (parts.length === 0) parts.push('0 minutes')
  return `${totalMs < 0 ? '-' : ''}${parts.join(' ')}`
}

/* ════════════ 8. legacy browser-local helpers (kept for compat) ══════════ */

/**
 * @deprecated Use `toUtcIsoFromZonedInput(value, timeZone)`.
 * Converts a value typed in a BROWSER-local control into a UTC instant. Kept so
 * older call sites keep compiling; it must not be used for Target Completion.
 */
export function toUtcIsoFromLocalInput(
  input?: string | number | Date | null
): string | null {
  if (input === null || input === undefined || input === '') return null
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input.toISOString()
  }
  if (typeof input === 'number') {
    const d = new Date(input)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }

  let raw = String(input).trim()
  if (raw === '' || raw.startsWith(DOTNET_DEFAULT_PREFIX)) return null

  if (HAS_TZ_DESIGNATOR.test(raw)) {
    const absolute = new Date(raw)
    return Number.isNaN(absolute.getTime()) ? null : absolute.toISOString()
  }
  if (raw.includes(' ') && !raw.includes('T')) raw = raw.replace(' ', 'T')
  raw = raw.replace(/(\.\d{3})\d+/, '$1')
  if (DATE_ONLY.test(raw)) raw = `${raw}T00:00:00`
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) raw = `${raw}:00`

  const local = new Date(raw)
  return Number.isNaN(local.getTime()) ? null : local.toISOString()
}

/** @deprecated Use `toDateTimeInputInZone(input, timeZone)`. */
export function toDateTimeLocalInputValue(
  input?: string | number | Date | null
): string {
  const d = parseTimestamp(input)
  if (!d) return ''
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` +
    `T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  )
}

/** @deprecated Use `toDateInputInZone(input, timeZone)`. */
export function toDateInputValue(input?: string | number | Date | null): string {
  const local = toDateTimeLocalInputValue(input)
  return local ? local.slice(0, 10) : ''
}

/** @deprecated Use `startOfDayInZone(date, timeZone)`. Browser-local day start. */
export function startOfDayMs(dateInput: string): number | null {
  if (!dateInput) return null
  const d = new Date(`${dateInput}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

/** @deprecated Use `endOfDayInZone(date, timeZone)`. Browser-local day end. */
export function endOfDayMs(dateInput: string): number | null {
  if (!dateInput) return null
  const d = new Date(`${dateInput}T23:59:59.999`)
  return Number.isNaN(d.getTime()) ? null : d.getTime()
}

/* ═════════════════ 9. task field resolution (naming variants) ════════════ */

/** Every field name the API uses for a task timestamp. */
export const TASK_DATE_FIELDS = [
  'createdAt', 'created_at', 'CreatedAt',
  'updatedAt', 'updated_at', 'UpdatedAt',
  'assignedAt', 'assigned_at', 'AssignedAt',
  'taskAssignedAt', 'task_assigned_at', 'TaskAssignedAt',
  'statusChangedAt', 'status_changed_at', 'StatusChangedAt',
  'estimatedCompletionDate', 'estimated_completion_date', 'EstimatedCompletionDate',
  'targetCompletionDate', 'target_completion_date', 'TargetCompletionDate', 'target_completion',
  'originalTargetCompletionDate', 'original_target_completion_date', 'OriginalTargetCompletionDate',
  'extendedTargetCompletionDate', 'extended_target_completion_date', 'ExtendedTargetCompletionDate',
  'revisedTargetCompletionDate', 'revised_target_completion_date', 'RevisedTargetCompletionDate',
  'newTargetCompletionDate', 'new_target_completion_date', 'NewTargetCompletionDate',
  'effective_target_completion_date',
  'actualCompletionDate', 'actual_completion_date', 'ActualCompletionDate', 'actual_completion',
  'completedAt', 'completed_at', 'CompletedAt',
  'engineerCompletedAt', 'engineer_completed_at', 'EngineerCompletedAt',
  'uploadedAt', 'uploaded_at', 'UploadedAt',
  'pausedAt', 'paused_at', 'PausedAt',
  'resumedAt', 'resumed_at', 'ResumedAt',
] as const

/** Flatten `task` with its nested `raw` payload so any casing can be read. */
export function flattenTaskSource(task: any): Record<string, any> {
  if (!task || typeof task !== 'object') return {}
  return { ...(task.raw ?? {}), ...task }
}

/** First non-null normalized timestamp among `keys` of `task`. */
export function pickTimestamp(task: any, keys: string[]): string | null {
  const source = flattenTaskSource(task)
  for (const key of keys) {
    const iso = normalizeToIso(source[key])
    if (iso) return iso
  }
  return null
}

/**
 * Normalize EVERY known timestamp field of a task (and of its nested `raw`)
 * in place-free fashion: returns a shallow clone whose date fields are all
 * ISO-8601 UTC strings. Call it once, right after `res.json()`, so no component
 * can ever see a designator-less value again.
 */
export function normalizeTaskDates<T extends Record<string, any>>(task: T): T {
  if (!task || typeof task !== 'object') return task
  const clone: Record<string, any> = Array.isArray(task) ? [...(task as any)] : { ...task }

  for (const field of TASK_DATE_FIELDS) {
    if (clone[field] !== undefined && clone[field] !== null) {
      const iso = normalizeToIso(clone[field])
      clone[field] = iso
    }
  }
  if (clone.raw && typeof clone.raw === 'object') {
    clone.raw = normalizeTaskDates(clone.raw)
  }
  return clone as T
}

/** Apply `normalizeTaskDates` to a list. */
export function normalizeTaskListDates<T extends Record<string, any>>(list: T[]): T[] {
  return Array.isArray(list) ? list.map((item) => normalizeTaskDates(item)) : list
}

/**
 * Pick the Target Completion variants exposed by the API.
 * NOTE: this is a pure FIELD reader. The business rule that decides which value
 * the UI must show lives in `target-completion.ts` (`resolveTimelineTarget`).
 */
export function resolveTargetCompletion(task: any): {
  effective: string | null
  current: string | null
  original: string | null
  extended: string | null
  isExtended: boolean
} {
  const original = pickTimestamp(task, [
    'originalTargetCompletionDate',
    'original_target_completion_date',
    'OriginalTargetCompletionDate',
  ])
  const current = pickTimestamp(task, [
    'targetCompletionDate',
    'target_completion_date',
    'TargetCompletionDate',
    'target_completion',
  ])
  const extended = pickTimestamp(task, [
    'extendedTargetCompletionDate',
    'extended_target_completion_date',
    'ExtendedTargetCompletionDate',
    'revisedTargetCompletionDate',
    'revised_target_completion_date',
    'RevisedTargetCompletionDate',
    'newTargetCompletionDate',
    'new_target_completion_date',
    'NewTargetCompletionDate',
  ])
  const effective =
    pickTimestamp(task, ['effective_target_completion_date']) ??
    extended ??
    current ??
    original ??
    null

  const currentMs = timestampMs(current)
  const extendedMs = timestampMs(extended)
  const originalMs = timestampMs(original)
  const isExtended =
    (extendedMs !== null && currentMs !== null && extendedMs > currentMs) ||
    (extendedMs !== null && currentMs === null) ||
    (originalMs !== null && currentMs !== null && currentMs > originalMs)

  return { effective, current, original, extended, isExtended }
}