/**
 * Generic Training Form - covers Component Maintenance Training,
 * Inspector Proficiency, and Competency Assessment Declaration
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
import type { FormNodeType } from '@/lib/self-evaluation/types'
import FileUploadPanel from '../FileUploadPanel'

interface TrainingRecord {
  id: string
  employeeName: string
  employeeId: string
  qualification: string
  trainingDate: string
  expiryDate: string
  certificateRef: string
  remarks: string
}

interface FormData extends Record<string, unknown> {
  records: TrainingRecord[]
}

interface Props {
  formType: 'component_maintenance' | 'inspector_proficiency' | 'competency_assessment'
}

const FORM_NODE_TYPE_MAP: Record<string, FormNodeType> = {
  component_maintenance: 'component_maintenance_training',
  inspector_proficiency: 'inspector_proficiency',
  competency_assessment: 'competency_assessment',
}

export default function GenericTrainingForm({ formType }: Props) {
  const { selectedATARecord } = useSelfEvaluation()

  const formNodeType = FORM_NODE_TYPE_MAP[formType]

  const defaultData: FormData = {
    records: [],
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
    formType: formNodeType,
    formNo: `MNT-${formType.toUpperCase().substring(0, 3)}`,
    revNo: '01',
  })

  const addRecord = () => {
    setFormData(prev => ({
      ...prev,
      records: [...prev.records, {
        id: `tr-${Date.now()}`,
        employeeName: '',
        employeeId: '',
        qualification: '',
        trainingDate: '',
        expiryDate: '',
        certificateRef: '',
        remarks: '',
      }],
    }))
  }

  const removeRecord = (id: string) => {
    setFormData(prev => ({
      ...prev,
      records: prev.records.filter(r => r.id !== id),
    }))
  }

  const updateRecord = (id: string, field: keyof TrainingRecord, value: string) => {
    setFormData(prev => ({
      ...prev,
      records: prev.records.map(r => r.id === id ? { ...r, [field]: value } : r),
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
          <div className="overflow-x-auto">
            <table className="w-full text-xs border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="border px-2 py-1.5">Employee Name</th>
                  <th className="border px-2 py-1.5 w-20">ID</th>
                  <th className="border px-2 py-1.5">Qualification</th>
                  <th className="border px-2 py-1.5 w-24">Training Date</th>
                  <th className="border px-2 py-1.5 w-24">Expiry Date</th>
                  <th className="border px-2 py-1.5">Certificate Ref</th>
                  <th className="border px-2 py-1.5">Remarks</th>
                  {isEditing && <th className="border px-2 py-1.5 w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {formData.records.map(record => (
                  <tr key={record.id} className="hover:bg-gray-50">
                    <td className="border px-1 py-1"><Input value={record.employeeName} onChange={(e) => updateRecord(record.id, 'employeeName', e.target.value)} disabled={!isEditing} className="h-7 text-xs border-0" /></td>
                    <td className="border px-1 py-1"><Input value={record.employeeId} onChange={(e) => updateRecord(record.id, 'employeeId', e.target.value)} disabled={!isEditing} className="h-7 text-xs border-0" /></td>
                    <td className="border px-1 py-1"><Input value={record.qualification} onChange={(e) => updateRecord(record.id, 'qualification', e.target.value)} disabled={!isEditing} className="h-7 text-xs border-0" /></td>
                    <td className="border px-1 py-1"><Input type="date" value={record.trainingDate} onChange={(e) => updateRecord(record.id, 'trainingDate', e.target.value)} disabled={!isEditing} className="h-7 text-xs border-0" /></td>
                    <td className="border px-1 py-1"><Input type="date" value={record.expiryDate} onChange={(e) => updateRecord(record.id, 'expiryDate', e.target.value)} disabled={!isEditing} className="h-7 text-xs border-0" /></td>
                    <td className="border px-1 py-1"><Input value={record.certificateRef} onChange={(e) => updateRecord(record.id, 'certificateRef', e.target.value)} disabled={!isEditing} className="h-7 text-xs border-0" /></td>
                    <td className="border px-1 py-1"><Input value={record.remarks} onChange={(e) => updateRecord(record.id, 'remarks', e.target.value)} disabled={!isEditing} className="h-7 text-xs border-0" /></td>
                    {isEditing && <td className="border px-1 py-1 text-center"><Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => removeRecord(record.id)}><Trash2 className="h-3 w-3" /></Button></td>}
                  </tr>
                ))}
                {formData.records.length === 0 && <tr><td colSpan={isEditing ? 8 : 7} className="border px-4 py-3 text-center text-gray-400 italic">No training records added yet</td></tr>}
              </tbody>
            </table>
          </div>
          {isEditing && <Button size="sm" variant="outline" onClick={addRecord}><Plus className="h-3.5 w-3.5 mr-1" />Add Record</Button>}
        </CardContent>
      </Card>

      {/* Approval Workflow Actions */}
      {/* File Upload Panel */}
      {selectedATARecord && (
        <FileUploadPanel ataRecordId={selectedATARecord.id} formSubmissionId={formSubmissionId || undefined} formNodeType={formNodeType} canUpload={canEdit} canApproveFiles={false} />
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