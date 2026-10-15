'use client'

import RequireRole from '@/components/RequireRole'
import { MainLayout } from '@/components/layout/main-layout'
import TeamLeaderScopeManager from '@/components/manage/TeamLeaderScopeManager'

export default function TLScopesPageWrapper() {
  return (
    <RequireRole allowed={['director']}>
      <TLScopesPage />
    </RequireRole>
  )
}

function TLScopesPage() {
  return (
    <MainLayout>
      <div className="max-w-6xl mx-auto py-8">
        <TeamLeaderScopeManager />
      </div>
    </MainLayout>
  )
}