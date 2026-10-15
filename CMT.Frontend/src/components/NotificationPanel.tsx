import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Bell, 
  Check, 
  CheckCheck, 
  X, 
  Clock, 
  AlertTriangle,
  Info,
  Trash2,
  MoreVertical,
  Filter,
  BellRing
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DraggableDialog,
  DraggableDialogContent,
  DraggableDialogHeader,
  DraggableDialogTitle,
} from '@/components/ui/draggable-dialog';
import { NotificationConnectionStatus } from './NotificationConnectionStatus';
import { useNotifications, useMarkNotificationAsRead, useMarkAllNotificationsAsRead, useBulkNotificationAction, useDeleteNotification, useUnreadCount } from '@/hooks/useNotifications';
import { useTimezone } from '@/lib/timezone-context';
import { toast } from 'sonner';
import {
  requestNotificationPermission,
  getNotificationPermissionStatus,
  getEnhancedPermissionStatus,
  registerNotificationServiceWorker,
} from '@/lib/notification-permission';

interface NotificationPanelProps {
  open: boolean;
  onClose?: () => void;
}

export const NotificationPanel = ({ open, onClose = () => {} }: NotificationPanelProps) => {
  const [selectedNotifications, setSelectedNotifications] = useState<number[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<string>('default');
  const [enhancedStatus, setEnhancedStatus] = useState<string>('default');
  // Tick counter to force re-render every 30 seconds for real-time "ago" updates
  const [, setTick] = useState(0);

  const { data: notificationData, isLoading, error, refetch } = useNotifications(unreadOnly, 1, 20);
  const { data: unreadCountData } = useUnreadCount();
  const markAsReadMutation = useMarkNotificationAsRead();
  const markAllAsReadMutation = useMarkAllNotificationsAsRead();
  const bulkActionMutation = useBulkNotificationAction();
  const deleteNotificationMutation = useDeleteNotification();
  const { formatDateTime } = useTimezone();

  const notifications = notificationData?.notifications || [];
  const unreadCount = unreadCountData?.unreadCount || notificationData?.unreadCount || 0;

  // Track notification permission when panel opens.
  // NOTE: We do NOT auto-request permission here because opening the panel
  // may not always be a direct user gesture in all browsers' eyes.
  // Instead, we provide an explicit "Enable" button (see below) which IS
  // a direct user gesture and will reliably trigger the permission prompt.
  useEffect(() => {
    // Always read the current permission status
    setPermissionStatus(getNotificationPermissionStatus());
    setEnhancedStatus(getEnhancedPermissionStatus());

    if (!open) return;

    // If already granted, ensure SW is registered
    if (getNotificationPermissionStatus() === 'granted') {
      void registerNotificationServiceWorker();
    }

    // Poll to keep in sync while panel is open
    const interval = setInterval(() => {
      const current = getNotificationPermissionStatus();
      setPermissionStatus(current);
      setEnhancedStatus(getEnhancedPermissionStatus());
      if (current === 'granted') {
        void registerNotificationServiceWorker();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [open]);

  // Real-time tick: update "ago" labels every 30 seconds while panel is open
  useEffect(() => {
    if (!open) return;
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, [open]);

  // Filter notifications based on type and priority
  const filteredNotifications = notifications.filter(notification => {
    const typeMatch = filterType === 'all' || notification.notificationType === filterType;
    const priorityMatch = filterPriority === 'all' || notification.priority.toLowerCase() === filterPriority.toLowerCase();
    return typeMatch && priorityMatch;
  });

  /**
   * Compute a human-readable "time ago" string with minute-level granularity.
   * Uses the raw UTC timestamp from the server and compares against the current
   * wall-clock time so the result is always accurate regardless of timezone.
   */
  const formatTimeAgo = useCallback((dateString: string) => {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '—';

    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();

    // Guard against future dates (clock skew)
    if (diffInMs < 0) return 'Just now';

    const diffInSeconds = Math.floor(diffInMs / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInDays > 0) {
      return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
    } else if (diffInHours > 0) {
      const remainingMinutes = diffInMinutes % 60;
      if (remainingMinutes > 0) {
        return `${diffInHours}h ${remainingMinutes}m ago`;
      }
      return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    } else if (diffInMinutes > 0) {
      return `${diffInMinutes} min${diffInMinutes > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  }, []);

  const getPriorityIcon = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'urgent':
      case 'high':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'medium':
        return <Info className="h-4 w-4 text-yellow-500" />;
      case 'low':
        return <Clock className="h-4 w-4 text-green-500" />;
      default:
        return <Bell className="h-4 w-4 text-blue-500" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'urgent':
      case 'high':
        return 'border-l-red-500 bg-red-50';
      case 'medium':
        return 'border-l-yellow-500 bg-yellow-50';
      case 'low':
        return 'border-l-green-500 bg-green-50';
      default:
        return 'border-l-blue-500 bg-blue-50';
    }
  };

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await markAsReadMutation.mutateAsync(notificationId);
      toast.success('Notification marked as read');
    } catch (error) {
      toast.error('Failed to mark notification as read');
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsReadMutation.mutateAsync();
      toast.success('All notifications marked as read');
    } catch (error) {
      toast.error('Failed to mark all notifications as read');
    }
  };

  const handleBulkAction = async (action: 'mark_read' | 'mark_unread' | 'delete') => {
    if (selectedNotifications.length === 0) {
      toast.warning('Please select notifications first');
      return;
    }

    try {
      await bulkActionMutation.mutateAsync({
        notificationIds: selectedNotifications,
        action
      });
      
      setSelectedNotifications([]);
      
      const actionText = action === 'mark_read' ? 'marked as read' : 
                        action === 'mark_unread' ? 'marked as unread' : 'deleted';
      toast.success(`${selectedNotifications.length} notifications ${actionText}`);
    } catch (error) {
      toast.error(`Failed to ${action.replace('_', ' ')} notifications`);
    }
  };

  const handleDeleteNotification = async (notificationId: number) => {
    try {
      await deleteNotificationMutation.mutateAsync(notificationId);
      toast.success('Notification deleted');
    } catch (error) {
      toast.error('Failed to delete notification');
    }
  };

  const handleSelectAll = () => {
    if (selectedNotifications.length === filteredNotifications.length) {
      setSelectedNotifications([]);
    } else {
      setSelectedNotifications(filteredNotifications.map(n => n.notificationId));
    }
  };

  const handleSelectNotification = (notificationId: number) => {
    setSelectedNotifications(prev => 
      prev.includes(notificationId)
        ? prev.filter(id => id !== notificationId)
        : [...prev, notificationId]
    );
  };

  /**
   * Handle the "Enable" button click for notification permission.
   * This is a DIRECT user gesture (button click) which is required by
   * browsers in production to show the permission prompt.
   */
  const handleEnableNotifications = useCallback(async () => {
    const granted = await requestNotificationPermission();
    setPermissionStatus(granted ? 'granted' : getNotificationPermissionStatus());
    setEnhancedStatus(getEnhancedPermissionStatus());
    if (granted) {
      toast.success('Desktop notifications enabled!');
    }
  }, []);

  if (error) {
    return (
      <DraggableDialog open={open} onOpenChange={onClose}>
        <DraggableDialogContent className="modal-size-lg">
          <DraggableDialogHeader className="modal-header-modern">
            <div className="modal-title-group">
              <div className="modal-header-icon bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <DraggableDialogTitle className="modal-title-modern">Notifications Error</DraggableDialogTitle>
              </div>
            </div>
          </DraggableDialogHeader>

          <div className="modal-body-modern text-center">
            <div className="text-red-500">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
              <p>Failed to load notifications</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
                Try Again
              </Button>
            </div>
          </div>
        </DraggableDialogContent>
      </DraggableDialog>
    );
  }

  return (
    <DraggableDialog open={open} onOpenChange={onClose}>
      <DraggableDialogContent className="modal-size-lg">
        <DraggableDialogHeader className="modal-header-modern">
          <div className="modal-title-group">
            <div className="modal-header-icon bg-blue-100">
              <Bell className="h-5 w-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <DraggableDialogTitle className="modal-title-modern">All Notifications</DraggableDialogTitle>
                {unreadCount > 0 && (
                  <Badge variant="destructive" className="ml-2">
                    {unreadCount}
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4" />
              </Button>
              {unreadCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleMarkAllAsRead}
                  disabled={markAllAsReadMutation.isPending}
                  className="text-xs"
                >
                  <CheckCheck className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </DraggableDialogHeader>

        <div className="modal-body-modern space-y-4">
          {/* Filters */}
          {showFilters && (
            <div className="p-3 bg-gray-50 rounded-lg space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium">Type</label>
                  <Select value={filterType} onValueChange={setFilterType}>
                    <SelectTrigger className="h-8 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="TaskAssignment">Assignment</SelectItem>
                      <SelectItem value="TaskStatusChange">Status</SelectItem>
                      <SelectItem value="AmendmentRequest">Amendment</SelectItem>
                      <SelectItem value="InterventionRequest">Intervention</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs font-medium">Priority</label>
                  <Select value={filterPriority} onValueChange={setFilterPriority}>
                    <SelectTrigger className="h-8 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={unreadOnly} 
                  onCheckedChange={(checked) => setUnreadOnly(!!checked)}
                  id="unread-only"
                />
                <label htmlFor="unread-only" className="text-xs">Unread only</label>
              </div>
            </div>
          )}

          {/* Bulk Actions */}
          {filteredNotifications.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={selectedNotifications.length === filteredNotifications.length && filteredNotifications.length > 0}
                  onCheckedChange={handleSelectAll}
                />
                <span className="text-xs text-muted-foreground">
                  {selectedNotifications.length > 0 
                    ? `${selectedNotifications.length} selected`
                    : 'Select all'
                  }
                </span>
              </div>
              
              {selectedNotifications.length > 0 && (
                <div className="flex items-center space-x-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleBulkAction('mark_read')}
                          disabled={bulkActionMutation.isPending}
                          className="h-6 w-6 p-0"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Mark selected as read</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleBulkAction('delete')}
                          disabled={bulkActionMutation.isPending}
                          className="h-6 w-6 p-0"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Delete selected</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </div>
          )}
          
          {/* Connection Status */}
          <div className="mt-2">
            <NotificationConnectionStatus />
          </div>

          {/* Notification Permission Banner — Insecure Origin (HTTP) */}
          {enhancedStatus === 'insecure_blocked' && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
              <BellRing className="h-4 w-4 flex-shrink-0" />
              <div className="flex-1 text-xs">
                <strong>In-app notifications active.</strong> Desktop notifications are not available because this site is served over HTTP. 
                You will still receive all notifications as in-app alerts within this page. 
                To enable desktop notifications, the site must be served over HTTPS.
              </div>
            </div>
          )}

          {/* Notification Permission Banner — Explicitly Denied by User */}
          {enhancedStatus === 'denied' && (
            <div className="flex items-center gap-2 p-3 bg-orange-50 border border-orange-200 rounded-lg text-orange-800">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <div className="flex-1 text-xs">
                <strong>Desktop notifications blocked.</strong> You have disabled desktop notifications in your browser settings. 
                You will still receive in-app notifications here. To also receive desktop alerts, click the lock/site-settings icon 
                in your browser address bar, allow notifications for this site, then refresh the page.
              </div>
            </div>
          )}

          {/* Notification Permission Banner — Default (not yet decided, secure origin) */}
          {enhancedStatus === 'default' && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-blue-800">
              <Bell className="h-4 w-4 flex-shrink-0" />
              <div className="flex-1 text-xs">
                <strong>Enable desktop notifications</strong> to receive alerts when tasks are assigned, completed, or require your attention.
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs border-blue-300 text-blue-700 hover:bg-blue-100 flex-shrink-0"
                onClick={handleEnableNotifications}
              >
                Enable
              </Button>
            </div>
          )}

          {/* Notifications List */}
          <ScrollArea className="h-80">
            {isLoading ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No notifications</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.notificationId}
                    className={`p-3 border-b last:border-b-0 hover:bg-gray-50 ${
                      !notification.isRead 
                        ? `${getPriorityColor(notification.priority)} border-l-4` 
                        : ''
                    }`}
                  >
                    <div className="flex items-start space-x-2">
                      <Checkbox 
                        checked={selectedNotifications.includes(notification.notificationId)}
                        onCheckedChange={() => handleSelectNotification(notification.notificationId)}
                        className="mt-1"
                      />
                      
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!notification.isRead ? 'font-medium' : 'text-gray-600'}`}>
                          {notification.message}
                        </p>
                        <div className="flex items-center space-x-2 mt-1">
                          {getPriorityIcon(notification.priority)}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-xs text-gray-500 cursor-default">
                                  {formatDateTime(notification.createdAt)}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="bottom">
                                <span className="text-xs">{formatDateTime(notification.createdAt)}</span>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <Badge variant="outline" className="text-xs">
                            {notification.notificationType.replace(/([A-Z])/g, ' $1').trim()}
                          </Badge>
                          <Badge 
                            variant={notification.priority === 'urgent' || notification.priority === 'high' ? 'destructive' : 'secondary'} 
                            className="text-xs"
                          >
                            {notification.priority}
                          </Badge>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-1">
                        {!notification.isRead && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkAsRead(notification.notificationId)}
                            disabled={markAsReadMutation.isPending}
                            className="h-6 w-6 p-0"
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        )}
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                              <MoreVertical className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {!notification.isRead && (
                              <DropdownMenuItem onClick={() => handleMarkAsRead(notification.notificationId)}>
                                <Check className="h-4 w-4 mr-2" />
                                Mark as read
                              </DropdownMenuItem>
                            )}
                            {notification.actionUrl && (
                              <DropdownMenuItem onClick={() => window.location.href = notification.actionUrl!}>
                                <Bell className="h-4 w-4 mr-2" />
                                View details
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleDeleteNotification(notification.notificationId)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </DraggableDialogContent>
    </DraggableDialog>
  );
};

export default NotificationPanel;