'use client';

import React, { useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  DraggableDialog,
  DraggableDialogContent,
  DraggableDialogHeader,
  DraggableDialogTitle,
  DraggableDialogFooter,
} from '@/components/ui/draggable-dialog';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  Info, 
  Eye, 
  EyeOff, 
  UserPlus, 
  Users, 
  Building2,
  Plus,
  X,
  ArrowRight,
  ShieldCheck,
  ShieldX,
  RefreshCw
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DirectorPermissionsManager from './DirectorPermissionsManager';

interface DirectorData {
  userId: number;
  fullName: string;
  username: string;
  email: string;
  departmentId?: number;
  departmentName?: string;
  isActive: boolean;
  canCreateTeamLeader: boolean;
  managers?: ManagerData[];
}

interface ManagerData {
  userId: number;
  fullName: string;
  username: string;
  email: string;
  isActive: boolean;
  departmentId?: number;
  departmentName?: string;
}

interface Department {
  departmentId: number;
  name: string;
  description?: string;
  directorId?: number;
  directorName?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  director: DirectorData | null;
  onSaved?: () => void;
}

export default function EditDirectorDialog({
  open,
  onOpenChange,
  director,
  onSaved,
}: Props) {
  const [activeTab, setActiveTab] = useState('basic');
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Basic info form state
  const [form, setForm] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    isActive: true,
    canCreateTeamLeader: false,
    departmentId: '',
  });
  
  const [showPassword, setShowPassword] = useState(false);
  
  // Departments and managers state
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allDirectors, setAllDirectors] = useState<DirectorData[]>([]);
  const [availableManagers, setAvailableManagers] = useState<ManagerData[]>([]);
  const [assignedManagers, setAssignedManagers] = useState<ManagerData[]>([]);
  const [selectedManagerToAdd, setSelectedManagerToAdd] = useState<string>('');
  const [selectedManagerToTransfer, setSelectedManagerToTransfer] = useState<string>('');
  const [selectedNewDirector, setSelectedNewDirector] = useState<string>('');

  // Load departments
  const loadDepartments = async () => {
    try {
      const response = await apiClient.get('/admin/departments');
      const departmentsData = Array.isArray(response) ? response : (response.data || []);
      setDepartments(departmentsData);
    } catch (err) {
      console.warn('Failed to load departments:', err);
      setDepartments([]);
    }
  };

  // Load all directors (for transfer functionality)
  const loadAllDirectors = async () => {
    try {
      const response = await apiClient.get('/admin/directors');
      const directorsData = Array.isArray(response) ? response : (response.data || []);
      setAllDirectors(directorsData.filter((d: DirectorData) => d.userId !== director?.userId));
    } catch (err) {
      console.warn('Failed to load directors:', err);
      setAllDirectors([]);
    }
  };

  // Load all managers (for assignment)
  const loadAvailableManagers = async () => {
    try {
      const response = await apiClient.get('/users');
      const allUsers = Array.isArray(response) ? response : (response.data || []);
      
      // Filter to get only managers
      const managers = allUsers.filter((user: any) => {
        const role = (user.role || '').toLowerCase();
        return role === 'manager';
      }).map((user: any) => ({
        userId: user.user_id || user.userId || user.id,
        fullName: user.full_name || user.fullName || user.name,
        username: user.username,
        email: user.email,
        isActive: user.is_active ?? user.isActive ?? true,
        departmentId: user.department_id || user.departmentId,
        departmentName: user.department_name || user.departmentName
      }));
      
      setAvailableManagers(managers);
    } catch (err) {
      console.warn('Failed to load managers:', err);
      setAvailableManagers([]);
    }
  };

  // Load director's assigned managers
  const loadDirectorManagers = async (directorId: number) => {
    try {
      const response = await apiClient.get(`/admin/directors/${directorId}/managers`);
      const managersData = Array.isArray(response) ? response : (response.data || []);
      setAssignedManagers(managersData.map((m: any) => ({
        userId: m.user_id || m.userId || m.id,
        fullName: m.full_name || m.fullName || m.name,
        username: m.username,
        email: m.email,
        isActive: m.is_active ?? m.isActive ?? true,
        departmentId: m.department_id || m.departmentId,
        departmentName: m.department_name || m.departmentName
      })));
    } catch (err) {
      console.warn('Failed to load director managers:', err);
      setAssignedManagers([]);
    }
  };

  // Initialize form when director changes
  useEffect(() => {
    if (director && open) {
      setForm({
        fullName: director.fullName || '',
        username: director.username || '',
        email: director.email || '',
        password: '',
        isActive: director.isActive ?? true,
        canCreateTeamLeader: director.canCreateTeamLeader ?? false,
        departmentId: director.departmentId ? String(director.departmentId) : '',
      });
      
      setLoadingData(true);
      Promise.all([
        loadDepartments(),
        loadAllDirectors(),
        loadAvailableManagers(),
        loadDirectorManagers(director.userId)
      ]).finally(() => {
        setLoadingData(false);
      });
      
      setError(null);
      setSuccess(null);
      setShowPassword(false);
      setActiveTab('basic');
      setSelectedManagerToAdd('');
      setSelectedManagerToTransfer('');
      setSelectedNewDirector('');
    }
  }, [director, open]);

  const handleChange = (field: string, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (error) setError(null);
    if (success) setSuccess(null);
  };

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Handle basic info update
  const handleUpdateBasicInfo = async () => {
    setError(null);
    setSuccess(null);

    // Validation
    if (!form.fullName.trim()) {
      setError('Full Name is required');
      return;
    }
    if (!form.username.trim()) {
      setError('Username is required');
      return;
    }
    if (!form.email.trim() || !isValidEmail(form.email.trim())) {
      setError('Valid email is required');
      return;
    }
    if (form.password && form.password.length < 6) {
      setError('Password must be at least 6 characters if provided');
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        fullName: form.fullName.trim(),
        username: form.username.trim(),
        email: form.email.trim(),
        isActive: form.isActive,
        canCreateTeamLeader: form.canCreateTeamLeader,
        role: 'director'
      };

      if (form.password.trim()) {
        payload.newPassword = form.password.trim();
      }

      // Update department if changed
      if (form.departmentId && form.departmentId !== String(director?.departmentId)) {
        payload.departmentId = parseInt(form.departmentId);
      }

      const response = await apiClient.put(`/admin/directors/${director?.userId}`, payload);
      
      if (response && response.success === false) {
        setError(response.message || 'Failed to update director');
        return;
      }

      setSuccess('Director information updated successfully');
      setForm(prev => ({ ...prev, password: '' }));
      onSaved?.();
    } catch (err: any) {
      console.error('Failed to update director:', err);
      setError(err.message || 'Failed to update director');
    } finally {
      setLoading(false);
    }
  };

  // Handle adding a manager to this director
  const handleAddManager = async () => {
    if (!selectedManagerToAdd || !director) return;

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const response = await apiClient.post(`/admin/directors/${director.userId}/managers`, {
        managerId: parseInt(selectedManagerToAdd)
      });

      if (response && response.success === false) {
        setError(response.message || 'Failed to assign manager');
        return;
      }

      // Refresh the managers list
      await loadDirectorManagers(director.userId);
      await loadAvailableManagers();
      setSelectedManagerToAdd('');
      setSuccess('Manager assigned successfully');
      onSaved?.();
    } catch (err: any) {
      console.error('Failed to assign manager:', err);
      setError(err.message || 'Failed to assign manager');
    } finally {
      setLoading(false);
    }
  };

  // Handle removing a manager from this director
  const handleRemoveManager = async (managerId: number) => {
    if (!director) return;

    if (!confirm('Are you sure you want to remove this manager from this director?')) {
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const response = await apiClient.delete(`/admin/directors/${director.userId}/managers/${managerId}`);

      if (response && response.success === false) {
        setError(response.message || 'Failed to remove manager');
        return;
      }

      // Refresh the managers list
      await loadDirectorManagers(director.userId);
      await loadAvailableManagers();
      setSuccess('Manager removed successfully');
      onSaved?.();
    } catch (err: any) {
      console.error('Failed to remove manager:', err);
      setError(err.message || 'Failed to remove manager');
    } finally {
      setLoading(false);
    }
  };

  // Handle transferring a manager to another director
  const handleTransferManager = async () => {
    if (!selectedManagerToTransfer || !selectedNewDirector || !director) return;

    if (!confirm('Are you sure you want to transfer this manager to another director?')) {
      return;
    }

    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const response = await apiClient.put(
        `/admin/directors/${director.userId}/managers/${selectedManagerToTransfer}/transfer`,
        { newDirectorId: parseInt(selectedNewDirector) }
      );

      if (response && response.success === false) {
        setError(response.message || 'Failed to transfer manager');
        return;
      }

      // Refresh the managers list
      await loadDirectorManagers(director.userId);
      await loadAvailableManagers();
      setSelectedManagerToTransfer('');
      setSelectedNewDirector('');
      setSuccess('Manager transferred successfully');
      onSaved?.();
    } catch (err: any) {
      console.error('Failed to transfer manager:', err);
      setError(err.message || 'Failed to transfer manager');
    } finally {
      setLoading(false);
    }
  };

  // Get managers that can be assigned (not already assigned to this director)
  const getUnassignedManagers = () => {
    const assignedIds = new Set(assignedManagers.map(m => m.userId));
    return availableManagers.filter(m => !assignedIds.has(m.userId));
  };

  if (!open || !director) return null;

  return (
    <DraggableDialog open={open} onOpenChange={onOpenChange}>
      <DraggableDialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto" showMaximize>
        <DraggableDialogHeader>
          <DraggableDialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Edit Director: {director.fullName}
          </DraggableDialogTitle>
        </DraggableDialogHeader>

        <div className="p-4">
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-4 bg-green-50 border-green-200">
              <AlertDescription className="text-green-800">{success}</AlertDescription>
            </Alert>
          )}

          {loadingData && (
            <Alert className="mb-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <AlertDescription>Loading data, please wait...</AlertDescription>
            </Alert>
          )}

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic Information</TabsTrigger>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
              <TabsTrigger value="managers">Manage Members</TabsTrigger>
            </TabsList>

            {/* Basic Information Tab */}
            <TabsContent value="basic" className="space-y-4 mt-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Edit the director's basic information, permissions, and department assignment.
                </AlertDescription>
              </Alert>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name *</Label>
                  <Input
                    id="fullName"
                    value={form.fullName}
                    onChange={(e) => handleChange('fullName', e.target.value)}
                    placeholder="Enter full name"
                    disabled={loading || loadingData}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="username">Username *</Label>
                  <Input
                    id="username"
                    value={form.username}
                    onChange={(e) => handleChange('username', e.target.value)}
                    placeholder="Enter username"
                    disabled={loading || loadingData}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={form.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="user@example.com"
                    disabled={loading || loadingData}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">New Password (leave blank to keep current)</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => handleChange('password', e.target.value)}
                      placeholder="Enter new password (optional)"
                      disabled={loading || loadingData}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      disabled={loading || loadingData}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="department">Department</Label>
                  <Select
                    value={form.departmentId}
                    onValueChange={(value) => handleChange('departmentId', value)}
                    disabled={loading || loadingData}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem
                          key={`dept-${dept.departmentId}`}
                          value={String(dept.departmentId)}
                        >
                          {dept.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="isActive">Status</Label>
                  <Select
                    value={form.isActive ? 'true' : 'false'}
                    onValueChange={(value) => handleChange('isActive', value === 'true')}
                    disabled={loading || loadingData}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">Active</SelectItem>
                      <SelectItem value="false">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Note about granular permissions */}
              <div className="space-y-2 mt-4">
                <div className="flex items-start space-x-3 p-4 border rounded-lg bg-blue-50 border-blue-200">
                  <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-blue-800">
                      Granular Permissions
                    </p>
                    <p className="text-xs text-blue-700">
                      To manage this Director's granular permissions (Team Leader creation, dashboard access, 
                      Engineer Workload visibility, category management, reports, etc.), go to the <strong>"Permissions"</strong> tab above. 
                      Changes to permissions take effect the next time the director refreshes their page.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpdateBasicInfo} 
                  disabled={loading || loadingData}
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </TabsContent>

            {/* Permissions Tab */}
            <TabsContent value="permissions" className="space-y-4 mt-4">
              <DirectorPermissionsManager
                directorUserId={director.userId}
                directorName={director.fullName}
              />
            </TabsContent>

            {/* Manage Members Tab */}
            <TabsContent value="managers" className="space-y-4 mt-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Assign or remove managers from this director. You can also transfer managers to other directors.
                </AlertDescription>
              </Alert>

              {/* Add Manager Section */}
              <div className="border rounded-lg p-4 bg-gray-50">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Assign Manager to Director
                </h3>
                
                <div className="flex gap-2">
                  <Select
                    value={selectedManagerToAdd}
                    onValueChange={setSelectedManagerToAdd}
                    disabled={loading || loadingData}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select a manager to assign" />
                    </SelectTrigger>
                    <SelectContent>
                      {getUnassignedManagers().length === 0 ? (
                        <SelectItem value="none" disabled>
                          No available managers to assign
                        </SelectItem>
                      ) : (
                        getUnassignedManagers().map((manager) => (
                          <SelectItem
                            key={`manager-${manager.userId}`}
                            value={String(manager.userId)}
                          >
                            {manager.fullName} ({manager.email})
                            {manager.departmentName && ` - ${manager.departmentName}`}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  
                  <Button
                    onClick={handleAddManager}
                    disabled={!selectedManagerToAdd || loading || loadingData}
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <UserPlus className="h-4 w-4 mr-1" />
                    Assign
                  </Button>
                </div>
              </div>

              {/* Current Managers List */}
              <div className="border rounded-lg p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Assigned Managers ({assignedManagers.length})
                </h3>

                {assignedManagers.length === 0 ? (
                  <div className="text-center py-6 text-gray-500">
                    <Users className="h-10 w-10 mx-auto mb-2 text-gray-400" />
                    <p>No managers assigned to this director</p>
                    <p className="text-sm">Use the form above to assign managers</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {assignedManagers.map((manager) => (
                      <div
                        key={manager.userId}
                        className="flex items-center justify-between p-3 bg-white border rounded-lg hover:shadow-sm transition-shadow"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{manager.fullName}</span>
                            <Badge variant={manager.isActive ? "default" : "secondary"} className="text-xs">
                              {manager.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                            {manager.departmentName && (
                              <Badge variant="outline" className="text-xs">
                                <Building2 className="h-3 w-3 mr-1" />
                                {manager.departmentName}
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-gray-600">
                            @{manager.username} • {manager.email}
                          </div>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveManager(manager.userId)}
                          disabled={loading}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Transfer Manager Section */}
              <div className="border rounded-lg p-4 bg-amber-50 border-amber-200">
                <h3 className="font-medium mb-2 flex items-center gap-2 text-amber-800">
                  <RefreshCw className="h-4 w-4" />
                  Transfer Manager to Another Director
                </h3>
                <p className="text-sm text-amber-700 mb-3">
                  Select a manager from this director and transfer them to another director.
                </p>
                
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Select
                      value={selectedManagerToTransfer}
                      onValueChange={setSelectedManagerToTransfer}
                      disabled={loading || loadingData || assignedManagers.length === 0}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select manager to transfer" />
                      </SelectTrigger>
                      <SelectContent>
                        {assignedManagers.map((manager) => (
                          <SelectItem
                            key={`transfer-${manager.userId}`}
                            value={String(manager.userId)}
                          >
                            {manager.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    
                    <ArrowRight className="h-10 w-10 text-amber-600 flex-shrink-0" />
                    
                    <Select
                      value={selectedNewDirector}
                      onValueChange={setSelectedNewDirector}
                      disabled={loading || loadingData || !selectedManagerToTransfer}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Select new director" />
                      </SelectTrigger>
                      <SelectContent>
                        {allDirectors.map((dir) => (
                          <SelectItem
                            key={`dir-${dir.userId}`}
                            value={String(dir.userId)}
                          >
                            {dir.fullName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button
                    onClick={handleTransferManager}
                    disabled={!selectedManagerToTransfer || !selectedNewDirector || loading || loadingData}
                    className="w-full"
                    variant="outline"
                  >
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Transfer Manager
                  </Button>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={loading}
                >
                  Close
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DraggableDialogContent>
    </DraggableDialog>
  );
}