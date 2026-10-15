using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading;
using System.Threading.Tasks;
using MediatR;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Commands.SelfEvaluation;
using CMT.Application.SelfEvaluation.Contracts.Signature;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;
using CMT.Domain.Models.Workflow;

namespace CMT.Application.SelfEvaluation.CommandHandlers.SelfEvaluation
{
    // AMENDED v13: catalog-driven approval workflow. The hard-coded TeamLeader ->
    // Manager -> Director -> QA chain is gone; transitions come from
    // FormWorkflowCatalog with a RoleHierarchy fallback for non-catalogued types.
    // Submit materialises a FormWorkflowInstance with frozen steps; approve/reject/
    // return require the current assigned approver, the active delegate or Admin
    // break-glass, and refuse with structured AuthorizationDeniedException codes.
    // A missing approver parks the form in PendingAssignment - it is NEVER
    // auto-finalised. Signature-bearing steps are frozen via StampAsync, and final
    // sign-off locks uploads (UploadLock = LockedByCompletion) and writes
    // ApprovalSignatureHash.
    //
    // AMENDED v14 (THIS VERSION): "previous approver disappears" defence-in-depth.
    // The authoritative per-stage history is the FROZEN FormWorkflowStep +
    // FormSignature rows (returned by WorkflowInstanceQueryService via
    // GET /api/workflow/forms/...). The legacy scalar fields ReviewedByUserId /
    // ReviewedDate on FormSubmission are only a FALLBACK for the printed signature
    // block when no instance can be resolved. v13 overwrote them on EVERY approval,
    // so the fallback view always showed only the LAST approver. v14 makes them
    // FIRST-WRITER-WINS: the first reviewer's stamp is kept, and the fields can
    // never erase an earlier approver even if the read path breaks again.
    // ApprovedByUserId / ApprovedDate are set only once, at final sign-off, in
    // FinaliseAsync - they are not overwritten between stages and stay unchanged.
    public class FormSubmissionCommandHandler :
        IRequestHandler<CreateFormSubmissionCommand, Guid>,
        IRequestHandler<UpdateFormSubmissionCommand, bool>,
        IRequestHandler<DeleteFormSubmissionCommand, bool>,
        IRequestHandler<SubmitFormForApprovalCommand, bool>,
        IRequestHandler<ApproveFormSubmissionCommand, bool>,
        IRequestHandler<RejectFormSubmissionCommand, bool>,
        IRequestHandler<DelegateFormSubmissionCommand, bool>,
        IRequestHandler<ReturnFormForRevisionCommand, bool>,
        IRequestHandler<AssignFormSubmissionCommand, bool>,
        IRequestHandler<IncludeApprovedTrainingFormCommand, Guid>
    {
        private readonly ApplicationDbContext _context;
        private readonly IUserSignatureService _signatures;

        private static string[] SplitCsv(string? value) =>
            (value ?? string.Empty)
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        private static bool IsStlTrainingForm(string? formType) =>
            string.Equals(formType, FormNodeTypes.TrainingVerificationInspection, StringComparison.OrdinalIgnoreCase)
            || string.Equals(formType, FormNodeTypes.TrainingVerificationTechnician, StringComparison.OrdinalIgnoreCase)
            || string.Equals(formType, FormNodeTypes.InspectorProficiency, StringComparison.OrdinalIgnoreCase)
            || string.Equals(formType, FormNodeTypes.CompetencyAssessment, StringComparison.OrdinalIgnoreCase);

        private static bool IsSaveToSubmitTrainingForm(string? formType) =>
            string.Equals(formType, FormNodeTypes.TrainingVerificationInspection, StringComparison.OrdinalIgnoreCase)
            || string.Equals(formType, FormNodeTypes.TrainingVerificationTechnician, StringComparison.OrdinalIgnoreCase)
            || string.Equals(formType, FormNodeTypes.CompetencyAssessment, StringComparison.OrdinalIgnoreCase);

        private static bool IsSpecialAdminTrainingForm(string? formType) =>
            IsSaveToSubmitTrainingForm(formType);

        private static bool IsTrainingVerificationForm(string? formType) =>
            string.Equals(formType, FormNodeTypes.TrainingVerificationInspection, StringComparison.OrdinalIgnoreCase)
            || string.Equals(formType, FormNodeTypes.TrainingVerificationTechnician, StringComparison.OrdinalIgnoreCase);

        private static void CaptureTrainingSignature(
            FormSubmission form,
            string nameField,
            string dateField,
            string signatureIdField,
            string signatureHashField,
            User signer,
            SignatureStampResult stamp)
        {
            var data = JsonNode.Parse(form.FormDataJson) as JsonObject ?? new JsonObject();
            data[nameField] = signer.FullName;
            data[dateField] = stamp.SignedAtUtc.ToString("O");
            data[signatureIdField] = stamp.UserSignatureId?.ToString() ?? string.Empty;
            data[signatureHashField] = stamp.SignatureHash;
            form.FormDataJson = data.ToJsonString();
        }

        private static bool IsAssignedEmployee(FormSubmission form, long userId)
        {
            if (string.IsNullOrWhiteSpace(form.FormDataJson)) return false;
            try
            {
                using var document = JsonDocument.Parse(form.FormDataJson);
                if (!document.RootElement.TryGetProperty("assignedEmployeeId", out var value)) return false;
                return long.TryParse(value.GetString(), out var assignedId) && assignedId == userId;
            }
            catch (JsonException)
            {
                return false;
            }
        }

        private static long? AssignedEmployeeUserId(FormSubmission form)
        {
            if (string.IsNullOrWhiteSpace(form.FormDataJson)) return null;
            try
            {
                using var document = JsonDocument.Parse(form.FormDataJson);
                return document.RootElement.TryGetProperty("assignedEmployeeId", out var value)
                    && long.TryParse(value.GetString(), out var assignedId)
                    ? assignedId
                    : null;
            }
            catch (JsonException)
            {
                return null;
            }
        }

        private static bool IsEmployeeCorrection(FormSubmission form, User actor)
        {
            return IsStlTrainingForm(form.FormType) && IsAssignedEmployee(form, actor.Id);
        }

        private static bool IsBypassedTaskForm(string? formType) =>
            string.Equals(formType, FormNodeTypes.SimilarTask, StringComparison.OrdinalIgnoreCase)
            || string.Equals(formType, FormNodeTypes.SimpleTask, StringComparison.OrdinalIgnoreCase);

        private static bool IsTrainingRequired(string? formDataJson)
        {
            if (string.IsNullOrWhiteSpace(formDataJson)) return true;
            try
            {
                using var document = JsonDocument.Parse(formDataJson);
                return !document.RootElement.TryGetProperty("trainingRequired", out var value)
                    || value.ValueKind != JsonValueKind.False;
            }
            catch (JsonException)
            {
                return true;
            }
        }

        public FormSubmissionCommandHandler(
            ApplicationDbContext context,
            IUserSignatureService signatures)
        {
            _context = context;
            _signatures = signatures;
        }

        public async Task<Guid> Handle(CreateFormSubmissionCommand request, CancellationToken cancellationToken)
        {
            var actor = await RequireActorAsync(request.ActorUserId, cancellationToken);

            var ata = await _context.ATARecords
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == request.ATARecordId && r.IsActive, cancellationToken)
                ?? throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.FormNotFound, "The selected ATA record does not exist or is inactive.");

            if (IsStlTrainingForm(request.FormType)
                && (RoleHierarchy.Normalize(actor.Role) != OrgRoles.TeamLeader
                    || actor.ShopId != ata.ShopId))
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.NotCurrentApprover,
                    "Only the Shop Team Leader assigned to this ATA's shop may create this training form.");

            var form = new FormSubmission
            {
                Id = Guid.NewGuid(),
                ATARecordId = request.ATARecordId,
                ShopId = ata.ShopId,
                FormType = request.FormType,
                FormNo = string.IsNullOrWhiteSpace(request.FormNo)
                    ? FormWorkflowCatalog.FormNoOf(request.FormType)
                    : request.FormNo,
                RevNo = request.RevNo,
                RevDate = request.RevDate,
                FormDataJson = request.FormDataJson,
                ApprovalStatus = IsBypassedTaskForm(request.FormType)
                    && !IsTrainingRequired(request.FormDataJson)
                    ? ApprovalStatus.Skipped
                    : ApprovalStatus.Draft,
                UploadLock = UploadLockState.Open,
                RevisionNumber = 1,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = actor.FullName,
                UpdatedBy = actor.FullName
            };

            _context.FormSubmissions.Add(form);
            _context.WorkflowAuditLogs.Add(NewAudit(
                "Form Created: " + request.FormType, WorkflowAction.Created,
                form.Id, actor.Username, actor.Role,
                "Form type: " + request.FormType + ", Form No: " + form.FormNo));

            await _context.SaveChangesAsync(cancellationToken);
            return form.Id;
        }

        public async Task<bool> Handle(UpdateFormSubmissionCommand request, CancellationToken cancellationToken)
        {
            var form = await _context.FormSubmissions.FindAsync(new object[] { request.Id }, cancellationToken);
            if (form == null || !form.IsActive) return false;

            var actor = await RequireActorAsync(request.ActorUserId, cancellationToken);
            var canEditSkipped = form.ApprovalStatus == ApprovalStatus.Skipped
                && IsBypassedTaskForm(form.FormType)
                && (string.Equals(form.CreatedBy, actor.FullName, StringComparison.OrdinalIgnoreCase)
                    || string.Equals(form.CreatedBy, actor.Username, StringComparison.OrdinalIgnoreCase)
                    || FormWorkflowCatalog.CanDraft(actor.Role, form.FormType))
                && IsTrainingRequired(request.FormDataJson);
            var canEditRejected = form.ApprovalStatus == ApprovalStatus.Rejected
                && (form.SubmittedByUserId == actor.Id
                    || IsEmployeeCorrection(form, actor)
                    || string.Equals(form.CreatedBy, actor.FullName, StringComparison.OrdinalIgnoreCase)
                    || FormWorkflowCatalog.CanDraft(actor.Role, form.FormType));
            var canEditPendingAssignment = false;
            if (form.ApprovalStatus == ApprovalStatus.PendingAssignment)
            {
                var instance = await _context.WorkflowInstances
                    .Include(i => i.Steps)
                    .FirstOrDefaultAsync(i => i.FormSubmissionId == form.Id, cancellationToken);
                var step = instance?.Steps.FirstOrDefault(s => s.StepNo == instance.CurrentStepNo);
                canEditPendingAssignment = instance is not null
                    && step is not null
                    && step.RequiresManualAssignment
                    && (form.SubmittedByUserId == actor.Id
                        || FormWorkflowCatalog.CanAssignStep(actor.Role, form.FormType, step.StepNo));
            }

            var canUpdateSubmittedTna = form.FormType.Equals(FormNodeTypes.TNA, StringComparison.OrdinalIgnoreCase)
                && form.ApprovalStatus == ApprovalStatus.PendingTeamLeaderReview
                && form.SubmittedByUserId == request.ActorUserId;
            var canEditSpecialAdminTraining = IsSpecialAdminTrainingForm(form.FormType)
                && form.ApprovalStatus == ApprovalStatus.PendingSpecialTeamLeaderApproval
                && RoleHierarchy.Normalize(actor.Role) == OrgRoles.SpecialAdmin;
            if (form.ApprovalStatus != ApprovalStatus.Draft
                && form.ApprovalStatus != ApprovalStatus.Returned
                && !canEditRejected
                && !canEditSkipped
                && !canEditPendingAssignment
                && !canUpdateSubmittedTna
                && !canEditSpecialAdminTraining)
                return false;

            form.FormNo = request.FormNo;
            form.RevNo = request.RevNo;
            form.RevDate = request.RevDate;
            form.FormDataJson = request.FormDataJson;
            if (IsBypassedTaskForm(form.FormType))
            {
                form.ApprovalStatus = IsTrainingRequired(request.FormDataJson)
                    ? ApprovalStatus.Draft
                    : ApprovalStatus.Skipped;
                form.CurrentApproverUserId = null;
            }
            form.UpdatedAt = DateTime.UtcNow;
            form.UpdatedBy = request.UpdatedBy;

            if (form.ApprovalStatus == ApprovalStatus.Returned)
            {
                form.ApprovalStatus = ApprovalStatus.Draft;
                form.RevisionNumber++;
            }
            else if (form.ApprovalStatus == ApprovalStatus.Rejected)
            {
                // A rejection starts a correction cycle. Keep the rejection reason for
                // audit/display, but return the form to Draft so only the requester can
                // resubmit the corrected version.
                form.ApprovalStatus = ApprovalStatus.Draft;
                form.RevisionNumber++;
                form.CurrentApproverUserId = null;
                form.DelegatedToUserId = null;
            }

            _context.WorkflowAuditLogs.Add(NewAudit(
                "Form Updated", WorkflowAction.Updated, form.Id, request.UpdatedBy,
                "Form No: " + request.FormNo + ", Rev: " + request.RevNo));

            await _context.SaveChangesAsync(cancellationToken);

            if (IsSaveToSubmitTrainingForm(form.FormType)
                && RoleHierarchy.Normalize(actor.Role) == OrgRoles.TeamLeader
                && form.ApprovalStatus == ApprovalStatus.Draft)
            {
                await Handle(new SubmitFormForApprovalCommand
                {
                    Id = form.Id,
                    SubmittedBy = actor.FullName,
                    ActorUserId = actor.Id
                }, cancellationToken);
            }

            return true;
        }

        public async Task<bool> Handle(DeleteFormSubmissionCommand request, CancellationToken cancellationToken)
        {
            var form = await _context.FormSubmissions.FindAsync(new object[] { request.Id }, cancellationToken);
            if (form == null) return false;

            form.IsActive = false;
            form.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> Handle(SubmitFormForApprovalCommand request, CancellationToken cancellationToken)
        {
            var actor = await RequireActorAsync(request.ActorUserId, cancellationToken);
            var form = await _context.FormSubmissions
                .FirstOrDefaultAsync(f => f.Id == request.Id && f.IsActive, cancellationToken)
                ?? throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.FormNotFound, "The form to submit does not exist.");

            await EnsureEvaluationFolderGateAsync(form, cancellationToken);

            if (form.ApprovalStatus != ApprovalStatus.Draft && form.ApprovalStatus != ApprovalStatus.Returned)
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.FormNotPending,
                    "A form in status '" + ApprovalStatusInfo.Label(form.ApprovalStatus) + "' cannot be submitted.");

            // Saving a rejected correction changes FormSubmission back to Draft,
            // so the form status alone cannot identify a resubmission. The rejected
            // workflow step remains persisted until it is reactivated below.
            var isRejectedCorrection = form.ApprovalStatus == ApprovalStatus.Rejected ||
                await _context.WorkflowInstances
                    .AsNoTracking()
                    .AnyAsync(
                        instance => instance.FormSubmissionId == form.Id &&
                            instance.Steps.Any(step => step.State == WorkflowStepState.Rejected),
                        cancellationToken);
            var status = FormWorkflowCatalog.FirstStatusAfterSubmit(form.FormType);
            form.ApprovalStatus = status;
            form.SubmittedByUserId = actor.Id;
            form.SubmittedDate = DateTime.UtcNow;
            form.UpdatedAt = DateTime.UtcNow;
            form.UpdatedBy = actor.FullName;

            // A rejected correction must re-enter the approval workflow. It must
            // never take the first-submit auto-finalization path, even when the
            // catalog's first status is Approved.
            if (status == ApprovalStatus.Approved && !isRejectedCorrection)
            {
                await FinaliseAsync(form, actor, 0, cancellationToken);
            }
            else
            {
                var instance = await EnsureInstanceAsync(form, actor, cancellationToken);

                // AMENDED v15: freeze the PREPARER on the printed "prepared By:" line.
                // The Draft step (StepNo 0) used to stay NotStarted on submit, so its
                // name / date / signature were NEVER stamped - they existed only as the
                // CURRENT viewer's provisional auto-fill and vanished for every other
                // role (the reported defect: kidus disappears once the Manager opens
                // the form). Stamp step 0 with the submitting actor, exactly like any
                // approval step, so the hard copy and the approval history keep showing
                // who prepared the form regardless of who is viewing it.
                if (!ShouldDeferPreparedByStamp(form.FormType))
                    await StampDraftStepAsync(instance, actor, cancellationToken);

                if (await ReactivateRejectedStepAsync(form, actor, instance, cancellationToken))
                {
                    // A correction resubmission returns to the step that rejected the
                    // form. It must wait for a fresh approval instead of being finalized
                    // by the normal first-pass auto-skip logic below.
                }
                else
                {

                // AMENDED v16 (MNT-1229B): the catalog declares conditional steps - the
                // optional Engineer assignment and the Engineer processing tier on the TNA -
                // that are auto-skipped straight from the form payload. The v15 path parked
                // every submission on step 1, so an STL-drafted TNA drifted onto the
                // "Pending Engineer action" stage and the Manager / Special Team Leader never
                // became the responsible role (the reported defect). Walk forward past every
                // auto-skippable step and make the FIRST actionable step the live one.
                var fields = FlattenFormFields(form.FormDataJson);
                var firstApproval = FormWorkflowCatalog.FirstApprovalStep(form.FormType);
                var firstStep = firstApproval is null
                    ? null
                    : AdvanceToActionableStep(form.FormType, instance, fields, firstApproval.StepNo);

                if (firstStep is null && firstApproval is not null)
                {
                    // Every approval step of this form auto-skipped on its own fields: the
                    // record closes on submit, exactly like an auto-generated form.
                    await FinaliseAsync(form, actor, firstApproval.StepNo, cancellationToken);
                }
                else if (firstStep is null)
                {
                    instance.CurrentStepNo = 1;
                    var approver = await ResolveApproverAsync(
                        form, RoleHierarchy.ApproverRolesFor(status), actor.Id, cancellationToken);
                    form.CurrentApproverUserId = approver?.Id;
                    if (approver is null) form.ApprovalStatus = ApprovalStatus.PendingAssignment;
                    instance.Status = form.ApprovalStatus;
                }
                else
                {
                    instance.CurrentStepNo = firstStep.StepNo;
                    ActivateStep(instance, firstStep.StepNo);

                    if (firstStep.RequiresManualAssignment)
                    {
                        form.ApprovalStatus = ApprovalStatus.PendingAssignment;
                        form.CurrentApproverUserId = null;
                        instance.CurrentAssignmentUnit = firstStep.AssignmentUnit;
                    }
                    else
                    {
                        var approver = await ResolveApproverAsync(
                            form, firstStep.EligibleRoles, actor.Id, cancellationToken);
                        if (approver is null)
                        {
                            form.ApprovalStatus = ApprovalStatus.PendingAssignment;
                            form.CurrentApproverUserId = null;
                        }
                        else
                        {
                            form.ApprovalStatus = firstStep.Status;
                            form.CurrentApproverUserId = approver.Id;
                            AssignStep(instance, firstStep.StepNo, approver);
                        }
                    }
                    instance.CurrentAssigneeUserId = form.CurrentApproverUserId;
                    instance.Status = form.ApprovalStatus;
                }
                }
            }

            _context.WorkflowAuditLogs.Add(NewAudit(
                "Form Submitted for Approval", WorkflowAction.Submitted, form.Id, actor.Username,
                "Form type: " + form.FormType + " -> " + ApprovalStatusInfo.Label(form.ApprovalStatus) +
                (form.CurrentApproverUserId is null ? " (awaiting assignment)" : " (approver user " + form.CurrentApproverUserId + ")")));

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> Handle(ApproveFormSubmissionCommand request, CancellationToken cancellationToken)
        {
            var actor = await RequireActorAsync(request.ActorUserId, cancellationToken);
            var form = await LoadPendingFormAsync(request.Id, actor, cancellationToken);

            await EnsureEvaluationFolderGateAsync(form, cancellationToken);

            var instance = await EnsureInstanceAsync(form, actor, cancellationToken);
            var stepNo = instance.CurrentStepNo;
            var step = FormWorkflowCatalog.StepAt(form.FormType, stepNo);

            if (step is not null && step.RequiresComments && string.IsNullOrWhiteSpace(request.Comments))
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.FormNotPending,
                    "Step '" + step.Title + "' requires comments before it can be completed.");

            var executed = instance.Steps.FirstOrDefault(s => s.StepNo == stepNo && s.State != WorkflowStepState.Completed);
            SignatureStampResult? signatureStamp = null;
            if (executed is not null)
            {
                executed.State = WorkflowStepState.Completed;
                executed.ActionTaken = step?.Kind switch
                {
                    WorkflowStepKind.SignOff => WorkflowStepAction.SignedOff,
                    WorkflowStepKind.Endorsement => WorkflowStepAction.Endorsed,
                    WorkflowStepKind.Verification => WorkflowStepAction.Verified,
                    WorkflowStepKind.Review => WorkflowStepAction.Reviewed,
                    _ => WorkflowStepAction.Approved
                };
                executed.ActedByUserId = actor.Id;
                executed.ActedByName = actor.FullName;
                executed.ActedByRole = RoleHierarchy.Normalize(actor.Role) ?? actor.Role;
                executed.ActedAt = DateTime.UtcNow;
                executed.Comments = request.Comments ?? string.Empty;

                var block = step?.Signature ?? SignatureBlockType.None;
                if (block != SignatureBlockType.None)
                {
                    if (ShouldDeferPreparedByStamp(form.FormType))
                        await StampDraftStepAsync(instance, actor, cancellationToken);

                    signatureStamp = await _signatures.StampAsync(instance, executed, actor, cancellationToken);
                    executed.SignatureName = signatureStamp.SignerName;
                    executed.SignatureRole = signatureStamp.SignerRole;
                    executed.SignatureDate = signatureStamp.SignedAtUtc;
                    executed.SignatureHash = signatureStamp.SignatureHash;
                }
            }

            if (signatureStamp is not null && IsTrainingVerificationForm(form.FormType))
            {
                if (stepNo == 3 && RoleHierarchy.Normalize(actor.Role) == OrgRoles.HRSpecialist)
                {
                    CaptureTrainingSignature(
                        form,
                        "hrName",
                        "hrDate",
                        "hrSignatureId",
                        "hrSignatureHash",
                        actor,
                        signatureStamp);
                }
                else if (stepNo == 2 && RoleHierarchy.Normalize(actor.Role) == OrgRoles.Manager)
                {
                    CaptureTrainingSignature(
                        form,
                        "initiatedByName",
                        "initiatedByDate",
                        "initiatedBySignatureId",
                        "initiatedBySignatureHash",
                        actor,
                        signatureStamp);
                    var data = JsonNode.Parse(form.FormDataJson) as JsonObject ?? new JsonObject();
                    data["initiatedByRole"] = RoleHierarchy.Label(actor.Role);
                    data["initiatedByPosition"] = string.IsNullOrWhiteSpace(actor.JobTitle)
                        ? RoleHierarchy.Label(actor.Role)
                        : actor.JobTitle;
                    form.FormDataJson = data.ToJsonString();
                }
            }

            // AMENDED v16 (MNT-1229B): after an approval the next step may itself be an
            // auto-skippable conditional tier (the Engineer steps on the TNA). Advance past
            // every auto-skipped step so the record parks on the genuinely responsible role,
            // and mirror the live status onto the instance so every viewer's read path and
            // the printed approval history agree.
            var fields = FlattenFormFields(form.FormDataJson);
            var nextRaw = FormWorkflowCatalog.NextStep(form.FormType, stepNo);
            var next = nextRaw is null
                ? null
                : AdvanceToActionableStep(form.FormType, instance, fields, nextRaw.StepNo);

            if (next is null && FormWorkflowCatalog.IsCatalogued(form.FormType))
            {
                await FinaliseAsync(form, actor, stepNo, cancellationToken);
            }
            else if (next is not null)
            {
                instance.CurrentStepNo = next.StepNo;
                ActivateStep(instance, next.StepNo);

                if (next.RequiresManualAssignment)
                {
                    var nextStepEntity = instance.Steps.FirstOrDefault(s => s.StepNo == next.StepNo);
                    if (nextStepEntity is not null)
                    {
                        nextStepEntity.RequiresManualAssignment = true;
                        nextStepEntity.AssignerRolesCsv = string.Join(',', next.AssignerRoles);
                        nextStepEntity.AssignmentUnit = next.AssignmentUnit;
                        nextStepEntity.State = WorkflowStepState.AwaitingAssignment;
                    }
                    form.ApprovalStatus = ApprovalStatus.PendingAssignment;
                    form.CurrentApproverUserId = null;
                    instance.CurrentAssignmentUnit = next.AssignmentUnit;
                }
                else
                {
                    var approver = await ResolveApproverAsync(
                        form, next.EligibleRoles, form.SubmittedByUserId ?? actor.Id, cancellationToken);
                    if (approver is null)
                    {
                        form.ApprovalStatus = ApprovalStatus.PendingAssignment;
                        form.CurrentApproverUserId = null;
                    }
                    else
                    {
                        form.ApprovalStatus = next.Status;
                        form.CurrentApproverUserId = approver.Id;
                        AssignStep(instance, next.StepNo, approver);
                    }
                }
                instance.CurrentAssigneeUserId = form.CurrentApproverUserId;
                instance.Status = form.ApprovalStatus;
            }
            else
            {
                var nextStatus = RoleHierarchy.NextStatusAfterApproval(form.ApprovalStatus);
                form.ApprovalStatus = nextStatus;
                if (nextStatus == ApprovalStatus.Approved)
                {
                    await FinaliseAsync(form, actor, stepNo, cancellationToken);
                }
                else
                {
                    var approver = await ResolveApproverAsync(
                        form, RoleHierarchy.ApproverRolesFor(nextStatus),
                        form.SubmittedByUserId ?? actor.Id, cancellationToken);
                    form.CurrentApproverUserId = approver?.Id;
                    if (approver is null) form.ApprovalStatus = ApprovalStatus.PendingAssignment;
                    instance.Status = form.ApprovalStatus;
                }
            }

            // AMENDED v14: FIRST-WRITER-WINS on the legacy fallback reviewer slot.
            // The frozen FormWorkflowStep (ActedByName / ActedAt / SignatureHash) and
            // the append-only FormSignature line above are the authoritative record of
            // THIS approval; they are never overwritten. These two scalar fields are
            // only read by the frontend fallback when no workflow instance can be
            // resolved. v13 stamped them on every approval, which erased earlier
            // approvers from the fallback view - the reported defect. ReviewedByUserId
            // is long?, so "is null" is the correct first-writer sentinel.
            if (form.ReviewedByUserId is null)
            {
                form.ReviewedByUserId = actor.Id;
                form.ReviewedDate = DateTime.UtcNow;
            }
            form.ReviewComments = request.Comments ?? string.Empty;
            form.UpdatedAt = DateTime.UtcNow;
            form.UpdatedBy = actor.FullName;

            _context.WorkflowAuditLogs.Add(NewAudit(
                "Form Approved at step " + stepNo + " -> " + ApprovalStatusInfo.Label(form.ApprovalStatus),
                WorkflowAction.Approved, form.Id, actor.Username, request.Comments));

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> Handle(RejectFormSubmissionCommand request, CancellationToken cancellationToken)
        {
            var actor = await RequireActorAsync(request.ActorUserId, cancellationToken);
            var form = await LoadPendingFormAsync(request.Id, actor, cancellationToken);

            form.ApprovalStatus = ApprovalStatus.Rejected;
            form.RejectionReason = request.Reason;
            form.CurrentApproverUserId = null;
            form.UpdatedAt = DateTime.UtcNow;
            form.UpdatedBy = actor.FullName;

            await MarkStepAsync(form, actor, WorkflowStepState.Rejected,
                WorkflowStepAction.Rejected, request.Reason, cancellationToken);

            _context.WorkflowAuditLogs.Add(NewAudit(
                "Form Rejected", WorkflowAction.Rejected, form.Id, actor.Username, request.Reason));

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> Handle(ReturnFormForRevisionCommand request, CancellationToken cancellationToken)
        {
            var actor = await RequireActorAsync(request.ActorUserId, cancellationToken);
            var form = await LoadPendingFormAsync(request.Id, actor, cancellationToken);

            form.ApprovalStatus = ApprovalStatus.Returned;
            form.ReviewComments = request.Comments;
            form.CurrentApproverUserId = null;
            form.DelegatedToUserId = null;
            form.UpdatedAt = DateTime.UtcNow;
            form.UpdatedBy = actor.FullName;

            await MarkStepAsync(form, actor, WorkflowStepState.Returned,
                WorkflowStepAction.Returned, request.Comments, cancellationToken);

            _context.WorkflowAuditLogs.Add(NewAudit(
                "Form Returned for Revision", WorkflowAction.Rejected, form.Id, actor.Username, request.Comments));

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> Handle(DelegateFormSubmissionCommand request, CancellationToken cancellationToken)
        {
            var actor = await RequireActorAsync(request.ActorUserId, cancellationToken);
            var form = await LoadPendingFormAsync(request.Id, actor, cancellationToken);

            if (!request.DelegateToUserId.HasValue)
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.UserNotFound, "No delegate user was supplied.");

            var delegateUser = await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == request.DelegateToUserId.Value && u.IsActive, cancellationToken)
                ?? throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.UserNotFound, "The delegate user does not exist or is inactive.");

            var instance = await EnsureInstanceAsync(form, actor, cancellationToken);
            var actorCanonical = RoleHierarchy.Normalize(actor.Role);

            if (actorCanonical != OrgRoles.Admin &&
                !FormWorkflowCatalog.CanDelegateStep(actor.Role, delegateUser.Role, form.FormType, instance.CurrentStepNo))
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.NotCurrentApprover,
                    "The step does not allow delegation to that user (only strictly lower-tier staff of a delegation-eligible role may be delegated to).");

            form.DelegatedToUserId = delegateUser.Id;
            form.DelegatedDate = DateTime.UtcNow;
            form.DelegationReason = request.Reason;
            form.UpdatedAt = DateTime.UtcNow;
            form.UpdatedBy = actor.FullName;

            var stepEntity = instance.Steps.FirstOrDefault(s => s.StepNo == instance.CurrentStepNo);
            if (stepEntity is not null)
            {
                stepEntity.WasDelegated = true;
                stepEntity.DelegatedByUserId = actor.Id;
                stepEntity.DelegationReason = request.Reason;
            }

            _context.WorkflowAuditLogs.Add(NewAudit(
                "Form Delegated", WorkflowAction.Delegated, form.Id, actor.Username,
                "Delegated to " + delegateUser.FullName + " (" + RoleHierarchy.Normalize(delegateUser.Role) + "): " + request.Reason));

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<bool> Handle(AssignFormSubmissionCommand request, CancellationToken cancellationToken)
        {
            var actor = await RequireActorAsync(request.ActorUserId, cancellationToken);
            var form = await LoadPendingFormAsync(
                request.Id,
                actor,
                cancellationToken,
                allowSpecialAdminTrainingManagerHandoff: true);
            var instance = await _context.WorkflowInstances
                .Include(i => i.Steps)
                .FirstOrDefaultAsync(i => i.FormSubmissionId == form.Id, cancellationToken)
                ?? throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.FormNotFound, "The workflow instance does not exist.");

            var stepNo = request.StepNo ?? instance.CurrentStepNo;
            var step = instance.Steps.FirstOrDefault(s => s.StepNo == stepNo
                && (s.State == WorkflowStepState.Active || s.State == WorkflowStepState.AwaitingAssignment));
            if (step is null)
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.FormNotPending, "The requested workflow step is not active.");

            var actorRole = RoleHierarchy.Normalize(actor.Role);
            var assignerRoles = SplitCsv(step.AssignerRolesCsv);
            var isSpecialAdminTrainingHandoff = actorRole == OrgRoles.SpecialAdmin
                && IsSpecialAdminTrainingForm(form.FormType)
                && instance.CurrentStepNo == 2
                && stepNo == 2;
            var isManagerHrSpecialistHandoff = actorRole == OrgRoles.Manager
                && IsSaveToSubmitTrainingForm(form.FormType)
                && instance.CurrentStepNo == 3
                && stepNo == 3;
            var isTrainingManagerHandoff = isSpecialAdminTrainingHandoff
                && IsTrainingVerificationForm(form.FormType);
            if (actorRole != OrgRoles.Admin
                && !isSpecialAdminTrainingHandoff
                && !isManagerHrSpecialistHandoff
                && (assignerRoles.Length == 0 || !assignerRoles.Contains(actorRole, StringComparer.OrdinalIgnoreCase)))
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.NotCurrentApprover,
                    "You are not authorized to assign this workflow step.");

            var assignee = await _context.Users
                .FirstOrDefaultAsync(u => u.Id == request.AssignToUserId && u.IsActive, cancellationToken)
                ?? throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.UserNotFound, "The selected assignee does not exist or is inactive.");

            var assigneeRole = RoleHierarchy.Normalize(assignee.Role);
            var eligibleRoles = SplitCsv(step.EligibleRolesCsv);
            var managerTierTrainingHandoff = isTrainingManagerHandoff;
            if (assigneeRole is null
                || (!eligibleRoles.Contains(assigneeRole, StringComparer.OrdinalIgnoreCase)
                    && !managerTierTrainingHandoff))
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.NotCurrentApprover,
                    "The selected assignee does not hold an eligible role for this step.");
            if (isTrainingManagerHandoff && assigneeRole != OrgRoles.Manager)
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.NotCurrentApprover,
                    "The Special Admin handoff must be assigned to a Manager.");

            var isSpecialAdminManagerHandoff = isTrainingManagerHandoff;
            if (!string.IsNullOrWhiteSpace(step.AssignmentUnit)
                && !isSpecialAdminManagerHandoff
                && !string.Equals(RoleHierarchy.FunctionalUnitOf(assignee.Role), step.AssignmentUnit, StringComparison.OrdinalIgnoreCase))
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.NotCurrentApprover,
                    "The selected assignee does not belong to the required functional unit.");

            if (IsStlTrainingForm(form.FormType)
                && !isSpecialAdminTrainingHandoff
                && !isManagerHrSpecialistHandoff)
            {
                var ata = await _context.ATARecords
                    .AsNoTracking()
                    .FirstOrDefaultAsync(r => r.Id == form.ATARecordId && r.IsActive, cancellationToken)
                    ?? throw new AuthorizationDeniedException(
                        AuthorizationDenialReason.FormNotFound,
                        "The ATA record for this form does not exist or is inactive.");

                if (actorRole != OrgRoles.TeamLeader || actor.ShopId != ata.ShopId)
                    throw new AuthorizationDeniedException(
                        AuthorizationDenialReason.NotCurrentApprover,
                        "Only the Shop Team Leader assigned to this ATA's shop may assign this form.");

                if (assignee.ShopId != ata.ShopId
                    || (assignee.SupervisorUserId != actor.Id && assignee.ManagerId != actor.Id))
                    throw new AuthorizationDeniedException(
                        AuthorizationDenialReason.NotCurrentApprover,
                        "The selected employee is not active under this Shop Team Leader and ATA shop.");
            }

                if (isManagerHrSpecialistHandoff && assigneeRole != OrgRoles.HRSpecialist)
                    throw new AuthorizationDeniedException(
                        AuthorizationDenialReason.NotCurrentApprover,
                        "The final training verification step must be assigned to an HR Specialist.");

            step.State = WorkflowStepState.Active;
            step.AssignedToUserId = assignee.Id;
            step.AssignedToName = assignee.FullName;
            step.AssignedToRole = assigneeRole;
            step.AssignedAt = DateTime.UtcNow;
            step.Comments = request.Comments ?? string.Empty;
            step.UpdatedAt = DateTime.UtcNow;

            instance.CurrentStepNo = step.StepNo;
            instance.CurrentAssigneeUserId = assignee.Id;
            instance.CurrentAssignmentUnit = step.AssignmentUnit;
            instance.Status = step.PendingStatus;
            instance.UpdatedAt = DateTime.UtcNow;

            form.CurrentApproverUserId = assignee.Id;
            form.ApprovalStatus = step.PendingStatus;
            form.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }

        public async Task<Guid> Handle(
            IncludeApprovedTrainingFormCommand request,
            CancellationToken cancellationToken)
        {
            var actor = await RequireActorAsync(request.ActorUserId, cancellationToken);
            var actorRole = RoleHierarchy.Normalize(actor.Role);
            if (actorRole != OrgRoles.TeamLeader)
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.NotCurrentApprover,
                    "Only a Shop Team Leader may include an approved training form.");

            var source = await _context.FormSubmissions
                .AsNoTracking()
                .Include(form => form.FileAttachments)
                .FirstOrDefaultAsync(form => form.Id == request.SourceFormSubmissionId && form.IsActive, cancellationToken)
                ?? throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.FormNotFound, "The approved training form does not exist.");

            if (!IsStlTrainingForm(source.FormType)
                || !ApprovalStatusInfo.CountsAsComplete(source.ApprovalStatus))
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.FormNotPending,
                    "Only fully approved training and competency forms may be inherited.");

            var sourceWorkflow = await _context.WorkflowInstances
                .AsNoTracking()
                .Include(instance => instance.Steps)
                .Include(instance => instance.Signatures)
                .FirstOrDefaultAsync(instance => instance.FormSubmissionId == source.Id, cancellationToken);

            var targetAta = await _context.ATARecords
                .AsNoTracking()
                .FirstOrDefaultAsync(record => record.Id == request.TargetATARecordId && record.IsActive, cancellationToken)
                ?? throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.FormNotFound, "The target ATA record does not exist or is inactive.");

            var sourceAta = await _context.ATARecords
                .AsNoTracking()
                .FirstOrDefaultAsync(record => record.Id == source.ATARecordId && record.IsActive, cancellationToken)
                ?? throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.FormNotFound, "The source ATA record does not exist or is inactive.");

            if (actor.ShopId != targetAta.ShopId
                || (source.ShopId ?? sourceAta.ShopId) != targetAta.ShopId)
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.NotCurrentApprover,
                    "The source and target ATA records must belong to the STL's shop.");

            var existing = await _context.FormSubmissions
                .FirstOrDefaultAsync(form => form.ATARecordId == targetAta.Id
                    && form.FormType == source.FormType
                    && form.SourceFormSubmissionId == source.Id
                    && form.IsActive, cancellationToken);
            if (existing is not null) return existing.Id;

            var now = DateTime.UtcNow;
            var inherited = new FormSubmission
            {
                Id = Guid.NewGuid(),
                ATARecordId = targetAta.Id,
                ShopId = targetAta.ShopId,
                SourceFormSubmissionId = source.Id,
                FormType = source.FormType,
                FormNo = source.FormNo,
                RevNo = source.RevNo,
                RevDate = source.RevDate,
                FormDataJson = source.FormDataJson,
                ApprovalStatus = ApprovalStatus.Approved,
                SubmittedByUserId = source.SubmittedByUserId,
                SubmittedDate = source.SubmittedDate,
                ReviewedByUserId = source.ReviewedByUserId,
                ReviewedDate = source.ReviewedDate,
                ReviewComments = source.ReviewComments,
                ApprovedByUserId = source.ApprovedByUserId,
                ApprovedDate = source.ApprovedDate,
                ApprovalSignatureHash = source.ApprovalSignatureHash,
                UploadLock = source.UploadLock,
                UploadLockedAt = source.UploadLockedAt,
                UploadLockedByUserId = source.UploadLockedByUserId,
                RevisionNumber = source.RevisionNumber,
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now,
                CreatedBy = actor.FullName,
                UpdatedBy = actor.FullName
            };

            _context.FormSubmissions.Add(inherited);

            if (sourceWorkflow is not null)
            {
                var inheritedWorkflow = new FormWorkflowInstance
                {
                    Id = Guid.NewGuid(),
                    FormSubmissionId = inherited.Id,
                    EvaluationFolderId = null,
                    ATARecordId = targetAta.Id,
                    ShopId = targetAta.ShopId,
                    FormType = sourceWorkflow.FormType,
                    FormNo = sourceWorkflow.FormNo,
                    Section = sourceWorkflow.Section,
                    Title = sourceWorkflow.Title,
                    Status = ApprovalStatus.Approved,
                    CurrentStepNo = sourceWorkflow.CurrentStepNo,
                    CurrentAssigneeUserId = null,
                    CurrentAssignmentUnit = null,
                    OriginatorUserId = sourceWorkflow.OriginatorUserId,
                    OriginatorRole = sourceWorkflow.OriginatorRole,
                    OriginatorName = sourceWorkflow.OriginatorName,
                    OriginatorShopId = targetAta.ShopId,
                    SubmittedAt = sourceWorkflow.SubmittedAt,
                    CompletedAt = sourceWorkflow.CompletedAt,
                    IsComplete = true,
                    IsLocked = true,
                    RegulatoryTargetDate = sourceWorkflow.RegulatoryTargetDate,
                    JointApprovalEnabled = sourceWorkflow.JointApprovalEnabled,
                    FormFieldsSnapshotJson = sourceWorkflow.FormFieldsSnapshotJson,
                    ExpiryMonths = sourceWorkflow.ExpiryMonths,
                    ExpiresAt = sourceWorkflow.ExpiresAt,
                    RevisionNumber = sourceWorkflow.RevisionNumber,
                    CreatedAt = now,
                    UpdatedAt = now,
                    CreatedBy = actor.Username,
                    UpdatedBy = actor.Username
                };

                foreach (var sourceStep in sourceWorkflow.Steps)
                {
                    inheritedWorkflow.Steps.Add(new FormWorkflowStep
                    {
                        Id = Guid.NewGuid(),
                        FormWorkflowInstanceId = inheritedWorkflow.Id,
                        StepNo = sourceStep.StepNo,
                        Title = sourceStep.Title,
                        PendingStatus = sourceStep.PendingStatus,
                        Kind = sourceStep.Kind,
                        SignatureBlock = sourceStep.SignatureBlock,
                        EligibleRolesCsv = sourceStep.EligibleRolesCsv,
                        AssignerRolesCsv = sourceStep.AssignerRolesCsv,
                        AssignmentUnit = sourceStep.AssignmentUnit,
                        RequiresManualAssignment = sourceStep.RequiresManualAssignment,
                        RestrictToOriginatorShop = sourceStep.RestrictToOriginatorShop,
                        AllowsDelegation = sourceStep.AllowsDelegation,
                        RequiresComments = sourceStep.RequiresComments,
                        IsStepByStepChecklist = sourceStep.IsStepByStepChecklist,
                        SkipMode = sourceStep.SkipMode,
                        SkipConditionField = sourceStep.SkipConditionField,
                        SkipWhenValue = sourceStep.SkipWhenValue,
                        SkipWhenFieldMissing = sourceStep.SkipWhenFieldMissing,
                        SkipReasonTemplate = sourceStep.SkipReasonTemplate,
                        State = sourceStep.State,
                        ActionTaken = sourceStep.ActionTaken,
                        AssignedToUserId = sourceStep.AssignedToUserId,
                        AssignedToName = sourceStep.AssignedToName,
                        AssignedToRole = sourceStep.AssignedToRole,
                        AssignedByUserId = sourceStep.AssignedByUserId,
                        AssignedAt = sourceStep.AssignedAt,
                        ActedByUserId = sourceStep.ActedByUserId,
                        ActedByName = sourceStep.ActedByName,
                        ActedByRole = sourceStep.ActedByRole,
                        ActedAt = sourceStep.ActedAt,
                        Comments = sourceStep.Comments,
                        WasDelegated = sourceStep.WasDelegated,
                        DelegatedByUserId = sourceStep.DelegatedByUserId,
                        DelegationReason = sourceStep.DelegationReason,
                        IsSkipped = sourceStep.IsSkipped,
                        SkippedAutomatically = sourceStep.SkippedAutomatically,
                        SkipReason = sourceStep.SkipReason,
                        ChecklistTotalItems = sourceStep.ChecklistTotalItems,
                        ChecklistVerifiedItems = sourceStep.ChecklistVerifiedItems,
                        ChecklistItemsJson = sourceStep.ChecklistItemsJson,
                        SignatureName = sourceStep.SignatureName,
                        SignatureRole = sourceStep.SignatureRole,
                        SignatureDate = sourceStep.SignatureDate,
                        SignatureHash = sourceStep.SignatureHash,
                        SignatureStoragePath = sourceStep.SignatureStoragePath,
                        SignatureImageApplied = sourceStep.SignatureImageApplied,
                        CreatedAt = now,
                        UpdatedAt = now
                    });
                }

                foreach (var sourceSignature in sourceWorkflow.Signatures)
                {
                    inheritedWorkflow.Signatures.Add(new FormSignature
                    {
                        Id = Guid.NewGuid(),
                        FormWorkflowInstanceId = inheritedWorkflow.Id,
                        FormSubmissionId = inherited.Id,
                        EvaluationFolderId = null,
                        Block = sourceSignature.Block,
                        BlockCaption = sourceSignature.BlockCaption,
                        StepNo = sourceSignature.StepNo,
                        UserId = sourceSignature.UserId,
                        PersonName = sourceSignature.PersonName,
                        PersonRole = sourceSignature.PersonRole,
                        PersonRoleLabel = sourceSignature.PersonRoleLabel,
                        SignedAt = sourceSignature.SignedAt,
                        SignatureHash = sourceSignature.SignatureHash,
                        Remarks = "Inherited from approved form " + source.Id,
                        SignatureStoragePath = sourceSignature.SignatureStoragePath,
                        SignatureImageApplied = sourceSignature.SignatureImageApplied,
                        SignatureFileName = sourceSignature.SignatureFileName,
                        SignatureContentType = sourceSignature.SignatureContentType,
                        SignatureFileSha256 = sourceSignature.SignatureFileSha256
                    });
                }

                _context.WorkflowInstances.Add(inheritedWorkflow);
            }

            foreach (var attachment in source.FileAttachments.Where(file => file.IsActive))
            {
                _context.FormFileAttachments.Add(new FormFileAttachment
                {
                    Id = Guid.NewGuid(),
                    ATARecordId = targetAta.Id,
                    FormSubmissionId = inherited.Id,
                    FileName = attachment.FileName,
                    ContentType = attachment.ContentType,
                    FileSizeBytes = attachment.FileSizeBytes,
                    StoragePath = attachment.StoragePath,
                    Description = "Inherited from approved form " + source.Id,
                    FormType = attachment.FormType,
                    ApprovalStatus = ApprovalStatus.Approved,
                    ApprovedByUserId = attachment.ApprovedByUserId,
                    ApprovedDate = attachment.ApprovedDate,
                    ApprovalComments = attachment.ApprovalComments,
                    IsActive = true,
                    UploadedAt = now,
                    UploadedBy = actor.FullName
                });
            }

            _context.WorkflowAuditLogs.Add(NewAudit(
                "Approved training form inherited",
                WorkflowAction.Created,
                inherited.Id,
                actor.Username,
                $"SourceFormSubmissionId={source.Id}; TargetATARecordId={targetAta.Id}; FormType={source.FormType}"));

            await _context.SaveChangesAsync(cancellationToken);
            return inherited.Id;
        }

        private async Task<User> RequireActorAsync(long actorUserId, CancellationToken cancellationToken)
        {
            if (actorUserId <= 0)
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.NotAuthenticated,
                    "A numeric authenticated user id is required for this action.");

            return await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(u => u.Id == actorUserId && u.IsActive, cancellationToken)
                ?? throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.UserNotFound,
                    "The acting user was not found or is inactive.");
        }

        private async Task<FormSubmission> LoadPendingFormAsync(
            Guid formId,
            User actor,
            CancellationToken cancellationToken,
            bool allowSpecialAdminTrainingManagerHandoff = false)
        {
            var form = await _context.FormSubmissions
                .FirstOrDefaultAsync(f => f.Id == formId && f.IsActive, cancellationToken)
                ?? throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.FormNotFound, "The form does not exist.");

            var pending = ApprovalStatusInfo.StateOf(form.ApprovalStatus) == FormLifecycleState.Pending
                || form.ApprovalStatus == ApprovalStatus.PendingAssignment;
            if (!pending)
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.FormNotPending,
                    "This form is not awaiting approval (status: " + ApprovalStatusInfo.Label(form.ApprovalStatus) + ").");

            var canonical = RoleHierarchy.Normalize(actor.Role);
            if (canonical == OrgRoles.Admin) return form;
            if (form.CurrentApproverUserId == actor.Id) return form;
            if (form.DelegatedToUserId == actor.Id) return form;

            // AMENDED v16 (MNT-1229B): the CURRENTLY RESPONSIBLE ROLE owns the live step,
            // not the single user id ResolveApproverAsync happened to auto-pick. A second
            // Manager must be able to approve while the record sits on the Manager tier, and
            // the Special Team Leader must be able to act once it reaches the STL tier - the
            // reported defect was Approve/Reject/Delegate being gated on one specific user.
            var currentStepNo = await _context.WorkflowInstances
                .Where(i => i.FormSubmissionId == form.Id && i.Status == form.ApprovalStatus)
                .OrderByDescending(i => i.UpdatedAt)
                .Select(i => (int?)i.CurrentStepNo)
                .FirstOrDefaultAsync(cancellationToken);
            if (!currentStepNo.HasValue)
            {
                currentStepNo = await _context.WorkflowInstances
                    .Where(i => i.FormSubmissionId == form.Id)
                    .OrderByDescending(i => i.UpdatedAt)
                    .Select(i => (int?)i.CurrentStepNo)
                    .FirstOrDefaultAsync(cancellationToken);
            }

            // Authorize against the persisted live step, not every catalog step that
            // happens to share the same status. This keeps the API gate aligned with
            // the workflow instance capabilities exposed to the frontend.
            var pool = FormWorkflowCatalog.IsCatalogued(form.FormType)
                ? (currentStepNo.HasValue
                    ? FormWorkflowCatalog.ApproverRolesFor(
                        form.FormType, form.ApprovalStatus, currentStepNo.Value)
                    : FormWorkflowCatalog.ApproverRolesFor(form.FormType, form.ApprovalStatus))
                : RoleHierarchy.ApproverRolesFor(form.ApprovalStatus);

            if (currentStepNo.HasValue
                && FormWorkflowCatalog.IsCatalogued(form.FormType)
                && FormWorkflowCatalog.StepAt(form.FormType, currentStepNo.Value) is { RequiresManualAssignment: true }
                && FormWorkflowCatalog.AssignerRolesFor(form.FormType, currentStepNo.Value)
                    .Contains(canonical, StringComparer.OrdinalIgnoreCase))
                return form;

            if (allowSpecialAdminTrainingManagerHandoff
                && canonical == OrgRoles.SpecialAdmin
                && IsTrainingVerificationForm(form.FormType)
                && currentStepNo == FormWorkflowCatalog.TrainingVerificationStepHrManagerReview
                && form.ApprovalStatus == ApprovalStatus.PendingManagerApproval)
                return form;

            if (canonical is not null && pool.Contains(canonical, StringComparer.OrdinalIgnoreCase))
                return form;

            throw new AuthorizationDeniedException(
                AuthorizationDenialReason.NotCurrentApprover,
                form.CurrentApproverUserId is null
                    ? "No approver is assigned for this step yet, and your role is not eligible for it."
                    : "You are not the current approver or delegate for this form.");
        }

        private async Task EnsureEvaluationFolderGateAsync(
            FormSubmission form,
            CancellationToken cancellationToken)
        {
            var ata = await _context.ATARecords
                .AsNoTracking()
                .FirstOrDefaultAsync(r => r.Id == form.ATARecordId && r.IsActive, cancellationToken);

            if (ata is null || ata.ApprovalStatus != ApprovalStatus.Approved)
            {
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.FormNotPending,
                    "Complete and approve the ATA Record Workflow before approving Table of Contents forms.");
            }

            var prerequisites = FormWorkflowCatalog.PrerequisiteFormTypes(form.FormType);
            if (prerequisites.Length == 0) return;

            var prerequisiteForms = await _context.FormSubmissions
                .AsNoTracking()
                .Where(f => f.ATARecordId == form.ATARecordId
                    && f.IsActive
                    && prerequisites.Contains(f.FormType))
                .ToListAsync(cancellationToken);

            // CountsAsComplete is domain logic and cannot be translated to SQL. The
            // prerequisite set is already bounded to this ATA record, so evaluate the
            // completion rule after the filtered rows are materialized.
            var completed = prerequisiteForms
                .GroupBy(f => f.FormType, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    group => group.Key,
                    group => group.Any(f => ApprovalStatusInfo.CountsAsComplete(f.ApprovalStatus)),
                    StringComparer.OrdinalIgnoreCase);

            var missing = prerequisites
                .Where(type => !completed.TryGetValue(type, out var isComplete) || !isComplete)
                .ToArray();
            if (missing.Length > 0)
            {
                throw new AuthorizationDeniedException(
                    AuthorizationDenialReason.FormNotPending,
                    "Complete the preceding Table of Contents forms before submitting or approving this form: "
                    + string.Join(", ", missing.Select(FormWorkflowCatalog.TitleOf)) + ".");
            }
        }

        private async Task<FormWorkflowInstance> EnsureInstanceAsync(
            FormSubmission form, User actor, CancellationToken cancellationToken)
        {
            var instance = await _context.WorkflowInstances
                .Include(i => i.Steps)
                .Where(i => i.FormSubmissionId == form.Id)
                .OrderByDescending(i => i.Status == form.ApprovalStatus)
                .ThenByDescending(i => i.UpdatedAt)
                .FirstOrDefaultAsync(cancellationToken);
            if (instance is not null) return instance;

            var definition = FormWorkflowCatalog.Get(form.FormType);
            instance = new FormWorkflowInstance
            {
                Id = Guid.NewGuid(),
                FormSubmissionId = form.Id,
                ShopId = form.ShopId,
                FormType = form.FormType,
                FormNo = form.FormNo,
                Section = definition?.Section ?? string.Empty,
                Title = definition?.Title ?? form.FormType,
                Status = form.ApprovalStatus,
                CurrentStepNo = 0,
                OriginatorUserId = form.SubmittedByUserId ?? actor.Id,
                OriginatorRole = RoleHierarchy.Normalize(actor.Role) ?? actor.Role,
                OriginatorName = actor.FullName,
                OriginatorShopId = actor.ShopId,
                SubmittedAt = DateTime.UtcNow,
                RevisionNumber = form.RevisionNumber,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow,
                CreatedBy = actor.Username,
                UpdatedBy = actor.Username,
                Steps = new List<FormWorkflowStep>()
            };

            foreach (var step in definition?.Steps ?? Array.Empty<WorkflowStepDefinition>())
            {
                instance.Steps.Add(new FormWorkflowStep
                {
                    Id = Guid.NewGuid(),
                    FormWorkflowInstanceId = instance.Id,
                    StepNo = step.StepNo,
                    Title = step.Title,
                    PendingStatus = step.Status,
                    Kind = step.Kind,
                    SignatureBlock = step.Signature,
                    EligibleRolesCsv = string.Join(",", step.EligibleRoles),
                    AssignerRolesCsv = string.Join(",", step.AssignerRoles),
                    AssignmentUnit = step.AssignmentUnit,
                    RequiresManualAssignment = step.RequiresManualAssignment,
                    RestrictToOriginatorShop = step.RestrictToOriginatorShop,
                    AllowsDelegation = step.AllowsDelegation,
                    RequiresComments = step.RequiresComments,
                    IsStepByStepChecklist = step.IsStepByStepChecklist,
                    SkipMode = step.Skip,
                    SkipConditionField = step.SkipConditionField,
                    SkipWhenValue = step.SkipWhenValue,
                    SkipWhenFieldMissing = step.SkipWhenFieldMissing,
                    SkipReasonTemplate = step.SkipReasonTemplate,
                    State = WorkflowStepState.NotStarted,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
            }

            _context.WorkflowInstances.Add(instance);
            return instance;
        }

        private static void ActivateStep(FormWorkflowInstance instance, int stepNo)
        {
            var step = instance.Steps.FirstOrDefault(s => s.StepNo == stepNo);
            if (step is not null && step.State == WorkflowStepState.NotStarted)
                step.State = WorkflowStepState.Active;
        }

        private async Task<bool> ReactivateRejectedStepAsync(
            FormSubmission form,
            User actor,
            FormWorkflowInstance instance,
            CancellationToken cancellationToken)
        {
            var step = instance.Steps
                .Where(s => s.State == WorkflowStepState.Rejected)
                .OrderByDescending(s => s.StepNo)
                .FirstOrDefault();
            if (step is null) return false;

            var rejectedDefinition = FormWorkflowCatalog.StepAt(form.FormType, step.StepNo);
            var correctionStepNo = IsStlTrainingForm(form.FormType)
                && rejectedDefinition?.Status == ApprovalStatus.PendingTeamLeaderReview
                ? 2
                : step.StepNo;

            var definition = FormWorkflowCatalog.StepAt(form.FormType, correctionStepNo);
            if (definition is null) return false;

            instance.CurrentStepNo = correctionStepNo;

            var correctionStep = instance.Steps.FirstOrDefault(s => s.StepNo == correctionStepNo);
            if (correctionStep is null) return false;
            correctionStep.State = definition.RequiresManualAssignment
                ? WorkflowStepState.AwaitingAssignment
                : WorkflowStepState.Active;
            correctionStep.ActionTaken = WorkflowStepAction.None;
            correctionStep.UpdatedAt = DateTime.UtcNow;

            instance.CurrentAssignmentUnit = definition.RequiresManualAssignment
                ? definition.AssignmentUnit
                : null;

            if (definition.RequiresManualAssignment)
            {
                form.ApprovalStatus = ApprovalStatus.PendingAssignment;
                form.CurrentApproverUserId = null;
            }
            else
            {
                User? approver = null;
                var assignedEmployeeId = correctionStepNo != step.StepNo
                    ? AssignedEmployeeUserId(form)
                    : null;
                if (assignedEmployeeId.HasValue)
                {
                    approver = await _context.Users
                        .AsNoTracking()
                        .FirstOrDefaultAsync(
                            user => user.Id == assignedEmployeeId.Value && user.IsActive,
                            cancellationToken);
                }
                approver ??= await ResolveApproverAsync(
                    form, definition.EligibleRoles, form.SubmittedByUserId ?? actor.Id, cancellationToken);
                form.CurrentApproverUserId = approver?.Id;
                if (approver is null)
                {
                    form.ApprovalStatus = ApprovalStatus.PendingAssignment;
                    step.State = WorkflowStepState.AwaitingAssignment;
                    instance.CurrentAssignmentUnit = definition.AssignmentUnit;
                }
                else
                {
                    form.ApprovalStatus = definition.Status;
                    AssignStep(instance, correctionStepNo, approver);
                }
            }

            instance.Status = form.ApprovalStatus;
            instance.CurrentAssigneeUserId = form.CurrentApproverUserId;
            instance.UpdatedAt = DateTime.UtcNow;
            instance.UpdatedBy = actor.Username;
            return true;
        }

        private static void AssignStep(FormWorkflowInstance instance, int stepNo, User approver)
        {
            var step = instance.Steps.FirstOrDefault(s => s.StepNo == stepNo);
            if (step is null) return;
            step.State = WorkflowStepState.Active;
            step.AssignedToUserId = approver.Id;
            step.AssignedToName = approver.FullName;
            step.AssignedToRole = RoleHierarchy.Normalize(approver.Role) ?? approver.Role;
        }

        /// <summary>
        /// AMENDED v15: the Draft step (StepNo 0) owns the printed "prepared By:" line
        /// (WorkflowStepFactory.Draft signs with SignatureBlockType.PreparedBy).
        /// Completing + stamping it at submit time freezes the preparer's name, role,
        /// UTC date and specimen exactly like any approval step. Idempotent: a form
        /// returned and re-submitted keeps its ORIGINAL preparer stamp, because the
        /// step is already Completed.
        /// </summary>
        private async Task StampDraftStepAsync(
            FormWorkflowInstance instance, User actor, CancellationToken cancellationToken)
        {
            var draft = instance.Steps.FirstOrDefault(s => s.StepNo == 0);
            if (draft is null || draft.State == WorkflowStepState.Completed) return;
            if (draft.SignatureBlock == SignatureBlockType.None) return;

            draft.State = WorkflowStepState.Completed;
            draft.ActionTaken = WorkflowStepAction.Submitted;
            draft.ActedByUserId = actor.Id;
            draft.ActedByName = actor.FullName;
            draft.ActedByRole = RoleHierarchy.Normalize(actor.Role) ?? actor.Role;
            draft.ActedAt = DateTime.UtcNow;

            var stamp = await _signatures.StampAsync(instance, draft, actor, cancellationToken);
            draft.SignatureName = stamp.SignerName;
            draft.SignatureRole = stamp.SignerRole;
            draft.SignatureDate = stamp.SignedAtUtc;
            draft.SignatureHash = stamp.SignatureHash;
        }

        private static bool ShouldDeferPreparedByStamp(string? formType) =>
            string.Equals(formType, FormNodeTypes.SB, StringComparison.OrdinalIgnoreCase)
            || string.Equals(formType, FormNodeTypes.TrainingVerificationInspection, StringComparison.OrdinalIgnoreCase)
            || string.Equals(formType, FormNodeTypes.TrainingVerificationTechnician, StringComparison.OrdinalIgnoreCase)
            || string.Equals(formType, FormNodeTypes.InspectorProficiency, StringComparison.OrdinalIgnoreCase)
            || string.Equals(formType, FormNodeTypes.CompetencyAssessment, StringComparison.OrdinalIgnoreCase);

        // =================================================================================
        // AMENDED v16 - AUTO-SKIP EVALUATION (MNT-1229B and every conditional catalog step)
        // =================================================================================

        /// <summary>
        /// Flattens FormSubmission.FormDataJson into the camelCase key -> raw string map the
        /// catalog's ShouldAutoSkip expects. A malformed or empty payload yields an empty map,
        /// which means "no skip evidence" - conditional steps stay active rather than vanish.
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

        /// <summary>
        /// Walks the approval chain from <paramref name="fromStepNo"/> forward, freezing every
        /// auto-skippable step (IsSkipped + skip reason) and returning the first step that
        /// still needs a human. Null means the rest of the chain auto-closed.
        /// </summary>
        private static WorkflowStepDefinition? AdvanceToActionableStep(
            string? formType, FormWorkflowInstance instance,
            IReadOnlyDictionary<string, string?> fields, int fromStepNo)
        {
            foreach (var def in FormWorkflowCatalog.ApprovalStepsFor(formType))
            {
                if (def.StepNo < fromStepNo) continue;
                if (FormWorkflowCatalog.ShouldAutoSkip(def, fields))
                {
                    MarkStepSkipped(instance, def);
                    continue;
                }
                return def;
            }
            return null;
        }

        private static void MarkStepSkipped(FormWorkflowInstance instance, WorkflowStepDefinition def)
        {
            var step = instance.Steps.FirstOrDefault(s => s.StepNo == def.StepNo);
            if (step is null || step.State == WorkflowStepState.Completed) return;
            step.State = WorkflowStepState.Skipped;
            step.ActionTaken = WorkflowStepAction.Skipped;
            step.IsSkipped = true;
            step.SkippedAutomatically = true;
            step.SkipReason = string.IsNullOrWhiteSpace(def.SkipReasonTemplate)
                ? "Auto-skipped from the form fields."
                : def.SkipReasonTemplate;
            step.ActedAt = DateTime.UtcNow;
        }

        private async Task MarkStepAsync(
            FormSubmission form, User actor, WorkflowStepState state,
            WorkflowStepAction action, string comments, CancellationToken cancellationToken)
        {
            var instance = await _context.WorkflowInstances
                .Include(i => i.Steps)
                .FirstOrDefaultAsync(i => i.FormSubmissionId == form.Id, cancellationToken);
            if (instance is null) return;

            var step = instance.Steps.FirstOrDefault(s => s.StepNo == instance.CurrentStepNo);
            if (step is null || step.State == WorkflowStepState.Completed) return;

            step.State = state;
            step.ActionTaken = action;
            step.ActedByUserId = actor.Id;
            step.ActedByName = actor.FullName;
            step.ActedByRole = RoleHierarchy.Normalize(actor.Role) ?? actor.Role;
            step.ActedAt = DateTime.UtcNow;
            step.Comments = comments ?? string.Empty;

            // AMENDED v16 (MNT-1229B): reject / return move the record back to the
            // originator, so the instance must mirror the live status and drop the
            // approver assignment. Without this the read path kept showing the stale
            // "Pending Manager approval" badge after a rejection (the reported defect).
            instance.Status = form.ApprovalStatus;
            instance.CurrentAssigneeUserId = null;
            instance.CurrentAssignmentUnit = null;
            instance.UpdatedAt = DateTime.UtcNow;
            instance.UpdatedBy = actor.Username;
        }

        private async Task<User?> ResolveApproverAsync(
            FormSubmission form, string[] canonicalRoles, long originatorUserId,
            CancellationToken cancellationToken)
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
                .ToListAsync(cancellationToken);

            if (candidates.Count == 0) return null;

            return candidates
                .OrderBy(u => form.ShopId.HasValue && u.ShopId == form.ShopId ? 0 : 1)
                .ThenBy(u => RoleHierarchy.RankOf(u.Role))
                .ThenBy(u => u.Id)
                .FirstOrDefault();
        }

        private async Task FinaliseAsync(
            FormSubmission form, User actor, int stepNo, CancellationToken cancellationToken)
        {
            var signedAt = DateTime.UtcNow;

            form.ApprovalStatus = ApprovalStatus.Approved;
            form.ApprovedByUserId = actor.Id;
            form.ApprovedDate = signedAt;
            form.CurrentApproverUserId = null;
            form.DelegatedToUserId = null;

            form.UploadLock = UploadLockState.LockedByCompletion;
            form.UploadLockedAt = signedAt;
            form.UploadLockedByUserId = actor.Id;
            form.ApprovalSignatureHash = ComputeTamperHash(form.Id, stepNo, actor.Id, signedAt);

            var instance = await _context.WorkflowInstances
                .Include(i => i.Steps)
                .FirstOrDefaultAsync(i => i.FormSubmissionId == form.Id, cancellationToken);
            if (instance is not null)
            {
                instance.Status = ApprovalStatus.Approved;
                instance.IsComplete = true;
                instance.IsLocked = true;
                instance.CompletedAt = signedAt;
                instance.CurrentAssigneeUserId = null;
                instance.CurrentAssignmentUnit = null;
                instance.UpdatedAt = signedAt;
                instance.UpdatedBy = actor.Username;

                var lastExecuted = instance.Steps
                    .Where(s => s.State == WorkflowStepState.Completed)
                    .OrderByDescending(s => s.StepNo)
                    .FirstOrDefault();
                if (lastExecuted is not null && string.IsNullOrWhiteSpace(lastExecuted.SignatureHash))
                    lastExecuted.SignatureHash = form.ApprovalSignatureHash;
            }

            await ArchiveCompletedDeletionRequestAsync(form, actor, cancellationToken);
        }

        private async Task ArchiveCompletedDeletionRequestAsync(
            FormSubmission form,
            User actor,
            CancellationToken cancellationToken)
        {
            if (form.FormType != FormNodeTypes.Form918FAA
                && form.FormType != FormNodeTypes.Form918ACAA)
                return;

            if (!IsDeletionRequested(form.FormDataJson)) return;

            var existing = await _context.ArchiveEntries
                .AnyAsync(a => a.ItemKind == ArchivedItemKind.Form
                    && a.ItemId == form.Id
                    && a.State == ArchiveEntryState.Archived, cancellationToken);
            if (existing) return;

            var ata = await _context.ATARecords
                .Include(r => r.Shop)
                .FirstOrDefaultAsync(r => r.Id == form.ATARecordId, cancellationToken);
            if (ata is null) return;

            var now = DateTime.UtcNow;
            var entry = new ArchiveEntry
            {
                Id = Guid.NewGuid(),
                ItemKind = ArchivedItemKind.Form,
                ItemId = form.Id,
                ATARecordId = form.ATARecordId,
                ItemTitle = form.FormType == FormNodeTypes.Form918FAA
                    ? "FAA Form 918"
                    : "CAA Form 918A",
                ItemReference = form.FormNo,
                SectionCode = form.FormType,
                FormType = form.FormType,
                ATAChapterCode = ata.ATAChapterCode,
                ShopId = ata.ShopId,
                ShopName = ata.Shop?.Name ?? string.Empty,
                StatusBeforeArchive = ApprovalStatus.Approved,
                StatusBeforeArchiveLabel = ApprovalStatusInfo.Label(ApprovalStatus.Approved),
                RevisionNumberBeforeArchive = form.RevisionNumber,
                WasApprovedBeforeArchive = true,
                Trigger = ArchiveTrigger.Deleted,
                ArchivedByUserId = actor.Id,
                ArchivedByName = actor.FullName,
                ArchivedByRole = RoleHierarchy.Normalize(actor.Role) ?? actor.Role,
                ArchivedAt = now,
                Reason = "Deletion requested on the approved form.",
                State = ArchiveEntryState.Archived,
                CreatedAt = now,
                UpdatedAt = now
            };

            form.IsActive = false;
            form.ApprovalStatus = ApprovalStatus.Revoked;
            form.UpdatedAt = now;
            form.UpdatedBy = actor.FullName;
            form.CurrentApproverUserId = null;
            _context.ArchiveEntries.Add(entry);
        }

        private static bool IsDeletionRequested(string formDataJson)
        {
            try
            {
                var root = JsonNode.Parse(formDataJson) as JsonObject;
                return root?["deletion"]?.GetValue<bool>() == true;
            }
            catch (JsonException)
            {
                return false;
            }
        }

        private static string ComputeTamperHash(Guid formId, int stepNo, long userId, DateTime signedAtUtc)
        {
            var payload = formId.ToString("N") + "|" + stepNo + "|" + userId + "|" + signedAtUtc.ToString("O");
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(payload));
            return Convert.ToHexString(bytes).ToLowerInvariant();
        }

        private static WorkflowAuditLog NewAudit(
            string action, WorkflowAction workflowAction, Guid entityId,
            string performedBy, string userRole, string details,
            string previousValues = "", string newValues = "")
        {
            return new WorkflowAuditLog
            {
                Id = Guid.NewGuid(),
                Action = action,
                WorkflowAction = workflowAction,
                EntityType = "FormSubmission",
                EntityId = entityId,
                PerformedBy = performedBy,
                UserRole = userRole,
                Details = details,
                PreviousValues = previousValues,
                NewValues = newValues,
                Timestamp = DateTime.UtcNow
            };
        }

        private static WorkflowAuditLog NewAudit(
            string action, WorkflowAction workflowAction, Guid entityId,
            string performedBy, string details)
        {
            return NewAudit(
                action, workflowAction, entityId, performedBy, "", details);
        }
    }
}
