/**
 * useFormData Hook — FULLY AMENDED v4
 *
 * Custom hook for form components to integrate with the backend API.
 * Handles:
 * - Loading existing form data from backend
 * - Saving form data to backend (create/update)
 * - Submitting forms for approval
 * - Managing form state (editing, loading, saving)
 * - Supports both simple key-value forms AND complex forms with arrays/tables
 *
 * v4 CRITICAL FIX — this hook caused the reported crash:
 *
 *   "Save Failed
 *    (0, _api_WEBPACK_IMPORTED_MODULE_4_.createFormSubmission) is not a function"
 *
 * It imported `createFormSubmission`, `updateFormSubmission` and `submitForm`,
 * but `./api` exported none of them (only `saveForm`, `updateForm`,
 * `submitFormForApproval`). Webpack resolved the imports to `undefined`, so the
 * very first save threw before any HTTP request was made. `./api` now exports
 * all three with the correct routes and payloads, and this hook passes the
 * fields the MediatR commands actually bind (`formNo`, `revNo`, `revDate`,
 * `formDataJson`).
 *
 * v4 also makes the hook hierarchy-aware: `canApprove` is derived from the
 * normalized role and the current approval stage, so Special Team Leaders,
 * Shop Managers, Shop Team Leaders, Certifying Staff, QA and ECAA personnel all
 * receive the actions that belong to them.
 */
'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSelfEvaluation } from './context'
import { useAuth } from '@/lib/auth-context'
import { normalizeRole } from '@/lib/role-utils'
import {
  getFormByType,
  createFormSubmission,
  updateFormSubmission,
  submitForm,
  getFormsByATARecord,
  getATARecordById,
} from './api'
import type { FormNodeType, UserRole } from './types'
import { ApprovalStatus, getRolePermissions, canPerformAction } from './types'
import { TOC_CATEGORIES } from './toc-structure'
import { useToast } from '@/hooks/use-toast'

interface UseFormDataOptions {
  formType: FormNodeType
  formNo?: string
  revNo?: string
  /** Optional ISO date for the form revision. */
  revDate?: string | null
  /** Optional migration hook for legacy payloads when a form's controlled layout changes. */
  normalizeData?: (data: Partial<Record<string, unknown>>) => Partial<Record<string, unknown>>
}

interface UseFormDataReturn<T> {
  formData: T
  setFormData: React.Dispatch<React.SetStateAction<T>>
  isEditing: boolean
  setIsEditing: (editing: boolean) => void
  approvalStatus: ApprovalStatus
  formSubmissionId: string | null
  loading: boolean
  saving: boolean
  canEdit: boolean
  canSubmit: boolean
  submissionGateMessage: string | null
  /** True when the signed-in role owns the current approval stage. */
  canApprove: boolean
  /** Normalized role of the signed-in user, e.g. "special_team_leader". */
  userRole: UserRole
  handleSave: (data?: T, refreshAfterSave?: boolean) => Promise<boolean>
  handleSaveAndSubmit: () => Promise<boolean>
  handleSubmitForApproval: () => Promise<void>
  loadFromBackend: () => Promise<void>
}

const PARALLEL_FORM_TYPES = new Set(
  TOC_CATEGORIES.flatMap(category => [
    ...category.forms.map(form => form.formType),
    ...(category.subGroups ?? []).flatMap(group => group.forms.map(form => form.formType)),
  ]),
)

function prerequisiteFormTypes(formType: string): string[] {
  if (formType === 'periodic_self_audit') return [...PARALLEL_FORM_TYPES]
  if (formType === 'confirmation_letter' || formType === 'request_letter') return ['periodic_self_audit']
  if (formType === '918_faa' || formType === '918a_caa') return ['confirmation_letter', 'request_letter']
  return []
}

const PREREQUISITE_LABELS: Record<string, string> = {
  periodic_self_audit: 'Periodic Capability Self-Audit (MNT-1325)',
  confirmation_letter: 'Letter of Confirmation',
  request_letter: 'Amendment Request',
}

export function useFormData<T extends Record<string, unknown>>(
  defaultData: T,
  options: UseFormDataOptions
): UseFormDataReturn<T> {
  const {
    selectedATARecord,
    activeFormType,
    editRequestKey,
    triggerRefresh,
    markFormRevisionDraft,
    clearFormRevisionDraft,
  } = useSelfEvaluation()
  const { user } = useAuth()
  const { toast } = useToast()

  // Use centralized normalizeRole() so PascalCase backend roles
  // ("SpecialTeamLeader", "ShopTeamLeader", "QAPersonnel") map correctly.
  const userRole = normalizeRole(user?.role) as UserRole
  const permissions = getRolePermissions(userRole)

  const [formData, setFormData] = useState<T>(defaultData)
  const [isEditing, setIsEditing] = useState(false)
  const [approvalStatus, setApprovalStatus] = useState<ApprovalStatus>(ApprovalStatus.Draft)
  const [formSubmissionId, setFormSubmissionId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [ataWorkflowApproved, setAtaWorkflowApproved] = useState(false)
  const [workflowGateChecked, setWorkflowGateChecked] = useState(false)
  const [missingPrerequisites, setMissingPrerequisites] = useState<string[]>([])

  // Use ref to track latest formSubmissionId for submit flow
  const formSubmissionIdRef = useRef<string | null>(null)
  formSubmissionIdRef.current = formSubmissionId
  const submitInFlightRef = useRef(false)
  // A rejected submission becomes a local draft after its correction is saved. Keep
  // that state through the refresh triggered by save; the server remains Rejected
  // until the user submits the corrected form.
  const revisionDraftKeyRef = useRef<string | null>(null)

  // Determine if user can edit based on role and status
  const canEdit = !loading && (permissions.canEdit || approvalStatus === ApprovalStatus.Rejected) && (
    approvalStatus === ApprovalStatus.Draft ||
    approvalStatus === ApprovalStatus.Returned ||
    approvalStatus === ApprovalStatus.Rejected ||
    approvalStatus === ApprovalStatus.PendingAssignment ||
    (userRole === 'special_admin' &&
      ['training_verification_inspection', 'training_verification_technician', 'competency_assessment'].includes(options.formType) &&
      approvalStatus === ApprovalStatus.PendingSpecialTeamLeaderApproval)
  )
  const canSubmit = !loading && ataWorkflowApproved && workflowGateChecked && missingPrerequisites.length === 0 && permissions.canSubmit && (
    approvalStatus === ApprovalStatus.Draft ||
    approvalStatus === ApprovalStatus.Returned
  )
  const submissionGateMessage = !workflowGateChecked
    ? 'Checking required preceding approvals before enabling this workflow step.'
    : !ataWorkflowApproved
      ? 'Complete and approve the ATA Record Workflow before continuing.'
      : missingPrerequisites.length > 0
        ? `Complete and approve these required steps before continuing: ${missingPrerequisites
            .map(type => PREREQUISITE_LABELS[type] ?? type)
            .join(', ')}.`
        : null
  // Hierarchy-aware: only the role that owns the current stage may approve.
  const canApprove = canPerformAction('approve', approvalStatus, userRole)

  // Load form data from backend
  const loadFromBackend = useCallback(async () => {
    if (!selectedATARecord?.id) {
      revisionDraftKeyRef.current = null
      setLoading(false)
      return
    }

    const formKey = `${selectedATARecord.id}:${options.formType}`
    if (revisionDraftKeyRef.current && revisionDraftKeyRef.current !== formKey) {
      revisionDraftKeyRef.current = null
    }

    setLoading(true)
    setWorkflowGateChecked(false)
    setMissingPrerequisites([])
    try {
      const [loadedForm, ataRecord] = await Promise.all([
        getFormByType(selectedATARecord.id, options.formType),
        getATARecordById(selectedATARecord.id),
      ])
      let existingForm = loadedForm
      // TNA has legacy aliases and may have both an empty Draft row and the
      // real rejected workflow row. Prefer the workflow row for the editor.
      if (
        existingForm?.approvalStatus === ApprovalStatus.Draft &&
        (options.formType === 'tna' || options.formType === 'tool_need_analysis_report')
      ) {
        const aliases = new Set(['tna', 'tool_need_analysis_report'])
        const matchingForms = (await getFormsByATARecord(selectedATARecord.id))
          .filter(form => aliases.has(form.formType.trim().toLowerCase()))
        existingForm = matchingForms.find(form => form.approvalStatus === ApprovalStatus.Rejected) ??
          matchingForms.find(form => form.approvalStatus !== ApprovalStatus.Draft) ??
          existingForm
      }
      setAtaWorkflowApproved(ataRecord?.approvalStatus === ApprovalStatus.Approved)
      const prerequisites = prerequisiteFormTypes(options.formType)
      if (prerequisites.length === 0) {
        setMissingPrerequisites([])
      } else {
        const siblingForms = await getFormsByATARecord(selectedATARecord.id)
        const approved = new Set(
          siblingForms
            .filter(form => form.approvalStatus === ApprovalStatus.Approved)
            .map(form => form.formType),
        )
        setMissingPrerequisites(prerequisites.filter(type => !approved.has(type)))
      }
      setWorkflowGateChecked(true)
      if (existingForm) {
        setFormSubmissionId(existingForm.id)
        formSubmissionIdRef.current = existingForm.id
        setApprovalStatus(
          revisionDraftKeyRef.current === formKey
            ? ApprovalStatus.Draft
            : existingForm.approvalStatus as ApprovalStatus,
        )
        // Parse the JSON form data
        try {
          const parsedData = JSON.parse(existingForm.formDataJson) as Partial<Record<string, unknown>>
          const normalizedData = options.normalizeData
            ? options.normalizeData(parsedData)
            : parsedData
          setFormData(prev => ({ ...prev, ...normalizedData } as T))
        } catch {
          // If JSON parsing fails, keep default data
        }
      } else {
        setFormSubmissionId(null)
        formSubmissionIdRef.current = null
        setApprovalStatus(ApprovalStatus.Draft)
      }
    } catch (err) {
      console.error('Failed to load form data:', err)
    } finally {
      setLoading(false)
    }
  }, [selectedATARecord?.id, options.formType])

  // Load on mount and when ATA record changes
  useEffect(() => {
    loadFromBackend()
  }, [loadFromBackend])

  useEffect(() => {
    if (editRequestKey > 0 && activeFormType === options.formType) {
      setIsEditing(true)
    }
  }, [activeFormType, editRequestKey, options.formType])

  // Save form data - returns true on success
  const handleSave = async (data?: T, refreshAfterSave = true): Promise<boolean> => {
    if (!selectedATARecord?.id) {
      toast({ title: 'Error', description: 'No ATA record selected', variant: 'destructive' })
      return false
    }

    const dataToSave = data || formData
    setSaving(true)
    try {
      const formDataJson = JSON.stringify(dataToSave)

      if (formSubmissionIdRef.current) {
        // Update existing — matches UpdateFormSubmissionCommand
        await updateFormSubmission(formSubmissionIdRef.current, {
          formNo: options.formNo || '',
          revNo: options.revNo || '',
          revDate: options.revDate ?? null,
          formDataJson,
          updatedBy: user?.username || '',
        })
        if (approvalStatus === ApprovalStatus.Rejected) {
          revisionDraftKeyRef.current = `${selectedATARecord.id}:${options.formType}`
          markFormRevisionDraft(selectedATARecord.id, options.formType)
          setApprovalStatus(ApprovalStatus.Draft)
        }
      } else {
        // Create new — matches CreateFormSubmissionCommand
        const result = await createFormSubmission({
          ataRecordId: selectedATARecord.id,
          formType: options.formType,
          formNo: options.formNo || '',
          revNo: options.revNo || '',
          revDate: options.revDate ?? null,
          formDataJson,
          createdBy: user?.username || '',
        })

        if (!result?.id) {
          throw new Error('The server did not return a form id. Please retry.')
        }

        setFormSubmissionId(result.id)
        formSubmissionIdRef.current = result.id
      }

      setIsEditing(false)
      if (refreshAfterSave) triggerRefresh()
      toast({ title: 'Saved', description: 'Form data saved successfully.' })
      return true
    } catch (err) {
      toast({
        title: 'Save Failed',
        description: err instanceof Error ? err.message : 'Failed to save form data',
        variant: 'destructive',
      })
      return false
    } finally {
      setSaving(false)
    }
  }

  const submitSavedForm = async (ataRecordId: string): Promise<boolean> => {
    const currentId = formSubmissionIdRef.current
    if (!currentId) {
      toast({ title: 'Error', description: 'Please save the form first', variant: 'destructive' })
      return false
    }

    setSaving(true)
    try {
      setApprovalStatus(ApprovalStatus.PendingTeamLeaderReview)
      await submitForm(currentId)
      clearFormRevisionDraft(ataRecordId, options.formType)
      triggerRefresh()
      toast({ title: 'Submitted', description: 'The review actions are now available.' })
      return true
    } catch (err) {
      toast({
        title: 'Submit Failed',
        description: err instanceof Error ? err.message : 'Failed to submit for approval',
        variant: 'destructive',
      })
      return false
    } finally {
      setSaving(false)
    }
  }

  // Submit for approval - properly chains save then submit
  const handleSubmitForApproval = async () => {
    if (!canSubmit || submitInFlightRef.current) return
    submitInFlightRef.current = true
    const ataRecordId = selectedATARecord?.id
    if (!ataRecordId) {
      toast({ title: 'Error', description: 'No ATA record selected', variant: 'destructive' })
      submitInFlightRef.current = false
      return
    }
    try {
      // Always save first to ensure data is persisted.
      // Keep the workspace on the current correction state until the submit
      // transition succeeds; refreshing between PUT and POST briefly exposes
      // Draft and can render a second Submit action.
      const saveSuccess = await handleSave(undefined, false)
      if (!saveSuccess) return

      await submitSavedForm(ataRecordId)
    } catch (err) {
      toast({
        title: 'Submit Failed',
        description: err instanceof Error ? err.message : 'Failed to submit for approval',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
      submitInFlightRef.current = false
    }
  }

  // Shop Team Leader training forms use Save as the submit action.
  const handleSaveAndSubmit = async (): Promise<boolean> => {
    if (!canSubmit || submitInFlightRef.current) return false
    submitInFlightRef.current = true
    const ataRecordId = selectedATARecord?.id
    if (!ataRecordId) {
      toast({ title: 'Error', description: 'No ATA record selected', variant: 'destructive' })
      submitInFlightRef.current = false
      return false
    }

    try {
      const saveSuccess = await handleSave(undefined, false)
      return saveSuccess ? await submitSavedForm(ataRecordId) : false
    } finally {
      submitInFlightRef.current = false
    }
  }

  return {
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
    submissionGateMessage,
    canApprove,
    userRole,
    handleSave,
    handleSaveAndSubmit,
    handleSubmitForApproval,
    loadFromBackend,
  }
}