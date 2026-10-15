'use client';

import React, { useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Search, Filter, Info, Users, BarChart3 } from 'lucide-react';
import { getAllRoles } from '@/utils/roleUtils';
import { useAuth } from '@/lib/auth-context';
import UsersTable from './UsersTable';
import UserFormDialog from './UserFormDialog';
import ManagerDashboard from './ManagerDashboard';
import AdminDashboard from './AdminDashboard';

export default function UsersManager() {
  const auth: any = useAuth() || {};
  const currentUser = auth?.user;
  const currentUserRole = currentUser?.role?.toLowerCase() || '';
  const isShopTL = currentUserRole === 'shop_tl' || currentUserRole === 'shoptl';
  const isManager = currentUserRole === 'manager';
  const isAdmin = currentUserRole === 'admin';  // NEW: Admin check

  const [users, setUsers] = useState<any[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  
  const [openForm, setOpenForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [shopFilter, setShopFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  
  const [shops, setShops] = useState<any[]>([]);
  const [supervisors, setSupervisors] = useState<any[]>([]);
  const [managers, setManagers] = useState<any[]>([]);
  const [loadingDataForDialog, setLoadingDataForDialog] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    setLoadingDataForDialog(true);
    try {
      const response = await apiClient.get('/users');
      const allUsers = response.data || response || [];
      
      setUsers(allUsers);
      deriveSupervisorsAndManagers(allUsers);
    } catch (err: any) {
      console.error('Failed to load users:', err);
      setError('Failed to load users. Please try again.');
      setUsers([]);
      setSupervisors([]);
      setManagers([]);
    } finally {
      setLoading(false);
      setLoadingDataForDialog(false);
    }
  };

  const deriveSupervisorsAndManagers = (allUsers: any[]) => {
    try {
      const supervisorRoles = ['team_leader', 'director', 'shop_tl'];
      const potentialSupervisors = (allUsers || []).filter((user: any) =>
        supervisorRoles.includes(user.role)
      );
      setSupervisors(potentialSupervisors);

      const managerRoles = ['manager', 'director'];
      const potentialManagers = (allUsers || []).filter((user: any) =>
        managerRoles.includes(user.role)
      );
      setManagers(potentialManagers);
    } catch (err) {
      console.warn('Failed to derive supervisors/managers:', err);
      setSupervisors([]);
      setManagers([]);
    }
  };

  const loadShopTLDashboard = async () => {
    if (!isShopTL || !currentUser?.user_id) return;
    
    setDashboardLoading(true);
    try {
      const response = await apiClient.get(`/users/shop-tl-dashboard/${currentUser.user_id}`);
      setDashboardData(response.data);
    } catch (err: any) {
      console.warn('Failed to load shop TL dashboard:', err);
    } finally {
      setDashboardLoading(false);
    }
  };

  const loadShops = async () => {
    try {
      const response = await apiClient.get('/shops');
      const raw = response.data ?? response ?? [];
      setShops(raw);
    } catch (err) {
      console.warn('Failed to load shops:', err);
      setShops([]);
    }
  };

  const applyFilters = () => {
    let filtered = [...users];

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(user =>
        (user.full_name || user.fullName || '').toLowerCase().includes(term) ||
        (user.username || '').toLowerCase().includes(term) ||
        (user.email || '').toLowerCase().includes(term)
      );
    }

    if (roleFilter) {
      filtered = filtered.filter(user => user.role === roleFilter);
    }

    if (shopFilter && !isShopTL) {
      if (shopFilter === 'no-shop') {
        filtered = filtered.filter(user => !user.shop_id && !user.shopId);
      } else {
        filtered = filtered.filter(user => 
          String(user.shop_id || user.shopId) === shopFilter
        );
      }
    }

    if (statusFilter) {
      const isActive = statusFilter === 'active';
      filtered = filtered.filter(user => 
        (user.is_active ?? user.isActive ?? true) === isActive
      );
    }

    setFilteredUsers(filtered);
  };

  useEffect(() => {
    loadUsers();
    loadShops();
    if (isShopTL) {
      loadShopTLDashboard();
    }
  }, [isShopTL]);

  useEffect(() => {
    applyFilters();
  }, [users, searchTerm, roleFilter, shopFilter, statusFilter]);

  useEffect(() => {
    deriveSupervisorsAndManagers(users);
  }, [users]);

  // NEW: Admin view - Show AdminDashboard
  if (isAdmin) {
    return <AdminDashboard />;
  }

  // Manager view: Show dashboard instead of user list
  if (isManager) {
    return <ManagerDashboard />;
  }

  const handleCreateClick = () => {
    setEditingUser(null);
    setOpenForm(true);
  };

  const handleEdit = (user: any) => {
    if (isShopTL) {
      const userCreatedBy = user.created_by_user_id ?? user.createdByUserId;
      const userRole = (user.role || '').toLowerCase();
      const currentUserId = currentUser?.user_id || currentUser?.userId;
      
      if (userCreatedBy !== currentUserId || userRole !== 'customer_personnel') {
        setError('You can only edit Customer Personnel you have created.');
        return;
      }
    }
    
    setEditingUser(user);
    setOpenForm(true);
  };

  const handleUserSaved = () => {
    loadUsers();
    if (isShopTL) {
      loadShopTLDashboard();
    }
    setOpenForm(false);
  };

  const handleDelete = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    
    try {
      await apiClient.delete(`/users/${userId}`);
      loadUsers();
      if (isShopTL) {
        loadShopTLDashboard();
      }
    } catch (err: any) {
      console.error('Failed to delete user:', err);
      alert('Failed to delete user. Please try again.');
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setRoleFilter('');
    setShopFilter('');
    setStatusFilter('');
  };

  const getShopName = (shopId: number | null) => {
    if (!shopId) return 'No Shop';
    const shop = shops.find(s => (s.shop_id || s.id) === shopId);
    return shop ? shop.name : `Shop ${shopId}`;
  };

  const getCurrentUserShopName = () => {
    const currentUserShopId = currentUser?.shopId || currentUser?.shop_id;
    if (!currentUserShopId) return 'No Shop Assigned';
    return getShopName(currentUserShopId);
  };

  const getFilterRoles = () => {
    if (isShopTL) {
      return [{ value: 'customer_personnel', label: 'Customer Personnel' }];
    }
    return getAllRoles();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading users...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Users className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold">
            {isShopTL ? `Manage Shop Users - ${getCurrentUserShopName()}` : 'Manage Users'}
          </h1>
        </div>

        <Button onClick={handleCreateClick}>
          <Plus className="h-4 w-4 mr-2" />
          {isShopTL ? 'Create Technicians,Tools Clerk and Warranty Officer' : 'Create New User'}
        </Button>
      </div>

      {/* Shop TL Dashboard */}
      {isShopTL && dashboardData && (
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center space-x-2 mb-4">
            <BarChart3 className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Your Shop Dashboard</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{dashboardData.totalCreatedUsers || 0}</div>
              <div className="text-sm text-blue-800">Users Created</div>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{dashboardData.totalActiveTasks || 0}</div>
              <div className="text-sm text-orange-800">Active Tasks</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{dashboardData.totalCompletedTasks || 0}</div>
              <div className="text-sm text-green-800">Completed Tasks</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">
                {dashboardData.totalActiveTasks + dashboardData.totalCompletedTasks || 0}
              </div>
              <div className="text-sm text-purple-800">Total Tasks</div>
            </div>
          </div>
        </div>
      )}

      {/* Shop TL Information */}
      {isShopTL && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Shop Team Leader Permissions:</strong>
            <ul className="mt-2 space-y-1 text-sm">
              <li>• You can only view and manage Technicians,Tools Clerk and Warranty Officer you have created</li>
              <li>• You can create new Technicians,Tools Clerk and Warranty Officer (they will be automatically assigned to your shop and manager)</li>
              <li>• You can edit user details but cannot change their role or shop assignment</li>
              <li>• You cannot delete any users</li>
              <li>• Tasks created by users you created will appear in your task lists</li>
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg border space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="h-4 w-4" />
          <span className="font-medium">Filters</span>
          <Button variant="outline" size="sm" onClick={clearFilters}>
            Clear All
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="space-y-2">
            <Label>Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search name, username, email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Role Filter */}
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All roles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {getFilterRoles().map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    {role.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Shop Filter - Only show if not shop_tl */}
          {!isShopTL && (
            <div className="space-y-2">
              <Label>Shop</Label>
              <Select value={shopFilter} onValueChange={setShopFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All shops" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All shops</SelectItem>
                  <SelectItem value="no-shop">No Shop</SelectItem>
                  {shops.map((shop) => (
                    <SelectItem key={shop.shop_id || shop.id} value={String(shop.shop_id || shop.id)}>
                      {shop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Status Filter */}
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <UsersTable
        users={filteredUsers}
        onEdit={handleEdit}
        onDelete={handleDelete}
        shops={shops}
      />

      {/* User Form Dialog */}
      <UserFormDialog
        open={openForm}
        onOpenChange={setOpenForm}
        userToEdit={editingUser}
        onSaved={handleUserSaved}

        shops={shops}
        supervisors={supervisors}
        managers={managers}
        parentLoadingData={loadingDataForDialog}
      />
    </div>
  );
}