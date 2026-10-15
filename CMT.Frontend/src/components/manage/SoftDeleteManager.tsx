'use client';

import React, { useEffect, useState, useCallback } from 'react';
import apiClient, { SoftDeletedUser, SoftDeletedTask } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useTimezone } from '@/lib/timezone-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2,
  Trash2,
  RotateCcw,
  Users,
  ClipboardList,
  AlertTriangle,
  Search,
  UserX,
  FileX,
  RefreshCw,
  CheckSquare,
} from 'lucide-react';
import { Input } from '@/components/ui/input';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConfirmAction {
  type:
    | 'permanent-delete-user'
    | 'restore-user'
    | 'permanent-delete-task'
    | 'restore-task'
    | 'bulk-permanent-delete-users'
    | 'bulk-restore-users'
    | 'bulk-permanent-delete-tasks'
    | 'bulk-restore-tasks';
  id: number;
  ids?: number[];
  label: string;
}

// Group soft-deleted tasks by the user who created them
interface GroupedTasks {
  createdByName: string;
  createdBy: number;
  tasks: SoftDeletedTask[];
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SoftDeleteManager() {
  const { formatDate: tzFormatDate } = useTimezone();
  const [activeSubTab, setActiveSubTab] = useState('users');
  const [softDeletedUsers, setSoftDeletedUsers] = useState<SoftDeletedUser[]>([]);
  const [softDeletedTasks, setSoftDeletedTasks] = useState<SoftDeletedTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  // Selection state
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<number>>(new Set());

  // ─── Data fetching ──────────────────────────────────────────────────────

  const loadSoftDeletedUsers = useCallback(async () => {
    try {
      const users = await apiClient.getSoftDeletedUsers();
      setSoftDeletedUsers(Array.isArray(users) ? users : []);
    } catch (err: any) {
      console.error('Failed to load soft-deleted users:', err);
      setError(err.message || 'Failed to load soft-deleted users');
    }
  }, []);

  const loadSoftDeletedTasks = useCallback(async () => {
    try {
      const tasks = await apiClient.getSoftDeletedTasks();
      setSoftDeletedTasks(Array.isArray(tasks) ? tasks : []);
    } catch (err: any) {
      console.error('Failed to load soft-deleted tasks:', err);
      setError(err.message || 'Failed to load soft-deleted tasks');
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadSoftDeletedUsers(), loadSoftDeletedTasks()]);
    } finally {
      setLoading(false);
    }
  }, [loadSoftDeletedUsers, loadSoftDeletedTasks]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Auto-clear success message after 4 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Clear selections when data changes
  useEffect(() => {
    setSelectedUserIds((prev) => {
      const validIds = new Set(softDeletedUsers.map((u) => u.userId));
      const next = new Set<number>();
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [softDeletedUsers]);

  useEffect(() => {
    setSelectedTaskIds((prev) => {
      const validIds = new Set(softDeletedTasks.map((t) => t.taskId));
      const next = new Set<number>();
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
      });
      return next;
    });
  }, [softDeletedTasks]);

  // ─── Single-item Actions ────────────────────────────────────────────────

  const handlePermanentlyDeleteUser = async (userId: number) => {
    setActionLoading(userId);
    setError(null);
    try {
      const result = await apiClient.permanentlyDeleteUser(userId);
      setSuccessMessage(result?.message || `User ${userId} permanently deleted.`);
      setSoftDeletedUsers((prev) => prev.filter((u) => u.userId !== userId));
    } catch (err: any) {
      setError(err.message || 'Failed to permanently delete user');
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handleRestoreUser = async (userId: number) => {
    setActionLoading(userId);
    setError(null);
    try {
      const result = await apiClient.restoreUser(userId);
      setSuccessMessage(result?.message || `User ${userId} restored successfully.`);
      setSoftDeletedUsers((prev) => prev.filter((u) => u.userId !== userId));
    } catch (err: any) {
      setError(err.message || 'Failed to restore user');
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handlePermanentlyDeleteTask = async (taskId: number) => {
    setActionLoading(taskId);
    setError(null);
    try {
      const result = await apiClient.permanentlyDeleteTask(taskId);
      setSuccessMessage(result?.message || `Task TC-${taskId} permanently deleted.`);
      setSoftDeletedTasks((prev) => prev.filter((t) => t.taskId !== taskId));
    } catch (err: any) {
      setError(err.message || 'Failed to permanently delete task');
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  const handleRestoreTask = async (taskId: number) => {
    setActionLoading(taskId);
    setError(null);
    try {
      const result = await apiClient.restoreTask(taskId);
      setSuccessMessage(result?.message || `Task TC-${taskId} restored successfully.`);
      setSoftDeletedTasks((prev) => prev.filter((t) => t.taskId !== taskId));
    } catch (err: any) {
      setError(err.message || 'Failed to restore task');
    } finally {
      setActionLoading(null);
      setConfirmAction(null);
    }
  };

  // ─── Bulk Actions ───────────────────────────────────────────────────────

  const handleBulkPermanentlyDeleteUsers = async (ids: number[]) => {
    setBulkActionLoading(true);
    setError(null);
    let successCount = 0;
    let failCount = 0;
    for (const userId of ids) {
      try {
        await apiClient.permanentlyDeleteUser(userId);
        setSoftDeletedUsers((prev) => prev.filter((u) => u.userId !== userId));
        successCount++;
      } catch {
        failCount++;
      }
    }
    setBulkActionLoading(false);
    setConfirmAction(null);
    setSelectedUserIds(new Set());
    if (failCount === 0) {
      setSuccessMessage(`Successfully permanently deleted ${successCount} user(s).`);
    } else {
      setSuccessMessage(`Deleted ${successCount} user(s). ${failCount} failed.`);
    }
  };

  const handleBulkRestoreUsers = async (ids: number[]) => {
    setBulkActionLoading(true);
    setError(null);
    let successCount = 0;
    let failCount = 0;
    for (const userId of ids) {
      try {
        await apiClient.restoreUser(userId);
        setSoftDeletedUsers((prev) => prev.filter((u) => u.userId !== userId));
        successCount++;
      } catch {
        failCount++;
      }
    }
    setBulkActionLoading(false);
    setConfirmAction(null);
    setSelectedUserIds(new Set());
    if (failCount === 0) {
      setSuccessMessage(`Successfully restored ${successCount} user(s).`);
    } else {
      setSuccessMessage(`Restored ${successCount} user(s). ${failCount} failed.`);
    }
  };

  const handleBulkPermanentlyDeleteTasks = async (ids: number[]) => {
    setBulkActionLoading(true);
    setError(null);
    let successCount = 0;
    let failCount = 0;
    for (const taskId of ids) {
      try {
        await apiClient.permanentlyDeleteTask(taskId);
        setSoftDeletedTasks((prev) => prev.filter((t) => t.taskId !== taskId));
        successCount++;
      } catch {
        failCount++;
      }
    }
    setBulkActionLoading(false);
    setConfirmAction(null);
    setSelectedTaskIds(new Set());
    if (failCount === 0) {
      setSuccessMessage(`Successfully permanently deleted ${successCount} task(s).`);
    } else {
      setSuccessMessage(`Deleted ${successCount} task(s). ${failCount} failed.`);
    }
  };

  const handleBulkRestoreTasks = async (ids: number[]) => {
    setBulkActionLoading(true);
    setError(null);
    let successCount = 0;
    let failCount = 0;
    for (const taskId of ids) {
      try {
        await apiClient.restoreTask(taskId);
        setSoftDeletedTasks((prev) => prev.filter((t) => t.taskId !== taskId));
        successCount++;
      } catch {
        failCount++;
      }
    }
    setBulkActionLoading(false);
    setConfirmAction(null);
    setSelectedTaskIds(new Set());
    if (failCount === 0) {
      setSuccessMessage(`Successfully restored ${successCount} task(s).`);
    } else {
      setSuccessMessage(`Restored ${successCount} task(s). ${failCount} failed.`);
    }
  };

  const executeConfirmAction = () => {
    if (!confirmAction) return;
    switch (confirmAction.type) {
      case 'permanent-delete-user':
        handlePermanentlyDeleteUser(confirmAction.id);
        break;
      case 'restore-user':
        handleRestoreUser(confirmAction.id);
        break;
      case 'permanent-delete-task':
        handlePermanentlyDeleteTask(confirmAction.id);
        break;
      case 'restore-task':
        handleRestoreTask(confirmAction.id);
        break;
      case 'bulk-permanent-delete-users':
        handleBulkPermanentlyDeleteUsers(confirmAction.ids || []);
        break;
      case 'bulk-restore-users':
        handleBulkRestoreUsers(confirmAction.ids || []);
        break;
      case 'bulk-permanent-delete-tasks':
        handleBulkPermanentlyDeleteTasks(confirmAction.ids || []);
        break;
      case 'bulk-restore-tasks':
        handleBulkRestoreTasks(confirmAction.ids || []);
        break;
    }
  };

  // ─── Selection helpers ──────────────────────────────────────────────────

  const toggleUserSelection = (userId: number) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const toggleAllUsers = () => {
    if (selectedUserIds.size === filteredUsers.length && filteredUsers.length > 0) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filteredUsers.map((u) => u.userId)));
    }
  };

  const toggleTaskSelection = (taskId: number) => {
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const toggleAllTasks = () => {
    if (selectedTaskIds.size === filteredTasks.length && filteredTasks.length > 0) {
      setSelectedTaskIds(new Set());
    } else {
      setSelectedTaskIds(new Set(filteredTasks.map((t) => t.taskId)));
    }
  };

  const toggleAllTasksInGroup = (group: GroupedTasks) => {
    const groupTaskIds = group.tasks.map((t) => t.taskId);
    const allSelected = groupTaskIds.every((id) => selectedTaskIds.has(id));
    setSelectedTaskIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        groupTaskIds.forEach((id) => next.delete(id));
      } else {
        groupTaskIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  // ─── Filtering ──────────────────────────────────────────────────────────

  const filteredUsers = softDeletedUsers.filter((user) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (user.fullName || '').toLowerCase().includes(q) ||
      (user.username || '').toLowerCase().includes(q) ||
      (user.email || '').toLowerCase().includes(q) ||
      (user.role || '').toLowerCase().includes(q) ||
      (user.shopName || '').toLowerCase().includes(q)
    );
  });

  const filteredTasks = softDeletedTasks.filter((task) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      (task.description || '').toLowerCase().includes(q) ||
      (task.serialNumber || '').toLowerCase().includes(q) ||
      (task.partNumber || '').toLowerCase().includes(q) ||
      (task.poNumber || '').toLowerCase().includes(q) ||
      (task.createdByName || '').toLowerCase().includes(q) ||
      (task.assignedEngineer || '').toLowerCase().includes(q) ||
      (task.categoryName || '').toLowerCase().includes(q) ||
      String(task.taskId).includes(q)
    );
  });

  // Group tasks by creator
  const groupedTasks: GroupedTasks[] = React.useMemo(() => {
    const groups: Record<string, GroupedTasks> = {};
    filteredTasks.forEach((task) => {
      const key = task.createdByName || `User #${task.createdBy || 'Unknown'}`;
      if (!groups[key]) {
        groups[key] = {
          createdByName: key,
          createdBy: task.createdBy || 0,
          tasks: [],
        };
      }
      groups[key].tasks.push(task);
    });
    return Object.values(groups).sort((a, b) => a.createdByName.localeCompare(b.createdByName));
  }, [filteredTasks]);

  // ─── Helpers ────────────────────────────────────────────────────────────

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'N/A';
    const result = tzFormatDate(dateStr);
    return result === '—' ? 'N/A' : result;
  };

  const getRoleBadgeColor = (role: string) => {
    const r = (role || '').toLowerCase();
    if (r === 'admin') return 'bg-red-100 text-red-800 border-red-200';
    if (r === 'director') return 'bg-purple-100 text-purple-800 border-purple-200';
    if (r === 'manager') return 'bg-blue-100 text-blue-800 border-blue-200';
    if (r === 'shop_tl') return 'bg-green-100 text-green-800 border-green-200';
    if (r === 'engineer') return 'bg-orange-100 text-orange-800 border-orange-200';
    if (r === 'customer_personnel') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getStatusBadgeColor = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'completed' || s === '2') return 'bg-green-100 text-green-800';
    if (s === 'inprogress' || s === '1') return 'bg-blue-100 text-blue-800';
    if (s === 'pending' || s === '0') return 'bg-yellow-100 text-yellow-800';
    if (s === 'blocked' || s === '3') return 'bg-red-100 text-red-800';
    if (s === 'onhold' || s === '4') return 'bg-orange-100 text-orange-800';
    if (s === 'rejected' || s === '5') return 'bg-rose-100 text-rose-800';
    if (s === 'cancelled' || s === '6') return 'bg-gray-100 text-gray-800';
    if (s === 'paused' || s === '7') return 'bg-amber-100 text-amber-800';
    return 'bg-gray-100 text-gray-800';
  };

  const isAnyBulkLoading = bulkActionLoading || actionLoading !== null;

  // Determine "select all" checkbox states
  const allUsersSelected = filteredUsers.length > 0 && selectedUserIds.size === filteredUsers.length;
  const someUsersSelected = selectedUserIds.size > 0 && selectedUserIds.size < filteredUsers.length;
  const allTasksSelected = filteredTasks.length > 0 && selectedTaskIds.size === filteredTasks.length;
  const someTasksSelected = selectedTaskIds.size > 0 && selectedTaskIds.size < filteredTasks.length;

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading && softDeletedUsers.length === 0 && softDeletedTasks.length === 0) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading soft-deleted items...</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h2 className="text-lg font-semibold">Soft-Deleted Items Management</h2>
            <Badge variant="outline" className="ml-2">
              {softDeletedUsers.length} Users · {softDeletedTasks.length} Tasks
            </Badge>
          </div>
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Messages */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {successMessage && (
          <Alert className="border-green-200 bg-green-50">
            <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
          </Alert>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search soft-deleted items..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Sub-tabs: Users / Tasks */}
        <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <UserX className="h-4 w-4" />
              Deleted Users ({filteredUsers.length})
            </TabsTrigger>
            <TabsTrigger value="tasks" className="flex items-center gap-2">
              <FileX className="h-4 w-4" />
              Deleted Tasks ({filteredTasks.length})
            </TabsTrigger>
          </TabsList>

          {/* ─── Users Tab ─────────────────────────────────────────────── */}
          <TabsContent value="users" className="space-y-4">
            {/* Bulk Actions Bar for Users */}
            {selectedUserIds.size > 0 && (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">
                    {selectedUserIds.size} user{selectedUserIds.size !== 1 ? 's' : ''} selected
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-green-700 border-green-300 hover:bg-green-50"
                    disabled={isAnyBulkLoading}
                    onClick={() =>
                      setConfirmAction({
                        type: 'bulk-restore-users',
                        id: 0,
                        ids: Array.from(selectedUserIds),
                        label: `Restore ${selectedUserIds.size} selected user(s) back to active status?`,
                      })
                    }
                  >
                    {bulkActionLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Restore Selected
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-red-700 border-red-300 hover:bg-red-50"
                    disabled={isAnyBulkLoading}
                    onClick={() =>
                      setConfirmAction({
                        type: 'bulk-permanent-delete-users',
                        id: 0,
                        ids: Array.from(selectedUserIds),
                        label: `Permanently delete ${selectedUserIds.size} selected user(s)? This action cannot be undone.`,
                      })
                    }
                  >
                    {bulkActionLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                    )}
                    Delete Selected
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-gray-600"
                    disabled={isAnyBulkLoading}
                    onClick={() => setSelectedUserIds(new Set())}
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            )}

            {filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <UserX className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p className="font-medium">No soft-deleted users found</p>
                <p className="text-sm mt-1">
                  {searchQuery
                    ? 'Try adjusting your search query.'
                    : 'All users are currently active.'}
                </p>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-[50px]">
                        <Checkbox
                          checked={allUsersSelected}
                          ref={(el) => {
                            if (el) {
                              const input = el.querySelector('button');
                              if (input) {
                                (input as any).dataset.indeterminate = someUsersSelected ? 'true' : 'false';
                              }
                            }
                          }}
                          onCheckedChange={toggleAllUsers}
                          aria-label="Select all users"
                          className={someUsersSelected && !allUsersSelected ? 'opacity-70' : ''}
                        />
                      </TableHead>
                      <TableHead className="w-[60px]">ID</TableHead>
                      <TableHead>Full Name</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Shop</TableHead>
                      <TableHead>Deleted At</TableHead>
                      <TableHead className="text-right w-[180px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow
                        key={`deleted-user-${user.userId}`}
                        className={`hover:bg-red-50/30 ${selectedUserIds.has(user.userId) ? 'bg-blue-50/50' : ''}`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedUserIds.has(user.userId)}
                            onCheckedChange={() => toggleUserSelection(user.userId)}
                            aria-label={`Select user ${user.fullName}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{user.userId}</TableCell>
                        <TableCell className="font-medium">{user.fullName || 'N/A'}</TableCell>
                        <TableCell className="text-gray-600">@{user.username}</TableCell>
                        <TableCell className="text-gray-600 text-sm">{user.email || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${getRoleBadgeColor(user.role)}`}>
                            {user.roleDisplayName || user.role || 'Unknown'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">{user.shopName || '—'}</TableCell>
                        <TableCell className="text-sm text-gray-500">
                          {formatDate(user.deletedAt || user.updatedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-green-700 border-green-300 hover:bg-green-50"
                                  disabled={actionLoading === user.userId || bulkActionLoading}
                                  onClick={() =>
                                    setConfirmAction({
                                      type: 'restore-user',
                                      id: user.userId,
                                      label: `Restore user "${user.fullName}"?`,
                                    })
                                  }
                                >
                                  {actionLoading === user.userId ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  )}
                                  <span className="ml-1 text-xs">Restore</span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Restore user to active status</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 text-red-700 border-red-300 hover:bg-red-50"
                                  disabled={actionLoading === user.userId || bulkActionLoading}
                                  onClick={() =>
                                    setConfirmAction({
                                      type: 'permanent-delete-user',
                                      id: user.userId,
                                      label: `Permanently delete user "${user.fullName}"? This action cannot be undone.`,
                                    })
                                  }
                                >
                                  {actionLoading === user.userId ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                  <span className="ml-1 text-xs">Delete</span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Permanently delete — cannot be undone</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* ─── Tasks Tab (grouped by user) ───────────────────────────── */}
          <TabsContent value="tasks" className="space-y-4">
            {/* Bulk Actions Bar for Tasks */}
            {selectedTaskIds.size > 0 && (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-medium text-blue-800">
                    {selectedTaskIds.size} task{selectedTaskIds.size !== 1 ? 's' : ''} selected
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-green-700 border-green-300 hover:bg-green-50"
                    disabled={isAnyBulkLoading}
                    onClick={() =>
                      setConfirmAction({
                        type: 'bulk-restore-tasks',
                        id: 0,
                        ids: Array.from(selectedTaskIds),
                        label: `Restore ${selectedTaskIds.size} selected task(s) back to active status?`,
                      })
                    }
                  >
                    {bulkActionLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    )}
                    Restore Selected
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-red-700 border-red-300 hover:bg-red-50"
                    disabled={isAnyBulkLoading}
                    onClick={() =>
                      setConfirmAction({
                        type: 'bulk-permanent-delete-tasks',
                        id: 0,
                        ids: Array.from(selectedTaskIds),
                        label: `Permanently delete ${selectedTaskIds.size} selected task(s) and all related records? This action cannot be undone.`,
                      })
                    }
                  >
                    {bulkActionLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 mr-1" />
                    )}
                    Delete Selected
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-gray-600"
                    disabled={isAnyBulkLoading}
                    onClick={() => setSelectedTaskIds(new Set())}
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            )}

            {filteredTasks.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileX className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                <p className="font-medium">No soft-deleted tasks found</p>
                <p className="text-sm mt-1">
                  {searchQuery
                    ? 'Try adjusting your search query.'
                    : 'All tasks are currently active.'}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Select All Tasks across all groups */}
                <div className="flex items-center gap-3 px-1">
                  <Checkbox
                    checked={allTasksSelected}
                    onCheckedChange={toggleAllTasks}
                    aria-label="Select all tasks"
                    className={someTasksSelected && !allTasksSelected ? 'opacity-70' : ''}
                  />
                  <span className="text-sm text-gray-600">
                    {allTasksSelected
                      ? `All ${filteredTasks.length} tasks selected`
                      : `Select all ${filteredTasks.length} tasks`}
                  </span>
                </div>

                {groupedTasks.map((group) => {
                  const groupTaskIds = group.tasks.map((t) => t.taskId);
                  const allGroupSelected = groupTaskIds.length > 0 && groupTaskIds.every((id) => selectedTaskIds.has(id));
                  const someGroupSelected = groupTaskIds.some((id) => selectedTaskIds.has(id)) && !allGroupSelected;

                  return (
                    <div key={`group-${group.createdBy}-${group.createdByName}`} className="border rounded-lg overflow-hidden">
                      {/* Group Header */}
                      <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox
                            checked={allGroupSelected}
                            onCheckedChange={() => toggleAllTasksInGroup(group)}
                            aria-label={`Select all tasks by ${group.createdByName}`}
                            className={someGroupSelected ? 'opacity-70' : ''}
                          />
                          <Users className="h-4 w-4 text-blue-600" />
                          <span className="font-semibold text-sm">
                            Created by: {group.createdByName}
                          </span>
                          <Badge variant="secondary" className="text-xs">
                            {group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}
                          </Badge>
                        </div>
                      </div>

                      {/* Tasks Table */}
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[50px]"></TableHead>
                            <TableHead className="w-[80px]">Task ID</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Serial #</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Assigned To</TableHead>
                            <TableHead>Deleted At</TableHead>
                            <TableHead className="text-right w-[180px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.tasks.map((task) => (
                            <TableRow
                              key={`deleted-task-${task.taskId}`}
                              className={`hover:bg-red-50/30 ${selectedTaskIds.has(task.taskId) ? 'bg-blue-50/50' : ''}`}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={selectedTaskIds.has(task.taskId)}
                                  onCheckedChange={() => toggleTaskSelection(task.taskId)}
                                  aria-label={`Select task TC-${task.taskId}`}
                                />
                              </TableCell>
                              <TableCell className="font-mono text-sm">TC-{task.taskId}</TableCell>
                              <TableCell className="font-medium max-w-[250px] truncate">
                                {task.description || 'No description'}
                              </TableCell>
                              <TableCell className="text-sm text-gray-600">
                                {task.serialNumber || '—'}
                              </TableCell>
                              <TableCell className="text-sm text-gray-600">
                                {task.categoryName || '—'}
                              </TableCell>
                              <TableCell>
                                <span className={`px-2 py-0.5 rounded text-xs ${getStatusBadgeColor(task.status || '')}`}>
                                  {task.status || 'Unknown'}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm text-gray-600">
                                {task.assignedEngineer || '—'}
                              </TableCell>
                              <TableCell className="text-sm text-gray-500">
                                {formatDate(task.updatedAt)}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-green-700 border-green-300 hover:bg-green-50"
                                        disabled={actionLoading === task.taskId || bulkActionLoading}
                                        onClick={() =>
                                          setConfirmAction({
                                            type: 'restore-task',
                                            id: task.taskId,
                                            label: `Restore task TC-${task.taskId}?`,
                                          })
                                        }
                                      >
                                        {actionLoading === task.taskId ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <RotateCcw className="h-3.5 w-3.5" />
                                        )}
                                        <span className="ml-1 text-xs">Restore</span>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Restore task to active status</TooltipContent>
                                  </Tooltip>

                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-8 text-red-700 border-red-300 hover:bg-red-50"
                                        disabled={actionLoading === task.taskId || bulkActionLoading}
                                        onClick={() =>
                                          setConfirmAction({
                                            type: 'permanent-delete-task',
                                            id: task.taskId,
                                            label: `Permanently delete task TC-${task.taskId} and all related records (comments, attachments, history)? This action cannot be undone.`,
                                          })
                                        }
                                      >
                                        {actionLoading === task.taskId ? (
                                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="h-3.5 w-3.5" />
                                        )}
                                        <span className="ml-1 text-xs">Delete</span>
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Permanently delete — cannot be undone</TooltipContent>
                                  </Tooltip>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ─── Confirmation Dialog ──────────────────────────────────────── */}
        <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                {confirmAction?.type.includes('permanent-delete') ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    Confirm Permanent Deletion
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-5 w-5 text-green-600" />
                    Confirm Restore
                  </>
                )}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirmAction?.label}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={actionLoading !== null || bulkActionLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={executeConfirmAction}
                disabled={actionLoading !== null || bulkActionLoading}
                className={
                  confirmAction?.type.includes('permanent-delete')
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }
              >
                {(actionLoading !== null || bulkActionLoading) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {confirmAction?.type.includes('permanent-delete') ? 'Delete Permanently' : 'Restore'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}