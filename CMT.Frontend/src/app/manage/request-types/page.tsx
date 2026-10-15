'use client';

import React, { useState } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import RequestTypesTable from '@/components/manage/RequestTypesTable';
import RequestTypeFormDialog from '@/components/manage/RequestTypeFormDialog';
import { Button } from '@/components/ui/button';

export default function ManageRequestTypesPage() {
  const [openForm, setOpenForm] = useState(false);
  const [editingRequestType, setEditingRequestType] = useState<any | null>(null);
  const [refreshFlag, setRefreshFlag] = useState(0);

  const handleCreateClick = () => {
    setEditingRequestType(null);
    setOpenForm(true);
  };

  const handleEdit = (rt: any) => {
    setEditingRequestType(rt);
    setOpenForm(true);
  };

  const handleSaved = () => {
    setRefreshFlag((f) => f + 1);
    setOpenForm(false);
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <svg className="h-6 w-6 text-teal-600" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M3 5h18v2H3V5zm0 6h18v2H3v-2zm0 6h18v2H3v-2z" fill="currentColor" />
            </svg>
            <h1 className="text-2xl font-bold">Manage Request Types</h1>
          </div>
          <div>
            <Button onClick={handleCreateClick}>Create Request Type</Button>
          </div>
        </div>

        <RequestTypesTable key={refreshFlag} onEdit={handleEdit} />

        <RequestTypeFormDialog
          open={openForm}
          onOpenChange={setOpenForm}
          requestTypeToEdit={editingRequestType}
          onSaved={handleSaved}
        />
      </div>
    </MainLayout>
  );
}