import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth-context';
import { getCsrfToken } from '@/lib/csrf';
import { secureAuthStore } from '@/lib/secure-auth-store';

export interface NotificationDto {
  notificationId: number;
  message: string;
  createdAt: string;
  isRead: boolean;
  recipientId: number;
  notificationType: string;
  priority: string;
  taskId?: string;
  relatedEntity?: string;
  actionUrl?: string;
  metadata?: Record<string, any>;
}

export interface NotificationListDto {
  notifications: NotificationDto[];
  totalCount: number;
  unreadCount: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface BulkNotificationActionDto {
  notificationIds: number[];
  action: 'mark_read' | 'mark_unread' | 'delete';
}

/**
 * Read a cookie value by name. Returns null if not found or running server-side.
 * Used as a fallback so page-reload requests still succeed while the HttpOnly
 * cookie re-hydrates the in-memory token.
 */
function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const match = document.cookie
      .split('; ')
      .find(row => row.startsWith(`${name}=`));
    if (!match) return null;
    const value = match.substring(name.length + 1);
    return value ? decodeURIComponent(value) : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the current access token from the SAME sources used by apiClient.
 *
 * Order of precedence:
 *   1. In-memory token from secureAuthStore (set during login / refresh).
 *   2. Non-HttpOnly legacy "authToken" cookie (if the backend sets one).
 *   3. localStorage (legacy fallback only).
 *
 * Returns null if no valid token is found. The caller MUST then omit the
 * Authorization header entirely so the HttpOnly cookie (sent automatically
 * via credentials: 'include') can authenticate the request. NEVER emit
 * "Authorization: Bearer null" — that is exactly the bug we are fixing.
 */
function resolveAuthToken(): string | null {
  try {
    const mem = secureAuthStore.getToken();
    if (mem && mem !== 'null' && mem !== 'undefined') return mem;
  } catch {
    // ignore — fall through to cookie/localStorage
  }

  const cookieTok = readCookie('authToken') || readCookie('auth_token');
  if (cookieTok && cookieTok !== 'null' && cookieTok !== 'undefined') {
    try { secureAuthStore.setToken(cookieTok); } catch { /* ignore */ }
    return cookieTok;
  }

  if (typeof localStorage !== 'undefined') {
    try {
      const ls = localStorage.getItem('authToken') || localStorage.getItem('token');
      if (ls && ls !== 'null' && ls !== 'undefined') return ls;
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Build a headers record that ONLY includes Authorization when we actually
 * have a non-empty token. If we don't, the HttpOnly cookie will authenticate
 * the request (because credentials: 'include' is set on every call).
 */
function buildBaseHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = resolveAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// Helper function to get auth headers with CSRF token
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers = buildBaseHeaders();

  // Add CSRF token for state-changing requests
  try {
    const csrfToken = await getCsrfToken();
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
      headers['X-Requested-With'] = 'XMLHttpRequest';
    }
  } catch {
    // Silently handle CSRF token fetch errors
  }

  return headers;
}

// API functions that connect to backend
const notificationsAPI = {
  getNotifications: async (unreadOnly = false, pageNumber = 1, pageSize = 50): Promise<NotificationListDto> => {
    const params = new URLSearchParams({
      unreadOnly: unreadOnly.toString(),
      pageNumber: pageNumber.toString(),
      pageSize: pageSize.toString(),
    });

    const response = await fetch(`/api/notifications?${params}`, {
      method: 'GET',
      headers: buildBaseHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch notifications: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  },

  markAsRead: async (notificationId: number): Promise<void> => {
    const headers = await getAuthHeaders();

    const response = await fetch(`/api/notifications/${notificationId}/read`, {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to mark notification as read: ${response.status} ${response.statusText}`);
    }
  },

  markAllAsRead: async (): Promise<void> => {
    const headers = await getAuthHeaders();

    const response = await fetch('/api/notifications/mark-all-read', {
      method: 'POST',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to mark all notifications as read: ${response.status} ${response.statusText}`);
    }
  },

  bulkAction: async (bulkAction: BulkNotificationActionDto): Promise<void> => {
    const headers = await getAuthHeaders();

    const response = await fetch('/api/notifications/bulk-action', {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify(bulkAction),
    });

    if (!response.ok) {
      throw new Error(`Failed to perform bulk action: ${response.status} ${response.statusText}`);
    }
  },

  deleteNotification: async (notificationId: number): Promise<void> => {
    const headers = await getAuthHeaders();

    const response = await fetch(`/api/notifications/${notificationId}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Failed to delete notification: ${response.status} ${response.statusText}`);
    }
  },

  getUnreadCount: async (): Promise<{ unreadCount: number }> => {
    const response = await fetch('/api/notifications/unread-count', {
      method: 'GET',
      headers: buildBaseHeaders(),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch unread count: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }
};

export const useNotifications = (unreadOnly = false, pageNumber = 1, pageSize = 50) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications', unreadOnly, pageNumber, pageSize],
    queryFn: () => notificationsAPI.getNotifications(unreadOnly, pageNumber, pageSize),
    enabled: !!user,
    refetchInterval: 30000, // Refetch every 30 seconds
    retry: 1,
    staleTime: 1000 * 30, // 30 seconds
  });
};

export const useUnreadCount = () => {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationsAPI.getUnreadCount(),
    enabled: !!user,
    refetchInterval: 15000, // Refetch every 15 seconds
    retry: 1,
    staleTime: 1000 * 15, // 15 seconds
  });
};

export const useMarkNotificationAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: number) => notificationsAPI.markAsRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};

export const useMarkAllNotificationsAsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsAPI.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};

export const useBulkNotificationAction = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bulkAction: BulkNotificationActionDto) => notificationsAPI.bulkAction(bulkAction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};

export const useDeleteNotification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: number) => notificationsAPI.deleteNotification(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
};