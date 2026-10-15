using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Contracts.Workflow;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;
using CMT.Domain.Models.Workflow;

namespace CMT.Application.SelfEvaluation.Services
{
    // =====================================================================================
    // AMENDED v2 - WorkflowInstanceQueryService.cs
    // Copy to: CMT.Application.SelfEvaluation/Services/WorkflowInstanceQueryService.cs
    //
    // WHAT v2 CHANGES AGAINST v1
    // --------------------------
    //   (a) NULLABLE FIX: the v1 line "FormSubmission submission = null;" produced
    //       CS8600 because the project builds with Nullable reference types enabled.
    //       It is now "FormSubmission? submission = null;".
    //   (b) DI REQUIREMENT DOCUMENTED: this service MUST be registered in Program.cs
    //       (AddScoped of WorkflowInstanceQueryService) otherwise
    //       WorkflowFormsController cannot be activated and BOTH read routes return
    //       500 - which silently re-enabled the legacy fallback fields and produced
    //       the reported "previous approver disappears" defect.
    //   (c) Everything else is behaviour-identical to v1: the full materialised chain
    //       (EVERY step, StepNo order) + every live frozen signature line are returned.
    //
    // WHY THIS FILE FIXES THE REPORTED DEFECT
    // ---------------------------------------
    // "Previous approvers' names, dates, and signatures disappear after advancing
    //  stages."
    //
    // The write path was never the problem: every approval is frozen into its own
    // FormWorkflowStep row (ActedByName / ActedAt / SignatureHash) and its own
    // append-only FormSignature line by UserSignatureService.StampAsync. Nothing is
    // overwritten there.
    //
    // The READ path was the problem: the frontend resolves the signature block from
    // GET /api/workflow/forms/{instanceId} (useFormWorkflowInstance, getWorkflowForm),
    // but the service was never registered in DI, so the controller 500-ed, the
    // four-step resolution chain produced instance = null, and the printed block fell
    // back to the LEGACY scalar fields of FormSubmission (ReviewedByUserId /
    // ReviewedDate / ApprovedByUserId / ApprovedDate) which ARE overwritten on every
    // approval. That is exactly the reported symptom.
    //
    // This service is the missing read path. It maps the FULL materialised chain -
    // EVERY step, including all completed historical ones - plus every live frozen
    // signature line into the WorkflowInstanceResponse contract the frontend mirror
    // (CMT.Frontend/src/lib/workflow/workflow-types.ts) already consumes.
    //
    // HARD RULES
    //   (1) ALL historical steps are returned, in StepNo order. The frontend projection
    //       (signature-blocks.ts, buildSignatureRows) renders one printed line per step
    //       whose signatureBlock is not None; a step omitted here can never be printed,
    //       so completeness of this list IS the fix.
    //   (2) EVERY frozen signature line is RETURNED, including legacy lines that still
    //       carry an old "Superseded by step N ..." remark. Hiding them is exactly what
    //       erased a previous approver's name / date / signature from the printed block
    //       (approval-history fix). Each executed step matches its own line by
    //       (block, stepNo) in the frontend projection (signature-blocks.ts,
    //       frozenStampFor), so returning all lines never double-prints a caption.
    //   (3) User ids stay long, entity ids stay Guid - the two binding rules of v4/v9.
    //   (4) The capability flags (CanIAct / CanIAssign / CanIDelegate / CanISkip) are
    //       computed FOR THE CALLING USER, so the frontend resolvers prefer the server
    //       flag.
    // =====================================================================================

    public sealed class WorkflowInstanceQueryService
    {
        private readonly ApplicationDbContext _context;

        public WorkflowInstanceQueryService(ApplicationDbContext context)
        {
            _context = context;
        }

        // STEP 1 / STEP 4 of the frontend resolution chain: lookup by instance id.
        public Task<WorkflowInstanceResponse?> GetByInstanceIdAsync(
            Guid instanceId, User actor, CancellationToken cancellationToken = default)
            => LoadAsync(i => i.Id == instanceId, actor, cancellationToken);

        // STEP 2 of the frontend resolution chain: lookup by FormSubmission id.
        public Task<WorkflowInstanceResponse?> GetByFormSubmissionIdAsync(
            Guid formSubmissionId, User actor, CancellationToken cancellationToken = default)
            => LoadAsync(i => i.FormSubmissionId == formSubmissionId, actor, cancellationToken);

        // =================================================================================
        // THE QUERY
        // =================================================================================

        private async Task<WorkflowInstanceResponse?> LoadAsync(
            Expression<Func<FormWorkflowInstance, bool>> predicate,
            User actor,
            CancellationToken cancellationToken)
        {
            var instance = await _context.WorkflowInstances
                .AsNoTracking()
                .Include(i => i.Steps)
                .OrderByDescending(i => i.UpdatedAt)
                .FirstOrDefaultAsync(predicate, cancellationToken);

            if (instance is null) return null;

            return await MapAsync(instance, actor, cancellationToken);
        }

        private async Task<WorkflowInstanceResponse> MapAsync(
            FormWorkflowInstance instance, User actor, CancellationToken cancellationToken)
        {
            // Every frozen signature line of this instance - ALL of them, including the
            // lines of earlier completed stages (approval-history fix).
            var signatures = await _context.FormSignatures
                .AsNoTracking()
                .Where(s => s.FormWorkflowInstanceId == instance.Id)
                .OrderBy(s => s.StepNo)
                .ThenBy(s => s.SignedAt)
                .ToListAsync(cancellationToken);

            // AMENDED (approval-history fix): EVERY frozen line is returned. Legacy data
            // may still carry "Superseded by step N" remarks written by the old cross-step
            // supersede logic; hiding those lines is exactly what erased a previous
            // approver from the printed block. Each executed step matches its own line by
            // (block, stepNo) in the frontend projection (signature-blocks.ts,
            // frozenStampFor), so returning all lines never double-prints a caption.
            var liveSignatures = signatures;

            // The decorated FormSubmission (FormDataJson for the form body).
            FormSubmission? submission = null;
            if (instance.FormSubmissionId.HasValue)
            {
                submission = await _context.FormSubmissions
                    .AsNoTracking()
                    .FirstOrDefaultAsync(
                        f => f.Id == instance.FormSubmissionId.Value, cancellationToken);
            }

            // Display name of the current assignee.
            string currentAssigneeName = string.Empty;
            if (instance.CurrentAssigneeUserId.HasValue)
            {
                currentAssigneeName = await _context.Users
                    .AsNoTracking()
                    .Where(u => u.Id == instance.CurrentAssigneeUserId.Value)
                    .Select(u => u.FullName)
                    .FirstOrDefaultAsync(cancellationToken) ?? string.Empty;
            }

            var definition = FormWorkflowCatalog.Get(instance.FormType);
            var canonicalActor = RoleHierarchy.Normalize(actor.Role);
            var isAdmin = canonicalActor == OrgRoles.Admin;

            // THE FIX: every step, every history, in printed order.
            var steps = instance.Steps
                .OrderBy(s => s.StepNo)
                .Select(s => MapStep(s, actor, canonicalActor, isAdmin))
                .ToList();

            var totalSteps = steps.Count;
            var completedSteps = instance.Steps.Count(s => s.State == WorkflowStepState.Completed);

            return new WorkflowInstanceResponse
            {
                Id = instance.Id,
                FormSubmissionId = instance.FormSubmissionId,
                EvaluationFolderId = instance.EvaluationFolderId,
                ATARecordId = instance.ATARecordId,
                ShopId = instance.ShopId,

                FormType = instance.FormType,
                FormNo = instance.FormNo,
                Title = instance.Title,
                Section = instance.Section,
                SectionTitle = definition?.Section ?? instance.Section,

                Status = instance.Status,
                StatusLabel = ApprovalStatusInfo.Label(instance.Status),
                LifecycleState = ApprovalStatusInfo.StateOf(instance.Status),

                CurrentStepNo = instance.CurrentStepNo,
                CurrentAssigneeUserId = instance.CurrentAssigneeUserId,
                CurrentAssigneeName = currentAssigneeName,
                CurrentAssignmentUnit = instance.CurrentAssignmentUnit,

                OriginatorUserId = instance.OriginatorUserId,
                OriginatorName = instance.OriginatorName,
                OriginatorRole = instance.OriginatorRole,

                SubmittedAt = instance.SubmittedAt,
                CompletedAt = instance.CompletedAt,
                ExpiresAt = instance.ExpiresAt,

                IsComplete = instance.IsComplete,
                IsLocked = instance.IsLocked,

                IsOptionalByRegulatoryDate = definition?.IsOptionalByRegulatoryDate
                                             ?? instance.RegulatoryTargetDate.HasValue,
                RegulatoryTargetDate = instance.RegulatoryTargetDate,
                MaySkipNow = instance.RegulatoryTargetDate.HasValue
                             ? instance.RegulatoryTargetDate.Value.CompareTo(DateTime.UtcNow) > 0
                             : false,
                JointApprovalEnabled = instance.JointApprovalEnabled,
                JointApprovalCompanionInstanceId = instance.JointApprovalCompanionInstanceId,

                RevisionNumber = instance.RevisionNumber,

                TotalSteps = totalSteps,
                CompletedSteps = completedSteps,
                ProgressPercent = totalSteps > 0
                    ? (int)Math.Round(completedSteps * 100d / totalSteps)
                    : 0,

                FormDataJson = submission?.FormDataJson ?? "{}",

                Steps = steps,
                Signatures = liveSignatures.Select(MapSignature).ToList()
            };
        }

        // =================================================================================
        // MAPPERS
        // =================================================================================

        private static WorkflowStepResponse MapStep(
            FormWorkflowStep step, User actor, string? canonicalActor, bool isAdmin)
        {
            var eligible = SplitCsv(step.EligibleRolesCsv);
            var assigners = SplitCsv(step.AssignerRolesCsv);

            var pending = step.State == WorkflowStepState.Active
                       || step.State == WorkflowStepState.AwaitingAssignment;

            var eligibleActor = canonicalActor is not null
                                ? eligible.Contains(canonicalActor, StringComparer.OrdinalIgnoreCase)
                                : false;
            var assignerActor = canonicalActor is not null
                                ? assigners.Contains(canonicalActor, StringComparer.OrdinalIgnoreCase)
                                : false;
            var assignedToActor = step.AssignedToUserId == actor.Id;

            var skippable = step.SkipMode == SkipMode.Manual
                         || step.SkipMode == SkipMode.ManualOrAuto
                         || step.SkipMode == SkipMode.RegulatoryDate;

            return new WorkflowStepResponse
            {
                Id = step.Id,
                StepNo = step.StepNo,
                Title = step.Title,

                Kind = step.Kind,
                KindLabel = step.Kind.ToString(),

                State = step.State,
                StateLabel = step.State.ToString(),

                PendingStatus = step.PendingStatus,
                PendingStatusLabel = ApprovalStatusInfo.Label(step.PendingStatus),

                ActionTaken = step.ActionTaken,

                SignatureBlock = step.SignatureBlock,
                SignatureCaption = FormWorkflowCatalog.SignatureCaption(step.SignatureBlock),

                EligibleRoles = eligible,
                EligibleRoleLabels = eligible
                    .Select(r => RoleHierarchy.Label(r) ?? r)
                    .ToList(),

                RequiresManualAssignment = step.RequiresManualAssignment,
                AssignerRoles = assigners,
                AssignmentUnit = step.AssignmentUnit,

                RestrictToOriginatorShop = step.RestrictToOriginatorShop,
                AllowsDelegation = step.AllowsDelegation,
                RequiresComments = step.RequiresComments,
                IsStepByStepChecklist = step.IsStepByStepChecklist,

                SkipMode = step.SkipMode,
                SkipConditionField = step.SkipConditionField,
                IsSkipped = step.IsSkipped,
                SkippedAutomatically = step.SkippedAutomatically,
                SkipReason = step.SkipReason,

                AssignedToUserId = step.AssignedToUserId,
                AssignedToName = step.AssignedToName,
                AssignedToRole = step.AssignedToRole,
                AssignedAt = step.AssignedAt,

                // THE HISTORY: who actually executed THIS step. Never overwritten -
                // each step keeps its own actor, which is what keeps every previous
                // approver visible after the chain advances.
                ActedByUserId = step.ActedByUserId,
                ActedByName = step.ActedByName,
                ActedByRole = step.ActedByRole,
                ActedAt = step.ActedAt,

                Comments = step.Comments,

                WasDelegated = step.WasDelegated,
                DelegationReason = step.DelegationReason,

                ChecklistTotalItems = step.ChecklistTotalItems,
                ChecklistVerifiedItems = step.ChecklistVerifiedItems,

                // AMENDED (role-based action visibility): a Draft-kind step is executed by
                // SUBMIT, never by approve, and it belongs to the originator alone. The
                // server answers canIAct / canIDelegate / canISkip = false for it, so
                // Approve / Reject / Request Revision / Delegate can never render at draft
                // stage for any holder of the preparing role. Draft ownership is resolved
                // client-side from OriginatorUserId (useFormEditAuthority).
                CanIAct = pending
                    ? (step.Kind == WorkflowStepKind.Draft
                        ? false
                        : isAdmin || assignedToActor || eligibleActor)
                    : false,
                CanIAssign = pending
                    ? (isAdmin || (step.RequiresManualAssignment ? assignerActor : false))
                    : false,
                // AMENDED v16 (MNT-1229B): the Delegate flag mirrors the SAME role gate as
                // CanIAct (assigned OR eligible OR admin), narrowed by "this step allows
                // delegation". The backend LoadPendingFormAsync authorises any holder of the
                // currently responsible role, not only the auto-selected assignee, so a
                // second Manager must see the Delegate button too. The strictly-lower-tier
                // rule is enforced server-side when the delegate target is chosen.
                CanIDelegate = pending
                    ? (step.Kind == WorkflowStepKind.Draft
                        ? false
                        : isAdmin || (step.AllowsDelegation ? (assignedToActor || eligibleActor) : false))
                    : false,
                CanISkip = pending
                    ? (step.Kind == WorkflowStepKind.Draft
                        ? false
                        : isAdmin || (skippable ? (eligibleActor || assignerActor) : false))
                    : false
            };
        }

        private static FormSignatureResponse MapSignature(FormSignature s) => new()
        {
            Block = s.Block,
            Caption = s.BlockCaption,
            StepNo = s.StepNo,
            UserId = s.UserId,
            PersonName = s.PersonName,
            PersonRole = s.PersonRole,
            PersonRoleLabel = s.PersonRoleLabel,
            SignedAt = s.SignedAt,
            SignatureHash = s.SignatureHash
        };

        private static List<string> SplitCsv(string csv)
        {
            if (string.IsNullOrWhiteSpace(csv)) return new List<string>();
            return csv.Split(',',
                    StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .ToList();
        }
    }
}
