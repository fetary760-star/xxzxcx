// ---------------------------------------------------------------------------
// Fix 4 of the session-persistence remediation plan.
//
// The original `src/hooks/useAuth.ts` implemented a SECOND authentication
// system that stored the access token and user object in localStorage. It
// conflicted with the canonical `AuthProvider` / `useAuth` exposed by
// `@/lib/auth-context`, which keeps sensitive state in memory and relies
// on the HttpOnly `auth_token` cookie for session persistence.
//
// The two systems diverged on refresh:
//   - `@/lib/auth-context` wiped its in-memory token (correct) and rebuilt
//     the session from /api/auth/me via the HttpOnly cookie.
//   - `@/hooks/useAuth` read from localStorage, sent a stale Bearer token,
//     and was vulnerable to XSS token theft.
//
// Having both live at the same time meant different parts of the UI saw
// different "logged in" states, which is the root cause of the
// "logged-out-on-refresh" symptom.
//
// Rather than delete the file (which would break any future import), we
// keep the module path alive and re-export the canonical implementation.
// Any code that still imports from `@/hooks/useAuth` now gets the exact
// same object as `@/lib/auth-context`.
// ---------------------------------------------------------------------------

export { useAuth } from '@/lib/auth-context'
export { useAuth as default } from '@/lib/auth-context'