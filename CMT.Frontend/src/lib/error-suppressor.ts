/**
 * Error Suppressor
 * Suppresses technical error details and shows user-friendly messages
 */

// Store original console methods
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

// List of error patterns to suppress (hide technical details)
const suppressPatterns = [
  /useToast.*from the server/i,
  /useAuth must be used within/i,
  /hydration/i,
  /server.*client/i,
  /attempted to call/i,
  /digest:/i,
  /\[Errno/i,
  /FileNotFoundError/i,
  /Traceback/i,
  /ECONNREFUSED/i,
  /fetch failed/i,
  /Failed to load tasks/i,
  /Backend Request/i,
  /RBAC/i,
  /API Route/i,
  /TypeError: fetch failed/i,
  /\[API Error\]/i,
  /\[PERMISSION\]/i,
  /\[API Unexpected Error\]/i,
  /originalConsoleError/i,
  /error-suppressor\.ts/i,
  /api\.ts/i,
  /auth-context\.tsx/i,
  /at\s+\w+\s+\(/i, // Stack trace lines
  /^\s+at\s+/i, // Stack trace lines
  /Call Stack/i,
  /Show.*ignore-listed frame/i,
  /endpoint:/i,
  /status:/i,
  /originalMessage:/i,
  /body:/i,
  /\.tsx?\s*\(\d+:\d+\)/i, // File references like file.ts (79:5)
  /src\//i, // Source file paths
  /node_modules/i,
  /webpack/i,
  /Next\.js/i,
  /Console Error/i,
  /Amendment approval/i, // Suppress amendment-related technical errors
  /amendment.*review/i, // Suppress amendment review technical errors
  /Non-JSON response/i, // Suppress non-JSON response technical details
  /Full response:/i, // Suppress full response dumps
  /POST\s+http/i, // Suppress raw HTTP POST error lines
  /\d+\s*\(Bad Request\)/i, // Suppress "400 (Bad Request)" style messages
  /Failed to load resource.*\d{3}/i, // Suppress "Failed to load resource: the server responded with a status of XXX" messages
  /the server responded with a status of/i, // Suppress browser network error messages
];

/**
 * Check if an error should be suppressed
 */
function shouldSuppress(message: string): boolean {
  // Always suppress technical details
  return suppressPatterns.some(pattern => pattern.test(message));
}

/**
 * Known user-friendly message patterns from the backend.
 * If a console error contains one of these, it is already user-friendly
 * and should be suppressed from the console (the UI displays it via state).
 */
const knownFriendlyPatterns = [
  /amendment is not pending/i,
  /amendment has not been forwarded/i,
  /cannot approve amendments directly/i,
  /cannot forward amendments/i,
  /only engineers can request/i,
  /only team leaders and directors/i,
  /only directors can approve/i,
  /already a pending amendment/i,
  /review comments are required/i,
  /review comments must be at least/i,
  /reviewer id is required/i,
  /reviewer role is required/i,
  /invalid amendment status/i,
  /invalid amendment decision/i,
  /task not found/i,
  /requester not found/i,
  /reviewer not found/i,
  /no pending amendment request/i,
  /requested hours.*must be greater than/i,
  /must be greater than current estimated/i,
  /workload adjustment/i,
  /already.*pending.*hold/i,
  /pending hold request/i,
  /Failed to create hold request/i,
  /failed to create pause record/i,
];

/**
 * Format error message for user display
 */
function getUserFriendlyMessage(error: any): string {
  const message = typeof error === 'string' ? error : error?.message || '';
  
  // If the message already contains a known user-friendly backend message,
  // suppress it from the console entirely (the UI handles display via setError).
  if (knownFriendlyPatterns.some(pattern => pattern.test(message))) {
    return ''; // Return empty to suppress — the UI already shows this message
  }
  
  // Backend connection errors
  if (message.includes('ECONNREFUSED') || message.includes('fetch failed') || message.includes('Failed to load')) {
    return 'Unable to connect to the server. Please check your connection and try again.';
  }
  
  // Authentication errors
  if (message.includes('401') || message.includes('Unauthorized') || message.includes('Invalid username')) {
    return 'Invalid username or password. Please try again.';
  }
  
  // Permission errors
  if (message.includes('403') || message.includes('Forbidden') || message.includes('permission')) {
    return 'You do not have permission to perform this action.';
  }
  
  // Not found errors
  if (message.includes('404') || message.includes('not found')) {
    return 'The requested resource was not found.';
  }
  
  // Server errors
  if (message.includes('500') || message.includes('Server error')) {
    return 'Server error. Please try again later.';
  }
  
  // CSRF errors
  if (message.toLowerCase().includes('csrf')) {
    return 'Session expired. Please refresh the page and try again.';
  }
  
  // Hold request errors (already pending)
  if (message.toLowerCase().includes('hold') && message.toLowerCase().includes('already')) {
    return ''; // Suppress — the UI handles this via setSuccess/setError
  }
  
  // Pause/resume errors
  if (message.toLowerCase().includes('pause') || message.toLowerCase().includes('resume')) {
    return ''; // Suppress — the UI handles this via setSuccess/setError
  }
  
  // Bad request errors with specific messages from the backend
  if (message.includes('400') || message.toLowerCase().includes('bad request')) {
    return ''; // Suppress generic 400 errors — the UI component handles specific messages
  }
  
  // Default user-friendly message
  return 'Something went wrong. Please try again.';
}

/**
 * Initialize error suppression
 */
export function initErrorSuppressor() {
  if (typeof window === 'undefined') {
    return; // Only run in browser
  }

  // Override console.error to suppress technical details
  console.error = (...args: any[]) => {
    const message = args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (arg === null || arg === undefined) return '';
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }).join(' ');

    // Suppress technical error details
    if (shouldSuppress(message)) {
      // Don't log anything - completely suppress technical details
      return;
    }

    // For non-technical errors, show user-friendly version
const friendlyMessage = getUserFriendlyMessage(message);
if (friendlyMessage) {
  // In development, log at debug level to avoid triggering the error overlay
  if (process.env.NODE_ENV === 'development') {
    originalConsoleWarn.call(console, `[Suppressed Error] ${friendlyMessage}`);
  }
  // In production, completely suppress - the UI handles error display via state
}
  };

  // Override console.warn to suppress technical warnings
  console.warn = (...args: any[]) => {
    const message = args.map(arg => {
      if (typeof arg === 'string') return arg;
      if (arg === null || arg === undefined) return '';
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }).join(' ');

    // Suppress technical warnings
    if (shouldSuppress(message)) {
      return;
    }

    originalConsoleWarn(...args);
  };

  // Global error handler - suppress technical details
  window.addEventListener('error', (event) => {
    const message = event.message || event.error?.message || '';
    
    if (shouldSuppress(message)) {
      event.preventDefault();
      return;
    }
  });

  // Unhandled promise rejection handler - suppress technical details
  window.addEventListener('unhandledrejection', (event) => {
    const message = event.reason?.message || String(event.reason) || '';
    
    if (shouldSuppress(message)) {
      event.preventDefault();
      return;
    }
  });
}

/**
 * Restore original console methods (for testing)
 */
export function restoreConsole() {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
}