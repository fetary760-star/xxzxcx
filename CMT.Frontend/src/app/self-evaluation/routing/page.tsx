'use client'

import { Suspense } from 'react'
import { Loader2 } from 'lucide-react'
import { MainLayout } from '@/components/layout/main-layout'
import RoutingPanel from '@/components/self-evaluation/RoutingPanel'
import { SelfEvaluationProvider } from '@/lib/self-evaluation/context'

export default function SelfEvaluationRoutingPage() {
  return (
    <SelfEvaluationProvider>
      <MainLayout>
        <div className="mx-auto w-full max-w-5xl px-2 py-4">
          <h1 className="mb-3 text-lg font-semibold text-slate-900">Shop Routing</h1>
          <Suspense fallback={<div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Loading routing...</div>}>
            <RoutingPanel />
          </Suspense>
        </div>
      </MainLayout>
    </SelfEvaluationProvider>
  )
}