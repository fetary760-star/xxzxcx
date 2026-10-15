/**
 * Alternate Consumable Declaration Form
 * 
 * AMENDED: Full API integration via useFormData hook
 * - Save/Load from backend
 * - Submit for approval
 * - File upload per form node
 * - Approval workflow actions
 * - Role-based edit/submit permissions
 */
'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Save, Send, Edit, Loader2 } from 'lucide-react'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useFormData } from '@/lib/self-evaluation/useFormData'
import { ApprovalStatus, getApprovalStatusLabel, getApprovalStatusColor } from '@/lib/self-evaluation/types'
import FileUploadPanel from '../FileUploadPanel'

interface FormData extends Record<string, unknown> {
  originalConsumablePN: string
  originalConsumableDesc: string
  alternateConsumablePN: string
  alternateConsumableDesc: string
  justification: string
  declaredBy: string
  declaredDate: string
}

export default function AlternateConsumableForm() {
  const { selectedATARecord } = useSelfEvaluation()

  const defaultData: FormData = {
    originalConsumablePN: '',
    originalConsumableDesc: '',
    alternateConsumablePN: '',
    alternateConsumableDesc: '',
    justification: '',
    declaredBy: '',
    declaredDate: '',
  }

  const {
    formData,
    setFormData,
    isEditing,
    setIsEditing,
    approvalStatus,
    formSubmissionId,
    loading,
    saving,
    canEdit,
    canSubmit,
    handleSave,
    handleSubmitForApproval,
  } = useFormData<FormData>(defaultData, {
    formType: 'alternate_consumable_declaration',
    formNo: 'MNT-ACD',
    revNo: '01',
  })

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return (
      <div className="w-full space-y-4">
        <Card className="shadow-none border-0">
          <CardHeader className="px-0 pt-0"><Skeleton className="h-6 w-64" /></CardHeader>
          <CardContent className="space-y-4 px-0 pb-0">
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (<Skeleton key={i} className="h-9 w-full" />))}
            </div>
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="w-full space-y-4">
      <Card className="shadow-none border-0">
        <CardHeader className="pb-3 px-0 pt-0">
          <div className="flex items-center justify-end">
            <div className="flex items-center gap-2">
              <Badge className={getApprovalStatusColor(approvalStatus)}>{getApprovalStatusLabel(approvalStatus)}</Badge>
              {canEdit && !isEditing && (
                <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit className="h-3.5 w-3.5 mr-1" />Edit
                </Button>
              )}
              {isEditing && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>Cancel</Button>
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleSave()} disabled={saving}>
                    {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}Save
                  </Button>
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-0 pb-0">
          <h4 className="text-xs font-semibold text-gray-600">Original Consumable</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="text-[10px] text-gray-500 uppercase">P/N</Label><Input value={formData.originalConsumablePN} onChange={(e) => handleChange('originalConsumablePN', e.target.value)} disabled={!isEditing} className="h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-[10px] text-gray-500 uppercase">Description</Label><Input value={formData.originalConsumableDesc} onChange={(e) => handleChange('originalConsumableDesc', e.target.value)} disabled={!isEditing} className="h-9 text-sm" /></div>
          </div>
          <h4 className="text-xs font-semibold text-gray-600">Alternate Consumable</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="text-[10px] text-gray-500 uppercase">P/N</Label><Input value={formData.alternateConsumablePN} onChange={(e) => handleChange('alternateConsumablePN', e.target.value)} disabled={!isEditing} className="h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-[10px] text-gray-500 uppercase">Description</Label><Input value={formData.alternateConsumableDesc} onChange={(e) => handleChange('alternateConsumableDesc', e.target.value)} disabled={!isEditing} className="h-9 text-sm" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-[10px] text-gray-500 uppercase">Justification</Label><Textarea value={formData.justification} onChange={(e) => handleChange('justification', e.target.value)} disabled={!isEditing} rows={4} className="text-sm" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label className="text-[10px] text-gray-500 uppercase">Declared By</Label><Input value={formData.declaredBy} onChange={(e) => handleChange('declaredBy', e.target.value)} disabled={!isEditing} className="h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-[10px] text-gray-500 uppercase">Declared Date</Label><Input type="date" value={formData.declaredDate} onChange={(e) => handleChange('declaredDate', e.target.value)} disabled={!isEditing} className="h-9 text-sm" /></div>
          </div>
        </CardContent>
      </Card>

      {/* Approval Workflow Actions */}
      {/* File Upload Panel */}
      {selectedATARecord && (
        <FileUploadPanel ataRecordId={selectedATARecord.id} formSubmissionId={formSubmissionId || undefined} formNodeType="alternate_consumable_declaration" canUpload={canEdit} canApproveFiles={false} />
      )}

      {/* Submit Button */}
      <div className="flex justify-end items-center pt-2">
        {!formSubmissionId && canSubmit && (approvalStatus === ApprovalStatus.Draft || approvalStatus === ApprovalStatus.Returned) && (
          <Button className="bg-blue-600 hover:bg-blue-700" size="sm" onClick={handleSubmitForApproval} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
            Submit for Approval
          </Button>
        )}
      </div>
    </div>
  )
}