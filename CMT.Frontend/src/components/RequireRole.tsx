'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'

interface RequireRoleProps {
  allowed: string[] // e.g. ['team_leader','director']
  children: React.ReactNode
}

/**
 * Client-side guard that mirrors PHP check_role([...]) semantics.
 * - Redirect to /login if not authenticated
 * - Redirect to /unauthorized if authenticated but role not allowed
 *
 * Place this file at src/components/RequireRole.tsx to satisfy imports like:
 * import RequireRole from "@/components/RequireRole"
 */
export default function RequireRole({ allowed, children }: RequireRoleProps) {
  const { user, isLoading, isAuthenticated } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return

    if (!isAuthenticated) {
      router.replace('/login')
      return
    }

    const userRole = (user?.role ?? '').toLowerCase()
    const normalizedAllowed = allowed.map(r => r.toLowerCase())

    if (!normalizedAllowed.includes(userRole)) {
      router.replace('/unauthorized')
    }
  }, [isLoading, isAuthenticated, user, allowed, router])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
      </div>
    )
  }

  // Render children only when authenticated and role allowed
  if (isAuthenticated && allowed.map(r => r.toLowerCase()).includes((user?.role ?? '').toLowerCase())) {
    return <>{children}</>
  }

  // null while redirecting
  return null
}