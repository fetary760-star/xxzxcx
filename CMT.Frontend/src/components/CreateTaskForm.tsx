'use client'

import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useAuth } from '@/lib/auth-context'
import { useTimezone } from '@/lib/timezone-context'
import apiClient, { TaskStatus, statusStringToEnum } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  DraggableDialog,
  DraggableDialogContent,
  DraggableDialogHeader,
  DraggableDialogTitle,
  DraggableDialogFooter,
} from '@/components/ui/draggable-dialog'
import { addCsrfHeader } from '@/lib/csrf'
import { validateFile, ACCEPT_STRING, MAX_FILE_SIZE_MB, ALLOWED_EXTENSIONS_DISPLAY } from '@/lib/file-validation'
import { getSanitizedErrorMessage, sanitizeErrorMessage } from '@/lib/error-utils'

// Types for props
interface CreateTaskFormProps {
  onClose: () => void
  onTaskCreated?: (task: any) => void
  canAssign: boolean
}

// FIXED: Added Shop type
type Shop = {
  id: number
  shop_id?: number
  shopId?: number
  name: string
  description?: string
  location?: string
  isActive?: boolean
}

// CreateTaskForm component (migrated from dashboard page)
// NOTE: Preserves all existing business logic and form behavior.
// Wrapped in DraggableDialogContent so header data-drag-handle will enable dragging and controls.
const CreateTaskForm: React.FC<CreateTaskFormProps> = ({ onClose, onTaskCreated, canAssign }) => {
  const { user } = useAuth()
  const { formatDate } = useTimezone()
  const createdById = (user?.userId ?? user?.id ?? 0) as number

  // form fields
  const [categoryId, setCategoryId] = useState<number | ''>('')
  const [subTypeId, setSubTypeId] = useState<number | ''>('')
  const [serialNumber, setSerialNumber] = useState('')
  const [partNumber, setPartNumber] = useState('')
  const [poNumber, setPoNumber] = useState('')
  const [description, setDescription] = useState('')
  const [comments, setComments] = useState('')
  const [requestTypeId, setRequestTypeId] = useState<number | ''>('')
  const [priorityId, setPriorityId] = useState<number | ''>('')
  const [status, setStatus] = useState<TaskStatus>(TaskStatus.Pending)
  const [assignedEngineers, setAssignedEngineers] = useState<string[]>([])
  const [targetDate, setTargetDate] = useState<string>('')
  const [estimatedDate, setEstimatedDate] = useState<string>('')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)

  // FIXED: Removed attachmentPreview state (no more blob URLs)

  // FIXED: Added shop-related state
  const [shopId, setShopId] = useState<number | ''>('')
  const [shops, setShops] = useState<Shop[]>([])
  const [loadingShops, setLoadingShops] = useState(false)

  // reference data
  const [priorities, setPriorities] = useState<Array<any>>([])
  const [categories, setCategories] = useState<Array<any>>([])
  const [allSubTypes, setAllSubTypes] = useState<Array<any>>([])
  const [filteredSubTypes, setFilteredSubTypes] = useState<Array<any>>([])
  const [requestTypes, setRequestTypes] = useState<Array<any>>([])
  const [engineers, setEngineers] = useState<Array<{ id: string; name: string }>>([])
  const [targetDaysData, setTargetDaysData] = useState<Array<any>>([])

  // Duplicate check state
  const [duplicateDetected, setDuplicateDetected] = useState(false)
  const [duplicateTasks, setDuplicateTasks] = useState<any[]>([])
  const [duplicateOverride, setDuplicateOverride] = useState(false)
  const [duplicateJustification, setDuplicateJustification] = useState('')
  const [showDuplicatesPanel, setShowDuplicatesPanel] = useState(false)
  const [checkingDuplicate, setCheckingDuplicate] = useState(false)
  const [lastDuplicateCheck, setLastDuplicateCheck] = useState<string>('')
  // CRITICAL: Track if duplicate is specifically a PO Number match — PO duplicates cannot be overridden
  const [hasDuplicatePoMatch, setHasDuplicatePoMatch] = useState(false)

  const [attachmentError, setAttachmentError] = useState<string | null>(null)

  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [loadingEngineers, setLoadingEngineers] = useState(false)
  const [engineersError, setEngineersError] = useState<string | null>(null)

  // CRITICAL FIX: Helper function to normalize duplicate task data from backend
  // Backend returns PascalCase (CategoryName, SubTypeName, ShopName, etc.)
  const normalizeDuplicateTask = (t: any) => {
    return {
      TaskId: t.TaskId ?? t.task_id ?? t.taskId,
      SerialNumber: t.SerialNumber ?? t.serial_number ?? t.serialNumber,
      PartNumber: t.PartNumber ?? t.part_number ?? t.partNumber,
      PoNumber: t.PoNumber ?? t.po_number ?? t.poNumber,
      Status: t.Status ?? t.status,
      AssignedEngineer: t.AssignedEngineer ?? t.assigned_engineer ?? t.assignedEngineer,
      Description: t.Description ?? t.description,
      CreatedAt: t.CreatedAt ?? t.created_at ?? t.createdAt,
      // CRITICAL FIX: Add all missing fields with proper fallback chain
      CategoryName: t.CategoryName ?? t.category_name ?? t.categoryName ?? t.category,
      SubTypeName: t.SubTypeName ?? t.sub_type_name ?? t.subTypeName ?? t.subType,
      RequestTypeName: t.RequestTypeName ?? t.request_type_name ?? t.requestTypeName ?? t.requestType,
      PriorityName: t.PriorityName ?? t.priority_name ?? t.priorityName ?? t.priority,
      ShopName: t.ShopName ?? t.shop_name ?? t.shopName ?? t.shop,
      CreatedByName: t.CreatedByName ?? t.created_by_name ?? t.createdByName ?? t.creator_name ?? t.creatorName,
      Comments: t.Comments ?? t.comments,
      EstimatedCompletionDate: t.EstimatedCompletionDate ?? t.estimated_completion_date ?? t.estimatedCompletionDate,
      TargetCompletionDate: t.TargetCompletionDate ?? t.target_completion_date ?? t.targetCompletionDate,
      ActualCompletionDate: t.ActualCompletionDate ?? t.actual_completion_date ?? t.actualCompletionDate,
    }
  }

  // Helper function to build authenticated headers
  const buildAuthHeaders = () => {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    }

    const token = localStorage.getItem('auth_token') || localStorage.getItem('authToken')
    if (token) {
      headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`
    }

    return headers
  }

  // Helper function to determine which API endpoints to use based on user role
  const getApiEndpoints = () => {
    const userRole = user?.role ?? user?.role_name ?? user?.roleName ?? ''
    const normalizedRole = String(userRole).toLowerCase().replace(/[\s\-]+/g, '_')

    const useReferenceEndpoints = ['customer_personnel', 'customer', 'customerpersonnel'].includes(normalizedRole)

    const baseUrl = useReferenceEndpoints ? '/api/reference-data' : '/api/management'

    return {
      priorities: `${baseUrl}/priorities`,
      categories: `${baseUrl}/categories`,
      subtypes: `${baseUrl}/subtypes`,
      requestTypes: `${baseUrl}/request-types`,
      targetDays: `${baseUrl}/target-days`,
      users: useReferenceEndpoints ? '/api/users' : '/api/management/users',
      isCustomerPersonnel: useReferenceEndpoints
    }
  }

  // FIXED: Added function to load shops
  const loadShops = async () => {
    setLoadingShops(true)
    try {
      const authHeaders = buildAuthHeaders()
      const shopsData = await fetchWithErrorHandling('/api/shops', authHeaders)
      const shopsList = Array.isArray(shopsData) ? shopsData : shopsData?.data ?? []
      setShops(shopsList)
      
      // FIXED: Auto-select user's assigned shop if available (only use shopId)
      if (user?.shopId) {
        setShopId(Number(user.shopId))
      }
    } catch (error) {
      console.error('❌ Failed to load shops:', error)
      setShops([])
    } finally {
      setLoadingShops(false)
    }
  }

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    setEstimatedDate(today)
  }, [])

  const fetchWithErrorHandling = async (url: string, headers: Record<string, string>) => {
    const startTime = performance.now()
    try {
      const response = await fetch(url, {
        credentials: 'include',
        headers,
        cache: 'no-cache'
      })

      if (!response.ok) {
        // SECURITY FIX: Log full error details to console for debugging only
        const errorText = await response.text().catch(() => '')
        console.error(`❌ Error response from ${url}:`, response.status, errorText)
        
        // SECURITY FIX: Throw a sanitized error message — never include raw HTML
        // or server error text in the thrown error. Use the centralized utility
        // to generate a safe, user-friendly message based on the HTTP status code.
        const safeMessage = getSanitizedErrorMessage(response.status)
        throw new Error(safeMessage)
      }

      const text = await response.text()

      if (!text || text.trim() === '') {
        console.warn(`⚠️ Empty response from ${url}`)
        return []
      }

      try {
        const data = JSON.parse(text)
        return data
      } catch (jsonError) {
        console.error(`❌ JSON parse error for ${url}:`, jsonError)
        console.error(`Raw response: "${text.substring(0, 200)}..."`)
        throw new Error(`Invalid JSON response from ${url}`)
      }
    } catch (error) {
      const totalTime = performance.now() - startTime
      console.error(`❌ Fetch error for ${url} (${totalTime.toFixed(2)}ms):`, error)
      throw error
    }
  }

  const loadEngineersOptimized = async () => {
    if (!canAssign) {
      setEngineers([])
      return
    }

    const startTime = performance.now()
    setLoadingEngineers(true)
    setEngineersError(null)

    try {
      const authHeaders = buildAuthHeaders()

      const engineersData = await fetchWithErrorHandling('/api/engineers', authHeaders)
      const engineersList = Array.isArray(engineersData) ? engineersData : []

      const formattedEngineers = engineersList.map((e: any) => ({
        id: String(e.user_id ?? e.userId ?? e.id ?? e.Id ?? e.value ?? 'unknown'),
        name: e.full_name ?? e.fullName ?? e.name ?? e.Name ?? e.username ?? e.Username ?? e.email ?? 'Unknown User'
      }))

      setEngineers(formattedEngineers)

      if (formattedEngineers.length === 0) {
        setEngineersError('No engineers found in the database. Please check the Manage User section and ensure users have the Engineer role.')
      }
    } catch (error: any) {
      const totalTime = performance.now() - startTime
      console.error(`❌ Failed to load engineers in ${totalTime.toFixed(2)}ms:`, error)
      
      // SECURITY FIX: Use sanitized error message instead of raw error.message
      // The error.message from fetchWithErrorHandling is already sanitized,
      // but we add an additional layer of protection here using sanitizeErrorMessage.
      const safeMessage = sanitizeErrorMessage(
        error?.message,
        'An error occurred while loading engineers. Please try again later.'
      )
      setEngineersError(safeMessage)
      setEngineers([])
    } finally {
      setLoadingEngineers(false)
    }
  }

  useEffect(() => {
    let mounted = true
    const loadAllData = async () => {
      try {
        const authHeaders = buildAuthHeaders()
        const endpoints = getApiEndpoints()

        const [prioritiesData, categoriesData, requestTypesData, subTypesData, targetDaysData] = await Promise.allSettled([
          fetchWithErrorHandling(endpoints.priorities, authHeaders),
          fetchWithErrorHandling(endpoints.categories, authHeaders),
          fetchWithErrorHandling(endpoints.requestTypes, authHeaders),
          fetchWithErrorHandling(endpoints.subtypes, authHeaders),
          // FIX: Always fetch target days for ALL roles (including customer_personnel and shop_tl)
          // so that "Category Target Duration" can be auto-calculated for everyone
          fetchWithErrorHandling(endpoints.targetDays, authHeaders)
        ])

        if (!mounted) return

        if (prioritiesData.status === 'fulfilled') {
          const priorities = Array.isArray(prioritiesData.value) ? prioritiesData.value : prioritiesData.value?.data ?? []
          setPriorities(priorities)
        } else {
          console.error('❌ Failed to load priorities:', prioritiesData.reason)
          setPriorities([])
        }

        if (categoriesData.status === 'fulfilled') {
          const categories = Array.isArray(categoriesData.value) ? categoriesData.value : categoriesData.value?.data ?? []
          setCategories(categories)
        } else {
          console.error('❌ Failed to load categories:', categoriesData.reason)
          setCategories([])
        }

        if (requestTypesData.status === 'fulfilled') {
          const requestTypes = Array.isArray(requestTypesData.value) ? requestTypesData.value : requestTypesData.value?.data ?? []
          setRequestTypes(requestTypes)
        } else {
          console.error('❌ Failed to load request types:', requestTypesData.reason)
          setRequestTypes([])
        }

        if (subTypesData.status === 'fulfilled') {
          const subTypes = Array.isArray(subTypesData.value) ? subTypesData.value : subTypesData.value?.data ?? []
          setAllSubTypes(subTypes)
        } else {
          console.error('❌ Failed to load sub-types:', subTypesData.reason)
          setAllSubTypes([])
        }

        // FIX: Always process target days data for ALL roles (including customer_personnel and shop_tl)
        if (targetDaysData.status === 'fulfilled') {
          const targetDays = Array.isArray(targetDaysData.value) ? targetDaysData.value : targetDaysData.value?.data ?? []
          setTargetDaysData(targetDays)
        } else {
          console.error('❌ Failed to load target days:', (targetDaysData as PromiseRejectedResult).reason)
          setTargetDaysData([])
        }

        if (canAssign) {
          loadEngineersOptimized().catch(err => {
            console.error('❌ Engineers loading failed:', err)
          })
        }

        // FIXED: Load shops
        await loadShops()

      } catch (err) {
        console.error('❌ Failed to load reference data:', err)
        setPriorities([])
        setCategories([])
        setAllSubTypes([])
        setRequestTypes([])
        setTargetDaysData([])
        setEngineers([])
        setShops([])
      }
    }

    loadAllData()
    return () => { mounted = false }
  }, [canAssign])

  // FIXED: Changed comparison to check if categoryId is a number (not empty string)
  useEffect(() => {
    if (typeof categoryId === 'number') {
      const filtered = allSubTypes.filter((st: any) => {
        const stCategoryId = st.category_id ?? st.categoryId ?? st.CategoryId
        return String(stCategoryId) === String(categoryId)
      })
      setFilteredSubTypes(filtered)
      setSubTypeId('')
    } else {
      setFilteredSubTypes([])
      setSubTypeId('')
    }
  }, [categoryId, allSubTypes])

  // FIX: Auto-calculate target date for ALL roles (not just canAssign)
  // This ensures shop_tl and customer_personnel also get auto-calculated target dates
  // ENHANCED: Store full ISO datetime to preserve hours/minutes for accurate timezone display
  useEffect(() => {
    if (typeof categoryId === 'number') {
      const targetDayEntry = targetDaysData.find((td: any) => {
        const tdCategoryId = td.category_id ?? td.categoryId ?? td.CategoryId ?? td.id
        return String(tdCategoryId) === String(categoryId)
      })

      if (targetDayEntry) {
        const today = new Date()
        const targetDays = parseInt(
          targetDayEntry.target_days ??
          targetDayEntry.targetDays ??
          targetDayEntry.TargetDays ??
          targetDayEntry.days ?? '0',
          10
        )
        const targetHours = parseInt(
          targetDayEntry.target_hours ??
          targetDayEntry.targetHours ??
          targetDayEntry.TargetHours ?? '0',
          10
        )
        const targetMinutes = parseInt(
          targetDayEntry.target_minutes ??
          targetDayEntry.targetMinutes ??
          targetDayEntry.TargetMinutes ?? '0',
          10
        )

        // Check if any duration component is set
        if (targetDays > 0 || targetHours > 0 || targetMinutes > 0) {
          const targetCompletionDate = new Date(today)
          // Add days
          targetCompletionDate.setDate(today.getDate() + targetDays)
          // Add hours and minutes for more granular deadlines
          targetCompletionDate.setHours(targetCompletionDate.getHours() + targetHours)
          targetCompletionDate.setMinutes(targetCompletionDate.getMinutes() + targetMinutes)

          // Store date-only string for the date input field display
          const formattedDate = targetCompletionDate.toISOString().split('T')[0]
          setTargetDate(formattedDate)

          // Store the full ISO datetime in a data attribute for submission
          // so that hours/minutes are preserved and displayed correctly in TaskDetails
          ;(window as any).__targetCompletionDateISO = targetCompletionDate.toISOString()
        } else {
          setTargetDate('')
          ;(window as any).__targetCompletionDateISO = undefined
        }
      } else {
        setTargetDate('')
        ;(window as any).__targetCompletionDateISO = undefined
      }
    } else {
      setTargetDate('')
      ;(window as any).__targetCompletionDateISO = undefined
    }
  }, [categoryId, targetDaysData])

  // FIXED: Removed blob URL preview effect

  useEffect(() => {
    if (!canAssign) {
      const today = new Date().toISOString().slice(0,10)
      setEstimatedDate(today)
    }
  }, [canAssign])

  // Debounced duplicate check - check by Part Number AND PO Number
  // PO Number is optional, but if entered and already exists, detect duplication
  
  useEffect(() => {
    const currentCheckKey = `${partNumber}|${poNumber}`;
    if (
      currentCheckKey !== lastDuplicateCheck &&
      (partNumber.trim() || poNumber.trim())
    ) {
      const timer = setTimeout(() => {
        setLastDuplicateCheck(currentCheckKey)
        void checkDuplicate()
      }, 500)
      return () => clearTimeout(timer)
    } else if (!partNumber.trim() && !poNumber.trim()) {
      setDuplicateDetected(false)
      setDuplicateTasks([])
      setDuplicateOverride(false)
      setDuplicateJustification('')
      setLastDuplicateCheck('')
      setHasDuplicatePoMatch(false)
    }
  }, [partNumber, poNumber, lastDuplicateCheck])

  async function checkDuplicate() {
    setCheckingDuplicate(true)
    try {
      // Check by Part Number AND PO Number (PO Number is optional but checked if provided)
      const payload: any = {
        PartNumber: partNumber || '',
        partNumber: partNumber || '',
        IncludeCompleted: false,
        includeCompleted: false
      }

      // Include PO Number in duplicate check if provided
      if (poNumber.trim()) {
        payload.PoNumber = poNumber
        payload.poNumber = poNumber
      }

      // CRITICAL FIX: Add CSRF token to headers
      const authHeaders = buildAuthHeaders()
      const headersWithCsrf = await addCsrfHeader(authHeaders)

      const res = await fetch('/api/duplicates/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headersWithCsrf
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        console.warn('⚠️ Duplicate check failed with status:', res.status, await res.text().catch(() => ''))
        setDuplicateDetected(false)
        setDuplicateTasks([])
        return { IsDuplicate: false, Duplicates: [] }
      }

      const data = await res.json()

      const isDuplicate = data.IsDuplicate || data.isDuplicate || false
      const duplicates = data.Duplicates || data.duplicates || []

      if (isDuplicate && duplicates.length > 0) {
        // CRITICAL FIX: Normalize all duplicate tasks to ensure all fields are accessible
        const normalizedDuplicates = duplicates.map(normalizeDuplicateTask)
        setDuplicateDetected(true)
        setDuplicateTasks(normalizedDuplicates)

        // CRITICAL: Check if any duplicate specifically matches the entered PO Number
        // PO Number duplicates are NOT allowed to be overridden — user must change the PO number
        const poMatchFound = poNumber.trim() !== '' && normalizedDuplicates.some((t: any) =>
          t.PoNumber && t.PoNumber.toLowerCase() === poNumber.trim().toLowerCase()
        )
        setHasDuplicatePoMatch(poMatchFound)

        // Reset override if PO match is found (cannot override PO duplicates)
        if (poMatchFound) {
          setDuplicateOverride(false)
          setDuplicateJustification('')
        }
      } else {
        setDuplicateDetected(false)
        setDuplicateTasks([])
        setHasDuplicatePoMatch(false)
      }

      return data
    } catch (err) {
      console.warn('❌ Duplicate check failed:', err)
      setDuplicateDetected(false)
      setDuplicateTasks([])
      return { IsDuplicate: false, Duplicates: [] }
    } finally {
      setCheckingDuplicate(false)
    }
  }

  async function handleManualCheckAndShow() {
    await checkDuplicate()
    setShowDuplicatesPanel(true)
  }

  // CRITICAL FIX: Add CSRF token to attachment upload
  async function uploadAttachment(file: File, taskId: number) {
    const fd = new FormData()
    fd.append('taskId', String(taskId))
    fd.append('file', file)
    fd.append('uploadedBy', String(createdById))

    try {
      // CRITICAL FIX: Get CSRF token and add to headers
      const authHeaders = buildAuthHeaders()
      const headersWithCsrf = await addCsrfHeader(authHeaders)

      const res = await fetch(`/api/tasks/${taskId}/attachments`, {
        method: 'POST',
        headers: headersWithCsrf, // Add CSRF headers
        body: fd,
        credentials: 'include'
      })

      if (!res.ok) {
        const errorText = await res.text().catch(() => '')
        throw new Error(errorText || `Upload failed (${res.status})`)
      }

      const data = await res.json()

      return data?.file_path ?? data?.attachmentPath ?? data?.path ?? `/uploads/${file.name}`
    } catch (error) {
      console.error('✗ File upload failed:', error)
      throw error
    }
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    setFormError(null)

    if (!categoryId) return setFormError('Category Type is required')
    if (!subTypeId) return setFormError('Sub Type is required')
    // FIXED: Removed Serial Number validation - it's now optional
    if (!partNumber.trim()) return setFormError('Part Number is required')
    if (!description.trim()) return setFormError('Description is required')
    // FIXED: Added shop validation
    // if (!shopId) return setFormError('Shop is required')
    // CRITICAL: If duplicate PO Number is detected, block submission entirely — user must change the PO number
    if (hasDuplicatePoMatch) return setFormError('Duplicate PO Number detected. A task with this PO Number already exists. Please change the PO Number or leave it empty to proceed.')
    if (duplicateDetected && !duplicateOverride) return setFormError('Duplication detected. Please review the duplicates and choose to proceed with a reason if needed.')
    if (duplicateOverride && duplicateJustification.trim().length === 0) return setFormError('A reason is required when proceeding with a duplicate.')

    setSubmitting(true)
    try {
      const assignedEngineerString = assignedEngineers && assignedEngineers.length > 0
        ? assignedEngineers.map(id => {
            const engineer = engineers.find(e => e.id === id)
            return engineer?.name || id
          }).join(', ')
        : undefined

      const isDuplicate = duplicateDetected && duplicateOverride

      const payload: any = {
        SerialNumber: serialNumber || undefined,
        PartNumber: partNumber || undefined,
        PoNumber: poNumber || undefined,
        Description: description,
        Comments: comments || undefined,
        CategoryId: typeof categoryId === 'number' ? categoryId : undefined,
        SubTypeId: typeof subTypeId === 'number' ? subTypeId : undefined,
        RequestTypeId: typeof requestTypeId === 'number' ? requestTypeId : undefined,
        PriorityId: typeof priorityId === 'number' ? priorityId : null,
        Status: status,
        EstimatedCompletionDate: estimatedDate ? new Date(estimatedDate).toISOString() : new Date().toISOString(),
        TargetCompletionDate: targetDate
          ? ((window as any).__targetCompletionDateISO || new Date(targetDate).toISOString())
          : undefined,
        AssignedEngineer: assignedEngineerString,
        CreatedBy: createdById || undefined,
        // FIXED: Added ShopId to payload
        // ShopId: typeof shopId === 'number' ? shopId : undefined,
        IsDuplicate: isDuplicate,
        is_duplicate: isDuplicate,
        isDuplicate: isDuplicate,
        DuplicateJustification: duplicateOverride ? duplicateJustification : undefined,
        duplicate_justification: duplicateOverride ? duplicateJustification : undefined,
        duplicateJustification: duplicateOverride ? duplicateJustification : undefined,
      }

      let created
      if (apiClient && typeof apiClient.createTask === 'function') {
        created = await apiClient.createTask(payload)
      } else {
        // CRITICAL FIX: Add CSRF token to fallback fetch headers
        const authHeaders = buildAuthHeaders()
        const headersWithCsrf = await addCsrfHeader(authHeaders)
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...headersWithCsrf
          },
          body: JSON.stringify(payload),
          credentials: 'include'
        })
        if (!res.ok) {
          const txt = await res.text().catch(() => '')
          throw new Error(txt || `HTTP ${res.status}`)
        }
        created = await res.json()
      }

      const createdTask = created?.task ?? created?.data ?? created
      const newTaskId = createdTask?.taskId ?? createdTask?.task_id ?? createdTask?.id

      if (!newTaskId) {
        throw new Error('Task created but no task_id returned')
      }

      if (attachmentFile) {
        try {
          const attachmentPath = await uploadAttachment(attachmentFile, newTaskId)

          const updatePayload = {
            ...payload,
            AttachmentPath: attachmentPath
          }

          // CRITICAL FIX: Add CSRF token to PUT request
          const authHeaders = buildAuthHeaders()
          const headersWithCsrf = await addCsrfHeader(authHeaders)

          const updateRes = await fetch(`/api/tasks/${newTaskId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              ...headersWithCsrf  // FIXED: Added CSRF headers
            },
            body: JSON.stringify(updatePayload),
            credentials: 'include'
          })

          if (updateRes.ok) {
            const updatedTask = await updateRes.json()
            createdTask.attachment_path = attachmentPath
            createdTask.attachments_count = 1
          } else {
            const errorText = await updateRes.text().catch(() => '')
            console.warn('⚠ Task created and file uploaded, but failed to update task with attachment path:', updateRes.status, errorText)
          }

        } catch (uploadErr: any) {
          console.error('✗ Attachment upload failed:', uploadErr)
          setFormError(`Task created successfully, but attachment upload failed. Please try uploading the attachment again.`)
        }
      }

      // Trigger a refresh of the task list to show the new task
      window.dispatchEvent(new CustomEvent('tasks:refresh'))

      onTaskCreated?.(createdTask)
      onClose?.()

    } catch (err: any) {
      console.error('✗ Create task failed', err)
      // SECURITY FIX: Sanitize error message before displaying to user
      const rawMsg = err?.body?.message ?? err?.body ?? err?.message ?? null
      const rawMsgStr = rawMsg ? (typeof rawMsg === 'string' ? rawMsg : JSON.stringify(rawMsg)) : ''
      const safeMsg = sanitizeErrorMessage(rawMsgStr, 'Failed to create task. Please try again later.')
      setFormError(safeMsg)
    } finally {
      setSubmitting(false)
    }
  }

  const onAssignedEngineersChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const vals = Array.from(e.target.selectedOptions).map(o => o.value)
    setAssignedEngineers(vals)
  }

  // Render: wrapped in DraggableDialog so header supports dragging and showMaximize adds window-controls
  return (
    <DraggableDialog open={true} onOpenChange={onClose}>
      <DraggableDialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" showMaximize>
        <DraggableDialogHeader className="modal-header-modern">
          <div className="modal-title-group">
            <div className="modal-header-icon bg-blue-100">
              <svg className="h-5 w-5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 4.5v15m7.5-7.5h-15" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <DraggableDialogTitle className="modal-title-modern">Create New Task</DraggableDialogTitle>
              <p className="modal-subtitle-modern">Fill out the form below to create a new task • Drag to move</p>
            </div>
          </div>
        </DraggableDialogHeader>

        <div className="modal-body-modern">
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            {formError && <div className="text-sm text-red-600">{formError}</div>}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Category Type <span className="text-red-500">*</span></label>
                <Select value={String(categoryId)} onValueChange={(v) => setCategoryId(v && v !== 'none' ? Number(v) : '')}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose category</SelectItem>
                    {categories.length > 0 ? categories.map((c: any) => (
                      <SelectItem key={c.category_id ?? c.id ?? c.categoryId ?? c.value} value={(c.category_id ?? c.id ?? c.categoryId ?? c.value).toString()}>
                        {c.category_name ?? c.name ?? c.title ?? c.label}
                      </SelectItem>
                    )) : null}
                  </SelectContent>
                </Select>
                {categories.length === 0 && (
                  <div className="text-xs text-orange-600 mt-1">⚠ No categories available. Please contact your administrator.</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Sub Type <span className="text-red-500">*</span></label>
                <Select
                  value={String(subTypeId)}
                  onValueChange={(v) => setSubTypeId(v && v !== 'none' ? Number(v) : '')}
                  disabled={!categoryId || filteredSubTypes.length === 0}
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder={!categoryId ? "Select category first" : filteredSubTypes.length === 0 ? "No sub-types available" : "Select sub-type"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose sub-type</SelectItem>
                    {filteredSubTypes.map((st: any) => (
                      <SelectItem key={st.sub_type_id ?? st.id ?? st.value} value={(st.sub_type_id ?? st.id ?? st.value).toString()}>
                        {st.sub_type_name ?? st.name ?? st.title ?? st.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Serial Number</label>
                <Input placeholder="Enter serial number (optional)" value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Part Number <span className="text-red-500">*</span></label>
                <Input placeholder="Enter part number" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-1 ${hasDuplicatePoMatch ? 'text-red-600' : ''}`}>
                  PO Number
                  {hasDuplicatePoMatch && <span className="text-red-500 ml-1">— Duplicate detected</span>}
                </label>
                <Input
                  placeholder="Enter PO number (optional)"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  className={hasDuplicatePoMatch ? 'border-red-500 ring-1 ring-red-500 focus:border-red-500 focus:ring-red-500' : ''}
                />
                {hasDuplicatePoMatch && (
                  <div className="text-xs text-red-600 mt-1">This PO Number already exists. Please enter a different PO Number or leave it empty.</div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Description <span className="text-red-500">*</span></label>
              <textarea className="w-full p-2 border rounded-md" rows={3} placeholder="Enter task description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Request Type</label>
              {requestTypes.length > 0 ? (
                <Select value={String(requestTypeId)} onValueChange={(v) => setRequestTypeId(v && v !== 'none' ? Number(v) : '')}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select request type (optional)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Choose request type</SelectItem>
                    {requestTypes.map((r: any) => (
                      <SelectItem
                        key={r.request_type_id ?? r.id ?? r.requestTypeId ?? r.value}
                        value={(r.request_type_id ?? r.id ?? r.requestTypeId ?? r.value).toString()}
                      >
                        {r.request_type_name ?? r.name ?? r.requestTypeName ?? r.label ?? 'Unknown'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="text-xs text-orange-600">⚠ No request types available. Please contact your administrator.</div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Priority</label>
                {priorities.length > 0 ? (
                  <Select value={String(priorityId)} onValueChange={(v) => setPriorityId(v && v !== 'none' ? Number(v) : '')}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {priorities.map((p: any) => (
                        <SelectItem
                          key={p.priority_id ?? p.id}
                          value={(p.priority_id ?? p.id).toString()}
                        >
                          {p.level_name ?? p.name ?? 'Unknown'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="text-xs text-orange-600">⚠ No priorities available. Please contact your administrator.</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Assigned Engineer</label>
                {canAssign ? (
                  <div>
                    {loadingEngineers ? (
                      <div className="flex items-center justify-center p-3 border rounded bg-blue-50 border-blue-200">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600 mr-2"></div>
                        <span className="text-sm text-blue-700 font-medium">Loading engineers...</span>
                      </div>
                    ) : engineersError ? (
                      <div className="p-3 border rounded bg-red-50 border-red-200">
                        <div className="text-xs text-red-600 font-medium">{engineersError}</div>
                      </div>
                    ) : (
                      <>
                        <select multiple value={assignedEngineers} onChange={onAssignedEngineersChange} className="form-select w-full p-2 border rounded min-h-[80px] focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                          {engineers.length > 0 ? engineers.map((eng) => <option key={eng.id} value={eng.id}>{eng.name}</option>) : (
                            <option value="no-engineers" disabled>No engineers available</option>
                          )}
                        </select>
                        <div className="text-xs text-gray-500 mt-1">
                          Hold Ctrl/Cmd to select multiple engineers. 
                          {engineers.length === 0 && <span className="text-orange-600 font-medium"> (No engineers found - check Manage User section and ensure users have Engineer role)</span>}
                          {engineers.length > 0 && <span className="text-green-600 font-medium"> ({engineers.length} engineer{engineers.length !== 1 ? 's' : ''} available)</span>}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="text-xs text-gray-600">Will be assigned by Team Leader</div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">{canAssign ? 'Estimated Completion Date' : 'Requested Date'}</label>
                {canAssign ? (
                  <>
                    <Input type="date" value={estimatedDate} onChange={(e) => setEstimatedDate(e.target.value)} />
                    <div className="text-xs text-green-600 mt-1">✓ Defaulted to today&apos;s date (can be amended)</div>
                  </>
                ) : (
                  <Input type="date" value={estimatedDate || new Date().toISOString().slice(0,10)} readOnly />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Target Completion Date</label>
                {canAssign ? (
                  <Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
                ) : (
                  <>
                    <Input type="date" value={targetDate} readOnly className="bg-gray-50" />
                    {!targetDate && (
                      <div className="text-xs text-gray-500 mt-1">Auto-calculated when category is selected</div>
                    )}
                  </>
                )}
                {categoryId && targetDate && (
                  <div className="text-xs text-green-600 mt-1">✓ Auto-calculated based on category target duration (days/hours/minutes)</div>
                )}
                {categoryId && !targetDate && (
                  <div className="text-xs text-orange-600 mt-1">⚠ No target duration configured for this category</div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <Select value={String(status)} onValueChange={(v) => setStatus(statusStringToEnum(v))}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Pending</SelectItem>
                  <SelectItem value="1">In Progress</SelectItem>
                  <SelectItem value="2">Completed</SelectItem>
                  <SelectItem value="3">Blocked</SelectItem>
                  <SelectItem value="4">On Hold</SelectItem>
                  <SelectItem value="5">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-green-600 mt-1">✓ Defaulted to &quot;Pending&quot;</div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Attachment</label>
              <div className="flex items-center space-x-2">
                <input
                  type="file"
                  id="create-task-file-input"
                  onChange={(e) => {
                    const file = e.target.files ? e.target.files[0] : null
                    if (file) {
                      const result = validateFile(file)
                      if (!result.valid) {
                        setAttachmentError(result.error)
                        setAttachmentFile(null)
                        e.target.value = ''
                        return
                      }
                      setAttachmentError(null)
                      setAttachmentFile(file)
                    } else {
                      setAttachmentError(null)
                      setAttachmentFile(null)
                    }
                  }}
                  accept={ACCEPT_STRING}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {(attachmentFile || attachmentError) && (
                  <button
                    type="button"
                    onClick={() => {
                      setAttachmentFile(null)
                      setAttachmentError(null)
                      const fileInput = document.getElementById('create-task-file-input') as HTMLInputElement
                      if (fileInput) fileInput.value = ''
                    }}
                    className="px-3 py-1 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400 whitespace-nowrap"
                  >
                    Clear
                  </button>
                )}
              </div>
              {attachmentError && (
                <div className="text-xs text-red-600 mt-1 p-2 bg-red-50 border border-red-200 rounded">
                  ⚠️ {attachmentError}
                </div>
              )}
              {attachmentFile && !attachmentError && (
                <div className="text-xs text-green-600 mt-1">✓ File selected: {attachmentFile.name} ({(attachmentFile.size / 1024).toFixed(1)} KB)</div>
              )}
              <div className="text-xs text-gray-500 mt-1">Max file size {MAX_FILE_SIZE_MB}MB. Allowed types: {ALLOWED_EXTENSIONS_DISPLAY}. If attaching an Outlook message, please zip it first.</div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Initial Comments</label>
              <textarea className="w-full p-2 border rounded-md" rows={2} placeholder="Add initial comments." value={comments} onChange={(e) => setComments(e.target.value)} />
            </div>

            {/* Enhanced duplicate detection UI */}
            {checkingDuplicate && (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3">
                <div className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  <span className="text-blue-800 font-medium">Checking for duplicates...</span>
                </div>
              </div>
            )}

            {duplicateDetected && (
              <div className={`rounded-md p-3 ${hasDuplicatePoMatch ? 'bg-red-50 border-2 border-red-400' : 'bg-yellow-50 border border-yellow-200'}`}>
                <div className="flex justify-between items-start">
                  <div>
                    <strong className={hasDuplicatePoMatch ? 'text-red-800' : 'text-yellow-800'}>
                      {hasDuplicatePoMatch ? '🚫 Duplicate PO Number — Not Allowed' : '⚠️ Duplication detected'}
                    </strong>
                    <div className={`text-sm mt-1 ${hasDuplicatePoMatch ? 'text-red-700' : 'text-yellow-700'}`}>
                      {(() => {
                        // Determine which fields matched
                        const hasPoMatch = poNumber.trim() && duplicateTasks.some((t: any) => 
                          t.PoNumber && t.PoNumber.toLowerCase() === poNumber.trim().toLowerCase()
                        )
                        const hasPartMatch = partNumber.trim() && duplicateTasks.some((t: any) => 
                          t.PartNumber && t.PartNumber.toLowerCase() === partNumber.trim().toLowerCase()
                        )
                        const matchFields: string[] = []
                        if (hasPartMatch) matchFields.push('Part Number')
                        if (hasPoMatch) matchFields.push('PO Number')
                        const matchText = matchFields.length > 0 ? matchFields.join(' and ') : 'matching criteria'

                        if (hasPoMatch) {
                          return `Found ${duplicateTasks.length} existing task${duplicateTasks.length !== 1 ? 's' : ''} with the same ${matchText}. Duplicate PO Numbers are not accepted. Please change the PO Number or remove it to proceed.`
                        }
                        return `Found ${duplicateTasks.length} similar task${duplicateTasks.length !== 1 ? 's' : ''} with the same ${matchText}. Review duplicates or choose to proceed anyway with a reason.`
                      })()}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        className="text-sm text-blue-600 underline hover:text-blue-800"
                        onClick={() => setShowDuplicatesPanel(true)}
                      >
                        Show Duplicates ({duplicateTasks.length})
                      </button>
                      <button
                        type="button"
                        className="text-sm text-blue-600 underline hover:text-blue-800"
                        onClick={handleManualCheckAndShow}
                      >
                        Recheck Duplicates
                      </button>
                    </div>
                  </div>
                  {/* CRITICAL: Hide "Proceed anyway" checkbox when PO Number duplicate is detected */}
                  {!hasDuplicatePoMatch && (
                    <div>
                      <div className="flex items-center">
                        <input
                          id="dupOverride"
                          type="checkbox"
                          checked={duplicateOverride}
                          onChange={(e) => setDuplicateOverride(e.target.checked)}
                          className="mr-2"
                        />
                        <label htmlFor="dupOverride" className="text-sm font-medium">Proceed anyway</label>
                      </div>
                    </div>
                  )}
                </div>

                {/* CRITICAL: Show PO-specific guidance when PO duplicate is detected */}
                {hasDuplicatePoMatch && (
                  <div className="mt-3 p-2 bg-red-100 rounded-md">
                    <div className="text-sm text-red-800 font-medium">
                      ✏️ To proceed, you must either:
                    </div>
                    <ul className="text-sm text-red-700 mt-1 list-disc list-inside">
                      <li>Change the PO Number to a unique value</li>
                      <li>Clear the PO Number field (PO is optional)</li>
                    </ul>
                  </div>
                )}

                {!hasDuplicatePoMatch && duplicateOverride && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium mb-1 text-yellow-800">Reason for duplication <span className="text-red-500">*</span></label>
                    <textarea
                      placeholder="Enter the reason for creating this task despite being a duplicate..."
                      value={duplicateJustification}
                      onChange={(e) => setDuplicateJustification(e.target.value)}
                      className="w-full p-2 border rounded-md focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
                      rows={2}
                    />
                    {duplicateJustification.trim().length === 0 && (
                      <div className="text-xs text-red-600 mt-1">A reason is required when proceeding with a duplicate</div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={onClose} type="button">Cancel</Button>
              <Button
                type="submit"
                disabled={submitting || loadingEngineers || loadingShops || checkingDuplicate || hasDuplicatePoMatch || (duplicateDetected && duplicateOverride && !duplicateJustification.trim())}
              >
                {submitting ? 'Creating...' : loadingEngineers ? 'Loading...' : loadingShops ? 'Loading...' : checkingDuplicate ? 'Checking...' : hasDuplicatePoMatch ? 'Duplicate PO — Change PO Number' : 'Create Task'}
              </Button>
            </div>
          </form>
        </div>

        <DraggableDialogFooter>
          {/* footer left intentionally empty - main actions are in-form */}
        </DraggableDialogFooter>

        {/* CRITICAL FIX: Enhanced duplicates panel with all fields properly displayed */}
        {showDuplicatesPanel && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-6 bg-black/40">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[80vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
                <h4 className="text-lg font-semibold">
                  Duplicate Tasks Found ({duplicateTasks.length})
                </h4>
                <button
                  className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
                  onClick={() => setShowDuplicatesPanel(false)}
                >
                  Close
                </button>
              </div>

              <div className="p-4">
                {checkingDuplicate && (
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
                    <span className="text-gray-600">Checking for duplicates...</span>
                  </div>
                )}

                {!checkingDuplicate && duplicateTasks.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No duplicate tasks found.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full table-auto border-collapse">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="text-left p-3 border font-medium">Task ID</th>
                          <th className="text-left p-3 border font-medium">Part Number</th>
                          <th className="text-left p-3 border font-medium">Serial Number</th>
                          <th className="text-left p-3 border font-medium">PO Number</th>
                          <th className="text-left p-3 border font-medium">Status</th>
                          <th className="text-left p-3 border font-medium">Category</th>
                          <th className="text-left p-3 border font-medium">Sub Type</th>
                          <th className="text-left p-3 border font-medium">Priority</th>
                          <th className="text-left p-3 border font-medium">Shop</th>
                          <th className="text-left p-3 border font-medium">Assigned Engineer</th>
                          <th className="text-left p-3 border font-medium">Created By</th>
                          <th className="text-left p-3 border font-medium">Description</th>
                          <th className="text-left p-3 border font-medium">Created At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {duplicateTasks.map((t: any, index: number) => (
                          <tr key={t.TaskId || index} className="border-t hover:bg-gray-50">
                            <td className="p-3 border">
                              <a
                                href={`/tasks/${t.TaskId}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-blue-600 hover:text-blue-800 underline font-medium"
                              >
                                TC-{t.TaskId}
                              </a>
                            </td>
                            <td className="p-3 border font-medium">{t.PartNumber || 'N/A'}</td>
                            <td className="p-3 border">{t.SerialNumber || 'N/A'}</td>
                            <td className="p-3 border">{t.PoNumber || 'N/A'}</td>
                            <td className="p-3 border">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                t.Status === 'Completed' ? 'bg-green-100 text-green-800' :
                                t.Status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                t.Status === 'Blocked' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {t.Status || 'Pending'}
                              </span>
                            </td>
                            <td className="p-3 border">{t.CategoryName || 'N/A'}</td>
                            <td className="p-3 border">{t.SubTypeName || 'N/A'}</td>
                            <td className="p-3 border">{t.PriorityName || 'N/A'}</td>
                            <td className="p-3 border">{t.ShopName || 'N/A'}</td>
                            <td className="p-3 border">{t.AssignedEngineer || 'Unassigned'}</td>
                            <td className="p-3 border">{t.CreatedByName || 'N/A'}</td>
                            <td className="p-3 border">
                              <div className="max-w-xs">
                                <div className="truncate" title={t.Description}>
                                  {(t.Description || '').substring(0, 100)}
                                  {(t.Description || '').length > 100 ? '...' : ''}
                                </div>
                              </div>
                            </td>
                            <td className="p-3 border">
                              {t.CreatedAt ?
                                formatDate(t.CreatedAt) :
                                'N/A'
                              }
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DraggableDialogContent>
    </DraggableDialog>
  )
}

export default CreateTaskForm