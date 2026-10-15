'use client'

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { MainLayout } from '@/components/layout/main-layout'
import ArchivePanel from '@/components/self-evaluation/ArchivePanel'
import { SelfEvaluationProvider } from '@/lib/self-evaluation/context'

export default function SelfEvaluationArchivePage() {
  return (
    <SelfEvaluationProvider>
      <MainLayout>
        <div className="mx-auto w-full max-w-6xl px-2 py-4">
          <Suspense fallback={<div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading archive...</div>}>
            <ArchivePanel />
          </Suspense>
        </div>
      </MainLayout>
    </SelfEvaluationProvider>
  )
}