'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Save, RotateCcw, CheckCircle, XCircle } from 'lucide-react';
import apiClient from '@/lib/api';

interface TLPermission {
  tlPermissionId?: number;
  userId: number;
  teamLeaderName?: string;
  teamLeaderEmail?: string;
  // Dashboard & Analytics
  canViewPerformanceMetrics: boolean;
  canViewEngineerWorkload: boolean;
  canViewAnalytics: boolean;
  canManageData: boolean;
  // Granular per-card metric visibility
  canViewCompletionRate: boolean;
  canViewAvgDelay: boolean;
  canViewTasksCompleted: boolean;
  canViewPendingTasks: boolean;
  // Completed tasks visibility
  canViewCompletedTasks: boolean;
  // Task Management
  canManageCategories: boolean;
  canManagePriorities: boolean;
  canManageTaskTypes: boolean;
  // User Management
  canCreateTeamLeaders: boolean;
  canCreateManagers: boolean;
  canManageUsers: boolean;
  // Reports & Data
  canViewReports: boolean;
  canExportData: boolean;
  // Schedule & Planning
  canManageSchedules: boolean;
  // Workload & Task Creation
  canWorkloadAdjustment: boolean;
  canCreateTask: boolean;
}

interface TeamLeaderPermissionsManagerProps {
  teamLeaderUserId: number;
  teamLeaderName: string;
  onClose?: () => void;
}

export default function TeamLeaderPermissionsManager({
  teamLeaderUserId,
  teamLeaderName,
  onClose
}: TeamLeaderPermissionsManagerProps) {
  const [permissions, setPermissions] = useState<TLPermission | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadPermissions();
  }, [teamLeaderUserId]);

  const loadPermissions = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get(`/tl-permissions/${teamLeaderUserId}`);
      setPermissions(response.data || response);
    } catch (err: any) {
      console.error('Failed to load TL permissions:', err);
      // If backend doesn't have the endpoint yet, use defaults
      setPermissions({
        userId: teamLeaderUserId,
        canViewPerformanceMetrics: true,
        canViewEngineerWorkload: true,
        canViewAnalytics: true,
        canManageData: true,
        canViewCompletionRate: true,
        canViewAvgDelay: true,
        canViewTasksCompleted: true,
        canViewPendingTasks: true,
        canViewCompletedTasks: true,
        canManageCategories: true,
        canManagePriorities: true,
        canManageTaskTypes: true,
        canCreateTeamLeaders: true,
        canCreateManagers: true,
        canManageUsers: true,
        canViewReports: true,
        canExportData: true,
        canManageSchedules: true,
        canWorkloadAdjustment: true,
        canCreateTask: true,
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionChange = (key: keyof TLPermission, value: boolean) => {
    if (!permissions) return;

    setPermissions({
      ...permissions,
      [key]: value
    });
  };

  const handleSave = async () => {
    if (!permissions) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await apiClient.put(`/tl-permissions/${teamLeaderUserId}`, {
        userId: teamLeaderUserId,
        canViewPerformanceMetrics: permissions.canViewPerformanceMetrics,
        canViewEngineerWorkload: permissions.canViewEngineerWorkload,
        canViewAnalytics: permissions.canViewAnalytics,
        canManageData: permissions.canManageData,
        // Granular per-card metric visibility
        canViewCompletionRate: permissions.canViewCompletionRate,
        canViewAvgDelay: permissions.canViewAvgDelay,
        canViewTasksCompleted: permissions.canViewTasksCompleted,
        canViewPendingTasks: permissions.canViewPendingTasks,
        // Completed tasks visibility
        canViewCompletedTasks: permissions.canViewCompletedTasks,
        canManageCategories: permissions.canManageCategories,
        canManagePriorities: permissions.canManagePriorities,
        canManageTaskTypes: permissions.canManageTaskTypes,
        canCreateTeamLeaders: permissions.canCreateTeamLeaders,
        canCreateManagers: permissions.canCreateManagers,
        canManageUsers: permissions.canManageUsers,
        canViewReports: permissions.canViewReports,
        canExportData: permissions.canExportData,
        canManageSchedules: permissions.canManageSchedules,
        canWorkloadAdjustment: permissions.canWorkloadAdjustment,
        canCreateTask: permissions.canCreateTask,
      });

      if (result?._localOnly) {
        setSuccess('Permissions saved locally. Changes will sync when the backend endpoint is available.');
      } else {
        setSuccess('Permissions updated successfully!');
      }
      setTimeout(() => setSuccess(null), 5000);

      // Dispatch event so that if the TL is logged in, their sidebar updates
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tlPermissionsUpdated', {
          detail: { teamLeaderUserId }
        }));
      }
    } catch (err: any) {
      console.error('Failed to save TL permissions:', err);
      setError('Failed to save permissions. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset permissions to default values? This will unrestrict all permissions for this Team Leader.')) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiClient.post(`/tl-permissions/${teamLeaderUserId}`, { action: 'reset' });
      setPermissions(response.data || response || {
        userId: teamLeaderUserId,
        canViewPerformanceMetrics: true,
        canViewEngineerWorkload: true,
        canViewAnalytics: true,
        canManageData: true,
        canViewCompletionRate: true,
        canViewAvgDelay: true,
        canViewTasksCompleted: true,
        canViewPendingTasks: true,
        canViewCompletedTasks: true,
        canManageCategories: true,
        canManagePriorities: true,
        canManageTaskTypes: true,
        canCreateTeamLeaders: true,
        canCreateManagers: true,
        canManageUsers: true,
        canViewReports: true,
        canExportData: true,
        canManageSchedules: true,
        canWorkloadAdjustment: true,
        canCreateTask: true,
      });
      setSuccess('Permissions reset to defaults successfully!');
      setTimeout(() => setSuccess(null), 3000);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tlPermissionsUpdated', {
          detail: { teamLeaderUserId }
        }));
      }
    } catch (err: any) {
      console.error('Failed to reset TL permissions:', err);
      setError('Failed to reset permissions. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-600">Loading permissions...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!permissions) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load team leader permissions</AlertDescription>
      </Alert>
    );
  }

  const permissionSections = [
    {
      title: 'Dashboard & Analytics',
      icon: '📊',
      permissions: [
        { key: 'canViewPerformanceMetrics', label: 'View Performance Metrics', description: 'Master toggle for performance analytics. When disabled, hides Completion Rate and Avg. Delay cards (unless individually overridden below).' },
        { key: 'canViewEngineerWorkload', label: 'View Engineer Workload', description: 'Access to the Engineer Workload chart and breakdown on the dashboard' },
        { key: 'canViewAnalytics', label: 'View Analytics', description: 'Controls click-through analytics on metric cards. When disabled, cards are visible but not clickable.' },
        { key: 'canManageData', label: 'Manage Data', description: 'Access to Maintenix Data management features' },
      ]
    },
    {
      title: 'Dashboard Metric Cards (Granular)',
      icon: '📈',
      permissions: [
        { key: 'canViewCompletionRate', label: 'View Completion Rate Card', description: 'Controls visibility of the "Completion Rate" metric card on the dashboard. Also requires "View Performance Metrics" to be enabled.' },
        { key: 'canViewAvgDelay', label: 'View Avg. Delay Card', description: 'Controls visibility of the "Avg. Delay" metric card on the dashboard. Also requires "View Performance Metrics" to be enabled.' },
        { key: 'canViewTasksCompleted', label: 'View Tasks Completed Card', description: 'Controls visibility of the "Tasks Completed" metric card on the dashboard. Independent of "View Performance Metrics".' },
        { key: 'canViewPendingTasks', label: 'View Pending Tasks Card', description: 'Controls visibility of the "Pending Tasks" metric card on the dashboard. Independent of "View Performance Metrics".' },
        { key: 'canViewCompletedTasks', label: 'View Completed Tasks', description: 'Controls whether completed tasks appear in task tables and analytics. When disabled, completed tasks are filtered out from task lists and analytics routes.' },
      ]
    },
    {
      title: 'Task Management',
      icon: '✅',
      permissions: [
        { key: 'canManageCategories', label: 'Manage Categories', description: 'Create, edit, and delete task categories (also controls Category Target Days)' },
        { key: 'canManagePriorities', label: 'Manage Priorities', description: 'Create, edit, and delete task priorities' },
        { key: 'canManageTaskTypes', label: 'Manage Task Types', description: 'Create, edit, and delete task types and sub types' },
      ]
    },
    {
      title: 'User Management',
      icon: '👥',
      permissions: [
        { key: 'canCreateTeamLeaders', label: 'Create Team Leaders', description: 'Permission to create Team Leader accounts' },
        { key: 'canCreateManagers', label: 'Create Managers', description: 'Permission to create Manager accounts' },
        { key: 'canManageUsers', label: 'Manage Users', description: 'View and manage user accounts (controls Manage Users sidebar item)' },
      ]
    },
    {
      title: 'Reports & Data',
      icon: '📈',
      permissions: [
        { key: 'canViewReports', label: 'View Reports', description: 'Access to system reports (controls Reports sidebar item)' },
        { key: 'canExportData', label: 'Export Data', description: 'Export data to CSV/Excel formats' },
      ]
    },
    {
      title: 'Schedule & Planning',
      icon: '📅',
      permissions: [
        { key: 'canManageSchedules', label: 'Manage Schedules', description: 'Create and manage work schedules (controls Scheduler & Workload sidebar item)' },
      ]
    },
    {
      title: 'Workload & Task Creation',
      icon: '⚙️',
      permissions: [
        { key: 'canWorkloadAdjustment', label: 'Workload Adjustment', description: 'Access to the Workload Adjustment feature (controls Workload Adjustment sidebar item). When disabled, the Team Leader cannot view or manage workload adjustment requests.' },
        { key: 'canCreateTask', label: 'Create Task', description: 'Permission to create new tasks (controls Create Task sidebar item). When disabled, the Team Leader cannot create new tasks.' },
      ]
    },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-600" />
              Team Leader Permissions
            </CardTitle>
            <CardDescription>
              Manage permissions for {teamLeaderName}
            </CardDescription>
            <p className="text-xs text-gray-500 mt-2">
              These permissions control which sidebar menu items, dashboard metric cards, and features are visible to this Team Leader.
              By default, all permissions are enabled (unrestricted). You can selectively restrict access.
              Changes take effect the next time the Team Leader refreshes their page.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={saving}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to Defaults
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              size="sm"
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
              >
                Close
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-4 border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-6">
          {permissionSections.map((section) => (
            <div key={section.title} className="border rounded-lg p-4">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span>{section.icon}</span>
                {section.title}
              </h3>
              <div className="space-y-4">
                {section.permissions.map((perm) => (
                  <div key={perm.key} className="flex items-start justify-between py-2">
                    <div className="flex-1">
                      <Label htmlFor={perm.key} className="text-sm font-medium cursor-pointer">
                        {perm.label}
                      </Label>
                      <p className="text-xs text-gray-500 mt-1">{perm.description}</p>
                    </div>
                    <Switch
                      id={perm.key}
                      checked={permissions[perm.key as keyof TLPermission] as boolean}
                      onCheckedChange={(checked) =>
                        handlePermissionChange(perm.key as keyof TLPermission, checked)
                      }
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}