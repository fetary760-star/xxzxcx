/**
 * Error Sanitization Utilities
 * 
 * This module provides functions to sanitize error messages before displaying
 * them to end users. It prevents information disclosure by stripping raw HTML,
 * server-side error details, stack traces, and other sensitive technical information.
 * 
 * Addresses: OWASP A04:2021 – Insecure Design
 *            CWE-209: Generation of Error Message Containing Sensitive Information
 */

/**
 * Map of HTTP status codes to user-friendly error messages.
 * These messages are safe to display to end users without revealing
 * any internal server details.
 */
const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: 'The request was invalid. Please check your input and try again.',
  401: 'Your session has expired or you do not have valid credentials. Please log out and log back in.',
  403: 'You do not have permission to access this resource. Please contact your administrator.',
  404: 'The requested resource was not found.',
  408: 'The request timed out. Please try again.',
  409: 'A conflict occurred. The resource may have been modified by another user.',
  422: 'The submitted data could not be processed. Please check your input.',
  429: 'Too many requests. Please wait a moment and try again.',
  500: 'An internal server error occurred. Please try again later.',
  502: 'The server received an invalid response. Please try again later.',
  503: 'The service is temporarily unavailable. Please try again later.',
  504: 'The server timed out. Please try again later.',
}

/**
 * Checks if a string contains HTML content (tags, entities, etc.)
 */
function containsHtml(text: string): boolean {
  if (!text) return false
  // Check for common HTML patterns
  return (
    /<[a-z][\s\S]*>/i.test(text) ||
    /<!DOCTYPE/i.test(text) ||
    /&[a-z]+;/i.test(text) ||
    /<\/[a-z]+>/i.test(text)
  )
}

/**
 * Checks if a string contains sensitive server information
 */
function containsSensitiveInfo(text: string): boolean {
  if (!text) return false
  const sensitivePatterns = [
    /stack\s*trace/i,
    /at\s+\w+\.\w+\s*\(/i,       // Stack trace patterns like "at Module.func ("
    /\\[a-zA-Z]:\\.*\\/,           // Windows file paths
    /\/usr\/|\/var\/|\/etc\//,     // Unix file paths
    /node_modules/i,
    /\.dll|\.exe|\.config/i,
    /IIS|ASP\.NET|\.NET/i,
    /Server Error/i,
    /Unauthorized:.*credentials/i,
    /Exception|NullReference|ArgumentNull/i,
    /connectionString|password|secret/i,
  ]
  return sensitivePatterns.some(pattern => pattern.test(text))
}

/**
 * Returns a sanitized, user-friendly error message based on an HTTP status code.
 * Never exposes raw backend error text, HTML responses, or stack traces.
 * 
 * @param statusCode - The HTTP status code from the failed response
 * @param context - Optional context string to provide more specific messaging (e.g., "engineers", "tasks")
 * @returns A safe, user-friendly error message string
 * 
 * @example
 * // Returns: "Failed to load engineers. Your session has expired or you do not have valid credentials. Please log out and log back in."
 * getSanitizedErrorMessage(401, 'engineers')
 * 
 * @example
 * // Returns: "An internal server error occurred. Please try again later."
 * getSanitizedErrorMessage(500)
 */
export function getSanitizedErrorMessage(statusCode: number, context?: string): string {
  const baseMessage = HTTP_STATUS_MESSAGES[statusCode]
    || (statusCode >= 400 && statusCode < 500
      ? 'A client error occurred. Please check your request and try again.'
      : 'An unexpected server error occurred. Please try again later.')

  if (context) {
    return `Failed to load ${context}. ${baseMessage}`
  }

  return baseMessage
}

/**
 * Sanitizes a raw error message to ensure no sensitive information is disclosed.
 * If the message contains HTML, server paths, stack traces, or other sensitive data,
 * it returns a generic safe message instead.
 * 
 * @param rawMessage - The raw error message (potentially containing sensitive info)
 * @param fallbackMessage - A safe fallback message to use if the raw message is unsafe
 * @returns A sanitized error message safe for display to end users
 * 
 * @example
 * // Returns: "An error occurred. Please try again later."
 * sanitizeErrorMessage('<!DOCTYPE html>...<title>401 - Unauthorized</title>...')
 * 
 * @example
 * // Returns the original message since it's safe
 * sanitizeErrorMessage('No engineers found in the database.')
 */
export function sanitizeErrorMessage(
  rawMessage: string | undefined | null,
  fallbackMessage: string = 'An error occurred. Please try again later.'
): string {
  if (!rawMessage) return fallbackMessage

  // If the message contains HTML or sensitive info, return the fallback
  if (containsHtml(rawMessage) || containsSensitiveInfo(rawMessage)) {
    return fallbackMessage
  }

  // If the message starts with "HTTP XXX:" pattern, extract just the status and provide a clean message
  const httpStatusMatch = rawMessage.match(/^HTTP\s+(\d{3})/)
  if (httpStatusMatch) {
    const statusCode = parseInt(httpStatusMatch[1], 10)
    return getSanitizedErrorMessage(statusCode)
  }

  // If the message is reasonably short and doesn't contain suspicious content, allow it
  if (rawMessage.length <= 200) {
    return rawMessage
  }

  // Long messages are likely to contain sensitive info
  return fallbackMessage
}

/**
 * Extracts a safe error message from a fetch Response object.
 * Logs the full technical details server-side for debugging while
 * returning only a sanitized message for the client.
 * 
 * @param response - The fetch Response object
 * @param context - Optional context for the error message (e.g., "engineers", "tasks")
 * @returns A safe, user-friendly error message
 */
export async function extractSafeErrorFromResponse(
  response: Response,
  context?: string
): Promise<string> {
  // Log full details server-side for debugging
  try {
    const errorBody = await response.text()
    console.error(`[${context || 'API'}] Error ${response.status}:`, errorBody)
  } catch {
    console.error(`[${context || 'API'}] Error ${response.status}: Unable to read response body`)
  }

  // Return only a sanitized message
  return getSanitizedErrorMessage(response.status, context)
}