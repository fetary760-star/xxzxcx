/**
 * Override console methods to suppress technical errors in production
 * while still allowing intentional logging
 */

const originalConsole = {
  error: console.error,
  warn: console.warn,
  log: console.log,
};

export function initConsoleOverride() {
  if (typeof window === 'undefined') return;

  // Only override in production
  if (process.env.NODE_ENV === 'production') {
    console.error = (...args: any[]) => {
      // Suppress error logs in production
      // In a real app, you'd send these to a logging service
      return;
    };

    console.warn = (...args: any[]) => {
      // Suppress warning logs in production
      return;
    };

    // Allow  for intentional logging
    // = original;
  }
}

// Restore original console (useful for debugging)
export function restoreConsole() {
  console.error = originalConsole.error;
  console.warn = originalConsole.warn;
  // = original;
} 