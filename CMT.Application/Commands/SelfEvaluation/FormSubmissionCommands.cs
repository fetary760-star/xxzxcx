using System;
using MediatR;
using CMT.Domain.Models.Shared;

namespace CMT.Application.SelfEvaluation.Commands.SelfEvaluation
{
    /// <summary>
    /// Create a new form submission (child form within an ATA Record).
    /// </summary>
    public class CreateFormSubmissionCommand : IRequest<Guid>
    {
        public Guid ATARecordId { get; set; }
        public string FormType { get; set; } = string.Empty;
        public string FormNo { get; set; } = string.Empty;
        public string RevNo { get; set; } = string.Empty;
        public DateTime? RevDate { get; set; }
        public string FormDataJson { get; set; } = "{}";
        public string CreatedBy { get; set; } = string.Empty;

        // AMENDED v13: numeric id of the acting user (User.Id).
        public long ActorUserId { get; set; }
    }

    /// <summary>
    /// Update an existing form submission's data.
    /// </summary>
    public class UpdateFormSubmissionCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string FormNo { get; set; } = string.Empty;
        public string RevNo { get; set; } = string.Empty;
        public DateTime? RevDate { get; set; }
        public string FormDataJson { get; set; } = "{}";
        public string UpdatedBy { get; set; } = string.Empty;

        // AMENDED v13: numeric id of the acting user (User.Id).
        public long ActorUserId { get; set; }
    }

    /// <summary>
    /// Delete (soft-delete) a form submission.
    /// </summary>
    public class DeleteFormSubmissionCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public long ActorUserId { get; set; }
    }

    /// <summary>
    /// Submit a form for approval workflow.
    /// AMENDED v13: routed through FormWorkflowCatalog (per-form chain), no longer a
    /// hard-coded TeamLeader -> Manager -> Director -> QA progression.
    /// </summary>
    public class SubmitFormForApprovalCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string SubmittedBy { get; set; } = string.Empty;

        // AMENDED v13: numeric id of the acting user (User.Id). Authorization is
        // evaluated against this value, never against the display name.
        public long ActorUserId { get; set; }
    }

    /// <summary>
    /// Approve a form submission at the current step.
    /// AMENDED v13: only the CURRENT assigned approver, an active delegate or an Admin
    /// may execute; the next step comes from the catalog, and signature-bearing steps
    /// are frozen through IUserSignatureService.StampAsync.
    /// </summary>
    public class ApproveFormSubmissionCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string ApprovedBy { get; set; } = string.Empty;
        public string Comments { get; set; } = string.Empty;
        public long ActorUserId { get; set; }
    }

    /// <summary>
    /// Reject a form submission.
    /// </summary>
    public class RejectFormSubmissionCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string RejectedBy { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;
        public long ActorUserId { get; set; }
    }

    /// <summary>
    /// Delegate a form to another user for review/completion.
    /// AMENDED v13: the delegate becomes an ACTOR the approve/reject/return handlers
    /// accept (active delegate), and the delegation is auditable.
    /// </summary>
    public class DelegateFormSubmissionCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public long? DelegateToUserId { get; set; }

        public string DelegatedBy { get; set; } = string.Empty;
        public string Reason { get; set; } = string.Empty;
        public long ActorUserId { get; set; }
    }

    /// <summary>
    /// Return a form for revision (back to the submitter).
    /// </summary>
    public class ReturnFormForRevisionCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public string ReturnedBy { get; set; } = string.Empty;
        public string Comments { get; set; } = string.Empty;
        public long ActorUserId { get; set; }
    }

    /// <summary>Assigns the active workflow step to an eligible user.</summary>
    public class AssignFormSubmissionCommand : IRequest<bool>
    {
        public Guid Id { get; set; }
        public int? StepNo { get; set; }
        public long AssignToUserId { get; set; }
        public string Comments { get; set; } = string.Empty;
        public long ActorUserId { get; set; }
    }

    public class IncludeApprovedTrainingFormCommand : IRequest<Guid>
    {
        public Guid SourceFormSubmissionId { get; set; }
        public Guid TargetATARecordId { get; set; }
        public long ActorUserId { get; set; }
    }
}
