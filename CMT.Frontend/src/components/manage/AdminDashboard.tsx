'use client';

import React, { useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useTimezone } from '@/lib/timezone-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Users, BarChart3, Building2, UserCog, Briefcase, UserPlus, ShieldCheck, ShieldX, Edit2, Trash2, Shield, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import UserFormDialog from './UserFormDialog';
import EditDirectorDialog from './EditDirectorDialog';
import DepartmentManager from './DepartmentManager';
import SoftDeleteManager from './SoftDeleteManager';
import RolePermissionsManager from './RolePermissionsManager';
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

interface DirectorSummary {
  userId: number;
  fullName: string;
  username: string;
  email: string;
  departmentId?: number;
  departmentName?: string;
  departmentCount: number;
  managerCount: number;
  totalTeamMembers: number;
  isActive: boolean;
  createdAt: string;
  canCreateTeamLeader: boolean;
  managers?: any[];
}

interface AdminDashboardData {
  adminUserId: number;
  adminName: string;
  directors: DirectorSummary[];
  totalDirectors: number;
  totalManagers: number;
  totalShopTeamLeaders: number;
  totalEngineers: number;
  totalCustomerPersonnel: number;
  totalActiveTasks: number;
  totalCompletedTasks: number;
  recentTasks: any[];
}

export default function AdminDashboard() {
  const auth: any = useAuth() || {};
  const currentUser = auth?.user;
  const currentUserId = currentUser?.userId || currentUser?.user_id;
  const { formatDate } = useTimezone();

  const [dashboardData, setDashboardData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Edit Director state
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedDirector, setSelectedDirector] = useState<DirectorSummary | null>(null);

  const loadDashboard = async () => {
    if (!currentUserId) return;
    
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(`/users/admin-dashboard/${currentUserId}`);
      
      // FIXED: Add null check for response
      if (!response) {
        setError('Failed to load admin dashboard. Please try again.');
        return;
      }
      
      // Handle different response formats
      const data = response.data || response;
      setDashboardData(data);
    } catch (err: any) {
      console.error('Failed to load admin dashboard:', err);
      setError(err.message || 'Failed to load admin dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [currentUserId]);

  const handleCreateDirector = () => {
    setOpenForm(true);
  };

  const handleDirectorSaved = () => {
    loadDashboard();
    setOpenForm(false);
  };

  // Handle Edit Director
  const handleEditDirector = (director: DirectorSummary) => {
    setSelectedDirector(director);
    setEditDialogOpen(true);
  };

  // Handle Director Updated
  const handleDirectorUpdated = () => {
    loadDashboard();
  };

  // Handle Delete Director
  const handleDeleteDirector = async (director: DirectorSummary) => {
    if (!confirm(`Are you sure you want to deactivate director "${director.fullName}"? This action will affect all users under this director.`)) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiClient.delete(`/admin/directors/${director.userId}`);
      loadDashboard();
    } catch (err: any) {
      console.error('Failed to delete director:', err);
      setError(err.message || 'Failed to delete director');
    } finally {
      setLoading(false);
    }
  };

  if (loading && !dashboardData) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading admin dashboard...</span>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <UserCog className="h-6 w-6 text-blue-600" />
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
          </div>

          <Button onClick={handleCreateDirector}>
            <Plus className="h-4 w-4 mr-2" />
            Create New Director
          </Button>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Tabs for different sections */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">System Overview</TabsTrigger>
            <TabsTrigger value="directors">Directors</TabsTrigger>
            <TabsTrigger value="departments">Departments</TabsTrigger>
            <TabsTrigger value="role-permissions" className="flex items-center gap-1">
              <Shield className="h-3.5 w-3.5" />
              Role Permissions
            </TabsTrigger>
            <TabsTrigger value="soft-deleted" className="flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              Soft-Deleted Items
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {dashboardData && (
              <>
                <div className="bg-white rounded-lg border p-6">
                  <div className="flex items-center space-x-2 mb-4">
                    <BarChart3 className="h-5 w-5 text-blue-600" />
                    <h2 className="text-lg font-semibold">System Overview</h2>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    <div className="bg-purple-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600">{dashboardData.totalDirectors}</div>
                      <div className="text-sm text-purple-800">Directors</div>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{dashboardData.totalManagers}</div>
                      <div className="text-sm text-blue-800">Managers</div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{dashboardData.totalShopTeamLeaders}</div>
                      <div className="text-sm text-green-800">Shop TLs</div>
                    </div>
                    <div className="bg-orange-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">{dashboardData.totalEngineers}</div>
                      <div className="text-sm text-orange-800">Engineers</div>
                    </div>
                    <div className="bg-yellow-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-yellow-600">{dashboardData.totalCustomerPersonnel}</div>
                      <div className="text-sm text-yellow-800">Personnel</div>
                    </div>
                    <div className="bg-indigo-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-indigo-600">
                        {dashboardData.totalActiveTasks + dashboardData.totalCompletedTasks}
                      </div>
                      <div className="text-sm text-indigo-800">Total Tasks</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <div className="bg-orange-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-orange-600">{dashboardData.totalActiveTasks}</div>
                      <div className="text-sm text-orange-800">Active Tasks</div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{dashboardData.totalCompletedTasks}</div>
                      <div className="text-sm text-green-800">Completed Tasks</div>
                    </div>
                  </div>
                </div>

                {/* Recent Tasks */}
                {dashboardData.recentTasks && Array.isArray(dashboardData.recentTasks) && dashboardData.recentTasks.length > 0 && (
                  <div className="bg-white rounded-lg border p-6">
                    <div className="flex items-center space-x-2 mb-4">
                      <BarChart3 className="h-5 w-5 text-blue-600" />
                      <h2 className="text-lg font-semibold">Recent System Activity</h2>
                    </div>

                    <div className="space-y-2">
                      {dashboardData.recentTasks.slice(0, 10).map((task: any, index: number) => {
                        try {
                          // Safely handle task data with extra validation
                          const taskId = task?.taskId || task?.task_id || `task-${index}`;
                          const description = task?.description || 'No description';
                          const createdByName = task?.createdByName || 'Unknown';
                          const createdAt = task?.createdAt ? formatDate(task.createdAt) : 'N/A';
                          const status = task?.status || 'Unknown';
                          
                          return (
                            <div key={`recent-task-${taskId}-${index}`} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                              <div className="flex-1">
                                <div className="font-medium">{description}</div>
                                <div className="text-sm text-gray-600">
                                  Created by {createdByName} • {createdAt}
                                </div>
                              </div>
                              <span className={`px-2 py-1 rounded text-xs ${
                                status === 'Completed' ? 'bg-green-100 text-green-800' :
                                status === 'InProgress' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {status}
                              </span>
                            </div>
                          );
                        } catch (err) {
                          // Silently skip invalid task entries
                          console.warn('Skipping invalid task entry:', err);
                          return null;
                        }
                      }).filter(Boolean)}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>

          {/* Directors Tab */}
          <TabsContent value="directors" className="space-y-6">
            {dashboardData && (
              <div className="bg-white rounded-lg border p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    <h2 className="text-lg font-semibold">Directors ({dashboardData.totalDirectors})</h2>
                  </div>
                  
                  {/* Legend for Team Leader Permission */}
                  <div className="flex items-center gap-4 text-xs text-gray-600">
                    <div className="flex items-center gap-1">
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                      <span>Can create Team Leaders</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <ShieldX className="h-4 w-4 text-gray-400" />
                      <span>Cannot create Team Leaders</span>
                    </div>
                  </div>
                </div>

                {dashboardData.directors.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="h-12 w-12 mx-auto mb-2 text-gray-400" />
                    <p>No directors created yet</p>
                    <p className="text-sm">Click "Create New Director" to add your first director</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {dashboardData.directors.map((director) => (
                      <div key={director.userId} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-lg">{director.fullName}</h3>
                              {/* Team Leader Permission Badge/Icon */}
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  {director.canCreateTeamLeader ? (
                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1 text-xs">
                                      <UserPlus className="h-3 w-3" />
                                      TL
                                    </Badge>
                                  ) : (
                                    <span className="text-gray-400">
                                      <ShieldX className="h-4 w-4" />
                                    </span>
                                  )}
                                </TooltipTrigger>
                                <TooltipContent>
                                  {director.canCreateTeamLeader 
                                    ? 'This Director can create Team Leaders' 
                                    : 'This Director cannot create Team Leaders'}
                                </TooltipContent>
                              </Tooltip>
                            </div>
                            <p className="text-sm text-gray-600">@{director.username}</p>
                            <p className="text-xs text-gray-500">{director.email}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            {/* Edit Button */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditDirector(director)}
                                  disabled={loading}
                                  className="h-8 w-8 p-0"
                                >
                                  <Edit2 className="h-4 w-4 text-blue-600" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Edit Director</TooltipContent>
                            </Tooltip>
                            
                            {/* Delete Button */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteDirector(director)}
                                  disabled={loading}
                                  className="h-8 w-8 p-0"
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Delete Director</TooltipContent>
                            </Tooltip>
                            
                            <span className={`px-2 py-1 rounded text-xs ml-1 ${
                              director.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {director.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </div>
                        </div>

                        {/* Permission Summary */}
                        <div className="text-xs mb-3 px-2 py-1.5 rounded bg-gray-50 border border-gray-200">
                          <div className="flex items-center gap-1 mb-1">
                            <Shield className="h-3 w-3 text-blue-600" />
                            <span className="font-medium text-gray-700">Permissions:</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {director.canCreateTeamLeader ? (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 bg-green-50 text-green-700 border-green-200">
                                <UserPlus className="h-2.5 w-2.5 mr-0.5" />TL
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1 py-0 bg-gray-100 text-gray-400 border-gray-200">
                                <ShieldX className="h-2.5 w-2.5 mr-0.5" />No TL
                              </Badge>
                            )}
                            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-blue-50 text-blue-600 border-blue-200">
                              Manager ✓
                            </Badge>
                            <Badge variant="outline" className="text-[10px] px-1 py-0 bg-blue-50 text-blue-600 border-blue-200">
                              Customer ✓
                            </Badge>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">
                            Click Edit to manage all granular permissions
                          </p>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t">
                          <div className="text-center">
                            <div className="flex items-center justify-center mb-1">
                              <Building2 className="h-4 w-4 text-blue-600" />
                            </div>
                            <div className="text-lg font-bold text-blue-600">{director.departmentCount}</div>
                            <div className="text-xs text-gray-600">Departments</div>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center mb-1">
                              <Briefcase className="h-4 w-4 text-green-600" />
                            </div>
                            <div className="text-lg font-bold text-green-600">{director.managerCount}</div>
                            <div className="text-xs text-gray-600">Managers</div>
                          </div>
                          <div className="text-center">
                            <div className="flex items-center justify-center mb-1">
                              <Users className="h-4 w-4 text-purple-600" />
                            </div>
                            <div className="text-lg font-bold text-purple-600">{director.totalTeamMembers}</div>
                            <div className="text-xs text-gray-600">Team</div>
                          </div>
                        </div>

                        <div className="text-xs text-gray-500 mt-3">
                          Created: {formatDate(director.createdAt)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          {/* Departments Tab */}
          <TabsContent value="departments" className="space-y-6">
            <div className="bg-white rounded-lg border p-6">
              <DepartmentManager showCreateButton={false} />
            </div>
          </TabsContent>

          {/* Role Permissions Tab */}
          <TabsContent value="role-permissions" className="space-y-6">
            <div className="bg-white rounded-lg border p-6">
              <RolePermissionsManager />
            </div>
          </TabsContent>

          {/* Soft-Deleted Items Tab */}
          <TabsContent value="soft-deleted" className="space-y-6">
            <div className="bg-white rounded-lg border p-6">
              <SoftDeleteManager />
            </div>
          </TabsContent>
        </Tabs>

        {/* Create Director Dialog */}
        <UserFormDialog
          open={openForm}
          onOpenChange={setOpenForm}
          userToEdit={null}
          onSaved={handleDirectorSaved}
          shops={[]}
          supervisors={[]}
          managers={[]}
          parentLoadingData={false}
        />

        {/* Edit Director Dialog */}
        <EditDirectorDialog
          open={editDialogOpen}
          onOpenChange={setEditDialogOpen}
          director={selectedDirector}
          onSaved={handleDirectorUpdated}
        />
      </div>
    </TooltipProvider>
  );
}