/**
 * Centralized error handling utility
 * Provides user-friendly error messages while suppressing technical details
 */

export interface AppError {
  message: string;
  code?: string;
  statusCode?: number;
}

/**
 * Convert technical errors to user-friendly messages
 */
export function getUserFriendlyError(error: unknown): AppError {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      message: 'Unable to connect to the server. Please check your internet connection.',
      code: 'NETWORK_ERROR',
      statusCode: 0
    };
  }

  // HTTP errors
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as any).status;
    
    switch (status) {
      case 400:
        return {
          message: 'Invalid request. Please check your input and try again.',
          code: 'BAD_REQUEST',
          statusCode: 400
        };
      case 401:
        return {
          message: 'Your session has expired. Please log in again.',
          code: 'UNAUTHORIZED',
          statusCode: 401
        };
      case 403:
        return {
          message: 'You do not have permission to perform this action.',
          code: 'FORBIDDEN',
          statusCode: 403
        };
      case 404:
        return {
          message: 'The requested resource was not found.',
          code: 'NOT_FOUND',
          statusCode: 404
        };
      case 500:
        return {
          message: 'A server error occurred. Please try again later.',
          code: 'SERVER_ERROR',
          statusCode: 500
        };
      case 503:
        return {
          message: 'The service is temporarily unavailable. Please try again later.',
          code: 'SERVICE_UNAVAILABLE',
          statusCode: 503
        };
      default:
        return {
          message: 'An unexpected error occurred. Please try again.',
          code: 'UNKNOWN_ERROR',
          statusCode: status
        };
    }
  }

  // Default fallback
  return {
    message: 'An unexpected error occurred. Please try again.',
    code: 'UNKNOWN_ERROR',
    statusCode: 500
  };
}

/**
 * Log errors silently without exposing technical details to console
 * In production, this would send to a logging service
 */
export function logError(error: unknown, context?: string): void {
  // Only log in development mode
  if (process.env.NODE_ENV === 'development') {
    console.error(`[Error${context ? ` - ${context}` : ''}]:`, error);
  }
  
  // In production, send to logging service (e.g., Sentry, LogRocket)
  // Example: Sentry.captureException(error, { tags: { context } });
}

/**
 * Handle API errors consistently
 */
export function handleApiError(error: unknown, context?: string): AppError {
  logError(error, context);
  return getUserFriendlyError(error);
}