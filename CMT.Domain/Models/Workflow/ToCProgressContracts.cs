using System;
using System.Collections.Generic;
using System.Linq;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.Workflow
{
    // =====================================================================================
    // AMENDED v14 - FEATURE 2: PROGRESS TRACKING & APPROVAL STATUS INDICATORS
    //
    // REQUIREMENT, VERBATIM
    //   "Under Table of Contents, existing form sections, make a Progress Tracking &
    //    Approval Status Indicators ... Include a clear status badge for each form
    //    indicating its state (e.g. Pending, Approved, Revoked). Display a visual progress
    //    bar showing the overall completion percentage. Add text indicating the number of
    //    remaining approvals required. Ensure a clean, corporate UI that allows users to
    //    easily pinpoint which role is causing an approval hold-up."
    //
    // WHY THIS IS A DOMAIN FILE AND NOT A UI FILE
    // -------------------------------------------
    // "Which role is causing the hold-up" is not a styling question. Answering it requires
    // the step table, the eligible roles of the CURRENT step, and the delegated-review state
    // added in v12. If the frontend computed it, it would have to re-implement
    // FormWorkflowCatalog, and the badge in the ToC would drift from the status the engine
    // actually enforces. So the numbers and the blocking role are computed here, once, and
    // the UI only renders them.
    //
    // DELIBERATE REUSE - NOTHING NEW IS INVENTED
    //   - the badge bucket is ApprovalStatusInfo.StateOf(...)   (Draft/Pending/Approved/...)
    //   - the badge text  is ApprovalStatusInfo.Label(...)
    //   - "counts as done" is ApprovalStatusInfo.CountsAsComplete(...) - so a SKIPPED form
    //     counts as complete, which is correct: a skipped step is a closed step, and
    //     treating it as outstanding would make every folder with an optional form look
    //     permanently unfinished.
    //   - ApprovalStatus.Revoked (32) already exists, so the "Revoked" badge named by the
    //     requirement needs no new status.
    //
    // ONE JUDGEMENT CALL, STATED EXPLICITLY
    //   The requirement asks for "the number of remaining approvals required". That is
    //   counted in STEPS, not forms: a form sitting at step 1 of 4 has three approvals left,
    //   and reporting "1 form remaining" would hide the real bottleneck. Both numbers are
    //   therefore exposed - RemainingApprovalSteps and RemainingForms - because the sidebar
    //   needs the first and the section header needs the second.
    // =====================================================================================

    /// <summary>
    /// Visual tone of a status badge. Maps 1:1 to a corporate palette in the UI, so the
    /// frontend never switches on raw <see cref="ApprovalStatus"/> values again.
    /// </summary>
    public enum StatusBadgeTone
    {
        /// <summary>Draft / not started - grey.</summary>
        Neutral = 0,

        /// <summary>In flight, waiting on somebody - amber.</summary>
        InProgress = 1,

        /// <summary>Approved / completed / locked - green.</summary>
        Success = 2,

        /// <summary>Skipped - muted blue; closed but not approved.</summary>
        Muted = 3,

        /// <summary>Rejected / returned / revoked - red; the originator must act.</summary>
        Danger = 4,

        /// <summary>Expired - orange; time-based failure, distinct from a rejection.</summary>
        Expired = 5
    }

    /// <summary>
    /// A rendered status badge for one form. Produced by <see cref="ToCProgressCalculator"/>.
    /// </summary>
    public sealed class StatusBadge
    {
        /// <summary>Raw status, kept so the client can still act on it.</summary>
        public ApprovalStatus Status { get; init; }

        /// <summary>Bucket the ToC groups by.</summary>
        public FormLifecycleState State { get; init; }

        /// <summary>Long label, e.g. "Pending Director approval".</summary>
        public string Label { get; init; } = string.Empty;

        /// <summary>
        /// Short label for a narrow badge, e.g. "Pending" / "Approved" / "Revoked" -
        /// exactly the three examples the requirement gives.
        /// </summary>
        public string ShortLabel { get; init; } = string.Empty;

        public StatusBadgeTone Tone { get; init; }

        /// <summary>True when this form still needs somebody to act.</summary>
        public bool IsOutstanding { get; init; }
    }

    /// <summary>
    /// Who is holding a form up. This is the answer to "easily pinpoint which role is
    /// causing an approval hold-up".
    /// </summary>
    public sealed class ApprovalBottleneck
    {
        /// <summary>Step number currently pending. -1 when nothing is pending.</summary>
        public int StepNo { get; init; } = -1;

        /// <summary>Title of the pending step, straight from the catalog.</summary>
        public string StepTitle { get; init; } = string.Empty;

        /// <summary>Canonical OrgRoles values that can clear the step.</summary>
        public string[] BlockingRoles { get; init; } = Array.Empty<string>();

        /// <summary>Printed roles, e.g. "Director" or "QA Personnel, ECAA Personnel".</summary>
        public string BlockingRolesLabel { get; init; } = string.Empty;

        /// <summary>
        /// Named individual when the step was assigned or delegated to one person. Null when
        /// the step sits with a whole role or a functional-unit queue.
        /// </summary>
        public long? BlockingUserId { get; init; }

        public string BlockingUserName { get; init; } = string.Empty;

        /// <summary>
        /// True when the hold-up is a v12 delegated review, i.e. the approver has borrowed a
        /// reviewer and the record is in ApprovalStatus.PendingDelegatedReview. Worth
        /// flagging separately: the fix is to chase the REVIEWER, not the approver.
        /// </summary>
        public bool IsDelegatedReview { get; init; }

        /// <summary>Days the step has been pending; drives the "overdue" highlight.</summary>
        public int DaysWaiting { get; init; }

        /// <summary>True when nothing is blocked (form is closed).</summary>
        public bool IsClear => StepNo < 0;
    }

    /// <summary>
    /// Input row for the calculator: one catalogued form of a folder, flattened by the read
    /// path. Deliberately a plain DTO so the calculator stays testable without EF.
    /// </summary>
    public sealed class FormProgressInput
    {
        public Guid? FormWorkflowInstanceId { get; init; }

        public string FormType { get; init; } = string.Empty;

        /// <summary>Printed form number, e.g. "MNT-918".</summary>
        public string FormNo { get; init; } = string.Empty;

        public string Title { get; init; } = string.Empty;

        /// <summary>ToCSections code the form belongs to.</summary>
        public string SectionCode { get; init; } = string.Empty;

        public int OrderInSection { get; init; }

        public ApprovalStatus Status { get; init; } = ApprovalStatus.Draft;

        /// <summary>
        /// Total APPROVAL-BEARING steps of the chain, excluding the drafting step 0.
        /// Zero for an auto-generated form (Rev. Status / Task Card), which is why such a
        /// form never contributes outstanding approvals.
        /// </summary>
        public int TotalApprovalSteps { get; init; }

        /// <summary>How many of those steps are already signed or skipped.</summary>
        public int CompletedApprovalSteps { get; init; }

        /// <summary>Step currently pending, or -1 when none.</summary>
        public int CurrentStepNo { get; init; } = -1;

        public string CurrentStepTitle { get; init; } = string.Empty;

        public string[] CurrentStepEligibleRoles { get; init; } = Array.Empty<string>();

        public long? CurrentAssigneeUserId { get; init; }

        public string CurrentAssigneeName { get; init; } = string.Empty;

        /// <summary>When the current step started waiting.</summary>
        public DateTime? CurrentStepPendingSince { get; init; }

        /// <summary>True for MNT-1420 / MNT-1420C, which close on submission.</summary>
        public bool IsAutoGenerated { get; init; }

        /// <summary>True when the form is mandatory for folder release.</summary>
        public bool IsMandatory { get; init; } = true;
    }

    /// <summary>Progress of a single form, ready to render.</summary>
    public sealed class FormProgressView
    {
        public Guid? FormWorkflowInstanceId { get; init; }
        public string FormType { get; init; } = string.Empty;
        public string FormNo { get; init; } = string.Empty;
        public string Title { get; init; } = string.Empty;
        public string SectionCode { get; init; } = string.Empty;
        public int OrderInSection { get; init; }

        public StatusBadge Badge { get; init; } = new();
        public ApprovalBottleneck Bottleneck { get; init; } = new();

        public int TotalApprovalSteps { get; init; }
        public int CompletedApprovalSteps { get; init; }

        /// <summary>Approvals still required on THIS form.</summary>
        public int RemainingApprovalSteps { get; init; }

        /// <summary>0-100, rounded. 100 for a closed form even when it has no steps.</summary>
        public int CompletionPercent { get; init; }

        public bool IsComplete { get; init; }
        public bool IsMandatory { get; init; }
        public bool IsAutoGenerated { get; init; }

        /// <summary>
        /// "2 of 4 approvals complete - 2 remaining" / "Closed on submission (auto-generated)".
        /// Pre-built so every screen and the PDF export word it identically.
        /// </summary>
        public string RemainingApprovalsText { get; init; } = string.Empty;
    }

    /// <summary>Roll-up for one Table Of Contents section.</summary>
    public sealed class SectionProgressView
    {
        public string SectionCode { get; init; } = string.Empty;
        public string SectionTitle { get; init; } = string.Empty;
        public int SectionOrder { get; init; }

        public int TotalForms { get; init; }
        public int CompletedForms { get; init; }
        public int RemainingForms { get; init; }

        public int TotalApprovalSteps { get; init; }
        public int CompletedApprovalSteps { get; init; }
        public int RemainingApprovalSteps { get; init; }

        public int CompletionPercent { get; init; }

        /// <summary>Worst badge in the section, so a collapsed row still shows the problem.</summary>
        public StatusBadgeTone WorstTone { get; init; }

        /// <summary>Distinct roles blocking anything in this section, most frequent first.</summary>
        public string[] BlockingRoles { get; init; } = Array.Empty<string>();

        public string BlockingRolesLabel { get; init; } = string.Empty;

        public string RemainingApprovalsText { get; init; } = string.Empty;

        public FormProgressView[] Forms { get; init; } = Array.Empty<FormProgressView>();
    }

    /// <summary>Roll-up for a whole ATA chapter / evaluation folder.</summary>
    public sealed class FolderProgressView
    {
        public Guid? EvaluationFolderId { get; init; }
        public Guid? ATARecordId { get; init; }
        public string ATAChapterCode { get; init; } = string.Empty;

        public int TotalForms { get; init; }
        public int CompletedForms { get; init; }
        public int RemainingForms { get; init; }

        public int TotalApprovalSteps { get; init; }
        public int CompletedApprovalSteps { get; init; }
        public int RemainingApprovalSteps { get; init; }

        /// <summary>The single number the top progress bar renders.</summary>
        public int CompletionPercent { get; init; }

        public StatusBadgeTone WorstTone { get; init; }

        /// <summary>
        /// The role blocking the MOST forms - the headline answer to "who is holding this
        /// up". Empty when nothing is outstanding.
        /// </summary>
        public string PrimaryBlockingRole { get; init; } = string.Empty;

        public string PrimaryBlockingRoleLabel { get; init; } = string.Empty;

        /// <summary>How many forms that role is blocking.</summary>
        public int PrimaryBlockingRoleFormCount { get; init; }

        /// <summary>Longest wait anywhere in the folder, in days.</summary>
        public int LongestWaitDays { get; init; }

        public string RemainingApprovalsText { get; init; } = string.Empty;

        public SectionProgressView[] Sections { get; init; } = Array.Empty<SectionProgressView>();
    }

    /// <summary>
    /// Pure calculator. No EF, no HTTP: give it flattened rows, get the whole ToC progress
    /// tree back. Every percentage in the product comes from here.
    /// </summary>
    public static class ToCProgressCalculator
    {
        /// <summary>
        /// Printed role labels. Declared locally on purpose: this file must not depend on
        /// the exact identifier of the display-name dictionary in RoleHierarchy, and a
        /// missing key here degrades to the raw role name rather than throwing.
        /// </summary>
        private static readonly Dictionary<string, string> RoleLabels = new(StringComparer.OrdinalIgnoreCase)
        {
            [OrgRoles.Admin] = "Admin",
            [OrgRoles.Director] = "Director",
            [OrgRoles.SpecialTeamLeader] = "Special Team Leader",
            [OrgRoles.Manager] = "Manager",
            [OrgRoles.ShopManager] = "Shop Manager",
            [OrgRoles.TeamLeader] = "Shop Team Leader",
            [OrgRoles.Engineer] = "Engineer",
            [OrgRoles.Technician] = "Technician",
            [OrgRoles.CertifyingStaff] = "Certifying Staff",
            [OrgRoles.QAPersonnel] = "QA Manager",
            [OrgRoles.ECAAPersonnel] = "ECAA",
            [OrgRoles.DocumentationTeamLeader] = "Documentation Team Leader",
            [OrgRoles.DocumentationClerk] = "Documentation Clerk",
            [OrgRoles.HRSpecialist] = "HR Specialist",
            [OrgRoles.HRManager] = "HR Manager",
            [OrgRoles.Inspector] = "Inspector"
        };

        /// <summary>Printed label of a canonical role, falling back to the raw value.</summary>
        public static string RoleLabel(string? role)
        {
            if (string.IsNullOrWhiteSpace(role))
            {
                return string.Empty;
            }

            return RoleLabels.TryGetValue(role, out var label) ? label : role;
        }

        /// <summary>Joined printed labels, e.g. "QA Manager, ECAA".</summary>
        public static string RoleLabels_Join(IEnumerable<string>? roles)
        {
            if (roles is null)
            {
                return string.Empty;
            }

            var labels = roles
                .Where(r => !string.IsNullOrWhiteSpace(r))
                .Select(RoleLabel)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();

            return string.Join(", ", labels);
        }

        /// <summary>Tone for a lifecycle bucket, with Revoked separated from Rejected.</summary>
        public static StatusBadgeTone ToneOf(ApprovalStatus status)
        {
            if (status == ApprovalStatus.Revoked)
            {
                return StatusBadgeTone.Danger;
            }

            return ApprovalStatusInfo.StateOf(status) switch
            {
                FormLifecycleState.Draft => StatusBadgeTone.Neutral,
                FormLifecycleState.Pending => StatusBadgeTone.InProgress,
                FormLifecycleState.Approved => StatusBadgeTone.Success,
                FormLifecycleState.Skipped => StatusBadgeTone.Muted,
                FormLifecycleState.Expired => StatusBadgeTone.Expired,
                FormLifecycleState.ActionRequired => StatusBadgeTone.Danger,
                _ => StatusBadgeTone.Neutral
            };
        }

        /// <summary>
        /// Short badge text. Uses the requirement's own vocabulary: Pending / Approved /
        /// Revoked, plus the buckets the engine already has.
        /// </summary>
        public static string ShortLabelOf(ApprovalStatus status) => status switch
        {
            ApprovalStatus.Draft => "Draft",
            ApprovalStatus.Approved => "Approved",
            ApprovalStatus.Completed => "Approved",
            ApprovalStatus.Locked => "Approved",
            ApprovalStatus.Rejected => "Rejected",
            ApprovalStatus.Returned => "Returned",
            ApprovalStatus.Revoked => "Revoked",
            ApprovalStatus.Skipped => "Skipped",
            ApprovalStatus.Expired => "Expired",
            ApprovalStatus.PendingDelegatedReview => "In review",
            _ => "Pending"
        };

        /// <summary>Build the badge for one status.</summary>
        public static StatusBadge BuildBadge(ApprovalStatus status) => new()
        {
            Status = status,
            State = ApprovalStatusInfo.StateOf(status),
            Label = ApprovalStatusInfo.Label(status),
            ShortLabel = ShortLabelOf(status),
            Tone = ToneOf(status),
            IsOutstanding = !ApprovalStatusInfo.CountsAsComplete(status)
        };

        private static int Percent(int completed, int total)
        {
            if (total <= 0)
            {
                return completed > 0 ? 100 : 0;
            }

            var raw = (double)completed / total * 100d;
            var rounded = (int)Math.Round(raw, MidpointRounding.AwayFromZero);
            return Math.Clamp(rounded, 0, 100);
        }

        private static int DaysSince(DateTime? since, DateTime utcNow) =>
            since.HasValue ? (int)Math.Max(0, (utcNow - since.Value).TotalDays) : 0;

        /// <summary>Progress of a single form.</summary>
        public static FormProgressView BuildForm(FormProgressInput input, DateTime utcNow)
        {
            if (input is null)
            {
                throw new ArgumentNullException(nameof(input));
            }

            var isComplete = ApprovalStatusInfo.CountsAsComplete(input.Status);

            var total = Math.Max(0, input.TotalApprovalSteps);
            var done = Math.Clamp(input.CompletedApprovalSteps, 0, total);

            // A closed form has no outstanding approvals, whatever the counters say: this
            // keeps an auto-generated form (0 steps, Approved) from reporting "-1 remaining".
            var remaining = isComplete ? 0 : Math.Max(0, total - done);

            var percent = isComplete ? 100 : Percent(done, total);

            var bottleneck = isComplete || input.CurrentStepNo < 0
                ? new ApprovalBottleneck()
                : new ApprovalBottleneck
                {
                    StepNo = input.CurrentStepNo,
                    StepTitle = input.CurrentStepTitle,
                    BlockingRoles = input.CurrentStepEligibleRoles ?? Array.Empty<string>(),
                    BlockingRolesLabel = RoleLabels_Join(input.CurrentStepEligibleRoles),
                    BlockingUserId = input.CurrentAssigneeUserId,
                    BlockingUserName = input.CurrentAssigneeName,
                    IsDelegatedReview = input.Status == ApprovalStatus.PendingDelegatedReview,
                    DaysWaiting = DaysSince(input.CurrentStepPendingSince, utcNow)
                };

            string text;
            if (input.IsAutoGenerated)
            {
                text = "Closed on submission (auto-generated: no approval required).";
            }
            else if (isComplete)
            {
                text = "No approvals remaining.";
            }
            else if (total <= 0)
            {
                text = "Awaiting submission.";
            }
            else
            {
                text = $"{done} of {total} approvals complete - {remaining} remaining.";
            }

            return new FormProgressView
            {
                FormWorkflowInstanceId = input.FormWorkflowInstanceId,
                FormType = input.FormType,
                FormNo = input.FormNo,
                Title = input.Title,
                SectionCode = input.SectionCode,
                OrderInSection = input.OrderInSection,
                Badge = BuildBadge(input.Status),
                Bottleneck = bottleneck,
                TotalApprovalSteps = total,
                CompletedApprovalSteps = done,
                RemainingApprovalSteps = remaining,
                CompletionPercent = percent,
                IsComplete = isComplete,
                IsMandatory = input.IsMandatory,
                IsAutoGenerated = input.IsAutoGenerated,
                RemainingApprovalsText = text
            };
        }

        /// <summary>Worst tone in a set, using the severity order Danger > Expired > InProgress > Neutral > Muted > Success.</summary>
        private static StatusBadgeTone WorstOf(IEnumerable<StatusBadgeTone> tones)
        {
            var severity = new Dictionary<StatusBadgeTone, int>
            {
                [StatusBadgeTone.Danger] = 6,
                [StatusBadgeTone.Expired] = 5,
                [StatusBadgeTone.InProgress] = 4,
                [StatusBadgeTone.Neutral] = 3,
                [StatusBadgeTone.Muted] = 2,
                [StatusBadgeTone.Success] = 1
            };

            var worst = StatusBadgeTone.Success;
            var worstRank = 0;

            foreach (var tone in tones)
            {
                var rank = severity.TryGetValue(tone, out var r) ? r : 0;
                if (rank > worstRank)
                {
                    worstRank = rank;
                    worst = tone;
                }
            }

            return worst;
        }

        /// <summary>Roll up one section from its already-built form views.</summary>
        public static SectionProgressView BuildSection(
            string sectionCode,
            IReadOnlyCollection<FormProgressView> forms)
        {
            var list = (forms ?? Array.Empty<FormProgressView>())
                .OrderBy(f => f.OrderInSection)
                .ThenBy(f => f.FormNo, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            var totalSteps = list.Sum(f => f.TotalApprovalSteps);
            var doneSteps = list.Sum(f => f.CompletedApprovalSteps);
            var remainingSteps = list.Sum(f => f.RemainingApprovalSteps);

            var completedForms = list.Count(f => f.IsComplete);
            var remainingForms = list.Length - completedForms;

            var blocking = list
                .Where(f => !f.Bottleneck.IsClear)
                .SelectMany(f => f.Bottleneck.BlockingRoles)
                .Where(r => !string.IsNullOrWhiteSpace(r))
                .GroupBy(r => r, StringComparer.OrdinalIgnoreCase)
                .OrderByDescending(g => g.Count())
                .ThenBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
                .Select(g => g.Key)
                .ToArray();

            var text = remainingForms == 0
                ? "Section complete."
                : $"{remainingForms} of {list.Length} forms outstanding - "
                  + $"{remainingSteps} approvals remaining.";

            return new SectionProgressView
            {
                SectionCode = sectionCode,
                SectionTitle = ToCSections.TitleOf(sectionCode),
                SectionOrder = ToCSections.OrderOf(sectionCode),
                TotalForms = list.Length,
                CompletedForms = completedForms,
                RemainingForms = remainingForms,
                TotalApprovalSteps = totalSteps,
                CompletedApprovalSteps = doneSteps,
                RemainingApprovalSteps = remainingSteps,
                CompletionPercent = Percent(doneSteps, totalSteps),
                WorstTone = WorstOf(list.Select(f => f.Badge.Tone)),
                BlockingRoles = blocking,
                BlockingRolesLabel = RoleLabels_Join(blocking),
                RemainingApprovalsText = text,
                Forms = list
            };
        }

        /// <summary>
        /// Build the whole ToC progress tree. This is the single entry point the read path
        /// should call.
        /// </summary>
        public static FolderProgressView BuildFolder(
            IEnumerable<FormProgressInput> inputs,
            DateTime utcNow,
            Guid? evaluationFolderId = null,
            Guid? ataRecordId = null,
            string ataChapterCode = "")
        {
            var forms = (inputs ?? Enumerable.Empty<FormProgressInput>())
                .Select(i => BuildForm(i, utcNow))
                .ToArray();

            var sections = forms
                .GroupBy(f => f.SectionCode ?? string.Empty, StringComparer.OrdinalIgnoreCase)
                .Select(g => BuildSection(g.Key, g.ToArray()))
                .OrderBy(s => s.SectionOrder)
                .ThenBy(s => s.SectionCode, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            var totalSteps = forms.Sum(f => f.TotalApprovalSteps);
            var doneSteps = forms.Sum(f => f.CompletedApprovalSteps);
            var remainingSteps = forms.Sum(f => f.RemainingApprovalSteps);

            var completedForms = forms.Count(f => f.IsComplete);
            var remainingForms = forms.Length - completedForms;

            // Headline bottleneck: the role blocking the greatest number of forms.
            var primary = forms
                .Where(f => !f.Bottleneck.IsClear)
                .SelectMany(f => f.Bottleneck.BlockingRoles.Select(r => new { f.FormNo, Role = r }))
                .Where(x => !string.IsNullOrWhiteSpace(x.Role))
                .GroupBy(x => x.Role, StringComparer.OrdinalIgnoreCase)
                .OrderByDescending(g => g.Count())
                .ThenBy(g => g.Key, StringComparer.OrdinalIgnoreCase)
                .FirstOrDefault();

            var longestWait = forms
                .Where(f => !f.Bottleneck.IsClear)
                .Select(f => f.Bottleneck.DaysWaiting)
                .DefaultIfEmpty(0)
                .Max();

            var text = remainingForms == 0
                ? "All forms approved - the folder is ready for final sign-off."
                : $"{remainingSteps} approvals remaining across {remainingForms} forms."
                  + (primary is null
                      ? string.Empty
                      : $" Currently held by {RoleLabel(primary.Key)}.");

            return new FolderProgressView
            {
                EvaluationFolderId = evaluationFolderId,
                ATARecordId = ataRecordId,
                ATAChapterCode = ataChapterCode,
                TotalForms = forms.Length,
                CompletedForms = completedForms,
                RemainingForms = remainingForms,
                TotalApprovalSteps = totalSteps,
                CompletedApprovalSteps = doneSteps,
                RemainingApprovalSteps = remainingSteps,
                CompletionPercent = Percent(doneSteps, totalSteps),
                WorstTone = WorstOf(forms.Select(f => f.Badge.Tone)),
                PrimaryBlockingRole = primary?.Key ?? string.Empty,
                PrimaryBlockingRoleLabel = primary is null ? string.Empty : RoleLabel(primary.Key),
                PrimaryBlockingRoleFormCount = primary?.Count() ?? 0,
                LongestWaitDays = longestWait,
                RemainingApprovalsText = text,
                Sections = sections
            };
        }
    }
}