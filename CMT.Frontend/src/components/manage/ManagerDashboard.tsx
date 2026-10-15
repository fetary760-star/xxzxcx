'use client';

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { BarChart3, Users, CheckCircle, Clock, AlertTriangle, TrendingUp } from 'lucide-react';
import apiClient from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface DashboardStats {
  totalEngineers: number;
  totalTasks: number;
  completedTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  blockedTasks: number;
  totalShops: number;
  activeUsers: number;
}

export default function ManagerDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalEngineers: 0,
    totalTasks: 0,
    completedTasks: 0,
    pendingTasks: 0,
    inProgressTasks: 0,
    blockedTasks: 0,
    totalShops: 0,
    activeUsers: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch dashboard statistics from the API
      const response = await apiClient.get('/manager/dashboard');
      const data = response.data || response;
      
      setStats({
        totalEngineers: data.totalEngineers || 0,
        totalTasks: data.totalTasks || 0,
        completedTasks: data.completedTasks || 0,
        pendingTasks: data.pendingTasks || 0,
        inProgressTasks: data.inProgressTasks || 0,
        blockedTasks: data.blockedTasks || 0,
        totalShops: data.totalShops || 0,
        activeUsers: data.activeUsers || 0,
      });
    } catch (err: any) {
      console.error('Failed to load dashboard stats:', err);
      setError('Failed to load dashboard statistics. Please try again.');
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Manager Dashboard</h1>
          <p className="text-gray-600 mt-1">Welcome back, {user?.full_name || user?.fullName || 'Manager'}</p>
        </div>
        <BarChart3 className="h-8 w-8 text-blue-600" />
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Tasks</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTasks}</div>
            <p className="text-xs text-muted-foreground">All tasks in the system</p>
          </CardContent>
        </Card>

        {/* Completed Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.completedTasks}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalTasks > 0 
                ? `${Math.round((stats.completedTasks / stats.totalTasks) * 100)}% completion rate`
                : 'No tasks yet'}
            </p>
          </CardContent>
        </Card>

        {/* In Progress Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">In Progress</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.inProgressTasks}</div>
            <p className="text-xs text-muted-foreground">Currently being worked on</p>
          </CardContent>
        </Card>

        {/* Pending Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pendingTasks}</div>
            <p className="text-xs text-muted-foreground">Awaiting assignment</p>
          </CardContent>
        </Card>

        {/* Blocked Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Blocked</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.blockedTasks}</div>
            <p className="text-xs text-muted-foreground">Require attention</p>
          </CardContent>
        </Card>

        {/* Total Engineers */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Engineers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalEngineers}</div>
            <p className="text-xs text-muted-foreground">Active engineers</p>
          </CardContent>
        </Card>

        {/* Total Shops */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Shops</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalShops}</div>
            <p className="text-xs text-muted-foreground">Total shops</p>
          </CardContent>
        </Card>

        {/* Active Users */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Users</CardTitle>
            <Users className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.activeUsers}</div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>
      </div>

      {/* Additional Information */}
      <Card>
        <CardHeader>
          <CardTitle>Manager Overview</CardTitle>
          <CardDescription>System-wide statistics and insights</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-sm font-medium">Task Completion Rate</span>
              <span className="text-sm text-muted-foreground">
                {stats.totalTasks > 0 
                  ? `${Math.round((stats.completedTasks / stats.totalTasks) * 100)}%`
                  : 'N/A'}
              </span>
            </div>
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-sm font-medium">Average Tasks per Engineer</span>
              <span className="text-sm text-muted-foreground">
                {stats.totalEngineers > 0 
                  ? Math.round(stats.totalTasks / stats.totalEngineers)
                  : 0}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Tasks Requiring Attention</span>
              <span className="text-sm text-red-600 font-semibold">
                {stats.blockedTasks + stats.pendingTasks}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}