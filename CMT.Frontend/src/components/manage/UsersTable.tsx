'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRolePermissions } from '@/hooks/useRolePermissions';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatRoleForDisplay } from '@/utils/roleUtils';
import { getCsrfToken } from '@/lib/csrf';
import { Loader2, Edit, Trash2, Eye, Search, X, AlertCircle, AlertTriangle } from 'lucide-react';
import { secureAuthStore } from '@/lib/secure-auth-store'

type User = {
  user_id?: number;
  userId?: number;
  id?: number;
  full_name?: string;
  fullName?: string;
  username?: string;
  email?: string;
  role?: string;
  shop_id?: number | null;
  shopId?: number | null;
  shop_name?: string | null;
  shopName?: string | null;
  is_active?: boolean;
  isActive?: boolean;
  created_by_user_id?: number | null;
  createdByUserId?: number | null;
  created_by_user_name?: string | null;
  createdByUserName?: string | null;
  active_tasks_count?: number;
  activeTasksCount?: number;
  completed_tasks_count?: number;
  completedTasksCount?: number;
  [k: string]: any;
};

interface UsersTableProps {
  users?: User[];
  onEdit?: (user: User) => void;
  onDelete?: (userId: number) => void;
  shops?: Array<{ id?: number; shop_id?: number; name?: string }>;
}

/** Extract a reliable numeric user ID from any of the known property names */
function extractUserId(user: User): number | undefined {
  const raw = user.user_id ?? user.userId ?? user.id;
  if (raw === undefined || raw === null) return undefined;
  const num = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  return isNaN(num) || num <= 0 ? undefined : num;
}

export default function UsersTable({ users, onEdit, onDelete, shops = [] }: UsersTableProps) {
  const auth: any = useAuth() || {};
  const { canDeleteUser: matrixCanDeleteUser, canEditUser: matrixCanEditUser, isPrivilegedRole } = useRolePermissions();
  const [internalUsers, setInternalUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noShopWarning, setNoShopWarning] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const currentUserRole = (auth?.user?.role || '').toLowerCase();
  const isShopManager = currentUserRole === 'shop_manager' || currentUserRole === 'minimanager';
  const isShopTL = currentUserRole === 'shop_tl' || currentUserRole === 'shoptl';
  const isManager = currentUserRole === 'manager';
  const isTeamLeader = currentUserRole === 'team_leader';
  const isDirector = currentUserRole === 'director';
  const currentUserId = auth?.user?.user_id || auth?.user?.userId;
  const currentUserShopId = auth?.user?.shop_id || auth?.user?.shopId;

  useEffect(() => {
    if (users) {
      setInternalUsers(users);
      setFilteredUsers(users);
    } else {
      loadUsers();
    }
  }, [users]);

  // Apply search filter whenever searchTerm or internalUsers changes
  useEffect(() => {
    applySearchFilter();
  }, [searchTerm, internalUsers]);

  async function buildHeaders(includeCsrf: boolean = false) {
    const token = auth?.token ?? auth?.accessToken ?? secureAuthStore.getToken();
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = token.startsWith('Bearer') ? token : `Bearer ${token}`;
    
    // Include CSRF token for mutation requests (POST, PUT, DELETE)
    if (includeCsrf) {
      try {
        const csrfToken = await getCsrfToken();
        if (csrfToken) {
          headers['X-CSRF-Token'] = csrfToken;
          headers['X-Requested-With'] = 'XMLHttpRequest';
        }
      } catch {
        // CSRF token fetch failed, continue without it
      }
    }
    
    return headers;
  }

  async function loadUsers() {
    if (users) return;
    
    setLoading(true);
    setError(null);
    setNoShopWarning(false);
    try {
      const headers = await buildHeaders();
      const res = await fetch('/api/management/users', { method: 'GET', headers, credentials: 'include' });
      if (!res.ok) {
        // Check if this is a "no shop assigned" scenario for shop_manager
        if (res.status === 403 && isShopManager) {
          try {
            const errData = await res.json();
            const msg = errData?.message || errData?.error || '';
            if (msg.toLowerCase().includes('shop') || msg.toLowerCase().includes('assigned')) {
              setNoShopWarning(true);
              setInternalUsers([]);
              setFilteredUsers([]);
              return;
            }
          } catch {
            // ignore parse error
          }
        }
        throw new Error(`Request failed: ${res.status} ${res.statusText}`);
      }
      const json = await res.json();
      const list = Array.isArray(json) ? json : json?.data ?? [];
      
      // If shop_manager gets an empty list, check if they have no shop
      if (isShopManager && list.length === 0 && !currentUserShopId) {
        setNoShopWarning(true);
      }
      
      setInternalUsers(list);
      setFilteredUsers(list);
    } catch (err: any) {
      console.error('Failed to fetch users:', err);
      setError('Failed to load users. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function applySearchFilter() {
    if (!searchTerm.trim()) {
      setFilteredUsers(internalUsers);
      return;
    }

    const term = searchTerm.toLowerCase().trim();
    const filtered = internalUsers.filter(user => {
      const fullName = (user.full_name || user.fullName || '').toLowerCase();
      const username = (user.username || '').toLowerCase();
      const email = (user.email || '').toLowerCase();
      const role = (user.role || '').toLowerCase();
      const shopName = (user.shop_name || user.shopName || '').toLowerCase();
      
      return fullName.includes(term) || 
             username.includes(term) || 
             email.includes(term) ||
             role.includes(term) ||
             shopName.includes(term);
    });

    setFilteredUsers(filtered);
  }

  function clearSearch() {
    setSearchTerm('');
  }

  async function handleDelete(user: User) {
    const userId = extractUserId(user);
    if (!userId) {
      setError('Cannot delete user: Unable to determine user ID.');
      return;
    }
    
    // Use the admin-configured role permissions matrix instead of hardcoded role checks.
    // Admin and Director always bypass the matrix (handled in useRolePermissions hook).
    if (!matrixCanDeleteUser) {
      setError('You do not have permission to delete users. Contact your administrator.');
      return;
    }
    
    const userName = user.full_name ?? user.fullName ?? user.username ?? 'user';
    if (!confirm(`Are you sure you want to delete user "${userName}"? This action cannot be undone.`)) return;
    
    setBusy(true);
    setError(null);
    setDeleteSuccess(null);
    try {
      if (onDelete) {
        await onDelete(userId);
        setDeleteSuccess(`User "${userName}" has been deleted successfully.`);
      } else {
        // Build headers with CSRF token for DELETE mutation
        const headers = await buildHeaders(true);
        
        // If admin has granted delete_user permission via the role matrix,
        // inform the API route so it can bypass default role restrictions
        if (matrixCanDeleteUser) {
          headers['x-permission-granted'] = 'delete_user';
        }
        
        const res = await fetch(`/api/management/users?id=${encodeURIComponent(userId)}`, {
          method: 'DELETE',
          headers,
          credentials: 'include',
        });
        
        if (!res.ok) {
          let errorMessage = 'Delete failed';
          try {
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              const errorData = await res.json();
              errorMessage = errorData.message || errorData.error || `Delete failed with status ${res.status}`;
            } else {
              const text = await res.text();
              errorMessage = text || `Delete failed: ${res.status} ${res.statusText}`;
            }
          } catch {
            errorMessage = `Delete failed: ${res.status} ${res.statusText}`;
          }
          throw new Error(errorMessage);
        }
        
        setDeleteSuccess(`User "${userName}" has been deleted successfully.`);
        
        // Refresh the users list after successful deletion
        await loadUsers();
      }
      
      // Auto-clear success message after 5 seconds
      setTimeout(() => setDeleteSuccess(null), 5000);
    } catch (err: any) {
      console.error('Delete failed:', err);
      setError('Delete failed: ' + (err?.message ?? 'Unknown error occurred'));
    } finally {
      setBusy(false);
    }
  }

  function getShopName(shopId: number | null | undefined, user?: User): string {
    const explicitName = user?.shop_name ?? user?.shopName;
    if (explicitName) return formatShopDisplay(explicitName);

    if (!shopId) return 'No Shop';
    const shop = shops.find(s => (s.shop_id || s.id) === shopId);
    return shop ? formatShopDisplay(shop.name ?? '') : `Shop ${shopId}`;
  }

  function formatShopDisplay(rawName?: string | null) {
    if (!rawName) return 'No Shop';
    const parts = rawName.split(',').map(p => p.trim()).filter(Boolean);
    const titled = parts.map(p => p.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
    return titled.join(', ');
  }

  function getUserStatus(user: User): 'active' | 'inactive' {
    const isActive = user.is_active ?? user.isActive ?? true;
    return isActive ? 'active' : 'inactive';
  }

  // CRITICAL FIX: Enhanced permission checks using the admin-configured role permission matrix.
  // The matrix `edit_user` permission acts as a gate: if the admin has NOT granted `edit_user`
  // for this role, the user cannot edit anyone. If granted, the original scope rules still apply
  // (e.g., Shop TL can only edit customer_personnel they created).
  function canEditUser(user: User): boolean {
    // Admin and Director always have full permissions (bypass matrix)
    if (isPrivilegedRole) return true;
    
    // If the matrix does NOT grant edit_user for this role, deny editing
    if (!matrixCanEditUser) return false;
    
    // Team Leader can edit users (but not delete)
    if (isTeamLeader) return true;
    
    // Shop TL can only edit customer_personnel they created
    if (isShopTL) {
      const userCreatedBy = user.created_by_user_id ?? user.createdByUserId;
      const userRole = (user.role || '').toLowerCase();
      return userCreatedBy === currentUserId && userRole === 'customer_personnel';
    }
    
    // Shop Manager can edit users they created
    if (isShopManager) {
      const userCreatedBy = user.created_by_user_id ?? user.createdByUserId;
      return userCreatedBy === currentUserId;
    }
    
    // Manager can only edit shop_tl they manage
    if (isManager) {
      const userManagerId = user.manager_id ?? user.managerId;
      const userRole = (user.role || '').toLowerCase();
      return userManagerId === currentUserId && userRole === 'shop_tl';
    }
    
    return false;
  }

  function canDeleteUser(user: User): boolean {
    // Use the admin-configured role permissions matrix.
    // Admin and Director always have full permissions (bypassed in the hook).
    // Other roles are controlled by the RolePermissionsManager matrix.
    return matrixCanDeleteUser;
  }

  function isViewOnly(user: User): boolean {
    return !canEditUser(user);
  }

  const displayUsers = filteredUsers;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading users...</span>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* No Shop Assigned Warning for Shop Manager */}
      {noShopWarning && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-4">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-amber-600 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-amber-800">No Shop Assigned</h3>
              <p className="text-sm text-amber-700 mt-1">
                You are not currently assigned to any shop. To manage users and create new users, 
                you must first be assigned to a shop by your administrator or manager.
              </p>
              <p className="text-sm text-amber-600 mt-1">
                Please contact your administrator to get assigned to a shop.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Banner - shown above table, dismissible */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-sm text-red-800">
              <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-600 hover:text-red-800 ml-4"
              title="Dismiss error"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Success Banner - shown above table after successful delete */}
      {deleteSuccess && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center text-sm text-green-800">
              <svg className="h-4 w-4 mr-2 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>{deleteSuccess}</span>
            </div>
            <button
              onClick={() => setDeleteSuccess(null)}
              className="text-green-600 hover:text-green-800 ml-4"
              title="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Permission Information Banner */}
      <div className="bg-blue-50 border-b border-blue-200 px-6 py-3">
        <div className="text-sm text-blue-800">
          <strong>Your Permissions:</strong>
          {isPrivilegedRole && ' You can edit and delete all users (admin/director privileges).'}
          {!isPrivilegedRole && matrixCanDeleteUser && ` You can edit users and delete users (granted by admin).`}
          {!isPrivilegedRole && !matrixCanDeleteUser && isTeamLeader && ' You can edit users but cannot delete them. Contact admin to change permissions.'}
          {!isPrivilegedRole && !matrixCanDeleteUser && isShopTL && ' You can only edit Customer Personnel (Technician, Tools Clerk, or Warranty Officer) you have created. You cannot delete any users.'}
          {!isPrivilegedRole && !matrixCanDeleteUser && isManager && ' You can only edit Shop Team Leaders and Customer Personnel (Technician and Tools Clerk) you manage. You cannot delete any users.'}
          {!isPrivilegedRole && !matrixCanDeleteUser && isShopManager && ` You can create and edit Customer Personnel, Engineers, and Customers for your shop${currentUserShopId ? '' : ' (No Shop Assigned)'}. You cannot delete any users.`}
        </div>
      </div>

      {/* Search Box with Moderation */}
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search by name, username, email, role, or shop..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-10"
            />
            {searchTerm && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                title="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="text-sm text-gray-600">
            {displayUsers.length} {displayUsers.length === 1 ? 'user' : 'users'} found
          </div>
        </div>
      </div>
      
      {displayUsers.length === 0 ? (
        <div className="text-center p-8 text-gray-500">
          {noShopWarning ? (
            'No users to display. You need to be assigned to a shop first.'
          ) : searchTerm ? (
            <>
              No users found matching &quot;{searchTerm}&quot;. 
              <button onClick={clearSearch} className="ml-2 text-blue-600 hover:underline">
                Clear search
              </button>
            </>
          ) : (
            isShopTL 
              ? `No users found in your shop or created by you`
              : isShopManager
                ? 'No users found. Users you create will appear here.'
                : 'No users found'
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Username
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Shop Name
                </th>
                {isShopTL && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tasks
                  </th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {displayUsers.map((user, idx) => {
                const userId = extractUserId(user) ?? idx;
                const fullName = user.full_name ?? user.fullName ?? 'N/A';
                const username = user.username ?? 'N/A';
                const email = user.email ?? 'N/A';
                const role = user.role ?? 'N/A';
                const shopId = user.shop_id ?? user.shopId ?? null;
                const status = getUserStatus(user);
                const canEdit = canEditUser(user);
                const canDelete = canDeleteUser(user);
                const viewOnly = isViewOnly(user);
                const activeTasks = user.active_tasks_count ?? user.activeTasksCount ?? 0;
                const completedTasks = user.completed_tasks_count ?? user.completedTasksCount ?? 0;
                const shopDisplay = getShopName(shopId, user);

                return (
                  <tr key={userId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 flex items-center justify-center">
                            <span className="text-sm font-medium text-gray-700">
                              {String(fullName).charAt(0).toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{fullName}</div>
                          <div className="text-xs text-gray-500">{user.created_by_user_name ?? user.createdByUserName ?? ''}</div>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {username}
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{email}</div>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant="secondary">
                        {formatRoleForDisplay(role)}
                      </Badge>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {shopDisplay}
                    </td>

                    {isShopTL && (
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div className="flex flex-col space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              Active: {activeTasks}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2">
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              Completed: {completedTasks}
                            </span>
                          </div>
                        </div>
                      </td>
                    )}

                    <td className="px-6 py-4 whitespace-nowrap">
                      <Badge variant={status === 'active' ? 'default' : 'destructive'}>
                        {status === 'active' ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>

                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEdit?.(user)}
                            disabled={busy}
                            title="Edit user"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        {viewOnly && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled
                            title="View only - you don't have permission to edit this user"
                          >
                            <Eye className="h-4 w-4 text-gray-400" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(user)}
                            disabled={busy}
                            className="text-red-600 hover:text-red-700"
                            title="Delete user"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Spacer when user cannot delete and is not in view-only mode */}
                        {!canDelete && !viewOnly && (
                          <span className="w-10"></span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}