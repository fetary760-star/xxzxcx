'use client';

import React from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import DirectorDashboard from '@/components/manage/DirectorDashboard';
import { useAuth } from '@/lib/auth-context';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

/**
 * Director Dashboard Page
 * 
 * Provides comprehensive overview for Director users:
 * - View all departments under their supervision
 * - Monitor managers and their teams
 * - Track tasks across all departments
 * - View performance metrics and completion rates
 */
export default function DirectorDashboardPage() {
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

  // Only Director role can access this page
  if (userRole !== 'director') {
    return (
      <MainLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertDescription>
              Access Denied: Only Director users can access this dashboard.
            </AlertDescription>
          </Alert>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-6">
        <DirectorDashboard />
      </div>
    </MainLayout>
  );
}