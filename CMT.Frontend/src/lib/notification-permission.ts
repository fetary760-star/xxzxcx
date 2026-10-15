/**
 * Notification Permission Utility
 *
 * Provides reusable functions to request browser notification permission
 * and manage Service Worker registration for production-grade notifications.
 *
 * KEY INSIGHT — Why notifications fail in production but work locally:
 * ─────────────────────────────────────────────────────────────────────
 * On localhost, browsers are lenient: `new Notification(...)` works directly.
 * On production servers (HTTPS or non-localhost HTTP), browsers require:
 *   1. Explicit user consent triggered by a user gesture (click/tap).
 *   2. Notifications dispatched via a registered Service Worker using
 *      `registration.showNotification()` for reliability — especially
 *      when the tab is in the background or the browser is minimized.
 *
 * CRITICAL: On non-localhost HTTP origins (e.g. http://svhqiis03:8757),
 * modern browsers (Chrome 62+, Firefox, Edge) BLOCK the permission prompt
 * entirely. `Notification.requestPermission()` resolves to 'denied' without
 * ever showing a prompt. In this case, OS-level notifications are impossible
 * and the app MUST fall back to in-app toast notifications.
 *
 * This module handles both the permission flow, Service Worker lifecycle,
 * and provides detection for insecure-origin blocking.
 */

// ─── Insecure Origin Detection ──────────────────────────────────────────────

/**
 * Detect whether the current origin is considered "secure" by the browser.
 * Secure contexts: https://, localhost, 127.0.0.1, [::1], file://
 * Insecure: any other http:// origin (e.g. http://svhqiis03:8757)
 *
 * On insecure origins, browsers block the Notification permission prompt
 * entirely — `Notification.requestPermission()` silently returns 'denied'.
 */
export function isSecureContext(): boolean {
  if (typeof window === 'undefined') return false;

  // Use the browser's own isSecureContext flag if available
  if (typeof window.isSecureContext === 'boolean') {
    return window.isSecureContext;
  }

  // Fallback: manually check the protocol and hostname
  const { protocol, hostname } = window.location;
  if (protocol === 'https:') return true;
  if (protocol === 'file:') return true;
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]') return true;

  return false;
}

/**
 * Check if OS-level notifications are blocked due to insecure origin.
 * Returns true when the browser will never show a permission prompt
 * because the page is served over plain HTTP on a non-localhost host.
 */
export function isNotificationBlockedByInsecureOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  if (!('Notification' in window)) return true;

  // If we're on a secure context, notifications are not blocked by origin
  if (isSecureContext()) return false;

  // On insecure origins, the browser blocks the permission prompt.
  // If permission is already 'granted' (from before), it still works.
  // But if it's 'default' or 'denied', the user can never grant it.
  return Notification.permission !== 'granted';
}

// ─── Service Worker Registration ────────────────────────────────────────────

let swRegistration: ServiceWorkerRegistration | null = null;
let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

/**
 * Wait for a ServiceWorker to reach the 'activated' state.
 * Handles installing, waiting, and activated states.
 */
function waitForActivation(reg: ServiceWorkerRegistration): Promise<void> {
  return new Promise((resolve) => {
    // Already active
    if (reg.active) {
      resolve();
      return;
    }

    const sw = reg.installing || reg.waiting;
    if (!sw) {
      // No SW at all — resolve immediately
      resolve();
      return;
    }

    const onStateChange = () => {
      if (sw.state === 'activated') {
        sw.removeEventListener('statechange', onStateChange);
        resolve();
      }
    };
    sw.addEventListener('statechange', onStateChange);

    // Safety timeout — don't block forever
    setTimeout(() => {
      sw.removeEventListener('statechange', onStateChange);
      resolve();
    }, 5000);
  });
}

/**
 * Register (or retrieve the existing) notification service worker.
 * The SW file must be placed at `public/notification-sw.js`.
 *
 * Returns the ServiceWorkerRegistration or null if unavailable.
 */
export async function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  // Already resolved with an active SW
  if (swRegistration && swRegistration.active) return swRegistration;

  // Deduplicate concurrent calls
  if (swRegistrationPromise) return swRegistrationPromise;

  swRegistrationPromise = (async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      console.warn('[Notifications] Service Worker API not available');
      return null;
    }

    // Service Workers require a secure context in most browsers
    if (!isSecureContext()) {
      console.debug('[Notifications] Skipping Service Worker registration on insecure origin');
      return null;
    }

    try {
      // Check if already registered
      const existingReg = await navigator.serviceWorker.getRegistration('/notification-sw.js');
      if (existingReg) {
        // If there's a waiting SW, tell it to skip waiting and activate
        if (existingReg.waiting) {
          console.debug('[Notifications] Activating waiting Service Worker');
          existingReg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // Wait for the SW to become active if it's installing or waiting
        if (!existingReg.active) {
          await waitForActivation(existingReg);
        }

        swRegistration = existingReg;
        console.debug('[Notifications] Using existing SW registration, active:', !!existingReg.active);
        return existingReg;
      }

      // Fresh registration
      const reg = await navigator.serviceWorker.register('/notification-sw.js', {
        scope: '/',
      });

      // Wait for the SW to become active
      await waitForActivation(reg);

      // Handle the controllerchange for waiting SWs
      if (reg.waiting && !reg.active) {
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true });
          setTimeout(resolve, 3000);
        });
      }

      swRegistration = reg;
      console.debug('[Notifications] Service Worker registered, active:', !!reg.active);
      return reg;
    } catch (err) {
      console.warn('[Notifications] Service Worker registration failed:', err);
      return null;
    } finally {
      swRegistrationPromise = null;
    }
  })();

  return swRegistrationPromise;
}

/**
 * Get the current Service Worker registration (if any), without triggering
 * a new registration.
 */
export function getServiceWorkerRegistration(): ServiceWorkerRegistration | null {
  return swRegistration;
}

// ─── Permission Helpers ─────────────────────────────────────────────────────

/**
 * Request notification permission from the browser.
 * Returns true if permission is granted, false otherwise.
 *
 * IMPORTANT: This should ONLY be called from a user-gesture context
 * (click handler, tap handler, etc.) in production. Browsers will
 * silently ignore permission requests that are not triggered by a
 * user gesture on non-localhost origins.
 *
 * On insecure (non-HTTPS, non-localhost) origins, this will always
 * return false because the browser blocks the permission prompt entirely.
 *
 * This should be called:
 * 1. When the user clicks the notification bell
 * 2. When the user opens the notification panel for the first time
 * 3. When the user explicitly clicks "Enable notifications"
 */
export async function requestNotificationPermission(): Promise<boolean> {
  // Check if the browser supports notifications
  if (typeof window === 'undefined' || !('Notification' in window)) {
    console.warn('[Notifications] This browser does not support desktop notifications');
    return false;
  }

  // Already granted — also ensure SW is registered
  if (Notification.permission === 'granted') {
    // Fire-and-forget SW registration so it's ready for showNotification
    void registerNotificationServiceWorker();
    return true;
  }

  // Already denied — user must manually re-enable in browser settings.
  if (Notification.permission === 'denied') {
    console.debug(
      '[Notifications] Permission was previously denied. User must enable notifications in browser settings.'
    );
    return false;
  }

  // On insecure origins, requesting permission will silently fail
  if (!isSecureContext()) {
    console.debug(
      '[Notifications] Cannot request notification permission on insecure (non-HTTPS) origin. ' +
      'In-app notifications will be used as fallback.'
    );
    return false;
  }

  // Permission is 'default' — ask the user
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      // Register SW immediately after grant so it's ready
      void registerNotificationServiceWorker();
      return true;
    }
    return false;
  } catch {
    // Some older browsers don't support the promise-based API
    return false;
  }
}

/**
 * Check current notification permission status without prompting.
 * Returns: 'granted' | 'denied' | 'default' | 'unsupported'
 */
export function getNotificationPermissionStatus(): string {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

/**
 * Get an enhanced permission status that distinguishes between
 * "denied by user" and "blocked by insecure origin".
 *
 * Returns:
 *   'granted'          — OS notifications are available
 *   'default'          — User hasn't decided yet (prompt possible on secure origins)
 *   'denied'           — User explicitly denied permission
 *   'insecure_blocked' — Blocked by browser due to non-HTTPS origin
 *   'unsupported'      — Browser doesn't support notifications
 */
export function getEnhancedPermissionStatus(): string {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }

  const permission = Notification.permission;

  // If granted, it works regardless of origin
  if (permission === 'granted') return 'granted';

  // If on an insecure origin, the browser blocks the prompt
  if (!isSecureContext()) {
    return 'insecure_blocked';
  }

  // On secure origins, return the actual permission status
  return permission; // 'default' or 'denied'
}

/**
 * Check if notifications are currently available (permission granted + browser support).
 */
export function areNotificationsAvailable(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  return Notification.permission === 'granted';
}

/**
 * Check if in-app fallback notifications should be used.
 * Returns true when OS-level notifications are not available
 * (blocked by insecure origin, denied, or unsupported).
 */
export function shouldUseInAppFallback(): boolean {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return true;
  }
  if (Notification.permission === 'granted') {
    return false;
  }
  // On insecure origins or when denied, use in-app fallback
  return true;
}

// ─── Notification Sound (Web Audio API — works on HTTP!) ────────────────────

/**
 * Play a notification chime sound using the Web Audio API.
 * Unlike the Notification API, the Web Audio API works on HTTP origins,
 * so users on insecure origins will still hear an audible alert.
 *
 * The sound is a pleasant two-tone chime (C5 → E5) that fades out over 0.6s.
 */
export function playNotificationSound(priority: string = 'medium'): void {
  try {
    const ctx = new AudioContext();

    // Louder and longer for urgent/high priority
    const isUrgent = ['urgent', 'high'].includes(priority.toLowerCase());
    const baseVolume = isUrgent ? 0.4 : 0.25;
    const duration = isUrgent ? 0.8 : 0.5;

    // First tone
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.value = isUrgent ? 880 : 660; // A5 vs E5
    osc1.type = 'sine';
    gain1.gain.setValueAtTime(baseVolume, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc1.start(ctx.currentTime);
    osc1.stop(ctx.currentTime + duration);

    // Second tone (slightly delayed, higher pitch)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.frequency.value = isUrgent ? 1100 : 880; // C#6 vs A5
    osc2.type = 'sine';
    const delay = 0.15;
    gain2.gain.setValueAtTime(0, ctx.currentTime);
    gain2.gain.setValueAtTime(baseVolume * 0.8, ctx.currentTime + delay);
    gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + delay + duration);
    osc2.start(ctx.currentTime + delay);
    osc2.stop(ctx.currentTime + delay + duration);

    // Clean up
    setTimeout(() => ctx.close(), 2000);
  } catch {
    // Web Audio API not available — ignore silently
  }
}

// ─── Auto-Request Permission on First User Gesture ──────────────────────────

let autoRequestInitialized = false;

/**
 * Automatically request notification permission on the first user gesture
 * (click, tap, or keydown). This ensures the browser permission prompt
 * appears as early as possible without requiring the user to find and
 * click a specific "Enable" button.
 *
 * On HTTPS: The browser will show the native permission prompt.
 * On HTTP:  The request silently fails (returns 'denied'), and the app
 *           falls back to in-app notifications with sound alerts.
 *
 * Call this once from the app's root component or entry point.
 */
export function initAutoPermissionRequest(): void {
  if (typeof window === 'undefined') return;
  if (autoRequestInitialized) return;
  autoRequestInitialized = true;

  // If already granted or denied, no need to auto-request
  const current = getNotificationPermissionStatus();
  if (current === 'granted') {
    void registerNotificationServiceWorker();
    return;
  }
  if (current === 'denied') return;

  const handleGesture = async () => {
    // Only request once
    document.removeEventListener('click', handleGesture);
    document.removeEventListener('keydown', handleGesture);
    document.removeEventListener('touchstart', handleGesture);

    const status = getNotificationPermissionStatus();
    if (status !== 'default') return; // Already decided

    if (isSecureContext()) {
      // On HTTPS: request permission (this shows the browser prompt)
      const granted = await requestNotificationPermission();
      if (granted) {
        console.debug('[Notifications] Auto-permission granted on first gesture');
      }
    }
    // On HTTP: we can't request permission, but in-app notifications
    // with sound will work automatically via the fallback system.
  };

  document.addEventListener('click', handleGesture, { once: false });
  document.addEventListener('keydown', handleGesture, { once: false });
  document.addEventListener('touchstart', handleGesture, { once: false });
}

// ─── App Origin Detection ───────────────────────────────────────────────────

/**
 * Get all application origins that should be added to Chrome flags
 * for enabling notifications on HTTP. Detects both the frontend and
 * API server ports from the current URL.
 */
export function getAppOrigins(): string[] {
  if (typeof window === 'undefined') return ['http://svhqiis03:8757', 'http://localhost:5000'];

  const { protocol, hostname } = window.location;
  const origins: string[] = [];

  // Current origin (frontend)
  origins.push(`${protocol}//${hostname}:${window.location.port}`);

  // API server (typically port 8756 when frontend is 8757, and vice versa)
  const currentPort = parseInt(window.location.port, 10);
  if (currentPort === 8757) {
    origins.push(`${protocol}//${hostname}:8756`);
  } else if (currentPort === 8756) {
    origins.push(`${protocol}//${hostname}:8757`);
  }

  return origins;
}

/**
 * Get the Chrome flags URL for enabling insecure origin notifications.
 * This is the URL users need to visit in Chrome to add the app origins
 * as trusted secure origins.
 */
export function getChromeFlagsUrl(): string {
  return 'chrome://flags/#unsafely-treat-insecure-origin-as-secure';
}

// ─── Test Desktop Notification ──────────────────────────────────────────────

export interface NotificationTestResult {
  success: boolean;
  method: 'service-worker' | 'direct-api' | 'in-app-fallback' | 'none';
  message: string;
  permissionStatus: string;
  isSecureContext: boolean;
  swRegistered: boolean;
  swActive: boolean;
}

/**
 * Test desktop notification delivery and return a detailed diagnostic result.
 * This helps users and developers understand why notifications may not be working.
 */
export async function testDesktopNotification(): Promise<NotificationTestResult> {
  const result: NotificationTestResult = {
    success: false,
    method: 'none',
    message: '',
    permissionStatus: getNotificationPermissionStatus(),
    isSecureContext: isSecureContext(),
    swRegistered: swRegistration !== null,
    swActive: swRegistration?.active !== null && swRegistration?.active !== undefined,
  };

  // Check browser support
  if (typeof window === 'undefined' || !('Notification' in window)) {
    result.message = 'This browser does not support desktop notifications.';
    return result;
  }

  // Check permission
  if (Notification.permission === 'denied') {
    result.message = 'Notification permission was denied. You must re-enable it in your browser settings (click the lock/icon in the address bar).';
    return result;
  }

  if (Notification.permission === 'default') {
    if (!result.isSecureContext) {
      result.message = 'Cannot request notification permission on HTTP. The site must be served over HTTPS, or you must add this origin as a trusted secure origin in Chrome flags.';
      return result;
    }
    // Try requesting permission (may not work outside user gesture)
    const granted = await requestNotificationPermission();
    result.permissionStatus = getNotificationPermissionStatus();
    if (!granted) {
      result.message = 'Notification permission was not granted. Click the bell icon to trigger the permission prompt.';
      return result;
    }
  }

  // Permission is granted — try showing a notification
  // Strategy 1: Service Worker
  const reg = swRegistration?.active ? swRegistration : await registerNotificationServiceWorker();
  if (reg?.active) {
    try {
      reg.showNotification('🔔 CMT Test Notification', {
        body: 'Desktop notifications are working! You will receive task alerts.',
        icon: '/favicon.ico',
        tag: 'cmt-test-notification',
        requireInteraction: true,
        data: { actionUrl: '/', test: true },
      });
      result.success = true;
      result.method = 'service-worker';
      result.swRegistered = true;
      result.swActive = true;
      result.message = 'Desktop notification sent via Service Worker successfully.';
      return result;
    } catch (err) {
      result.message = `Service Worker showNotification failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  // Strategy 2: Direct Notification API
  try {
    const notif = new Notification('🔔 CMT Test Notification', {
      body: 'Desktop notifications are working! You will receive task alerts.',
      icon: '/favicon.ico',
      tag: 'cmt-test-notification',
      requireInteraction: true,
    });
    notif.onclick = () => { window.focus(); notif.close(); };
    result.success = true;
    result.method = 'direct-api';
    result.message = 'Desktop notification sent via direct Notification API.';
    return result;
  } catch (err) {
    result.message = `Direct Notification API failed: ${err instanceof Error ? err.message : String(err)}`;
  }

  // Strategy 3: In-app fallback
  if (inAppFallbackCallback) {
    try {
      inAppFallbackCallback('🔔 CMT Test Notification', 'In-app notifications are working! Desktop notifications are not available on this origin.', {
        tag: 'cmt-test-notification',
        priority: 'medium',
      });
      result.success = true;
      result.method = 'in-app-fallback';
      result.message = 'In-app fallback notification sent. Desktop notifications are not available on this HTTP origin.';
      return result;
    } catch (err) {
      result.message = `In-app fallback failed: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  result.message = 'No notification method available. Please check your browser settings.';
  return result;
}

// ─── Show Notification (Production-Safe with In-App Fallback) ───────────────

/**
 * Callback type for in-app fallback notifications.
 * The app registers a callback (e.g., sonner toast) that gets called
 * when OS-level notifications are not available.
 */
export type InAppNotificationCallback = (
  title: string,
  body: string,
  options?: {
    actionUrl?: string;
    tag?: string;
    requireInteraction?: boolean;
    type?: string;
    priority?: string;
  }
) => void;

let inAppFallbackCallback: InAppNotificationCallback | null = null;

/**
 * Register an in-app fallback notification handler.
 * This will be called when OS-level notifications are not available.
 * Typically, this should display a sonner toast or similar in-app notification.
 */
export function registerInAppFallback(callback: InAppNotificationCallback): void {
  inAppFallbackCallback = callback;
}

/**
 * Show a notification using the most reliable method available:
 *   1. Service Worker `showNotification()` — works in background tabs, production
 *   2. Fallback to `new Notification()` — works in foreground on localhost
 *   3. In-app fallback (sonner toast) — always works, used when OS notifications blocked
 *
 * This is the ONLY function that should be used to display notifications
 * throughout the application.
 */
export async function showNotificationSafe(
  title: string,
  body: string,
  options?: {
    actionUrl?: string;
    tag?: string;
    requireInteraction?: boolean;
    icon?: string;
    badge?: string;
    silent?: boolean;
    timestamp?: number;
    type?: string;
    priority?: string;
  }
): Promise<void> {
  if (typeof window === 'undefined') return;

  const permissionStatus = typeof Notification !== 'undefined' ? Notification.permission : 'unsupported';

  // If OS notifications are not available, use in-app fallback
  if (!('Notification' in window) || permissionStatus !== 'granted') {
    console.debug('[Notifications] OS notifications not available (permission:', permissionStatus, '), using in-app fallback');
    if (inAppFallbackCallback) {
      try {
        inAppFallbackCallback(title, body, {
          actionUrl: options?.actionUrl,
          tag: options?.tag,
          requireInteraction: options?.requireInteraction,
          type: options?.type,
          priority: options?.priority,
        });
      } catch (err) {
        console.warn('[Notifications] In-app fallback callback error:', err);
      }
    }
    return;
  }

  const notifOptions: NotificationOptions = {
    body,
    icon: options?.icon || '/favicon.ico',
    badge: options?.badge || '/favicon.ico',
    tag: options?.tag || `cmt-notif-${Date.now()}`,
    requireInteraction: options?.requireInteraction ?? false,
    silent: options?.silent ?? false,
    data: {
      actionUrl: options?.actionUrl,
      ...(options?.timestamp != null ? { timestamp: options.timestamp } : {}),
    },
  };

  // Strategy 1: Use Service Worker (production-reliable)
  // Always try to get a fresh registration — the cached one might be stale
  const reg = swRegistration?.active ? swRegistration : await registerNotificationServiceWorker();
  if (reg) {
    // Ensure the SW is actually active before trying showNotification
    if (reg.active) {
      try {
        reg.showNotification(title, notifOptions);
        console.debug('[Notifications] Desktop notification shown via Service Worker');
        return; // Success via SW
      } catch (err) {
        console.warn('[Notifications] SW showNotification failed, falling back:', err);
        // Fall through to direct Notification
      }
    } else {
      console.debug('[Notifications] SW registered but not active, falling back to direct Notification');
    }
  }

  // Strategy 2: Fallback to direct Notification constructor (localhost / foreground)
  try {
    const notif = new Notification(title, notifOptions);

    if (options?.actionUrl) {
      notif.onclick = () => {
        window.focus();
        window.open(options.actionUrl!, '_self');
        notif.close();
      };
    } else {
      notif.onclick = () => {
        window.focus();
        notif.close();
      };
    }
    console.debug('[Notifications] Desktop notification shown via direct Notification API');
  } catch (err) {
    console.warn('[Notifications] Direct Notification failed, using in-app fallback:', err);
    // Direct Notification failed — use in-app fallback
    if (inAppFallbackCallback) {
      try {
        inAppFallbackCallback(title, body, {
          actionUrl: options?.actionUrl,
          tag: options?.tag,
          requireInteraction: options?.requireInteraction,
          type: options?.type,
          priority: options?.priority,
        });
      } catch (fallbackErr) {
        console.warn('[Notifications] In-app fallback callback error:', fallbackErr);
      }
    }
  }
}