/**
 * =====================================================================================
 * PHASE 1 — DELIVERABLE 3 (AMENDED, REPLACES THE EXISTING FILE)
 * Copy to: CMT.Frontend/src/lib/http/payload-sanitize.exports.ts
 *
 * PURPOSE
 *   A single, stable re-export surface, so no route or hook can ever again bind to a name
 *   that does not exist. The previous proxy imported `sanitizeRequestBodyText`, which was
 *   not exported anywhere; webpack bound it to `undefined` and the proxy silently fell back
 *   to "forward the raw body", which is exactly how `"revDate": "MAR 11 2021"` reached
 *   System.Text.Json and produced
 *
 *       $.revDate: "The JSON value could not be converted to Nullable<DateTime>"
 *     + command:   "The command field is required."
 *
 * Import from THIS module everywhere.
 * =====================================================================================
 */

export {
  sanitizeJsonBody,
  sanitizeRequestBodyText,
  sanitizeJsonValue,
  isNullableOnEmptyString,
  isDateKey,
  isOpaqueKey,
  rewrittenDateKeys,
  emptyNullableKeys,
} from './payload-sanitize'

export {
  toIsoDateOrNull,
  needsIsoNormalisation,
  normaliseFormRevDate,
  SLASH_DATE_ORDER,
} from './date-normalize'