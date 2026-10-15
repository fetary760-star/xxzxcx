// src/lib/secure-auth-store.ts
// ---------------------------------------------------------------------------
// SECURITY FIX (Pentest finding: "Sensitive Data Exposure via Browser Local
// Storage", severity HIGH).
//
// This module provides an in-memory store for sensitive auth data so we no
// longer persist tokens, refresh tokens, user profile, or role/permission
// matrices in `localStorage` (which is readable by any script on the origin
// and easily exfiltrated via XSS).
//
// Policy:
//   - Access token & refresh token: kept ONLY in memory here (lost on tab
//     close / hard reload). They are primarily carried on the wire via the
//     HttpOnly, Secure, SameSite=Strict cookie set by the backend
//     (see CMT.Web.Api/Controllers/AuthController and Program.cs).
//     The in-memory copy is only used for the Authorization header on
//     fetches originated from this tab during its lifetime.
//   - User profile & role permission matrix: kept ONLY in memory. If a
//     page reload occurs, they are re-fetched from the backend via the
//     HttpOnly cookie session.
//   - NOTHING sensitive is written to localStorage or sessionStorage.
// ---------------------------------------------------------------------------

type Listener = () => void

interface SecureAuthState {
  token: string | null
  refreshToken: string | null
  user: any | null
  directorPermissions: any | null
  rolePermissionsMatrix: any | null
  tlPermissions: any | null
}

const state: SecureAuthState = {
  token: null,
  refreshToken: null,
  user: null,
  directorPermissions: null,
  rolePermissionsMatrix: null,
  tlPermissions: null,
}

const listeners: Set<Listener> = new Set()

function emit() {
  listeners.forEach((l) => {
    try { l() } catch { /* ignore listener errors */ }
  })
}

// ─── Public API ──────────────────────────────────────────────────────────────

export const secureAuthStore = {
  // ── Token ──
  getToken(): string | null {
    return state.token
  },
  setToken(token: string | null) {
    state.token = token || null
    emit()
  },

  // ── Refresh token (kept in memory only) ──
  getRefreshToken(): string | null {
    return state.refreshToken
  },
  setRefreshToken(token: string | null) {
    state.refreshToken = token || null
    emit()
  },

  // ── User profile ──
  getUser(): any | null {
    return state.user
  },
  setUser(user: any | null) {
    state.user = user || null
    emit()
  },

  // ── Director permissions ──
  getDirectorPermissions(): any | null {
    return state.directorPermissions
  },
  setDirectorPermissions(perms: any | null) {
    state.directorPermissions = perms || null
    emit()
  },

  // ── Role permissions matrix ──
  getRolePermissionsMatrix(): any | null {
    return state.rolePermissionsMatrix
  },
  setRolePermissionsMatrix(matrix: any | null) {
    state.rolePermissionsMatrix = matrix || null
    emit()
  },

  // ── Team Leader permissions ──
  getTlPermissions(): any | null {
    return state.tlPermissions
  },
  setTlPermissions(perms: any | null) {
    state.tlPermissions = perms || null
    emit()
  },

  // ── Full clear (on logout) ──
  clearAll() {
    state.token = null
    state.refreshToken = null
    state.user = null
    state.directorPermissions = null
    state.rolePermissionsMatrix = null
    state.tlPermissions = null
    emit()
  },

  // ── Subscription (for useSyncExternalStore) ──
  subscribe(listener: Listener): () => void {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}

// ─── Legacy cleanup ──────────────────────────────────────────────────────────
// On module load (client side only), purge any previously-stored sensitive
// keys from localStorage so users upgrading from the vulnerable version do
// not leave their credentials lying around on disk.
if (typeof window !== 'undefined') {
  const SENSITIVE_KEYS = [
    'token',
    'auth_token',
    'authToken',
    'accessToken',
    'refreshToken',
    'user',
    'cmt_role_permissions_matrix',
    'director_permissions',
    'tl_permissions',
  ]
  try {
    for (const k of SENSITIVE_KEYS) {
      try { localStorage.removeItem(k) } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

export default secureAuthStore