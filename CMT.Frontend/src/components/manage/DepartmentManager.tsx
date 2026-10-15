'use client';

import React, { useEffect, useState } from 'react';
import apiClient from '@/lib/api';
import { Button } from '@/components/ui/button';
import { useTimezone } from '@/lib/timezone-context';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, Building2, Trash2, Edit2 } from 'lucide-react';
import {
  DraggableDialog,
  DraggableDialogContent,
  DraggableDialogHeader,
  DraggableDialogTitle,
  DraggableDialogFooter,
} from '@/components/ui/draggable-dialog';

interface Department {
  departmentId: number;
  name: string;
  description?: string;
  directorId: number;
  directorName: string;
  totalUsers: number;
  totalManagers: number;
  isActive: boolean;
  createdAt: string;
}

interface DepartmentManagerProps {
  onCreated?: (department: Department) => void;
  showCreateButton?: boolean;
}

export default function DepartmentManager({ onCreated, showCreateButton = true }: DepartmentManagerProps) {
  const { formatDate } = useTimezone();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  
  const [form, setForm] = useState({
    name: '',
    description: '',
  });

  const loadDepartments = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get('/departments');
      setDepartments(response.data || response || []);
    } catch (err: any) {
      console.error('Failed to load departments:', err);
      setError(err.response?.data?.message || 'Failed to load departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDepartments();
  }, []);

  const handleOpenForm = (department?: Department) => {
    if (department) {
      setEditingDepartment(department);
      setForm({
        name: department.name,
        description: department.description || '',
      });
    } else {
      setEditingDepartment(null);
      setForm({
        name: '',
        description: '',
      });
    }
    setOpenForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.name.trim()) {
      setError('Department name is required');
      return;
    }

    setLoading(true);
    try {
      if (editingDepartment) {
        // Update existing department
        const response = await apiClient.put(`/departments/${editingDepartment.departmentId}`, {
          name: form.name.trim(),
          description: form.description.trim() || null,
        });
        const updatedDept = response.data || response;
        setDepartments(prev => prev.map(d => 
          d.departmentId === editingDepartment.departmentId ? updatedDept : d
        ));
      } else {
        // Create new department
        const response = await apiClient.post('/departments', {
          name: form.name.trim(),
          description: form.description.trim() || null,
        });
        const newDept = response.data || response;
        setDepartments(prev => [...prev, newDept]);
        onCreated?.(newDept);
      }
      
      setOpenForm(false);
      setForm({ name: '', description: '' });
    } catch (err: any) {
      console.error('Failed to save department:', err);
      setError(err.response?.data?.message || 'Failed to save department');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (departmentId: number) => {
    if (!confirm('Are you sure you want to delete this department? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await apiClient.delete(`/departments/${departmentId}`);
      setDepartments(prev => prev.filter(d => d.departmentId !== departmentId));
    } catch (err: any) {
      console.error('Failed to delete department:', err);
      setError(err.response?.data?.message || 'Failed to delete department');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Building2 className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Department Management</h2>
        </div>
        {showCreateButton && (
          <Button onClick={() => handleOpenForm()} disabled={loading}>
            <Plus className="h-4 w-4 mr-2" />
            Create Department
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && departments.length === 0 ? (
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading departments...</span>
        </div>
      ) : departments.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Building2 className="h-12 w-12 mx-auto mb-2 text-gray-400" />
          <p>No departments found</p>
          <p className="text-sm">Create your first department to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {departments.map((dept) => (
            <div key={dept.departmentId} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{dept.name}</h3>
                  {dept.description && (
                    <p className="text-sm text-gray-600 mt-1">{dept.description}</p>
                  )}
                  <p className="text-xs text-gray-500 mt-2">Director: {dept.directorName}</p>
                </div>
                <div className="flex space-x-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenForm(dept)}
                    disabled={loading}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(dept.departmentId)}
                    disabled={loading}
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t">
                <div className="text-center">
                  <div className="text-lg font-bold text-blue-600">{dept.totalManagers}</div>
                  <div className="text-xs text-gray-600">Managers</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-green-600">{dept.totalUsers}</div>
                  <div className="text-xs text-gray-600">Total Users</div>
                </div>
              </div>

              <div className="text-xs text-gray-500 mt-3">
                Created: {formatDate(dept.createdAt)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Department Dialog */}
      <DraggableDialog open={openForm} onOpenChange={setOpenForm}>
        <DraggableDialogContent className="sm:max-w-[500px]" showMaximize>
          <DraggableDialogHeader>
            <DraggableDialogTitle>
              {editingDepartment ? 'Edit Department' : 'Create New Department'}
            </DraggableDialogTitle>
          </DraggableDialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 p-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Department Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Engineering, Sales, Marketing"
                disabled={loading}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of the department"
                disabled={loading}
              />
            </div>

            <DraggableDialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpenForm(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingDepartment ? 'Update' : 'Create'} Department
              </Button>
            </DraggableDialogFooter>
          </form>
        </DraggableDialogContent>
      </DraggableDialog>
    </div>
  );
}