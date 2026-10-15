/**
 * Repair Facility Requirement Evaluation Form
 * 
 * AMENDED: Full API integration via useFormData hook
 * - Save/Load from backend (supports array/table data)
 * - Submit for approval
 * - File upload per form node
 * - Approval workflow actions
 * - Role-based edit/submit permissions
 * 
 * Also used as base for CleaningFacilityEvaluationForm and EnvironmentalFacilityEvaluationForm
 */
'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Save, Send, Edit, Plus, Trash2, Loader2 } from 'lucide-react'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useFormData } from '@/lib/self-evaluation/useFormData'
import { ApprovalStatus, getApprovalStatusLabel, getApprovalStatusColor } from '@/lib/self-evaluation/types'
import type { FormNodeType } from '@/lib/self-evaluation/types'
import FileUploadPanel from '../FileUploadPanel'

interface EvalItem {
  id: string
  requirement: string
  available: boolean
  remarks: string
}

interface FormData extends Record<string, unknown> {
  items: EvalItem[]
  evaluatedBy: string
  evaluatedDate: string
  approvedBy: string
  approvedDate: string
}

interface Props {
  formType?: FormNodeType
  title?: string
}

export default function RepairFacilityEvaluationForm({
  formType = 'repair_facility_evaluation',
}: Props) {
  const { selectedATARecord } = useSelfEvaluation()

  const defaultData: FormData = {
    items: [],
    evaluatedBy: '',
    evaluatedDate: '',
    approvedBy: '',
    approvedDate: '',
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
    formType,
    formNo: 'MNT-RFE',
    revNo: '01',
  })

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { id: `rf-${Date.now()}`, requirement: '', available: false, remarks: '' }],
    }))
  }

  const removeItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(i => i.id !== id),
    }))
  }

  const updateItem = (id: string, field: keyof EvalItem, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(i => i.id === id ? { ...i, [field]: value } : i),
    }))
  }

  const handleFieldChange = (field: 'evaluatedBy' | 'evaluatedDate' | 'approvedBy' | 'approvedDate', value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  if (loading) {
    return (
      <div className="w-full space-y-4">
        <Card className="shadow-none border-0">
          <CardHeader className="px-0 pt-0"><Skeleton className="h-6 w-64" /></CardHeader>
          <CardContent className="px-0 pb-0"><Skeleton className="h-40 w-full" /></CardContent>
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
          <table className="w-full text-xs border">
            <thead className="bg-gray-50">
              <tr>
                <th className="border px-2 py-1.5 w-8">#</th>
                <th className="border px-2 py-1.5">Requirement</th>
                <th className="border px-2 py-1.5 w-16">Available</th>
                <th className="border px-2 py-1.5">Remarks</th>
                {isEditing && <th className="border px-2 py-1.5 w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {formData.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="border px-2 py-1 text-center">{idx + 1}</td>
                  <td className="border px-1 py-1"><Input value={item.requirement} onChange={(e) => updateItem(item.id, 'requirement', e.target.value)} disabled={!isEditing} className="h-7 text-xs border-0" /></td>
                  <td className="border px-2 py-1 text-center"><Checkbox checked={item.available} onCheckedChange={(v) => updateItem(item.id, 'available', !!v)} disabled={!isEditing} /></td>
                  <td className="border px-1 py-1"><Input value={item.remarks} onChange={(e) => updateItem(item.id, 'remarks', e.target.value)} disabled={!isEditing} className="h-7 text-xs border-0" /></td>
                  {isEditing && <td className="border px-1 py-1 text-center"><Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => removeItem(item.id)}><Trash2 className="h-3 w-3" /></Button></td>}
                </tr>
              ))}
              {formData.items.length === 0 && <tr><td colSpan={isEditing ? 5 : 4} className="border px-4 py-3 text-center text-gray-400 italic">No items added yet</td></tr>}
            </tbody>
          </table>
          {isEditing && <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" />Add Requirement</Button>}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
            <div className="space-y-1.5"><Label className="text-[10px] text-gray-500 uppercase">Evaluated By</Label><Input value={formData.evaluatedBy} onChange={(e) => handleFieldChange('evaluatedBy', e.target.value)} disabled={!isEditing} className="h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-[10px] text-gray-500 uppercase">Evaluated Date</Label><Input type="date" value={formData.evaluatedDate} onChange={(e) => handleFieldChange('evaluatedDate', e.target.value)} disabled={!isEditing} className="h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-[10px] text-gray-500 uppercase">Approved By</Label><Input value={formData.approvedBy} onChange={(e) => handleFieldChange('approvedBy', e.target.value)} disabled={!isEditing} className="h-9 text-sm" /></div>
            <div className="space-y-1.5"><Label className="text-[10px] text-gray-500 uppercase">Approved Date</Label><Input type="date" value={formData.approvedDate} onChange={(e) => handleFieldChange('approvedDate', e.target.value)} disabled={!isEditing} className="h-9 text-sm" /></div>
          </div>
        </CardContent>
      </Card>

      {/* Approval Workflow Actions */}
      {/* File Upload Panel */}
      {selectedATARecord && (
        <FileUploadPanel ataRecordId={selectedATARecord.id} formSubmissionId={formSubmissionId || undefined} formNodeType={formType} canUpload={canEdit} canApproveFiles={false} />
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