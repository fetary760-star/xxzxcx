'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useTimezone } from '@/lib/timezone-context';
import { BarChart3, Users, CheckCircle, Clock, AlertTriangle, TrendingUp, Building2, Briefcase, Wrench } from 'lucide-react';
import apiClient from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface ManagerSummary {
  userId: number;
  fullName: string;
  username: string;
  email: string;
  managedShopTeamLeaders: number;
  totalManagedUsers: number;
  activeTasks: number;
  completedTasks: number;
  completionRate: number;
  isActive: boolean;
}

interface DepartmentSummary {
  departmentId: number;
  departmentName: string;
  description?: string;
  managers: ManagerSummary[];
  totalManagers: number;
  totalUsers: number;
  totalShopTeamLeaders: number;
  activeTasks: number;
  completedTasks: number;
  isActive: boolean;
  createdAt: string;
}

interface TaskSummary {
  taskId: number;
  description: string;
  status: string;
  createdByName: string;
  createdAt: string;
  categoryName?: string;
  priorityName?: string;
  targetCompletionDate?: string;
}

interface DirectorDashboardData {
  directorUserId: number;
  directorName: string;
  departments: DepartmentSummary[];
  totalDepartments: number;
  totalManagers: number;
  totalShopTeamLeaders: number;
  totalUsers: number;
  totalActiveTasks: number;
  totalCompletedTasks: number;
  totalPendingTasks: number;
  overallCompletionRate: number;
  recentTasks: TaskSummary[];
}

export default function DirectorDashboard() {
  const { user } = useAuth();
  const { formatDate } = useTimezone();
  const [dashboardData, setDashboardData] = useState<DirectorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  const loadDashboardData = async () => {
    if (!user?.userId && !user?.user_id) {
      setError('User ID not found');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const userId = user.userId || user.user_id;
      const response = await apiClient.get(`/directors/${userId}/dashboard`);
      const data = response.data || response;
      
      //('Director dashboard data loaded:', data);
      setDashboardData(data);
    } catch (err: any) {
      console.error('Failed to load director dashboard:', err);
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (!dashboardData) {
    return (
      <Alert>
        <AlertDescription>No dashboard data available</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Director Dashboard</h1>
          <p className="text-gray-600 mt-1">Welcome back, {dashboardData.directorName}</p>
        </div>
        <BarChart3 className="h-8 w-8 text-blue-600" />
      </div>

      {/* Overall Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Departments */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Departments</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dashboardData.totalDepartments}</div>
            <p className="text-xs text-muted-foreground">Departments under your supervision</p>
          </CardContent>
        </Card>

        {/* Total Managers */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Managers</CardTitle>
            <Briefcase className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{dashboardData.totalManagers}</div>
            <p className="text-xs text-muted-foreground">Managers across all departments</p>
          </CardContent>
        </Card>

        {/* Total Shop Team Leaders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Shop Team Leaders</CardTitle>
            <Wrench className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{dashboardData.totalShopTeamLeaders}</div>
            <p className="text-xs text-muted-foreground">Shop TLs in your organization</p>
          </CardContent>
        </Card>

        {/* Total Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{dashboardData.totalUsers}</div>
            <p className="text-xs text-muted-foreground">All users in your scope</p>
          </CardContent>
        </Card>

        {/* Active Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Tasks</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{dashboardData.totalActiveTasks}</div>
            <p className="text-xs text-muted-foreground">Currently in progress</p>
          </CardContent>
        </Card>

        {/* Completed Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Tasks</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{dashboardData.totalCompletedTasks}</div>
            <p className="text-xs text-muted-foreground">Successfully finished</p>
          </CardContent>
        </Card>

        {/* Pending Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Tasks</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{dashboardData.totalPendingTasks}</div>
            <p className="text-xs text-muted-foreground">Awaiting action</p>
          </CardContent>
        </Card>

        {/* Completion Rate */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{dashboardData.overallCompletionRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Overall performance</p>
          </CardContent>
        </Card>
      </div>

      {/* Departments Section */}
      <Card>
        <CardHeader>
          <CardTitle>Departments Overview</CardTitle>
          <CardDescription>Performance metrics for each department</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {dashboardData.departments.map((dept) => (
              <div key={dept.departmentId} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-lg">{dept.departmentName}</h3>
                    {dept.description && (
                      <p className="text-sm text-gray-600">{dept.description}</p>
                    )}
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    dept.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {dept.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                  <div className="bg-blue-50 p-3 rounded">
                    <div className="text-xl font-bold text-blue-600">{dept.totalManagers}</div>
                    <div className="text-xs text-blue-800">Managers</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded">
                    <div className="text-xl font-bold text-green-600">{dept.totalShopTeamLeaders}</div>
                    <div className="text-xs text-green-800">Shop TLs</div>
                  </div>
                  <div className="bg-purple-50 p-3 rounded">
                    <div className="text-xl font-bold text-purple-600">{dept.totalUsers}</div>
                    <div className="text-xs text-purple-800">Total Users</div>
                  </div>
                  <div className="bg-orange-50 p-3 rounded">
                    <div className="text-xl font-bold text-orange-600">{dept.activeTasks}</div>
                    <div className="text-xs text-orange-800">Active Tasks</div>
                  </div>
                  <div className="bg-green-50 p-3 rounded">
                    <div className="text-xl font-bold text-green-600">{dept.completedTasks}</div>
                    <div className="text-xs text-green-800">Completed</div>
                  </div>
                </div>

                {/* Managers in this department */}
                {dept.managers.length > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <h4 className="text-sm font-semibold mb-2">Managers ({dept.totalManagers})</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {dept.managers.map((manager) => (
                        <div key={manager.userId} className="bg-gray-50 p-2 rounded text-sm">
                          <div className="font-medium">{manager.fullName}</div>
                          <div className="text-xs text-gray-600">
                            {manager.totalManagedUsers} users • {manager.managedShopTeamLeaders} Shop TLs
                          </div>
                          <div className="text-xs text-gray-600">
                            {manager.completedTasks} completed • {manager.completionRate.toFixed(1)}% rate
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Tasks */}
      {dashboardData.recentTasks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent Tasks</CardTitle>
            <CardDescription>Latest 10 tasks from your departments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {dashboardData.recentTasks.map((task) => (
                <div key={task.taskId} className="flex items-center justify-between p-3 bg-gray-50 rounded hover:bg-gray-100 transition-colors">
                  <div className="flex-1">
                    <div className="font-medium">{task.description}</div>
                    <div className="text-sm text-gray-600">
                      {task.categoryName && <span className="mr-2">📁 {task.categoryName}</span>}
                      {task.priorityName && <span className="mr-2">🎯 {task.priorityName}</span>}
                      Created by {task.createdByName} • {formatDate(task.createdAt)}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ml-3 ${
                    task.status === 'Completed' ? 'bg-green-100 text-green-800' :
                    task.status === 'InProgress' || task.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                    task.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {task.status}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}