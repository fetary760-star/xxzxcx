/**
 * HierarchyTree Component — AMENDED v9 (revised Table of Contents)
 *
 * WHAT CHANGED IN v9
 * ------------------
 * This file used to declare its own `FORM_CATEGORIES` constant. That was one of
 * three independent copies of the Self Evaluation tree, which is exactly why
 * sub-forms drifted into the wrong parent category. The local constant is gone.
 * The sidebar now renders from the single source of truth:
 *
 *     @/lib/self-evaluation/toc-structure
 *
 * Consequences of rendering from `toc-structure`:
 * - The five promoted top-level items (MNT-1325, LETTER OF CONFIRMATION,
 *   AMENDMENT REQUEST, 918, 918 A) render BEFORE the five categories.
 * - DOCUMENTATION shows CMM REV. STATUS, TASK CARD, then an OTHERS sub-group
 *   holding SB (MNT-1420A) and AD (MNT-1420B).
 * - Nested children render at any depth (TNA -> report, MAINTENANCE AND GENERIC
 *   COURSES -> two Training Verifications, SIMILAR TECHNICAL OR SIMPLE TASKS ->
 *   Similar/Simple Task, IN-HOUSE MANUFACTURING TOOL JIC -> three JIC forms).
 * - Controlled document numbers render as a badge next to the label.
 *
 * EVERYTHING ELSE FROM v8 IS PRESERVED
 * ------------------------------------
 * - Shop -> ATA Chapter group -> ATA Record -> Table of Contents.
 * - Approval status indicator on records and on every form node.
 * - Auto-select/auto-expand of the user's pre-assigned shop.
 * - "Create New ATA Record" top-level button and the per-chapter + button.
 * - Role-driven visibility via normalizeRole() + getRolePermissions().
 */
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  ChevronRight, ChevronDown, Building2, BookOpen, RefreshCw,
  Plus, FolderTree, Paperclip, Circle, CheckCircle2,
  Clock, XCircle, RotateCcw, FolderOpen, Layers
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'
import { useAuth } from '@/lib/auth-context'
import { normalizeRole } from '@/lib/role-utils'
import { getShops, getATARecordsByShop, getFormsByATARecord } from '@/lib/self-evaluation/api'
import type { ShopDto, FormNodeType, ATARecordDto } from '@/lib/self-evaluation/types'
import { ApprovalStatus, getRolePermissions, type UserRole } from '@/lib/self-evaluation/types'
import {
  TOC_CATEGORIES,
  TOC_TOP_LEVEL_FORMS,
  getCategoryFormCount,
  type TocFormNode,
} from '@/lib/self-evaluation/toc-structure'
import CreateATARecordDialog from './CreateATARecordDialog'

interface TreeNodeState {
  expanded: boolean
  loading: boolean
  loaded: boolean
}

/** Per-ATA-record map of formType -> submission status. */
interface FormStatusMap {
  [formType: string]: {
    id: string
    approvalStatus: ApprovalStatus
    hasAttachments: boolean
    lastModified: string
  }
}

/** ATA Records grouped by their ATAChapterNumber (or "Unassigned"). */
interface ATAChapterGroup {
  ataChapterId: string
  ataChapterNumber: string
  ataChapterTitle: string
  records: ATARecordDto[]
}

// Approval status indicator component
function StatusIndicator({ status }: { status?: ApprovalStatus }) {
  if (status === undefined || status === null) {
    return <Circle className="h-2 w-2 text-gray-400 flex-shrink-0" />
  }
  switch (status) {
    case ApprovalStatus.Draft:
      return <Circle className="h-2 w-2 text-gray-400 flex-shrink-0" />
    case ApprovalStatus.PendingTeamLeaderReview:
    case ApprovalStatus.PendingManagerApproval:
    case ApprovalStatus.PendingDirectorApproval:
    case ApprovalStatus.PendingQAApproval:
      return <Clock className="h-2 w-2 text-yellow-400 flex-shrink-0 animate-pulse" />
    case ApprovalStatus.Approved:
      return <CheckCircle2 className="h-2 w-2 text-green-400 flex-shrink-0" />
    case ApprovalStatus.Rejected:
      return <XCircle className="h-2 w-2 text-red-400 flex-shrink-0" />
    case ApprovalStatus.Returned:
      return <RotateCcw className="h-2 w-2 text-amber-400 flex-shrink-0" />
    default:
      return <Circle className="h-2 w-2 text-gray-400 flex-shrink-0" />
  }
}

export default function HierarchyTree() {
  const {
    selectedShop,
    selectedATAChapter,
    selectedComponent,
    selectedATARecord,
    activeFormType,
    setSelectedShop,
    setSelectedATAChapter,
    setSelectedComponent,
    setSelectedATARecord,
    setActiveFormType,
    refreshKey,
  } = useSelfEvaluation()

  const { user } = useAuth()
  const userRole = normalizeRole(user?.role) as UserRole
  const permissions = getRolePermissions(userRole)

  const [shops, setShops] = useState<ShopDto[]>([])
  const [shopATARecords, setShopATARecords] = useState<Record<string, ATAChapterGroup[]>>({})
  const [nodeStates, setNodeStates] = useState<Record<string, TreeNodeState>>({})
  const [formStatuses, setFormStatuses] = useState<Record<string, FormStatusMap>>({})
  const [loading, setLoading] = useState(true)
  const [showCreateATA, setShowCreateATA] = useState(false)
  const [createATAContext, setCreateATAContext] = useState<{ shopId: string; ataChapterId: string; ataChapterNumber: string } | null>(null)

  // Track if auto-expand has been done for the user's pre-assigned shop
  const autoExpandDoneRef = useRef(false)

  const fetchShops = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getShops()
      setShops(data)
      return data
    } catch (err) {
      console.error('Failed to fetch shops:', err)
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchShops()
  }, [fetchShops, refreshKey])

  const getNodeState = (key: string): TreeNodeState => {
    return nodeStates[key] || { expanded: false, loading: false, loaded: false }
  }

  const setNodeState = (key: string, state: Partial<TreeNodeState>) => {
    setNodeStates(prev => ({
      ...prev,
      [key]: { ...(prev[key] || { expanded: false, loading: false, loaded: false }), ...state },
    }))
  }

  const toggleNode = (key: string) => {
    const state = getNodeState(key)
    setNodeState(key, { expanded: !state.expanded })
  }

  /** Group a flat ATA record list by chapter. Shared by initial load + refresh. */
  const groupRecordsByChapter = (ataRecords: ATARecordDto[]): ATAChapterGroup[] => {
    const groupMap: Record<string, ATAChapterGroup> = {}
    const UNASSIGNED_KEY = '__unassigned__'

    ataRecords.forEach(record => {
      let groupKey = UNASSIGNED_KEY
      let groupNumber = ''
      let groupTitle = 'Unassigned'

      if (record.ataChapterId && record.ataChapterId !== '00000000-0000-0000-0000-000000000000') {
        groupKey = record.ataChapterId
        groupNumber = record.ataChapterNumber || record.ataChapter || ''
        groupTitle = record.ataChapterTitle || `ATA ${groupNumber}`
      } else if (record.ataChapter && record.ataChapter.trim() !== '') {
        groupKey = `code-${record.ataChapter}`
        groupNumber = record.ataChapter
        groupTitle = `ATA ${record.ataChapter}`
      }

      if (!groupMap[groupKey]) {
        groupMap[groupKey] = {
          ataChapterId: groupKey === UNASSIGNED_KEY ? '' : (record.ataChapterId || ''),
          ataChapterNumber: groupNumber,
          ataChapterTitle: groupTitle,
          records: [],
        }
      }
      groupMap[groupKey].records.push(record)
    })

    return Object.values(groupMap)
  }

  // Fetch form statuses for an ATA record
  const fetchFormStatuses = async (ataRecordId: string) => {
    try {
      const forms = await getFormsByATARecord(ataRecordId)
      const statusMap: FormStatusMap = {}
      forms.forEach((form) => {
        statusMap[form.formType] = {
          id: form.id,
          approvalStatus: form.approvalStatus as ApprovalStatus,
          hasAttachments: false,
          lastModified: form.updatedAt,
        }
      })
      setFormStatuses(prev => ({ ...prev, [ataRecordId]: statusMap }))
    } catch (err) {
      console.error('Failed to fetch form statuses:', err)
    }
  }

  /**
   * Fetch ATA Records when expanding a shop.
   */
  const handleShopClick = useCallback(async (shop: ShopDto) => {
    setSelectedShop(shop)
    const key = `shop-${shop.id}`
    const state = nodeStates[key] || { expanded: false, loading: false, loaded: false }

    if (state.expanded && state.loaded) {
      setNodeState(key, { expanded: false })
      return
    }

    // Always re-fetch on expand to pick up newly created records
    setNodeState(key, { loading: true, expanded: true })
    try {
      const ataRecords = await getATARecordsByShop(shop.id)
      setShopATARecords(prev => ({ ...prev, [shop.id]: groupRecordsByChapter(ataRecords) }))
      setNodeState(key, { loading: false, loaded: true, expanded: true })
    } catch (err) {
      console.error('Failed to fetch ATA records:', err)
      setNodeState(key, { loading: false, expanded: true, loaded: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeStates, setSelectedShop])

  /**
   * Auto-expand user's pre-assigned shop
   */
  useEffect(() => {
    if (autoExpandDoneRef.current) return
    if (!user?.shopId || shops.length === 0) return

    const userShopId = String(user.shopId)
    const userShopName = user.shopName || user.shop_name || ''

    let matchedShop = shops.find(s => String(s.id) === userShopId)
    if (!matchedShop && userShopName) {
      matchedShop = shops.find(s => s.name.toLowerCase() === String(userShopName).toLowerCase())
    }

    if (matchedShop) {
      autoExpandDoneRef.current = true
      handleShopClick(matchedShop)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, shops])

  /**
   * Re-fetch ATA records for the expanded shop when refreshKey changes
   */
  useEffect(() => {
    if (refreshKey === 0) return
    Object.entries(nodeStates).forEach(([key, state]) => {
      if (key.startsWith('shop-') && state.expanded && state.loaded) {
        const shopId = key.replace('shop-', '')
        const shop = shops.find(s => s.id === shopId)
        if (shop) {
          getATARecordsByShop(shop.id).then(ataRecords => {
            setShopATARecords(prev => ({ ...prev, [shop.id]: groupRecordsByChapter(ataRecords) }))
          }).catch(err => {
            console.error('Failed to refresh ATA records:', err)
          })
        }
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey, shops])

  const handleATAGroupClick = (ataGroup: ATAChapterGroup, shop: ShopDto) => {
    setSelectedShop(shop)
    if (ataGroup.ataChapterId) {
      setSelectedATAChapter({
        id: ataGroup.ataChapterId,
        chapterNumber: ataGroup.ataChapterNumber,
        title: ataGroup.ataChapterTitle,
        description: '',
        isActive: true,
        createdAt: '',
        updatedAt: '',
      })
    }
    const key = `ata-${ataGroup.ataChapterId || ataGroup.ataChapterNumber || 'unassigned'}`
    const state = getNodeState(key)
    setNodeState(key, { expanded: !state.expanded, loaded: true })
  }

  /**
   * When clicking an ATA Record, set BOTH selectedComponent
   * AND selectedATARecord so that DocumentWorkspace renders the full workflow.
   */
  const handleATARecordClick = (record: ATARecordDto, ataGroup: ATAChapterGroup, shop: ShopDto) => {
    setSelectedShop(shop)

    if (ataGroup.ataChapterId) {
      setSelectedATAChapter({
        id: ataGroup.ataChapterId,
        chapterNumber: ataGroup.ataChapterNumber,
        title: ataGroup.ataChapterTitle,
        description: '',
        isActive: true,
        createdAt: '',
        updatedAt: '',
      })
    }

    setSelectedComponent({
      id: record.id,
      partNumber: record.partNumber,
      description: record.description,
      manufacturer: record.manufacturer,
      modelSeries: '',
      ataChapterId: record.ataChapterId || ataGroup.ataChapterId || '',
      ataChapterNumber: ataGroup.ataChapterNumber || record.ataChapter || '',
      ataChapterTitle: ataGroup.ataChapterTitle || '',
      shopId: shop.id,
      isActive: true,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })

    setSelectedATARecord({
      id: record.id,
      description: record.description,
      partNumber: record.partNumber,
      selfEvaluationDate: record.selfEvaluationDate || '',
      manufacturer: record.manufacturer,
      ataChapter: ataGroup.ataChapterNumber || record.ataChapter || '',
      cmmRevDate: record.cmmRevDate || '',
      revNo: record.revNo || '',
      aircraft: record.aircraft || '',
      ecaaShop: record.ecaaShop || '',
      faaShop: record.faaShop || '',
      authority: record.authority || '',
      responsibleWorkshop: record.responsibleWorkshop || '',
      letterRefNo: record.letterRefNo || '',
      shop: record.shop || shop.name,
      shopId: record.shopId || shop.id,
      componentId: record.componentId || record.id,
      approvalStatus: record.approvalStatus ?? ApprovalStatus.Draft,
      rejectionReason: record.rejectionReason,
      revisionNumber: record.revisionNumber,
      createdBy: record.createdBy || '',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    })

    // Toggle expand and load form statuses
    const key = `record-${record.id}`
    const state = getNodeState(key)
    if (!state.loaded) {
      fetchFormStatuses(record.id)
    }
    setNodeState(key, { expanded: !state.expanded, loaded: true })
  }

  /**
   * Clicking a form node always activates it. When it has children the click
   * also toggles the nested list, so a parent form stays reachable.
   */
  const handleFormNodeClick = (node: TocFormNode, recordId: string) => {
    setActiveFormType(node.formType)
    if (node.children?.length) {
      toggleNode(`form-${recordId}-${node.formType}`)
    }
  }

  /**
   * Create ATA Record click handler with proper event handling
   */
  const handleCreateATAClick = (e: React.MouseEvent, shopId: string, ataChapterId: string, ataChapterNumber: string) => {
    e.stopPropagation()
    e.preventDefault()
    setCreateATAContext({ shopId, ataChapterId, ataChapterNumber })
    setShowCreateATA(true)
  }

  /**
   * Top-level Create ATA Record handler
   */
  const handleTopLevelCreateATA = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    const effectiveShopId = selectedShop?.id || (user?.shopId ? String(user.shopId) : '') || (shops.length > 0 ? shops[0].id : '')

    if (!effectiveShopId) return

    setCreateATAContext({
      shopId: effectiveShopId,
      ataChapterId: selectedATAChapter?.id || '',
      ataChapterNumber: selectedATAChapter?.chapterNumber || '',
    })
    setShowCreateATA(true)
  }

  /**
   * Recursive renderer for a form node and all of its descendants.
   * Depth drives the indentation so the tree can nest arbitrarily deep.
   */
  const renderFormNode = (
    node: TocFormNode,
    recordId: string,
    statuses: FormStatusMap,
    depth: number,
  ) => {
    const formKey = `form-${recordId}-${node.formType}`
    const formState = getNodeState(formKey)
    const isFormActive = activeFormType === node.formType && selectedATARecord?.id === recordId
    const formStatus = statuses[node.formType]
    const hasChildren = !!node.children?.length
    const NodeIcon = node.Icon

    return (
      <div key={node.id}>
        <button
          onClick={() => handleFormNodeClick(node, recordId)}
          className={cn(
            'w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] transition-colors',
            isFormActive
              ? 'bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/30'
              : 'hover:bg-white/6 text-white/55'
          )}
          title={node.formNo ? `${node.label} — ${node.formNo}` : node.label}
        >
          {hasChildren ? (
            formState.expanded ? (
              <ChevronDown className="h-2.5 w-2.5 flex-shrink-0 text-white/30" />
            ) : (
              <ChevronRight className="h-2.5 w-2.5 flex-shrink-0 text-white/30" />
            )
          ) : (
            <span className="w-2.5 flex-shrink-0" />
          )}
          <StatusIndicator status={formStatus?.approvalStatus} />
          <NodeIcon className={cn('h-3 w-3 flex-shrink-0', node.iconClass)} />
          <span className="truncate text-left flex-1">{node.label}</span>
          {node.formNo && (
            <Badge className="text-[7px] px-1 py-0 bg-white/10 text-white/50 border-white/20 flex-shrink-0">
              {node.formNo}
            </Badge>
          )}
          {formStatus?.hasAttachments && (
            <Paperclip className="h-2 w-2 text-white/30 flex-shrink-0" />
          )}
        </button>

        {hasChildren && formState.expanded && (
          <div className="ml-4 pl-2 border-l border-white/8">
            {node.children!.map(child => renderFormNode(child, recordId, statuses, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-4 space-y-3">
        <Skeleton className="h-6 w-3/4 bg-white/10" />
        <Skeleton className="h-6 w-2/3 bg-white/10" />
        <Skeleton className="h-6 w-4/5 bg-white/10" />
        <Skeleton className="h-6 w-1/2 bg-white/10" />
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">
            Self Evaluation Hierarchy
          </h3>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-white/50 hover:text-white hover:bg-white/10"
            onClick={() => { autoExpandDoneRef.current = false; fetchShops() }}
            title="Refresh"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        {/* Top-level Create ATA Record button - ALWAYS visible when user has permission */}
        {permissions.canCreateATA && shops.length > 0 && (
          <div className="px-3 py-2 border-b border-white/10">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-md transition-colors shadow-sm"
              onClick={handleTopLevelCreateATA}
            >
              <Plus className="h-3.5 w-3.5" />
              Create New ATA Record
            </button>
          </div>
        )}

        {/* Tree */}
        <div className="p-2 space-y-0.5 overflow-y-auto max-h-[calc(100vh-16rem)]">
          {shops.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-white/40">
              No shops configured yet.
              {permissions.canManageShop && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-emerald-300 hover:text-emerald-200 hover:bg-white/10 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Create Shop
                </Button>
              )}
            </div>
          ) : (
            shops.map(shop => {
              const shopKey = `shop-${shop.id}`
              const shopState = getNodeState(shopKey)
              const isShopSelected = selectedShop?.id === shop.id && !selectedATAChapter

              return (
                <div key={shop.id}>
                  {/* Shop Node */}
                  <button
                    onClick={() => handleShopClick(shop)}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      isShopSelected
                        ? 'bg-white/15 text-white'
                        : 'hover:bg-white/8 text-white/80'
                    )}
                  >
                    {shopState.expanded ? (
                      <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-white/50" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-white/50" />
                    )}
                    <Building2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                    <span className="truncate text-left">{shop.name}</span>
                    {user?.shopId && String(user.shopId) === String(shop.id) && (
                      <Badge className="ml-auto text-[8px] px-1 py-0 bg-emerald-500/30 text-emerald-200 border-emerald-400/40">
                        My Shop
                      </Badge>
                    )}
                  </button>

                  {/* ATA Chapter Groups containing ATA Records */}
                  {shopState.expanded && (
                    <div className="ml-4 pl-2 border-l border-white/10">
                      {shopState.loading ? (
                        <div className="py-2 px-3">
                          <Skeleton className="h-4 w-full bg-white/10" />
                        </div>
                      ) : (
                        <>
                          {(shopATARecords[shop.id] || []).map(ataGroup => {
                            const ataKey = `ata-${ataGroup.ataChapterId || ataGroup.ataChapterNumber || 'unassigned'}`
                            const ataState = getNodeState(ataKey)
                            const isATASelected = selectedATAChapter?.id === ataGroup.ataChapterId && !selectedComponent

                            return (
                              <div key={ataKey}>
                                <div className="flex items-center gap-0.5">
                                  <button
                                    onClick={() => handleATAGroupClick(ataGroup, shop)}
                                    className={cn(
                                      'flex-1 flex items-center gap-2 px-3 py-1.5 rounded-md text-xs transition-colors',
                                      isATASelected
                                        ? 'bg-white/15 text-white'
                                        : 'hover:bg-white/8 text-white/70'
                                    )}
                                  >
                                    {ataState.expanded ? (
                                      <ChevronDown className="h-3 w-3 flex-shrink-0 text-white/40" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3 flex-shrink-0 text-white/40" />
                                    )}
                                    <BookOpen className="h-3.5 w-3.5 flex-shrink-0 text-amber-400" />
                                    <span className="truncate text-left">
                                      {ataGroup.ataChapterNumber
                                        ? `ATA ${ataGroup.ataChapterNumber} — ${ataGroup.ataChapterTitle}`
                                        : ataGroup.ataChapterTitle || 'Unassigned'}
                                    </span>
                                    <Badge className="ml-auto text-[8px] px-1 py-0 bg-white/10 text-white/50 border-white/20">
                                      {ataGroup.records.length}
                                    </Badge>
                                  </button>
                                  {/* Create ATA Record button next to chapter */}
                                  {permissions.canCreateATA && ataGroup.ataChapterId && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          className="h-6 w-6 flex items-center justify-center text-emerald-300/70 hover:text-emerald-200 hover:bg-emerald-500/20 flex-shrink-0 rounded-full border border-emerald-400/30 hover:border-emerald-400/60 transition-colors"
                                          onClick={(e) => handleCreateATAClick(e, shop.id, ataGroup.ataChapterId, ataGroup.ataChapterNumber)}
                                        >
                                          <Plus className="h-3.5 w-3.5" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="right" className="text-xs bg-emerald-700 text-white border-emerald-600">
                                        <p className="font-medium">Create new ATA Record</p>
                                        <p className="text-emerald-200 text-[10px]">ATA {ataGroup.ataChapterNumber}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>

                                {/* ATA Records under this chapter group */}
                                {ataState.expanded && (
                                  <div className="ml-4 pl-2 border-l border-white/10">
                                    {ataGroup.records.map(record => {
                                      const recordKey = `record-${record.id}`
                                      const recordState = getNodeState(recordKey)
                                      const isRecordSelected = selectedATARecord?.id === record.id
                                      const recordFormStatuses = formStatuses[record.id] || {}

                                      return (
                                        <div key={record.id}>
                                          {/* ATA Record Node (Parent) */}
                                          <button
                                            onClick={() => handleATARecordClick(record, ataGroup, shop)}
                                            className={cn(
                                              'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-[11px] transition-colors',
                                              isRecordSelected
                                                ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30'
                                                : 'hover:bg-white/8 text-white/60'
                                            )}
                                          >
                                            {recordState.expanded ? (
                                              <ChevronDown className="h-3 w-3 flex-shrink-0 text-white/40" />
                                            ) : (
                                              <ChevronRight className="h-3 w-3 flex-shrink-0 text-white/40" />
                                            )}
                                            <StatusIndicator status={record.approvalStatus} />
                                            <FolderTree className="h-3 w-3 flex-shrink-0 text-purple-400" />
                                            <span className="truncate text-left">
                                              P/N: {record.partNumber} — {record.description}
                                            </span>
                                          </button>

                                          {/* AMENDED v9: Table of Contents rendered from toc-structure */}
                                          {recordState.expanded && (
                                            <div className="ml-4 pl-2 border-l border-white/10">
                                              {/* 1. Promoted top-level items, before the categories */}
                                              <div className="mb-1">
                                                <div className="flex items-center gap-1.5 px-2 py-1 text-[9px] font-semibold text-white/40 uppercase tracking-wider">
                                                  <Layers className="h-2.5 w-2.5 flex-shrink-0" />
                                                  <span>Self Evaluation</span>
                                                </div>
                                                <div className="pl-1">
                                                  {TOC_TOP_LEVEL_FORMS.map(node =>
                                                    renderFormNode(node, record.id, recordFormStatuses, 0)
                                                  )}
                                                </div>
                                              </div>

                                              {/* 2. The five categories */}
                                              {TOC_CATEGORIES.map(category => {
                                                const categoryKey = `cat-${record.id}-${category.id}`
                                                const categoryState = getNodeState(categoryKey)
                                                const CategoryIcon = category.Icon

                                                return (
                                                  <div key={category.id}>
                                                    {/* Category Header */}
                                                    <button
                                                      onClick={() => toggleNode(categoryKey)}
                                                      className={cn(
                                                        'w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold transition-colors',
                                                        categoryState.expanded
                                                          ? 'bg-white/8 text-white/80'
                                                          : 'hover:bg-white/6 text-white/50'
                                                      )}
                                                    >
                                                      {categoryState.expanded ? (
                                                        <ChevronDown className="h-2.5 w-2.5 flex-shrink-0 text-white/30" />
                                                      ) : (
                                                        <ChevronRight className="h-2.5 w-2.5 flex-shrink-0 text-white/30" />
                                                      )}
                                                      {categoryState.expanded ? (
                                                        <FolderOpen className={cn('h-3 w-3 flex-shrink-0', category.sidebarColor)} />
                                                      ) : (
                                                        <CategoryIcon className={cn('h-3 w-3 flex-shrink-0', category.sidebarColor)} />
                                                      )}
                                                      <span className={cn('truncate text-left uppercase tracking-wider', category.sidebarColor)}>
                                                        {category.title}
                                                      </span>
                                                      <Badge className="ml-auto text-[7px] px-1 py-0 bg-white/5 text-white/40 border-white/10">
                                                        {getCategoryFormCount(category)}
                                                      </Badge>
                                                    </button>

                                                    {/* Category Forms + Sub-groups */}
                                                    {categoryState.expanded && (
                                                      <div className="ml-3 pl-2 border-l border-white/8">
                                                        {category.forms.map(node =>
                                                          renderFormNode(node, record.id, recordFormStatuses, 0)
                                                        )}

                                                        {category.subGroups?.map(subGroup => {
                                                          const subGroupKey = `sub-${record.id}-${category.id}-${subGroup.id}`
                                                          const subGroupState = getNodeState(subGroupKey)

                                                          return (
                                                            <div key={subGroup.id}>
                                                              <button
                                                                onClick={() => toggleNode(subGroupKey)}
                                                                className={cn(
                                                                  'w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[9px] font-bold uppercase tracking-wider transition-colors',
                                                                  subGroupState.expanded
                                                                    ? 'bg-white/8 text-white/70'
                                                                    : 'hover:bg-white/6 text-white/45'
                                                                )}
                                                              >
                                                                {subGroupState.expanded ? (
                                                                  <ChevronDown className="h-2.5 w-2.5 flex-shrink-0 text-white/30" />
                                                                ) : (
                                                                  <ChevronRight className="h-2.5 w-2.5 flex-shrink-0 text-white/30" />
                                                                )}
                                                                <FolderOpen className="h-2.5 w-2.5 flex-shrink-0 text-white/40" />
                                                                <span className="truncate text-left">{subGroup.title}</span>
                                                                <Badge className="ml-auto text-[7px] px-1 py-0 bg-white/5 text-white/40 border-white/10">
                                                                  {subGroup.forms.length}
                                                                </Badge>
                                                              </button>

                                                              {subGroupState.expanded && (
                                                                <div className="ml-3 pl-2 border-l border-white/8">
                                                                  {subGroup.forms.map(node =>
                                                                    renderFormNode(node, record.id, recordFormStatuses, 0)
                                                                  )}
                                                                </div>
                                                              )}
                                                            </div>
                                                          )
                                                        })}
                                                      </div>
                                                    )}
                                                  </div>
                                                )
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      )
                                    })}

                                    {/* Show message when no records exist in this group */}
                                    {ataGroup.records.length === 0 && (
                                      <div className="px-3 py-2">
                                        <p className="text-[10px] text-white/30 italic mb-1.5">
                                          No ATA records yet
                                        </p>
                                        {permissions.canCreateATA && ataGroup.ataChapterId && (
                                          <button
                                            type="button"
                                            className="h-7 w-full flex items-center justify-center gap-1 text-[10px] text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/15 border border-dashed border-emerald-400/30 rounded-md transition-colors"
                                            onClick={(e) => handleCreateATAClick(e, shop.id, ataGroup.ataChapterId, ataGroup.ataChapterNumber)}
                                          >
                                            <Plus className="h-3 w-3" />
                                            Create First ATA Record
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}

                          {/* Show when no ATA records exist at all for this shop */}
                          {!shopState.loading && (shopATARecords[shop.id] || []).length === 0 && (
                            <div className="px-3 py-2">
                              <p className="text-[10px] text-white/30 italic mb-1.5">
                                No ATA records in this shop
                              </p>
                              {permissions.canCreateATA && (
                                <button
                                  type="button"
                                  className="h-7 w-full flex items-center justify-center gap-1 text-[10px] text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/15 border border-dashed border-emerald-400/30 rounded-md transition-colors"
                                  onClick={(e) => handleCreateATAClick(e, shop.id, '', '')}
                                >
                                  <Plus className="h-3 w-3" />
                                  Create First ATA Record
                                </button>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Create ATA Record Dialog */}
        {showCreateATA && createATAContext && (
          <CreateATARecordDialog
            open={showCreateATA}
            onClose={() => setShowCreateATA(false)}
            shopId={createATAContext.shopId}
            ataChapterId={createATAContext.ataChapterId || undefined}
            ataChapterNumber={createATAContext.ataChapterNumber || undefined}
          />
        )}
      </div>
    </TooltipProvider>
  )
}