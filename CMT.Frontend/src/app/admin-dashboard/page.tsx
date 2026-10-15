'use client';

import React from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import AdminDashboard from '@/components/manage/AdminDashboard';
import { useAuth } from '@/lib/auth-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

/**
 * Admin Dashboard Page
 * 
 * Provides system-wide overview for Admin users:
 * - View all Directors and their teams
 * - System-wide statistics (total users, tasks, etc.)
 * - Create new Directors
 * - Monitor overall system health
 */
export default function AdminDashboardPage() {
  const { user, isLoading } = useAuth();
  const userRole = (user?.role || '').toLowerCase();

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="ml-2">Loading...</span>
        </div>
      </MainLayout>
    );
  }

  // Only Admin role can access this page
  if (userRole !== 'admin') {
    return (
      <MainLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertDescription>
              Access Denied: Only Admin users can access this dashboard.
            </AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6">
        <AdminDashboard />
      </div>
    </MainLayout>
  );
}