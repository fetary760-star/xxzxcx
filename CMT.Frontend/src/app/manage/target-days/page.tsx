'use client';

import React, { useState } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import TargetDaysTable from '@/components/manage/TargetDaysTable';
import TargetDayFormDialog from '@/components/manage/TargetDayFormDialog';
import { Button } from '@/components/ui/button';

export default function ManageTargetDaysPage() {
  const [openForm, setOpenForm] = useState(false);
  const [editingTargetDay, setEditingTargetDay] = useState<any | null>(null);
  const [refreshFlag, setRefreshFlag] = useState(0);

  const handleCreateClick = () => {
    setEditingTargetDay(null);
    setOpenForm(true);
  };

  const handleEdit = (td: any) => {
    setEditingTargetDay(td);
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
            <svg className="h-6 w-6 text-indigo-600" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M3 7h18v2H3V7zm0 4h18v2H3v-2zm0 4h18v2H3v-2z" fill="currentColor" />
            </svg>
            <h1 className="text-2xl font-bold">Manage Target Days</h1>
          </div>
          <div>
            <Button onClick={handleCreateClick}>Create Target Day</Button>
          </div>
        </div>

        <TargetDaysTable key={refreshFlag} onEdit={handleEdit} />

        <TargetDayFormDialog
          open={openForm}
          onOpenChange={setOpenForm}
          targetDayToEdit={editingTargetDay}
          onSaved={handleSaved}
        />
      </div>
    </MainLayout>
  );
}