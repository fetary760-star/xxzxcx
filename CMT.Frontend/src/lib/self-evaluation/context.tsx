/**
 * Self Evaluation Context - FULLY AMENDED v3
 * 
 * Changes:
 * - Added selectedATARecord for the hierarchical ATA parent record
 * - Added activeFormType to determine which form component to render
 * - Added formSubmissionId for tracking current form's backend ID
 * - Added user permissions context
 * - handleSetShop no longer clears ATAChapter/Component when the same shop is re-selected
 *   (supports auto-expand without losing state)
 * - Exported SelfEvaluationContext so safe wrappers can check if provider is mounted
 */
import React, { createContext, useContext, useState, useCallback } from 'react'
import type { ShopDto, ATAChapterDto, ComponentDto, CapabilityAssessmentDto, ATARecordDto, FormNodeType } from './types'

interface SelfEvaluationContextType {
  selectedShop: ShopDto | null
  selectedATAChapter: ATAChapterDto | null
  selectedComponent: ComponentDto | null
  selectedAssessment: CapabilityAssessmentDto | null
  selectedATARecord: ATARecordDto | null
  activeFormType: FormNodeType | null
  editRequestKey: number
  revisionDraftKey: string | null

  setSelectedShop: (shop: ShopDto | null) => void
  setSelectedATAChapter: (ata: ATAChapterDto | null) => void
  setSelectedComponent: (component: ComponentDto | null) => void
  setSelectedAssessment: (assessment: CapabilityAssessmentDto | null) => void
  setSelectedATARecord: (record: ATARecordDto | null) => void
  setActiveFormType: (formType: FormNodeType | null) => void
  requestFormEdit: () => void
  markFormRevisionDraft: (ataRecordId: string, formType: FormNodeType) => void
  clearFormRevisionDraft: (ataRecordId: string, formType: FormNodeType) => void
  clearSelection: () => void

  refreshKey: number
  triggerRefresh: () => void
}

// Export the context so safe wrappers can check if provider is mounted
export const SelfEvaluationContext = createContext<SelfEvaluationContextType | undefined>(undefined)

export function SelfEvaluationProvider({ children }: { children: React.ReactNode }) {
  const [selectedShop, setSelectedShop] = useState<ShopDto | null>(null)
  const [selectedATAChapter, setSelectedATAChapter] = useState<ATAChapterDto | null>(null)
  const [selectedComponent, setSelectedComponent] = useState<ComponentDto | null>(null)
  const [selectedAssessment, setSelectedAssessment] = useState<CapabilityAssessmentDto | null>(null)
  const [selectedATARecord, setSelectedATARecord] = useState<ATARecordDto | null>(null)
  const [activeFormType, setActiveFormType] = useState<FormNodeType | null>(null)
  const [editRequestKey, setEditRequestKey] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [revisionDraftKey, setRevisionDraftKey] = useState<string | null>(null)

  const clearSelection = useCallback(() => {
    setSelectedShop(null)
    setSelectedATAChapter(null)
    setSelectedComponent(null)
    setSelectedAssessment(null)
    setSelectedATARecord(null)
    setActiveFormType(null)
  }, [])

  const triggerRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1)
  }, [])

  const requestFormEdit = useCallback(() => {
    setEditRequestKey(prev => prev + 1)
  }, [])

  const markFormRevisionDraft = useCallback((ataRecordId: string, formType: FormNodeType) => {
    setRevisionDraftKey(`${ataRecordId}:${formType}`)
  }, [])

  const clearFormRevisionDraft = useCallback((ataRecordId: string, formType: FormNodeType) => {
    const key = `${ataRecordId}:${formType}`
    setRevisionDraftKey(current => current === key ? null : current)
  }, [])

  const handleSetShop = useCallback((shop: ShopDto | null) => {
    setSelectedShop(prev => {
      // If same shop is being re-selected (e.g., from auto-expand), don't clear children
      if (prev?.id === shop?.id) return prev
      // Different shop selected - clear children
      setSelectedATAChapter(null)
      setSelectedComponent(null)
      setSelectedAssessment(null)
      setSelectedATARecord(null)
      setActiveFormType(null)
      return shop
    })
  }, [])

  const handleSetATAChapter = useCallback((ata: ATAChapterDto | null) => {
    setSelectedATAChapter(ata)
    setSelectedComponent(null)
    setSelectedAssessment(null)
  }, [])

  const handleSetComponent = useCallback((component: ComponentDto | null) => {
    setSelectedComponent(component)
    setSelectedAssessment(null)
  }, [])

  const handleSetATARecord = useCallback((record: ATARecordDto | null) => {
    setSelectedATARecord(record)
    setActiveFormType(null)
  }, [])

  return (
    <SelfEvaluationContext.Provider
      value={{
        selectedShop,
        selectedATAChapter,
        selectedComponent,
        selectedAssessment,
        selectedATARecord,
        activeFormType,
        editRequestKey,
        setSelectedShop: handleSetShop,
        setSelectedATAChapter: handleSetATAChapter,
        setSelectedComponent: handleSetComponent,
        setSelectedAssessment,
        setSelectedATARecord: handleSetATARecord,
        setActiveFormType,
        requestFormEdit,
        markFormRevisionDraft,
        clearFormRevisionDraft,
        revisionDraftKey,
        clearSelection,
        refreshKey,
        triggerRefresh,
      }}
    >
      {children}
    </SelfEvaluationContext.Provider>
  )
}

export function useSelfEvaluation() {
  const context = useContext(SelfEvaluationContext)
  if (!context) {
    throw new Error('useSelfEvaluation must be used within a SelfEvaluationProvider')
  }
  return context
}