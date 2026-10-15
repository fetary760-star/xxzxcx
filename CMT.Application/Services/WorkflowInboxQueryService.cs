using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Contracts.Workflow;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;
using CMT.Domain.Models.Workflow;

namespace CMT.Application.SelfEvaluation.Services
{
    // =====================================================================================
    // AMENDED - WorkflowInboxQueryService.cs   (NEW FILE)
    // Copy to: CMT.Application.SelfEvaluation/Services/WorkflowInboxQueryService.cs
    //
    // WHAT THIS SERVICE IS
    // --------------------
    // The read model behind GET /api/workflow/inbox and GET /api/workflow/inbox/counts, i.e.
    // the data the role-based dashboard sidebar needs. It answers, for every role of the
    // sidebar (Director, Manager, Shop Team Leader, CAA Officer, QA Manager, Documentation),
    // how many requests sit in each of the five buckets: Assigned, Pending, Completed,
    // Reviewed, Rejected - and links every request to its ATA (ETA) chapter and Part Number.
    //
    // WHY A SEPARATE SERVICE
    // ----------------------
    // WorkflowInstanceQueryService is the SINGLE-instance read path (it deliberately returns
    // the full materialised chain plus every frozen signature line, which is the fix for the
    // "previous approver disappears" defect). Reusing it per row would load every step and
    // every signature of every instance just to render five integers. This service is the
    // LIST read path: one instance query with its steps, one folder lookup, one user lookup.
    //
    // BUCKET RULES (documented once, so the API and the sidebar cannot disagree)
    // -------------------------------------------------------------------------
    //   Assigned  : the chain is pending AND a concrete person owns the pending step
    //               (FormWorkflowStep.AssignedToUserId, or FormWorkflowInstance
    //               .CurrentAssigneeUserId, is set).
    //   Pending   : the chain is pending but the step is still in a ROLE / UNIT queue -
    //               State == AwaitingAssignment, or no assignee has been resolved yet.
    //   Reviewed  : this role already executed a non-draft step (State == Completed,
    //               IsSkipped == false) and the chain is STILL running. This is what makes
    //               "Reviewed" different from "Completed" on the sidebar.
    //   Completed : ApprovalStatusInfo.CountsAsComplete(Status) - Approved / Completed /
    //               Locked / Skipped.
    //   Rejected  : Rejected / Returned / Revoked - the row is back with the originator.
    //
    // A single instance therefore contributes to SEVERAL role rows (the role that must act
    // now counts it as Assigned/Pending, every role that already signed counts it as
    // Reviewed or Completed). That is intentional: the sidebar is a per-role workload view,
    // not a partition of the instance table.
    //
    // BINDING RULES: user ids are long, entity ids are Guid.
    //
    // DI: register in Program.cs -> builder.Services.AddScoped<WorkflowInboxQueryService>();
    //     Without the registration the controller cannot be activated and the routes return
    //     500, which looks exactly like the original 404 to the sidebar.
    // =====================================================================================

    public sealed class WorkflowInboxQueryService
    {
        private readonly ApplicationDbContext _context;

        /// <summary>Hard ceiling, so `?pageSize=500` can never turn into a table scan.</summary>
        private const int MaxPageSize = 500;

        public WorkflowInboxQueryService(ApplicationDbContext context)
        {
            _context = context;
        }

        /// <summary>
        /// The roles rendered by the dashboard sidebar, in display order, with the exact
        /// captions the UI prints. QAPersonnel is the "QA Manager" of the requirement and
        /// ECAAPersonnel is the "CAA Officer"; both mappings follow RoleHierarchy.DisplayNames.
        /// </summary>
        public static readonly WorkflowRoleDescriptor[] SidebarRoles =
        {
            new() { Role = OrgRoles.Director,                 Label = "Director" },
            new() { Role = OrgRoles.Manager,                  Label = "Manager" },
            new() { Role = OrgRoles.TeamLeader,               Label = "Shop Team Leader" },
            new() { Role = OrgRoles.ECAAPersonnel,            Label = "CAA Officer" },
            new() { Role = OrgRoles.QAPersonnel,              Label = "QA Manager" },
            new() { Role = OrgRoles.DocumentationTeamLeader,  Label = "Documentation" }
        };

        /// <summary>Roles that legitimately see every shop.</summary>
        private static bool SeesEverything(string? canonicalRole) =>
            canonicalRole is OrgRoles.Admin
                          or OrgRoles.Director
                          or OrgRoles.Manager
                          or OrgRoles.SpecialTeamLeader;

        // =================================================================================
        // PUBLIC API
        // =================================================================================

        /// <summary>
        /// GET /api/workflow/inbox - the request rows visible to <paramref name="actor"/>.
        /// </summary>
        public async Task<List<WorkflowInboxItem>> GetInboxAsync(
            User actor,
            string? scope = WorkflowInboxScopes.Mine,
            int pageSize = 100,
            CancellationToken cancellationToken = default)
        {
            var take = pageSize <= 0 ? 100 : Math.Min(pageSize, MaxPageSize);
            var normalizedScope = NormalizeScope(scope);
            var canonicalActorRole = RoleHierarchy.Normalize(actor.Role);

            var instances = await LoadInstancesAsync(
                actor, canonicalActorRole, normalizedScope, take, cancellationToken);

            if (instances.Count == 0) return new List<WorkflowInboxItem>();

            var folders = await LoadFoldersAsync(instances, cancellationToken);
            var userNames = await LoadUserNamesAsync(instances, cancellationToken);

            return instances
                .Select(instance => Map(instance, actor, canonicalActorRole, folders, userNames))
                .ToList();
        }

        /// <summary>
        /// GET /api/workflow/inbox/counts - the five counters per sidebar role.
        /// </summary>
        public async Task<WorkflowInboxCountsResponse> GetCountsAsync(
            User actor,
            string? scope = WorkflowInboxScopes.All,
            int pageSize = MaxPageSize,
            CancellationToken cancellationToken = default)
        {
            var normalizedScope = NormalizeScope(scope);
            var canonicalActorRole = RoleHierarchy.Normalize(actor.Role);

            var items = await GetInboxAsync(actor, normalizedScope, pageSize, cancellationToken);

            var response = new WorkflowInboxCountsResponse
            {
                UserId = actor.Id,
                Role = canonicalActorRole ?? actor.Role ?? string.Empty,
                RoleLabel = RoleHierarchy.Label(actor.Role),
                ShopId = actor.ShopId,
                Scope = normalizedScope,
                ItemCount = items.Count
            };

            // One block per sidebar role, always present even when the count is zero, so the
            // UI renders a stable list instead of collapsing empty roles.
            var blocks = SidebarRoles.ToDictionary(
                r => r.Role,
                r => new WorkflowRoleCounts
                {
                    Role = r.Role,
                    RoleLabel = r.Label,
                    IsMyRole = string.Equals(r.Role, canonicalActorRole, StringComparison.OrdinalIgnoreCase)
                },
                StringComparer.OrdinalIgnoreCase);

            foreach (var item in items)
            {
                if (item.StatusBucket != WorkflowStatusBuckets.Completed)
                    response.Totals.Add(item.StatusBucket);

                if (IsMine(item, actor) && item.StatusBucket != WorkflowStatusBuckets.Completed)
                    response.Mine.Add(item.StatusBucket);

                foreach (var (role, bucket) in AttributeToRoles(item, actor))
                {
                    if (!blocks.TryGetValue(role, out var block)) continue;

                    block.Counts.Add(bucket);
                    if (!block.InstanceIds.Contains(item.InstanceId))
                        block.InstanceIds.Add(item.InstanceId);
                }
            }

            response.Roles = SidebarRoles.Select(r => blocks[r.Role]).ToList();
            return response;
        }

        // =================================================================================
        // QUERY
        // =================================================================================

        private async Task<List<FormWorkflowInstance>> LoadInstancesAsync(
            User actor,
            string? canonicalActorRole,
            string scope,
            int take,
            CancellationToken cancellationToken)
        {
            var query = _context.WorkflowInstances
                .AsNoTracking()
                .Include(i => i.Steps)
                .AsQueryable();

            switch (scope)
            {
                case WorkflowInboxScopes.Shop:
                    if (actor.ShopId.HasValue)
                        query = query.Where(i => i.ShopId == actor.ShopId.Value
                                              || i.OriginatorShopId == actor.ShopId.Value);
                    break;

                case WorkflowInboxScopes.All:
                    // Admin / Director / Manager / Special Team Leader see every shop; everyone
                    // else sees their own shop plus anything they personally touch, so a
                    // Shop Team Leader never reads another shop's workload.
                    if (!SeesEverything(canonicalActorRole))
                    {
                        var shopId = actor.ShopId;
                        query = query.Where(i =>
                            (shopId.HasValue && (i.ShopId == shopId.Value || i.OriginatorShopId == shopId.Value))
                            || i.OriginatorUserId == actor.Id
                            || i.CurrentAssigneeUserId == actor.Id
                            || i.Steps.Any(s => s.AssignedToUserId == actor.Id || s.ActedByUserId == actor.Id));
                    }
                    break;

                default: // WorkflowInboxScopes.Mine
                    query = query.Where(i =>
                        i.CurrentAssigneeUserId == actor.Id
                        || i.OriginatorUserId == actor.Id
                        || i.Steps.Any(s => s.AssignedToUserId == actor.Id || s.ActedByUserId == actor.Id));
                    break;
            }

            return await query
                .OrderByDescending(i => i.UpdatedAt)
                .Take(take)
                .ToListAsync(cancellationToken);
        }

        private async Task<Dictionary<Guid, EvaluationFolder>> LoadFoldersAsync(
            List<FormWorkflowInstance> instances, CancellationToken cancellationToken)
        {
            var folderIds = instances
                .Where(i => i.EvaluationFolderId.HasValue)
                .Select(i => i.EvaluationFolderId!.Value)
                .Distinct()
                .ToList();

            if (folderIds.Count == 0) return new Dictionary<Guid, EvaluationFolder>();

            return await _context.EvaluationFolders
                .AsNoTracking()
                .Where(f => folderIds.Contains(f.Id))
                .ToDictionaryAsync(f => f.Id, cancellationToken);
        }

        private async Task<Dictionary<long, string>> LoadUserNamesAsync(
            List<FormWorkflowInstance> instances, CancellationToken cancellationToken)
        {
            var ids = new HashSet<long>();

            foreach (var instance in instances)
            {
                if (instance.CurrentAssigneeUserId.HasValue)
                    ids.Add(instance.CurrentAssigneeUserId.Value);

                foreach (var step in instance.Steps)
                {
                    if (step.AssignedToUserId.HasValue) ids.Add(step.AssignedToUserId.Value);
                    if (step.ActedByUserId.HasValue) ids.Add(step.ActedByUserId.Value);
                }
            }

            if (ids.Count == 0) return new Dictionary<long, string>();

            var idList = ids.ToList();

            return await _context.Users
                .AsNoTracking()
                .Where(u => idList.Contains(u.Id))
                .ToDictionaryAsync(u => u.Id, u => u.FullName, cancellationToken);
        }

        // =================================================================================
        // MAPPING
        // =================================================================================

        private static WorkflowInboxItem Map(
            FormWorkflowInstance instance,
            User actor,
            string? canonicalActorRole,
            IReadOnlyDictionary<Guid, EvaluationFolder> folders,
            IReadOnlyDictionary<long, string> userNames)
        {
            var isAdmin = canonicalActorRole == OrgRoles.Admin;
            var pending = RoleHierarchy.IsPending(instance.Status);

            // The step the chain is waiting on. CurrentStepNo is authoritative; the state scan
            // is the fallback for rows written before CurrentStepNo was maintained.
            var activeStep = instance.Steps.FirstOrDefault(s => s.StepNo == instance.CurrentStepNo
                                                             && (s.State == WorkflowStepState.Active
                                                              || s.State == WorkflowStepState.AwaitingAssignment))
                          ?? instance.Steps.FirstOrDefault(s => s.State == WorkflowStepState.Active
                                                             || s.State == WorkflowStepState.AwaitingAssignment);

            var eligibleRoles = SplitCsv(activeStep?.EligibleRolesCsv)
                .Select(r => RoleHierarchy.Normalize(r) ?? r)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var assignerRoles = SplitCsv(activeStep?.AssignerRolesCsv)
                .Select(r => RoleHierarchy.Normalize(r) ?? r)
                .ToList();

            var assigneeUserId = activeStep?.AssignedToUserId ?? instance.CurrentAssigneeUserId;
            var hasOwner = assigneeUserId.HasValue;

            var assigneeName = assigneeUserId.HasValue
                && userNames.TryGetValue(assigneeUserId.Value, out var resolvedName)
                    ? resolvedName
                    : (activeStep?.AssignedToName ?? string.Empty);

            var bucket = ResolveBucket(instance, activeStep, pending, hasOwner, actor.Id, canonicalActorRole);

            folders.TryGetValue(instance.EvaluationFolderId ?? Guid.Empty, out var folder);

            var ataChapter = folder?.ATAChapterCode ?? string.Empty;
            var eligibleActor = canonicalActorRole is not null
                             && eligibleRoles.Contains(canonicalActorRole, StringComparer.OrdinalIgnoreCase);
            var assignerActor = canonicalActorRole is not null
                             && assignerRoles.Contains(canonicalActorRole, StringComparer.OrdinalIgnoreCase);
            var assignedToActor = assigneeUserId == actor.Id;

            var skippable = activeStep is not null
                         && (activeStep.SkipMode == SkipMode.Manual
                          || activeStep.SkipMode == SkipMode.ManualOrAuto
                          || activeStep.SkipMode == SkipMode.RegulatoryDate);

            var ownerRole = activeStep is not null && !string.IsNullOrWhiteSpace(activeStep.AssignedToRole)
                ? RoleHierarchy.Normalize(activeStep.AssignedToRole) ?? activeStep.AssignedToRole
                : eligibleRoles.FirstOrDefault() ?? string.Empty;

            return new WorkflowInboxItem
            {
                InstanceId = instance.Id,
                FormSubmissionId = instance.FormSubmissionId,
                EvaluationFolderId = instance.EvaluationFolderId,

                FormType = instance.FormType,
                FormNo = instance.FormNo,
                Title = instance.Title,
                SectionTitle = instance.Section,

                Status = instance.Status,
                StatusLabel = ApprovalStatusInfo.Label(instance.Status),

                StepNo = activeStep?.StepNo ?? instance.CurrentStepNo,
                StepTitle = activeStep?.Title ?? string.Empty,

                IsUnitQueue = !hasOwner && !string.IsNullOrWhiteSpace(instance.CurrentAssignmentUnit),
                AssignmentUnit = activeStep?.AssignmentUnit ?? instance.CurrentAssignmentUnit,

                NeedsAssignment = pending
                                  && activeStep is not null
                                  && (activeStep.State == WorkflowStepState.AwaitingAssignment
                                      || (activeStep.RequiresManualAssignment && !hasOwner)),

                // A Draft-kind step is executed by SUBMIT and belongs to the originator alone,
                // so it must never light up Approve / Reject / Delegate on the dashboard.
                CanIAct = pending
                          && activeStep is not null
                          && activeStep.Kind != WorkflowStepKind.Draft
                          && (isAdmin || assignedToActor || (!hasOwner && eligibleActor)),

                CanIAssign = pending
                             && activeStep is not null
                             && (isAdmin || (activeStep.RequiresManualAssignment && assignerActor
                                 && (!hasOwner || assignedToActor))),

                CanISkip = pending
                           && activeStep is not null
                           && activeStep.Kind != WorkflowStepKind.Draft
                           && (isAdmin || (skippable && (assignedToActor || (!hasOwner && (eligibleActor || assignerActor))))),

                OriginatorName = instance.OriginatorName,
                OriginatorUserId = instance.OriginatorUserId,
                SubmittedAt = instance.SubmittedAt,
                DueDate = instance.ExpiresAt,
                IsOverdue = instance.ExpiresAt.HasValue
                            && instance.ExpiresAt.Value < DateTime.UtcNow
                            && !ApprovalStatusInfo.CountsAsComplete(instance.Status),

                StatusBucket = bucket,
                LifecycleState = ApprovalStatusInfo.StateOf(instance.Status),
                LifecycleStateLabel = ApprovalStatusInfo.StateOf(instance.Status).ToString(),

                OwnerRole = ownerRole,
                OwnerRoleLabel = string.IsNullOrWhiteSpace(ownerRole)
                    ? string.Empty
                    : RoleHierarchy.Label(ownerRole),

                EligibleRoles = eligibleRoles,
                EligibleRoleLabels = eligibleRoles.Select(RoleHierarchy.Label).ToList(),

                CurrentAssigneeUserId = assigneeUserId,
                CurrentAssigneeName = assigneeName,

                ATARecordId = instance.ATARecordId,
                ShopId = instance.ShopId ?? instance.OriginatorShopId,

                ATAChapterCode = ataChapter,
                ETAReference = ataChapter,
                PartNumber = folder?.PartNumber ?? string.Empty,
                FolderCode = folder?.FolderCode ?? string.Empty,
                FolderTitle = folder?.Title ?? string.Empty,

                ActionUrl = instance.EvaluationFolderId.HasValue
                    ? $"/evaluation-folders/{instance.EvaluationFolderId.Value}/forms/{instance.Id}"
                    : $"/workflow/forms/{instance.Id}",

                UpdatedAt = instance.UpdatedAt
            };
        }

        /// <summary>
        /// Applies the documented bucket rules. Terminal states win over the pending scan, so
        /// a completed chain is never double-counted as Assigned.
        /// </summary>
        private static string ResolveBucket(
            FormWorkflowInstance instance,
            FormWorkflowStep? activeStep,
            bool pending,
            bool hasOwner,
            long actorId,
            string? actorRole)
        {
            if (instance.Status is ApprovalStatus.Rejected
                                or ApprovalStatus.Returned
                                or ApprovalStatus.Revoked)
                return WorkflowStatusBuckets.Rejected;

            if (ApprovalStatusInfo.CountsAsComplete(instance.Status) || instance.IsComplete)
                return WorkflowStatusBuckets.Completed;

            var hasReviewed = instance.Steps.Any(step =>
                step.State == WorkflowStepState.Completed
                && !step.IsSkipped
                && (step.ActedByUserId == actorId
                    || (!string.IsNullOrWhiteSpace(actorRole)
                        && string.Equals(
                            RoleHierarchy.Normalize(step.ActedByRole),
                            actorRole,
                            StringComparison.OrdinalIgnoreCase))));

            if (!pending)
                return hasReviewed ? WorkflowStatusBuckets.Reviewed : WorkflowStatusBuckets.Pending;

            if (activeStep is not null && activeStep.State == WorkflowStepState.AwaitingAssignment)
                return WorkflowStatusBuckets.Pending;

            return hasOwner
                ? WorkflowStatusBuckets.Assigned
                : hasReviewed ? WorkflowStatusBuckets.Reviewed : WorkflowStatusBuckets.Pending;
        }

        /// <summary>
        /// Expands one row into the (role, bucket) pairs the sidebar aggregates.
        ///
        /// The role that must act NOW receives the live bucket; every role that already signed
        /// receives Reviewed while the chain runs, or Completed once it finished. This is what
        /// makes a single request appear under several roles with different counters, which is
        /// exactly what a per-role workload sidebar must show.
        /// </summary>
        private static IEnumerable<(string Role, string Bucket)> AttributeToRoles(
            WorkflowInboxItem item,
            User actor)
        {
            var actorRole = RoleHierarchy.Normalize(actor.Role);
            if (string.IsNullOrWhiteSpace(actorRole)) yield break;

            var actorNeedsAction = item.CanIAct || item.CanIAssign || item.CanISkip;
            var actorReviewed = item.StatusBucket == WorkflowStatusBuckets.Reviewed;
            var actorOwnsRequest = item.OriginatorUserId == actor.Id;
            if (!actorNeedsAction && !actorReviewed && !actorOwnsRequest) yield break;

            var emitted = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            // A request contributes only to the logged-in user's active role. This prevents
            // one pending instance from lighting up every eligible role's sidebar counter.
            if (emitted.Add(actorRole))
                yield return (actorRole, item.StatusBucket);
        }

        private static bool IsMine(WorkflowInboxItem item, User actor) =>
            item.CurrentAssigneeUserId == actor.Id
            || item.OriginatorUserId == actor.Id
            || item.CanIAct
            || item.CanIAssign
            || item.CanISkip;

        private static string NormalizeScope(string? scope) => scope?.Trim().ToLowerInvariant() switch
        {
            WorkflowInboxScopes.All => WorkflowInboxScopes.All,
            WorkflowInboxScopes.Shop => WorkflowInboxScopes.Shop,
            _ => WorkflowInboxScopes.Mine
        };

        private static List<string> SplitCsv(string? csv)
        {
            if (string.IsNullOrWhiteSpace(csv)) return new List<string>();
            return csv.Split(',',
                    StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList();
        }
    }
}