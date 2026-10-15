/**
 * Helpers that turn a backend error into (a) one readable sentence and
 * (b) a per-field error map that can be attached to form inputs.
 *
 * The amended UserManagementController answers with 422 + ValidationProblemDetails:
 *   {
 *     "title": "Cannot create user",
 *     "status": 422,
 *     "detail": "One or more fields are invalid...",
 *     "errors": { "shopId": ["A Shop Team Leader must be assigned to a shop."] }
 *   }
 *
 * lib/api.ts attaches that payload to `error.body`, but historically the body
 * arrived as a RAW STRING (see lib/server/users-proxy.ts for the reason), so
 * this helper also parses stringified bodies defensively.
 */

export interface FieldErrors {
  [field: string]: string[]
}

export interface ParsedApiError {
  status?: number
  message: string
  fieldErrors: FieldErrors
}

const GENERIC_MESSAGES = new Set([
  'something went wrong. please try again.',
  'unprocessable content',
  'unprocessable entity',
  'bad request',
  '',
])

/** Lower-camelCases a field key so it matches the form state keys. */
function toCamelCase(key: string): string {
  if (!key) return key
  const trimmed = key.replace(/^\$\./, '').trim()
  return trimmed.charAt(0).toLowerCase() + trimmed.slice(1)
}

function coerceBody(body: unknown): Record<string, unknown> | null {
  if (!body) return null
  if (typeof body === 'string') {
    const text = body.trim()
    if (!text.startsWith('{') && !text.startsWith('[')) return null
    try {
      const parsed = JSON.parse(text)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  if (typeof body === 'object') return body as Record<string, unknown>
  return null
}

/** Extracts `{ field: [messages] }` from a ValidationProblemDetails payload. */
export function extractFieldErrors(error: unknown): FieldErrors {
  const err = error as { body?: unknown } | undefined
  const body = coerceBody(err?.body) ?? coerceBody(error)
  if (!body) return {}

  const bag = (body.errors ?? body.Errors ?? body.fieldErrors) as Record<string, unknown> | undefined
  if (!bag || typeof bag !== 'object') return {}

  const result: FieldErrors = {}
  for (const [rawKey, rawValue] of Object.entries(bag)) {
    const key = toCamelCase(rawKey)
    const values = Array.isArray(rawValue) ? rawValue : [rawValue]
    const messages = values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    if (messages.length > 0) result[key] = messages
  }
  return result
}

/** Normalises any thrown API error into a status, a message and a field map. */
export function parseApiError(error: unknown, fallback = 'Request failed'): ParsedApiError {
  const err = error as { status?: number | string; message?: string; body?: unknown } | undefined
  const status = typeof err?.status === 'number' ? err.status : Number(err?.status) || undefined
  const fieldErrors = extractFieldErrors(error)
  const body = coerceBody(err?.body)

  const candidates = [
    typeof body?.message === 'string' ? body.message : '',
    typeof body?.title === 'string' ? body.title : '',
    typeof body?.error === 'string' ? body.error : '',
    typeof body?.detail === 'string' ? body.detail : '',
    err?.message ?? '',
  ]

  let message = candidates.find(c => c && !GENERIC_MESSAGES.has(c.trim().toLowerCase())) || ''

  const flattened = Object.values(fieldErrors).flat()
  if (flattened.length > 0) {
    const detail = flattened.slice(0, 3).join(' ')
    message = message ? `${message} ${detail}` : detail
  }

  return {
    status,
    message: (message || err?.message || fallback).trim(),
    fieldErrors,
  }
}