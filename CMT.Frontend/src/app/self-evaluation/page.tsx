'use client'

import React from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { SelfEvaluationProvider } from '@/lib/self-evaluation/context'
import DocumentWorkspace from '@/components/self-evaluation/DocumentWorkspace'

export default function SelfEvaluationPage() {
  return (
    <SelfEvaluationProvider>
      <MainLayout>
        <div className="flex h-[calc(100vh-8rem)] -m-6">
          <DocumentWorkspace />
        </div>
      </MainLayout>
    </SelfEvaluationProvider>
  )
}
