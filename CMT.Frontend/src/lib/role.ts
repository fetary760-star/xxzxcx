// lib/role.ts
import { Session } from "next-auth";

/**
 * Check role server-side (used in getServerSideProps).
 * allowedRoles: [] means any authenticated user allowed.
 */
export function checkRoleServerSide(session: Session | null, allowedRoles: string[] = []) {
  if (!session || !session.user) {
    return { allowed: false, reason: "not_authenticated" as const };
  }
  const userRole = (session.user as any).role as string | undefined;
  if (!userRole) {
    return { allowed: false, reason: "no_role" as const };
  }
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    return { allowed: true };
  }
  if (allowedRoles.includes(userRole)) {
    return { allowed: true };
  }
  return { allowed: false, reason: "forbidden" as const };
}

/** Client helper */
export function hasRole(session: Session | null, allowedRoles: string[] = []) {
  if (!session || !session.user) return false;
  const userRole = (session.user as any).role as string | undefined;
  if (!userRole) return false;
  return allowedRoles.includes(userRole);
}