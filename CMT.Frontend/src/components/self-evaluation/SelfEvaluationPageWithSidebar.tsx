/**
 * Self Evaluation Page - AMENDED v7
 * 
 * This version re-integrates the HierarchyTree as an optional collapsible
 * sidebar on the left side, while the main workspace uses the enhanced
 * DocumentWorkspace with ALWAYS-VISIBLE right panel for Table of Contents.
 * 
 * Layout: [Optional Tree Sidebar] | [DocumentWorkspace with persistent right panel]
 * 
 * The sidebar can be toggled open/closed. When closed, users rely on the
 * DocumentWorkspace's category-based navigation. When open, users can
 * navigate via the hierarchical tree.
 * 
 * AMENDED v7: Adjusted flex layout to accommodate the always-visible right panel
 * in DocumentWorkspace without overflow issues.
 */
'use client'

import React, { useState } from 'react'
import { MainLayout } from '@/components/layout/main-layout'
import { SelfEvaluationProvider } from '@/lib/self-evaluation/context'
import DocumentWorkspace from '@/components/self-evaluation/DocumentWorkspace'
import HierarchyTree from '@/components/self-evaluation/HierarchyTree'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PanelLeftClose, PanelLeftOpen, FolderTree } from 'lucide-react'
import { cn } from '@/lib/utils'

export default function SelfEvaluationPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <SelfEvaluationProvider>
      <MainLayout>
        <div className="flex h-[calc(100vh-8rem)] -m-6">
          {/* Optional Hierarchy Tree Sidebar */}
          <div className={cn(
            "flex flex-col bg-gradient-to-b from-[#1e293b] to-[#0f172a] border-r border-white/10 transition-all duration-300 relative flex-shrink-0",
            sidebarOpen ? "w-72" : "w-0"
          )}>
            {/* Sidebar Toggle Button - Always visible */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={cn(
                "absolute top-3 z-10 h-8 w-8 bg-white/10 hover:bg-white/20 text-white border border-white/20 shadow-md",
                sidebarOpen ? "right-2" : "-right-10"
              )}
              title={sidebarOpen ? "Close hierarchy tree" : "Open hierarchy tree"}
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <FolderTree className="h-4 w-4" />
              )}
            </Button>

            {/* Sidebar Content */}
            {sidebarOpen && (
              <ScrollArea className="flex-1">
                <HierarchyTree />
              </ScrollArea>
            )}
          </div>

          {/* Toggle button when sidebar is closed */}
          {!sidebarOpen && (
            <div className="flex flex-col items-center py-3 px-1 bg-gray-100 border-r flex-shrink-0">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(true)}
                className="h-8 w-8 text-gray-500 hover:text-gray-700 hover:bg-gray-200"
                title="Open hierarchy tree"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </Button>
              <div className="mt-2 writing-mode-vertical text-[9px] text-gray-400 font-medium tracking-wider uppercase"
                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
              >
                HIERARCHY
              </div>
            </div>
          )}

          {/* Main Document Workspace - takes remaining space */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <DocumentWorkspace />
          </div>
        </div>
      </MainLayout>
    </SelfEvaluationProvider>
  )
}