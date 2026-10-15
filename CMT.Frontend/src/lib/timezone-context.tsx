'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  DEFAULT_TIME_ZONE,
  dayDiffInZone,
  endOfDayInZone,
  formatCustomInZone,
  formatDateInZone,
  formatDateShortInZone,
  formatDateTimeInZone,
  fromZonedDateInput,
  fromZonedInput,
  getBrowserTimeZone,
  getTimeZoneAbbreviation,
  getTimeZoneOffsetMs,
  nowDateTimeInputInZone,
  normalizeToIso,
  parseTimestamp,
  startOfDayInZone,
  timestampMs,
  toDateInputInZone,
  toDateTimeInputInZone,
  toDateTimeSecondsInputInZone,
  toUtcIsoFromZonedInput,
} from '@/lib/datetime-utils'

/**
 * timezone-context.tsx
 * ═══════════════════════════════════════════════════════════════════════════
 * LAYER 3 — THE ONLY CLOCK THE UI IS ALLOWED TO USE.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SYMPTOM
 *   Task Details → Timeline → Target Completion : "Aug 21, 2026 at 9:05:00 AM GMT+3"
 *   Update Task  → Target Completion (input)    : "08/21/2026 09:35 AM"
 *   …and after saving, Target Completion could land BEFORE "Task Assigned At".
 *
 * ROOT CAUSE
 *   Two different clocks were used for the SAME instant:
 *     • READ  path (Task Details / Timeline) formatted the UTC value in the
 *       user's SELECTED timezone (e.g. Africa/Addis_Ababa = GMT+3).
 *     • WRITE path (`<input type="datetime-local">` in UpdateTaskModal) built
 *       and parsed the value with `new Date().getHours()`, i.e. in the BROWSER
 *       timezone (often UTC on hosted / VDI machines).
 *   The 3-hour gap is exactly that offset. Because validation also compared a
 *   "...Z" value against a designator-less one, a legitimate target could be
 *   rejected, or a stale one silently persisted before the assignment moment.
 *
 * FIX
 *   This provider is the SINGLE clock for BOTH directions, and it delegates all
 *   arithmetic to `datetime-utils.ts` so no conversion logic is duplicated:
 *     • READ   `formatDate` / `formatDateTime` / `formatDateShort` /
 *              `formatDateCustom`  — UTC instant → text in the selected zone.
 *     • EDIT   `toDateTimeInput` / `toDateInput` — UTC instant → wall clock in
 *              the selected zone for `<input type="datetime-local"|"date">`.
 *     • WRITE  `fromDateTimeInput` / `toUtcIso` — wall clock typed by the user
 *              in the selected zone → real UTC instant / ISO string for the API.
 *     • MATH   `startOfDay` / `endOfDay` / `dayDiff` / `compare` — calendar and
 *              ordering computed on normalized UTC values.
 *
 * Usage:
 *   const { timeZone, formatDateTime, toDateTimeInput, toUtcIso } = useTimezone()
 */

/* ════════════════════════════ storage (session) ══════════════════════════ */

// SECURITY: sessionStorage (cleared on tab close) instead of localStorage, to
// avoid persistent browser storage exposure.
const TIMEZONE_STORAGE_KEY = 'user_timezone'

/** Kept as a named export for existing imports. */
export const DEFAULT_TIMEZONE = DEFAULT_TIME_ZONE

function safeSessionGet(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

/** One-time cleanup of a legacy localStorage entry from previous versions. */
function cleanupLegacyLocalStorage(): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(TIMEZONE_STORAGE_KEY)
  } catch {
    // ignore
  }
}

/** Timezone currently selected by the user (safe in non-React contexts). */
export function getStoredTimezone(): string {
  const stored = safeSessionGet(TIMEZONE_STORAGE_KEY)
  return stored && stored.trim() ? stored.trim() : DEFAULT_TIME_ZONE
}

/* ═══════════════════════════ context contract ═══════════════════════════ */

export interface TimezoneContextType {
  /** IANA timezone string, e.g. "Africa/Addis_Ababa", "UTC". */
  timeZone: string
  /** Short label of the active timezone, e.g. "GMT+3". */
  timeZoneLabel: string
  /** Offset of the active timezone right now, in minutes (GMT+3 → 180). */
  offsetMinutes: number
  /** Update the timezone (persists to sessionStorage and broadcasts an event). */
  setTimeZone: (tz: string) => void

  /* ───────── READ / DISPLAY ───────── */
  /** "Aug 21, 2026" */
  formatDate: (input?: string | number | Date | null) => string
  /** "Aug 21, 2026 at 9:05:53 AM GMT+3" */
  formatDateTime: (input?: string | number | Date | null) => string
  /** "21/Aug/2026" — compact table format. */
  formatDateShort: (input?: string | number | Date | null) => string
  /** Arbitrary `Intl` options, always pinned to the selected timezone. */
  formatDateCustom: (
    input?: string | number | Date | null,
    options?: Intl.DateTimeFormatOptions
  ) => string

  /* ───────── EDIT (UTC instant → form value) ───────── */
  /** UTC instant → "YYYY-MM-DDTHH:mm" wall clock in the selected timezone. */
  toDateTimeInput: (input?: string | number | Date | null) => string
  /** Same, with seconds, for `<input type="datetime-local" step="1">`. */
  toDateTimeSecondsInput: (input?: string | number | Date | null) => string
  /** UTC instant → "YYYY-MM-DD" calendar day in the selected timezone. */
  toDateInput: (input?: string | number | Date | null) => string
  /** "now" as a `datetime-local` value in the selected timezone. */
  nowDateTimeInput: () => string

  /* ───────── WRITE (form value → UTC) ───────── */
  /** "YYYY-MM-DDTHH:mm" typed in the selected timezone → real UTC Date. */
  fromDateTimeInput: (value?: string | number | Date | null) => Date | null
  /** "YYYY-MM-DD" typed in the selected timezone → real UTC Date (00:00). */
  fromDateInput: (value?: string | null) => Date | null
  /** Form value → ISO-8601 UTC string ready to be sent to the API. */
  toUtcIso: (value?: string | number | Date | null) => string | null
  /** Any API value → normalized ISO-8601 UTC string (or null). */
  normalizeIso: (input?: string | number | Date | null) => string | null

  /* ───────── COMPARISON / CALENDAR MATHS ───────── */
  /** Normalized epoch ms of any value (null when unusable). */
  toEpochMs: (input?: string | number | Date | null) => number | null
  /** -1 / 0 / 1 comparison of two timestamps; null when either is unusable. */
  compare: (
    a?: string | number | Date | null,
    b?: string | number | Date | null
  ) => number | null
  /** Start of the calendar day (00:00) of `input` in the selected timezone. */
  startOfDay: (input?: string | number | Date | null) => Date | null
  /** End of the calendar day (23:59:59.999) in the selected timezone. */
  endOfDay: (input?: string | number | Date | null) => Date | null
  /** Whole-day difference (to − from) counted in the selected timezone. */
  dayDiff: (
    from?: string | number | Date | null,
    to?: string | number | Date | null
  ) => number | null
}

const TimezoneContext = createContext<TimezoneContextType | undefined>(undefined)

/* ═════════════ standalone converters (non-React call sites) ══════════════ */

/** UTC instant → `datetime-local` value inside `timeZone`. */
export function toZonedDateTimeInputValue(
  input: string | number | Date | null | undefined,
  timeZone: string
): string {
  return toDateTimeInputInZone(input, timeZone)
}

/** UTC instant → "YYYY-MM-DD" inside `timeZone`. */
export function toZonedDateInputValue(
  input: string | number | Date | null | undefined,
  timeZone: string
): string {
  return toDateInputInZone(input, timeZone)
}

/** Wall clock typed inside `timeZone` → real UTC Date. */
export function fromZonedDateTimeInputValue(
  value: string | number | Date | null | undefined,
  timeZone: string
): Date | null {
  return fromZonedInput(value, timeZone)
}

/** "YYYY-MM-DD" typed inside `timeZone` → real UTC Date at 00:00. */
export function fromZonedDateInputValue(
  value: string | null | undefined,
  timeZone: string
): Date | null {
  return fromZonedDateInput(value, timeZone)
}

/** Start of the calendar day of `input` inside `timeZone`. */
export function zonedStartOfDay(
  input: string | number | Date | null | undefined,
  timeZone: string
): Date | null {
  return startOfDayInZone(input ?? new Date(), timeZone)
}

/** End of the calendar day of `input` inside `timeZone`. */
export function zonedEndOfDay(
  input: string | number | Date | null | undefined,
  timeZone: string
): Date | null {
  return endOfDayInZone(input ?? new Date(), timeZone)
}

/** Whole-day difference (`to` − `from`) on the calendar of `timeZone`. */
export function zonedDayDiff(
  from: string | number | Date | null | undefined,
  to: string | number | Date | null | undefined,
  timeZone: string
): number | null {
  return dayDiffInZone(from, to, timeZone)
}

/** Offset of `timeZone` at `date`, in milliseconds. */
export function timeZoneOffsetMs(timeZone: string, date: Date): number {
  return getTimeZoneOffsetMs(date, timeZone)
}

/* ════════════════════════════ the provider ══════════════════════════════ */

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  const [timeZone, setTimeZoneState] = useState<string>(DEFAULT_TIME_ZONE)

  // Hydrate from sessionStorage after mount (SSR-safe: server renders default).
  useEffect(() => {
    cleanupLegacyLocalStorage()
    const stored = safeSessionGet(TIMEZONE_STORAGE_KEY)
    if (stored && stored.trim()) setTimeZoneState(stored.trim())
  }, [])

  // React to timezone changes saved on the Settings page.
  useEffect(() => {
    function onSettingsChanged(e: Event) {
      const detail = (e as CustomEvent)?.detail
      const tz = detail?.timeZone
      if (tz && typeof tz === 'string' && tz.trim()) {
        setTimeZoneState(tz.trim())
        safeSessionSet(TIMEZONE_STORAGE_KEY, tz.trim())
      }
    }
    window.addEventListener('settings:timezone-changed', onSettingsChanged)
    return () => window.removeEventListener('settings:timezone-changed', onSettingsChanged)
  }, [])

  const setTimeZone = useCallback((tz: string) => {
    const next = (tz && tz.trim()) || DEFAULT_TIME_ZONE
    setTimeZoneState(next)
    safeSessionSet(TIMEZONE_STORAGE_KEY, next)
    try {
      window.dispatchEvent(
        new CustomEvent('settings:timezone-changed', { detail: { timeZone: next } })
      )
    } catch {
      // ignore (SSR / restricted environments)
    }
  }, [])

  const value = useMemo<TimezoneContextType>(
    () => buildTimezoneApi(timeZone, setTimeZone),
    [timeZone, setTimeZone]
  )

  return <TimezoneContext.Provider value={value}>{children}</TimezoneContext.Provider>
}

/**
 * Build the whole API surface for a given timezone. Shared by the provider and
 * by the out-of-provider fallback, so BOTH behave identically — a component
 * rendered outside the provider can never silently switch to another clock.
 */
function buildTimezoneApi(
  timeZone: string,
  setTimeZone: (tz: string) => void
): TimezoneContextType {
  return {
    timeZone,
    timeZoneLabel: getTimeZoneAbbreviation(timeZone),
    offsetMinutes: Math.round(getTimeZoneOffsetMs(new Date(), timeZone) / 60000),
    setTimeZone,

    /* READ / DISPLAY */
    formatDate: (input) => formatDateInZone(input, timeZone),
    formatDateTime: (input) => formatDateTimeInZone(input, timeZone),
    formatDateShort: (input) => formatDateShortInZone(input, timeZone),
    formatDateCustom: (input, options) => formatCustomInZone(input, timeZone, options),

    /* EDIT */
    toDateTimeInput: (input) => toDateTimeInputInZone(input, timeZone),
    toDateTimeSecondsInput: (input) => toDateTimeSecondsInputInZone(input, timeZone),
    toDateInput: (input) => toDateInputInZone(input, timeZone),
    nowDateTimeInput: () => nowDateTimeInputInZone(timeZone),

    /* WRITE */
    fromDateTimeInput: (value) => fromZonedInput(value, timeZone),
    fromDateInput: (value) => fromZonedDateInput(value, timeZone),
    toUtcIso: (value) => toUtcIsoFromZonedInput(value, timeZone),
    normalizeIso: (input) => normalizeToIso(input),

    /* COMPARISON / CALENDAR */
    toEpochMs: (input) => timestampMs(input),
    compare: (a, b) => {
      const ms1 = timestampMs(a)
      const ms2 = timestampMs(b)
      if (ms1 === null || ms2 === null) return null
      return ms1 === ms2 ? 0 : ms1 < ms2 ? -1 : 1
    },
    startOfDay: (input) => startOfDayInZone(input ?? new Date(), timeZone),
    endOfDay: (input) => endOfDayInZone(input ?? new Date(), timeZone),
    dayDiff: (from, to) => dayDiffInZone(from, to, timeZone),
  }
}

/**
 * Hook to access the user's timezone preference plus every conversion helper.
 *
 *   const { formatDateTime, toDateTimeInput, toUtcIso } = useTimezone()
 */
export function useTimezone(): TimezoneContextType {
  const context = useContext(TimezoneContext)
  if (context !== undefined) return context

  // Rendered outside the provider (SSR, isolated tests, portals): use the
  // stored preference so the clock still matches the rest of the app.
  const fallbackTz =
    typeof window !== 'undefined' ? getStoredTimezone() : DEFAULT_TIME_ZONE
  return buildTimezoneApi(fallbackTz, () => {})
}

/* ═════════════ stored-timezone helpers for non-React contexts ════════════ */

export function formatDateWithStoredTimezone(
  input?: string | number | Date | null
): string {
  return formatDateInZone(input, getStoredTimezone())
}

export function formatDateTimeWithStoredTimezone(
  input?: string | number | Date | null
): string {
  return formatDateTimeInZone(input, getStoredTimezone())
}

/** "21/Aug/2026" using the stored timezone (TaskTable / Completed Tasks). */
export function formatDateShortWithStoredTimezone(
  input?: string | number | Date | null
): string {
  return formatDateShortInZone(input, getStoredTimezone())
}

/** Value for an `<input type="datetime-local">` using the stored timezone. */
export function toDateTimeInputWithStoredTimezone(
  input?: string | number | Date | null
): string {
  return toDateTimeInputInZone(input, getStoredTimezone())
}

/** Value for an `<input type="date">` using the stored timezone. */
export function toDateInputWithStoredTimezone(
  input?: string | number | Date | null
): string {
  return toDateInputInZone(input, getStoredTimezone())
}

/** Parse a `datetime-local` value typed in the stored timezone into a UTC Date. */
export function fromDateTimeInputWithStoredTimezone(
  value?: string | number | Date | null
): Date | null {
  return fromZonedInput(value, getStoredTimezone())
}

/** Form value → ISO-8601 UTC string, using the stored timezone. */
export function toUtcIsoWithStoredTimezone(
  value?: string | number | Date | null
): string | null {
  return toUtcIsoFromZonedInput(value, getStoredTimezone())
}

/** Normalized `Date` of any API value (timezone-independent). */
export function parseApiTimestamp(
  input?: string | number | Date | null
): Date | null {
  return parseTimestamp(input)
}

/** The browser's own timezone — offer it as an option on the Settings page. */
export { getBrowserTimeZone }