import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  Bell, 
  Check, 
  CheckCheck, 
  Trash2, 
  Clock, 
  AlertTriangle,
  Info,
  Settings,
  Filter,
  MoreVertical,
  Eye,
  Calendar
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useNotifications, useMarkNotificationAsRead, useMarkAllNotificationsAsRead, useBulkNotificationAction, useDeleteNotification } from '@/hooks/useNotifications'
import { useAuth } from '@/lib/auth-context'
import { useTimezone } from '@/lib/timezone-context'
import { toast } from 'sonner'
import {
  DraggableDialog,
  DraggableDialogContent,
  DraggableDialogHeader,
  DraggableDialogTitle,
  DraggableDialogFooter
} from '@/components/ui/draggable-dialog'

interface RecentNotificationsProps {
  limit?: number;
  showPagination?: boolean;
  showBulkActions?: boolean;
}

export default function RecentNotifications({ 
  limit = 10, 
  showPagination = false,
  showBulkActions = true 
}: RecentNotificationsProps) {
  const { user } = useAuth()
  const [selectedNotifications, setSelectedNotifications] = useState<number[]>([])
  const [filterType, setFilterType] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [unreadOnly, setUnreadOnly] = useState(false)
  const [showAllDialog, setShowAllDialog] = useState(false)
  const [selectedNotification, setSelectedNotification] = useState<any>(null)

  const { data: notificationData, isLoading, error, refetch } = useNotifications(
    unreadOnly, 
    currentPage, 
    showPagination ? 50 : limit
  )
  
  const markAsReadMutation = useMarkNotificationAsRead()
  const markAllAsReadMutation = useMarkAllNotificationsAsRead()
  const bulkActionMutation = useBulkNotificationAction()
  const deleteNotificationMutation = useDeleteNotification()
  const { formatDateTime } = useTimezone()

  const notifications = notificationData?.notifications || []
  const totalCount = notificationData?.totalCount || 0
  const unreadCount = notificationData?.unreadCount || 0

  // Filter notifications based on type and priority
  const filteredNotifications = notifications.filter(notification => {
    const typeMatch = filterType === 'all' || notification.notificationType === filterType
    const priorityMatch = filterPriority === 'all' || notification.priority.toLowerCase() === filterPriority.toLowerCase()
    return typeMatch && priorityMatch
  })

  /**
   * Format full date and time using the user's selected timezone.
   * Delegates to the TimezoneContext's formatDateTime which respects
   * the timezone preference from Settings and updates reactively
   * when the user changes their timezone.
   */
  const formatFullDateTime = (dateString: string) => {
    return formatDateTime(dateString)
  }

  const getPriorityIcon = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'urgent':
      case 'high':
        return <AlertTriangle className="h-4 w-4 text-red-500" />
      case 'medium':
        return <Info className="h-4 w-4 text-yellow-500" />
      case 'low':
        return <Clock className="h-4 w-4 text-green-500" />
      default:
        return <Bell className="h-4 w-4 text-blue-500" />
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'urgent':
      case 'high':
        return 'border-l-red-500 bg-red-50'
      case 'medium':
        return 'border-l-yellow-500 bg-yellow-50'
      case 'low':
        return 'border-l-green-500 bg-green-50'
      default:
        return 'border-l-blue-500 bg-blue-50'
    }
  }

  const handleMarkAsRead = async (notificationId: number) => {
    try {
      await markAsReadMutation.mutateAsync(notificationId)
      toast.success('Notification marked as read')
    } catch (error) {
      toast.error('Failed to mark notification as read')
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsReadMutation.mutateAsync()
      toast.success('All notifications marked as read')
    } catch (error) {
      toast.error('Failed to mark all notifications as read')
    }
  }

  const handleBulkAction = async (action: 'mark_read' | 'mark_unread' | 'delete') => {
    if (selectedNotifications.length === 0) {
      toast.warning('Please select notifications first')
      return
    }

    try {
      await bulkActionMutation.mutateAsync({
        notificationIds: selectedNotifications,
        action
      })
      
      setSelectedNotifications([])
      
      const actionText = action === 'mark_read' ? 'marked as read' : 
                        action === 'mark_unread' ? 'marked as unread' : 'deleted'
      toast.success(`${selectedNotifications.length} notifications ${actionText}`)
    } catch (error) {
      toast.error(`Failed to ${action.replace('_', ' ')} notifications`)
    }
  }

  const handleDeleteNotification = async (notificationId: number) => {
    try {
      await deleteNotificationMutation.mutateAsync(notificationId)
      toast.success('Notification deleted')
    } catch (error) {
      toast.error('Failed to delete notification')
    }
  }

  const handleSelectAll = () => {
    if (selectedNotifications.length === filteredNotifications.length) {
      setSelectedNotifications([])
    } else {
      setSelectedNotifications(filteredNotifications.map(n => n.notificationId))
    }
  }

  const handleSelectNotification = (notificationId: number) => {
    setSelectedNotifications(prev => 
      prev.includes(notificationId)
        ? prev.filter(id => id !== notificationId)
        : [...prev, notificationId]
    )
  }

  const handleViewNotification = (notification: any) => {
    setSelectedNotification(notification)
    if (!notification.isRead) {
      handleMarkAsRead(notification.notificationId)
    }
  }

  const handleViewAllNotifications = () => {
    setShowAllDialog(true)
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-center text-red-500">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2" />
            <p>Failed to load notifications</p>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <Bell className="h-5 w-5" />
              <span>Recent Notifications</span>
            </CardTitle>
            
            <div className="flex items-center space-x-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm">
                    <Filter className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <div className="p-2">
                    <label className="text-xs font-medium">Type</label>
                    <Select value={filterType} onValueChange={setFilterType}>
                      <SelectTrigger className="h-8 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="TaskAssignment">Task Assignment</SelectItem>
                        <SelectItem value="TaskStatusChange">Status Change</SelectItem>
                        <SelectItem value="AmendmentRequest">Amendment</SelectItem>
                        <SelectItem value="InterventionRequest">Intervention</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="p-2">
                    <label className="text-xs font-medium">Priority</label>
                    <Select value={filterPriority} onValueChange={setFilterPriority}>
                      <SelectTrigger className="h-8 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Priorities</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="low">Low</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setUnreadOnly(!unreadOnly)}>
                    <Checkbox checked={unreadOnly} className="mr-2" />
                    Unread Only
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {totalCount > limit && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleViewAllNotifications}
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View All
                </Button>
              )}

              {unreadCount > 0 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleMarkAllAsRead}
                  disabled={markAllAsReadMutation.isPending}
                >
                  <CheckCheck className="h-4 w-4 mr-1" />
                  Read All
                </Button>
              )}
            </div>
          </div>

          {showBulkActions && filteredNotifications.length > 0 && (
            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  checked={selectedNotifications.length === filteredNotifications.length}
                  onCheckedChange={() => handleSelectAll()}
                />
                <span className="text-sm text-muted-foreground">
                  {selectedNotifications.length > 0 
                    ? `${selectedNotifications.length} selected`
                    : 'Select all'
                  }
                </span>
              </div>
              
              {selectedNotifications.length > 0 && (
                <div className="flex items-center space-x-1">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleBulkAction('mark_read')}
                    disabled={bulkActionMutation.isPending}
                  >
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleBulkAction('delete')}
                    disabled={bulkActionMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardHeader>

        <CardContent className="p-0">
          <ScrollArea className="h-96">
            {isLoading ? (
              <div className="p-4 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                <p className="mt-2 text-sm text-muted-foreground">Loading notifications...</p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                <Bell className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                <p>No notifications found</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredNotifications.map((notification) => (
                  <div
                    key={notification.notificationId}
                    className={`p-3 border-b last:border-b-0 hover:bg-gray-50 transition-colors cursor-pointer ${
                      !notification.isRead 
                        ? `${getPriorityColor(notification.priority)} border-l-4` 
                        : ''
                    }`}
                    onClick={() => handleViewNotification(notification)}
                  >
                    <div className="flex items-start space-x-3">
                      {showBulkActions && (
                        <Checkbox 
                          checked={selectedNotifications.includes(notification.notificationId)}
                          onCheckedChange={() => handleSelectNotification(notification.notificationId)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1"
                        />
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className={`text-sm ${!notification.isRead ? 'font-medium' : 'text-gray-600'}`}>
                              {notification.message}
                            </p>
                            <div className="flex flex-col space-y-1 mt-2">
                              <div className="flex items-center space-x-2">
                                {getPriorityIcon(notification.priority)}
                                <Calendar className="h-3 w-3 text-gray-400" />
                                <span className="text-xs text-gray-600 font-medium">
                                  {formatFullDateTime(notification.createdAt)}
                                </span>
                              </div>
                              <div className="flex items-center space-x-2">
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
                          </div>
                          
                          <div className="flex items-center space-x-1 ml-2">
                            {!notification.isRead && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleMarkAsRead(notification.notificationId)
                                }}
                                disabled={markAsReadMutation.isPending}
                                className="h-6 w-6 p-0"
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                            )}
                            
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
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
                                <DropdownMenuItem onClick={() => handleViewNotification(notification)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  View details
                                </DropdownMenuItem>
                                {notification.actionUrl && (
                                  <DropdownMenuItem onClick={() => window.location.href = notification.actionUrl!}>
                                    <Bell className="h-4 w-4 mr-2" />
                                    Go to task
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
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Notification Detail Dialog */}
      <Dialog open={!!selectedNotification} onOpenChange={(open) => !open && setSelectedNotification(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              {selectedNotification && getPriorityIcon(selectedNotification.priority)}
              <span>Notification Details</span>
            </DialogTitle>
          </DialogHeader>
          {selectedNotification && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Message</label>
                <p className="text-sm text-gray-700 mt-1">{selectedNotification.message}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Type</label>
                  <p className="text-sm text-gray-700 mt-1">
                    {selectedNotification.notificationType.replace(/([A-Z])/g, ' $1').trim()}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Priority</label>
                  <Badge 
                    variant={selectedNotification.priority === 'urgent' || selectedNotification.priority === 'high' ? 'destructive' : 'secondary'}
                    className="mt-1"
                  >
                    {selectedNotification.priority}
                  </Badge>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Date & Time</label>
                <div className="flex items-center space-x-2 mt-1">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <p className="text-sm text-gray-700 font-medium">
                    {formatFullDateTime(selectedNotification.createdAt)}
                  </p>
                </div>
              </div>
              {selectedNotification.taskId && (
                <div>
                  <label className="text-sm font-medium">Related Task</label>
                  <p className="text-sm text-gray-700 mt-1">Task TC-{selectedNotification.taskId}</p>
                </div>
              )}
              {selectedNotification.actionUrl && (
                <Button 
                  onClick={() => window.location.href = selectedNotification.actionUrl!}
                  className="w-full"
                >
                  Go to Task
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View All Notifications as a Draggable window so "All Notifications" behaves consistently */}
      <DraggableDialog open={showAllDialog} onOpenChange={setShowAllDialog}>
        <DraggableDialogContent className="modal-size-4xl" showMaximize>
          <DraggableDialogHeader className="modal-header-modern">
            <div className="modal-title-group">
              <div className="modal-header-icon bg-blue-100">
                <Bell className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <DraggableDialogTitle className="modal-title-modern">All Notifications</DraggableDialogTitle>
                <p className="modal-subtitle-modern">View and manage all your notifications</p>
              </div>
            </div>
          </DraggableDialogHeader>

          <div className="modal-body-modern p-0">
            {/* Reuse the same RecentNotifications component to render the full list (keeps same logic/controls) */}
            <RecentNotifications 
              limit={50} 
              showPagination={true} 
              showBulkActions={true}
            />
          </div>

          <DraggableDialogFooter>
            <div className="flex-1 text-sm text-gray-500">Manage your notifications</div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowAllDialog(false)}>Close</Button>
            </div>
          </DraggableDialogFooter>
        </DraggableDialogContent>
      </DraggableDialog>
    </>
  )
}