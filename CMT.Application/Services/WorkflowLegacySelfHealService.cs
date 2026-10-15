using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;
using CMT.Domain.Models.Workflow;

namespace CMT.Application.SelfEvaluation.Services
{
    // =====================================================================================
    // MNT-1229B - LEGACY INSTANCE SELF-HEAL (startup sweep)
    //
    // WHY THIS EXISTS
    //   The routing fix (auto-skip of the optional Engineer assignment steps) and the
    //   Manager signature-block correction (ReviewedBy -> ApprovedBy in the catalog) only
    //   affect NEW transitions. Records that were ALREADY parked by the old engine keep
    //   the broken state forever:
    //
    //     (A) a TNA (MNT-1229B / MNT-1229B-R) submitted before the fix with
    //         FormDataJson.assignToEngineer = false / absent sits at Step 1
    //         "Pending assignment" even though the optional Engineer hand-over should
    //         have been auto-skipped - the reported "legacy submissions remain at
    //         Pending assignment" defect;
    //     (B) a Manager who approved such a form BEFORE the catalog correction froze his
    //         stamp under SignatureBlockType.ReviewedBy, while the printed TNA matrix
    //         reads the "Approved by:" line from ApprovedBy - so his name, date and
    //         signature vanished for every viewer, including on already-Approved forms;
    //     (C) instances created before the originator fields were reliably populated show
    //         a blank preparer line to non-preparer viewers.
    //
    // WHAT IT DOES - three surgical, idempotent repairs, run ONCE at startup:
    //   (A) Walks the catalog skip rules from the form fields and advances any instance
    //       still parked at PendingAssignment whose current step auto-skips, freezing the
    //       skipped steps exactly like the live engine does, and synchronising
    //       FormSubmission.ApprovalStatus + FormWorkflowInstance.Status/CurrentStepNo.
    //       When every remaining step auto-skips, the instance is closed as Approved.
    //   (B) Remaps the Manager step of tna / tool_need_analysis_report from ReviewedBy to
    //       ApprovedBy - on the step row AND on its frozen FormSignature line, for ANY
    //       status (the wrong label lives mostly on completed forms). The tamper-evidence
    //       hash is SHA-256(instanceId|stepNo|userId|signedAt|specimenSha) and does NOT
    //       include the block, so re-labelling cannot invalidate it. Facts (person, role,
    //       date, hash) are NEVER touched.
    //   (C) Backfills OriginatorUserId / OriginatorName / OriginatorRole / OriginatorShopId
    //       / SubmittedAt from the decorated FormSubmission (and the Users row).
    //
    // HARD RULES
    //   - Viewer-independent: identical result no matter who opens the form, which is what
    //     makes statuses / actions / signatures persist "consistently for every viewer".
    //   - Never touches Rejected / Returned instances (legitimately with the originator),
    //     and never touches a step genuinely assigned to an Engineer
    //     (assignToEngineer = true).
    //   - Idempotent: every repair is a no-op once applied.
    //   - A failure here is logged and never blocks startup.
    // =====================================================================================

    public sealed class WorkflowLegacySelfHealService
    {
        private readonly ApplicationDbContext _context;
        private readonly ILogger<WorkflowLegacySelfHealService> _logger;

        public WorkflowLegacySelfHealService(
            ApplicationDbContext context,
            ILogger<WorkflowLegacySelfHealService> logger)
        {
            _context = context;
            _logger = logger;
        }

        /// <summary>Form types whose Manager step needs the ReviewedBy -> ApprovedBy remap.</summary>
        private static readonly string[] TnaFormTypes =
        {
            FormNodeTypes.TNA,
            FormNodeTypes.ToolNeedAnalysisReport
        };

        public Task<int> HealAsync() => HealAsync(0);

        private async Task<int> HealAsync(int retry)
        {
            // Only load what any of the three repairs can touch:
            //  - TNA instances (any status) for the signature-block remap;
            //  - PendingAssignment instances for the stuck-advance;
            //  - instances with a blank originator for the backfill.
            var instances = await _context.WorkflowInstances
                .Include(i => i.Steps)
                .Where(i => TnaFormTypes.Contains(i.FormType)
                         || i.Status == ApprovalStatus.PendingAssignment
                         || string.IsNullOrWhiteSpace(i.OriginatorName))
                .ToListAsync();

            if (instances.Count == 0) return 0;

            var formIds = instances
                .Where(i => i.FormSubmissionId.HasValue)
                .Select(i => i.FormSubmissionId!.Value)
                .Distinct()
                .ToList();

            var forms = formIds.Count == 0
                ? new Dictionary<Guid, FormSubmission>()
                : (await _context.FormSubmissions
                        .Where(f => formIds.Contains(f.Id))
                        .ToListAsync())
                    .GroupBy(f => f.Id)
                    .ToDictionary(g => g.Key, g => g.First());

            var originatorIds = instances
                .Where(i => string.IsNullOrWhiteSpace(i.OriginatorName)
                         && i.FormSubmissionId.HasValue
                         && forms.TryGetValue(i.FormSubmissionId.Value, out var f)
                         && f.SubmittedByUserId.HasValue)
                .Select(i => forms[i.FormSubmissionId!.Value].SubmittedByUserId!.Value)
                .Distinct()
                .ToList();

            var users = originatorIds.Count == 0
                ? new Dictionary<long, User>()
                : (await _context.Users
                        .Where(u => originatorIds.Contains(u.Id))
                        .ToListAsync())
                    .GroupBy(u => u.Id)
                    .ToDictionary(g => g.Key, g => g.First());

            // One batched signature load for the TNA remap (no N+1).
            var tnaIds = instances
                .Where(i => TnaFormTypes.Contains(i.FormType, StringComparer.OrdinalIgnoreCase))
                .Select(i => i.Id)
                .ToList();

            var signaturesByInstance = tnaIds.Count == 0
                ? new Dictionary<Guid, List<FormSignature>>()
                : (await _context.FormSignatures
                        .Where(s => tnaIds.Contains(s.FormWorkflowInstanceId))
                        .ToListAsync())
                    .GroupBy(s => s.FormWorkflowInstanceId)
                    .ToDictionary(g => g.Key, g => g.ToList());

            var repaired = 0;

            foreach (var instance in instances)
            {
                var touched = false;

                if (signaturesByInstance.TryGetValue(instance.Id, out var stamps))
                    touched |= RemapManagerSignatureBlock(instance, stamps);

                touched |= await AdvanceStuckAssignmentAsync(instance, forms);
                touched |= await ReconcileTnaApprovalStepAsync(
                    instance,
                    forms,
                    signaturesByInstance.TryGetValue(instance.Id, out var instanceStamps)
                        ? instanceStamps
                        : new List<FormSignature>());
                touched |= BackfillOriginator(instance, forms, users);

                if (touched)
                {
                    instance.UpdatedAt = DateTime.UtcNow;
                    instance.UpdatedBy = "legacy-self-heal";
                    repaired++;
                }
            }

            if (repaired > 0)
            {
                try
                {
                    await _context.SaveChangesAsync();
                }
                catch (DbUpdateConcurrencyException) when (retry == 0)
                {
                    // Another API instance may be running the same idempotent startup
                    // sweep. Reload the candidates and let the winning instance's state
                    // determine whether anything remains to repair.
                    _context.ChangeTracker.Clear();
                    return await HealAsync(1);
                }
                catch (DbUpdateConcurrencyException)
                {
                    _context.ChangeTracker.Clear();
                    _logger.LogWarning(
                        "MNT-1229B legacy self-heal detected a concurrent repair; " +
                        "another API instance owns the startup sweep.");
                    return 0;
                }

                _logger.LogInformation(
                    "MNT-1229B legacy self-heal repaired {Count} workflow instance(s) " +
                    "(signature-block remap / stuck PendingAssignment advance / originator backfill).",
                    repaired);
            }

            return repaired;
        }

        /// <summary>
        /// Repairs TNA instances created by an older catalog whose active step no longer
        /// matches the persisted form status. In particular, old TNA rows could remain on
        /// a Director step while the form was already PendingManagerApproval.
        /// </summary>
        private async Task<bool> ReconcileTnaApprovalStepAsync(
            FormWorkflowInstance instance,
            Dictionary<Guid, FormSubmission> forms,
            List<FormSignature> stamps)
        {
            if (!TnaFormTypes.Contains(instance.FormType, StringComparer.OrdinalIgnoreCase)
                || !instance.FormSubmissionId.HasValue
                || !forms.TryGetValue(instance.FormSubmissionId.Value, out var form)
                || !ApprovalStatusInfo.StateOf(form.ApprovalStatus).Equals(FormLifecycleState.Pending))
                return false;

            var definition = FormWorkflowCatalog.Get(instance.FormType);
            if (definition is null) return false;

            var migrated = MigrateLegacyTnaStepNumbers(instance, stamps, definition);

            var fields = FlattenFormFields(form.FormDataJson);
            var approvalSteps = FormWorkflowCatalog.ApprovalStepsFor(instance.FormType);
            var target = approvalSteps.FirstOrDefault(step =>
                step.Status == form.ApprovalStatus
                && !FormWorkflowCatalog.ShouldAutoSkip(step, fields)
                && instance.Steps.FirstOrDefault(s => s.StepNo == step.StepNo)?.State
                    is not (WorkflowStepState.Completed or WorkflowStepState.Skipped))
                ?? approvalSteps.FirstOrDefault(step =>
                !FormWorkflowCatalog.ShouldAutoSkip(step, fields)
                && instance.Steps.FirstOrDefault(s => s.StepNo == step.StepNo)?.State
                    is not (WorkflowStepState.Completed or WorkflowStepState.Skipped));
            if (target is null) return migrated;

            var current = instance.Steps.FirstOrDefault(s => s.StepNo == instance.CurrentStepNo);
            var targetStepBeforeAssignment = instance.Steps.FirstOrDefault(s => s.StepNo == target.StepNo);
            var assignedRoleIsValid = targetStepBeforeAssignment is not null
                && target.EligibleRoles.Any(role =>
                    string.Equals(
                        RoleHierarchy.Normalize(targetStepBeforeAssignment.AssignedToRole),
                        RoleHierarchy.Normalize(role),
                        StringComparison.OrdinalIgnoreCase));

            if (!migrated
                && current?.PendingStatus == target.Status
                && form.ApprovalStatus == target.Status
                && instance.Status == form.ApprovalStatus
                && assignedRoleIsValid)
                return false;

            var changed = form.ApprovalStatus != target.Status
                          || instance.Status != target.Status
                          || instance.CurrentStepNo != target.StepNo;
            form.ApprovalStatus = target.RequiresManualAssignment
                ? ApprovalStatus.PendingAssignment
                : target.Status;
            instance.Status = form.ApprovalStatus;
            instance.CurrentStepNo = target.StepNo;
            instance.CurrentAssignmentUnit = null;

            foreach (var step in instance.Steps)
            {
                if (step.StepNo == target.StepNo) continue;
                var definitionStep = FormWorkflowCatalog.StepAt(instance.FormType, step.StepNo);
                if (definitionStep is not null
                    && FormWorkflowCatalog.ShouldAutoSkip(definitionStep, fields)
                    && step.State != WorkflowStepState.Completed
                    && step.State != WorkflowStepState.Skipped)
                {
                    step.State = WorkflowStepState.Skipped;
                    step.IsSkipped = true;
                    step.SkippedAutomatically = true;
                    step.SkipReason = "Reconciled to the current form approval status.";
                    changed = true;
                }
            }

            var targetStep = instance.Steps.FirstOrDefault(s => s.StepNo == target.StepNo);
            if (targetStep is null) return changed;

            targetStep.State = target.RequiresManualAssignment
                ? WorkflowStepState.AwaitingAssignment
                : WorkflowStepState.Active;
            targetStep.IsSkipped = false;
            targetStep.SkippedAutomatically = false;

            if (target.RequiresManualAssignment)
            {
                instance.CurrentAssigneeUserId = null;
                form.CurrentApproverUserId = null;
                instance.CurrentAssignmentUnit = target.AssignmentUnit;
                return true;
            }

            var roles = target.EligibleRoles;
            var variants = RoleHierarchy.PersistedVariants(roles);
            var originatorId = form.SubmittedByUserId ?? 0;
            var approverCandidates = await _context.Users
                .Where(u => u.IsActive
                    && u.RecordStatus != RecordStatus.Deleted
                    && u.Id != originatorId
                    && variants.Contains(u.Role))
                .ToListAsync();

            // RoleHierarchy.RankOf is domain logic and cannot be translated to SQL.
            var approver = approverCandidates
                .OrderBy(u => form.ShopId.HasValue && u.ShopId == form.ShopId ? 0 : 1)
                .ThenBy(u => RoleHierarchy.RankOf(u.Role))
                .ThenBy(u => u.Id)
                .FirstOrDefault();

            if (approver is not null)
            {
                targetStep.AssignedToUserId = approver.Id;
                targetStep.AssignedToName = approver.FullName;
                targetStep.AssignedToRole = RoleHierarchy.Normalize(approver.Role) ?? approver.Role;
                instance.CurrentAssigneeUserId = approver.Id;
                form.CurrentApproverUserId = approver.Id;
            }
            else
            {
                instance.CurrentAssigneeUserId = null;
                form.CurrentApproverUserId = null;
                instance.Status = ApprovalStatus.PendingAssignment;
                form.ApprovalStatus = ApprovalStatus.PendingAssignment;
            }

            return true;
        }

        private static bool MigrateLegacyTnaStepNumbers(
            FormWorkflowInstance instance,
            List<FormSignature> stamps,
            FormWorkflowDefinition definition)
        {
            if (!TnaFormTypes.Contains(instance.FormType, StringComparer.OrdinalIgnoreCase)
                || instance.Steps.Any(s => s.PendingStatus == ApprovalStatus.PendingTeamLeaderReview))
                return false;

            var legacyManager = instance.Steps.FirstOrDefault(
                s => s.StepNo == 3 && s.PendingStatus == ApprovalStatus.PendingManagerApproval);
            if (legacyManager is null) return false;

            var managerWasCompleted = legacyManager.State == WorkflowStepState.Completed;
            foreach (var step in instance.Steps
                .Where(s => s.StepNo >= 3)
                .OrderByDescending(s => s.StepNo))
            {
                step.StepNo++;
            }

            foreach (var stamp in stamps.Where(s => s.StepNo >= 3))
                stamp.StepNo++;

            var confirmation = definition.Steps.First(s =>
                s.Status == ApprovalStatus.PendingTeamLeaderReview);
            instance.Steps.Add(new FormWorkflowStep
            {
                Id = Guid.NewGuid(),
                FormWorkflowInstanceId = instance.Id,
                StepNo = confirmation.StepNo,
                Title = confirmation.Title,
                PendingStatus = confirmation.Status,
                Kind = confirmation.Kind,
                SignatureBlock = confirmation.Signature,
                EligibleRolesCsv = string.Join(",", confirmation.EligibleRoles),
                AssignerRolesCsv = string.Join(",", confirmation.AssignerRoles),
                RequiresManualAssignment = confirmation.RequiresManualAssignment,
                RestrictToOriginatorShop = confirmation.RestrictToOriginatorShop,
                AllowsDelegation = confirmation.AllowsDelegation,
                RequiresComments = confirmation.RequiresComments,
                SkipMode = confirmation.Skip,
                State = managerWasCompleted
                    ? WorkflowStepState.Skipped
                    : WorkflowStepState.NotStarted,
                IsSkipped = managerWasCompleted,
                SkippedAutomatically = managerWasCompleted,
                SkipReason = managerWasCompleted
                    ? "Inserted for historical compatibility after Manager approval."
                    : string.Empty,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
            });

            if (instance.CurrentStepNo >= confirmation.StepNo)
                instance.CurrentStepNo++;

            return true;
        }

        // ---------------------------------------------------------------------------------
        // (B) MANAGER SIGNATURE-BLOCK REMAP  (ReviewedBy -> ApprovedBy)
        // ---------------------------------------------------------------------------------

        private static bool RemapManagerSignatureBlock(
            FormWorkflowInstance instance,
            List<FormSignature> stamps)
        {
            if (!TnaFormTypes.Contains(instance.FormType, StringComparer.OrdinalIgnoreCase))
                return false;

            // The catalog is the printed-matrix authority: find the Manager approval step
            // (PendingManagerApproval) and confirm it now freezes ApprovedBy.
            var managerDef = FormWorkflowCatalog.ApprovalStepsFor(instance.FormType)
                .FirstOrDefault(s => s.Status == ApprovalStatus.PendingManagerApproval);
            if (managerDef is null || managerDef.Signature != SignatureBlockType.ApprovedBy)
                return false;

            var managerStep = instance.Steps.FirstOrDefault(s => s.StepNo == managerDef.StepNo);
            if (managerStep is null) return false;

            var changed = false;

            if (managerStep.SignatureBlock == SignatureBlockType.ReviewedBy)
            {
                managerStep.SignatureBlock = SignatureBlockType.ApprovedBy;
                changed = true;
            }

            // The frozen stamp carries the same wrong label - re-label it so the printed
            // "Approved by:" line finds the Manager's historical name / date / signature.
            foreach (var stamp in stamps)
            {
                if (stamp.StepNo == managerDef.StepNo
                    && stamp.Block == SignatureBlockType.ReviewedBy)
                {
                    stamp.Block = SignatureBlockType.ApprovedBy;
                    stamp.BlockCaption =
                        FormWorkflowCatalog.SignatureCaption(SignatureBlockType.ApprovedBy);
                    changed = true;
                }
            }

            return changed;
        }

        // ---------------------------------------------------------------------------------
        // (A) STUCK PENDINGASSIGNMENT ADVANCE
        // ---------------------------------------------------------------------------------

        private async Task<bool> AdvanceStuckAssignmentAsync(
            FormWorkflowInstance instance,
            Dictionary<Guid, FormSubmission> forms)
        {
            if (instance.Status != ApprovalStatus.PendingAssignment) return false;

            var definition = FormWorkflowCatalog.Get(instance.FormType);
            if (definition is null) return false;

            // Only repair when the parked step is itself an auto-skippable conditional step
            // AND the form fields prove it should have been skipped. A genuinely assigned
            // Engineer hand-over (assignToEngineer = true) is left untouched.
            var parked = instance.Steps.FirstOrDefault(s => s.StepNo == instance.CurrentStepNo);
            if (parked is null) return false;
            if (parked.State != WorkflowStepState.AwaitingAssignment
                && parked.State != WorkflowStepState.Active)
                return false;

            forms.TryGetValue(instance.FormSubmissionId ?? Guid.Empty, out var form);
            var fields = FlattenFormFields(form?.FormDataJson);

            var parkedDef = FormWorkflowCatalog.StepAt(instance.FormType, instance.CurrentStepNo);
            if (parkedDef is null || !FormWorkflowCatalog.ShouldAutoSkip(parkedDef, fields))
                return false;

            var changed = false;
            WorkflowStepDefinition? target = null;

            // Walk forward from the parked step, freezing every auto-skippable step, and
            // park on the first genuinely actionable one - exactly like the live engine.
            foreach (var def in FormWorkflowCatalog.ApprovalStepsFor(instance.FormType))
            {
                if (def.StepNo < instance.CurrentStepNo) continue;

                if (FormWorkflowCatalog.ShouldAutoSkip(def, fields))
                {
                    var step = instance.Steps.FirstOrDefault(s => s.StepNo == def.StepNo);
                    if (step is not null && step.State != WorkflowStepState.Completed)
                    {
                        step.State = WorkflowStepState.Skipped;
                        step.ActionTaken = WorkflowStepAction.Skipped;
                        step.IsSkipped = true;
                        step.SkippedAutomatically = true;
                        step.SkipReason = string.IsNullOrWhiteSpace(def.SkipReasonTemplate)
                            ? "Auto-skipped from the form fields."
                            : def.SkipReasonTemplate!;
                        step.AssignedToUserId = null;
                        step.AssignedToName = string.Empty;
                        step.AssignedToRole = string.Empty;
                        step.ActedAt ??= DateTime.UtcNow;
                        changed = true;
                    }
                    continue;
                }

                target = def;
                break;
            }

            if (target is null)
            {
                // Every remaining step auto-skips: the chain closes as Approved.
                // Mirror FinaliseAsync: the chain closes and the upload lock applies,
                // exactly like the live engine does when every step auto-skips.
                instance.Status = ApprovalStatus.Approved;
                instance.CurrentStepNo = 0;
                instance.CurrentAssigneeUserId = null;
                instance.CurrentAssignmentUnit = null;
                instance.IsComplete = true;
                instance.IsLocked = true;
                instance.CompletedAt ??= DateTime.UtcNow;
                changed = true;

                if (form is not null && form.ApprovalStatus != ApprovalStatus.Approved)
                {
                    form.ApprovalStatus = ApprovalStatus.Approved;
                    form.CurrentApproverUserId = null;
                    form.DelegatedToUserId = null;
                    if (form.SubmittedByUserId.HasValue)
                    {
                        form.ApprovedByUserId = form.SubmittedByUserId;
                        form.ApprovedDate ??= DateTime.UtcNow;
                    }
                    form.UploadLock = UploadLockState.LockedByCompletion;
                    form.UploadLockedAt ??= DateTime.UtcNow;
                    form.UpdatedAt = DateTime.UtcNow;
                    form.UpdatedBy = "legacy-self-heal";
                }

                return changed;
            }

            var targetStep = instance.Steps.FirstOrDefault(s => s.StepNo == target.StepNo);
            if (targetStep is not null && targetStep.State == WorkflowStepState.NotStarted)
                targetStep.State = WorkflowStepState.Active;

            // Park exactly like the live engine: resolve the responsible approver for the
            // target step so the "Pending my action" inbox shows the record for the right
            // person; fall back to PendingAssignment when no user holds the role.
            var parkedStatus = target.Status;
            long? approverId = null;

            if (!target.RequiresManualAssignment)
            {
                var approver = await ResolveApproverAsync(
                    form, target.EligibleRoles,
                    form?.SubmittedByUserId ?? instance.OriginatorUserId);
                if (approver is not null)
                {
                    approverId = approver.Id;
                    if (targetStep is not null)
                    {
                        targetStep.AssignedToUserId = approver.Id;
                        targetStep.AssignedToName = approver.FullName;
                        targetStep.AssignedToRole =
                            RoleHierarchy.Normalize(approver.Role) ?? approver.Role;
                        targetStep.AssignedAt ??= DateTime.UtcNow;
                    }
                }
                else
                {
                    parkedStatus = ApprovalStatus.PendingAssignment;
                }
            }
            else
            {
                parkedStatus = ApprovalStatus.PendingAssignment;
            }

            if (instance.CurrentStepNo != target.StepNo || instance.Status != parkedStatus)
            {
                instance.CurrentStepNo = target.StepNo;
                instance.Status = parkedStatus;
                instance.CurrentAssigneeUserId = approverId;
                instance.CurrentAssignmentUnit =
                    parkedStatus == ApprovalStatus.PendingAssignment ? target.AssignmentUnit : null;
                changed = true;
            }

            // Synchronise the decorated submission so the badge and the inbox agree with
            // the instance for EVERY viewer.
            if (form is not null
                && (form.ApprovalStatus != parkedStatus || form.CurrentApproverUserId != approverId))
            {
                form.ApprovalStatus = parkedStatus;
                form.CurrentApproverUserId = approverId;
                form.UpdatedAt = DateTime.UtcNow;
                form.UpdatedBy = "legacy-self-heal";
                changed = true;
            }

            return changed;
        }

        // ---------------------------------------------------------------------------------
        // (C) ORIGINATOR BACKFILL
        // ---------------------------------------------------------------------------------

        private static bool BackfillOriginator(
            FormWorkflowInstance instance,
            Dictionary<Guid, FormSubmission> forms,
            Dictionary<long, User> users)
        {
            if (!string.IsNullOrWhiteSpace(instance.OriginatorName)) return false;
            if (!instance.FormSubmissionId.HasValue) return false;
            if (!forms.TryGetValue(instance.FormSubmissionId.Value, out var form)) return false;
            if (!form.SubmittedByUserId.HasValue) return false;

            instance.OriginatorUserId = form.SubmittedByUserId.Value;

            if (users.TryGetValue(form.SubmittedByUserId.Value, out var originator))
            {
                if (string.IsNullOrWhiteSpace(instance.OriginatorName))
                    instance.OriginatorName = originator.FullName;
                if (string.IsNullOrWhiteSpace(instance.OriginatorRole))
                    instance.OriginatorRole =
                        RoleHierarchy.Normalize(originator.Role) ?? originator.Role;
                instance.OriginatorShopId ??= originator.ShopId;
            }

            instance.SubmittedAt ??= form.SubmittedDate ?? form.CreatedAt;
            return true;
        }

        // ---------------------------------------------------------------------------------
        // APPROVER RESOLUTION - mirrors FormSubmissionCommandHandler.ResolveApproverAsync
        // so the repaired record lands in the same inbox the live engine would use.
        // ---------------------------------------------------------------------------------

        private async Task<User?> ResolveApproverAsync(
            FormSubmission? form, string[] canonicalRoles, long originatorUserId)
        {
            if (canonicalRoles is null || canonicalRoles.Length == 0) return null;

            var variants = RoleHierarchy.PersistedVariants(canonicalRoles);
            if (variants.Length == 0) return null;

            var candidates = await _context.Users
                .AsNoTracking()
                .Where(u => u.IsActive
                         && u.RecordStatus != RecordStatus.Deleted
                         && u.Id != originatorUserId
                         && variants.Contains(u.Role))
                .Take(200)
                .ToListAsync();

            if (candidates.Count == 0) return null;

            return candidates
                .OrderBy(u => form?.ShopId.HasValue == true && u.ShopId == form.ShopId ? 0 : 1)
                .ThenBy(u => RoleHierarchy.RankOf(u.Role))
                .ThenBy(u => u.Id)
                .FirstOrDefault();
        }

        // ---------------------------------------------------------------------------------
        // HELPERS
        // ---------------------------------------------------------------------------------

        /// <summary>
        /// camelCase key -> raw string, mirroring the engine's flattening. A malformed or
        /// empty payload yields an empty map, which means "no skip evidence" - conditional
        /// steps stay active rather than vanish.
        /// </summary>
        private static IReadOnlyDictionary<string, string?> FlattenFormFields(string? formDataJson)
        {
            var map = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
            if (string.IsNullOrWhiteSpace(formDataJson)) return map;
            try
            {
                using var doc = JsonDocument.Parse(formDataJson);
                if (doc.RootElement.ValueKind != JsonValueKind.Object) return map;
                foreach (var prop in doc.RootElement.EnumerateObject())
                {
                    map[prop.Name] = prop.Value.ValueKind switch
                    {
                        JsonValueKind.String => prop.Value.GetString(),
                        JsonValueKind.True => "true",
                        JsonValueKind.False => "false",
                        JsonValueKind.Null => null,
                        _ => prop.Value.ToString()
                    };
                }
            }
            catch (JsonException) { /* not JSON: treat as no fields */ }
            return map;
        }
    }
}