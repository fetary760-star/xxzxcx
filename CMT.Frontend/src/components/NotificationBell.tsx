import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, BellOff } from 'lucide-react';
import { useUnreadCount } from '@/hooks/useNotifications';
import { NotificationPanel } from './NotificationPanel';
import {
  requestNotificationPermission,
  getNotificationPermissionStatus,
} from '@/lib/notification-permission';

export const NotificationBell = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string>('default');
  const { data: unreadCountData, isLoading, error } = useUnreadCount();
  
  const unreadCount = unreadCountData?.unreadCount || 0;
  // mark disconnected if there's an error or still loading
  const isConnected = !isLoading && !error;

  // Track notification permission status
  useEffect(() => {
    setPermissionStatus(getNotificationPermissionStatus());

    // Poll to detect changes made in browser settings
    const interval = setInterval(() => {
      setPermissionStatus(getNotificationPermissionStatus());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  /**
   * When the user clicks the bell, request notification permission
   * (if not yet granted) and then open the panel.
   * This ensures the permission prompt is triggered by a user gesture,
   * which is required by most browsers in production (HTTPS) environments.
   */
  const handleBellClick = useCallback(async () => {
    // Request permission on user gesture — browsers require this
    const currentPermission = getNotificationPermissionStatus();
    if (currentPermission === 'default') {
      const granted = await requestNotificationPermission();
      setPermissionStatus(granted ? 'granted' : getNotificationPermissionStatus());
    }
    setIsOpen(true);
  }, []);

  return (
    <>
      <Button 
        variant="ghost" 
        size="sm" 
        className="relative p-2"
        onClick={handleBellClick}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''}`}
      >
        {permissionStatus === 'denied' ? (
          <BellOff className="h-5 w-5 text-orange-500" />
        ) : (
          <Bell className={`h-5 w-5 ${isConnected ? 'text-gray-700' : 'text-gray-400'}`} />
        )}
        {unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Badge>
        )}
        {!isConnected && permissionStatus !== 'denied' && (
          <div className="absolute -bottom-1 -right-1 h-2 w-2 bg-red-500 rounded-full" />
        )}
        {permissionStatus === 'denied' && (
          <div className="absolute -bottom-1 -right-1 h-2 w-2 bg-orange-500 rounded-full" title="Notifications blocked in browser" />
        )}
      </Button>
      
      <NotificationPanel open={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};

export default NotificationBell;