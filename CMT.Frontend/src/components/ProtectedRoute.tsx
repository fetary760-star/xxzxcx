'use client'

/**
 * ProtectedRoute
 * ---------------
 * Implements Fix 3 of the session-persistence remediation plan.
 *
 * Wrap any page or layout that must only be visible to authenticated users.
 * While the initial /auth/me round-trip is in flight (isLoading === true),
 * we render a lightweight loader instead of redirecting. This is critical
 * to avoid the "logged-out-on-refresh" flash: on a hard reload the
 * in-memory auth state starts empty, but the HttpOnly cookie is valid and
 * refreshUser() will rehydrate the session within a few hundred ms.
 *
 * Usage:
 *   <ProtectedRoute>
 *     <DashboardPage />
 *   </ProtectedRoute>
 *
 * Role-guarded usage:
 *   <ProtectedRoute allowedRoles={['admin', 'director']}>
 *     <AdminPage />
 *   </ProtectedRoute>
 */

import { useEffect, type ReactNode } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

export interface ProtectedRouteProps {
  children: ReactNode
  /** Optional list of roles allowed to see the page. Case-insensitive. */
  allowedRoles?: string[]
  /** Where to send unauthenticated users. Defaults to /login. */
  redirectTo?: string
  /** Where to send authenticated-but-unauthorized users. Defaults to /unauthorized. */
  unauthorizedRedirectTo?: string
  /** Optional custom fallback while auth state is loading. */
  fallback?: ReactNode
}

function DefaultFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '60vh',
        width: '100%',
      }}
    >
      <div
        style={{
          padding: '1rem 1.5rem',
          borderRadius: 8,
          background: 'rgba(0,0,0,0.04)',
          fontSize: 14,
          color: '#555',
        }}
      >
        Checking your session…
      </div>
    </div>
  )
}

export default function ProtectedRoute({
  children,
  allowedRoles,
  redirectTo = '/login',
  unauthorizedRedirectTo = '/unauthorized',
  fallback,
}: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      // Preserve the intended destination so the login page can send the
      // user back here after a successful login.
      const next = pathname && pathname !== '/login' ? `?next=${encodeURIComponent(pathname)}` : ''
      router.replace(`${redirectTo}${next}`)
      return
    }

    if (allowedRoles && allowedRoles.length > 0 && user) {
      const role = String(user.role || '').toLowerCase().trim()
      const allowed = allowedRoles.map((r) => r.toLowerCase().trim())
      if (!allowed.includes(role)) {
        router.replace(unauthorizedRedirectTo)
      }
    }
  }, [
    isLoading,
    isAuthenticated,
    user,
    allowedRoles,
    redirectTo,
    unauthorizedRedirectTo,
    router,
    pathname,
  ])

  // While auth state is loading, render the fallback (NOT a redirect).
  // This is the single most important behaviour: without it, a hard reload
  // would briefly see `isAuthenticated === false` and bounce the user to
  // /login before refreshUser() finishes.
  if (isLoading) return <>{fallback ?? <DefaultFallback />}</>
  if (!isAuthenticated) return <>{fallback ?? <DefaultFallback />}</>

  if (allowedRoles && allowedRoles.length > 0 && user) {
    const role = String(user.role || '').toLowerCase().trim()
    const allowed = allowedRoles.map((r) => r.toLowerCase().trim())
    if (!allowed.includes(role)) return <>{fallback ?? <DefaultFallback />}</>
  }

  return <>{children}</>
}

export { ProtectedRoute }