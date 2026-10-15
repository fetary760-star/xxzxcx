'use client';

import React, { useState } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import PrioritiesTable from '@/components/manage/PrioritiesTable';
import PriorityFormDialog from '@/components/manage/PriorityFormDialog';
import { Button } from '@/components/ui/button';

export default function ManagePrioritiesPage() {
  const [openForm, setOpenForm] = useState(false);
  const [editingPriority, setEditingPriority] = useState<any | null>(null);
  const [refreshFlag, setRefreshFlag] = useState(0);

  const handleCreateClick = () => {
    setEditingPriority(null);
    setOpenForm(true);
  };

  const handleEdit = (priority: any) => {
    setEditingPriority(priority);
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
            <svg className="h-6 w-6 text-orange-600" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M12 2L3 6v6c0 5 3.8 9.4 9 10 5.2-.6 9-5 9-10V6l-9-4z" fill="currentColor" />
            </svg>
            <h1 className="text-2xl font-bold">Manage Priorities</h1>
          </div>
          <div>
            <Button onClick={handleCreateClick}>Create Priority</Button>
          </div>
        </div>

        <PrioritiesTable key={refreshFlag} onEdit={handleEdit} />

        <PriorityFormDialog
          open={openForm}
          onOpenChange={setOpenForm}
          priorityToEdit={editingPriority}
          onSaved={handleSaved}
        />
      </div>
    </MainLayout>
  );
}