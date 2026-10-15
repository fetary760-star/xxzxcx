/**
 * HierarchyTreeSafe - A safe wrapper for HierarchyTree
 * 
 * This component catches the "useSelfEvaluation must be used within a SelfEvaluationProvider"
 * error gracefully. When the sidebar renders on the /self-evaluation route, the 
 * SelfEvaluationProvider from the page wraps both the sidebar and the content.
 * However, during route transitions or if the context is not yet available,
 * this wrapper prevents the app from crashing.
 */
'use client'

import React, { useContext } from 'react'
import { SelfEvaluationContext } from '@/lib/self-evaluation/context'
import HierarchyTree from './HierarchyTree'

export default function HierarchyTreeSafe() {
  // Try to access the context - if it's undefined, the provider isn't mounted yet
  const context = useContext(SelfEvaluationContext)
  
  if (!context) {
    // Provider not available yet (route transition) - show placeholder
    return (
      <div className="p-4 text-center">
        <p className="text-[10px] text-white/40">Loading hierarchy...</p>
      </div>
    )
  }

  return <HierarchyTree />
}