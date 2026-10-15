/**
 * FrameGuard Component
 * 
 * Defense-in-depth protection against clickjacking attacks.
 * This component provides JavaScript-based frame-busting as a backup
 * to HTTP headers (X-Frame-Options and CSP frame-ancestors).
 * 
 * Usage:
 * - Wrap sensitive pages/components with <FrameGuard>
 * - Or use the useFrameGuard hook in any component
 */

import { useEffect, useState, ReactNode } from 'react';

interface FrameGuardProps {
  children: ReactNode;
  /** Custom message to show if framing is detected */
  blockedMessage?: string;
  /** Whether to attempt frame-busting (redirect to top) */
  bustFrame?: boolean;
  /** Callback when framing is detected */
  onFrameDetected?: () => void;
}

/**
 * Hook to detect if the page is being framed
 */
export function useFrameGuard() {
  const [isFramed, setIsFramed] = useState(false);

  useEffect(() => {
    // Check if page is being framed
    const checkFraming = () => {
      try {
        if (window.top !== window.self) {
          setIsFramed(true);
          return true;
        }
      } catch (e) {
        // Cross-origin frame - definitely framed
        setIsFramed(true);
        return true;
      }
      return false;
    };

    checkFraming();

    // Also check on visibility change (in case of dynamic framing)
    const handleVisibilityChange = () => {
      checkFraming();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return { isFramed };
}

/**
 * FrameGuard Component
 * Protects children from being rendered in a frame
 */
export function FrameGuard({ 
  children, 
  blockedMessage = 'This content cannot be displayed in a frame for security reasons.',
  bustFrame = true,
  onFrameDetected
}: FrameGuardProps) {
  const { isFramed } = useFrameGuard();
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (isFramed) {
      // Call the callback if provided
      onFrameDetected?.();

      // Attempt to bust out of the frame
      if (bustFrame && !attempted) {
        setAttempted(true);
        try {
          // Try to redirect the top frame to this page
          if (window.top) {
            window.top.location = window.self.location;
          }
        } catch (e) {
          // Cross-origin frame - can't bust out, just block content
          console.warn('FrameGuard: Unable to bust frame (cross-origin)');
        }
      }
    }
  }, [isFramed, bustFrame, attempted, onFrameDetected]);

  // If framed, don't render children
  if (isFramed) {
    return (
      <div 
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          padding: '20px',
          textAlign: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}
      >
        <div>
          <h1 style={{ marginBottom: '10px' }}>⚠️ Security Alert</h1>
          <p>{blockedMessage}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default FrameGuard;