using System;
using System.Collections.Generic;

namespace CMT.Application.SelfEvaluation.Contracts.Workflow
{
    public enum WorkflowStepStatus
    {
        NotStarted = 0,
        Pending = 1,
        Completed = 2,
        Skipped = 3,
        Rejected = 4
    }

    public enum FormStatusCode
    {
        Draft = 0,
        InProgress = 1,
        PendingApproval = 2,
        Approved = 3,
        Rejected = 4
    }

    public sealed class WorkflowStep
    {
        public int StepNumber { get; init; }
        public string Title { get; init; } = string.Empty;
        public string Role { get; init; } = string.Empty;
        public string RoleLabel { get; init; } = string.Empty;
        public long? ApproverUserId { get; init; }
        public string ApproverName { get; init; } = string.Empty;
        public WorkflowStepStatus Status { get; init; }
        public DateTime? CompletedAt { get; init; }
        public DateTime? PendingSince { get; init; }
        public string Comments { get; init; } = string.Empty;
    }

    public sealed class ApprovalProgress
    {
        public int CompletedSteps { get; init; }
        public int TotalSteps { get; init; }
        public int CompletionPercent { get; init; }
        public int? CurrentStepNumber { get; init; }
        public string PendingLabel { get; init; } = string.Empty;
        public string PendingRole { get; init; } = string.Empty;
        public string PendingRoleLabel { get; init; } = string.Empty;
        public long? PendingApproverUserId { get; init; }
        public string PendingApproverName { get; init; } = string.Empty;
        public IReadOnlyList<WorkflowStep> Steps { get; init; } = Array.Empty<WorkflowStep>();
    }

    public sealed class FormStatus
    {
        public string FormId { get; init; } = string.Empty;
        public string FormNumber { get; init; } = string.Empty;
        public string Title { get; init; } = string.Empty;
        public FormStatusCode Code { get; init; }
        public string Label { get; init; } = string.Empty;
        public ApprovalProgress Approval { get; init; } = new();
    }

    public sealed class TableOfContentsSectionSummary
    {
        public string SectionCode { get; init; } = string.Empty;
        public string Title { get; init; } = string.Empty;
        public int CompletionPercent { get; init; }
        public int CompletedForms { get; init; }
        public int TotalForms { get; init; }
        public IReadOnlyList<FormStatus> Forms { get; init; } = Array.Empty<FormStatus>();
    }

    public sealed class TableOfContentsSummary
    {
        public int CompletionPercent { get; init; }
        public int CompletedForms { get; init; }
        public int TotalForms { get; init; }
        public IReadOnlyList<TableOfContentsSectionSummary> Sections { get; init; } = Array.Empty<TableOfContentsSectionSummary>();
    }
}