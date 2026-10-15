/**
 * =====================================================================================
 * AMENDED v17 - PHASE 1 (FRONTEND)
 * CMT.Frontend/src/components/workflow/WorkflowInbox.tsx                    (NEW FILE)
 * Copy to: CMT.Frontend/src/components/workflow/WorkflowInbox.tsx
 *
 * WHAT THIS FILE IS
 * -----------------
 * "My Inbox (pending my action)" exactly as Phase 1 specifies it:
 *
 *   "rows from GET /api/workflow/inbox showing form no, title, step no/title, step kind,
 *    status label, originator, submitted/due dates, overdue flag, personal vs unit-queue
 *    badge, and action buttons driven strictly by the server flags CanIAct / CanIAssign /
 *    CanISkip / NeedsAssignment; filters by unit queue, overdue and section. no mock data"
 *
 * THE ONE RULE THAT GOVERNS EVERY BUTTON HERE
 * -------------------------------------------
 * The visibility and the enabled state of each action come STRICTLY from the server flags
 * carried by `InboxItemResponse`:
 *
 *     canIAct          -> the primary verb (Approve / Verify / Review / Sign off / ...)
 *     canIAssign       -> "Assign"
 *     canISkip         -> "Skip"
 *     needsAssignment  -> the row is a UNIT QUEUE row waiting for an assignee, so the
 *                         primary verb is suppressed and "Assign" becomes the primary action
 *
 * NOTHING is re-derived locally. `workflow-permissions.ts` is deliberately NOT imported:
 * an inbox row carries no step table, so a local rule would have to guess, and guessing is
 * the exact defect class the v11..v17 amendments exist to end. The row already went through
 * the server matrix; the client only renders the answer.
 *
 * WHY THE VERB IS NOT HARDCODED TO "Approve"
 * ------------------------------------------
 * `stepKind` decides the label through `stepKindActionLabel()`:
 *   Assignment -> "Assign"     Verification -> "Verify"     Gate -> "Verify checklist"
 *   Processing -> "Complete"   Endorsement  -> "Endorse"     SignOff -> "Sign off"
 * A Documentation Clerk therefore sees "Complete", the ECAA Team sees "Endorse" and the
 * MNT-1325 final gate sees "Verify checklist" - which is what makes the same table usable
 * for all fourteen roles instead of pretending every step is an approval.
 *
 * NO MOCK DATA
 * ------------
 * There is no seeded array anywhere in this file. Three states are rendered instead:
 *   loading -> skeleton rows
 *   error   -> the uniform `errorCode` message plus a Retry button
 *   empty   -> "Nothing is waiting for your action."
 * =====================================================================================
 */

'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Inbox as InboxIcon,
  RefreshCw,
  SkipForward,
  UserPlus,
  Users,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { useWorkflowInbox } from '@/lib/workflow/useWorkflow'
import {
  TOC_SECTIONS_ORDERED,
  approvalStatusLabel,
  lifecycleStateOf,
  lifecycleStateClasses,
  stepKindActionLabel,
  stepKindLabel,
  type InboxItemResponse,
} from '@/lib/workflow/workflow-types'

// =====================================================================================
// 1. PROPS
// =====================================================================================

export interface WorkflowInboxProps {
  /** Restrict the queue to one evaluation folder. Omit for the caller's whole queue. */
  folderId?: string
  /** Restrict the queue to one shop (an STL only ever sees his own shop server side). */
  shopId?: string
  /**
   * Row callbacks. The inbox NEVER mutates a workflow itself: it hands the instance id to
   * the owning screen, which opens the form and performs the transition there. That keeps
   * one single place responsible for the comment / assignee / reason dialogs.
   */
  onOpen?: (row: InboxItemResponse) => void
  onAct?: (row: InboxItemResponse) => void
  onAssign?: (row: InboxItemResponse) => void
  onSkip?: (row: InboxItemResponse) => void
  className?: string
}

/** The three filters Phase 1 asks for, kept in one object so a reset is one setState. */
interface InboxFilters {
  /** 'all' | 'personal' | 'unit'  - personal vs unit-queue. */
  queue: 'all' | 'personal' | 'unit'
  onlyOverdue: boolean
  /** ToC section title, or 'all'. */
  sectionTitle: string
  search: string
}

const DEFAULT_FILTERS: InboxFilters = {
  queue: 'all',
  onlyOverdue: false,
  sectionTitle: 'all',
  search: '',
}

// =====================================================================================
// 2. SMALL PRESENTATION HELPERS
// =====================================================================================

function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' })
}

/** "in 3 days" / "4 days overdue" - the human form of dueDate + isOverdue. */
function dueHint(row: InboxItemResponse): string {
  if (!row.dueDate) return ''
  const due = new Date(row.dueDate)
  if (Number.isNaN(due.getTime())) return ''
  const days = Math.round((due.getTime() - Date.now()) / 86400000)
  if (row.isOverdue || days < 0) return `${Math.abs(days)} day(s) overdue`
  if (days === 0) return 'due today'
  return `due in ${days} day(s)`
}

/** A stable key even if the same instance appears on two steps. */
function rowKey(row: InboxItemResponse): string {
  return `${row.instanceId}:${row.stepNo}`
}

// =====================================================================================
// 3. THE TABLE
// =====================================================================================

export function WorkflowInbox({
  folderId,
  shopId,
  onOpen,
  onAct,
  onAssign,
  onSkip,
  className,
}: WorkflowInboxProps) {
  const [filters, setFilters] = useState<InboxFilters>(DEFAULT_FILTERS)

  /**
   * `includeUnitQueue` and `onlyOverdue` are SERVER-SIDE filters, so they are part of the
   * query and the row set really shrinks. `queue`, `sectionTitle` and `search` are refined
   * client side over the rows already returned, which keeps typing responsive.
   */
  const { data, loading, error, reload } = useWorkflowInbox({
    folderId,
    shopId,
    includeUnitQueue: filters.queue !== 'personal',
    onlyOverdue: filters.onlyOverdue || undefined,
  })

  const rows = useMemo(() => {
    const needle = filters.search.trim().toLowerCase()

    return (data ?? []).filter(row => {
      if (filters.queue === 'personal' && row.isUnitQueue) return false
      if (filters.queue === 'unit' && !row.isUnitQueue) return false
      if (filters.onlyOverdue && !row.isOverdue) return false

      if (filters.sectionTitle !== 'all') {
        const section = (row.sectionTitle ?? '').trim().toLowerCase()
        if (section !== filters.sectionTitle.trim().toLowerCase()) return false
      }

      if (needle !== '') {
        const haystack = [
          row.formNo,
          row.title,
          row.stepTitle,
          row.originatorName,
          row.sectionTitle,
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(needle)) return false
      }

      return true
    })
  }, [data, filters])

  const counts = useMemo(() => {
    const all = data ?? []
    return {
      total: all.length,
      personal: all.filter(r => !r.isUnitQueue).length,
      unit: all.filter(r => r.isUnitQueue).length,
      overdue: all.filter(r => r.isOverdue).length,
      needsAssignment: all.filter(r => r.needsAssignment).length,
    }
  }, [data])

  /** Section options come from the rows actually present, plus the printed ToC order. */
  const sectionOptions = useMemo(() => {
    const present = new Set(
      (data ?? [])
        .map(r => (r.sectionTitle ?? '').trim())
        .filter(title => title !== ''),
    )
    const ordered = TOC_SECTIONS_ORDERED.filter(section => present.has(section.title)).map(
      section => section.title,
    )
    for (const title of present) {
      if (!ordered.includes(title)) ordered.push(title)
    }
    return ordered
  }, [data])

  const patch = useCallback((next: Partial<InboxFilters>) => {
    setFilters(current => ({ ...current, ...next }))
  }, [])

  return (
    <Card className={className}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <InboxIcon className="h-5 w-5 text-slate-600" aria-hidden />
              My Inbox
            </CardTitle>
            <CardDescription>
              Records waiting for your action, straight from the server routing engine.
            </CardDescription>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-800">
              {counts.total} total
            </Badge>
            <Badge variant="outline" className="border-violet-300 bg-violet-100 text-violet-900">
              {counts.unit} unit queue
            </Badge>
            {counts.overdue > 0 && (
              <Badge variant="outline" className="border-red-300 bg-red-100 text-red-900">
                {counts.overdue} overdue
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reload()}
              disabled={loading}
              className="!bg-transparent !hover:bg-transparent"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden />
              Refresh
            </Button>
          </div>
        </div>

        {/* ---------- filters: unit queue, overdue, section, free text ---------- */}
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={filters.queue}
            onValueChange={value => patch({ queue: value as InboxFilters['queue'] })}
          >
            <SelectTrigger className="h-9 w-[210px]">
              <SelectValue placeholder="Queue" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All queues ({counts.total})</SelectItem>
              <SelectItem value="personal">Assigned to me ({counts.personal})</SelectItem>
              <SelectItem value="unit">Unit queue ({counts.unit})</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.sectionTitle}
            onValueChange={value => patch({ sectionTitle: value })}
          >
            <SelectTrigger className="h-9 w-[280px]">
              <SelectValue placeholder="Section" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {sectionOptions.map(title => (
                <SelectItem key={title} value={title}>
                  {title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant={filters.onlyOverdue ? 'default' : 'outline'}
            size="sm"
            onClick={() => patch({ onlyOverdue: !filters.onlyOverdue })}
            className={filters.onlyOverdue ? '' : '!bg-transparent !hover:bg-transparent'}
          >
            <Clock className="mr-2 h-4 w-4" aria-hidden />
            Overdue only
          </Button>

          <Input
            value={filters.search}
            onChange={event => patch({ search: event.target.value })}
            placeholder="Search form no, title, step or originator"
            className="h-9 w-[300px]"
          />

          {(filters.queue !== 'all' ||
            filters.onlyOverdue ||
            filters.sectionTitle !== 'all' ||
            filters.search !== '') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="text-slate-700"
            >
              Clear filters
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <Alert className="mb-4 border-red-300 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-700" aria-hidden />
            <AlertTitle className="text-red-900">The inbox could not be loaded</AlertTitle>
            <AlertDescription className="text-red-900">
              {error}
              <Button
                variant="outline"
                size="sm"
                onClick={() => void reload()}
                className="ml-3 !bg-transparent !hover:bg-transparent"
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="overflow-x-auto rounded-md border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-[150px]">Form no</TableHead>
                <TableHead className="min-w-[240px]">Title / section</TableHead>
                <TableHead className="min-w-[220px]">Step</TableHead>
                <TableHead className="min-w-[190px]">Status</TableHead>
                <TableHead className="w-[150px]">Originator</TableHead>
                <TableHead className="w-[130px]">Submitted</TableHead>
                <TableHead className="w-[150px]">Due</TableHead>
                <TableHead className="w-[300px] text-right">Action</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {loading && (data ?? []).length === 0
                ? Array.from({ length: 4 }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      {Array.from({ length: 8 }).map((__, cell) => (
                        <TableCell key={`skeleton-${index}-${cell}`}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                : rows.map(row => (
                    <InboxRow
                      key={rowKey(row)}
                      row={row}
                      onOpen={onOpen}
                      onAct={onAct}
                      onAssign={onAssign}
                      onSkip={onSkip}
                    />
                  ))}

              {!loading && rows.length === 0 && !error && (
                <TableRow>
                  <TableCell colSpan={8} className="py-12 text-center">
                    <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-emerald-600" aria-hidden />
                    <p className="font-medium text-slate-800">
                      {(data ?? []).length === 0
                        ? 'Nothing is waiting for your action.'
                        : 'No record matches the current filters.'}
                    </p>
                    <p className="text-sm text-slate-600">
                      {(data ?? []).length === 0
                        ? 'New assignments appear here as soon as a step is routed to you or to your unit.'
                        : 'Clear the filters to see the rest of your queue.'}
                    </p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {counts.needsAssignment > 0 && (
          <p className="mt-3 text-sm text-slate-700">
            <Users className="mr-1 inline h-4 w-4 text-violet-700" aria-hidden />
            {counts.needsAssignment} record(s) in your unit queue still need an assignee before
            anybody can act on them.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

// =====================================================================================
// 4. ONE ROW
// =====================================================================================

interface InboxRowProps {
  row: InboxItemResponse
  onOpen?: (row: InboxItemResponse) => void
  onAct?: (row: InboxItemResponse) => void
  onAssign?: (row: InboxItemResponse) => void
  onSkip?: (row: InboxItemResponse) => void
}

function InboxRow({ row, onOpen, onAct, onAssign, onSkip }: InboxRowProps) {
  // Prefer the server label; fall back to the local map only when it is absent.
  const statusLabel =
    row.statusLabel && row.statusLabel.trim() !== ''
      ? row.statusLabel
      : approvalStatusLabel(row.status)

  const statusClasses = lifecycleStateClasses(lifecycleStateOf(row.status))
  const actionLabel = stepKindActionLabel(row.stepKind)
  const hint = dueHint(row)

  /**
   * `needsAssignment` wins over `canIAct`: while a unit-queue row has no assignee the
   * primary action is the ASSIGNMENT, not the decision. That is requirement #5
   * (DL assigns an available clerk) and requirement #4 (STL assigns Certifying Staff).
   */
  const primaryIsAssign = row.needsAssignment && row.canIAssign
  const showAct = row.canIAct && !row.needsAssignment
  const showAssign = row.canIAssign && !primaryIsAssign
  const showSkip = row.canISkip

  return (
    <TableRow className={row.isOverdue ? 'bg-red-50/60' : undefined}>
      <TableCell className="font-mono text-sm font-medium text-slate-900">
        {row.formNo || '—'}
      </TableCell>

      <TableCell>
        <button
          type="button"
          onClick={() => onOpen?.(row)}
          className="text-left font-medium text-slate-900 underline-offset-2 hover:underline"
        >
          {row.title || row.formType}
        </button>
        <p className="text-xs text-slate-600">{row.sectionTitle || '—'}</p>
      </TableCell>

      <TableCell>
        <p className="text-sm text-slate-900">
          <span className="mr-1 font-semibold">#{row.stepNo}</span>
          {row.stepTitle || '—'}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge variant="outline" className="border-slate-300 bg-slate-100 text-slate-800">
            {stepKindLabel(row.stepKind)}
          </Badge>
          {row.isUnitQueue ? (
            <Badge variant="outline" className="border-violet-300 bg-violet-100 text-violet-900">
              <Users className="mr-1 h-3 w-3" aria-hidden />
              {row.assignmentUnit || 'Unit queue'}
            </Badge>
          ) : (
            <Badge variant="outline" className="border-sky-300 bg-sky-100 text-sky-900">
              Assigned to me
            </Badge>
          )}
          {row.needsAssignment && (
            <Badge variant="outline" className="border-amber-300 bg-amber-100 text-amber-900">
              Needs assignment
            </Badge>
          )}
        </div>
      </TableCell>

      <TableCell>
        <Badge variant="outline" className={statusClasses}>
          {statusLabel}
        </Badge>
      </TableCell>

      <TableCell className="text-sm text-slate-800">{row.originatorName || '—'}</TableCell>

      <TableCell className="text-sm text-slate-800">{formatDate(row.submittedAt)}</TableCell>

      <TableCell>
        <p className="text-sm text-slate-800">{formatDate(row.dueDate)}</p>
        {hint !== '' && (
          <p className={`text-xs ${row.isOverdue ? 'font-medium text-red-800' : 'text-slate-600'}`}>
            {hint}
          </p>
        )}
      </TableCell>

      <TableCell className="text-right">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {primaryIsAssign && (
            <Button size="sm" onClick={() => onAssign?.(row)}>
              <UserPlus className="mr-2 h-4 w-4" aria-hidden />
              Assign
            </Button>
          )}

          {showAct && (
            <Button size="sm" onClick={() => onAct?.(row)}>
              {actionLabel}
            </Button>
          )}

          {showAssign && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAssign?.(row)}
              className="!bg-transparent !hover:bg-transparent"
            >
              <UserPlus className="mr-2 h-4 w-4" aria-hidden />
              Assign
            </Button>
          )}

          {showSkip && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSkip?.(row)}
              className="!bg-transparent !hover:bg-transparent"
            >
              <SkipForward className="mr-2 h-4 w-4" aria-hidden />
              Skip
            </Button>
          )}

          <Button variant="ghost" size="sm" onClick={() => onOpen?.(row)} className="text-slate-700">
            Open
            <ArrowRight className="ml-1 h-4 w-4" aria-hidden />
          </Button>
        </div>

        {/*
          When the server sent NO capability at all the row is genuinely read-only for this
          user (it is visible because his unit owns it). Saying so is better than rendering a
          dead button.
        */}
        {!row.canIAct && !row.canIAssign && !row.canISkip && (
          <p className="mt-1 text-xs text-slate-600">View only — no action is routed to you.</p>
        )}
      </TableCell>
    </TableRow>
  )
}

export default WorkflowInbox