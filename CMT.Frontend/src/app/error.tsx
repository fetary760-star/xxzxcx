'use client';

import { useEffect } from 'react';
import { AlertCircle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log error silently (only in development)
    if (process.env.NODE_ENV === 'development') {
      console.error('Global error:', error);
    }
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <div className="max-w-md p-6 bg-red-50 border border-red-200 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <div>
            <h2 className="text-lg font-semibold text-red-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-red-700 mb-4">
              We encountered an unexpected error. Please try again.
            </p>
            <div className="flex gap-2">
              <button
                className="px-4 py-2 bg-white border border-red-300 text-red-700 rounded hover:bg-red-50 transition-colors"
                onClick={reset}
              >
                Try Again
              </button>
              <button
                className="px-4 py-2 bg-white border border-red-300 text-red-700 rounded hover:bg-red-50 transition-colors"
                onClick={() => window.location.href = '/'}
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}