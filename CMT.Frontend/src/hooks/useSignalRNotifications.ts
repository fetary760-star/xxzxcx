import { useEffect, useCallback, useState, useRef } from 'react';
import { signalRService, NotificationData, TaskEventData } from '@/lib/signalr-service';
import { useQueryClient } from '@tanstack/react-query';
import { useNotificationSettings } from '@/hooks/useNotificationSettings';
import {
  requestNotificationPermission,
  getNotificationPermissionStatus,
  getEnhancedPermissionStatus,
  registerNotificationServiceWorker,
  showNotificationSafe,
  registerInAppFallback,
  isSecureContext,
  shouldUseInAppFallback,
  playNotificationSound,
  initAutoPermissionRequest,
} from '@/lib/notification-permission';
import { toast } from 'sonner';
import { secureAuthStore } from '@/lib/secure-auth-store'

export interface Notification {
  id: number;
  message: string;
  type: string;
  priority: string;
  isRead: boolean;
  createdAt: Date;
  taskId?: string;
  actionUrl?: string;
}

/**
 * Show an OS-level desktop notification via the Service Worker (production)
 * or fallback to the browser Notification API (localhost),
 * or fallback to in-app toast (when OS notifications are blocked).
 */
function showDesktopNotification(
  title: string,
  body: string,
  options?: { actionUrl?: string; tag?: string; requireInteraction?: boolean; type?: string; priority?: string }
) {
  void showNotificationSafe(title, body, {
    actionUrl: options?.actionUrl,
    tag: options?.tag || `cmt-signalr-${Date.now()}`,
    requireInteraction: options?.requireInteraction ?? false,
    type: options?.type,
    priority: options?.priority,
  });
}

function getDesktopTitle(type: string, priority: string): string {
  const lowerType = type.toLowerCase();
  const lowerPriority = priority.toLowerCase();

  if (lowerType.includes('task_assigned') || lowerType.includes('assignment')) return '📋 Task Assigned';
  if (lowerType.includes('task_completed') || lowerType.includes('completed')) return '✅ Task Completed';
  if (lowerType.includes('task_status') || lowerType.includes('status')) return '🔄 Task Status Updated';
  if (lowerType.includes('amendment')) return '📝 Amendment Request';
  if (lowerType.includes('intervention')) return '🚨 Intervention Required';

  if (lowerPriority === 'urgent') return '🚨 Urgent Notification';
  if (lowerPriority === 'high') return '⚠️ Important Notification';

  return '🔔 CMT Notification';
}

function getToastVariant(priority: string): 'default' | 'success' | 'warning' | 'error' | 'info' {
  const lowerPriority = priority.toLowerCase();
  if (lowerPriority === 'urgent') return 'error';
  if (lowerPriority === 'high') return 'warning';
  if (lowerPriority === 'low') return 'success';
  return 'info';
}

export const useSignalRNotifications = () => {
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<string>('default');
  const [enhancedPermission, setEnhancedPermission] = useState<string>('default');
  const queryClient = useQueryClient();
  const hasConnectedRef = useRef(false);
  const connectionAttemptRef = useRef(false);
  const hasShownErrorRef = useRef(false);
  const isUnmountingRef = useRef(false);
  const inAppFallbackRegisteredRef = useRef(false);
  const { shouldShowToast } = useNotificationSettings();

  // Use a ref for shouldShowToast to break the dependency chain
  const shouldShowToastRef = useRef(shouldShowToast);
  shouldShowToastRef.current = shouldShowToast;

  // Register in-app fallback notification handler (sonner toast).
  // This is the PRIMARY notification method on HTTP (non-HTTPS) origins.
  useEffect(() => {
    if (inAppFallbackRegisteredRef.current) return;
    inAppFallbackRegisteredRef.current = true;

    registerInAppFallback((title, body, options) => {
      const variant = getToastVariant(options?.priority || 'medium');
      const isUrgent = options?.priority?.toLowerCase() === 'urgent' || options?.priority?.toLowerCase() === 'high';

      const toastOptions: any = {
        description: body,
        duration: isUrgent ? 10000 : 6000,
        action: options?.actionUrl
          ? {
              label: 'View',
              onClick: () => {
                window.location.href = options.actionUrl!;
              },
            }
          : undefined,
      };

      if (variant === 'error') {
        toast.error(title, toastOptions);
      } else if (variant === 'warning') {
        toast.warning(title, toastOptions);
      } else if (variant === 'success') {
        toast.success(title, toastOptions);
      } else {
        toast.info(title, toastOptions);
      }
    });
  }, []);

  const updateConnectionStatus = useCallback(() => {
    if (isUnmountingRef.current) return;
    
    const status = signalRService.getConnectionState();
    const error = signalRService.getConnectionError();
    const attempts = signalRService.getReconnectAttempts();
    const maxAttempts = signalRService.getMaxReconnectAttempts();
    
    setConnectionStatus(status);
    setConnectionError(error);
    
    if (attempts >= maxAttempts && error && !hasShownErrorRef.current) {
      hasShownErrorRef.current = true;
      showDesktopNotification(
        '⚠️ Connection Lost',
        `Failed to connect to notification service: ${error}. Please refresh the page to retry.`,
        { tag: 'cmt-connection-error', requireInteraction: true, priority: 'high' }
      );
    }
  }, []);

  const handleNewNotification = useCallback((data: NotificationData) => {
    if (isUnmountingRef.current) return;
    
    const raw = data as any;
    const taskId =
      raw.taskId ??
      raw.task_id ??
      raw.task?.id ??
      raw.serialNumber ??
      raw.serial_number ??
      undefined;

    const actionUrl = raw.actionUrl ?? raw.action_url ?? raw.url ?? undefined;
    const priority = (raw.priority ?? raw.priorityLevel ?? raw.level ?? 'medium').toString();
    const type = (raw.type ?? raw.eventType ?? 'info').toString();
    const message = String(raw.message ?? raw.text ?? raw.body ?? 'Notification');
    const timestampValue = raw.timestamp ?? raw.time ?? Date.now();
    const createdAt = new Date(timestampValue);

    const newNotification: Notification = {
      id: Date.now(),
      message,
      type,
      priority,
      isRead: false,
      createdAt,
      taskId: taskId ? String(taskId) : undefined,
      actionUrl: actionUrl ? String(actionUrl) : undefined,
    };

    // Always add to the notifications array
    setNotifications(prev => [newNotification, ...prev.slice(0, 49)]);

    // Always invalidate queries so the notification list/count updates
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['notification-stats'] });

    // Use ref instead of direct dependency to avoid re-connection cascade
    if (!shouldShowToastRef.current(type)) {
      return;
    }

    // Show notification via the best available method:
    // OS desktop notification (SW or direct) → in-app toast fallback
    const title = getDesktopTitle(type, priority);
    const isUrgent = ['urgent', 'high'].includes(priority.toLowerCase());

    showDesktopNotification(title, message, {
      actionUrl: actionUrl ? String(actionUrl) : undefined,
      tag: `cmt-realtime-${newNotification.id}`,
      requireInteraction: isUrgent,
      type,
      priority,
    });

    // Play notification sound:
    // - On HTTP (insecure) origins: play for ALL notifications since OS
    //   desktop alerts are blocked — sound is the only external signal.
    // - On HTTPS: play only for urgent/high priority to avoid annoyance.
    if (!isSecureContext() || isUrgent) {
      playNotificationSound(priority);
    } else {
      // On HTTPS with granted permission, still play a subtle chime
      // so users hear feedback even when the browser tab is in foreground
      playNotificationSound('low');
    }
  }, [queryClient]);

  const handleTaskAssigned = useCallback((data: TaskEventData) => {
    const raw = data as any;
    const taskId = raw.taskId ?? raw.task_id ?? raw.id ?? raw.serialNumber ?? raw.serial_number ?? undefined;
    const message = `Task ${taskId ?? 'Unknown'} has been assigned to you`;
    handleNewNotification({
      message,
      type: 'task_assigned',
      priority: 'high',
      timestamp: new Date(),
      taskId,
      actionUrl: taskId ? `/tasks/${taskId}` : undefined
    } as any);
  }, [handleNewNotification]);

  const handleTaskCompleted = useCallback((data: TaskEventData) => {
    const raw = data as any;
    const taskId = raw.taskId ?? raw.task_id ?? raw.id ?? raw.serialNumber ?? raw.serial_number ?? undefined;
    const message = `Task ${taskId ?? 'Unknown'} has been completed`;
    handleNewNotification({
      message,
      type: 'task_completed',
      priority: 'low',
      timestamp: new Date(),
      taskId,
      actionUrl: taskId ? `/tasks/${taskId}` : undefined
    } as any);
  }, [handleNewNotification]);

  const handleTaskStatusChanged = useCallback((data: TaskEventData) => {
    const raw = data as any;
    const taskId = raw.taskId ?? raw.task_id ?? raw.id ?? raw.serialNumber ?? raw.serial_number ?? undefined;
    const status = raw.status ?? raw.newStatus ?? raw.state ?? 'updated';
    const message = `Task ${taskId ?? 'Unknown'} status changed to ${status}`;
    handleNewNotification({
      message,
      type: 'task_status_changed',
      priority: 'medium',
      timestamp: new Date(),
      taskId,
      actionUrl: taskId ? `/tasks/${taskId}` : undefined
    } as any);
  }, [handleNewNotification]);

  const handleAmendmentRequest = useCallback((data: any) => {
    const raw = data as any;
    const taskId = raw.taskId ?? raw.task_id ?? raw.id ?? undefined;
    const message = `Amendment request for Task ${taskId ?? 'Unknown'}`;
    handleNewNotification({
      message,
      type: 'amendment_request',
      priority: 'high',
      timestamp: new Date(),
      taskId,
      actionUrl: taskId ? `/tasks/${taskId}/amendments` : undefined
    } as any);
  }, [handleNewNotification]);

  const handleInterventionRequest = useCallback((data: any) => {
    const raw = data as any;
    const taskId = raw.taskId ?? raw.task_id ?? raw.id ?? undefined;
    const message = `Intervention request for Task ${taskId ?? 'Unknown'}`;
    handleNewNotification({
      message,
      type: 'intervention_request',
      priority: 'urgent',
      timestamp: new Date(),
      taskId,
      actionUrl: taskId ? `/tasks/${taskId}/intervention` : undefined
    } as any);
  }, [handleNewNotification]);

  const connectToHub = useCallback(async () => {
    if (isUnmountingRef.current) return;
    
    if (connectionAttemptRef.current || signalRService.isCurrentlyConnecting()) {
      return;
    }

    if (signalRService.isConnectionActive()) {
      updateConnectionStatus();
      return;
    }

    connectionAttemptRef.current = true;

    // Register handlers BEFORE connecting so they are in the persistent
    // callback store and will be attached during initializeConnection()
    if (!hasConnectedRef.current) {
      signalRService.onNotificationReceived(handleNewNotification);
      signalRService.onTaskAssigned(handleTaskAssigned);
      signalRService.onTaskCompleted(handleTaskCompleted);
      signalRService.onTaskStatusChanged(handleTaskStatusChanged);
      signalRService.on('AmendmentRequested', handleAmendmentRequest);
      signalRService.on('InterventionRequested', handleInterventionRequest);
      hasConnectedRef.current = true;
    }

    try {
      const connected = await signalRService.connect();
      
      if (isUnmountingRef.current) return;
      
      if (connected) {
        updateConnectionStatus();
        hasShownErrorRef.current = false;
      } else {
        const error = signalRService.getConnectionError();
        if (error && process.env.NODE_ENV === 'development') {
          try { console.debug('SignalR: connection failed', error); } catch {}
        }
      }
    } catch (err) {
      if (!isUnmountingRef.current && process.env.NODE_ENV === 'development') {
        const msg = (err && (err as any).message) ? (err as any).message : 'Failed to connect';
        try { console.error('SignalR: connection error', msg); } catch {}
      }
    } finally {
      if (!isUnmountingRef.current) {
        connectionAttemptRef.current = false;
        updateConnectionStatus();
      }
    }
  }, [handleNewNotification, handleTaskAssigned, handleTaskCompleted, handleTaskStatusChanged, handleAmendmentRequest, handleInterventionRequest, updateConnectionStatus]);

  const disconnectFromHub = useCallback(async () => {
    try {
      signalRService.removeAllListeners();
      await signalRService.disconnect();
      hasConnectedRef.current = false;
      hasShownErrorRef.current = false;
      updateConnectionStatus();
    } catch {
      // suppressed
    }
  }, [updateConnectionStatus]);

  const markNotificationAsRead = useCallback((notificationId: number) => {
    setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, isRead: true } : n));
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [queryClient]);

  const markAllNotificationsAsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [queryClient]);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [queryClient]);

  const deleteNotification = useCallback((notificationId: number) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
  }, [queryClient]);

  // Register Service Worker on mount (if permission already granted).
  // Also initialize auto-permission request on first user gesture.
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    const currentPermission = getNotificationPermissionStatus();
    setNotificationPermission(currentPermission);
    setEnhancedPermission(getEnhancedPermissionStatus());

    if (currentPermission === 'granted' && isSecureContext()) {
      void registerNotificationServiceWorker();
    }

    // Auto-request notification permission on the first user gesture.
    // On HTTPS: shows the browser permission prompt automatically.
    // On HTTP: silently fails, but in-app notifications + sound still work.
    initAutoPermissionRequest();
  }, []);

  // Initial connection attempt — connect as soon as we have an auth token
  useEffect(() => {
    const token = secureAuthStore.getToken();

    if (token && connectionStatus === 'Disconnected' && !connectionAttemptRef.current) {
      const timer = setTimeout(() => { 
        if (!isUnmountingRef.current) {
          void connectToHub(); 
        }
      }, 1500); // Reduced from 2000ms for faster initial connection
      return () => clearTimeout(timer);
    }
  }, [connectionStatus, connectToHub]);

  // Status monitoring
  useEffect(() => {
    const statusInterval = setInterval(() => {
      if (!isUnmountingRef.current) {
        updateConnectionStatus();

        if (typeof window !== 'undefined' && 'Notification' in window) {
          setNotificationPermission(getNotificationPermissionStatus());
          setEnhancedPermission(getEnhancedPermissionStatus());
        }
      }
    }, 5000);
    
    const cleanupInterval = setInterval(() => { 
      if (!isUnmountingRef.current) {
        setNotifications(prev => prev.slice(0, 50)); 
      }
    }, 60000);
    
    return () => { 
      clearInterval(statusInterval); 
      clearInterval(cleanupInterval); 
    };
  }, [updateConnectionStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { 
      isUnmountingRef.current = true;
      signalRService.removeAllListeners(); 
    };
  }, []);

  return {
    notifications,
    connectionStatus,
    connectionError,
    isConnected: connectionStatus === 'Connected',
    isConnecting: connectionStatus === 'Connecting' || connectionStatus === 'Reconnecting',
    connectToHub,
    disconnectFromHub,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    clearNotifications,
    deleteNotification,
    unreadCount: notifications.filter(n => !n.isRead).length,
    reconnectAttempts: signalRService.getReconnectAttempts(),
    maxReconnectAttempts: signalRService.getMaxReconnectAttempts(),
    notificationPermission,
    enhancedPermission,
    requestPermission: requestNotificationPermission,
    getNotificationsByType: (type: string) => notifications.filter(n => n.type === type),
    getNotificationsByPriority: (priority: string) => notifications.filter(n => n.priority === priority),
    getUnreadNotifications: () => notifications.filter(n => !n.isRead),
    getRecentNotifications: (hours = 24) => {
      const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
      return notifications.filter(n => n.createdAt > cutoff);
    }
  };
};

export default useSignalRNotifications;