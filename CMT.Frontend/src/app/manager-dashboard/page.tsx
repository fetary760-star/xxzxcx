'use client';

import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatRoleForDisplay } from '@/utils/roleUtils';
import { Loader2, Users, Building2, CheckCircle, Clock, TrendingUp, Eye, Edit } from 'lucide-react';
import { ManagerDashboard, User, Shop, TaskSummary } from '@/lib/models';

export default function ManagerDashboardPage() {
  const { user: currentUser } = useAuth();
  const [dashboard, setDashboard] = useState<ManagerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentUserId = currentUser?.userId || currentUser?.id;
  const currentUserRole = currentUser?.role?.toLowerCase();

  useEffect(() => {
    if (currentUserRole !== 'manager') {
      setError('Access denied. This page is only available to managers.');
      setLoading(false);
      return;
    }

    if (!currentUserId) {
      setError('User ID not found');
      setLoading(false);
      return;
    }

    loadDashboard();
  }, [currentUserId, currentUserRole]);

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/users/manager-dashboard/${currentUserId}`, {
        credentials: 'same-origin'
      });

      if (!response.ok) {
        throw new Error(`Failed to load dashboard: ${response.status}`);
      }

      const data = await response.json();
      setDashboard(data);
    } catch (err: any) {
      console.error('Failed to load manager dashboard:', err);
      setError(err?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleViewUser = (userId: string | number) => {
    window.location.href = `/employee_management?user_id=${userId}`;
  };

  const handleEditUser = (userId: string | number) => {
    window.location.href = `/employee_management?edit_user=${userId}`;
  };

  if (currentUserRole !== 'manager') {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-red-600 mb-2">Access Denied</h2>
            <p className="text-gray-600">This page is only available to managers.</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p>Loading manager dashboard...</p>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (error) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-red-600 mb-2">Error</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <Button onClick={loadDashboard}>Try Again</Button>
          </div>
        </div>
      </MainLayout>
    );
  }

  if (!dashboard) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <p>No dashboard data available</p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Manager Dashboard</h1>
            <p className="text-gray-600">Welcome back, {dashboard.manager_name}</p>
          </div>
          <Button onClick={loadDashboard} variant="outline">
            <TrendingUp className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Managed Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard.total_managed_users}</div>
              <p className="text-xs text-muted-foreground">
                Team Leaders, Shop TLs, Engineers
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Managed Shops</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard.total_managed_shops}</div>
              <p className="text-xs text-muted-foreground">
                Under your supervision
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard.total_active_tasks}</div>
              <p className="text-xs text-muted-foreground">
                In progress
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed Tasks</CardTitle>
              <CheckCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{dashboard.total_completed_tasks}</div>
              <p className="text-xs text-muted-foreground">
                Total completed
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Managed Users */}
          <Card>
            <CardHeader>
              <CardTitle>Managed Users</CardTitle>
              <CardDescription>
                Users under your management
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard.managed_users.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No managed users found</p>
              ) : (
                <div className="space-y-3">
                  {dashboard.managed_users.slice(0, 10).map((user) => (
                    <div key={user.user_id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                          <span className="text-sm font-medium">
                            {(user.full_name || 'U').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium">{user.full_name}</p>
                          <div className="flex items-center space-x-2">
                            <Badge variant="secondary">
                              {formatRoleForDisplay(user.role)}
                            </Badge>
                            {user.shop_name && (
                              <span className="text-xs text-gray-500">{user.shop_name}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewUser(user.user_id)}
                          title="View user"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditUser(user.user_id)}
                          title="Edit user"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {dashboard.managed_users.length > 10 && (
                    <p className="text-sm text-gray-500 text-center">
                      And {dashboard.managed_users.length - 10} more users...
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Managed Shops */}
          <Card>
            <CardHeader>
              <CardTitle>Managed Shops</CardTitle>
              <CardDescription>
                Shops under your supervision
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dashboard.managed_shops.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No managed shops found</p>
              ) : (
                <div className="space-y-3">
                  {dashboard.managed_shops.map((shop) => (
                    <div key={shop.shop_id} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{shop.shop_name}</p>
                          <p className="text-sm text-gray-500">{shop.description}</p>
                        </div>
                        <Badge variant={shop.is_active ? 'default' : 'secondary'}>
                          {shop.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </div>
                      {shop.team_leader_name && (
                        <p className="text-xs text-gray-600 mt-1">
                          Team Leader: {shop.team_leader_name}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Tasks */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Tasks</CardTitle>
            <CardDescription>
              Latest tasks from your managed users
            </CardDescription>
          </CardHeader>
          <CardContent>
            {dashboard.recent_tasks.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No recent tasks found</p>
            ) : (
              <div className="space-y-3">
                {dashboard.recent_tasks.map((task) => (
                  <div key={task.task_id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <p className="font-medium">{task.description}</p>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge variant="outline">{task.status}</Badge>
                        <span className="text-xs text-gray-500">by {task.created_by_name}</span>
                        {task.category_name && (
                          <span className="text-xs text-gray-500">• {task.category_name}</span>
                        )}
                        {task.priority_name && (
                          <span className="text-xs text-gray-500">• {task.priority_name}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">
                        {new Date(task.created_at).toLocaleDateString()}
                      </p>
                      {task.completed_at && (
                        <p className="text-xs text-green-600">
                          Completed: {new Date(task.completed_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Task Status Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle>Task Status Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(dashboard.task_status_breakdown).length === 0 ? (
                <p className="text-gray-500 text-center py-4">No task data available</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(dashboard.task_status_breakdown).map(([status, count]) => (
                    <div key={status} className="flex items-center justify-between">
                      <span className="capitalize">{status.replace('_', ' ')}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Role Distribution */}
          <Card>
            <CardHeader>
              <CardTitle>Role Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(dashboard.role_distribution).length === 0 ? (
                <p className="text-gray-500 text-center py-4">No role data available</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(dashboard.role_distribution).map(([role, count]) => (
                    <div key={role} className="flex items-center justify-between">
                      <span>{formatRoleForDisplay(role)}</span>
                      <Badge variant="outline">{count}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}