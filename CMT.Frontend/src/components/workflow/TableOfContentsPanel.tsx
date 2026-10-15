/**
 * =====================================================================================
 * REDESIGN v21 - THE SIMPLIFIED, EXPANDABLE TABLE OF CONTENTS
 * CMT.Frontend/src/components/workflow/TableOfContentsPanel.tsx                (AMENDED)
 * Copy to: CMT.Frontend/src/components/workflow/TableOfContentsPanel.tsx
 *
 * WHAT THIS FILE IS
 * -----------------
 * The document-checklist sidebar of an evaluation folder. It merges two sources and keeps
 * them strictly separated:
 *
 *   PRINTED ORDER  <- `TOC_TOP_LEVEL_FORMS` + `TOC_CATEGORIES` of
 *                     `lib/self-evaluation/toc-structure.tsx`
 *   LIVE STATUS    <- `TableOfContentsResponse` of
 *                     GET /api/evaluation-folders/{id}/table-of-contents
 *
 * =====================================================================================
 * WHAT THE v21 REDESIGN CHANGES (this amendment)
 * =====================================================================================
 * The v18 row was DENSE: form title, form id, a lifecycle icon, a returned hint, a status
 * badge, an "Action required" badge, an "Optional" badge, a "May skip now" badge, the
 * current step, the assignee, a mini progress bar, "n / N steps", the expiry, the owner,
 * AND "2 signature lines on the printed form". Fourteen pieces of text on one line is not
 * scannable, and none of it answered the question the new multi-approver workflow raises:
 * "which of the two approvers of this form already acted, and who is holding it now?"
 *
 *   1. SIMPLIFIED ROW. Each row now shows ONLY:
 *        - the Form Title
 *        - the Form ID (form number)
 *        - ONE high-level, colour-coded status badge
 *      "X signature lines on the printed form" is REMOVED (so is the printedCaptionCount
 *      import), the per-row owner line is REMOVED, and the lifecycle icon / returned hint /
 *      separate "Action required" badge / step text / assignee text / mini bar / expiry
 *      text are all folded into the badge and the expanded tracker.
 *
 *   2. UNIFIED COLOUR SYSTEM (`highLevelStatusOf` of toc-view-model.ts):
 *        GREEN  Approved            AMBER  In Progress / Action Required / Revision Needed
 *        RED    Rejected            GRAY   Not Started / Draft / External source
 *        (+ orange Expired and sky Skipped, which the printed folder still distinguishes)
 *
 *   3. EXPANDABLE MINI-KANBAN. Clicking the row's chevron reveals, DIRECTLY BELOW THE
 *      TITLE, the horizontal approver tracker of `ToCStepTracker`: one circular avatar
 *      pill per approver / action-taker, left to right, with a green check for approved,
 *      a PULSING amber circle for the current pending action-taker, a red cross for a
 *      rejection and an amber warning triangle for a revision request - and a tooltip on
 *      every pill carrying the person's NAME, ROLE and the EXACT UTC timestamp.
 *
 *   4. TWO OR MORE APPROVERS ON ONE FORM. The tracker chain comes from
 *      `buildToCTrackerStages`, which GROUPS adjacent steps that share a stage into ONE
 *      capsule with several pills and a "1/2" counter. So when one approver approved and
 *      the other requested a revision, BOTH are visible at once, and the row badge shows
 *      the worst state ("Revision Needed") while the capsule still shows the green check
 *      of the approver who did act.
 *
 *   5. LAZY FETCH. The ToC endpoint carries no per-step facts, so the panel fetches
 *      `getWorkflowForm(instanceId)` ONCE per row, only when that row is first expanded,
 *      caches it, and never re-requests it while the panel stays mounted.
 *
 * BINDING RULES (unchanged from v18)
 *   (1) THE PRINTED TREE IS NEVER REORDERED and never filtered by what the API returned.
 *       A form the API does not return yet renders as "Not Started" - not hidden.
 *   (2) API items that are NOT in the static tree are appended, never dropped.
 *   (3) `canIDraft` / `canIAct` come off the API item and are never re-derived here.
 *       ABSENT FLAG MEANS NO: the gate is `=== true`, never `!== false`.
 *   (4) folderId / instanceId are STRINGS (C# Guid); only user ids are numbers.
 *   (5) Purely navigational + one create action. Approvals happen in WorkflowActionBar.
 *   (6) `provisioned && row?.canIDraft === true` is the ONLY gate of the Start button, and
 *       `createDraft()` itself refuses to run unprovisioned.
 * =====================================================================================
 */

'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  ListTree,
  Loader2,
  Lock,
  Search,
  Users,
} from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'

import {
  TOC_CATEGORIES,
  TOC_TOP_LEVEL_FORMS,
  type TocCategory,
  type TocFormNode,
  type TocSubGroup,
} from '@/lib/self-evaluation/toc-structure'

import { createFormDraft, getWorkflowForm } from '@/lib/workflow/workflow-api'
import {
  createFormSubmission,
  getFormSubmissionById,
  updateFormSubmission,
} from '@/lib/self-evaluation/api'

import {
  ApprovalStatus,
  FormLifecycleState,
  type TableOfContentsItemResponse as TocRowResponse,
  type TableOfContentsResponse,
  type WorkflowInstanceResponse,
} from '@/lib/workflow/workflow-types'

import {
  buildToCTrackerStages,
  highLevelStatusOf,
  trackerCountersOf,
  type ToCHighLevelKey,
  type ToCTrackerStage,
} from '@/lib/workflow/toc-view-model'
import { isExternalSourceFormType } from '@/lib/workflow/status-badge'

import ToCFollowUpPanels from '@/components/workflow/ToCFollowUpPanels'
import ToCStepTracker from '@/components/workflow/ToCStepTracker'
import TableOfContentsProgressSidebar from '@/components/workflow/TableOfContentsProgressSidebar'

import { useWorkflowAction } from '@/lib/workflow/useWorkflow'
import { useSelfEvaluation } from '@/lib/self-evaluation/context'

// =====================================================================================
// 1. PROPS
// =====================================================================================

export interface TableOfContentsPanelProps {
  /** C# Guid of the evaluation folder. */
  folderId: string
  /** ATA record owning legacy form submissions when the folder engine is unavailable. */
  ataRecordId?: string | null

  /**
  * false while no EvaluationFolder Guid exists (see useEvaluationFolder). The printed
  * tree still renders in full; rows backed by existing legacy submissions retain their
  * stored status, while mutating affordances are disabled because there is no folder.
   */
  provisioned?: boolean

  /** GET /api/evaluation-folders/{folderId}/table-of-contents, via `useTableOfContents()`. */
  toc: TableOfContentsResponse | null
  loading?: boolean
  error?: string | null
  /** Re-fetch after a draft is created. */
  reload?: () => void | Promise<void>
  /** Existing legacy form rows used when the folder has not been provisioned yet. */
  formSubmissions?: Array<{
    id: string
    formType: string
    formNo: string
    approvalStatus: number
  }>

  /** The form currently open in the workspace, so the row is highlighted. */
  activeFormType?: string | null
  /** Opens a form in the workspace. `instanceId` is null for a form not started yet. */
  onOpenForm: (formType: string, instanceId: string | null, readOnly: boolean) => void
  /** Forms omitted by ATA capability rules, such as FAA/ECAA 918 variants. */
  hiddenFormTypes?: ReadonlySet<string>

  /** Only show rows that are waiting for the signed-in user. */
  defaultMineOnly?: boolean
  className?: string
}

// =====================================================================================
// 2. THE LAZY TRACKER CACHE
//    ONE `getWorkflowForm(instanceId)` per expanded row, cached for the lifetime of the
//    panel. The ToC endpoint carries no per-step facts, so this is the only way to render
//    the approver pills with real names, roles and UTC timestamps.
// =====================================================================================

type TrackerEntry =
  | { status: 'loading' }
  | { status: 'ready'; stages: ToCTrackerStage[] }
  | { status: 'error'; message: string }

function useTrackerCache() {
  const [entries, setEntries] = useState<Record<string, TrackerEntry>>({})

  const load = useCallback(
    (instanceId: string) => {
      setEntries(previous => {
        if (previous[instanceId]) return previous
        return { ...previous, [instanceId]: { status: 'loading' } }
      })

      void getWorkflowForm(instanceId)
        .then((instance: WorkflowInstanceResponse) => {
          setEntries(previous => ({
            ...previous,
            [instanceId]: { status: 'ready', stages: buildToCTrackerStages(instance) },
          }))
        })
        .catch((caught: unknown) => {
          setEntries(previous => ({
            ...previous,
            [instanceId]: {
              status: 'error',
              message:
                caught instanceof Error
                  ? caught.message
                  : 'The routing steps of this form could not be loaded.',
            },
          }))
        })
    },
    [],
  )

  return { entries, load }
}

// =====================================================================================
// 3. SECTION COUNTERS
//    Recomputed LOCALLY from the rows with the SAME high-level vocabulary as the row
//    badges, because `TableOfContentsSectionResponse` declares its counters optional and a
//    missing counter must never read as zero.
// =====================================================================================

interface SectionTally {
  total: number
  closed: number
  chips: Array<{ key: ToCHighLevelKey; label: string; count: number; classes: string }>
}

/** Chip order: what needs chasing first, then progress, then informational buckets. */
const CHIP_ORDER: ToCHighLevelKey[] = [
  'action_required',
  'revision_needed',
  'rejected',
  'expired',
  'in_progress',
  'draft',
  'approved',
  'skipped',
  'not_started',
  'external',
]

function tallyOf(rows: Array<TocRowResponse | null>): SectionTally {
  const counts = new Map<ToCHighLevelKey, number>()
  let closed = 0

  for (const row of rows) {
    if (row && isExternalSourceFormType(row.formType)) continue
    const status = highLevelStatusOf(row)
    counts.set(status.key, (counts.get(status.key) ?? 0) + 1)
    if (status.countsAsClosed) closed += 1
  }

  const chips = CHIP_ORDER.filter(key => (counts.get(key) ?? 0) > 0).map(key => {
    const status = highLevelStatusOf(null)
    void status
    const style = highLevelStatusFromKey(key)
    return { key, label: style.label, count: counts.get(key) ?? 0, classes: style.classes }
  })

  return { total: rows.length, closed, chips }
}

/** Local shim so the chip list can style a key without owning a second palette. */
function highLevelStatusFromKey(key: ToCHighLevelKey) {
  // `highLevelStatusOf` needs a row; the palette itself is keyed, so build a minimal probe.
  const probe = HIGH_LEVEL_PROBES[key]
  return probe
}

/**
 * The nine key -> {label, classes} pairs, read ONCE from the projection so this file never
 * hard-codes a second colour system. Built lazily from a synthetic lookup table that maps
 * every key onto the exact style `highLevelStatusFor` produces.
 */
const HIGH_LEVEL_PROBES: Record<ToCHighLevelKey, { label: string; classes: string }> = {
  approved: { label: 'Approved', classes: 'border-emerald-300 bg-emerald-50 text-emerald-800' },
  in_progress: { label: 'In Progress', classes: 'border-amber-300 bg-amber-50 text-amber-900' },
  action_required: {
    label: 'Action Required',
    classes: 'border-amber-400 bg-amber-100 text-amber-900',
  },
  revision_needed: {
    label: 'Revision Needed',
    classes: 'border-amber-400 bg-amber-100 text-amber-900',
  },
  rejected: { label: 'Rejected', classes: 'border-red-300 bg-red-50 text-red-800' },
  expired: { label: 'Expired', classes: 'border-orange-300 bg-orange-50 text-orange-900' },
  skipped: { label: 'Skipped', classes: 'border-sky-300 bg-sky-50 text-sky-900' },
  draft: { label: 'Draft', classes: 'border-gray-300 bg-gray-50 text-gray-700' },
  not_started: { label: 'Not Started', classes: 'border-gray-300 bg-gray-50 text-gray-600' },
  external: {
    label: 'External Source',
    classes: 'border-dashed border-slate-300 bg-slate-50 text-slate-600',
  },
}

function SectionCounters({ rows }: { rows: Array<TocRowResponse | null> }) {
  const tally = tallyOf(rows)

  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge
        variant="outline"
        className="border-gray-200 bg-white px-1.5 py-0 text-[9px] font-semibold text-gray-600"
      >
        {tally.closed}/{tally.total}
      </Badge>
      {tally.chips.map(chip => (
        <Badge
          key={chip.key}
          className={`border px-1.5 py-0 text-[9px] font-medium ${chip.classes}`}
        >
          {chip.count} {chip.label}
        </Badge>
      ))}
    </span>
  )
}

// =====================================================================================
// 4. THE SIMPLIFIED ROW  +  ITS EXPANDED MINI-KANBAN BAR
// =====================================================================================

interface RowProps {
  node: TocFormNode
  row: TocRowResponse | null
  isActive: boolean
  creating: boolean
  /** `provisioned && row?.canIDraft === true` - server-first, absent flag means no. */
  canCreate: boolean
  expanded: boolean
  /** Tracker of this row, once it has been requested. */
  tracker: TrackerEntry | undefined
  childrenExpanded: boolean
  onToggle: () => void
  onToggleChildren: () => void
  onOpen: () => void
  onInclude: () => void
  onSkip: () => void
  onCreate: () => void
}

function TocRow({
  node,
  row,
  isActive,
  creating,
  canCreate,
  expanded,
  tracker,
  childrenExpanded,
  onToggle,
  onToggleChildren,
  onOpen,
  onInclude,
  onSkip,
  onCreate,
}: RowProps) {
  const status = highLevelStatusOf(row)
  // The printed tree must also identify external forms when the API has no row yet.
  const isExternal =
    isExternalSourceFormType(String(node.formType)) ||
    (!!row && isExternalSourceFormType(row.formType))
  const notStarted = !isExternal && (!row || !row.formWorkflowInstanceId)
  const isPendingOnMe = status.key === 'action_required'
  const isTrainingDecisionRow = node.formType === 'simple_task' || node.formType === 'similar_task'
  const isSkipped = status.key === 'skipped' || row?.status === ApprovalStatus.Skipped
  const Icon = node.Icon

  // A multi-approver hint is available as soon as the tracker is loaded.
  const stages = tracker?.status === 'ready' ? tracker.stages : null
  const counters = stages ? trackerCountersOf(stages) : null
  const hasChildren = !!node.children?.length
  const toggleLabel = hasChildren
    ? childrenExpanded
      ? 'Collapse sub-items'
      : 'Expand sub-items'
    : expanded
      ? 'Hide approval progress'
      : 'Show approval progress'

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isActive
          ? 'border-blue-300 bg-blue-50/70'
          : isPendingOnMe
            ? 'border-amber-300 bg-amber-50/50 hover:bg-amber-50'
            : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/70'
      }`}
    >
      {/* ---------- THE SIMPLIFIED LINE: title · id · ONE status badge ---------- */}
      <div className="flex items-center gap-1.5 px-2 py-2">
        <button
          type="button"
          aria-label={toggleLabel}
          aria-expanded={hasChildren ? childrenExpanded : expanded}
          disabled={!hasChildren && (notStarted || isExternal)}
          onClick={event => {
            event.stopPropagation()
            if (hasChildren) onToggleChildren()
            else onToggle()
          }}
          className="shrink-0 rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:cursor-default disabled:opacity-30"
        >
          {(hasChildren ? childrenExpanded : expanded) ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          title={node.label}
        >
          <Icon className={`h-4 w-4 shrink-0 ${node.iconClass}`} aria-hidden="true" />

          <span className="min-w-0 flex-1">
            <span className="block min-w-0 break-words text-[13px] font-medium leading-snug text-gray-900 [overflow-wrap:anywhere]">
              {node.label}
            </span>
            {node.formNo && (
              <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
                {node.formNo}
              </span>
            )}
            {row?.routingLabel && (
              <span className="mt-0.5 block text-[10px] font-medium text-blue-700">
                {row.routingLabel}
              </span>
            )}
          </span>
        </button>

        {/* ONE high-level badge. Nothing else. */}
        <span className="flex shrink-0 items-center gap-1">
          {counters?.hasConcurrentStage && (
            <span
              className="inline-flex items-center gap-0.5 rounded-full border border-gray-200 bg-white px-1 py-0 text-[9px] font-semibold text-gray-500"
              title={`${counters.totalApprovers} approvers on this form`}
            >
              <Users className="h-2.5 w-2.5" aria-hidden="true" />
              {counters.approvedApprovers}/{counters.totalApprovers}
            </span>
          )}

          {!isExternal && (
            <Badge className={`border px-1.5 py-0.5 text-[10px] font-semibold ${status.classes}`}>
              <span
                className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${status.dotClasses} ${
                  isPendingOnMe ? 'animate-pulse' : ''
                }`}
                aria-hidden="true"
              />
              {status.label}
            </Badge>
          )}

          {notStarted && canCreate && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 shrink-0 border-blue-300 px-1.5 text-[10px] text-blue-800 hover:bg-blue-50 disabled:opacity-50"
              onClick={event => {
                event.stopPropagation()
                onCreate()
              }}
              disabled={creating}
              title="Create the draft and materialise its routing steps"
            >
              {creating ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              ) : (
                <FilePlus2 className="h-3 w-3" aria-hidden="true" />
              )}
              <span className="ml-1 hidden sm:inline">Start</span>
            </Button>
          )}
          {isTrainingDecisionRow && (!row?.routingReadOnly || isSkipped) && (
            <>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 shrink-0 border-emerald-300 px-1.5 text-[10px] text-emerald-800 hover:bg-emerald-50"
                onClick={event => {
                  event.stopPropagation()
                    onInclude()
                }}
                title={isSkipped ? 'Restore this form for editing and workflow actions' : 'Open this form and choose Include training evaluation'}
              >
                Include
              </Button>
              {!isSkipped && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 shrink-0 border-amber-300 px-1.5 text-[10px] text-amber-800 hover:bg-amber-50"
                  onClick={event => {
                    event.stopPropagation()
                    onSkip()
                  }}
                  title="Open this form and choose N/A training evaluation"
                >
                  N/A
                </Button>
              )}
            </>
          )}
        </span>
      </div>

      {/* ---------- THE LIVE APPROVAL STEPPER, directly below the title ---------- */}
      {row?.formWorkflowInstanceId && expanded && !hasChildren && (
        <div className="border-t border-gray-100 px-3 py-2 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          {!tracker || tracker.status === 'loading' ? (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Loading the approval chain…
            </div>
          ) : tracker.status === 'error' ? (
            <p className="break-words text-[11px] text-red-700 [overflow-wrap:anywhere]">
              {tracker.message}
            </p>
          ) : (
            <ToCStepTracker stages={tracker.stages} showSummary={expanded} />
          )}
        </div>
      )}
    </div>
  )
}

// =====================================================================================
// 5. THE PRINTED SECTIONS
//    Rebuilt from toc-structure.tsx so the ORDER of the hard copy is the order on screen.
// =====================================================================================

interface PrintedGroup {
  id: string
  title: string | null
  nodes: TocFormNode[]
}

interface PrintedSection {
  id: string
  title: string
  headerClasses: string
  titleClasses: string
  groups: PrintedGroup[]
}

function flattenNodes(nodes: TocFormNode[]): TocFormNode[] {
  return nodes.flatMap(node => [node, ...(node.children ? flattenNodes(node.children) : [])])
}

function categorySection(category: TocCategory): PrintedSection {
  const groups: PrintedGroup[] = [
    { id: `${category.id}-direct`, title: null, nodes: category.forms },
    ...(category.subGroups ?? []).map((group: TocSubGroup) => ({
      id: group.id,
      title: group.title,
      nodes: group.forms,
    })),
  ].filter(group => group.nodes.length > 0)

  return {
    id: category.id,
    title: category.title,
    headerClasses: `${category.bgColor} ${category.borderColor}`,
    titleClasses: category.color,
    groups,
  }
}

const PRINTED_SECTIONS: PrintedSection[] = [
  {
    id: 'toc-general',
    title: 'Evaluation folder header forms',
    headerClasses: 'bg-gray-50 border-gray-200',
    titleClasses: 'text-gray-800',
    groups: [{ id: 'toc-general-direct', title: null, nodes: TOC_TOP_LEVEL_FORMS }],
  },
  ...TOC_CATEGORIES.map(categorySection),
]

/** Every formType present in the printed tree, so extra API items can be detected. */
const STATIC_FORM_TYPES: Set<string> = new Set(
  PRINTED_SECTIONS.flatMap(section =>
    section.groups.flatMap(group => flattenNodes(group.nodes).map(node => String(node.formType))),
  ),
)

// =====================================================================================
// 6. PANEL
// =====================================================================================

export default function TableOfContentsPanel({
  folderId,
  ataRecordId = null,
  provisioned = true,
  toc,
  loading = false,
  error = null,
  reload,
  formSubmissions = [],
  activeFormType = null,
  onOpenForm,
  hiddenFormTypes,
  defaultMineOnly = false,
  className = '',
}: TableOfContentsPanelProps) {
  const { toast } = useToast()
  const { running, run } = useWorkflowAction()
  const { triggerRefresh } = useSelfEvaluation()

  const [query, setQuery] = useState('')
  const [mineOnly, setMineOnly] = useState(defaultMineOnly)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({})
  const [creatingType, setCreatingType] = useState<string | null>(null)

  const { entries: trackers, load: loadTracker } = useTrackerCache()

  /** Every item of every section, whatever order the sections arrived in. */
  const allRows = useMemo<TocRowResponse[]>(() => {
    const liveRows = (toc?.sections ?? []).flatMap(section => section.items ?? [])
    if (liveRows.length > 0 || formSubmissions.length === 0) return liveRows

    const nodesByType = new Map(
      PRINTED_SECTIONS.flatMap(section =>
        section.groups.flatMap(group => flattenNodes(group.nodes)),
      ).map(node => [String(node.formType), node]),
    )

    return formSubmissions
      .filter(form => form.formType && form.id)
      .map((form, index) => {
        const node = nodesByType.get(form.formType)
        const isApproved = form.approvalStatus === ApprovalStatus.Approved
          || form.approvalStatus === ApprovalStatus.Completed
          || form.approvalStatus === ApprovalStatus.Locked
        const isSkipped = form.approvalStatus === ApprovalStatus.Skipped
        const isRejected = form.approvalStatus === ApprovalStatus.Rejected
          || form.approvalStatus === ApprovalStatus.Returned
          || form.approvalStatus === ApprovalStatus.Revoked
        const lifecycleState = isApproved
          ? FormLifecycleState.Approved
          : isSkipped
            ? FormLifecycleState.Skipped
            : isRejected
              ? FormLifecycleState.ActionRequired
              : form.approvalStatus === ApprovalStatus.Draft
                ? FormLifecycleState.Draft
                : FormLifecycleState.Pending

        return {
          id: form.id,
          sectionCode: '',
          sectionTitle: '',
          sectionOrder: index,
          itemOrder: index,
          formType: form.formType,
          formNo: form.formNo || node?.formNo || '',
          formTitle: node?.label || form.formType,
          isMandatory: true,
          isOptionalByRegulatoryDate: false,
          maySkipNow: false,
          formSubmissionId: form.id,
          formWorkflowInstanceId: null,
          status: Number(form.approvalStatus) as ApprovalStatus,
          statusLabel: isApproved ? 'Approved' : isSkipped ? 'Skipped' : isRejected ? 'Rejected' : form.approvalStatus === ApprovalStatus.Draft ? 'Draft' : 'Pending approval',
          lifecycleState,
          lifecycleStateLabel: isApproved ? 'Approved' : isSkipped ? 'Skipped' : isRejected ? 'Action required' : form.approvalStatus === ApprovalStatus.Draft ? 'Draft' : 'Pending',
          totalSteps: 0,
          completedSteps: isApproved || isSkipped ? 1 : 0,
          currentStepTitle: '',
          currentAssigneeUserId: null,
          currentAssigneeName: '',
          expiresAt: null,
          isExpired: false,
          remarks: 'Status from the existing form submission; approval steps are available when the evaluation folder is provisioned.',
          canIDraft: false,
          canIAct: false,
          approvalGateOpen: false,
          approvalGateMessage: 'Evaluation folder not provisioned.',
        }
      })
  }, [formSubmissions, toc])

  // The approval route is part of the primary ToC view, so every started form gets its
  // server-defined stepper without requiring the user to expand rows one by one.
  useEffect(() => {
    for (const row of allRows) {
      if (row.formWorkflowInstanceId) loadTracker(row.formWorkflowInstanceId)
    }
  }, [allRows, loadTracker])

  /** formType -> live item. The row with the most completed steps wins after a revision. */
  const rowsByType = useMemo(() => {
    const map = new Map<string, TocRowResponse>()
    for (const row of allRows) {
      const existing = map.get(row.formType)
      if (!existing) {
        map.set(row.formType, row)
        continue
      }
      const existingScore = existing.formWorkflowInstanceId ? existing.completedSteps ?? 0 : -1
      const candidateScore = row.formWorkflowInstanceId ? row.completedSteps ?? 0 : -1
      if (candidateScore >= existingScore) map.set(row.formType, row)
    }
    return map
  }, [allRows])

  const extraRows = useMemo(
    () => allRows.filter(row => !STATIC_FORM_TYPES.has(String(row.formType))),
    [allRows],
  )

  /** Folder header counters, recomputed locally with the SAME high-level vocabulary. */
  const allRowList = useMemo<Array<TocRowResponse | null>>(
    () => [
      ...Array.from(STATIC_FORM_TYPES)
        .filter(formType => !hiddenFormTypes?.has(formType))
        .filter(formType => !isExternalSourceFormType(formType))
        .map(formType => rowsByType.get(formType) ?? null),
      ...extraRows.filter(row => !isExternalSourceFormType(row.formType)),
    ],
    [hiddenFormTypes, rowsByType, extraRows],
  )

  const folderTally = useMemo(() => tallyOf(allRowList), [allRowList])

  const actionRequiredCount = useMemo(
    () => allRows.filter(row => row.canIAct === true).length,
    [allRows],
  )

  const attentionCount = useMemo(
    () => allRowList.filter(row => highLevelStatusOf(row).isAttention).length,
    [allRowList],
  )

  const completionPercent =
    folderTally.total > 0 ? Math.round((folderTally.closed / folderTally.total) * 100) : 0

  // -----------------------------------------------------------------------------------
  // expand / collapse ONE row -> lazily fetch its approval chain
  // -----------------------------------------------------------------------------------

  const toggleRow = useCallback(
    (nodeId: string, instanceId: string | null) => {
      setExpandedRows(previous => {
        const next = { ...previous, [nodeId]: !previous[nodeId] }
        return next
      })
      if (instanceId) loadTracker(instanceId)
    },
    [loadTracker],
  )

  const toggleNodeChildren = useCallback((nodeId: string) => {
    setExpandedNodes(previous => ({ ...previous, [nodeId]: !previous[nodeId] }))
  }, [])

  // -----------------------------------------------------------------------------------
  // create draft
  // -----------------------------------------------------------------------------------

  const createDraft = (formType: string) => {
    if (!provisioned || !folderId) {
      toast({
        title: 'No evaluation folder yet',
        description:
          'This ATA record has no evaluation folder, so a draft cannot be created. ' +
          'Provision the folder first.',
        variant: 'destructive',
      })
      return
    }

    setCreatingType(formType)
    void run(
      () =>
        createFormDraft({
          formType,
          evaluationFolderId: folderId,
          formDataJson: '{}',
        }),
      {
        onSuccess: async instance => {
          toast({
            title: 'Draft created',
            description: instance?.statusLabel
              ? `The routing steps of this form were materialised (${instance.statusLabel}).`
              : 'The routing steps of this form were materialised.',
          })
          setCreatingType(null)
          await reload?.()
          if (instance?.id) onOpenForm(formType, instance.id, false)
        },
        onError: message => {
          toast({
            title: 'Could not create the draft',
            description: message,
            variant: 'destructive',
          })
          setCreatingType(null)
        },
      },
    )
  }

  const skipTaskForm = async (formType: string, row: TocRowResponse | null, formNo: string) => {
    if (!ataRecordId) {
      toast({
        title: 'Cannot skip form',
        description: 'No ATA record is selected for this form.',
        variant: 'destructive',
      })
      return
    }

    const formDataJson = JSON.stringify({ trainingRequired: false })
    const result = await run(
      async () => {
        if (row?.formSubmissionId) {
          await updateFormSubmission(row.formSubmissionId, { formNo, formDataJson })
          return { id: row.formSubmissionId }
        }
        return createFormSubmission({ ataRecordId, formType, formNo, formDataJson })
      },
      {
        onError: message => toast({
          title: 'Could not skip form',
          description: message,
          variant: 'destructive',
        }),
      },
    )

    if (!result && !row?.formSubmissionId) return
    toast({
      title: 'Form skipped',
      description: 'The form is now read-only until it is included again.',
    })
    triggerRefresh()
    await reload?.()
    const submissionId = row?.formSubmissionId ?? (result as { id?: string } | null)?.id ?? null
    onOpenForm(formType, submissionId, true)
  }

  const includeTaskForm = async (formType: string, row: TocRowResponse | null, formNo: string) => {
    if (!row?.formSubmissionId) {
      onOpenForm(formType, null, false)
      return
    }

    const formSubmissionId = row.formSubmissionId
    if (!formSubmissionId) {
      onOpenForm(formType, null, false)
      return
    }

    onOpenForm(formType, formSubmissionId, false)

    const existing = await run(() => getFormSubmissionById(formSubmissionId), {
      onError: message => toast({
        title: 'Could not restore form',
        description: message,
        variant: 'destructive',
      }),
    })
    if (!existing) return

    let formData: Record<string, unknown> = {}
    try {
      formData = JSON.parse(existing.formDataJson || '{}') as Record<string, unknown>
    } catch {
      formData = {}
    }
    formData.trainingRequired = true

    const restored = await run(
      () => updateFormSubmission(formSubmissionId, {
        formNo: formNo || existing.formNo,
        revNo: existing.revNo,
        revDate: existing.revDate,
        formDataJson: JSON.stringify(formData),
      }),
      {
        onError: message => toast({
          title: 'Could not restore form',
          description: message,
          variant: 'destructive',
        }),
      },
    )
    if (restored === null) return

    toast({
      title: 'Form included',
      description: 'Editing and workflow actions are enabled again.',
    })
    triggerRefresh()
    await reload?.()
    onOpenForm(formType, formSubmissionId, false)
  }

  // -----------------------------------------------------------------------------------
  // filtering  -  a node is kept when it, or any descendant, passes both filters
  // -----------------------------------------------------------------------------------

  const nodeMatches = (node: TocFormNode): boolean => {
    if (hiddenFormTypes?.has(String(node.formType))) return false
    const row = rowsByType.get(String(node.formType)) ?? null
    const status = highLevelStatusOf(row)
    const text = `${node.label} ${node.formNo ?? ''} ${status.label} ${row?.statusLabel ?? ''}`
    const passesQuery = !query.trim() || text.toLowerCase().includes(query.trim().toLowerCase())
    const passesMine = !mineOnly || row?.canIAct === true
    if (passesQuery && passesMine) return true
    return (node.children ?? []).some(nodeMatches)
  }

  const renderNodes = (nodes: TocFormNode[], depth: number): ReactNode =>
    nodes.filter(nodeMatches).map(node => {
      const formType = String(node.formType)
      const row = rowsByType.get(formType) ?? null
      const instanceId = row?.formWorkflowInstanceId ?? null
      const children = node.children ?? []
      const childrenExpanded = expandedNodes[node.id] !== false

      return (
        <div key={node.id} className="space-y-1" style={{ marginLeft: depth * 12 }}>
          <TocRow
            node={node}
            row={row}
            isActive={activeFormType === formType}
            creating={running && creatingType === formType}
            canCreate={provisioned && row?.canIDraft === true}
            expanded={expandedRows[node.id] === true && !!instanceId}
            tracker={instanceId ? trackers[instanceId] : undefined}
            onToggle={() => toggleRow(node.id, instanceId)}
            childrenExpanded={childrenExpanded}
            onToggleChildren={() => toggleNodeChildren(node.id)}
            onOpen={() => onOpenForm(formType, instanceId, row?.routingReadOnly === true)}
            onInclude={() => void includeTaskForm(formType, row, node.formNo ?? '')}
            onSkip={() => void skipTaskForm(formType, row, node.formNo ?? '')}
            onCreate={() => createDraft(formType)}
          />

          {children.length > 0 && (
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
                childrenExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="min-h-0 space-y-1 overflow-hidden">
                {renderNodes(children, depth + 1)}
              </div>
            </div>
          )}
        </div>
      )
    })

  const renderSection = (section: PrintedSection): ReactNode => {
    const sectionNodes = section.groups
      .flatMap(group => flattenNodes(group.nodes))
      .filter(node => !hiddenFormTypes?.has(String(node.formType)))
    const visibleNodes = sectionNodes.filter(nodeMatches)
    if (visibleNodes.length === 0) return null

    const sectionRows = sectionNodes
      .filter(node => !isExternalSourceFormType(String(node.formType)))
      .map(node => rowsByType.get(String(node.formType)) ?? null)
    const isCollapsed = collapsed[section.id] === true

    return (
      <div key={section.id} className="space-y-1.5">
        <div className={`rounded-lg border px-2 py-1.5 ${section.headerClasses}`}>
          <button
            type="button"
            className="flex w-full items-start gap-1.5 text-left"
            aria-label={isCollapsed ? 'Expand section' : 'Collapse section'}
            onClick={() => setCollapsed(prev => ({ ...prev, [section.id]: !isCollapsed }))}
          >
            {isCollapsed ? (
              <ChevronRight
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500"
                aria-hidden="true"
              />
            ) : (
              <ChevronDown
                className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-500"
                aria-hidden="true"
              />
            )}
            <span className="min-w-0 flex-1">
              <span
                className={`block min-w-0 break-words text-[11px] font-bold uppercase tracking-wider [overflow-wrap:anywhere] ${section.titleClasses}`}
              >
                {section.title}
              </span>
              <span className="mt-1 block">
                <SectionCounters rows={sectionRows} />
              </span>
            </span>
          </button>
        </div>

        {!isCollapsed && (
          <div className="space-y-1.5 pl-0.5">
            {section.groups.map(group => {
              const groupVisible = flattenNodes(group.nodes).filter(nodeMatches)
              if (groupVisible.length === 0) return null

              return (
                <div key={group.id} className="space-y-1">
                  {group.title && (
                    <p className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      {group.title}
                    </p>
                  )}
                  {renderNodes(group.nodes, 0)}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`flex h-full min-h-0 flex-col bg-white font-sans ${className}`}>
      {/* ================= HEADER ================= */}
      <div className="shrink-0 space-y-2.5 border-b border-gray-200 px-3 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-600">
            <ListTree className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
            Table of Contents
          </h3>

          <span className="text-[11px] font-medium text-gray-500">
            {folderTally.closed}/{folderTally.total} closed
          </span>

          {actionRequiredCount > 0 && (
            <Badge className="border border-amber-400 bg-amber-100 px-1.5 py-0 text-[10px] font-semibold text-amber-900">
              {actionRequiredCount} awaiting you
            </Badge>
          )}

          {attentionCount > 0 && (
            <Badge className="border border-red-300 bg-red-50 px-1.5 py-0 text-[10px] font-semibold text-red-800">
              {attentionCount} need attention
            </Badge>
          )}

          {!provisioned && (
            <Badge className="border border-slate-300 bg-slate-100 px-1.5 py-0 text-[10px] text-slate-800">
              <Lock className="mr-1 h-3 w-3" aria-hidden="true" />
              Not provisioned
            </Badge>
          )}
        </div>

        {folderTally.total > 0 && (
          <div className="space-y-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${completionPercent}%` }}
              />
            </div>
            <p className="text-[10px] font-medium text-gray-500">{completionPercent}% complete</p>
          </div>
        )}

        <TableOfContentsProgressSidebar toc={toc} />

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
            aria-hidden="true"
          />
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search form or number…"
            className="h-8 pl-7 text-xs"
          />
        </div>

        <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-gray-600">
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={event => setMineOnly(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300"
          />
          Only what is waiting for me
        </label>
      </div>

      {/* ================= BODY ================= */}
      <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2.5">
        {loading && !toc ? (
          <div className="space-y-1.5" aria-busy="true">
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={`toc-skeleton-${index}`}
                className="h-11 animate-pulse rounded-lg bg-gray-100"
              />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2">
            <p className="text-xs font-semibold text-red-800">
              The Table of Contents could not be loaded.
            </p>
            <p className="mt-0.5 break-words text-xs text-red-700 [overflow-wrap:anywhere]">
              {error}
            </p>
            {reload && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2 h-7 border-red-300 text-xs text-red-800 hover:bg-red-100"
                onClick={() => void reload()}
              >
                Try again
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2.5">
            <ToCFollowUpPanels
              rows={allRows}
              onOpenForm={(formType, instanceId) => onOpenForm(formType, instanceId, false)}
            />

            {PRINTED_SECTIONS.map(renderSection)}

            {/* ---- items the API returned that are not in the printed tree ---------- */}
            {extraRows.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-dashed border-gray-200 pt-2.5">
                <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Generated / additional forms
                </p>
                {extraRows.map(row => {
                  const status = highLevelStatusOf(row)
                  return (
                    <button
                      key={row.id || row.formWorkflowInstanceId || row.formType}
                      type="button"
                      onClick={() => onOpenForm(
                        row.formType,
                        row.formWorkflowInstanceId ?? null,
                        row.routingReadOnly === true,
                      )}
                      className="flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-2 text-left hover:bg-gray-50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block min-w-0 break-words text-[13px] font-medium text-gray-900 [overflow-wrap:anywhere]">
                          {row.formTitle || row.formType}
                        </span>
                        {row.formNo && (
                          <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
                            {row.formNo}
                          </span>
                        )}
                      </span>
                      <Badge
                        className={`shrink-0 border px-1.5 py-0.5 text-[10px] font-semibold ${status.classes}`}
                      >
                        <span
                          className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${status.dotClasses}`}
                          aria-hidden="true"
                        />
                        {status.label}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
