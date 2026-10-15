/**
 * =====================================================================================
 * AMENDED v15 - CMT.Frontend/src/components/workflow/DocumentationRoutingPanel.tsx (NEW FILE)
 * Copy to: CMT.Frontend/src/components/workflow/DocumentationRoutingPanel.tsx
 *
 * WHAT THIS FILE IS
 * -----------------
 * The DOCUMENTATION & AD / SB routing surface of requirement #5. It is the client for the
 * two chains declared in FormWorkflowCatalog.Documentation.cs:
 *
 *   SB / SL / SIL  - MNT-1420A   (formType 'sb')
 *     step 1  Draft ................................. STL / ENG, initiation category "Others"
 *     step 2  Routed to the Documentation Team ...... unit queue, DL assigns
 *     step 3  Processed by the assigned clerk ....... ASSIGNED_ONLY scope
 *     step 4  Final review and sign-off ............. DL, SignedOffBy signature block
 *
 *   AD             - MNT-1420B   (formType 'ad')
 *     step 1  Draft ................................. STL only
 *     step 2  Processed ............................. STL only
 *     step 3  Issued (final approval) ............... STL only, sole authority
 *
 * WHY IT IS NEEDED
 * ----------------
 * `SBForm.tsx` and `ADForm.tsx` render the printed hard copy correctly, but their footer is
 * `FormWorkflowFooter` -> `ApprovalWorkflowActions`, which has NO assign action and NO
 * concept of a unit queue. Concretely, on the existing code base:
 *
 *   (1) MNT-1420A reaches "Pending Documentation Team" and STOPS FOREVER. The DL sees the
 *       record but has no control to assign a clerk (requirement #5, routing step 2), and
 *       the clerk never sees it because it was never assigned to a person.
 *   (2) The clerk's processing step and the DL's sign-off step both display the generic
 *       "Approve" verb instead of "Complete" / "Sign off", so the printed signature caption
 *       and the on-screen verb disagree.
 *   (3) MNT-1420A can be initiated from ANY category, while the rule is that it is
 *       "Triggered under the Others category" - the server answers
 *       INITIATION_CATEGORY_INVALID and the UI shows a generic failure toast.
 *   (4) MNT-1420B offers Delegate / Assign to whoever holds a management role, breaking the
 *       "STL holds SOLE authority to draft, process and issue" rule; the server rejects it
 *       with AD_SOLE_AUTHORITY_VIOLATION, again as an unexplained toast.
 *
 * WHAT THIS VERSION DOES
 * ----------------------
 * - Renders the real routing chain of the loaded instance (`instance.steps`), with the unit
 *   queue named explicitly ("Documentation Team") instead of an empty assignee cell.
 * - Surfaces the clerk assignment as its own primary control on step 2, driven by the
 *   server's `canIAssign`, and offers ONLY Documentation Clerks of the Documentation unit -
 *   with their availability and open-ticket count, so ASSIGNEE_NOT_CLERK / CLERK_AT_CAPACITY
 *   cannot be triggered from the UI.
 * - Enforces the "Others" initiation category BEFORE the draft is created, so
 *   INITIATION_CATEGORY_INVALID becomes impossible instead of being explained after the fact.
 * - For MNT-1420B it hides Assign / Delegate entirely and states the sole-authority rule.
 * - Every decision goes through WorkflowStepActions, so the status, the next step and the
 *   signature block always come from `WorkflowActionResponse`.
 *
 * BINDING RULES
 *   user ids are NUMBERS (C# long); instance / folder / submission ids are STRINGS (C# Guid).
 * =====================================================================================
 */
'use client'

import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { FileText, Loader2, ShieldAlert, UserCheck } from 'lucide-react'

import WorkflowStepActions from '@/components/workflow/WorkflowStepActions'
import WorkflowStepTimeline from '@/components/workflow/WorkflowStepTimeline'

import { assignWorkflowStep, createFormDraft } from '@/lib/workflow/workflow-api'
import {
  DOCUMENTATION_INITIATION_CATEGORY_OTHERS,
  FORM_NUMBERS,
  FORM_TYPES,
  WORKFLOW_FIELDS,
  isOthersInitiationCategory,
  type CatalogFormResponse,
  type WorkflowActionResponse,
  type WorkflowInstanceResponse,
} from '@/lib/workflow/workflow-types'

import {
  instanceFactsFrom,
  resolveCanAssign,
  resolveCanDraft,
  type WorkflowActor,
} from '@/lib/workflow/workflow-permissions'

import { useCandidateUsers, useWorkflowAction } from '@/lib/workflow/useWorkflow'
import { FUNCTIONAL_UNITS, ORG_ROLES, normalizeRole, roleLabel } from '@/lib/role-hierarchy'

// =====================================================================================
// Props
// =====================================================================================

export interface DocumentationRoutingPanelProps {
  /** 'sb' (MNT-1420A) or 'ad' (MNT-1420B). */
  formType: typeof FORM_TYPES.SB | typeof FORM_TYPES.AD | string
  /** Folder the record belongs to (C# Guid -> string). */
  folderId?: string | null
  ataRecordId?: string | null
  /** The loaded instance, or null when the draft does not exist yet. */
  instance: WorkflowInstanceResponse | null
  actor: WorkflowActor | null
  /** Catalog row of this form type, from `useWorkflowCatalog().formOf(formType)`. */
  catalogForm: CatalogFormResponse | null
  /** The printed form payload, serialised into FormDataJson when the draft is created. */
  formDataJson?: string
  onInstanceCreated: (instance: WorkflowInstanceResponse) => void | Promise<void>
  onActionCompleted: (response: WorkflowActionResponse) => void | Promise<void>
  className?: string
}

// =====================================================================================
// Component
// =====================================================================================

export default function DocumentationRoutingPanel({
  formType,
  folderId,
  ataRecordId,
  instance,
  actor,
  catalogForm,
  formDataJson = '{}',
  onInstanceCreated,
  onActionCompleted,
  className = '',
}: DocumentationRoutingPanelProps) {
  const { toast } = useToast()
  const { running, run } = useWorkflowAction()

  const isServiceBulletin = formType === FORM_TYPES.SB
  const isAirworthinessDirective = formType === FORM_TYPES.AD

  /**
   * MNT-1420A is "Triggered under the Others category". The field is therefore SEEDED with
   * "others" and locked, instead of being a free-text box that can produce
   * INITIATION_CATEGORY_INVALID.
   */
  const [initiationCategory, setInitiationCategory] = useState<string>(
    DOCUMENTATION_INITIATION_CATEGORY_OTHERS,
  )
  const [bulletinNumber, setBulletinNumber] = useState('')
  const [adNumber, setAdNumber] = useState('')
  const [selectedClerkId, setSelectedClerkId] = useState('')

  const facts = useMemo(() => (instance ? instanceFactsFrom(instance) : null), [instance])

  const pendingStep = useMemo(() => {
    if (!instance) return null
    return instance.steps?.find(step => step.stepNo === instance.currentStepNo) ?? null
  }, [instance])

  const formNo = catalogForm?.formNo || FORM_NUMBERS[formType] || ''

  // ---------------------------------------------------------------------------
  // Draft creation
  // ---------------------------------------------------------------------------

  const draftCapability = useMemo(
    () => (actor ? resolveCanDraft(actor, catalogForm, null) : null),
    [actor, catalogForm],
  )

  const handleCreateDraft = async () => {
    if (isServiceBulletin && !isOthersInitiationCategory(initiationCategory)) {
      toast({
        title: 'Initiation category',
        description: `${formNo} must be initiated under the "Others" category.`,
        variant: 'destructive',
      })
      return
    }

    // The printed identity fields travel inside FormDataJson using the camelCase keys the
    // Documentation catalog part declares, so the server can drive its skip conditions.
    let payload: Record<string, unknown> = {}
    try {
      payload = JSON.parse(formDataJson || '{}') as Record<string, unknown>
    } catch {
      payload = {}
    }

    if (isServiceBulletin) {
      payload[WORKFLOW_FIELDS.InitiationCategory] = DOCUMENTATION_INITIATION_CATEGORY_OTHERS
      if (bulletinNumber.trim()) payload[WORKFLOW_FIELDS.BulletinNumber] = bulletinNumber.trim()
    }
    if (isAirworthinessDirective && adNumber.trim()) {
      payload[WORKFLOW_FIELDS.ADNumber] = adNumber.trim()
    }

    const created = await run(
      () =>
        createFormDraft({
          formType,
          evaluationFolderId: folderId ?? null,
          ataRecordId: ataRecordId ?? null,
          formDataJson: JSON.stringify(payload),
          initiationCategory: isServiceBulletin
            ? DOCUMENTATION_INITIATION_CATEGORY_OTHERS
            : null,
        }),
      {
        onError: message =>
          toast({ title: 'Draft not created', description: message, variant: 'destructive' }),
      },
    )

    if (!created) return
    toast({
      title: 'Draft created',
      description: `${formNo} is now at step 1 of ${created.totalSteps}.`,
    })
    await onInstanceCreated(created)
  }

  // ---------------------------------------------------------------------------
  // Clerk assignment  (requirement #5, routing step 2)
  // ---------------------------------------------------------------------------

  // The pool is restricted to the Documentation unit, so a shop technician is never offered.
  const clerkPool = useCandidateUsers({
    functionalUnit: FUNCTIONAL_UNITS.Documentation,
  })

  const assignableClerks = useMemo(() => {
    const eligible = clerkPool.assignableFor(facts, pendingStep?.stepNo)
    // Belt and braces: the step's eligibleRoles already restrict this, but the printed rule
    // says an AVAILABLE clerk, so an explicitly unavailable person is dropped as well.
    return eligible.filter(
      user =>
        normalizeRole(user.role) === ORG_ROLES.DocumentationClerk &&
        user.isAvailable !== false &&
        user.isAbsentNow !== true,
    )
  }, [clerkPool, facts, pendingStep?.stepNo])

  const assignCapability = useMemo(() => {
    if (!actor || !facts) return null
    return resolveCanAssign(actor, facts, pendingStep)
  }, [actor, facts, pendingStep])

  const showClerkAssignment =
    isServiceBulletin &&
    !!pendingStep &&
    pendingStep.requiresManualAssignment &&
    assignCapability?.allowed === true

  const handleAssignClerk = async () => {
    if (!instance || !selectedClerkId) {
      toast({
        title: 'Clerk required',
        description: 'Select an available Documentation Clerk first.',
        variant: 'destructive',
      })
      return
    }

    const response = await run(
      () =>
        assignWorkflowStep(instance.id, {
          stepNo: pendingStep?.stepNo ?? null,
          // NUMBER, never a Guid - this is the C# long of AssignStepRequest.
          assignToUserId: Number(selectedClerkId),
          comments: 'Assigned by the Documentation Team Leader.',
        }),
      {
        onError: message =>
          toast({ title: 'Assignment failed', description: message, variant: 'destructive' }),
      },
    )

    if (!response) return
    toast({
      title: 'Clerk assigned',
      description: response.currentAssigneeName
        ? `${response.currentAssigneeName} now owns step ${response.currentStepNo}.`
        : response.message,
    })
    setSelectedClerkId('')
    await onActionCompleted(response)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className={`space-y-4 ${className}`}>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4 text-gray-600" />
            {formNo} routing
            {instance && (
              <Badge variant="outline" className="ml-1 text-[11px]">
                {instance.statusLabel}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* ---------- The rule, stated on screen ---------- */}
          {isServiceBulletin ? (
            <p className="text-xs text-gray-600">
              Initiated under the <strong>Others</strong> category, routed to the Documentation
              Team, assigned to an available clerk by the Documentation Team Leader, then
              returned to the Documentation Team Leader for final review and sign-off.
            </p>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
              <p className="text-xs text-amber-900">
                The Shop Team Leader holds <strong>sole authority</strong> to draft, process and
                issue {formNo}. It is never assigned or delegated to another role.
              </p>
            </div>
          )}

          {/* ---------- Draft creation ---------- */}
          {!instance && (
            <div className="space-y-3 rounded-md border border-gray-200 p-3">
              {isServiceBulletin ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">Initiation category</Label>
                      {/* Locked to "others": that is the initiation rule of MNT-1420A. */}
                      <Input
                        value={initiationCategory}
                        onChange={event => setInitiationCategory(event.target.value)}
                        readOnly
                        className="h-8 bg-gray-50 text-xs"
                      />
                      <p className="text-[11px] text-gray-500">
                        Fixed by the routing rule; it cannot be changed here.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">SB / SL / SIL number</Label>
                      <Input
                        value={bulletinNumber}
                        onChange={event => setBulletinNumber(event.target.value)}
                        placeholder="e.g. SB 34-1029"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">AD number</Label>
                  <Input
                    value={adNumber}
                    onChange={event => setAdNumber(event.target.value)}
                    placeholder="e.g. AD 2021-14-05"
                    className="h-8 text-xs"
                  />
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => void handleCreateDraft()}
                  disabled={running || draftCapability?.allowed !== true}
                  title={draftCapability?.allowed ? '' : draftCapability?.reason}
                >
                  {running && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  Create {formNo} draft
                </Button>
                {draftCapability && !draftCapability.allowed && (
                  <p className="text-xs text-amber-800">{draftCapability.reason}</p>
                )}
              </div>

              {catalogForm?.draftRoleLabels?.length ? (
                <p className="text-[11px] text-gray-500">
                  Draft roles: {catalogForm.draftRoleLabels.join(' / ')}
                </p>
              ) : null}
            </div>
          )}

          {/* ---------- Clerk assignment (routing step 2) ---------- */}
          {showClerkAssignment && (
            <div className="space-y-3 rounded-md border border-violet-200 bg-violet-50 p-3">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-violet-700" />
                <p className="text-xs font-semibold text-violet-900">
                  Assign an available Documentation Clerk
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-violet-900">Clerk *</Label>
                  <Select value={selectedClerkId} onValueChange={setSelectedClerkId}>
                    <SelectTrigger className="h-8 bg-white text-xs">
                      <SelectValue
                        placeholder={
                          clerkPool.loading ? 'Loading clerks...' : 'Select a clerk...'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="z-[110]">
                      {assignableClerks.map(user => (
                        <SelectItem key={user.userId} value={String(user.userId)}>
                          {[
                            user.fullName || `User ${user.userId}`,
                            roleLabel(user.role),
                            user.openTickets !== null && user.openTickets !== undefined
                              ? `${user.openTickets} open`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!clerkPool.loading && assignableClerks.length === 0 && (
                    <p className="text-[11px] text-amber-800">
                      {clerkPool.error ??
                        'No available Documentation Clerk is currently eligible for this step.'}
                    </p>
                  )}
                </div>

                <Button
                  size="sm"
                  className="bg-violet-600 text-white hover:bg-violet-700"
                  onClick={() => void handleAssignClerk()}
                  disabled={running || !selectedClerkId}
                >
                  {running && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                  Assign clerk
                </Button>
              </div>
            </div>
          )}

          {/* ---------- Routing chain + action bar ---------- */}
          {instance && (
            <>
              <WorkflowStepTimeline instance={instance} />
              <WorkflowStepActions
                instance={instance}
                actor={actor}
                onActionCompleted={onActionCompleted}
                // MNT-1420B is never assigned or delegated, so the joint toggle stays hidden.
                showJointApprovalToggle={false}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}