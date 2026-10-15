import { useEffect, useRef } from 'react'
import { useNotifications, NotificationDto } from '@/hooks/useNotifications'
import { useNotificationSettings } from '@/hooks/useNotificationSettings'
import {
  requestNotificationPermission,
  areNotificationsAvailable,
} from '@/lib/notification-permission'

/**
 * NotificationToaster — headless component (renders nothing on screen).
 *
 * It monitors the notifications API for new items and fires **OS-level
 * desktop notifications** via the browser Notification API.  These
 * notifications are automatically stored in the operating system's
 * notification center (Windows Action Center / macOS Notification Center)
 * so the user can review them later.
 *
 * No in-app toast / popup box is rendered.
 */
export default function NotificationToaster() {
  const { data, error, isLoading } = useNotifications()
  const { shouldShowToast } = useNotificationSettings()
  const seenIdsRef = useRef<Set<number>>(new Set())
  const initialLoadDoneRef = useRef(false)
  const permissionRequestedRef = useRef(false)

  // Request notification permission once on mount — but only if not already denied.
  // If the user previously denied, skip the request entirely to avoid noisy console
  // messages. The NotificationPanel UI already shows a banner guiding the user to
  // re-enable notifications in browser settings.
  useEffect(() => {
    if (permissionRequestedRef.current) return
    permissionRequestedRef.current = true

    // Only prompt when permission is still 'default' (undecided)
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      requestNotificationPermission().catch(() => {
        // ignore — user denied or browser blocked
      })
    }
  }, [])

  /**
   * Show an OS-level desktop notification.
   * These are stored in the OS notification center automatically.
   */
  function showDesktopNotification(notification: NotificationDto) {
    if (!areNotificationsAvailable()) return

    const title = getNotificationTitle(notification)
    const options: NotificationOptions = {
      body: notification.message,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      tag: `cmt-notification-${notification.notificationId}`, // prevents duplicates
      requireInteraction:
        notification.priority === 'urgent' || notification.priority === 'high', // stays until user interacts
      silent: false,
      timestamp: new Date(notification.createdAt).getTime(),
    }

    try {
      const desktopNotif = new Notification(title, options)

      // If there's an action URL, open it when the user clicks the notification
      if (notification.actionUrl) {
        desktopNotif.onclick = () => {
          window.focus()
          window.open(notification.actionUrl!, '_self')
          desktopNotif.close()
        }
      } else {
        desktopNotif.onclick = () => {
          window.focus()
          desktopNotif.close()
        }
      }
    } catch {
      // Some browsers (e.g. mobile) may throw on new Notification()
    }
  }

  /**
   * Generate a meaningful title based on notification type / priority.
   */
  function getNotificationTitle(notification: NotificationDto): string {
    const type = (notification.notificationType || '').toLowerCase()
    const priority = (notification.priority || '').toLowerCase()

    if (type.includes('task_assigned') || type.includes('assignment')) {
      return '📋 Task Assigned'
    }
    if (type.includes('task_completed') || type.includes('completed')) {
      return '✅ Task Completed'
    }
    if (type.includes('task_status') || type.includes('status')) {
      return '🔄 Task Status Updated'
    }
    if (type.includes('amendment')) {
      return '📝 Amendment Request'
    }
    if (type.includes('intervention')) {
      return '🚨 Intervention Required'
    }

    // Priority-based fallback
    if (priority === 'urgent') return '🚨 Urgent Notification'
    if (priority === 'high') return '⚠️ Important Notification'

    return '🔔 CMT Notification'
  }

  // Monitor for new notifications and fire OS desktop notifications
  useEffect(() => {
    if (isLoading || error) return

    // Extract the notifications array from the response DTO
    const notificationsList: NotificationDto[] =
      data?.notifications && Array.isArray(data.notifications)
        ? data.notifications
        : Array.isArray(data)
          ? (data as unknown as NotificationDto[])
          : []

    if (notificationsList.length === 0) return

    // On first load, record all existing IDs without firing notifications
    if (!initialLoadDoneRef.current) {
      notificationsList.forEach((n) => {
        seenIdsRef.current.add(n.notificationId)
      })
      initialLoadDoneRef.current = true
      return
    }

    // Find new notifications we haven't seen yet
    const newNotifications = notificationsList.filter(
      (n) => !seenIdsRef.current.has(n.notificationId)
    )

    if (newNotifications.length === 0) return

    // Process new notifications (newest first)
    const sorted = [...newNotifications].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )

    sorted.forEach((n) => {
      // Mark as seen regardless of settings
      seenIdsRef.current.add(n.notificationId)

      // Check user settings before showing notification
      if (!shouldShowToast(n.notificationType)) {
        return
      }

      // Fire OS desktop notification (stored in OS notification center)
      showDesktopNotification(n)
    })
  }, [data, error, isLoading, shouldShowToast])

  // This component renders nothing on screen — all notifications go to the OS
  return null
}