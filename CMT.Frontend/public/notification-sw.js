/**
 * Notification Service Worker
 *
 * This lightweight service worker handles notification display and click events.
 * It enables reliable OS-level notifications in production environments where
 * the direct `new Notification()` constructor may not work (background tabs,
 * minimized browser, non-localhost origins).
 *
 * Placed in /public so Next.js serves it at the root path: /notification-sw.js
 */

/* eslint-disable no-restricted-globals */

// ─── Installation & Activation ──────────────────────────────────────────────

self.addEventListener('install', (event) => {
  // Activate immediately — don't wait for existing tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Claim all open clients so the SW is active immediately
  event.waitUntil(self.clients.claim());
});

// ─── Message Handler ────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── Push Event Handler (for future push notification support) ──────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'CMT Notification';
    const options = {
      body: data.body || data.message || '',
      icon: data.icon || '/favicon.ico',
      badge: data.badge || '/favicon.ico',
      tag: data.tag || `cmt-push-${Date.now()}`,
      data: data.data || {},
      requireInteraction: data.requireInteraction || false,
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch {
    // If JSON parsing fails, show a generic notification
    event.waitUntil(
      self.registration.showNotification('CMT Notification', {
        body: event.data.text() || 'You have a new notification',
        icon: '/favicon.ico',
      })
    );
  }
});

// ─── Notification Click Handler ─────────────────────────────────────────────

self.addEventListener('notificationclick', (event) => {
  const notification = event.notification;
  notification.close();

  const actionUrl = notification.data && notification.data.actionUrl;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If there's already an open window/tab, focus it and navigate
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          client.focus();
          if (actionUrl) {
            client.navigate(actionUrl);
          }
          return;
        }
      }

      // No open window — open a new one
      if (actionUrl) {
        return self.clients.openWindow(actionUrl);
      } else {
        return self.clients.openWindow('/');
      }
    })
  );
});

// ─── Notification Close Handler (optional telemetry hook) ───────────────────

self.addEventListener('notificationclose', (_event) => {
  // Intentionally empty — can be used for analytics/telemetry in the future
});