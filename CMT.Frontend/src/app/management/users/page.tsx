'use client';

import React, { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import UsersTable from '@/components/manage/UsersTable';
import UserFormDialog from '@/components/manage/UserFormDialog';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useTLPermissions } from '@/lib/tl-permissions-context';
import { useRouter } from 'next/navigation';

export default function ManageUsersPage() {
  const { user } = useAuth();
  const { tlPermissions, isLoadingTLPermissions } = useTLPermissions();
  const router = useRouter();
  const userRoleNorm = (user?.role ?? '').toString().toLowerCase().replace(/[\s\-]+/g, '_');
  const isTL = userRoleNorm === 'team_leader' || userRoleNorm === 'teamleader';

  const [openForm, setOpenForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [refreshFlag, setRefreshFlag] = useState(0);

  // TL permission guard: redirect if canManageUsers is denied
  useEffect(() => {
    if (isTL && !isLoadingTLPermissions && tlPermissions && !tlPermissions.canManageUsers) {
      router.replace('/dashboard');
    }
  }, [isTL, isLoadingTLPermissions, tlPermissions, router]);

  // Show loading while checking TL permissions
  if (isTL && isLoadingTLPermissions) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
          <span className="ml-3 text-gray-600">Checking permissions...</span>
        </div>
      </MainLayout>
    );
  }

  // Block render if TL lacks permission (redirect will happen via useEffect)
  if (isTL && tlPermissions && !tlPermissions.canManageUsers) {
    return null;
  }

  const handleCreateClick = () => {
    setEditingUser(null);
    setOpenForm(true);
  };

  const handleEdit = (user: any) => {
    setEditingUser(user);
    setOpenForm(true);
  };

  const handleCreatedOrUpdated = () => {
    // trigger table refresh
    setRefreshFlag((f) => f + 1);
    setOpenForm(false);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg className="h-6 w-6 text-blue-600" viewBox="0 0 24 24" fill="none">
              <path d="M16 11c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM8 11c1.657 0 3-1.343 3-3S9.657 5 8 5 5 6.343 5 8s1.343 3 3 3z" fill="currentColor" />
              <path d="M8 13c-3 0-5 1.5-5 3v2h13v-2c0-1.5-2-3-5-3H8zM16 13c-.29 0-.577.02-.857.057 1.097.796 1.857 1.96 1.857 3.243v2h5v-2c0-1.5-2-3-5-3h-1z" fill="currentColor"/>
            </svg>
            <h1 className="text-2xl font-bold">Manage Users</h1>
          </div>

          <div>
            <Button onClick={handleCreateClick}>Create New User</Button>
          </div>
        </div>

        <UsersTable
          key={refreshFlag}
          onEdit={handleEdit}
        />

        <UserFormDialog
          open={openForm}
          onOpenChange={setOpenForm}
          userToEdit={editingUser}
          onSaved={handleCreatedOrUpdated}
        />
      </div>
    </MainLayout>
  );
}