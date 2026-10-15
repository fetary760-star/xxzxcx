/**
 * List of Required Consumables Form
 * 
 * AMENDED: Full API integration via useFormData hook
 * - Save/Load from backend (supports array/table data)
 * - Submit for approval
 * - File upload per form node
 * - Approval workflow actions
 * - Role-based edit/submit permissions
 */
'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Save, Send, Edit, Plus, Trash2, Loader2 } from 'lucide-react'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useFormData } from '@/lib/self-evaluation/useFormData'
import { ApprovalStatus, getApprovalStatusLabel, getApprovalStatusColor } from '@/lib/self-evaluation/types'
import FileUploadPanel from '../FileUploadPanel'

interface ConsumableItem {
  id: string
  partNumber: string
  description: string
  specification: string
  quantityRequired: string
  shelfLife: string
  remarks: string
}

interface FormData extends Record<string, unknown> {
  items: ConsumableItem[]
}

export default function ConsumablesListForm() {
  const { selectedATARecord } = useSelfEvaluation()

  const defaultData: FormData = {
    items: [],
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
    formType: 'list_of_consumables',
    formNo: 'MNT-CON',
    revNo: '01',
  })

  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { id: `con-${Date.now()}`, partNumber: '', description: '', specification: '', quantityRequired: '', shelfLife: '', remarks: '' }],
    }))
  }

  const removeItem = (id: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(i => i.id !== id),
    }))
  }

  const updateItem = (id: string, field: keyof ConsumableItem, value: string) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(i => i.id === id ? { ...i, [field]: value } : i),
    }))
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
                <th className="border px-2 py-1.5">P/N</th>
                <th className="border px-2 py-1.5">Description</th>
                <th className="border px-2 py-1.5">Specification</th>
                <th className="border px-2 py-1.5 w-16">Qty</th>
                <th className="border px-2 py-1.5 w-20">Shelf Life</th>
                <th className="border px-2 py-1.5">Remarks</th>
                {isEditing && <th className="border w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {formData.items.map((item, idx) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="border px-2 py-1 text-center">{idx + 1}</td>
                  <td className="border px-1 py-1"><Input value={item.partNumber} onChange={(e) => updateItem(item.id, 'partNumber', e.target.value)} disabled={!isEditing} className="h-7 text-xs border-0" /></td>
                  <td className="border px-1 py-1"><Input value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)} disabled={!isEditing} className="h-7 text-xs border-0" /></td>
                  <td className="border px-1 py-1"><Input value={item.specification} onChange={(e) => updateItem(item.id, 'specification', e.target.value)} disabled={!isEditing} className="h-7 text-xs border-0" /></td>
                  <td className="border px-1 py-1"><Input value={item.quantityRequired} onChange={(e) => updateItem(item.id, 'quantityRequired', e.target.value)} disabled={!isEditing} className="h-7 text-xs border-0" /></td>
                  <td className="border px-1 py-1"><Input value={item.shelfLife} onChange={(e) => updateItem(item.id, 'shelfLife', e.target.value)} disabled={!isEditing} className="h-7 text-xs border-0" /></td>
                  <td className="border px-1 py-1"><Input value={item.remarks} onChange={(e) => updateItem(item.id, 'remarks', e.target.value)} disabled={!isEditing} className="h-7 text-xs border-0" /></td>
                  {isEditing && <td className="border px-1 py-1 text-center"><Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => removeItem(item.id)}><Trash2 className="h-3 w-3" /></Button></td>}
                </tr>
              ))}
              {formData.items.length === 0 && <tr><td colSpan={isEditing ? 8 : 7} className="border px-4 py-3 text-center text-gray-400 italic">No consumables added yet</td></tr>}
            </tbody>
          </table>
          {isEditing && <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-3.5 w-3.5 mr-1" />Add Consumable</Button>}
        </CardContent>
      </Card>

      {/* Approval Workflow Actions */}
      {/* File Upload Panel */}
      {selectedATARecord && (
        <FileUploadPanel ataRecordId={selectedATARecord.id} formSubmissionId={formSubmissionId || undefined} formNodeType="list_of_consumables" canUpload={canEdit} canApproveFiles={false} />
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