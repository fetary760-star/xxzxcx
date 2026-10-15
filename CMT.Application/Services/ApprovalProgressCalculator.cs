using System;
using System.Collections.Generic;
using System.Linq;
using CMT.Application.SelfEvaluation.Contracts.Workflow;

namespace CMT.Application.SelfEvaluation.Services
{
    public static class ApprovalProgressCalculator
    {
        public static ApprovalProgress Calculate(IEnumerable<WorkflowStep>? steps)
        {
            var orderedSteps = (steps ?? Enumerable.Empty<WorkflowStep>())
                .OrderBy(step => step.StepNumber)
                .ToArray();
            var completedSteps = orderedSteps.Count(IsComplete);
            var totalSteps = orderedSteps.Length;
            var pendingStep = orderedSteps.FirstOrDefault(step =>
                step.Status is WorkflowStepStatus.Pending or WorkflowStepStatus.NotStarted);

            return new ApprovalProgress
            {
                CompletedSteps = completedSteps,
                TotalSteps = totalSteps,
                CompletionPercent = Percentage(completedSteps, totalSteps),
                CurrentStepNumber = pendingStep?.StepNumber,
                PendingLabel = pendingStep is null ? string.Empty : PendingLabelOf(pendingStep),
                PendingRole = pendingStep?.Role ?? string.Empty,
                PendingRoleLabel = pendingStep?.RoleLabel ?? pendingStep?.Role ?? string.Empty,
                PendingApproverUserId = pendingStep?.ApproverUserId,
                PendingApproverName = pendingStep?.ApproverName ?? string.Empty,
                Steps = orderedSteps
            };
        }

        public static FormStatus CalculateForm(
            string formId,
            string formNumber,
            string title,
            IEnumerable<WorkflowStep>? steps)
        {
            var materializedSteps = (steps ?? Enumerable.Empty<WorkflowStep>()).ToArray();
            var approval = Calculate(materializedSteps);
            var status = materializedSteps.Any(step => step.Status == WorkflowStepStatus.Rejected)
                ? FormStatusCode.Rejected
                : approval.TotalSteps == 0 || approval.CompletionPercent == 100
                    ? FormStatusCode.Approved
                    : approval.CompletedSteps == 0
                        ? FormStatusCode.Draft
                        : approval.CurrentStepNumber.HasValue
                            ? FormStatusCode.PendingApproval
                            : FormStatusCode.InProgress;

            return new FormStatus
            {
                FormId = formId,
                FormNumber = formNumber,
                Title = title,
                Code = status,
                Label = status.ToString(),
                Approval = approval
            };
        }

        public static TableOfContentsSummary CalculateTableOfContents(
            IEnumerable<(string Code, string Title, IEnumerable<FormStatus> Forms)>? sections)
        {
            var sectionSummaries = (sections ?? Enumerable.Empty<(string Code, string Title, IEnumerable<FormStatus> Forms)>())
                .Select(section =>
                {
                    var forms = (section.Forms ?? Enumerable.Empty<FormStatus>()).ToArray();
                    var completedForms = forms.Count(form => form.Code == FormStatusCode.Approved);
                    return new TableOfContentsSectionSummary
                    {
                        SectionCode = section.Code,
                        Title = section.Title,
                        CompletedForms = completedForms,
                        TotalForms = forms.Length,
                        CompletionPercent = Percentage(completedForms, forms.Length),
                        Forms = forms
                    };
                })
                .ToArray();

            var totalForms = sectionSummaries.Sum(section => section.TotalForms);
            var completedFormsTotal = sectionSummaries.Sum(section => section.CompletedForms);

            return new TableOfContentsSummary
            {
                CompletedForms = completedFormsTotal,
                TotalForms = totalForms,
                CompletionPercent = Percentage(completedFormsTotal, totalForms),
                Sections = sectionSummaries
            };
        }

        private static bool IsComplete(WorkflowStep step) =>
            step.Status is WorkflowStepStatus.Completed or WorkflowStepStatus.Skipped;

        private static string PendingLabelOf(WorkflowStep step)
        {
            var role = string.IsNullOrWhiteSpace(step.RoleLabel) ? step.Role : step.RoleLabel;
            var action = step.Status == WorkflowStepStatus.NotStarted ? "Awaiting" : "Pending";
            return string.IsNullOrWhiteSpace(role) ? $"{action} approval" : $"{action}: {role} Approval";
        }

        private static int Percentage(int completed, int total)
        {
            if (total <= 0) return 0;
            return Math.Clamp((int)Math.Round((double)completed / total * 100, MidpointRounding.AwayFromZero), 0, 100);
        }
    }
}