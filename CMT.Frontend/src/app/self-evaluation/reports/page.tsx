'use client'

import { MainLayout } from '@/components/layout/main-layout'
import CapabilityReports from '@/components/self-evaluation/CapabilityReports'

export default function SelfEvaluationReportsPage() {
  return (
    <MainLayout>
      <div className="-m-6 h-[calc(100vh-8rem)]">
        <CapabilityReports />
      </div>
    </MainLayout>
  )
}