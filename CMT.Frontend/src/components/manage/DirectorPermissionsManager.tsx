'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Shield, Save, RotateCcw, CheckCircle, XCircle } from 'lucide-react';
import apiClient from '@/lib/api';

interface DirectorPermission {
  directorPermissionId: number;
  userId: number;
  directorName?: string;
  directorEmail?: string;
  canViewWorkloadDashboard: boolean;
  canViewPerformanceMetrics: boolean;
  canViewAnalytics: boolean;
  canViewEngineerWorkload: boolean;
  canManageCategories: boolean;
  canManagePriorities: boolean;
  canManageTaskTypes: boolean;
  canCreateTeamLeader: boolean;
  canCreateManager: boolean;
  canManageUsers: boolean;
  canManageDepartments: boolean;
  canManageShops: boolean;
  canViewReports: boolean;
  canExportData: boolean;
  canManageSchedules: boolean;
  canViewPendingTLApprovals: boolean;
}

interface DirectorPermissionsManagerProps {
  directorUserId: number;
  directorName: string;
  onClose?: () => void;
}

export default function DirectorPermissionsManager({ 
  directorUserId, 
  directorName,
  onClose 
}: DirectorPermissionsManagerProps) {
  const [permissions, setPermissions] = useState<DirectorPermission | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadPermissions();
  }, [directorUserId]);

  const loadPermissions = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiClient.get(`/director-permissions/${directorUserId}`);
      setPermissions(response.data || response);
    } catch (err: any) {
      console.error('Failed to load director permissions:', err);
      setError('Failed to load permissions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePermissionChange = (key: keyof DirectorPermission, value: boolean) => {
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
      await apiClient.put(`/director-permissions/${directorUserId}`, {
        userId: directorUserId,
        canViewWorkloadDashboard: permissions.canViewWorkloadDashboard,
        canViewPerformanceMetrics: permissions.canViewPerformanceMetrics,
        canViewAnalytics: permissions.canViewAnalytics,
        canViewEngineerWorkload: permissions.canViewEngineerWorkload,
        canManageCategories: permissions.canManageCategories,
        canManagePriorities: permissions.canManagePriorities,
        canManageTaskTypes: permissions.canManageTaskTypes,
        canCreateTeamLeader: permissions.canCreateTeamLeader,
        canCreateManager: permissions.canCreateManager,
        canManageUsers: permissions.canManageUsers,
        canManageDepartments: permissions.canManageDepartments,
        canManageShops: permissions.canManageShops,
        canViewReports: permissions.canViewReports,
        canExportData: permissions.canExportData,
        canManageSchedules: permissions.canManageSchedules,
        canViewPendingTLApprovals: permissions.canViewPendingTLApprovals,
      });
      
      setSuccess('Permissions updated successfully!');
      setTimeout(() => setSuccess(null), 3000);

      // Dispatch event so that if the director is logged in, their sidebar updates
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('directorPermissionsUpdated', {
          detail: { directorUserId }
        }));
      }
    } catch (err: any) {
      console.error('Failed to save permissions:', err);
      setError('Failed to save permissions. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset permissions to default values?')) {
      return;
    }
    
    setSaving(true);
    setError(null);
    setSuccess(null);
    
    try {
      const response = await apiClient.post(`/director-permissions/${directorUserId}/reset`);
      setPermissions(response.data || response);
      setSuccess('Permissions reset to defaults successfully!');
      setTimeout(() => setSuccess(null), 3000);

      // Dispatch event so that if the director is logged in, their sidebar updates
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('directorPermissionsUpdated', {
          detail: { directorUserId }
        }));
      }
    } catch (err: any) {
      console.error('Failed to reset permissions:', err);
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
        <AlertDescription>Failed to load director permissions</AlertDescription>
      </Alert>
    );
  }

  const permissionSections = [
    {
      title: 'Dashboard & Analytics',
      icon: '📊',
      permissions: [
        { key: 'canViewWorkloadDashboard', label: 'View Workload Dashboard', description: 'Access to workload and task distribution dashboard' },
        { key: 'canViewPerformanceMetrics', label: 'View Performance Metrics', description: 'Access to performance analytics and metrics' },
        { key: 'canViewAnalytics', label: 'View Analytics', description: 'Access to general analytics and reports' },
        { key: 'canViewEngineerWorkload', label: 'View Engineer Workload', description: 'Access to the Engineer Workload chart and breakdown on the dashboard' }
      ]
    },
    {
      title: 'Task Management',
      icon: '✅',
      permissions: [
        { key: 'canManageCategories', label: 'Manage Categories', description: 'Create, edit, and delete task categories (also controls Category Target Days)' },
        { key: 'canManagePriorities', label: 'Manage Priorities', description: 'Create, edit, and delete task priorities' },
        { key: 'canManageTaskTypes', label: 'Manage Task Types', description: 'Create, edit, and delete task types and sub types' }
      ]
    },
    {
      title: 'User Management',
      icon: '👥',
      permissions: [
        { key: 'canCreateTeamLeader', label: 'Create Team Leaders', description: 'Permission to create Team Leader accounts' },
        { key: 'canCreateManager', label: 'Create Managers', description: 'Permission to create Manager accounts' },
        { key: 'canManageUsers', label: 'Manage Users', description: 'View and manage user accounts (controls Manage Users sidebar item)' }
      ]
    },
    {
      title: 'Department & Shop Management',
      icon: '🏢',
      permissions: [
        { key: 'canManageDepartments', label: 'Manage Departments', description: 'Create, edit, and manage departments' },
        { key: 'canManageShops', label: 'Manage Shops', description: 'Create, edit, and manage shop locations' }
      ]
    },
    {
      title: 'Reports & Data',
      icon: '📈',
      permissions: [
        { key: 'canViewReports', label: 'View Reports', description: 'Access to system reports (controls Reports sidebar item)' },
        { key: 'canExportData', label: 'Export Data', description: 'Export data to CSV/Excel formats' }
      ]
    },
    {
      title: 'Schedule & Planning',
      icon: '📅',
      permissions: [
        { key: 'canManageSchedules', label: 'Manage Schedules', description: 'Create and manage work schedules (controls Scheduler & Workload sidebar item)' }
      ]
    },
    {
      title: 'Approval & Follow-up',
      icon: '📋',
      permissions: [
        { key: 'canViewPendingTLApprovals', label: 'View Pending TL Approval Requests', description: 'Access the Pending TL Approval Requests page to follow up, approve, or reject hold requests pending Team Leader approval (controls Pending TL Approvals sidebar item)' }
      ]
    }
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              Director Permissions
            </CardTitle>
            <CardDescription>
              Manage permissions for {directorName}
            </CardDescription>
            <p className="text-xs text-gray-500 mt-2">
              These permissions control which sidebar menu items and features are visible to this director.
              Changes take effect the next time the director refreshes their page.
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
                      checked={permissions[perm.key as keyof DirectorPermission] as boolean}
                      onCheckedChange={(checked) => 
                        handlePermissionChange(perm.key as keyof DirectorPermission, checked)
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