'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Shield,
  Save,
  RotateCcw,
  CheckCircle,
  XCircle,
  Info,
  Trash2,
  UserX,
  BarChart3,
  Users,
  TrendingUp,
  Loader2,
  Database,
  ArrowRightLeft,
  UserCog,
  Scale,
  Plus,
  FileEdit,
} from 'lucide-react';
import apiClient from '@/lib/api';
import {
  STORAGE_KEY,
  ROLE_PERMISSIONS_UPDATED_EVENT,
} from '@/hooks/useRolePermissions';
// SECURITY: the role permissions matrix used to be cached in localStorage
// under STORAGE_KEY ('cmt_role_permissions_matrix'). That exposed internal
// authorisation logic to any script on the origin (pentest: Sensitive Data
// Exposure). It is now held in memory only via secureAuthStore. The backend
// database remains the source of truth.
import { secureAuthStore } from '@/lib/secure-auth-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The seven operational roles (excludes Admin & Director which have separate permission systems) */
const ROLES = [
  { key: 'team_leader', label: 'Team Leader', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', level: 5 },
  { key: 'manager', label: 'Manager', color: 'bg-blue-100 text-blue-800 border-blue-200', level: 6 },
  { key: 'shop_tl', label: 'Shop Team Leader', color: 'bg-green-100 text-green-800 border-green-200', level: 4 },
  { key: 'shop_manager', label: 'Shop Manager', color: 'bg-teal-100 text-teal-800 border-teal-200', level: 4 },
  { key: 'engineer', label: 'Engineer', color: 'bg-orange-100 text-orange-800 border-orange-200', level: 3 },
  { key: 'customer_personnel', label: 'Customer Personnel', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', level: 2 },
  { key: 'customer', label: 'Customer', color: 'bg-gray-100 text-gray-800 border-gray-200', level: 1 },
] as const;

type RoleKey = typeof ROLES[number]['key'];

/** The twelve permissions the admin can assign */
const PERMISSIONS = [
  {
    key: 'delete_task',
    label: 'Delete Task',
    description: 'Ability to permanently delete tasks from the system',
    icon: Trash2,
    iconColor: 'text-red-500',
  },
  {
    key: 'delete_user',
    label: 'Delete User',
    description: 'Ability to permanently delete user accounts',
    icon: UserX,
    iconColor: 'text-red-600',
  },
  {
    key: 'reopen_task',
    label: 'Reopen Task',
    description: 'Ability to reopen completed tasks and reassign them back to Pending status',
    icon: RotateCcw,
    iconColor: 'text-amber-500',
  },
  {
    key: 'view_performance_metrics',
    label: 'View Performance Metrics',
    description: 'Access to view individual performance metrics and KPIs',
    icon: BarChart3,
    iconColor: 'text-blue-500',
  },
  {
    key: 'view_engineer_workload',
    label: 'View Engineer Workload',
    description: 'Access to view individual engineer workload distribution',
    icon: Users,
    iconColor: 'text-green-500',
  },
  {
    key: 'view_analytics',
    label: 'View Analytics',
    description: 'Access to view individual analytics dashboards and reports',
    icon: TrendingUp,
    iconColor: 'text-purple-500',
  },
  {
    key: 'mantenix_data',
    label: 'Mantenix Data',
    description: 'Access to view and manage Mantenix maintenance data',
    icon: Database,
    iconColor: 'text-cyan-500',
  },
  {
    key: 'transfers',
    label: 'Transfers',
    description: 'Ability to create and manage task transfers between shops',
    icon: ArrowRightLeft,
    iconColor: 'text-indigo-500',
  },
  {
    key: 'edit_user',
    label: 'Edit User',
    description: 'Ability to edit user account details and profile information',
    icon: UserCog,
    iconColor: 'text-emerald-500',
  },
  {
    key: 'workload_adjustment',
    label: 'Workload Adjustment',
    description: 'Ability to submit and access workload adjustment requests',
    icon: Scale,
    iconColor: 'text-orange-500',
  },
  {
    key: 'create_task',
    label: 'Create Task',
    description: 'Ability to create new tasks in the system',
    icon: Plus,
    iconColor: 'text-teal-500',
  },
  {
    key: 'request_amendment',
    label: 'Request Amendment',
    description: 'Ability to request amendments on completed tasks',
    icon: FileEdit,
    iconColor: 'text-rose-500',
  },
] as const;

type PermissionKey = typeof PERMISSIONS[number]['key'];

/** Matrix: role → permission → boolean */
type PermissionMatrix = Record<RoleKey, Record<PermissionKey, boolean>>;

// ---------------------------------------------------------------------------
// Default permission matrix (based on role hierarchy)
// ---------------------------------------------------------------------------

const DEFAULT_MATRIX: PermissionMatrix = {
  team_leader: {
    delete_task: true,
    delete_user: true,
    reopen_task: true,
    view_performance_metrics: true,
    view_engineer_workload: true,
    view_analytics: true,
    mantenix_data: true,
    transfers: true,
    edit_user: true,
    workload_adjustment: true,
    create_task: true,
    request_amendment: true,
  },
  manager: {
    delete_task: true,
    delete_user: true,
    reopen_task: false,
    view_performance_metrics: true,
    view_engineer_workload: true,
    view_analytics: true,
    mantenix_data: true,
    transfers: true,
    edit_user: true,
    workload_adjustment: false,
    create_task: false,
    request_amendment: false,
  },
  shop_tl: {
    delete_task: false,
    delete_user: false,
    reopen_task: false,
    view_performance_metrics: true,
    view_engineer_workload: true,
    view_analytics: true,
    mantenix_data: true,
    transfers: true,
    edit_user: false,
    workload_adjustment: false,
    create_task: false,
    request_amendment: false,
  },
  shop_manager: {
    delete_task: false,
    delete_user: false,
    reopen_task: false,
    view_performance_metrics: true,
    view_engineer_workload: true,
    view_analytics: true,
    mantenix_data: true,
    transfers: true,
    edit_user: false,
    workload_adjustment: false,
    create_task: false,
    request_amendment: false,
  },
  engineer: {
    delete_task: false,
    delete_user: false,
    reopen_task: false,
    view_performance_metrics: true,
    view_engineer_workload: true,
    view_analytics: true,
    mantenix_data: false,
    transfers: false,
    edit_user: false,
    workload_adjustment: true,
    create_task: false,
    request_amendment: true,
  },
  customer_personnel: {
    delete_task: false,
    delete_user: false,
    reopen_task: false,
    view_performance_metrics: true,
    view_engineer_workload: false,
    view_analytics: true,
    mantenix_data: false,
    transfers: false,
    edit_user: false,
    workload_adjustment: false,
    create_task: true,
    request_amendment: true,
  },
  customer: {
    delete_task: false,
    delete_user: false,
    reopen_task: false,
    view_performance_metrics: false,
    view_engineer_workload: false,
    view_analytics: true,
    mantenix_data: false,
    transfers: false,
    edit_user: false,
    workload_adjustment: false,
    create_task: false,
    request_amendment: false,
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RolePermissionsManager() {
  const [matrix, setMatrix] = useState<PermissionMatrix>(DEFAULT_MATRIX);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // ✅ FIXED: Load from server API instead of localStorage
  useEffect(() => {
    loadMatrixFromServer();
  }, []);

  const loadMatrixFromServer = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.get('/role-permissions');
      const data = response.data || response;

      if (data && data.matrix) {
        // Merge server matrix with defaults to handle any missing keys
        const merged = { ...DEFAULT_MATRIX };
        for (const role of ROLES) {
          if (data.matrix[role.key]) {
            merged[role.key] = { ...DEFAULT_MATRIX[role.key], ...data.matrix[role.key] };
          }
        }
        setMatrix(merged);

        // SECURITY: update in-memory cache only (never localStorage) so the
        // useRolePermissions hook picks up the latest values.
        secureAuthStore.setRolePermissionsMatrix(merged);
      }
    } catch (err: any) {
      console.error('Failed to load role permissions from server:', err);
      // SECURITY: fallback now reads from the in-memory store, not
      // localStorage. If nothing is cached in memory we simply fall back to
      // the hard-coded DEFAULT_MATRIX.
      try {
        const mem = secureAuthStore.getRolePermissionsMatrix() as PermissionMatrix | null;
        if (mem) {
          const merged = { ...DEFAULT_MATRIX };
          for (const role of ROLES) {
            if (mem[role.key]) {
              merged[role.key] = { ...DEFAULT_MATRIX[role.key], ...mem[role.key] };
            }
          }
          setMatrix(merged);
        }
      } catch {
        // Ignore, use defaults
      }
      setError('Failed to load permissions from server. Showing cached/default values.');
    } finally {
      setLoading(false);
    }
  };

  // Toggle a single cell
  const handleToggle = (role: RoleKey, permission: PermissionKey, value: boolean) => {
    setMatrix((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [permission]: value,
      },
    }));
    setHasChanges(true);
    if (success) setSuccess(null);
    if (error) setError(null);
  };

  // ✅ FIXED: Save to server API instead of just localStorage
  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Save to server API (database) — this is the source of truth.
      await apiClient.put('/role-permissions', {
        matrix: matrix,
      });

      // SECURITY: update in-memory cache only for immediate local reactivity.
      // Never write the permission matrix to localStorage.
      secureAuthStore.setRolePermissionsMatrix(matrix);

      // Notify all useRolePermissions subscribers that the matrix changed.
      // This causes every component using the hook to re-render with updated permissions,
      // AND triggers a re-fetch from the server for the latest data.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(ROLE_PERMISSIONS_UPDATED_EVENT));
      }

      setSuccess('Role permissions saved successfully! Changes are now active across ALL browsers and PCs.');
      setHasChanges(false);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      console.error('Failed to save role permissions:', err);
      setError(err.message || 'Failed to save role permissions to server.');
    } finally {
      setSaving(false);
    }
  };

  // ✅ FIXED: Reset via server API instead of just setting defaults locally
  const handleReset = async () => {
    if (!confirm('Are you sure you want to reset all role permissions to their default values?')) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await apiClient.post('/role-permissions/reset');
      const data = response.data || response;

      if (data && data.matrix) {
        const merged = { ...DEFAULT_MATRIX };
        for (const role of ROLES) {
          if (data.matrix[role.key]) {
            merged[role.key] = { ...DEFAULT_MATRIX[role.key], ...data.matrix[role.key] };
          }
        }
        setMatrix(merged);
        // SECURITY: in-memory only — no localStorage write.
        secureAuthStore.setRolePermissionsMatrix(merged);
      } else {
        setMatrix(DEFAULT_MATRIX);
        // SECURITY: in-memory only — no localStorage write.
        secureAuthStore.setRolePermissionsMatrix(DEFAULT_MATRIX);
      }

      // Notify all subscribers
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(ROLE_PERMISSIONS_UPDATED_EVENT));
      }

      setSuccess('Role permissions reset to defaults successfully! Changes are active across ALL browsers and PCs.');
      setHasChanges(false);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      console.error('Failed to reset role permissions:', err);
      setError(err.message || 'Failed to reset role permissions.');
    } finally {
      setSaving(false);
    }
  };

  // Count enabled permissions per role
  const countEnabled = (role: RoleKey): number => {
    return PERMISSIONS.filter((p) => matrix[role][p.key]).length;
  };

  // Count roles that have a specific permission
  const countRolesWithPermission = (permission: PermissionKey): number => {
    return ROLES.filter((r) => matrix[r.key][permission]).length;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">Loading role permissions from server...</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-blue-600" />
            <div>
              <h2 className="text-lg font-semibold">Role-Based Access Control</h2>
              <p className="text-sm text-gray-500">
                Manage permissions for each role. Changes apply to all users with the respective role across all browsers and PCs.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={saving}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset Defaults
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !hasChanges}
            >
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{success}</AlertDescription>
          </Alert>
        )}

        {/* Info Banner */}
        <Alert className="border-blue-200 bg-blue-50">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Note:</strong> Admin and Director roles have separate, dedicated permission systems.
            This matrix controls permissions for the seven operational roles listed below.
            "View" permissions marked here grant access to the <em>individual's own</em> data unless the role
            inherently has broader access (e.g., Team Leader sees all team members).
            <br />
            <strong>Changes are saved to the server</strong> and take effect immediately across all browsers and PCs after saving.
          </AlertDescription>
        </Alert>

        {/* ─── Permission Matrix Table ─── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Permission Matrix</CardTitle>
            <CardDescription>
              Toggle switches to grant or revoke permissions for each role
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 min-w-[180px]">
                    Role
                  </th>
                  {PERMISSIONS.map((perm) => {
                    const Icon = perm.icon;
                    return (
                      <th key={perm.key} className="text-center py-3 px-3 font-semibold text-gray-700 min-w-[140px]">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex flex-col items-center gap-1 cursor-help">
                              <Icon className={`h-5 w-5 ${perm.iconColor}`} />
                              <span className="text-xs leading-tight">{perm.label}</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                {countRolesWithPermission(perm.key)}/{ROLES.length}
                              </Badge>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-xs">
                            <p className="font-medium">{perm.label}</p>
                            <p className="text-xs text-gray-400 mt-1">{perm.description}</p>
                          </TooltipContent>
                        </Tooltip>
                      </th>
                    );
                  })}
                  <th className="text-center py-3 px-3 font-semibold text-gray-700 min-w-[80px]">
                    Granted
                  </th>
                </tr>
              </thead>
              <tbody>
                {ROLES.map((role, idx) => {
                  const enabled = countEnabled(role.key);
                  const total = PERMISSIONS.length;
                  const allEnabled = enabled === total;
                  const noneEnabled = enabled === 0;

                  return (
                    <tr
                      key={role.key}
                      className={`border-b border-gray-100 transition-colors ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                      } hover:bg-blue-50/30`}
                    >
                      {/* Role name */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`text-xs font-medium ${role.color}`}
                          >
                            {role.label}
                          </Badge>
                        </div>
                      </td>

                      {/* Permission toggles */}
                      {PERMISSIONS.map((perm) => {
                        const isEnabled = matrix[role.key][perm.key];
                        return (
                          <td key={perm.key} className="text-center py-3 px-3">
                            <div className="flex items-center justify-center">
                              <Switch
                                checked={isEnabled}
                                onCheckedChange={(checked) =>
                                  handleToggle(role.key, perm.key, checked)
                                }
                                aria-label={`${role.label} - ${perm.label}`}
                              />
                            </div>
                          </td>
                        );
                      })}

                      {/* Count badge */}
                      <td className="text-center py-3 px-3">
                        <Badge
                          variant="outline"
                          className={`text-xs font-semibold ${
                            allEnabled
                              ? 'bg-green-50 text-green-700 border-green-200'
                              : noneEnabled
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                          }`}
                        >
                          {enabled}/{total}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* ─── Role Detail Cards ─── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {ROLES.map((role) => {
            const enabled = countEnabled(role.key);
            const total = PERMISSIONS.length;

            return (
              <Card key={role.key} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant="outline"
                      className={`text-xs font-medium ${role.color}`}
                    >
                      {role.label}
                    </Badge>
                    <span className="text-xs text-gray-500">
                      Level {role.level}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {PERMISSIONS.map((perm) => {
                      const isEnabled = matrix[role.key][perm.key];
                      const Icon = perm.icon;
                      return (
                        <div
                          key={perm.key}
                          className={`flex items-center justify-between py-1.5 px-2 rounded text-xs ${
                            isEnabled ? 'bg-green-50' : 'bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Icon
                              className={`h-3.5 w-3.5 ${
                                isEnabled ? perm.iconColor : 'text-gray-400'
                              }`}
                            />
                            <span
                              className={
                                isEnabled
                                  ? 'text-gray-800 font-medium'
                                  : 'text-gray-400'
                              }
                            >
                              {perm.label}
                            </span>
                          </div>
                          {isEnabled ? (
                            <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-gray-300" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 pt-2 border-t text-xs text-gray-500 text-center">
                    {enabled} of {total} permissions granted
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Unsaved changes indicator */}
        {hasChanges && (
          <div className="sticky bottom-4 flex justify-center">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 shadow-lg flex items-center gap-3">
              <Info className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-amber-800 font-medium">
                You have unsaved changes
              </span>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save Now
              </Button>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}