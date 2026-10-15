'use client'

import RequireRole from '@/components/RequireRole'
import { MainLayout } from '@/components/layout/main-layout'
import UsersTable from '@/components/manage/UsersTable'

export default function UsersPageWrapper() {
  return (
    <RequireRole allowed={['teamleader','director']}>
      <UsersPage />
    </RequireRole>
  )
}

function UsersPage() {
  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto py-8">
        <h1 className="text-2xl font-semibold mb-4">Manage Users</h1>
        <UsersTable />
      </div>
    </MainLayout>
  )
}