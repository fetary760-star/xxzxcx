import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { secureAuthStore } from '@/lib/secure-auth-store'

export interface NotificationSettings {
  emailNotifications: boolean
  taskReminders: boolean
  weeklyReports: boolean
  inAppToastNotifications: boolean
}

const DEFAULT_SETTINGS: NotificationSettings = {
  emailNotifications: true,
  taskReminders: true,
  weeklyReports: true,
  inAppToastNotifications: true,
}

// ================================================================
// SECURITY FIX: Removed localStorage persistence of user preferences.
// Previously stored under 'cmt_user_preferences' in localStorage, which
// persists across browser sessions and is accessible to any JavaScript
// running on the same origin (vulnerable to XSS exfiltration).
//
// Replacement strategy:
//   - Use an in-memory module-level cache (cleared on full page reload).
//   - Use sessionStorage as a tab-scoped fallback so preferences survive
//     a single refresh within the same tab but are wiped when the tab
//     closes, eliminating persistent browser-storage exposure.
//   - One-time cleanup removes any legacy localStorage key left over
//     from previous app versions.
// ================================================================
const PREFS_STORAGE_KEY = 'cmt_user_preferences'

function safeSessionGet(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    if (typeof window === 'undefined') return
    window.sessionStorage.setItem(key, value)
  } catch {
    // ignore
  }
}

// One-time cleanup of any legacy localStorage entry from previous app versions.
// Executed at module load so the audit finding is remediated for existing users
// on their next session.
;(function cleanupLegacyLocalStorage() {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem(PREFS_STORAGE_KEY)
  } catch {
    // ignore
  }
})()

function loadSessionPreferences(): NotificationSettings | null {
  try {
    const raw = safeSessionGet(PREFS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Only return if the object has at least one notification key
    if (typeof parsed.inAppToastNotifications === 'boolean') {
      return {
        emailNotifications: typeof parsed.emailNotifications === 'boolean' ? parsed.emailNotifications : DEFAULT_SETTINGS.emailNotifications,
        taskReminders: typeof parsed.taskReminders === 'boolean' ? parsed.taskReminders : DEFAULT_SETTINGS.taskReminders,
        weeklyReports: typeof parsed.weeklyReports === 'boolean' ? parsed.weeklyReports : DEFAULT_SETTINGS.weeklyReports,
        inAppToastNotifications: parsed.inAppToastNotifications,
      }
    }
  } catch {
    // ignore
  }
  return null
}

// Module-level cache so all consumers share the same settings without re-fetching.
// Initialize from sessionStorage (tab-scoped) if available, so settings survive
// a single refresh within the same tab but are wiped when the tab closes.
let cachedSettings: NotificationSettings | null = (typeof window !== 'undefined') ? loadSessionPreferences() : null
let cacheTimestamp = cachedSettings ? Date.now() : 0
const CACHE_TTL = 60_000 // 1 minute

// Listeners to notify all hook instances when settings change
type Listener = (settings: NotificationSettings) => void
const listeners = new Set<Listener>()

function notifyListeners(settings: NotificationSettings) {
  listeners.forEach((fn) => {
    try {
      fn(settings)
    } catch {
      // ignore listener errors
    }
  })
}

/**
 * Fetches user notification settings from the backend and caches them.
 * All components using this hook share the same cached settings.
 */
export function useNotificationSettings() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<NotificationSettings>(
    cachedSettings ?? DEFAULT_SETTINGS
  )
  const [isLoading, setIsLoading] = useState(!cachedSettings)
  const fetchedRef = useRef(false)

  // Subscribe to cross-instance updates
  useEffect(() => {
    const handler: Listener = (updated) => setSettings(updated)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])

  const fetchSettings = useCallback(async () => {
    const token = secureAuthStore.getToken()

    if (!token) return

    try {
      setIsLoading(true)
      const response = await fetch('/api/settings', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        credentials: 'include',
      })

      if (!response.ok) {
        // If settings endpoint fails, keep defaults
        return
      }

      const data = await response.json()

      // SECURITY FIX: Merge with sessionStorage preferences (tab-scoped),
      // not localStorage. Backend returns hardcoded defaults.
      const localPrefs = loadSessionPreferences()

      const newSettings: NotificationSettings = {
        emailNotifications:
          localPrefs?.emailNotifications ??
          (typeof data.emailNotifications === 'boolean'
            ? data.emailNotifications
            : DEFAULT_SETTINGS.emailNotifications),
        taskReminders:
          localPrefs?.taskReminders ??
          (typeof data.taskReminders === 'boolean'
            ? data.taskReminders
            : DEFAULT_SETTINGS.taskReminders),
        weeklyReports:
          localPrefs?.weeklyReports ??
          (typeof data.weeklyReports === 'boolean'
            ? data.weeklyReports
            : DEFAULT_SETTINGS.weeklyReports),
        inAppToastNotifications:
          localPrefs?.inAppToastNotifications ??
          (typeof data.inAppToastNotifications === 'boolean'
            ? data.inAppToastNotifications
            : DEFAULT_SETTINGS.inAppToastNotifications),
      }

      cachedSettings = newSettings
      cacheTimestamp = Date.now()
      setSettings(newSettings)
      notifyListeners(newSettings)
    } catch {
      // Silently fail — keep defaults
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Fetch on mount if cache is stale or missing
  useEffect(() => {
    if (!user) return
    if (fetchedRef.current) return

    const isCacheValid =
      cachedSettings !== null && Date.now() - cacheTimestamp < CACHE_TTL

    if (isCacheValid) {
      setSettings(cachedSettings!)
      setIsLoading(false)
      return
    }

    fetchedRef.current = true
    void fetchSettings()
  }, [user, fetchSettings])

  /**
   * Call this after saving settings on the Settings page
   * to immediately update all consumers.
   */
  const updateSettings = useCallback((updated: Partial<NotificationSettings>) => {
    const merged = { ...(cachedSettings ?? DEFAULT_SETTINGS), ...updated }
    cachedSettings = merged
    cacheTimestamp = Date.now()
    setSettings(merged)
    notifyListeners(merged)

    // SECURITY FIX: Persist to sessionStorage (tab-scoped) instead of
    // localStorage. Settings survive a single refresh in the same tab
    // but are wiped when the tab closes — no persistent XSS exfiltration risk.
    try {
      const existing = safeSessionGet(PREFS_STORAGE_KEY)
      const parsed = existing ? JSON.parse(existing) : {}
      const updatedStore = { ...parsed, ...updated }
      safeSessionSet(PREFS_STORAGE_KEY, JSON.stringify(updatedStore))
    } catch {
      // ignore storage errors
    }
  }, [])

  /**
   * Force a refetch from the server (e.g. after saving settings).
   */
  const refetch = useCallback(() => {
    fetchedRef.current = false
    cachedSettings = null
    cacheTimestamp = 0
    void fetchSettings()
  }, [fetchSettings])

  /**
   * Check whether a toast notification should be shown based on current settings.
   * @param notificationType - optional notification type to check specific settings
   */
  const shouldShowToast = useCallback(
    (notificationType?: string): boolean => {
      const s = cachedSettings ?? settings

      // Master toggle: if in-app toasts are disabled, never show
      if (!s.inAppToastNotifications) return false

      // Check type-specific settings
      if (notificationType) {
        const lowerType = notificationType.toLowerCase()

        // Task-related notifications respect taskReminders
        if (
          lowerType.includes('task') ||
          lowerType.includes('assignment') ||
          lowerType.includes('status')
        ) {
          return s.taskReminders
        }

        // Amendment and intervention are always shown if master toggle is on
        if (
          lowerType.includes('amendment') ||
          lowerType.includes('intervention')
        ) {
          return true
        }
      }

      // Default: show if master toggle is on
      return true
    },
    [settings]
  )

  return {
    settings,
    isLoading,
    updateSettings,
    refetch,
    shouldShowToast,
  }
}

export default useNotificationSettings